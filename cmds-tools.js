// ───────────── cmds-tools.js: TEXT TOOLS · UTILITY ─────────────
import crypto from 'crypto';
import * as C from './config.js';
import { data, save } from './store.js';
import {
  def, small, section, getApp, rnd, pick, shuffle, getSharp, inputText, fmtUptime,
} from './core.js';
import { digits, isViewOnce } from './util.js';

const need = (x, name, extra = '<text>') => x.reply(`Usage: ${x.prefix}${name} ${extra}\n(or reply to a message)`);

// ══════════════ TEXT TOOLS (16) ══════════════
def('text', 'reverse', '🔁', async (x) => { const t = inputText(x); if (!t) return need(x, 'reverse'); await x.reply([...t].reverse().join('')); });
def('text', 'upper', '🔠', async (x) => { const t = inputText(x); if (!t) return need(x, 'upper'); await x.reply(t.toUpperCase()); });
def('text', 'lower', '🔡', async (x) => { const t = inputText(x); if (!t) return need(x, 'lower'); await x.reply(t.toLowerCase()); });
def('text', 'mock', '🤪', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'mock');
  let i = 0;
  await x.reply([...t].map((c) => (/[a-z]/i.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(''));
});
def('text', 'repeat', '🔂', async (x) => {
  const n = parseInt(x.args[0]);
  const t = x.args.slice(1).join(' ') || x.quoted?.text;
  if (!n || !t) return x.reply(`Usage: ${x.prefix}repeat <times> <text>`);
  const times = Math.min(n, 20);
  const out = Array(times).fill(t).join('\n');
  await x.reply(out.length > 3000 ? out.slice(0, 3000) + '…' : out);
});
def('text', 'count', '🔢', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'count');
  await x.reply(section(`🔢 ${small('count')}`, [
    `✦ ${small('characters')} : ${[...t].length}`,
    `✦ ${small('no spaces')} : ${t.replace(/\s/g, '').length}`,
    `✦ ${small('words')} : ${t.trim().split(/\s+/).filter(Boolean).length}`,
    `✦ ${small('lines')} : ${t.split('\n').length}`,
    `✦ ${small('sentences')} : ${(t.match(/[.!?]+(\s|$)/g) || []).length || 1}`,
  ]));
});
def('text', 'b64', '🔐', async (x) => { const t = inputText(x); if (!t) return need(x, 'b64'); await x.reply(Buffer.from(t, 'utf8').toString('base64')); });
def('text', 'unb64', '🔓', async (x) => {
  const t = inputText(x).trim(); if (!t) return need(x, 'unb64', '<base64>');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(t)) return x.reply('❌ That is not valid Base64.');
  await x.reply(Buffer.from(t, 'base64').toString('utf8'));
});
def('text', 'binary', '💾', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'binary');
  await x.reply([...Buffer.from(t, 'utf8')].map((b) => b.toString(2).padStart(8, '0')).join(' '));
});
def('text', 'unbinary', '📟', async (x) => {
  const t = inputText(x).replace(/[^01]/g, ''); if (!t || t.length % 8) return x.reply(`Usage: ${x.prefix}unbinary <binary in 8-bit groups>`);
  await x.reply(Buffer.from(t.match(/.{8}/g).map((b) => parseInt(b, 2))).toString('utf8'));
});

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.', '@': '.--.-.', '-': '-....-',
};
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
def('text', 'morse', '📡', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'morse');
  await x.reply(t.toLowerCase().split(' ').map((w) => [...w].map((c) => MORSE[c] || '').filter(Boolean).join(' ')).join(' / '));
});
def('text', 'unmorse', '📶', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'unmorse', '<morse code>  (use / between words)');
  await x.reply(t.trim().split(/\s*\/\s*/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c] || '?').join('')).join(' '));
});
def('text', 'rot13', '🔄', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'rot13');
  await x.reply(t.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); }));
});
def('text', 'smallcaps', '✨', async (x) => { const t = inputText(x); if (!t) return need(x, 'smallcaps'); await x.reply(small(t)); });
def('text', 'clap', '👏', async (x) => { const t = inputText(x); if (!t) return need(x, 'clap'); await x.reply(t.trim().split(/\s+/).join(' 👏 ') + ' 👏'); });
def('text', 'shuffle', '🔀', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'shuffle');
  const words = t.trim().split(/\s+/);
  await x.reply(words.length > 1 ? shuffle(words).join(' ') : shuffle([...t]).join(''));
});

// ══════════════ UTILITY (18) ══════════════
// Safe math parser (no eval)
const FN = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin,
  acos: Math.acos, atan: Math.atan, log: Math.log10, log10: Math.log10, log2: Math.log2, ln: Math.log, exp: Math.exp,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow,
};
const CONST = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

export function calc(input) {
  const src = input.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!src) throw new Error('Empty expression');
  if (src.length > 200) throw new Error('Expression too long');
  let i = 0;
  const peek = () => src[i];
  const eat = (ch) => (src[i] === ch ? (i++, true) : false);

  function expr() {
    let v = term();
    for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; }
  }
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) v /= unary();
      else if (eat('%')) v %= unary();
      else return v;
    }
  }
  function unary() {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    return power();
  }
  function power() {
    const b = postfix();
    if (eat('^')) return b ** unary();
    if (src[i] === '*' && src[i + 1] === '*') { i += 2; return b ** unary(); }
    return b;
  }
  function postfix() {
    let v = primary();
    while (eat('!')) {
      if (v < 0 || v > 170 || !Number.isInteger(v)) throw new Error('Factorial needs an integer from 0 to 170');
      let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f;
    }
    return v;
  }
  function primary() {
    if (eat('(')) { const v = expr(); if (!eat(')')) throw new Error('Missing )'); return v; }
    const num = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = src.slice(i).match(/^[a-z][a-z0-9]*/);
    if (id) {
      i += id[0].length;
      const name = id[0];
      if (eat('(')) {
        const args = [];
        if (!eat(')')) { do { args.push(expr()); } while (eat(',')); if (!eat(')')) throw new Error('Missing )'); }
        if (!FN[name]) throw new Error(`Unknown function ${name}`);
        return FN[name](...args);
      }
      if (name in CONST) return CONST[name];
      throw new Error(`Unknown name ${name}`);
    }
    throw new Error(`Unexpected "${peek() ?? 'end'}"`);
  }
  const r = expr();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}"`);
  if (!Number.isFinite(r)) throw new Error('Result is not a finite number');
  return Number(r.toPrecision(12));
}

def('utility', 'calc', '🧮', async (x) => {
  const t = inputText(x); if (!t) return x.reply(`Usage: ${x.prefix}calc 12*(3+4)^2\nFunctions: sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, min, max, pow, !  Constants: pi, e`);
  try { await x.reply(`🧮 ${t}\n= *${calc(t)}*`); } catch (e) { await x.reply(`❌ ${e.message}`); }
});

def('utility', 'hash', '#️⃣', async (x) => {
  const algos = ['md5', 'sha1', 'sha256', 'sha512'];
  let algo = x.args[0]?.toLowerCase();
  let text;
  if (algos.includes(algo)) text = x.args.slice(1).join(' ') || x.quoted?.text;
  else { algo = null; text = inputText(x); }
  if (!text) return x.reply(`Usage: ${x.prefix}hash [md5|sha1|sha256|sha512] <text>`);
  const lines = (algo ? [algo] : algos.slice(0, 3)).map((a) => `✦ ${a} : ${crypto.createHash(a).update(text).digest('hex')}`);
  await x.reply(section(`#️⃣ ${small('hash')}`, lines));
});

def('utility', 'password', '🔑', async (x) => {
  const len = Math.min(Math.max(parseInt(x.args[0]) || 16, 8), 64);
  const sets = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '!@#$%^&*()-_=+?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  await x.reply(`🔑 ${shuffle(chars).join('')}\n\n(${len} characters — generated locally, never stored)`);
});

def('utility', 'uuid', '🆔', async (x) => x.reply(`🆔 ${crypto.randomUUID()}`));

def('utility', 'random', '🎯', async (x) => {
  let [a, b] = x.args.map(Number);
  if (Number.isNaN(a)) { a = 1; b = 100; } else if (Number.isNaN(b)) { b = a; a = 1; }
  if (a > b) [a, b] = [b, a];
  await x.reply(`🎯 ${a} – ${b}: *${a + rnd(b - a + 1)}*`);
});

def('utility', 'pick', '👆', async (x) => {
  const t = inputText(x);
  const opts = t.split(/\s*[|,]\s*/).map((s) => s.trim()).filter(Boolean);
  if (opts.length < 2) return x.reply(`Usage: ${x.prefix}pick pizza | rice | burger`);
  await x.reply(`👆 I pick: *${pick(opts)}*`);
});

def('utility', 'unix', '🕰️', async (x) => {
  const a = x.arg.trim();
  let d;
  if (!a) d = new Date();
  else if (/^\d+$/.test(a)) d = new Date(a.length > 11 ? Number(a) : Number(a) * 1000);
  else d = new Date(a);
  if (Number.isNaN(d.getTime())) return x.reply(`Usage: ${x.prefix}unix [timestamp | date]`);
  await x.reply(section(`🕰️ ${small('unix time')}`, [
    `✦ ${small('seconds')} : ${Math.floor(d.getTime() / 1000)}`,
    `✦ ${small('millis')} : ${d.getTime()}`,
    `✦ utc : ${d.toISOString()}`,
    `✦ lagos : ${d.toLocaleString('en-GB', { timeZone: C.TIMEZONE, hour12: false })}`,
  ]));
});

def('utility', 'json', '🧾', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'json', '<json>');
  try { await x.reply('```' + JSON.stringify(JSON.parse(t), null, 2) + '```'); } catch (e) { await x.reply(`❌ Invalid JSON: ${e.message}`); }
});

def('utility', 'urlenc', '🔗', async (x) => { const t = inputText(x); if (!t) return need(x, 'urlenc'); await x.reply(encodeURIComponent(t)); });
def('utility', 'urldec', '🌐', async (x) => {
  const t = inputText(x); if (!t) return need(x, 'urldec');
  try { await x.reply(decodeURIComponent(t)); } catch { await x.reply('❌ Invalid URL-encoded text.'); }
});

const NAMED = { red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080', cyan: '#00ffff', magenta: '#ff00ff', brown: '#a52a2a', gold: '#ffd700', teal: '#008080', navy: '#000080' };
function parseColor(s) {
  s = s.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  m = s.match(/^(?:rgb\()?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/);
  if (m) { const v = [m[1], m[2], m[3]].map(Number); if (v.every((n) => n <= 255)) return v; }
  return null;
}
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  let h = 0; let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
def('utility', 'color', '🎨', async (x) => {
  const rgb = parseColor(x.arg);
  if (!rgb) return x.reply(`Usage: ${x.prefix}color #ff8800  |  ${x.prefix}color 255 136 0  |  ${x.prefix}color blue`);
  const hex = '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
  const [h, s, l] = toHsl(rgb);
  const caption = section(`🎨 ${small('color')}`, [`✦ hex : ${hex}`, `✦ rgb : ${rgb.join(', ')}`, `✦ hsl : ${h}°, ${s}%, ${l}%`]);
  const sharp = await getSharp();
  if (sharp) {
    const img = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
    return x.reply({ image: img, caption });
  }
  await x.reply(caption);
});

def('utility', 'bmi', '⚖️', async (x) => {
  const w = parseFloat(x.args[0]); let h = parseFloat(x.args[1]);
  if (!w || !h) return x.reply(`Usage: ${x.prefix}bmi <weight kg> <height cm>\nExample: ${x.prefix}bmi 70 175`);
  if (h > 3) h /= 100;
  const bmi = w / (h * h);
  const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight ✅' : bmi < 30 ? 'Overweight' : 'Obese';
  await x.reply(`⚖️ BMI: *${bmi.toFixed(1)}*\nCategory: ${cat}\n\n(A general guide only — not medical advice.)`);
});

def('utility', 'age', '🎂', async (x) => {
  const a = x.arg.trim();
  let d;
  let m = a.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  else if ((m = a.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (!d || Number.isNaN(d.getTime()) || d > new Date()) return x.reply(`Usage: ${x.prefix}age <YYYY-MM-DD>  or  <DD/MM/YYYY>`);
  const now = new Date();
  let y = now.getUTCFullYear() - d.getUTCFullYear();
  let mo = now.getUTCMonth() - d.getUTCMonth();
  let da = now.getUTCDate() - d.getUTCDate();
  if (da < 0) { mo--; da += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate(); }
  if (mo < 0) { y--; mo += 12; }
  let next = new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (next < now) next = new Date(Date.UTC(now.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  const days = Math.ceil((next - now) / 86400000);
  await x.reply(`🎂 You are *${y} years, ${mo} months, ${da} days* old.\n🎉 Next birthday in ${days} day${days === 1 ? '' : 's'}!`);
});

// ── reminders ──
const MAX_DELAY = 2 ** 31 - 1;
function schedule(r) {
  const wait = r.at - Date.now();
  if (wait > MAX_DELAY) return setTimeout(() => schedule(r), MAX_DELAY);
  setTimeout(async () => {
    data.reminders = data.reminders.filter((q) => q !== r);
    save();
    try {
      const sock = getApp()?.getSock(r.sid) || getApp()?.getSock();
      const jid = `${r.num}@s.whatsapp.net`;
      await sock?.sendMessage(r.jid, { text: `⏰ *Reminder* @${r.num}\n${r.text}`, mentions: [jid] });
    } catch (e) { console.error('Reminder failed:', e.message); }
  }, Math.max(wait, 0));
}
export const rescheduleReminders = () => data.reminders.forEach(schedule);

def('utility', 'remind', '⏰', async (x) => {
  const toks = [...x.args];
  let ms = 0; let used = 0;
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  while (toks.length) {
    const m = toks[0].toLowerCase().match(/^(\d+)([smhd])$/);
    if (!m) break;
    ms += +m[1] * unit[m[2]]; used++; toks.shift();
  }
  if (!used || ms < 1000) return x.reply(`Usage: ${x.prefix}remind <time> <message>\nExamples: ${x.prefix}remind 10m call mum  •  ${x.prefix}remind 1h30m take medicine`);
  if (ms > 7 * 864e5) return x.reply('❌ Maximum reminder time is 7 days.');
  const r = { at: Date.now() + ms, jid: x.jid, num: x.sender, text: toks.join(' ') || "Time's up!", sid: x.session?.id };
  data.reminders.push(r); save(); schedule(r);
  await x.reply(`⏰ Okay! I will remind you in ${fmtUptime(ms).replace(/^0d /, '').replace(/^0h /, '')}.`);
});

def('utility', 'temp', '🌡️', async (x) => {
  const m = x.arg.replace(/°/g, '').trim().toLowerCase().match(/^(-?\d+(?:\.\d+)?)\s*([cfk])$/);
  if (!m) return x.reply(`Usage: ${x.prefix}temp 30 c   (units: c, f, k)`);
  const v = parseFloat(m[1]);
  const c = m[2] === 'c' ? v : m[2] === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
  await x.reply(section(`🌡️ ${small('temperature')}`, [`✦ °C : ${c.toFixed(2)}`, `✦ °F : ${(c * 9 / 5 + 32).toFixed(2)}`, `✦ K : ${(c + 273.15).toFixed(2)}`]));
});

def('utility', 'factorial', '❗', async (x) => {
  const n = parseInt(x.args[0]);
  if (Number.isNaN(n) || n < 0 || n > 1000) return x.reply(`Usage: ${x.prefix}factorial <0-1000>`);
  let f = 1n; for (let i = 2n; i <= BigInt(n); i++) f *= i;
  const s = f.toString();
  await x.reply(`❗ ${n}! = ${s.length > 900 ? `${s.slice(0, 20)}… (${s.length} digits)` : s}`);
});

// BigInt Miller-Rabin
const modpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; } return r; };
function isPrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false; }
  let d = n - 1n; let s = 0; while (d % 2n === 0n) { d /= 2n; s++; }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}
def('utility', 'prime', '🔢', async (x) => {
  if (!/^\d{1,24}$/.test(x.args[0] || '')) return x.reply(`Usage: ${x.prefix}prime <number up to 24 digits>`);
  const n = BigInt(x.args[0]);
  const lines = [`✦ ${small('number')} : ${n}`, `✦ ${small('prime')} : ${isPrime(n) ? 'Yes ✅' : 'No ❌'}`];
  if (!isPrime(n) && n > 3n && n <= 10n ** 12n) {
    let v = Number(n); const f = [];
    for (let p = 2; p * p <= v; p++) while (v % p === 0) { f.push(p); v /= p; }
    if (v > 1) f.push(v);
    lines.push(`✦ ${small('factors')} : ${f.join(' × ')}`);
  }
  let nx = n + 1n; for (let i = 0; i < 5000 && !isPrime(nx); i++) nx++;
  lines.push(`✦ ${small('next prime')} : ${nx}`);
  await x.reply(section(`🔢 ${small('prime check')}`, lines));
});

// View-once reveal — owner only, and the media is sent to the owner's own chat only
def('utility', 'vv2', '👁️', { owner: true }, async (x) => {
  if (!x.quoted || !isViewOnce(x.quoted.raw)) return x.reply(`Reply to a view-once message with ${x.prefix}vv2`);
  const msg = x.quoted.msg;
  const kind = ['imageMessage', 'videoMessage', 'audioMessage'].find((k) => msg?.[k]);
  if (!kind) return x.reply('❌ That view-once message has no media I can open.');
  const buf = await getApp().download(x.sock, { key: { remoteJid: x.jid, id: x.quoted.id, participant: x.quoted.participant }, message: msg });
  const me = `${digits(x.sock.user?.id)}@s.whatsapp.net`;
  const caption = msg[kind].caption || '';
  const content = kind === 'imageMessage' ? { image: buf, caption }
    : kind === 'videoMessage' ? { video: buf, caption }
      : { audio: buf, mimetype: 'audio/mpeg', ptt: !!msg[kind].ptt };
  await x.sock.sendMessage(me, content);
  if (x.jid !== me) await x.reply('👁️ Sent to your own chat.');
});
