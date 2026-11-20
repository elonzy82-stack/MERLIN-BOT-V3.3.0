// ───────────── config.js ─────────────
const SC = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
  k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ',
  u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};
export const small = (t) => String(t).toLowerCase().replace(/[a-z]/g, (c) => SC[c]);

// ── Your details ──
export const BOT_NAME = 'MERLIN EXE';
export const AI_NAME = '╰‿╯ ᴍⓥᴇxᴇ 亗 V3.3.0 ';
export const CREATOR_NAME = 'NATRAC';
export const CREATOR_INFO = 'Software developer and ethical hacker';
export const OWNER_NUMBER = '2349064331052';
export const PAIR_NUMBER = '2349064331052';
// Better practice: set GROQ_API_KEY as an environment variable on KataBump.
export const GROQ_API_KEY =
  process.env.GROQ_API_KEY || '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';
export const BOT_IMAGE =
  'https://res.cloudinary.com/kfivvhfe/image/upload/v1795117789/IMG-20261119-WA0116.jpg';
export const AI_HELPS_WITH = 'Helping programming and asking 🌍 world wide questions and taught';

// Optional text shown by the .news command (leave empty to disable)
export const PROMO_TEXT = '';

// ── Fixed settings ──
export const GROQ_URL = 'https://fei-ai.vercel.app/api/groq';
export const GROQ_MODEL = 'openai/gpt-oss-20b';
export const REASONING_EFFORT = 'high';
export const PREFIX = '.';
export const MODE = 'PUBLIC'; // PUBLIC or PRIVATE (owner only)
export const VERSION = '2.0.4';
export const TIMEZONE = 'Africa/Lagos';
export const AUTO_REPLY = true; // starting value
export const MAX_HISTORY = 50;
export const COOLDOWN_SECONDS = 1;
export const MAX_REPLY_CHARS = 1200;

// ── Look & feel ──
export const HEADER = `╭─━─━─━─━─━─━─━─━─━─━╮
│  ⚡ ✅╰ᴍⓥᴇxᴇ 亗 ✅⚡
╰─━─━─━─━─━─━─━─━─━─━╯`;

export const section = (title, lines) =>
  `┌───〔 ${title} 〕───┐\n${lines.map((l) => `│ ${l}`).join('\n')}\n└───────────────────┘`;

export const row = (label, value) => `✦ ${small(label)} : ${value}`;

// ── AI persona ──
export const SYSTEM_PROMPT = `You are ${AI_NAME}, the AI assistant of ${CREATOR_NAME} (${CREATOR_INFO}).
Your main job: ${AI_HELPS_WITH}.
Rules:
- Be friendly, short and simple. Small talk is fine, but politely steer off-topic questions back to your main job.
- If anyone asks what you are, your name, who made you, who owns you, or similar, answer that you are ${AI_NAME}, the AI assistant of ${CREATOR_NAME}. You may add: ${CREATOR_INFO}.
- Never claim to be human. Never name the AI company or model behind you. If someone sincerely asks about the technology, say you are an AI assistant powered by an AI language model.
- Reply in plain text suitable for WhatsApp (no markdown headings or tables), under about ${MAX_REPLY_CHARS} characters.`;
