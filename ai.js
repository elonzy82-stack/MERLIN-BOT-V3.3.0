// ───────────── ai.js ─────────────
import * as C from './config.js';

const histories = new Map(); // chat key -> [{role, content}]

export const clearHistory = (key) => histories.delete(key);

export async function askAI({ key, text, extra = '', remember = true, maxChars = C.MAX_REPLY_CHARS }) {
  const h = remember ? [...(histories.get(key) || [])] : [];
  h.push({ role: 'user', content: text });
  while (h.length > C.MAX_HISTORY) h.shift();

  const system = C.systemPrompt(maxChars) + (extra ? `\n\nCurrent task: ${extra}` : '');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  let res;
  try {
    res = await fetch(C.GROQ_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${C.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: C.GROQ_MODEL,
        reasoning_effort: C.REASONING_EFFORT,
        messages: [{ role: 'system', content: system }, ...h],
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`AI service returned HTTP ${res.status}`);
  const json = await res.json();
  let reply = json?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('The AI returned an empty answer');
  if (reply.length > maxChars) reply = reply.slice(0, maxChars - 1) + '…';

  if (remember) {
    h.push({ role: 'assistant', content: reply });
    while (h.length > C.MAX_HISTORY) h.shift();
    histories.set(key, h);
  }
  return reply;
}
