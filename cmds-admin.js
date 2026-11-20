// ───────────── cmds-admin.js: GROUP · OWNER ─────────────
import * as C from './config.js';
import { data, save } from './store.js';
import { def, small, section, getApp, who, isBotNum, fmtUptime } from './core.js';
import { digits, sleep } from './util.js';

const mention = (j) => '@' + digits(j);
const WARN_LIMIT = 3;

const toJid = (n) => `${digits(n)}@s.whatsapp.net`;

// numbers typed in the command (e.g. ".add 2348012345678, 2349...")
const numbersIn = (x) => x.args.map((a) => digits(a)).filter((n) => n.length >= 8 && n.length <= 15);

// ══════════════ GROUP (21) ══════════════
def('group', 'tagall', '📢', { group: true, admin: true }, async (x) => {
  const { meta } = await who(x);
  const ids = meta.participants.map((p) => p.id);
  const text = `📢 *${small('tag all')}*${x.arg ? `\n${x.arg}` : ''}\n\n${ids.map((j) => `✦ ${mention(j)}`).join('\n')}`;
  await x.send({ text, mentions: ids });
});

def('group', 'hidetag', '🕶️', { group: true, admin: true }, async (x) => {
  const { meta } = await who(x);
  const text = x.arg || x.quoted?.text;
  if (!text) return x.reply(`Usage: ${x.prefix}hidetag <message>  (or reply to a message)`);
  await x.send({ text, mentions: meta.participants.map((p) => p.id) });
});

def('group', 'kick', '🚪', { group: true, admin: true, botAdmin: true }, async (x) => {
  const w = await who(x);
  const targets = x.targets.filter((t) => digits(t) !== C.OWNER_NUMBER && !isBotNum(x, t) && !w.isAdminNum(t));
  if (!targets.length) return x.reply(`Tag or reply to the member to remove: ${x.prefix}kick @user\n(Admins, the owner and the bot cannot be kicked.)`);
  await x.sock.groupParticipantsUpdate(x.jid, targets, 'remove');
  await x.reply({ text: `🚪 Removed: ${targets.map(mention).join(', ')}`, mentions: targets });
});

def('group', 'add', '➕', { group: true, admin: true, botAdmin: true }, async (x) => {
  const nums = numbersIn(x);
  if (!nums.length) return x.reply(`Usage: ${x.prefix}add <number with country code>\nExample: ${x.prefix}add ${C.OWNER_NUMBER}`);
  const res = await x.sock.groupParticipantsUpdate(x.jid, nums.map(toJid), 'add');
  const label = { 200: '✅ added', 403: '🔒 privacy settings block adds (send them the invite link)', 408: '⏳ left recently', 409: 'ℹ️ already in the group' };
  await x.reply((res || []).map((r) => `+${digits(r.jid || r.content?.attrs?.jid)}: ${label[r.status] || `status ${r.status}`}`).join('\n') || '✅ Done');
});

const promoteDemote = (action, emoji, verb) => async (x) => {
  const targets = x.targets.filter((t) => !isBotNum(x, t));
  if (!targets.length) return x.reply(`Tag or reply to a member: ${x.prefix}${action} @user`);
  await x.sock.groupParticipantsUpdate(x.jid, targets, action);
  await x.reply({ text: `${emoji} ${targets.map(mention).join(', ')} ${verb}`, mentions: targets });
};
def('group', 'promote', '⬆️', { group: true, admin: true, botAdmin: true }, promoteDemote('promote', '⬆️', 'is now an admin 👮'));
def('group', 'demote', '⬇️', { group: true, admin: true, botAdmin: true }, promoteDemote('demote', '⬇️', 'is no longer an admin'));

def('group', 'mute', '🔇', { group: true, admin: true, botAdmin: true }, async (x) => {
  await x.sock.groupSettingUpdate(x.jid, 'announcement');
  await x.reply('🔇 Group muted — only admins can send messages.');
});
def('group', 'unmute', '🔊', { group: true, admin: true, botAdmin: true }, async (x) => {
  await x.sock.groupSettingUpdate(x.jid, 'not_announcement');
  await x.reply('🔊 Group unmuted — everyone can send messages.');
});

def('group', 'link', '🔗', { group: true, admin: true, botAdmin: true }, async (x) => {
  await x.reply(`🔗 https://chat.whatsapp.com/${await x.sock.groupInviteCode(x.jid)}`);
});
def('group', 'revoke', '♻️', { group: true, admin: true, botAdmin: true }, async (x) => {
  const code = await x.sock.groupRevokeInvite(x.jid);
  await x.reply(`♻️ Invite link reset.\n🔗 https://chat.whatsapp.com/${code}`);
});

def('group', 'groupinfo', 'ℹ️', { group: true }, async (x) => {
  const m = await x.meta();
  const admins = m.participants.filter((p) => p.admin).length;
  await x.reply(section(`ℹ️ ${small('group info')}`, [
    `✦ ${small('name')} : ${m.subject}`,
    `✦ ${small('members')} : ${m.participants.length}`,
    `✦ ${small('admins')} : ${admins}`,
    `✦ ${small('created')} : ${m.creation ? new Date(m.creation * 1000).toLocaleDateString('en-GB', { timeZone: C.TIMEZONE }) : '—'}`,
    `✦ ${small('who can send')} : ${m.announce ? 'Admins only' : 'Everyone'}`,
    `✦ ${small('antilink')} : ${data.antilink[x.jid] ? 'ON' : 'OFF'}`,
    `✦ ${small('welcome')} : ${data.welcome[x.jid] ? 'ON' : 'OFF'}`,
  ]) + (m.desc ? `\n\n📝 ${m.desc.slice(0, 500)}` : ''));
});

def('group', 'admins', '👮', { group: true }, async (x) => {
  const m = await x.meta();
  const ids = m.participants.filter((p) => p.admin).map((p) => p.id);
  await x.reply({ text: `👮 *${small('group admins')}* (${ids.length})\n\n${ids.map((j) => `✦ ${mention(j)}`).join('\n')}`, mentions: ids });
});

def('group', 'setname', '🏷️', { group: true, admin: true, botAdmin: true }, async (x) => {
  if (!x.arg) return x.reply(`Usage: ${x.prefix}setname <new group name>`);
  await x.sock.groupUpdateSubject(x.jid, x.arg.slice(0, 100));
  await x.reply('✅ Group name updated.');
});
def('group', 'setdesc', '📝', { group: true, admin: true, botAdmin: true }, async (x) => {
  if (!x.arg) return x.reply(`Usage: ${x.prefix}setdesc <new description>`);
  await x.sock.groupUpdateDescription(x.jid, x.arg.slice(0, 2000));
  await x.reply('✅ Group description updated.');
});

const toggle = (store, label, emoji) => async (x) => {
  const a = x.args[0]?.toLowerCase();
  if (!['on', 'off'].includes(a)) return x.reply(`${emoji} ${label} is ${store[x.jid] ? 'ON' : 'OFF'}\nUsage: ${x.prefix}${label.toLowerCase().replace(' ', '')} on|off`);
  if (a === 'on') store[x.jid] = true; else delete store[x.jid];
  save();
  await x.reply(`${emoji} ${label} is now *${a.toUpperCase()}*`);
};
def('group', 'antilink', '🚫', { group: true, admin: true }, async (x) => {
  const a = x.args[0]?.toLowerCase();
  await toggle(data.antilink, 'Antilink', '🚫')(x);
  if (a === 'on') {
    const w = await who(x);
    if (!w.bAdmin) await x.reply('⚠️ Make me a group admin so I can delete links.');
  }
});
def('group', 'welcome', '👋', { group: true, admin: true }, toggle(data.welcome, 'Welcome', '👋'));

def('group', 'leave', '🏃', { group: true, admin: true }, async (x) => {
  await x.reply('👋 Goodbye everyone! It was nice being here.');
  await sleep(1000);
  await x.sock.groupLeave(x.jid);
});

def('group', 'warn', '⚠️', { group: true, admin: true }, async (x) => {
  const t = x.targets[0];
  if (!t) return x.reply(`Tag or reply to a member: ${x.prefix}warn @user <reason>`);
  const num = digits(t);
  if (num === C.OWNER_NUMBER || isBotNum(x, num)) return x.reply('😎 You cannot warn the owner or the bot.');
  const reason = x.arg.replace(/@\d+/g, '').trim() || 'No reason given';
  const g = (data.warns[x.jid] ||= {});
  g[num] = (g[num] || 0) + 1;
  save();
  await x.reply({ text: `⚠️ ${mention(t)} warned (${g[num]}/${WARN_LIMIT})\nReason: ${reason}`, mentions: [t] });
  if (g[num] >= WARN_LIMIT) {
    const w = await who(x);
    if (w.bAdmin && !w.isAdminNum(num)) {
      await x.sock.groupParticipantsUpdate(x.jid, [t], 'remove');
      delete g[num]; save();
      await x.reply({ text: `🚪 ${mention(t)} reached ${WARN_LIMIT} warnings and was removed.`, mentions: [t] });
    } else await x.reply('⚠️ Warning limit reached (I need admin rights to remove members).');
  }
});

def('group', 'resetwarn', '✅', { group: true, admin: true }, async (x) => {
  const t = x.targets[0];
  if (!t) return x.reply(`Tag or reply to a member: ${x.prefix}resetwarn @user`);
  if (data.warns[x.jid]) delete data.warns[x.jid][digits(t)];
  save();
  await x.reply({ text: `✅ Warnings cleared for ${mention(t)}`, mentions: [t] });
});

def('group', 'delete', '🗑️', { group: true, admin: true }, async (x) => {
  if (!x.quoted) return x.reply(`Reply to the message you want deleted with ${x.prefix}delete`);
  const mine = isBotNum(x, x.quoted.participant);
  if (!mine) { const w = await who(x); if (!w.bAdmin) return x.reply('🤖 Please make me a group admin first.'); }
  await x.sock.sendMessage(x.jid, { delete: { remoteJid: x.jid, fromMe: mine, id: x.quoted.id, participant: x.quoted.participant } });
});

def('group', 'jaillist', '📋', { group: true }, async (x) => {
  const list = data.jailed[x.jid] || [];
  if (!list.length) return x.reply('📋 Nobody is in jail in this group. 😇');
  await x.reply({ text: `📋 *${small('jail list')}* 🔒\n\n${list.map((n, i) => `${i + 1}. @${n}`).join('\n')}`, mentions: list.map(toJid) });
});

// Called by index.js for every non-command group message
export async function antilinkCheck(x) {
  if (!x.isGroup || !data.antilink[x.jid] || x.isOwner) return false;
  if (!/(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/)\S+/i.test(x.text)) return false;
  const w = await who(x);
  if (w.sAdmin || !w.bAdmin) return false;
  await x.sock.sendMessage(x.jid, { delete: x.m.key });
  const g = (data.warns[x.jid] ||= {});
  g[x.sender] = (g[x.sender] || 0) + 1;
  save();
  await x.send({ text: `🚫 ${mention(x.senderJid)} links are not allowed here. Warning ${g[x.sender]}/${WARN_LIMIT}`, mentions: [x.senderJid] });
  if (g[x.sender] >= WARN_LIMIT) {
    await x.sock.groupParticipantsUpdate(x.jid, [x.senderJid], 'remove');
    delete g[x.sender]; save();
  }
  return true;
}

// Welcome / goodbye messages
export async function onGroupEvent(sock, ev) {
  if (!data.welcome[ev.id] || !['add', 'remove'].includes(ev.action)) return;
  const meta = await sock.groupMetadata(ev.id).catch(() => null);
  const ids = (ev.participants || []).map((p) => (typeof p === 'string' ? p : p.id || p.phoneNumber)).filter(Boolean);
  if (!ids.length) return;
  const tags = ids.map(mention).join(' ');
  const text = ev.action === 'add'
    ? `👋 Welcome ${tags} to *${meta?.subject || 'the group'}*!\n${meta?.desc ? `\n📝 ${meta.desc.slice(0, 300)}\n` : ''}\nPlease read the rules and enjoy your stay. 🎉`
    : `👋 Goodbye ${tags}. We'll miss you! 😢`;
  await sock.sendMessage(ev.id, { text, mentions: ids });
}

// ══════════════ OWNER (14) ══════════════
def('owner', 'autoreply', '🤖', { owner: true }, async (x) => {
  const a = x.args[0]?.toLowerCase();
  if (!['on', 'off'].includes(a)) return x.reply(`🤖 AI auto reply is ${data.settings.autoReply ? 'ON' : 'OFF'}\nUsage: ${x.prefix}autoreply on|off`);
  data.settings.autoReply = a === 'on';
  save();
  await x.reply(section(`🤖 ${small('ai reply')}`, [`✦ ${small('ai reply')} : ${a.toUpperCase()}`]));
});

def('owner', 'mode', '⚙️', { owner: true }, async (x) => {
  const a = x.args[0]?.toLowerCase();
  if (!['public', 'private'].includes(a)) return x.reply(`⚙️ Mode is ${data.settings.mode}\nUsage: ${x.prefix}mode public|private`);
  data.settings.mode = a.toUpperCase();
  save();
  await x.reply(section(`⚙️ ${small('mode')}`, [`✦ ${small('mode')} : ${data.settings.mode}`]));
});

def('owner', 'broadcast', '📢', { owner: true }, async (x) => {
  const text = x.arg || x.quoted?.text;
  if (!text) return x.reply(`Usage: ${x.prefix}broadcast <message>`);
  const groups = Object.keys(await x.sock.groupFetchAllParticipating().catch(() => ({})));
  const users = data.users.map(toJid);
  const targets = [...new Set([...groups, ...users])].slice(0, 300);
  await x.reply(`📢 Broadcasting to ${targets.length} chats… (this takes about ${Math.ceil(targets.length * 2 / 60)} min)`);
  (async () => {
    let ok = 0;
    for (const jid of targets) {
      try { await x.sock.sendMessage(jid, { text: `📢 *${C.BOT_NAME} ${small('broadcast')}*\n\n${text}` }); ok++; } catch {}
      await sleep(2000);
    }
    await x.reply(`✅ Broadcast finished: ${ok}/${targets.length} delivered.`).catch(() => {});
  })();
});

def('owner', 'setprefix', '🔧', { owner: true }, async (x) => {
  const p = x.args[0];
  if (!p || p.length > 3) return x.reply(`Usage: ${x.prefix}setprefix <1-3 characters>\nCurrent prefix: ${data.settings.prefix}`);
  data.settings.prefix = p;
  save();
  await x.reply(`🔧 Prefix changed to *${p}*\nExample: ${p}menu`);
});

def('owner', 'ban', '🚫', { owner: true }, async (x) => {
  const num = x.targets[0] ? digits(x.targets[0]) : numbersIn(x)[0];
  if (!num) return x.reply(`Usage: ${x.prefix}ban @user  (or a number)`);
  if (num === C.OWNER_NUMBER || isBotNum(x, num)) return x.reply('😎 The owner and the bot cannot be banned.');
  if (!data.bans.includes(num)) data.bans.push(num);
  save();
  await x.reply(`🚫 +${num} is banned from using the bot.`);
});

def('owner', 'unban', '✅', { owner: true }, async (x) => {
  const num = x.targets[0] ? digits(x.targets[0]) : numbersIn(x)[0];
  if (!num) return x.reply(`Usage: ${x.prefix}unban @user  (or a number)`);
  data.bans = data.bans.filter((n) => n !== num);
  save();
  await x.reply(`✅ +${num} is unbanned.`);
});

def('owner', 'banlist', '📋', { owner: true }, async (x) => {
  if (!data.bans.length) return x.reply('📋 Nobody is banned.');
  await x.reply(section(`📋 ${small('ban list')}`, data.bans.map((n, i) => `${i + 1}. +${n}`)));
});

def('owner', 'restart', '♻️', { owner: true }, async (x) => {
  await x.reply('♻️ Restarting the connection…');
  setTimeout(() => getApp().restart(), 1000);
});

def('owner', 'join', '📥', { owner: true }, async (x) => {
  const m = (x.arg || x.quoted?.text || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
  if (!m) return x.reply(`Usage: ${x.prefix}join https://chat.whatsapp.com/XXXX`);
  await x.sock.groupAcceptInvite(m[1]);
  await x.reply('📥 Joined the group!');
});

const blockCmd = (action, emoji, past) => async (x) => {
  const jid = x.targets[0] || (numbersIn(x)[0] ? toJid(numbersIn(x)[0]) : !x.isGroup ? x.jid : null);
  if (!jid) return x.reply(`Usage: ${x.prefix}${action} @user  (or a number)`);
  if (digits(jid) === C.OWNER_NUMBER || isBotNum(x, jid)) return x.reply('😎 Not that one!');
  await x.sock.updateBlockStatus(jid, action);
  await x.reply(`${emoji} +${digits(jid)} ${past}.`);
};
def('owner', 'block', '⛔', { owner: true }, blockCmd('block', '⛔', 'is blocked'));
def('owner', 'unblock', '🔓', { owner: true }, blockCmd('unblock', '🔓', 'is unblocked'));

def('owner', 'setbio', '✏️', { owner: true }, async (x) => {
  if (!x.arg) return x.reply(`Usage: ${x.prefix}setbio <text>`);
  await x.sock.updateProfileStatus(x.arg.slice(0, 139));
  await x.reply('✏️ Bio updated.');
});

def('owner', 'pairlist', '🔗', { owner: true }, async (x) => {
  const list = getApp().listSessions();
  await x.reply(section(`🔗 ${small('sessions')} (${list.length}/${C.MAX_SUBSESSIONS + 1})`, list.map((s) => `${s.main ? '👑' : '🔗'} +${s.id} ${s.connected ? '🟢' : '🟡'}`)));
});

def('owner', 'fixsession', '🛠️', { owner: true }, async (x) => {
  const n = getApp().fixSession();
  await x.reply(`🛠️ Cleaned ${n} stale session files. Reconnecting…`);
  setTimeout(() => getApp().restart(), 1000);
});
    
