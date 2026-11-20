// ═══════════════════════════════════════════
//  MERLIN EXE • COMMAND PACK  (extras.js)
//  jail • viewonce • play • admin tools
//  npm i yt-search @distube/ytdl-core
// ═══════════════════════════════════════════
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const PREFIX = '.';
const fs = require('fs');
const path = require('path');

// ───────── JAIL STORAGE (jail.json) ─────────
const JAIL_FILE = path.join(__dirname, 'jail.json');
const jailed = new Map(); // groupId -> Set(number)

function loadJail() {
  try {
    if (!fs.existsSync(JAIL_FILE)) return;
    const data = JSON.parse(fs.readFileSync(JAIL_FILE, 'utf8'));
    for (const [gid, list] of Object.entries(data)) jailed.set(gid, new Set(list));
  } catch (e) { console.error('jail.json load failed:', e.message); }
}

function saveJail() {
  try {
    const obj = {};
    for (const [gid, set] of jailed) if (set.size) obj[gid] = [...set];
    const tmp = JAIL_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, JAIL_FILE); // safe write, no half-written file
  } catch (e) { console.error('jail.json save failed:', e.message); }
}

loadJail();

// ───────── helpers ─────────
const react = (sock, msg, emoji) =>
  sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });

const box = (title, lines) =>
  `╭━━━〔 ${title} 〕━━━⬣\n${lines.map(l => `┃ ${l}`).join('\n')}\n╰━━━━━━━━━━━━━━━━⬣`;

const reply = (sock, msg, text, extra = {}) =>
  sock.sendMessage(msg.key.remoteJid, { text, ...extra }, { quoted: msg });

const norm = (jid = '') => jid.split(':')[0].split('@')[0];

async function getCtx(sock, msg) {
  const from = msg.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  const sender = msg.key.participant || msg.key.remoteJid;
  let meta = null, admins = [], isAdmin = false, isBotAdmin = false;
  if (isGroup) {
    meta = await sock.groupMetadata(from);
    admins = meta.participants.filter(p => p.admin).map(p => norm(p.id));
    isAdmin = admins.includes(norm(sender));
    isBotAdmin = admins.includes(norm(sock.user.id));
  }
  const m = msg.message?.extendedTextMessage?.contextInfo;
  const target = m?.mentionedJid?.[0] || m?.participant || null;
  return { from, isGroup, sender, meta, admins, isAdmin, isBotAdmin, target, quotedInfo: m };
}

// guard: group + admin (+ bot admin when needed)
async function guard(sock, msg, c, needBot = true) {
  if (!c.isGroup) { await react(sock, msg, '🚫'); await reply(sock, msg, '🚫 Groups only.'); return false; }
  if (!c.isAdmin) { await react(sock, msg, '⛔'); await reply(sock, msg, '⛔ Admins only.'); return false; }
  if (needBot && !c.isBotAdmin) { await react(sock, msg, '⚠️'); await reply(sock, msg, '⚠️ Make me admin first.'); return false; }
  return true;
}

// ───────── JAIL ENFORCER ─────────
// Call this at the TOP of your messages.upsert handler, for every message.
// If it returns true, stop processing that message.
async function jailEnforcer(sock, msg) {
  const from = msg.key.remoteJid;
  if (!from?.endsWith('@g.us') || msg.key.fromMe) return false;
  const set = jailed.get(from);
  if (!set || !set.size) return false;
  const sender = msg.key.participant;
  if (!set.has(norm(sender))) return false;
  try {
    // deletes ANY message type: text, sticker, image, etc.
    await sock.sendMessage(from, { delete: msg.key });
  } catch (e) { /* bot lost admin */ }
  return true;
}

// ───────── COMMANDS ─────────
const commands = {

  // ⛓️ JAIL
  jail: async (sock, msg, args) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!c.target) return reply(sock, msg, '⛓️ Tag or reply to someone.\nExample: .jail @user');
    if (c.admins.includes(norm(c.target))) { await react(sock, msg, '🛡️'); return reply(sock, msg, '🛡️ Admins cannot be jailed.'); }
    if (norm(c.target) === norm(sock.user.id)) return reply(sock, msg, '😅 I cannot jail myself.');
    if (!jailed.has(c.from)) jailed.set(c.from, new Set());
    jailed.get(c.from).add(norm(c.target));
    saveJail();
    await react(sock, msg, '⛓️');
    await sock.sendMessage(c.from, {
      text: box('⛓️ ᴊᴀɪʟᴇᴅ ⛓️', [
        `👤 ᴘʀɪsᴏɴᴇʀ : @${norm(c.target)}`,
        `👮 ᴊᴜᴅɢᴇ : @${norm(c.sender)}`,
        '🚫 ᴛᴇxᴛs : ᴅᴇʟᴇᴛᴇᴅ',
        '🚫 sᴛɪᴄᴋᴇʀs : ᴅᴇʟᴇᴛᴇᴅ',
        '🔓 ʀᴇʟᴇᴀsᴇ : .unjail @user',
      ]),
      mentions: [c.target, c.sender],
    }, { quoted: msg });
  },

  // 🔓 UNJAIL
  unjail: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c, false))) return;
    if (!c.target) return reply(sock, msg, '🔓 Tag or reply to someone.\nExample: .unjail @user');
    const set = jailed.get(c.from);
    if (!set || !set.delete(norm(c.target))) return reply(sock, msg, '🤷 That member is not in jail.');
    saveJail();
    await react(sock, msg, '🔓');
    await sock.sendMessage(c.from, {
      text: box('🔓 ғʀᴇᴇᴅ 🔓', [
        `👤 @${norm(c.target)}`,
        '✅ ʏᴏᴜ ᴄᴀɴ ᴍᴇssᴀɢᴇ ᴀɢᴀɪɴ',
        '😇 ʙᴇ ɢᴏᴏᴅ ɴᴏᴡ!',
      ]),
      mentions: [c.target],
    }, { quoted: msg });
  },

  // 📋 JAILLIST
  jaillist: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c, false))) return;
    const set = [...(jailed.get(c.from) || [])];
    await react(sock, msg, '📋');
    if (!set.length) return reply(sock, msg, '🕊️ Jail is empty.');
    await sock.sendMessage(c.from, {
      text: box('⛓️ ᴊᴀɪʟ ʟɪsᴛ', set.map((n, i) => `${i + 1}. @${n}`)),
      mentions: set.map(n => n + '@s.whatsapp.net'),
    }, { quoted: msg });
  },

  // 👁️ VIEWONCE (reply to a view-once message)
  viewonce: async (sock, msg) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q) return reply(sock, msg, '👁️ Reply to a view-once photo/video with .viewonce');
    const inner = q.viewOnceMessageV2?.message || q.viewOnceMessage?.message || q.viewOnceMessageV2Extension?.message || q;
    const type = getContentType(inner);
    if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(type))
      return reply(sock, msg, '❌ That is not a view-once media message.');
    await react(sock, msg, '👁️');
    try {
      const ctx = msg.message.extendedTextMessage.contextInfo;
      const fake = { key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant }, message: inner };
      const buf = await downloadMediaMessage(fake, 'buffer', {});
      const cap = '👁️ ᴠɪᴇᴡᴏɴᴄᴇ ᴜɴʟᴏᴄᴋᴇᴅ';
      if (type === 'imageMessage') await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: cap }, { quoted: msg });
      else if (type === 'videoMessage') await sock.sendMessage(msg.key.remoteJid, { video: buf, caption: cap }, { quoted: msg });
      else await sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: 'audio/mp4', ptt: false }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) {
      await react(sock, msg, '❌');
      reply(sock, msg, '❌ Could not unlock it (maybe already expired).');
    }
  },

  // 🎵 PLAY
  play: async (sock, msg, args) => {
    const q = args.join(' ').trim();
    if (!q) return reply(sock, msg, '🎵 Usage: .play <song name>\nExample: .play burna boy last last');
    await react(sock, msg, '🔎');
    try {
      const r = await yts(q);
      const v = r.videos[0];
      if (!v) { await react(sock, msg, '❌'); return reply(sock, msg, '❌ No results found.'); }
      if (v.seconds > 900) { await react(sock, msg, '⏱️'); return reply(sock, msg, '⏱️ Song too long (max 15 min).'); }
      await sock.sendMessage(msg.key.remoteJid, {
        image: { url: v.thumbnail },
        caption: box('🎵 ɴᴏᴡ ᴘʟᴀʏɪɴɢ', [
          `🎶 ${v.title}`,
          `🎤 ${v.author.name}`,
          `⏱️ ${v.timestamp}`,
          '⬇️ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ...',
        ]),
      }, { quoted: msg });
      await react(sock, msg, '⬇️');
      const chunks = [];
      const stream = ytdl(v.url, { filter: 'audioonly', quality: 'highestaudio' });
      for await (const ch of stream) chunks.push(ch);
      const audio = Buffer.concat(chunks);
      await sock.sendMessage(msg.key.remoteJid, {
        audio, mimetype: 'audio/mpeg', fileName: `${v.title}.mp3`,
      }, { quoted: msg });
      await react(sock, msg, '🎧');
    } catch (e) {
      await react(sock, msg, '❌');
      reply(sock, msg, '❌ Download failed. Try another song.');
    }
  },

  // ───────── ADMIN COMMANDS ─────────
  kick: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!c.target) return reply(sock, msg, '👢 Tag or reply to someone.');
    if (c.admins.includes(norm(c.target))) return reply(sock, msg, '🛡️ Cannot kick an admin.');
    await sock.groupParticipantsUpdate(c.from, [c.target], 'remove');
    await react(sock, msg, '👢');
    reply(sock, msg, '👢 Removed from the group.');
  },

  promote: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!c.target) return reply(sock, msg, '⬆️ Tag or reply to someone.');
    await sock.groupParticipantsUpdate(c.from, [c.target], 'promote');
    await react(sock, msg, '👑');
    sock.sendMessage(c.from, { text: `👑 @${norm(c.target)} is now an admin!`, mentions: [c.target] }, { quoted: msg });
  },

  demote: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!c.target) return reply(sock, msg, '⬇️ Tag or reply to someone.');
    await sock.groupParticipantsUpdate(c.from, [c.target], 'demote');
    await react(sock, msg, '⬇️');
    sock.sendMessage(c.from, { text: `⬇️ @${norm(c.target)} is no longer an admin.`, mentions: [c.target] }, { quoted: msg });
  },

  mute: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    await sock.groupSettingUpdate(c.from, 'announcement');
    await react(sock, msg, '🔇');
    reply(sock, msg, '🔇 Group muted. Only admins can send messages.');
  },

  unmute: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    await sock.groupSettingUpdate(c.from, 'not_announcement');
    await react(sock, msg, '🔊');
    reply(sock, msg, '🔊 Group unmuted. Everyone can chat.');
  },

  tagall: async (sock, msg, args) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c, false))) return;
    const ids = c.meta.participants.map(p => p.id);
    const text = box('📣 ᴛᴀɢ ᴀʟʟ', [
      `💬 ${args.join(' ') || 'Attention everyone!'}`,
      ...ids.map(id => `🔹 @${norm(id)}`),
    ]);
    await react(sock, msg, '📣');
    sock.sendMessage(c.from, { text, mentions: ids }, { quoted: msg });
  },

  hidetag: async (sock, msg, args) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c, false))) return;
    await react(sock, msg, '👻');
    sock.sendMessage(c.from, { text: args.join(' ') || '👻', mentions: c.meta.participants.map(p => p.id) });
  },

  link: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    const code = await sock.groupInviteCode(c.from);
    await react(sock, msg, '🔗');
    reply(sock, msg, box('🔗 ɢʀᴏᴜᴘ ʟɪɴᴋ', [`https://chat.whatsapp.com/${code}`]));
  },

  revoke: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    await sock.groupRevokeInvite(c.from);
    await react(sock, msg, '♻️');
    reply(sock, msg, '♻️ Group link has been reset.');
  },

  setname: async (sock, msg, args) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!args.length) return reply(sock, msg, '✏️ Usage: .setname <new name>');
    await sock.groupUpdateSubject(c.from, args.join(' '));
    await react(sock, msg, '✏️');
  },

  setdesc: async (sock, msg, args) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    if (!args.length) return reply(sock, msg, '📝 Usage: .setdesc <text>');
    await sock.groupUpdateDescription(c.from, args.join(' '));
    await react(sock, msg, '📝');
  },

  delete: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!(await guard(sock, msg, c))) return;
    const ci = c.quotedInfo;
    if (!ci?.stanzaId) return reply(sock, msg, '🗑️ Reply to the message you want deleted.');
    await sock.sendMessage(c.from, { delete: { remoteJid: c.from, fromMe: false, id: ci.stanzaId, participant: ci.participant } });
    await react(sock, msg, '🗑️');
  },

  groupinfo: async (sock, msg) => {
    const c = await getCtx(sock, msg);
    if (!c.isGroup) return reply(sock, msg, '🚫 Groups only.');
    await react(sock, msg, 'ℹ️');
    reply(sock, msg, box('ℹ️ ɢʀᴏᴜᴘ ɪɴғᴏ', [
      `📛 ${c.meta.subject}`,
      `👥 ᴍᴇᴍʙᴇʀs : ${c.meta.participants.length}`,
      `👑 ᴀᴅᴍɪɴs : ${c.admins.length}`,
      `⛓️ ᴊᴀɪʟᴇᴅ : ${(jailed.get(c.from) || new Set()).size}`,
    ]));
  },
};

// ───────── DISPATCHER ─────────
// In your handler:
//   if (await jailEnforcer(sock, msg)) return;
//   const handled = await runExtra(sock, msg, text);
async function runExtra(sock, msg, text) {
  if (!text?.startsWith(PREFIX)) return false;
  const [name, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  const fn = commands[name.toLowerCase()];
  if (!fn) return false;
  try { await fn(sock, msg, args); } catch (e) { console.error('cmd error', name, e); await react(sock, msg, '❌'); }
  return true;
}

module.exports = { commands, jailEnforcer, runExtra, jailed };
                              
