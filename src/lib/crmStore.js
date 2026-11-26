/**
 * crmStore.js — the message archive behind `.crm` / `.insp` / `.adn` / `.relay`.
 *
 * Faithful port of the YONO DEV / Rem Bot "crm" store (plugins/crm.js,
 * the "CRMSTORE MERGED" section): a SQLite archive via better-sqlite3.
 * Nothing excluded — same tables, same pragmas, same prepared statements,
 * same save/load functions, same bind() that archives everything the
 * socket sees and sends.
 *
 * What it keeps, per message id:
 *   - the decoded WebMessageInfo, stored as a full protobuf blob
 *     (messages.data) — so `.crm` gets the COMPLETE message, not the
 *     partial quoted copy
 *   - the raw stanza node when we saw it (sock.ws 'CB:message')
 *     (nodes.data, JSON with Buffers base64'd)
 *
 * Storage is SQLite at data/crmdb.db (same spirit as YONO's
 * ./data/crmdb.db, resolved under process.cwd()/data like the house
 * store did). WAL journal, NORMAL synchronous, 5s busy timeout.
 *
 * The bind happens at socket startup: src/core/connection.js calls
 * bindCrmStore(sock) inside connectToWhatsApp(), before the message
 * handlers are registered — so archiving starts at boot. The lazy
 * bindCrmStore(sock) call in crm4.js is a harmless no-op safety net
 * (the WeakSet guard makes a second bind a no-op).
 *
 * House adapters (so crm.js / crm4.js work unchanged):
 *   - initCrmStore() — the DB opens at module load (YONO's behaviour);
 *     init just reports counts.
 *   - bindCrmStore(sock) — wraps YONO's bind().
 *   - recentIds(chat, limit) — newest-first ids for #rowid / .lastchat.
 *   - crmStats() — { messages, nodes, dir } for .crmstats.
 *   - decryptSecretEnvelope() — kept from the house JSONL store; it
 *     works off loadMessage(), which now reads SQLite rows (the stored
 *     WebMessageInfo carries the messageSecret, so edited/deleted
 *     messages are still recoverable).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { proto, generateWAMessage, generateWAMessageFromContent, generateMessageIDV2 } from 'baileys';

// ── YONO store (exact) ──────────────────────────────────────────────────────

const dbPath = path.join(process.cwd(), 'data', 'crmdb.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS messages (rowid INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, chat TEXT NOT NULL, sender TEXT, timestamp INTEGER, data BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat);
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id);
CREATE INDEX IF NOT EXISTS idx_messages_id_chat ON messages(id, chat);
CREATE TABLE IF NOT EXISTS nodes (id TEXT NOT NULL, chat TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now')), PRIMARY KEY(id, chat));`);

function serializeNode(v){ return JSON.stringify(v, (_, v) => { if (Buffer.isBuffer(v)) return {type:'Buffer', data:v.toString('base64')}; if (v instanceof Uint8Array) return {type:'Buffer', data:Buffer.from(v).toString('base64')}; return v }) }
function deserializeNode(v){ if(!v) return null; return JSON.parse(v, (_, v) => { if(v&&v.type==='Buffer'){ if(typeof v.data==='string') return Buffer.from(v.data,'base64'); if(Array.isArray(v.data)) return Buffer.from(v.data) } return v }) }
const insertMessage = db.prepare(`INSERT INTO messages (id,chat,sender,timestamp,data) VALUES (?,?,?,?,?)`);
const getMessage = db.prepare(`SELECT data FROM messages WHERE id =? AND chat =? ORDER BY rowid DESC LIMIT 1`);
const getMessageById = db.prepare(`SELECT data FROM messages WHERE id =? ORDER BY rowid DESC LIMIT 1`);
const getMessagesForBodyLookup = db.prepare(`SELECT data FROM messages WHERE id =? AND chat =? ORDER BY rowid DESC`);
const getMessagesByIdForBodyLookup = db.prepare(`SELECT data FROM messages WHERE id =? ORDER BY rowid DESC`);
const insertNodeStmt = db.prepare(`INSERT INTO nodes (id,chat,data) VALUES (?,?,?) ON CONFLICT(id, chat) DO UPDATE SET data = excluded.data, created_at = strftime('%s','now')`);
const getNodeStmt = db.prepare(`SELECT data FROM nodes WHERE id =? AND chat =? ORDER BY created_at DESC LIMIT 1`);
const getNodeByIdStmt = db.prepare(`SELECT data FROM nodes WHERE id =? ORDER BY created_at DESC LIMIT 1`);
export function saveMessage(message, chat){ if(!message||!chat) return false; try{ const id=message?.key?.id; if(!id) return false; const encoded=proto.WebMessageInfo.encode(message).finish(); insertMessage.run(id, chat, message.participant||message.key?.participant||null, Number(message.messageTimestamp||Math.floor(Date.now()/1000)), Buffer.from(encoded)); return true }catch{ return false } }
export function loadMessage(id, chat){ if(!id) return null; try{ const row=chat? getMessage.get(id, chat): getMessageById.get(id); if(!row?.data) return null; return proto.WebMessageInfo.decode(row.data) }catch{ return null } }
export function loadMessageCandidates(id, chat){
  if(!id) return [];
  try{
    const rows=chat? getMessagesForBodyLookup.all(id, chat): getMessagesByIdForBodyLookup.all(id);
    return rows.flatMap((row)=>{
      if(!row?.data) return [];
      try { return [proto.WebMessageInfo.decode(row.data)]; } catch { return []; }
    });
  }catch{ return []; }
}
export function loadMessageWithBody(id, chat){
  if(!id) return null;
  try{
    const rows=chat? getMessagesForBodyLookup.all(id, chat): getMessagesByIdForBodyLookup.all(id);
    for(const row of rows){
      if(!row?.data) continue;
      try{
        const message=proto.WebMessageInfo.decode(row.data);
        if(message?.message && Object.keys(message.message).length) return message;
      }catch{}
    }
    return null;
  }catch{ return null }
}
export function saveNode(id, chat, node){ if(!id||!chat||!node) return false; try{ insertNodeStmt.run(String(id), String(chat), serializeNode(node)); return true }catch{ return false } }
export function loadNode(messageId, jid){ if(!messageId) return null; try{ let row=null; if(jid) row=getNodeStmt.get(String(messageId), String(jid)); if(!row?.data) row=getNodeByIdStmt.get(String(messageId)); if(!row?.data) return null; return deserializeNode(row.data) }catch{ return null } }
export function saveAdditionalNode(id, chat, content, attrs={}){ if(!id||!chat) return false; try{ insertNodeStmt.run(String(id), String(chat), serializeNode({tag:'message', attrs:{id:String(id), from:String(chat), t:String(Math.floor(Date.now()/1000)), type:'text',...attrs}, content})); return true }catch{ return false } }
function persist(message, id, jid, options){ queueMicrotask(()=>{ try{ saveMessage(proto.WebMessageInfo.fromObject(message), jid); saveAdditionalNode(id, jid, options.additionalNodes||[], {t:String(Math.floor(Date.now()/1000)),...options.additionalAttributes}) }catch{} }) }
if(!global.__crmStoreBoundConns) global.__crmStoreBoundConns=new WeakSet()
export function bind(conn){
  if(!conn) return conn;
  if(global.__crmStoreBoundConns.has(conn)) return conn;
  global.__crmStoreBoundConns.add(conn);
  conn.ev.on('messages.upsert', ({messages})=>{ try{ for(const message of messages||[]){ if(!message?.key?.id) continue; const chat=message.key.remoteJid; if(!chat) continue; saveMessage(message, chat) } }catch{} });
  conn.ws.on('CB:message', node=>{ try{ const id=node?.attrs?.id; if(!id) return; const chat=node?.attrs?.from||node?.attrs?.recipient||node?.attrs?.participant; if(!chat) return; saveNode(id, chat, node) }catch{} });
  if(typeof conn.sendMessage==='function'&&!conn.sendMessage.__crmStorePatched){
    const orig=conn.sendMessage.bind(conn);
    const patched=async(jid, content, options={})=>{ const messageId=options.messageId||generateMessageIDV2(); const generated=await generateWAMessage(jid, content, {...options, messageId, userJid:conn.user?.id, upload:conn.waUploadToServer}); const sent=await orig(jid, content, {...options, messageId}); persist(generated, messageId, jid, options); return sent };
    patched.__crmStorePatched=true;
    conn.sendMessage=patched;
  }
  if(typeof conn.relayMessage==='function'&&!conn.relayMessage.__crmStorePatched){
    const orig=conn.relayMessage.bind(conn);
    const patched=async(jid, content, options={})=>{ const messageId=options.messageId||generateMessageIDV2(); const generated=generateWAMessageFromContent(jid, content, {...options, messageId, userJid:conn.user?.id, upload:conn.waUploadToServer}); const res=orig(jid, content, {...options, messageId}); persist(generated, messageId, jid, options); return res };
    patched.__crmStorePatched=true;
    conn.relayMessage=patched;
  }
  return conn;
}
export const crmstore = { db, bind, saveMessage, loadMessage, loadMessageWithBody, loadNode, saveNode, saveAdditionalNode };

// ── House adapters (keep crm.js / crm4.js working unchanged) ────────────────

/** The DB opens at module load (YONO's behaviour); init just reports counts. */
export function initCrmStore() {
  const stats = crmStats();
  return { messages: stats.messages, nodes: stats.nodes };
}

/** Wrap YONO's bind() under the house name. Safe to call twice per socket. */
export function bindCrmStore(sock) {
  return bind(sock);
}

/** Newest archived ids for one chat (`.lastchat`, `#rowid`). Newest first. */
export function recentIds(chat, limit = 10) {
  if (!chat) return [];
  try {
    const rows = db.prepare(`SELECT id FROM messages WHERE chat = ? ORDER BY rowid DESC LIMIT ?`).all(String(chat), Math.max(1, Number(limit) || 10));
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/** Cheap counters for `.crmstats`. */
export const crmStats = () => {
  try {
    const messages = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get()?.n ?? 0;
    const nodes = db.prepare(`SELECT COUNT(*) AS n FROM nodes`).get()?.n ?? 0;
    return { messages, nodes, dir: path.dirname(dbPath) };
  } catch {
    return { messages: 0, nodes: 0, dir: path.dirname(dbPath) };
  }
};

// ─── secret edits / deletions (kept from the house JSONL store) ─────────────

const SECRET_CONTEXT = {
  MESSAGE_EDIT: 'Message Edit',
  EVENT_EDIT: 'Event Edit',
  POLL_EDIT: 'Poll Edit',
  POLL_ADD_OPTION: 'Poll Edit',
};

const encTypeName = (value) => {
  if (typeof value === 'string') return value;
  try {
    return proto.Message.SecretEncryptedMessage.SecretEncType[value] ?? value;
  } catch {
    return value;
  }
};

/** Walk a message tree for the first messageSecret it carries. */
function findMessageSecret(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (node.messageContextInfo?.messageSecret) return node.messageContextInfo.messageSecret;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = findMessageSecret(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recover the plaintext of a `secretEncryptedMessage`.
 * @param {object} secret  the secretEncryptedMessage
 * @param {Buffer} messageSecret  the TARGET message's 32-byte secret
 * @param {string} senderJid  the target's sender jid
 * @param {string} targetId  the target message id
 * @returns {object|null} the decoded Message, or null when it cannot be opened
 */
export function decryptSecret(secret, messageSecret, senderJid, targetId) {
  try {
    const type = encTypeName(secret?.secretEncType);
    const context = SECRET_CONTEXT[type];
    if (!context || !messageSecret || messageSecret.length !== 32) return null;
    const info = Buffer.concat([
      Buffer.from(targetId, 'utf8'),
      Buffer.from(senderJid, 'utf8'),
      Buffer.from(senderJid, 'utf8'),
      Buffer.from(context, 'utf8'),
    ]);
    const key = Buffer.from(crypto.hkdfSync('sha256', messageSecret, Buffer.alloc(0), info, 32));
    const payload = Buffer.from(secret.encPayload || '', 'base64');
    const iv = Buffer.from(secret.encIv || '', 'base64');
    if (iv.length !== 12 || payload.length < 17) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(payload.subarray(-16));
    const plain = Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]);
    return proto.Message.toObject(proto.Message.decode(plain), { enums: Number, longs: Number, bytes: String, defaults: false });
  } catch {
    return null;
  }
}

/** If `message` is a secret edit/deletion, return the recovered message instead. */
export function decryptSecretEnvelope(message) {
  const secret = message?.message?.secretEncryptedMessage;
  if (!secret) return message;
  const targetKey = secret.targetMessageKey;
  if (!targetKey?.id) return message;
  const target = loadMessage(targetKey.id, message.key?.remoteJid);
  if (!target) return message;
  const targetObj = proto.WebMessageInfo.toObject(proto.WebMessageInfo.fromObject(target), {
    enums: Number, longs: Number, bytes: String, defaults: false,
  });
  const secretB64 = findMessageSecret(targetObj.message);
  if (!secretB64) return message;
  const senderJid = targetObj.key?.participant || targetKey.participant
    || targetObj.key?.remoteJid || targetKey.remoteJid;
  if (!senderJid) return message;
  const plain = decryptSecret(secret, Buffer.from(secretB64, 'base64'), senderJid, targetKey.id);
  if (!plain) return message;
  return { ...message, message: plain, __decryptedFrom: targetKey.id };
}

export { db };

export default { db, bind, bindCrmStore, initCrmStore, saveMessage, loadMessage, loadMessageWithBody, saveNode, loadNode, saveAdditionalNode, recentIds, crmStats, decryptSecret, decryptSecretEnvelope };
