/**
 * retrieveStore.js — standalone, quiet deleted-message retrieval history.
 *
 * This store is intentionally separate from antiGuard's automatic snitch mode.
 * Messages are recorded in private chats and groups, but nothing is reposted
 * until the user explicitly runs .retrieve in that same chat.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'database', 'retrieve.json');
const MAX_PER_CHAT = 20;
const MAX_CHATS = 500;
const state = { chats: {} };
let writeTimer = null;

function encode(_key, value) {
  if (Buffer.isBuffer(value)) return { __retrieveBytes: value.toString('base64') };
  if (value instanceof Uint8Array) return { __retrieveBytes: Buffer.from(value).toString('base64') };
  if (value?.type === 'Buffer' && Array.isArray(value.data)) {
    return { __retrieveBytes: Buffer.from(value.data).toString('base64') };
  }
  return value;
}

function decode(_key, value) {
  if (value && typeof value === 'object' && typeof value.__retrieveBytes === 'string') {
    return Buffer.from(value.__retrieveBytes, 'base64');
  }
  return value;
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'), decode);
    if (parsed?.chats && typeof parsed.chats === 'object') state.chats = parsed.chats;
  } catch (_) {
    state.chats = {};
  }
}

function scheduleSave() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, encode), 'utf8');
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.warn('[RETRIEVE] Could not save database:', err.message || err);
    }
  }, 250);
  writeTimer.unref?.();
}

load();

export function rememberRetrievableMessage(jid, { id, sender, body, type, message }) {
  if (!jid || !id || !message) return;
  if (!state.chats[jid]) {
    if (Object.keys(state.chats).length >= MAX_CHATS) {
      delete state.chats[Object.keys(state.chats)[0]];
    }
    state.chats[jid] = [];
  }
  const chat = state.chats[jid].filter((entry) => entry.id !== id);
  chat.push({ id, sender, body: String(body || ''), type, message, deleted: false, ts: Date.now() });
  state.chats[jid] = chat.slice(-MAX_PER_CHAT);
  scheduleSave();
}

export function markRetrievableMessageDeleted(jid, id) {
  if (!jid || !id) return null;
  const chat = state.chats[jid] || [];
  const entry = chat.find((item) => item.id === id);
  if (!entry) return null;
  entry.deleted = true;
  entry.deletedAt = Date.now();
  scheduleSave();
  return entry;
}

export function findRetrievableMessage(jid, id) {
  const chat = (state.chats[jid] || []).filter((entry) => entry.deleted);
  if (id) return chat.find((entry) => entry.id === id) || null;
  return chat[chat.length - 1] || null;
}

export function retrieveStats(jid) {
  return (state.chats[jid] || []).length;
}
