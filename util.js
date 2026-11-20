// ───────────── util.js ─────────────
export const digits = (j = '') => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
];

// Strip WhatsApp wrapper layers (ephemeral, view-once, edited…) to reach the real content
export function unwrap(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i++) {
    const k = WRAPPERS.find((w) => m[w]);
    if (!k) break;
    m = m[k].message || m[k];
  }
  return m;
}

export const isViewOnce = (raw) => {
  if (!raw) return false;
  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
  const inner = unwrap(raw);
  return !!(inner?.imageMessage?.viewOnce || inner?.videoMessage?.viewOnce || inner?.audioMessage?.viewOnce);
};

export function textOf(c) {
  if (!c) return '';
  return (
    c.conversation ||
    c.extendedTextMessage?.text ||
    c.imageMessage?.caption ||
    c.videoMessage?.caption ||
    c.documentMessage?.caption ||
    c.buttonsResponseMessage?.selectedButtonId ||
    c.listResponseMessage?.singleSelectReply?.selectedRowId ||
    c.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

export function ctxInfo(c) {
  if (!c) return null;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  }
  return null;
}

export function chunk(text, size = 3500) {
  const out = [];
  let t = String(text);
  while (t.length > size) {
    let cut = t.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = size;
    out.push(t.slice(0, cut));
    t = t.slice(cut).replace(/^\n/, '');
  }
  if (t.length) out.push(t);
  return out;
}
  
