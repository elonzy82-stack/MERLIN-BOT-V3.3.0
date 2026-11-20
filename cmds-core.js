// ───────────── cmds-core.js: GENERAL · AI · FUN ─────────────
import os from 'os';
import fs from 'fs';
import path from 'path';
import * as C from './config.js';
import { data, save } from './store.js';
import { clearHistory } from './ai.js';
import {
  def, small, section, DIR, stats, uptime, menuText, getApp, rnd, pick, shuffle, hashRand,
  fetchBuf, getSharp, inputText, aiReply, who, isBotNum, registry, order,
} from './core.js';
import { digits, sleep } from './util.js';

const fmt = (tz, o) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o }).format(new Date());
const mention = (j) => '@' + digits(j);

// ══════════════ GENERAL (12) ══════════════
def('general', 'menu', '📜', { alias: ['help', 'start'] }, async (x) => {
  const caption = menuText(x);
  try { await x.send({ image: { url: C.BOT_IMAGE }, caption }); } catch { await x.reply(caption); }
});

def('general', 'ping', '🏓', async (x) => {
  const t = Date.now();
  const sent = await x.reply('🏓 Pinging…');
  const ms = Date.now() - t;
  const text = section(`🏓 ${small('pong')}`, [`✦ ${small('speed')} : ${ms} ms`, `✦ ${small('uptime')} : ${uptime()}`]);
  try { await x.sock.sendMessage(x.jid, { text, edit: sent.key }); } catch { await x.reply(text); }
});

def('general', 'alive', '💚', async (x) => {
  await x.reply(section(`💚 ${small('alive')}`, [
    `✦ ${small('bot')} : ${C.BOT_NAME}`,
    `✦ ${small('ai')} : ${C.AI_NAME}`,
    `✦ ${small('status')} : Online 🟢`,
    `✦ ${small('uptime')} : ${uptime()}`,
  ]) + '\n\nI am alive and ready to help! 🚀');
});

def('general', 'owner', '👑', async (x) => {
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${C.CREATOR_NAME}\nORG:${C.BOT_NAME};\nTEL;type=CELL;type=VOICE;waid=${C.OWNER_NUMBER}:+${C.OWNER_NUMBER}\nEND:VCARD`;
  await x.send({ contacts: { displayName: C.CREATOR_NAME, contacts: [{ vcard }] } });
  await x.reply(section(`👑 ${small('owner')}`, [`✦ ${small('name')} : ${C.CREATOR_NAME}`, `✦ ${small('about')} : ${C.CREATOR_INFO}`, `✦ ${small('chat')} : wa.me/${C.OWNER_NUMBER}`]));
});

def('general', 'runtime', '⏱️', async (x) => {
  await x.reply(section(`⏱️ ${small('runtime')}`, [`✦ ${small('uptime')} : ${uptime()}`]));
});

def('general', 'time', '🕒', async (x) => {
  const tz = x.arg || C.TIMEZONE;
  try {
    await x.reply(`🕒 ${tz}\n${fmt(tz, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}`);
  } catch {
    await x.reply(`❌ Unknown timezone. Example: ${x.prefix}time Africa/Lagos  or  ${x.prefix}time America/New_York`);
  }
});

def('general', 'date', '📅', async (x) => {
  const tz = x.arg || C.TIMEZONE;
  try {
    await x.reply(`📅 ${tz}\n${fmt(tz, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  } catch {
    await x.reply('❌ Unknown timezone. Example: Africa/Lagos');
  }
});

def('general', 'info', 'ℹ️', async (x) => {
  await x.reply(section(`ℹ️ ${small('bot info')}`, [
    `✦ ${small('name')} : ${C.BOT_NAME}`,
    `✦ ${small('version')} : ${C.VERSION}`,
    `✦ ${small('owner')} : ${C.CREATOR_NAME}`,
    `✦ ${small('commands')} : ${order.length}`,
    `✦ ${small('node')} : ${process.version}`,
    `✦ ${small('platform')} : ${os.platform()} ${os.arch()}`,
    `✦ ${small('memory')} : ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`,
    `✦ ${small('uptime')} : ${uptime()}`,
  ]));
});

def('general', 'creator', '🧑‍💻', async (x) => {
  await x.reply(section(`🧑‍💻 ${small('creator')}`, [`✦ ${small('name')} : ${C.CREATOR_NAME}`, `✦ ${small('role')} : ${C.CREATOR_INFO}`, `✦ ${small('contact')} : wa.me/${C.OWNER_NUMBER}`]));
});

def('general', 'stats', '📈', async (x) => {
  const app = getApp();
  await x.reply(section(`📈 ${small('stats')}`, [
    `✦ ${small('messages')} : ${stats.messages}`,
    `✦ ${small('commands run')} : ${stats.commands}`,
    `✦ ${small('sessions')} : ${app?.listSessions().length ?? 1}`,
    `✦ ${small('banned')} : ${data.bans.length}`,
    `✦ ${small('known users')} : ${data.users.length}`,
    `✦ ${small('memory')} : ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`,
    `✦ ${small('uptime')} : ${uptime()}`,
  ]));
});

def('general', 'pair', '🔗', async (x) => {
  const num = digits(x.arg || x.sender);
  if (num.length < 8) return x.reply(`Usage: ${x.prefix}pair <your number with country code>\nExample: ${x.prefix}pair ${C.OWNER_NUMBER}`);
  if (!x.isOwner && num !== x.sender) return x.reply('⛔ You can only pair your own number.');
  await x.reply('⏳ Creating a pairing code…');
  try {
    await getApp().pairStart(num, async (code) => {
      await x.reply(section(`🔗 ${small('pairing code')}`, [
        `✦ ${small('number')} : +${num}`,
        `✦ ${small('code')} : ${code}`,
        'Open WhatsApp → Linked devices → Link with phone number → enter the code (valid for ~3 min).',
      ]));
    });
  } catch (e) {
    await x.reply(`❌ ${e.message}`);
  }
});

def('general', 'unpair', '🔌', async (x) => {
  const num = digits(x.arg || x.sender);
  if (!x.isOwner && num !== x.sender) return x.reply('⛔ You can only unpair your own number.');
  try {
    await getApp().unpair(num);
    await x.reply(`🔌 +${num} has been unpaired.`);
  } catch (e) {
    await x.reply(`❌ ${e.message}`);
  }
});

// ══════════════ AI (11) ══════════════
def('ai', 'ai', '🤖', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}ai <your question>`);
  await aiReply(x, q, '', { remember: true });
});

def('ai', 'code', '💻', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}code <what to build>\nExample: ${x.prefix}code python function to check a palindrome`);
  await aiReply(x, q, 'Write clean, working code for the request. Put the code in a WhatsApp code block using triple backticks and add at most 3 short lines of explanation.', { max: 3000 });
});

def('ai', 'explain', '📖', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}explain <topic or code>`);
  await aiReply(x, q, 'Explain this clearly in a few simple steps and include one short example.', { max: 2000 });
});

def('ai', 'eli5', '🧸', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}eli5 <topic>`);
  await aiReply(x, q, 'Explain like I am five years old: very simple words and a fun everyday analogy.');
});

def('ai', 'translate', '🌍', async (x) => {
  let lang; let text;
  if (x.quoted?.text) { lang = x.arg; text = x.quoted.text; }
  else { [lang, ...x.args] = x.args; text = x.args.join(' '); }
  if (!lang || !text) return x.reply(`Usage: ${x.prefix}translate <language> <text>\nOr reply to a message: ${x.prefix}translate french`);
  await aiReply(x, `Translate into ${lang}:\n${text}`, 'Return only the translation (add a one-line pronunciation only if the target language uses a different script).');
});

def('ai', 'summarize', '📝', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}summarize <text>  (or reply to a message)`);
  await aiReply(x, q, 'Summarize the text into 3 to 5 short bullet points using the • character.');
});

def('ai', 'debug', '🐞', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}debug <code>  (or reply to a message with code)`);
  await aiReply(x, q, 'Find the bug(s) in this code, explain each one briefly, then give the corrected code in a triple-backtick code block.', { max: 3000 });
});

def('ai', 'rewrite', '✍️', async (x) => {
  let q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}rewrite <text>\nOptional tone first: ${x.prefix}rewrite formal: <text>`);
  let tone = 'clearer and more polished';
  const m = q.match(/^(formal|casual|friendly|professional|short|funny|persuasive)\s*[:\-]\s*([\s\S]+)/i);
  if (m) { tone = m[1].toLowerCase(); q = m[2]; }
  await aiReply(x, q, `Rewrite the text to be ${tone} while keeping its meaning. Return only the rewritten text.`);
});

def('ai', 'teach', '👨‍🏫', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}teach <topic>`);
  await aiReply(x, q, 'Teach this topic like a patient teacher: a short lesson (max 5 steps), one example, then ONE quick practice question at the end.', { max: 2000 });
});

def('ai', 'define', '📚', async (x) => {
  const q = inputText(x);
  if (!q) return x.reply(`Usage: ${x.prefix}define <word>`);
  await aiReply(x, q, 'Give a short dictionary-style definition: part of speech, meaning, and one example sentence.');
});

def('ai', 'clear', '🧹', async (x) => {
  clearHistory(x.jid);
  await x.reply(section(`🧹 ${small('memory')}`, [`✦ ${small('status')} : Chat memory cleared`]));
});

// ══════════════ FUN (23) ══════════════
const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs. 🐛',
  "I told my computer I needed a break… now it won't stop sending me Kit-Kat ads.",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  'Why did the developer go broke? He used up all his cache. 💸',
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "Why was the JavaScript developer sad? He didn't Node how to Express himself.",
  "I would tell you a UDP joke, but you might not get it.",
  'Debugging: being the detective in a crime movie where you are also the murderer. 🕵️',
  "Why do Java developers wear glasses? Because they can't C#. 👓",
  'To understand recursion, you must first understand recursion.',
  'What do you call 8 hobbits? A hobbyte.',
  '!false — it is funny because it is true.',
];
const QUOTES = [
  '"Talk is cheap. Show me the code." — Linus Torvalds',
  '"First, solve the problem. Then, write the code." — John Johnson',
  '"The best way to predict the future is to invent it." — Alan Kay',
  '"Stay hungry, stay foolish." — Steve Jobs',
  '"It always seems impossible until it is done." — Nelson Mandela',
  '"Education is the most powerful weapon which you can use to change the world." — Nelson Mandela',
  '"Whether you think you can or you think you can\'t, you\'re right." — Henry Ford',
  '"Simplicity is the soul of efficiency." — Austin Freeman',
  '"Code is like humor. When you have to explain it, it is bad." — Cory House',
  '"The secret of getting ahead is getting started." — Mark Twain',
];
const FACTS = [
  'Honey never spoils — edible honey was found in ancient Egyptian tombs. 🍯',
  'Octopuses have three hearts and blue blood. 🐙',
  'Botanically, bananas are berries but strawberries are not. 🍌',
  'The first computer "bug" was a real moth found in a Harvard computer in 1947. 🦋',
  'Nigeria is the most populous country in Africa. 🌍',
  'A day on Venus is longer than a year on Venus. 🪐',
  'The first website went live in 1991 and is still viewable today. 🌐',
  'Sharks have existed longer than trees. 🦈',
  'Your brain uses roughly 20% of your body’s energy. 🧠',
  'Lightning is about five times hotter than the surface of the sun. ⚡',
  'There are more possible chess games than atoms in the observable universe. ♟️',
];
const RIDDLES = [
  { q: "What has keys but can't open locks?", a: ['piano', 'keyboard'] },
  { q: 'What gets wetter the more it dries?', a: ['towel'] },
  { q: "What has hands but can't clap?", a: ['clock', 'watch'] },
  { q: 'I speak without a mouth and hear without ears. What am I?', a: ['echo'] },
  { q: 'What has a head and a tail but no body?', a: ['coin'] },
  { q: 'What has many teeth but cannot bite?', a: ['comb'] },
  { q: 'What building has the most stories?', a: ['library'] },
  { q: 'What is full of holes but still holds water?', a: ['sponge'] },
  { q: 'What can you break without ever touching it?', a: ['promise'] },
  { q: 'The more you take, the more you leave behind. What am I?', a: ['footsteps', 'footstep', 'steps'] },
  { q: 'What goes up but never comes down?', a: ['age'] },
  { q: 'What has a neck but no head?', a: ['bottle'] },
];
const TRUTHS = [
  "What's the most embarrassing thing you've done in public?",
  'What is a secret talent nobody knows you have?',
  "What's the last lie you told?",
  'Who was your first crush?',
  'What app do you spend the most time on?',
  "What's your biggest fear?",
  'What is the weirdest dream you remember?',
  "What's one thing you would change about yourself?",
  'Have you ever pretended to be sick to skip something?',
  'What is the silliest thing you are afraid of?',
];
const DARES = [
  'Send a voice note singing the chorus of your favourite song. 🎤',
  'Change your WhatsApp status to "I love broccoli" for one hour. 🥦',
  'Text the 5th person in your contacts "I miss you 😢" (then explain it is a dare).',
  'Talk in rhymes for the next 5 messages.',
  'Send your best dance move as a voice note description.',
  'Say the alphabet backwards in one voice note.',
  'Write a two-line poem about the person above you.',
  'Use only emojis for the next 3 minutes.',
  'Do 10 push-ups and report back. 💪',
  'Send a selfie with your funniest face. 😜',
];
const ROASTS = [
  "You're the human version of a loading screen — lots of waiting, no results. ⏳",
  "I'd roast you, but my mum told me not to burn trash. 🔥🗑️",
  'You bring everyone so much joy… when you leave the group chat. 🚪',
  "Your Wi-Fi password is probably 'password123' and your ideas look the same. 📶",
  "You're proof that even autocorrect gives up sometimes. ✏️",
  "If laziness was an Olympic sport, you'd send someone to compete for you. 🏅",
  'You have the energy of a phone at 1% — and no charger. 🔋',
  "You're not stupid, you just have bad luck thinking. 💭",
];
const COMPLIMENTS = [
  'You light up every chat you enter. ✨',
  'Your kindness is contagious. 💛',
  'You have a brilliant mind and a great sense of humour. 🧠😄',
  'The world is better with you in it. 🌍',
  'You make hard things look easy. 💪',
  'Your energy is unmatched. 🔥',
  'You are the kind of friend everybody needs. 🤝',
  'You are doing better than you think. 🌟',
];
const BALL = [
  'It is certain.', 'Without a doubt.', 'Yes — definitely.', 'You may rely on it.', 'Most likely.',
  'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
  'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.',
];

def('fun', 'joke', '😂', async (x) => x.reply(`😂 ${pick(JOKES)}`));
def('fun', 'quote', '💬', async (x) => x.reply(`💬 ${pick(QUOTES)}`));
def('fun', 'fact', '🧠', async (x) => x.reply(`🧠 *Did you know?*\n${pick(FACTS)}`));

def('fun', 'riddle', '🧩', async (x) => {
  const r = pick(RIDDLES);
  const { games } = await import('./core.js');
  games.set(x.jid, { type: 'riddle', ...r });
  await x.reply(`🧩 *Riddle*\n${r.q}\n\nAnswer with ${x.prefix}answer <your answer>\n(or ${x.prefix}answer alone to give up)`);
});

def('fun', 'truth', '🎯', async (x) => x.reply(`🎯 *Truth*\n${pick(TRUTHS)}`));
def('fun', 'dare', '🔥', async (x) => x.reply(`🔥 *Dare*\n${pick(DARES)}`));

def('fun', 'roast', '🍖', async (x) => {
  const t = x.target;
  await x.reply({ text: `🍖 ${t ? mention(t) + ' ' : ''}${pick(ROASTS)}\n\n(just joking 😄)`, mentions: t ? [t] : [] });
});

def('fun', 'compliment', '💐', async (x) => {
  const t = x.target;
  await x.reply({ text: `💐 ${t ? mention(t) + ' ' : ''}${pick(COMPLIMENTS)}`, mentions: t ? [t] : [] });
});

def('fun', '8ball', '🎱', async (x) => {
  if (!x.arg) return x.reply(`Usage: ${x.prefix}8ball <question>`);
  await x.reply(`🎱 *${x.arg}*\n${pick(BALL)}`);
});

def('fun', 'dice', '🎲', async (x) => {
  const n = Math.min(Math.max(parseInt(x.args[0]) || 1, 1), 10);
  const rolls = Array.from({ length: n }, () => rnd(6) + 1);
  await x.reply(`🎲 ${rolls.join(' • ')}${n > 1 ? `\nTotal: ${rolls.reduce((a, b) => a + b, 0)}` : ''}`);
});

def('fun', 'coin', '🪙', async (x) => x.reply(`🪙 ${rnd(2) ? 'Heads' : 'Tails'}!`));

def('fun', 'rps', '✂️', async (x) => {
  const map = { rock: '🪨', paper: '📄', scissors: '✂️' };
  const alias = { r: 'rock', p: 'paper', s: 'scissors' };
  const me = alias[x.args[0]?.toLowerCase()] || x.args[0]?.toLowerCase();
  if (!map[me]) return x.reply(`Usage: ${x.prefix}rps rock|paper|scissors`);
  const bot = pick(Object.keys(map));
  const win = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const res = me === bot ? "It's a draw 🤝" : win[me] === bot ? 'You win! 🎉' : 'I win! 😎';
  await x.reply(`✂️ You: ${map[me]} ${me}\n🤖 Me: ${map[bot]} ${bot}\n\n${res}`);
});

def('fun', 'slot', '🎰', async (x) => {
  const s = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '7️⃣'];
  const r = [pick(s), pick(s), pick(s)];
  const uniq = new Set(r).size;
  const res = uniq === 1 ? '🎉 JACKPOT!!!' : uniq === 2 ? '😃 Two of a kind — nice!' : '😢 No luck, try again.';
  await x.reply(`🎰 [ ${r.join(' | ')} ]\n${res}`);
});

const bar = (p) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));

def('fun', 'love', '💘', async (x) => {
  const names = x.arg.replace(/@\d+/g, '').split(/\s*[|&+]\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  let a; let b;
  if (x.mentioned.length >= 2) { a = mention(x.mentioned[0]); b = mention(x.mentioned[1]); }
  else if (names.length >= 2) { [a, b] = names; }
  else if (x.target) { a = x.pushName || mention(x.sender); b = mention(x.target); }
  else return x.reply(`Usage: ${x.prefix}love name1 | name2  (or tag someone)`);
  const p = Math.floor(hashRand([a, b].sort().join('+')) * 101);
  await x.reply({ text: `💘 *Love meter*\n${a} ❤️ ${b}\n\n[${bar(p)}] ${p}%`, mentions: x.mentioned });
});

def('fun', 'ship', '💞', async (x) => {
  let a; let b; let mentions = x.mentioned.slice(0, 2);
  if (mentions.length === 2) { a = mention(mentions[0]); b = mention(mentions[1]); }
  else if (x.isGroup) {
    const meta = await x.meta();
    const two = shuffle(meta.participants.map((p) => p.id)).slice(0, 2);
    if (two.length < 2) return x.reply('Not enough members to ship.');
    mentions = two; a = mention(two[0]); b = mention(two[1]);
  } else return x.reply(`Usage: ${x.prefix}ship @user1 @user2`);
  const p = Math.floor(hashRand([a, b].sort().join('+')) * 101);
  await x.reply({ text: `💞 *Ship of the day*\n${a} + ${b}\n\n[${bar(p)}] ${p}%\n${p > 75 ? 'Perfect match! 💍' : p > 40 ? 'There is potential 😉' : 'Just friends 😅'}`, mentions });
});

def('fun', 'rate', '⭐', async (x) => {
  const t = inputText(x);
  if (!t) return x.reply(`Usage: ${x.prefix}rate <anything>`);
  const n = Math.round(hashRand(t) * 10);
  await x.reply(`⭐ *${t}*\nRating: ${n}/10  ${'⭐'.repeat(n)}`);
});

def('fun', 'iq', '🎓', async (x) => {
  const t = x.target || x.senderJid;
  const iq = Math.floor(70 + hashRand(digits(t) + 'iq') * 90);
  await x.reply({ text: `🎓 ${mention(t)}'s IQ is *${iq}*\n(for fun only 😄)`, mentions: [t] });
});

def('fun', 'hack', '👨‍💻', async (x) => {
  const name = x.target ? mention(x.target) : x.arg || 'target';
  const steps = ['Initializing…', 'Bypassing firewall…', 'Injecting payload…', 'Cracking password…', 'Accessing database…', 'Extracting data…', 'Covering tracks…'];
  const mk = (i, label) => `👨‍💻 *Hacking ${name}* (just a prank)\n[${bar((i / steps.length) * 100)}] ${Math.round((i / steps.length) * 100)}%\n${label}`;
  const opts = (txt) => ({ text: txt, mentions: x.target ? [x.target] : [] });
  const sent = await x.reply(opts(mk(0, 'Starting…')));
  for (let i = 0; i < steps.length; i++) {
    await sleep(900);
    try { await x.sock.sendMessage(x.jid, { ...opts(mk(i + 1, steps[i])), edit: sent.key }); } catch {}
  }
  await sleep(700);
  await x.reply(opts(`✅ Hack complete! 😂\nJust kidding — nothing was accessed. This was a joke animation.`));
});

const hug = (emoji, verb) => async (x) => {
  const t = x.target;
  if (!t) return x.reply(`Tag or reply to someone: ${x.prefix}${verb.cmd} @user`);
  await x.reply({ text: `${emoji} ${mention(x.senderJid)} ${verb.text} ${mention(t)}!`, mentions: [x.senderJid, t] });
};
def('fun', '
