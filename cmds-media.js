// ───────────── cmds-media.js: MUSIC · GAMES · INFO · IMAGE ─────────────
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import * as C from './config.js';
import { data, save } from './store.js';
import {
  def, small, section, getApp, rnd, pick, shuffle, fetchJSON, fetchText, fetchBuf, getSharp, games,
} from './core.js';
import { digits } from './util.js';

const mention = (j) => '@' + digits(j);

// ══════════════ MUSIC (6) — powered by Audius (free, legal streaming API) ══════════════
let audiusBase = null;
async function audius(p) {
  const sep = p.includes('?') ? '&' : '?';
  const bases = audiusBase ? [audiusBase] : ['https://api.audius.co', 'https://discoveryprovider.audius.co'];
  for (const b of bases) {
    try {
      const j = await fetchJSON(`${b}${p}${sep}app_name=MERLINEXE`, {}, 15000);
      audiusBase = b;
      return j;
    } catch {}
  }
  audiusBase = null;
  throw new Error('Audius is not reachable right now, try again later.');
}
const lastList = new Map(); // chat -> last listed tracks
const dur = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;
const trackLine = (t, i) => `${i + 1}. ${t.title} — ${t.user?.name || 'Unknown'} (${dur(t.duration)})`;
const mini = (t) => ({ id: t.id, title: t.title, artist: t.user?.name || 'Unknown' });

async function search(q, n = 8) {
  const j = await audius(`/v1/tracks/search?query=${encodeURIComponent(q)}&limit=${n}`);
  return (j.data || []).filter((t) => t.is_streamable !== false);
}

async function sendTrack(x, t) {
  const base = audiusBase || 'https://api.audius.co';
  await x.reply(`🎵 *${t.title}*\n👤 ${t.artist || t.user?.name || 'Unknown'}\n⏳ Downloading…`);
  const buf = await fetchBuf(`${base}/v1/tracks/${t.id}/stream?app_name=MERLINEXE`, 90000);
  if (buf.length > 16 * 1024 * 1024) throw new Error('That track is too large to send (over 16 MB).');
  await x.send({ audio: buf, mimetype: 'audio/mpeg', fileName: `${t.title}.mp3` });
}

def('music', 'music', '🎶', async (x) => {
  if (!x.arg) return x.reply(`Usage: ${x.prefix}music <song or artist>`);
  const list = await search(x.arg);
  if (!list.length) return x.reply('❌ Nothing found. Try different words.');
  lastList.set(x.jid, list.map(mini));
  await x.reply(section(`🎶 ${small('results')}`, list.map(trackLine)) + `\n\nPlay one with ${x.prefix}play <number>`);
});

def('music', 'audius', '🎧', async (x) => {
  const j = await audius('/v1/tracks/trending?limit=10');
  const list = (j.data || []).slice(0, 10);
  if (!list.length) return x.reply('❌ Could not load trending tracks.');
  lastList.set(x.jid, list.map(mini));
  await x.reply(section(`🎧 ${small('trending on audius')}`, list.map(trackLine)) + `\n\nPlay one with ${x.prefix}play <number>`);
});

def('music', 'play', '🎵', async (x) => {
  const a = x.arg.trim();
  if (!a) return x.reply(`Usage: ${x.prefix}play <song name>\nOr ${x.prefix}play <number> after ${x.prefix}music, or ${x.prefix}play #<number> for your library.`);
  let t;
  if (/^#\d+$/.test(a)) {
    t = (data.library[x.sender] || [])[parseInt(a.slice(1)) - 1];
    if (!t) return x.reply('❌ No such song in your library.');
  } else if (/^\d{1,2}$/.test(a) && lastList.get(x.jid)?.[parseInt(a) - 1]) {
    t = lastList.get(x.jid)[parseInt(a) - 1];
  } else {
    const list = await search(a, 3);
    if (!list.length) return x.reply('❌ Nothing found. Try different words.');
    t = mini(list[0]);
  }
  await sendTrack(x, t);
});

def('music', 'addsong', '💿', async (x) => {
  const a = x.arg.trim();
  let t;
  if (/^\d{1,2}$/.test(a) && lastList.get(x.jid)?.[parseInt(a) - 1]) t = lastList.get(x.jid)[parseInt(a) - 1];
  else if (a) { const l = await search(a, 1); if (l[0]) t = mini(l[0]); }
  else return x.reply(`Usage: ${x.prefix}addsong <song name>  (or a number from ${x.prefix}music)`);
  if (!t) return x.reply('❌ Nothing found.');
  const lib = (data.library[x.sender] ||= []);
  if (lib.some((s) => s.id === t.id)) return x.reply('ℹ️ That song is already in your library.');
  if (lib.length >= 30) return x.reply('❌ Your library is full (30 songs). Remove one with .delsong');
  lib.push(t);
  save();
  await x.reply(`💿 Added: *${t.title}* — ${t.artist}\nPlay it with ${x.prefix}play #${lib.length}`);
});

def('music', 'library', '🗂️', async (x) => {
  const lib = data.library[x.sender] || [];
  if (!lib.length) return x.reply(`🗂️ Your library is empty. Add songs with ${x.prefix}addsong <song name>`);
  await x.reply(section(`🗂️ ${small('your library')}`, lib.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}`)) + `\n\nPlay with ${x.prefix}play #<number>`);
});

def('music', 'delsong', '🗑️', async (x) => {
  const n = parseInt(x.args[0]);
  const lib = data.library[x.sender] || [];
  if (!n || !lib[n - 1]) return x.reply(`Usage: ${x.prefix}delsong <number>  (see ${x.prefix}library)`);
  const [gone] = lib.splice(n - 1, 1);
  save();
  await x.reply(`🗑️ Removed: ${gone.title}`);
});

// ══════════════ GAMES (7) ══════════════
const LOCAL_TRIVIA = [
  { q: 'What is the capital of Nigeria?', c: 'Abuja', w: ['Lagos', 'Kano', 'Ibadan'] },
  { q: 'Which planet is known as the Red Planet?', c: 'Mars', w: ['Venus', 'Jupiter', 'Mercury'] },
  { q: 'How many continents are there?', c: '7', w: ['5', '6', '8'] },
  { q: 'What does HTML stand for?', c: 'HyperText Markup Language', w: ['HighText Machine Language', 'Hyperlink Text Mode Language', 'Home Tool Markup Language'] },
  { q: 'Who wrote "Things Fall Apart"?', c: 'Chinua Achebe', w: ['Wole Soyinka', 'Chimamanda Adichie', 'Ben Okri'] },
  { q: 'What is the largest ocean on Earth?', c: 'Pacific Ocean', w: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'] },
  { q: 'Which language runs in a web browser?', c: 'JavaScript', w: ['Python', 'C++', 'Rust'] },
  { q: 'What is 12 × 12?', c: '144', w: ['124', '134', '154'] },
];
const WORDS = [
  'javascript', 'python', 'server', 'network', 'keyboard', 'database', 'whatsapp', 'android', 'security', 'hacker',
  'algorithm', 'browser', 'internet', 'function', 'variable', 'terminal', 'encryption', 'developer', 'compiler', 'firewall',
  'lagos', 'nigeria', 'africa', 'football', 'guitar', 'planet', 'rainbow', 'elephant', 'pyramid', 'mountain',
];
const LETTERS = ['A', 'B', 'C', 'D'];

const canStart = (x, type) => {
  const g = games.get(x.jid);
  if (!g) return true;
  const soft = ['trivia', 'riddle'];
  return g.type === type || (soft.includes(g.type) && soft.includes(type));
};
const busy = (x) => x.reply(`⚠️ A game is already running here. Finish it or use ${x.prefix}endgame.`);

def('games', 'trivia', '❓', async (x) => {
  if (!canStart(x, 'trivia')) return busy(x);
  let q;
  try {
    const j = await fetchJSON('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986', {}, 10000);
    const r = j.results[0];
    q = { q: decodeURIComponent(r.question), c: decodeURIComponent(r.correct_answer), w: r.incorrect_answers.map(decodeURIComponent) };
  } catch {
    q = pick(LOCAL_TRIVIA);
  }
  const options = shuffle([q.c, ...q.w]);
  games.set(x.jid, { type: 'trivia', answer: q.c, options });
  await x.reply(`❓ *Trivia*\n${q.q}\n\n${options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')}\n\nAnswer with ${x.prefix}answer A/B/C/D`);
});

def('games', 'answer', '✅', async (x) => {
  const g = games.get(x.jid);
  if (!g || !['trivia', 'riddle'].includes(g.type)) return x.reply(`No trivia or riddle is running. Start one with ${x.prefix}trivia or ${x.prefix}riddle`);
  const a = x.arg.trim().toLowerCase();
  if (g.type === 'riddle') {
    if (!a) { games.delete(x.jid); return x.reply(`😅 The answer was: *${g.a[0]}*`); }
    if (g.a.some((ans) => a.includes(ans))) { games.delete(x.jid); return x.reply({ text: `🎉 ${mention(x.senderJid)} got it! The answer is *${g.a[0]}*`, mentions: [x.senderJid] }); }
    return x.reply('❌ Not quite, try again!');
  }
  if (!a) return x.reply(`Usage: ${x.prefix}answer A/B/C/D`);
  const idx = LETTERS.findIndex((l) => l.toLowerCase() === a);
  const given = idx >= 0 ? g.options[idx] : x.arg.trim();
  if (given.toLowerCase() === g.answer.toLowerCase()) {
    games.delete(x.jid);
    return x.reply({ text: `🎉 ${mention(x.senderJid)} is correct! *${g.answer}*`, mentions: [x.senderJid] });
  }
  await x.reply('❌ Wrong answer, try again!');
});

const HANG = ['😀', '🙂', '😐', '😟', '😨', '😱', '💀'];
const hangText = (g) => {
  const shown = [...g.word].map((ch) => (g.guessed.has(ch) ? ch : '_')).join(' ');
  return `🔤 *Hangman*\n${shown}\n\n${HANG[6 - g.lives]} Lives: ${'❤️'.repeat(g.lives)}${'🖤'.repeat(6 - g.lives)}\nGuessed: ${[...g.guessed].join(' ') || '—'}`;
};

def('games', 'hangman', '🔤', async (x) => {
  let g = games.get(x.jid);
  const a = x.arg.trim().toLowerCase();
  if (g && g.type !== 'hangman') return busy(x);
  if (!g) {
    g = { type: 'hangman', word: pick(WORDS), guessed: new Set(), lives: 6 };
    games.set(x.jid, g);
    return x.reply(`${hangText(g)}\n\nGuess with ${x.prefix}hangman <letter>`);
  }
  if (!a) return x.reply(hangText(g));
  if (a.length > 1) {
    if (a === g.word) { games.delete(x.jid); return x.reply(`🎉 Correct! The word was *${g.word}*`); }
    g.lives--;
  } else if (/^[a-z]$/.test(a)) {
    if (g.guessed.has(a)) return x.reply('You already guessed that letter.');
    g.guessed.add(a);
    if (!g.word.includes(a)) g.lives--;
  } else return x.reply('Send a single letter or the whole word.');
  if ([...g.word].every((ch) => g.guessed.has(ch))) { games.delete(x.jid); return x.reply(`🎉 You win! The word was *${g.word}*`); }
  if (g.lives <= 0) { games.delete(x.jid); return x.reply(`💀 Game over! The word was *${g.word}*`); }
  await x.reply(hangText(g));
});

def('games', 'guess', '🔡', async (x) => {
  let g = games.get(x.jid);
  if (g && g.type !== 'guess') return busy(x);
  if (!g) {
    games.set(x.jid, { type: 'guess', n: rnd(100) + 1, tries: 0 });
    return x.reply(`🔡 *Number guess*\nI'm thinking of a number from 1 to 100. You have 7 tries!\nGuess with ${x.prefix}guess <number>`);
  }
  const n = parseInt(x.args[0]);
  if (!n) return x.reply(`Guess with ${x.prefix}guess <number>`);
  g.tries++;
  if (n === g.n) { games.delete(x.jid); return x.reply({ text: `🎉 ${mention(x.senderJid)} got it in ${g.tries} tries! The number was *${g.n}*`, mentions: [x.senderJid] }); }
  if (g.tries >= 7) { games.delete(x.jid); return x.reply(`😢 Out of tries! The number was *${g.n}*`); }
  await x.reply(`${n < g.n ? '📈 Higher!' : '📉 Lower!'}  (${7 - g.tries} tries left)`);
});

// ── Tic-Tac-Toe ──
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const board = (b) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => { const v = b[r * 3 + c]; return v === 'X' ? '❌' : v === 'O' ? '⭕' : NUM[r * 3 + c]; }).join('')).join('\n');
const winner = (b) => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
};
function botMove(b) {
  const find = (s) => {
    for (const L of LINES) {
      const v = L.map((i) => b[i]);
      if (v.filter((q) => q === s).length === 2 && v.includes(null)) return L[v.indexOf(null)];
    }
    return -1;
  };
  let m = find('O'); if (m < 0) m = find('X');
  if (m < 0 && !b[4]) m = 4;
  if (m < 0) { const corners = [0, 2, 6, 8].filter((i) => !b[i]); if (corners.length) m = pick(corners); }
  if (m < 0) m = pick(b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0));
  return m;
}

def('games', 'ttt', '❎', async (x) => {
  if (games.get(x.jid)) return busy(x);
  const opp = x.target && digits(x.target) !== x.sender ? x.target : null;
  const g = { type: 'ttt', b: Array(9).fill(null), X: x.sender, O: opp ? digits(opp) : 'bot', turn: 'X' };
  games.set(x.jid, g);
  await x.reply({
    text: `❎ *Tic-Tac-Toe*\n${mention(x.senderJid)} (❌) vs ${opp ? mention(opp) : 'Bot'} (⭕)\n\n${board(g.b)}\n\n${mention(x.senderJid)}'s turn — use ${x.prefix}move <1-9>`,
    mentions: opp ? [x.senderJid, opp] : [x.senderJid],
  });
});

def('games', 'move', '🕹️', async (x) => {
  const g = games.get(x.jid);
  if (!g || g.type !== 'ttt') return x.reply(`No Tic-Tac-Toe game here. Start with ${x.prefix}ttt`);
  if (g[g.turn] !== x.sender) return x.reply("⏳ It's not your turn.");
  const n = parseInt(x.args[0]);
  if (!(n >= 1 && n <= 9) || g.b[n - 1]) return x.reply('❌ Pick a free square from 1 to 9.');
  g.b[n - 1] = g.turn;
  let w = winner(g.b);
  if (!w) {
    g.turn = g.turn === 'X' ? 'O' : 'X';
    if (g[g.turn] === 'bot') { g.b[botMove(g.b)] = 'O'; w = winner(g.b); g.turn = 'X'; }
  }
  if (w) {
    games.delete(x.jid);
    const msg = w === 'draw' ? "🤝 It's a draw!" : g[w] === 'bot' ? '🤖 I win! 😎' : `🎉 ${'@' + g[w]} wins!`;
    return x.reply({ text: `${board(g.b)}\n\n${msg}`, mentions: g[w] && g[w] !== 'bot' ? [`${g[w]}@s.whatsapp.net`] : [] });
  }
  await x.reply({ text: `${board(g.b)}\n\n${g[g.turn] === 'bot' ? 'My turn' : '@' + g[g.turn] + "'s turn"} (${g.turn === 'X' ? '❌' : '⭕'})`, mentions: g[g.turn] !== 'bot' ? [`${g[g.turn]}@s.whatsapp.net`] : [] });
});

def('games', 'endgame', '🛑', async (x) => {
  if (!games.get(x.jid)) return x.reply('There is no game to end.');
  games.delete(x.jid);
  await x.reply('🛑 Game ended.');
});

// ══════════════ INFO (4) ══════════════
const WCODE = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Thunderstorm + hail', '⛈️'],
};

def('info', 'weather', '🌤️', async (x) => {
  const city = x.arg || 'Lagos';
  const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const p = g.results?.[0];
  if (!p) return x.reply(`❌ I could not find "${city}".`);
  const w = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`);
  const c = w.current;
  const [desc, icon] = WCODE[c.weather_code] || ['Unknown', '🌡️'];
  await x.reply(section(`${icon} ${small('weather')}`, [
    `✦ ${small('place')} : ${p.name}, ${p.country || ''}`,
    `✦ ${small('sky')} : ${desc}`,
    `✦ ${small('temp')} : ${c.temperature_2m}°C (feels ${c.apparent_temperature}°C)`,
    `✦ ${small('humidity')} : ${c.relative_humidity_2m}%`,
    `✦ ${small('wind')} : ${c.wind_speed_10m} km/h`,
  ]));
});

const FEEDS = {
  top: 'https://feeds.bbci.co.uk/news/rss.xml',
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  africa: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
  tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  science: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  health: 'https://feeds.bbci.co.uk/news/health/rss.xml',
  sports: 'https://feeds.bbci.co.uk/sport/rss.xml',
  entertainment: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
};
const unent = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

def('info', 'news', '📰', async (x) => {
  const topic = (x.args[0] || 'top').toLowerCase();
  const url = FEEDS[topic];
  if (!url) return x.reply(`📰 Topics: ${Object.keys(FEEDS).join(', ')}\nExample: ${x.prefix}news africa`);
  const xml = await fetchText(url);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map((m) => ({
    t: unent((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''),
    l: unent((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').split('?')[0],
  }));
  if (!items.length) return x.reply('❌ Could not load the news right now.');
  await x.reply(section(`📰 ${small('news')} • ${topic}`, items.map((i, n) => `${n + 1}. ${i.t}\n│ ${i.l}`)));
});

const COINS = {
  btc: 'bitcoin', eth: 'ethereum', bnb: 'binancecoin', sol: 'solana', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin',
  usdt: 'tether', ton: 'the-open-network', ltc: 'litecoin', trx: 'tron', dot: 'polkadot', shib: 'shiba-inu', avax: 'avalanche-2',
};
const money = (n) => (n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toPrecision(3));

def('info', 'crypto', '🪙', async (x) => {
  const wanted = (x.args.length ? x.args : ['btc', 'eth', 'bnb', 'sol', 'xrp']).slice(0, 8).map((s) => s.toLowerCase());
  const ids = wanted.map((s) => COINS[s] || s);
  const j = await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd,ngn&include_24hr_change=true`);
  const lines = [];
  wanted.forEach((w, i) => {
    const d = j[ids[i]];
    if (!d) return lines.push(`${w.toUpperCase()} : not found`);
    const ch = d.usd_24h_change;
    lines.push(`${w.toUpperCase()} : $${money(d.usd)} • ₦${money(d.ngn)} ${ch >= 0 ? '🟢' : '🔴'} ${ch?.toFixed(1)}%`);
  });
  await x.reply(section(`🪙 ${small('crypto')}`, lines));
});

def('info', 'currency', '💱', async (x) => {
  let [a, from, to] = x.args;
  let amount = parseFloat(a);
  if (Number.isNaN(amount)) { to = from; from = a; amount = 1; }
  if (!from || !to) return x.reply(`Usage: ${x.prefix}currency <amount> <from> <to>\nExample: ${x.prefix}currency 100 usd ngn`);
  from = from.toUpperCase(); to = to.toUpperCase();
  const j = await fetchJSON(`https://open.er-api.com/v6/latest/${from}`);
  const rate = j.rates?.[to];
  if (!rate) return x.reply('❌ Unknown currency code.');
  await x.reply(`💱 ${amount.toLocaleString('en-US')} ${from} = *${(amount * rate).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to}*\nRate: 1 ${from} = ${rate} ${to}`);
});

// ══════════════ IMAGE (2) ══════════════
function findMedia(x, kinds) {
  const cands = [{ msg: x.content, key: x.m.key }];
  if (x.quoted) cands.push({ msg: x.quoted.msg, key: { remoteJid: x.jid, id: x.quoted.id, participant: x.quoted.participant } });
  for (const c of cands) {
    if (!c.msg) continue;
    for (const k of kinds) if (c.msg[k]) return { msgLike: { key: c.key, message: c.msg }, kind: k, node: c.msg[k] };
  }
  return null;
}

const hasFfmpeg = () => new Promise((res) => {
  const p = spawn('ffmpeg', ['-version']);
  p.on('error', () => res(false));
  p.on('exit', (c) => res(c === 0));
});

async function videoToWebp(buf) {
  const id = `${Date.now()}${rnd(1000)}`;
  const inp = path.join(os.tmpdir(), `in-${id}.mp4`);
  const out = path.join(os.tmpdir(), `out-${id}.webp`);
  fs.writeFileSync(inp, buf);
  try {
    await new Promise((res, rej) => {
      const p = spawn('ffmpeg', ['-y', '-i', inp, '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000', '-t', '6', '-loop', '0', '-an', '-c:v', 'libwebp', '-quality', '55', out]);
      const t = setTimeout(() => { p.kill('SIGKILL'); rej(new Error('Conversion timed out')); }, 60000);
      p.on('error', rej);
      p.on('exit', (c) => { clearTimeout(t); c === 0 ? res() : rej(new Error('ffmpeg failed')); });
    });
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(inp, { force: true });
    fs.rmSync(out, { force: true });
  }
}

def('image', 'sticker', '🎨', { alias: ['s'] }, async (x) => {
  const f = findMedia(x, ['imageMessage', 'videoMessage', 'stickerMessage']);
  if (!f) return x.reply(`Reply to an image (or send one with the caption ${x.prefix}sticker).`);
  const buf = await getApp().download(x.
