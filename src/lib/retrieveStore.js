/**
 * retrieveStore.js — standalone, quiet deleted-message retrieval history.
 *
 * Separate SQLite store from the CRM archive. Messages are recorded in private
 * chats and groups, but nothing is reposted until .retrieve is run explicitly.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = path.join(process.cwd(), 'data', 'retrieve.db');
const MAX_PER_CHAT = 5000;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    chat TEXT NOT NULL,
    sender TEXT,
    body TEXT NOT NULL DEFAULT '',
    type TEXT,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_retrieve_chat_id ON messages(chat, id);
  CREATE INDEX IF NOT EXISTS idx_retrieve_chat_deleted ON messages(chat, deleted, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_retrieve_id ON messages(id);
`);

function serialize(value) {
  return JSON.stringify(value, (_key, item) => {
    if (Buffer.isBuffer(item)) return { type: 'Buffer', data: item.toString('base64') };
    if (item instanceof Uint8Array) return { type: 'Buffer', data: Buffer.from(item).toString('base64') };
    return item;
  });
}

function deserialize(value) {
  return JSON.parse(value, (_key, item) => {
    if (item?.type === 'Buffer') {
      return Buffer.from(typeof item.data === 'string' ? item.data : item.data || [] , 'base64');
    }
    return item;
  });
}

const insertMessage = db.prepare(`
  INSERT INTO messages (id, chat, sender, body, type, data, received_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(chat, id) DO UPDATE SET
    sender = excluded.sender,
    body = excluded.body,
    type = excluded.type,
    data = excluded.data
`);
const markDeleted = db.prepare(`
  UPDATE messages SET deleted = 1, deleted_at = ?
  WHERE chat = ? AND id = ?
`);
const getDeletedById = db.prepare(`
  SELECT id, sender, body, type, data, received_at, deleted_at
  FROM messages WHERE chat = ? AND id = ? AND deleted = 1
  LIMIT 1
`);
const getLatestDeleted = db.prepare(`
  SELECT id, sender, body, type, data, received_at, deleted_at
  FROM messages WHERE chat = ? AND deleted = 1
  ORDER BY deleted_at DESC, received_at DESC LIMIT 1
`);
const pruneChat = db.prepare(`
  DELETE FROM messages
  WHERE chat = ? AND rowid NOT IN (
    SELECT rowid FROM messages WHERE chat = ? ORDER BY received_at DESC LIMIT ?
  )
`);
const writeMessage = db.transaction((jid, entry) => {
  insertMessage.run(
    String(entry.id),
    String(jid),
    entry.sender ? String(entry.sender) : null,
    String(entry.body || ''),
    entry.type ? String(entry.type) : null,
    serialize(entry.message),
    Date.now(),
  );
  pruneChat.run(String(jid), String(jid), MAX_PER_CHAT);
});

function fromRow(row) {
  if (!row?.data) return null;
  try {
    return {
      id: row.id,
      sender: row.sender,
      body: row.body || '',
      type: row.type || '',
      message: deserialize(row.data),
      ts: row.received_at,
      deletedAt: row.deleted_at,
    };
  } catch {
    return null;
  }
}

export function rememberRetrievableMessage(jid, entry) {
  if (!jid || !entry?.id || !entry?.message) return;
  try {
    writeMessage(jid, entry);
  } catch (err) {
    console.warn('[RETRIEVE] Could not archive message:', err.message || err);
  }
}

export function markRetrievableMessageDeleted(jid, id) {
  if (!jid || !id) return null;
  try {
    const result = markDeleted.run(Date.now(), String(jid), String(id));
    return result.changes ? findRetrievableMessage(jid, id) : null;
  } catch (err) {
    console.warn('[RETRIEVE] Could not mark message deleted:', err.message || err);
    return null;
  }
}

export function findRetrievableMessage(jid, id) {
  if (!jid) return null;
  try {
    const row = id
      ? getDeletedById.get(String(jid), String(id))
      : getLatestDeleted.get(String(jid));
    return fromRow(row);
  } catch {
    return null;
  }
}

export function retrieveStats(jid) {
  try {
    return db.prepare('SELECT COUNT(*) AS count FROM messages WHERE chat = ?').get(String(jid))?.count || 0;
  } catch {
    return 0;
  }
}

export { db as retrieveDb, dbPath };
