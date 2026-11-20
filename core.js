// ───────────── core.js ─────────────
// Command registry, shared helpers, menu builder and command runner.
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as C from './config.js';
import { data } from './store.js';
import { askAI } from './ai.js';
import { digits, sleep, chunk } from './util.js';

export const { small, section } = C;
export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const startedAt = Date.now();
export const stats = { messages: 0, commands: 0 };

// The app object is provided by index.js (sessions, pairing, restart, media download…)
let app = null;
export const setApp = (a) => { app = a; };
export const getApp = () => app;

// ── tiny helpers ──
export const rnd = (n) => crypto.randomInt(n);
export const pick = (a) => a[rnd(a.length)];
export const shuffle = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};
export const hashRand = (s) =>
  crypto.createHash('sha256').update(String(s).toLowerCase()).digest().readUInt32BE(0) / 0xffffffff;

export function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}
export const uptime = () => fmtUptime(Date.now() - startedAt);

export async function fetchRaw(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (MerlinExeBot)', ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(t);
  }
}
export const fetchJSON = async (u, o, ms) => (await fetchRaw(u, o, ms)).json();
export const fetchText = async (u, o, ms) => (await fetchRaw(u, o, ms)).text();
export const fetchBuf = async (u, ms = 60000) => Buffer.from(await (await fetchRaw(u, {}, ms)).arrayBuffer());

let _sharp;
export async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try { _sharp = (await import('sharp')).default; } catch { _sharp = null; }
  return _sharp;
}

export const inputText = (x) => x.arg || x.quoted?.text || '';

// ── command registry ──
export const CATS = [
  ['general', '📌', 'general'],
  ['ai', '🤖', 'ai'],
  ['fun', '🎉', 'fun'],
  ['music', '🎵', 'music'],
  ['games', '🎮', 'games'],
  ['info', '🌍', 'info'],
  ['image', '🖼️', 'image'],
  ['text', '🔤', 'text tools'],
  ['utility', '🧰', 'utility'],
  ['group', '👥', 'group'],
  ['owner', '🔐', 'owner'],
];
export const registry = new Map();
export const order = [];

export function def(cat, name, emoji, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const c = { cat, name, emoji, fn, ...opts };
  registry.set(name, c);
  for (const a of opts.alias || []) registry.set(a, c);
  order.push(c);
}

// ── menu ──
export function menuText(x) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: C.TIMEZONE }).format(new Date())) % 24;
  const greet = hour < 12 ? 'Good morning ☀️' : hour < 17 ? 'Good afternoon 🌤️' : hour < 21 ? 'Good evening 🌆' : 'Good night 🌙';
  const s = data.settings;
  const info = section(`👑 ${small('bot info')}`, [
    `✦ ${small('owner')} : ${C.CREATOR_NAME}`,
    `✦ ${small('prefix')} : ${s.prefix}`,
    `✦ ${small('mode')} : ${s.mode}`,
    `✦ ${small('ai reply')} : ${s.autoReply ? 'ON' : 'OFF'}`,
    `✦ ${small('commands')} : ${order.length}`,
    `✦ ${small('status')} : Online 🟢`,
    `✦ ${small('uptime')} : ${uptime()}`,
  ]);
  const blocks = [C.HEADER, `👋 𝗛𝗲𝗹𝗹𝗼 ${x?.pushName || 'there'}!  ${greet}`, info];
  for (const [id, emoji, title] of CATS) {
    const list = order.filter((c) => c.cat === id);
    if (!list.length) continue;
    blocks.push(section(`${emoji} ${small(title)} (${list.length})`, list.map((c) => `${c.emoji} ${s.prefix}${c.name}`)));
  }
  blocks.push(C.FOOTER);
  return blocks.join('\n\n');
}

// ── group helpers ──
const isAdminP = (p) => p.admin === 'admin' || p.admin === 'superadmin';
const pNums = (p) => [p.id, p.lid, p.jid, p.phoneNumber].filter(Boolean).map(digits);

export async function who(x) {
  const meta = await x.meta();
  const me = [digits(x.sock.user?.id), digits(x.sock.user?.lid)].filter(Boolean);
  const ids = [x.sender, ...(x.senderAlt || [])].filter(Boolean);
  const sAdmin = meta.participants.some((p) => isAdminP(p) && pNums(p).some((n) => ids.includes(n)));
  const bAdmin = meta.participants.some((p) => isAdminP(p) && pNums(p).some((n) => me.includes(n)));
  const isAdminNum = (num) => meta.participants.some((p) => isAdminP(p) && pNums(p).includes(digits(num)));
  return { meta, sAdmin, bAdmin, isAdminNum, me };
}

export const isBotNum = (x, num) => [digits(x.sock.user?.id), digits(x.sock.user?.lid)].includes(digits(num));

// ── AI helper used by several commands ──
export async function aiReply(x, prompt, extra = '', { remember = false, max = C.MAX_REPLY_CHARS } = {}) {
  await x.sock.sendPresenceUpdate('composing', x.jid).catch(() => {});
  const out = await askAI({ key: x.jid, text: prompt, extra, remember, maxChars: max });
  for (const part of chunk(out, 3500)) await x.reply(part);
}

// ── in-memory game state (one game per chat) ──
export const games = new Map();

// ── run a command ──
export async function runCommand(x) {
  const c = registry.get(x.cmd);
  if (!c) return false;
  stats.commands++;
  try {
    if (c.owner && !x.isOwner) { await x.reply('⛔ Owner only command.'); return true; }
    if (c.group && !x.isGroup) { await x.reply('👥 This command works in groups only.'); return true; }
    if (c.admin || c.botAdmin) {
      const w = await who(x);
      if (c.admin && !w.sAdmin && !x.isOwner) { await x.reply('⛔ Group admins only.'); return true; }
      if (c.botAdmin && !w.bAdmin) { await x.reply('🤖 Please make me a group admin first.'); return true; }
    }
    await c.fn(x);
  } catch (e) {
    console.error(`Command .${x.cmd} failed:`, e?.message || e);
    try { await x.reply(`⚠️ ${c.name} failed: ${String(e?.message || e).slice(0, 150)}`); } catch {}
  }
  return true;
}

export { os, fs, path, crypto, sleep, digits, chunk, data };
                                     
