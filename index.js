import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import * as C from './config.js';

const { section, row, small } = C;
const SETTINGS_FILE = './settings.json';
const startedAt = Date.now();

// ── persistent settings ──
let settings = { mode: C.MODE, autoReply: C.AUTO_REPLY };
try {
  settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
} catch {}
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings));

// ── helpers ──
const history = new Map(); // jid -> [{role, content}]
const lastMsg = new Map(); // jid -> timestamp
const digits = (jid = '') => jid.split('@')[0].split(':')[0];

function uptime() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

const clock = () =>
  new Date().toLocaleString('en-GB', { timeZone: C.TIMEZONE, hour12: false });

const infoBlock = () =>
  section(`👑 ${small('bot info')}`, [
    row('owner', C.CREATOR_NAME),
    row('prefix', C.PREFIX),
    row('mode', settings.mode),
    row('ai reply', settings.autoReply ? 'ON' : 'OFF'),
    row('status', 'Online 🟢'),
    row('uptime', uptime()),
  ]);

const menuText = () =>
  [
    C.HEADER,
    infoBlock(),
    section(`🤖 ${small('ai commands')}`, [
      row(`${C.PREFIX}ai <text>`, 'ask the AI'),
      row(`${C.PREFIX}clear`, 'reset chat memory'),
    ]),
    section(`📌 ${small('general')}`, [
      row(`${C.PREFIX}menu`, 'show this menu'),
      row(`${C.PREFIX}ping`, 'speed check'),
      row(`${C.PREFIX}owner`, 'owner info'),
      ...(C.PROMO_TEXT ? [row(`${C.PREFIX}news`, 'latest news')] : []),
    ]),
    section(`🔐 ${small('owner only')}`, [
      row(`${C.PREFIX}mode public|private`, 'who can use'),
      row(`${C.PREFIX}autoreply on|off`, 'AI auto reply'),
    ]),
    `${small('version')} ${C.VERSION} • ${clock()}`,
  ].join('\n\n');

// ── Groq ──
async function askAI(jid, text) {
  const h = history.get(jid) || [];
  h.push({ role: 'user', content: text });
  while (h.length > C.MAX_HISTORY) h.shift();

  const res = await fetch(C.GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${C.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: C.GROQ_MODEL,
      reasoning_effort: C.REASONING_EFFORT,
      messages: [{ role: 'system', content: C.SYSTEM_PROMPT }, ...h],
    }),
  });
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
  const data = await res.json();
  let reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Empty AI reply');
  if (reply.length > C.MAX_REPLY_CHARS) reply = reply.slice(0, C.MAX_REPLY_CHARS - 1) + '…';

  h.push({ role: 'assistant', content: reply });
  while (h.length > C.MAX_HISTORY) h.shift();
  history.set(jid, h);
  return reply;
}

// ── bot ──
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    await delay(3000);
    try {
      const code = await sock.requestPairingCode(C.PAIR_NUMBER);
      console.log(`\n🔗 PAIRING CODE: ${code?.match(/.{1,4}/g)?.join('-') || code}\n` +
        'WhatsApp → Linked devices → Link with phone number → enter the code.\n');
    } catch (e) {
      console.error('Pairing failed:', e.message);
    }
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log(`✅ ${C.BOT_NAME} connected`);
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete the session folder and restart to pair again.');
        fs.rmSync('./session', { recursive: true, force: true });
        process.exit(0);
      }
      console.log('Connection closed, reconnecting…');
      setTimeout(start, 3000);
    }
  });

  const reply = (m, text) => sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.remoteJid === 'status@broadcast') continue;
        const jid = m.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const sender = digits(isGroup ? m.key.participant || '' : jid);
        const fromMe = !!m.key.fromMe;
        const isOwner = fromMe || sender === C.OWNER_NUMBER;

        const msg = m.message;
        const text = (
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          msg.imageMessage?.caption ||
          msg.videoMessage?.caption ||
          ''
        ).trim();
        if (!text) continue;

        if (settings.mode === 'PRIVATE' && !isOwner) continue;

        const isCmd = text.startsWith(C.PREFIX);

        // The owner's own outgoing chats are only processed when they are commands
        if (fromMe && !isCmd) continue;

        // cooldown
        const now = Date.now();
        if (!isOwner && now - (lastMsg.get(sender) || 0) < C.COOLDOWN_SECONDS * 1000) continue;
        lastMsg.set(sender, now);

        if (isCmd) {
          const [cmdRaw, ...args] = text.slice(C.PREFIX.length).split(/\s+/);
          const cmd = cmdRaw.toLowerCase();
          const arg = args.join(' ').trim();

          switch (cmd) {
            case 'menu':
            case 'help':
            case 'start':
              try {
                await sock.sendMessage(jid, { image: { url: C.BOT_IMAGE }, caption: menuText() }, { quoted: m });
              } catch {
                await reply(m, menuText());
              }
              break;
            case 'ping': {
              const t = Date.now();
              await reply(m, section(`⚡ ${small('ping')}`, [row('speed', `${Date.now() - t} ms`), row('uptime', uptime())]));
              break;
            }
            case 'owner':
              await reply(m, section(`👑 ${small('owner')}`, [row('name', C.CREATOR_NAME), row('info', C.CREATOR_INFO), row('contact', `wa.me/${C.OWNER_NUMBER}`)]));
              break;
            case 'news':
              if (C.PROMO_TEXT) await reply(m, C.PROMO_TEXT);
              break;
            case 'clear':
              history.delete(jid);
              await reply(m, section(`🧹 ${small('memory')}`, [row('status', 'Chat memory cleared')]));
              break;
            case 'ai':
              if (!arg) { await reply(m, `Usage: ${C.PREFIX}ai <your question>`); break; }
              await sock.sendPresenceUpdate('composing', jid);
              await reply(m, await askAI(jid, arg));
              break;
            case 'mode':
              if (!isOwner) { await reply(m, '⛔ Owner only.'); break; }
              if (!['public', 'private'].includes(arg.toLowerCase())) { await reply(m, `Usage: ${C.PREFIX}mode public|private`); break; }
              settings.mode = arg.toUpperCase();
              saveSettings();
              await reply(m, section(`⚙️ ${small('mode')}`, [row('mode', settings.mode)]));
              break;
            case 'autoreply':
              if (!isOwner) { await reply(m, '⛔ Owner only.'); break; }
              if (!['on', 'off'].includes(arg.toLowerCase())) { await reply(m, `Usage: ${C.PREFIX}autoreply on|off`); break; }
              settings.autoReply = arg.toLowerCase() === 'on';
              saveSettings();
              await reply(m, section(`⚙️ ${small('ai reply')}`, [row('ai reply', settings.autoReply ? 'ON' : 'OFF')]));
              break;
          }
          continue;
        }

        // Auto AI reply: private chats always; groups only when the bot is mentioned
        if (!settings.autoReply) continue;
        if (isGroup) {
          const me = digits(sock.user?.id);
          const mentioned = msg.extendedTextMessage?.contextInfo?.mentionedJid?.some((j) => digits(j) === me);
          if (!mentioned) continue;
        }
        await sock.sendPresenceUpdate('composing', jid);
        await reply(m, await askAI(jid, text));
      } catch (e) {
        console.error('Handler error:', e.message);
        try { await reply(m, '⚠️ Sorry, I had trouble answering. Please try again.'); } catch {}
      }
    }
  });
}

start();
