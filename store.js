// ───────────── store.js ─────────────
// Tiny JSON database (data.json) for settings, bans, jail list, warnings, library, reminders…
import fs from 'fs';
import * as C from './config.js';

const FILE = './data.json';

const defaults = () => ({
  settings: { mode: C.MODE, autoReply: C.AUTO_REPLY, prefix: C.PREFIX },
  bans: [],
  jailed: {}, // groupJid -> [numbers]
  warns: {}, // groupJid -> { number: count }
  welcome: {}, // groupJid -> true
  antilink: {}, // groupJid -> true
  library: {}, // number -> [{id,title,artist}]
  reminders: [], // {at,jid,num,text,sid}
  pairs: [], // extra paired numbers (sub-sessions)
  users: [], // numbers that chatted privately (for broadcast)
});

let loaded = {};
try {
  loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {}

export const data = { ...defaults(), ...loaded };
data.settings = { ...defaults().settings, ...(loaded.settings || {}) };

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(data), () => {}), 400);
}
