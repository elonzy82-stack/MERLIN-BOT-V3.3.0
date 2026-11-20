// ───────────── index.js ─────────────
// Boots the main session + paired sub-sessions, builds the command context (x),
// runs jail / ban / antilink / commands / AI auto-reply, and exposes the app API
// (download, pairStart, unpair, restart, listSessions, fixSession, getSock).
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  DisconnectReason,
  delay,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import * as C from './config.js';
import { data, save } from './store.js';
import { setApp, stats, runCommand, registry } from './core.js';
import { askAI } from './ai.js';
import { digits, unwrap, textOf, ctxInfo } from './util.js';
import './cmds-core.js';
import './cmds-media.js';
import { rescheduleReminders } from './cmds-tools.js';
import { antilinkCheck, onGroupEvent } from './cmds-admin.js';
import { jailCheck } from './cmds-jail.js';

const logger = pino({ level: 'silent' });
const SESSION_DIR = './session'; // main session (unchanged)
const SUB_DIR = './sessions'; // paired sub-sessions: ./sessions/<number>
const MAIN_ID = digits(C.PAIR_NUMBER);
const sessions = new Map(); // id -> { id, main, dir, sock, connected, closing, store }

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('Uncaught exception:', e?.message || e));

// ── tiny TTL cache (Baileys retry counter store) ──
class MemCache {
  constructor(ttl = 600000) { this.m = new Map(); this.ttl = ttl; }
  get(k) {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.t < Date.now()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) { this.m.set(k, { v, t: Date.now() + this.ttl }); }
  del(k) { this.m.delete(k); }
  flushAll() { this.m.clear(); }
}
const retryCache = new MemCache();

// ── group metadata cache ──
const metaCache = new Map(); // `${sid}:${jid}` -> { t, v }
const META_TTL = 5 * 60 * 1000;
const metaKey = (sess, jid) => `${sess.id}:${jid}`;
async function getMeta(sess, jid) {
  const c = metaCache.get(metaKey(sess, jid));
  if (c && Date.now() - c.t < META_TTL) return c.v;
  const v = await sess.sock.groupMetadata(jid);
  metaCache.set(metaKey(sess, jid), { t: Date.now(), v });
  return v;
}
const clearMeta = (jid) => { for (const k of metaCache.keys()) if (k.endsWith(`:${jid}`)) metaCache.delete(k); };

const aliasesOf = (p) => [p?.id, p?.lid, p?.jid, p?.phoneNumber].filter(Boolean).map(digits).filter(Boolean);
const cleanJid = (j = '') => j.replace(/:\d+@/, '@');
const tsOf = (t) => (t && typeof t === 'object' ? (t.toNumber ? t.toNumber() : t.low) : Number(t)) || 0;

// ── build the command context (x) ──
function buildCtx(sess, m, content) {
  const sock = sess.sock;
  const jid = m.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const fromMe = !!m.key.fromMe;
  const ownNum = digits(sock.user?.id);
  const senderJid = fromMe
    ? `${ownNum}@s.whatsapp.net`
    : cleanJid(isGroup ? m.key.participant || '' : jid);
  const sender = digits(senderJid);
  const senderAlt = [m.key.participantAlt, m.key.remoteJidAlt].filter(Boolean).map(digits).filter((n) => n && n !== sender);
  const isOwner = (sess.main && fromMe) || [sender, ...senderAlt].includes(C.OWNER_NUMBER);

  const text = textOf(content).trim();
  const prefix = data.settings.prefix || C.PREFIX;
  let cmd = '', arg = '', args = [];
  if (text.startsWith(prefix)) {
    const mm = text.slice(prefix.length).match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (mm) { cmd = mm[1].toLowerCase(); arg = (mm[2] || '').trim(); args = arg ? arg.split(/\s+/) : []; }
  }

  const ci = ctxInfo(content);
  const mentioned = (ci?.mentionedJid || []).map(cleanJid);
  let quoted = null;
  if (ci?.quotedMessage) {
    const qmsg = unwrap(ci.quotedMessage);
    quoted = {
      id: ci.stanzaId,
      participant: cleanJid(ci.participant || (isGroup ? '' : jid)),
      text: textOf(qmsg).trim(),
      msg: qmsg,
      raw: ci.quotedMessage,
    };
  }
  const targets = [...new Set([...mentioned, quoted?.participant].filter(Boolean))];

  const toContent = (c) => (typeof c === 'string' ? { text: c } : c);
  return {
    sock, m, jid, isGroup, fromMe, isOwner,
    sender, senderJid, senderAlt,
    pushName: m.pushName || '',
    text, content, cmd, arg, args, prefix,
    mentioned, quoted, targets, target: targets[0],
    session: { id: sess.id },
    meta: () => getMeta(sess, jid),
    reply: (c, o = {}) => sock.sendMessage(jid, toContent(c), { quoted: m, ...o }),
    send: (c, o = {}) => sock.sendMessage(jid, toContent(c), o),
  };
}

// ── message pipeline ──
const seen = new Map(); // dedupe when several sessions sit in the same group
const lastMsg = new Map(); // cooldown per sender

async function handle(sess, m) {
  if (!m.message || m.key.remoteJid === 'status@broadcast') return;
  const content = unwrap(m.message);
  if (!content || content.protocolMessage || content.reactionMessage) return;

  const dk = `${m.key.remoteJid}|${m.key.id}`;
  if (seen.has(dk)) return;
  seen.set(dk, Date.now());
  if (seen.size > 2000) for (const [k, t] of seen) if (Date.now() - t > 60000) seen.delete(k);

  const x = buildCtx(sess, m, content);
  stats.messages++;

  // ⛓️ jail runs first for EVERY message type (text, stickers, media…) and in every mode
  if (x.isGroup && !x.fromMe && (await jailCheck(x))) return;

  // ignore old backlog delivered after a reconnect
  const age = Date.now() / 1000 - tsOf(m.messageTimestamp);
  if (age > 90) return;

  if (!x.isOwner && data.bans.includes(x.sender)) return;
  if (data.settings.mode === 'PRIVATE' && !x.isOwner) return;

  // remember private chatters (used by .broadcast)
  if (!x.isGroup && !x.fromMe && !data.users.includes(x.sender) && data.users.length < 2000) {
    data.users.push(x.sender);
    save();
  }

  if (!x.text) return;
  const isCmd = !!x.cmd;
  if (x.fromMe && !isCmd) return; // the account's own chats only count when they are commands

  // cooldown
  const now = Date.now();
  if (!x.isOwner && now - (lastMsg.get(x.sender) || 0) < C.COOLDOWN_SECONDS * 1000) return;
  lastMsg.set(x.sender, now);

  if (isCmd) {
    if (!registry.has(x.cmd)) return;
    // help admin checks in LID groups: learn the sender's other ids from group metadata
    if (x.isGroup && !x.senderAlt.length) {
      try {
        const meta = await x.meta();
        const p = meta.participants.find((q) => aliasesOf(q).includes(x.sender));
        if (p) x.senderAlt = aliasesOf(p).filter((n) => n !== x.sender);
      } catch {}
    }
    await runCommand(x);
    return;
  }

  if (x.isGroup && (await antilinkCheck(x))) return;

  // 🤖 AI auto reply: private chats always, groups only when the bot is tagged
  if (!data.settings.autoReply) return;
  if (x.isGroup) {
    const me = [digits(x.sock.user?.id), digits(x.sock.user?.lid)].filter(Boolean);
    if (!x.mentioned.some((j) => me.includes(digits(j)))) return;
  }
  await x.sock.sendPresenceUpdate('composing', x.jid).catch(() => {});
  try {
    await x.reply(await askAI({ key: x.jid, text: x.text, remember: true }));
  } catch (e) {
    console.error('AI error:', e.message);
    await x.reply('⚠️ Sorry, I had trouble answering. Please try again.').catch(() => {});
  }
}

// ── session lifecycle ──
const groupEventSeen = new Map();

async function startSession(sess) {
  fs.mkdirSync(sess.dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sess.dir);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch {}
  const store = (sess.store ||= new Map());
  const remember = (msg) => {
    if (!msg?.key?.id || !msg.message) return;
    store.set(msg.key.id, msg.message);
    if (store.size > 800) store.delete(store.keys().next().value);
  };

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    logger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    msgRetryCounterCache: retryCache, // ← "waiting for this message" fix (1/3)
    getMessage: async (key) => store.get(key.id), // ← fix (2/3): lets Baileys resend on retry requests
    cachedGroupMetadata: async (jid) => {
      const c = metaCache.get(metaKey(sess, jid));
      return c && Date.now() - c.t < META_TTL ? c.v : undefined;
    },
  });

  // fix (3/3): remember everything we SEND so retries can be answered
  const rawSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...a) => {
    const r = await rawSend(...a);
    remember(r);
    return r;
  };

  sess.sock = sock;
  sess.connected = false;
  sess.closing = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const m of messages) remember(m);
    if (type !== 'notify') return;
    for (const m of messages) {
      handle(sess, m).catch((e) => console.error('Handler error:', e?.message || e));
    }
  });

  sock.ev.on('group-participants.update', (ev) => {
    clearMeta(ev.id);
    const k = `${ev.id}|${ev.action}|${(ev.participants || []).map((p) => (typeof p === 'string' ? p : p.id)).join(',')}`;
    if (groupEventSeen.has(k)) return;
    groupEventSeen.set(k, Date.now());
    for (const [kk, t] of groupEventSeen) if (Date.now() - t > 30000) groupEventSeen.delete(kk);
    onGroupEvent(sock, ev).catch((e) => console.error('Group event error:', e?.message || e));
  });
  sock.ev.on('groups.update', (arr) => arr.forEach((g) => g.id && clearMeta(g.id)));

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      sess.connected = true;
      clearTimeout(sess.timer);
      console.log(`✅ ${C.BOT_NAME} connected (+${sess.id})`);
      if (!sess.main && !data.pairs.includes(sess.id)) { data.pairs.push(sess.id); save(); }
      if (sess.main && !startSession.remindersDone) { startSession.remindersDone = true; rescheduleReminders(); }
    }
    if (connection !== 'close') return;

    sess.connected = false;
    if (sess.closing) return;
    const code = lastDisconnect?.error?.output?.statusCode;

    if (code === DisconnectReason.connectionReplaced) {
      console.log(`⚠️ +${sess.id}: this session was opened somewhere else. Stop the other copy, then restart.`);
      return;
    }
    if (code === DisconnectReason.loggedOut) {
      console.log(`Logged out (+${sess.id}). Clearing session…`);
      fs.rmSync(sess.dir, { recursive: true, force: true });
      if (sess.main) {
        await delay(2000);
        startSession(sess).catch((e) => console.error('Restart failed:', e.message)); // prints a fresh pairing code
      } else {
        data.pairs = data.pairs.filter((n) => n !== sess.id);
        save();
        sessions.delete(sess.id);
      }
      return;
    }
    console.log(`Connection closed (+${sess.id}), reconnecting…`);
    setTimeout(() => {
      if (!sess.closing) startSession(sess).catch((e) => console.error('Reconnect failed:', e.message));
    }, 3000);
  });

  // pairing
  if (!sock.authState.creds.registered) {
    if (sess.main) {
      await delay(3000);
      try {
        const code = await sock.requestPairingCode(C.PAIR_NUMBER);
        console.log(`\n🔗 PAIRING CODE: ${code?.match(/.{1,4}/g)?.join('-') || code}\n` +
          'WhatsApp → Linked devices → Link with phone number → enter the code.\n');
      } catch (e) {
        console.error('Pairing failed:', e.message);
      }
    } else if (sess.onCode) {
      sess.codeReady = (async () => {
        await delay(3000);
        const code = await sock.requestPairingCode(sess.id);
        await sess.onCode(code?.match(/.{1,4}/g)?.join('-') || code);
      })();
    }
  }
  return sess;
}

async function dropSession(sess, wipe = true) {
  sess.closing = true;
  clearTimeout(sess.timer);
  try {
    if (sess.connected) await sess.sock.logout();
    else sess.sock?.end(undefined);
  } catch { try { sess.sock?.end(undefined); } catch {} }
  if (wipe) fs.rmSync(sess.dir, { recursive: true, force: true });
  sessions.delete(sess.id);
  data.pairs = data.pairs.filter((n) => n !== sess.id);
  save();
}

// ── app API used by the commands ──
const app = {
  download: (sock, msg) =>
    downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }),

  getSock: (sid) => {
    const s = (sid && sessions.get(String(sid))) || sessions.get(MAIN_ID);
    return s?.sock;
  },

  listSessions: () =>
    [...sessions.values()]
      .sort((a, b) => Number(b.main) - Number(a.main))
      .map((s) => ({ id: s.id, main: s.main, connected: s.connected })),

  async pairStart(numRaw, onCode) {
    const num = digits(numRaw);
    if (num.length < 8 || num.length > 15) throw new Error('Invalid number. Use the full international format, e.g. 2349012345678');
    if (num === MAIN_ID) throw new Error('That is the main bot number.');
    const old = sessions.get(num);
    if (old?.connected) throw new Error('That number is already paired.');
    const subs = [...sessions.values()].filter((s) => !s.main).length;
    if (!old && subs >= C.MAX_SUBSESSIONS) throw new Error(`Pair limit reached (${C.MAX_SUBSESSIONS} extra numbers).`);
    if (old) await dropSession(old, true);

    const sess = { id: num, main: false, dir: path.join(SUB_DIR, num), sock: null, connected: false, closing: false, onCode };
    sessions.set(num, sess);
    sess.timer = setTimeout(() => { if (!sess.connected) dropSession(sess, true); }, 3 * 60 * 1000);
    try {
      await startSession(sess);
      if (!sess.codeReady) throw new Error('This number already has a saved session.');
      await sess.codeReady;
    } catch (e) {
      await dropSession(sess, true);
      throw e;
    }
  },

  async unpair(numRaw) {
    const num = digits(numRaw);
    const s = sessions.get(num);
    if (!s) throw new Error(`+${num} is not paired.`);
    if (s.main) throw new Error('The main session cannot be unpaired.');
    await dropSession(s, true);
  },

  // wipes stale Signal session files (cure for Bad MAC / "waiting for this message"); creds are kept
  fixSession() {
    let n = 0;
    for (const s of sessions.values()) {
      let files = [];
      try { files = fs.readdirSync(s.dir); } catch {}
      for (const f of files) {
        if (/^(session-|sender-key-)/.test(f)) {
          try { fs.unlinkSync(path.join(s.dir, f)); n++; } catch {}
        }
      }
    }
    return n;
  },

  async restart() {
    if (app._restarting) return;
    app._restarting = true;
    try {
      for (const s of sessions.values()) { s.closing = true; try { s.sock?.end(undefined); } catch {} }
      sessions.clear();
      await delay(1500);
      await startAll();
    } finally {
      app._restarting = false;
    }
  },
};

async function startAll() {
  const main = { id: MAIN_ID, main: true, dir: SESSION_DIR, sock: null, connected: false, closing: false };
  sessions.set(MAIN_ID, main);
  await startSession(main);

  for (const num of [...data.pairs]) {
    if (num === MAIN_ID) continue;
    const dir = path.join(SUB_DIR, num);
    let registered = false;
    try { registered = !!JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8')).registered; } catch {}
    if (!registered) { data.pairs = data.pairs.filter((n) => n !== num); continue; }
    await delay(2000);
    const s = { id: num, main: false, dir, sock: null, connected: false, closing: false };
    sessions.set(num, s);
    await startSession(s).catch((e) => console.error(`Sub-session +${num} failed:`, e.message));
  }
  save();
}

setApp(app);
startAll().catch((e) => console.error('Startup failed:', e));
