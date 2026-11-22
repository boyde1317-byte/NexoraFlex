/**
 * richSniffer.js — the AI-rich rendering safari layer.
 *
 * Three moving parts:
 *
 * 1. A passive capture store (SQLite, data/richsniff.db) that archives every
 *    botForwardedMessage / richResponseMessage the socket SEES or SENDS —
 *    including Meta AI's own replies. Every archived record keeps the full
 *    decoded unifiedResponse JSON (base64-decoded) plus the raw submessages
 *    and the __typename census, so new primitives show up by name without
 *    anyone having to decode them first.
 *
 * 2. bindRichSniffer(sock) — a WeakSet-guarded bind, same pattern as
 *    crmStore.bind(): hooks messages.upsert for incoming, patches
 *    sendMessage/relayMessage for outgoing. Never throws into the host
 *    handler; every hook is try/catch'd and silent on failure.
 *
 * 3. The analysis half, used by `.sniff` (plugins/owner/sniff.js):
 *    - primitiveCensus()  → which GenAI*Primitive __typenames the corpus
 *                           contains, with counts + which messages used them
 *    - findNewPrimitives()→ everything in the corpus NOT yet emitted by the
 *                           fork's toUnified() — the discovery list
 *    - replay(id)         → re-relay an archived payload verbatim (mutation
 *                           testing: send to yourself, edit fields, compare)
 *    - dump(id)           → full JSON document for offline study
 *
 * 4. A persistent JSONL event log (data/richsniff-events.log): every
 *    capture-path verdict — skip reasons included — plus every error the
 *    hooks swallow, surviving restarts (`.sniff log` reads it back).
 *
 * 5. The tag path: a reply quoting (tagging) a rich message carries the
 *    FULL quoted payload in contextInfo.quotedMessage — exactly how .crm
 *    reads Meta AI messages ("reply to the message"). Tagging counts as
 *    capture: the quoted payload is stored under the original's stanzaId
 *    (deduped if already in the corpus), so dump/replay key on the real id.
 *
 * Envelope note (.crm ground truth): Meta AI rich replies can arrive as a
 * plain extendedTextMessage (LaTeX in the text) with top-level
 * messageContextInfo.botMetadata and NO richResponseMessage at all, so
 * detection covers three wire shapes — see extractRichPayload().
 *
 * Why a separate db from crmStore: the CRM archive keeps full
 * WebMessageInfo protobuf blobs (every message); this store keeps DECODED
 * rich payloads only (small, JSON, queryable), so a capture session with
 * Meta AI doesn't bloat the CRM store and the corpus can be wiped freely.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { generateMessageIDV2 } from 'baileys';

// ── Store ───────────────────────────────────────────────────────────────────

const dbPath = path.join(process.cwd(), 'data', 'richsniff.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.exec(`CREATE TABLE IF NOT EXISTS captures (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  chat TEXT NOT NULL,
  sender TEXT,
  direction TEXT NOT NULL DEFAULT 'in',
  typename TEXT,
  primitives TEXT,
  decoded TEXT,
  raw TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_captures_chat ON captures(chat);
CREATE INDEX IF NOT EXISTS idx_captures_typename ON captures(typename);`);

const insertCapture = db.prepare(
  `INSERT INTO captures (id, chat, sender, direction, typename, primitives, decoded, raw) VALUES (?,?,?,?,?,?,?,?)`
);
const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM captures`);
const byIdStmt = db.prepare(`SELECT * FROM captures WHERE id = ? ORDER BY rowid DESC LIMIT 1`);
const recentStmt = db.prepare(`SELECT rowid, id, chat, sender, direction, typename, primitives, created_at FROM captures ORDER BY rowid DESC LIMIT ?`);
const clearStmt = db.prepare(`DELETE FROM captures`);

// ── Persistent event/error log (JSONL) ──────────────────────────────────────
// The in-memory diag counters die with the process; this file survives
// restarts and answers "why is the corpus empty" AFTER the fact. Every
// envelope verdict (with skip reason) and every swallowed error lands here.
// RICH_SNIFF_LOG overrides the path (tests point it at a scratch file).
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const logPath = process.env.RICH_SNIFF_LOG
  ? path.resolve(process.env.RICH_SNIFF_LOG)
  : path.join(process.cwd(), 'data', 'richsniff-events.log');

/** Appends one JSONL entry; rotates to .old past 2MB; never throws. */
function logLine(kind, detail = {}) {
  try {
    try {
      const st = fs.statSync(logPath);
      if (st.size > MAX_LOG_BYTES) fs.renameSync(logPath, `${logPath}.old`); // keep one generation
    } catch { /* file not there yet */ }
    fs.appendFileSync(logPath, JSON.stringify({ t: Date.now(), kind, ...detail }) + '\n');
  } catch { /* logging must never break capture */ }
}

/** Last n entries of the persistent log (`.sniff log`). */
export function readEventLog(n = 15) {
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-Math.max(1, Number(n) || 15)).map((l) => {
      try { return JSON.parse(l); } catch { return { kind: 'unparseable', raw: l.slice(0, 120) }; }
    });
  } catch { return []; }
}

/** Wipes the event log + its rotated generation (`.sniff log clear`). */
export function clearEventLog() {
  try {
    for (const f of [logPath, `${logPath}.old`]) if (fs.existsSync(f)) fs.rmSync(f);
    return true;
  } catch { return false; }
}

/** Path of the active event log (diagnostics read-out). */
export function eventLogPath() { return logPath; }

// ── Payload walking ─────────────────────────────────────────────────────────

/**
 * Unwraps viewOnce/ephemeral/documentWithCaption containers so the sniffer
 * sees the same content normalizeMessageContent() would. Returns
 * { container, content } — container is the message object to store raw.
 */
function unwrapContainers(message) {
  let msg = message;
  for (let i = 0; i < 4; i++) {
    if (msg?.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
    else if (msg?.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
    else if (msg?.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
    else if (msg?.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
    else break;
  }
  return msg;
}

// A process-wide tap every capture-path hop funnels through: the next .sniff
// can answer "why is the corpus empty" with evidence instead of guesses.
// Levels: 'off' | 'on' (counters only) | 'verbose' (+ last events).
const diag = {
  level: (process.env.RICH_SNIFF_DIAG || 'on').toLowerCase(),
  events: [],
  counters: {
    upserts: 0,      // messages.upsert batches seen
    messages: 0,     // individual messages inspected
    richSeen: 0,     // messages with a recognized richResponseMessage envelope
    botMeta: 0,      // messages with messageContextInfo.botMetadata (Meta AI rich text)
    richStore: 0,    // richResponseMessage payloads stored (db insert ok)
    botMetaStore: 0, // botMetadata payloads stored
    richStoreFail: 0,// store attempts that threw
    quotedSeen: 0,   // tags quoting a rich payload (contextInfo.quotedMessage)
    quotedStore: 0,  // rich payloads captured from tags
    quotedDup: 0,    // tags whose quoted payload was already in the corpus
    outSeen: 0,      // outgoing sendMessage/relayMessage calls inspected
    outStore: 0,     // outgoing rich payloads stored
    errors: 0,       // exceptions inside the capture path (also JSONL-logged)
  },
};
const MAX_DIAG_EVENTS = 30;

function diagEvent(kind, detail) {
  if (diag.level === 'off') return;
  diag.counters[kind] = (diag.counters[kind] || 0) + 1;
  if (diag.level === 'verbose') {
    diag.events.push({ t: Date.now(), kind, ...detail });
    if (diag.events.length > MAX_DIAG_EVENTS) diag.events.shift();
  }
}

/** .sniff diag — the tap read-out: counters + (verbose) last events. */
export function sniffDiagnostics() {
  return { level: diag.level, counters: { ...diag.counters }, events: [...diag.events] };
}

// The last non-empty message content the incoming hook saw, kept verbatim
// (post-unwrapContainers) for `.sniff raw` — the emergency hatch when the
// corpus stays empty and we need to see the real envelope shape offline.
let lastRaw = null;
export function lastRawIncoming() {
  return lastRaw;
}

/**
 * Extracts the rich payload from a decoded message object (the `.message`
 * content — pass m.message, not the WebMessageInfo). Handles the THREE wire
 * placements/shape the proto + field evidence allow:
 *
 *   a) Message.botForwardedMessage (FutureProofMessage) → .message →
 *      .richResponseMessage — the envelope the fork emits;
 *   b) Message.richResponseMessage as a DIRECT top-level field
 *      (proto.Message.IAIRichResponseMessage at WAProto index.d.ts:5941);
 *   c) Message.extendedTextMessage + top-level messageContextInfo.botMetadata
 *      with botRenderingConfigMetadata.bloksVersioningId — the Meta AI
 *      "LaTeX-as-text" reply shape captured live via .crm (no
 *      richResponseMessage on the wire at all).
 *
 * Returns { botForwardedMessage, richResponseMessage, via, text? } or null.
 * For (c) richResponseMessage is null and text carries the body text.
 */
export function extractRichPayload(messageContent) {
  if (!messageContent) return null;
  const botFwd = messageContent.botForwardedMessage?.message;
  const wrapped = botFwd?.richResponseMessage;
  if (wrapped) return { botForwardedMessage: botFwd, richResponseMessage: wrapped, via: 'botForwardedMessage' };
  const flat = messageContent.richResponseMessage;
  if (flat) return { botForwardedMessage: null, richResponseMessage: flat, via: 'richResponseMessage' };
  // (c) the .crm shape: botMetadata = rendered rich content marker. The
  // bloksVersioningId is the client-rendering contract Meta's bots use.
  const botMeta = messageContent.messageContextInfo?.botMetadata;
  if (botMeta?.botRenderingConfigMetadata?.bloksVersioningId) {
    return {
      botForwardedMessage: null,
      richResponseMessage: null,
      via: 'botMetadata',
      text: messageContent.extendedTextMessage?.text || messageContent.conversation || '',
    };
  }
  return null;
}

/** True when the content carries a botMetadata rich marker (c-shape). */
function isBotMetaShape(messageContent) {
  return Boolean(messageContent?.messageContextInfo?.botMetadata?.botRenderingConfigMetadata?.bloksVersioningId);
}

/**
 * Finds the quote context of a tag/reply: any `contextInfo.quotedMessage`
 * placement within the content (extendedTextMessage.contextInfo,
 * mediaMessage.contextInfo, richResponseMessage.contextInfo, …). Bounded
 * walk — a quote of a quote never recurses past depth 3.
 * Returns { contextInfo, quotedMessage } or null.
 */
export function findQuotedContext(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 3) return null;
  if (node.contextInfo?.quotedMessage) return { contextInfo: node.contextInfo, quotedMessage: node.contextInfo.quotedMessage };
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = findQuotedContext(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * THE shared capture verdict — every hook site (incoming upsert, outgoing
 * sendMessage/relayMessage patches) funnels through here, so all paths apply
 * the same rules in the same order:
 *
 *   1. the content itself is rich → capture it;
 *   2. the content TAGS (quotes/replies to) a rich message → capture the
 *      QUOTED payload, keyed by contextInfo.stanzaId (the original
 *      message's real id — dump/replay key on it). Already in the corpus
 *      → 'dup' (every later tag of the same message dedupes);
 *   3. otherwise → skip, with the envelope's top-level keys as `shape`.
 *
 * Returns { verdict: 'capture'|'quoted'|'dup'|'fail'|'skip', via, rowid?,
 * quotedId?, reason?, shape? } — never throws, never stores the tag
 * wrapper itself.
 */
export function captureFromContent({ id, chat, sender, direction, messageContent, where }) {
  const content = unwrapContainers(messageContent);
  const rich = extractRichPayload(content);
  if (rich) {
    const stored = recordCapture({ id, chat, sender, direction, messageContent: content });
    return stored === -1
      ? { verdict: 'fail', via: rich.via, where }
      : { verdict: 'capture', via: rich.via, rowid: stored, where };
  }
  // Tag path: quoting (tagging) a rich message counts as capturing it —
  // this is exactly how .crm reads Meta AI messages ("reply to the message").
  const tag = findQuotedContext(content);
  if (tag?.quotedMessage && Object.keys(tag.quotedMessage).length) {
    const quotedContent = unwrapContainers(tag.quotedMessage);
    const quotedRich = extractRichPayload(quotedContent);
    if (quotedRich) {
      const stanzaId = tag.contextInfo.stanzaId ? String(tag.contextInfo.stanzaId) : null;
      if (stanzaId && byIdStmt.get(stanzaId)) return { verdict: 'dup', via: 'quoted', where };
      const quotedId = stanzaId || `${String(id)}-quoted`;
      const stored = recordCapture({ id: quotedId, chat, sender, direction, messageContent: quotedContent });
      return stored === -1
        ? { verdict: 'fail', via: 'quoted', where }
        : { verdict: 'quoted', via: quotedRich.via, rowid: stored, quotedId, where };
    }
    // A tag, but of a non-rich message: skip with the QUOTED shape so the
    // census still self-documents what envelope didn't match.
    return { verdict: 'skip', reason: 'quoted-not-rich', shape: Object.keys(quotedContent).slice(0, 5).join(','), where };
  }
  return { verdict: 'skip', reason: 'no-rich-marker', shape: Object.keys(content || {}).slice(0, 5).join(','), where };
}

/**
 * Decodes unifiedResponse.data → JSON. On the wire, and after proto
 * decode, `data` is raw JSON bytes (Uint8Array/Buffer); the fork's
 * emitter historically also passed a base64 STRING via fromObject.
 * Handle both: bytes → utf8 decode; string → base64 decode. Returns
 * null on failure (bad JSON, wrong encoding path, or empty).
 */
export function decodeUnifiedData(data) {
  if (!data) return null;
  try {
    if (typeof data === 'string') return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    if (Buffer.isBuffer(data) || data instanceof Uint8Array || Array.isArray(data)) {
      return JSON.parse(Buffer.from(data).toString('utf8'));
    }
    return null;
  } catch {
    // One retry with the swapped encoding: bytes that were actually
    // base64 text, or base64 text that was actually raw JSON.
    try {
      if (typeof data === 'string') return JSON.parse(Buffer.from(data, 'utf8').toString('utf8'));
      return JSON.parse(Buffer.from(data.toString(), 'base64').toString('utf8'));
    } catch { return null; }
  }
}

/** Walks any object collecting GenAI-family __typename values. */
function collectTypenames(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectTypenames(item, out);
    return out;
  }
  if (typeof node.__typename === 'string') out.add(node.__typename);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectTypenames(value, out);
  }
  return out;
}

/** Flattens a decoded unifiedResponse into { sections, primitives, typenames }. */
export function analyzeUnified(decoded) {
  const sections = decoded?.sections || [];
  const typenames = collectTypenames(decoded);
  const primitives = [...typenames].filter((t) => t.includes('GenAI') || t.includes('AI'));
  return { sections, primitives, typenames: [...typenames] };
}

// ── Capture ─────────────────────────────────────────────────────────────────

/**
 * Normalizes a decoded proto messageContent into PLAIN JSON data, tagging
 * every Uint8Array/Buffer as { __bytes: '<base64>' }. Bypasses proto
 * classes' own toJSON() (which would hand JSON.stringify a base64 string
 * for bytes fields — lossy for proto re-encode on replay).
 *
 * Inverse of reviveBytes(): revive() turns { __bytes } tags back into
 * Buffers, so replayCapture hands relayMessage an object shaped exactly
 * like a fresh proto decode — byte-faithful relay guaranteed.
 */
function normalizeBytes(node) {
  if (node === null || node === undefined) return node;
  if (Buffer.isBuffer(node) || node instanceof Uint8Array) {
    return { __bytes: Buffer.from(node).toString('base64') };
  }
  if (Array.isArray(node)) return node.map(normalizeBytes);
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = normalizeBytes(value);
    return out;
  }
  return node;
}

/** Inverse of normalizeBytes(): { __bytes } tags → Buffers. */
function reviveBytes(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'object' && typeof node.__bytes === 'string' && Object.keys(node).length === 1) {
    return Buffer.from(node.__bytes, 'base64');
  }
  if (Array.isArray(node)) return node.map(reviveBytes);
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = reviveBytes(value);
    return out;
  }
  return node;
}

/**
 * Records one rich payload. `direction` is 'in' or 'out'.
 * Returns the stored rowid (or -1 on failure — never throws).
 */
export function recordCapture({ id, chat, sender, direction, messageContent }) {
  try {
    const rich = extractRichPayload(messageContent);
    if (!rich) return -1;
    const { richResponseMessage, via, text } = rich;
    const decodedUnified = richResponseMessage
      ? decodeUnifiedData(richResponseMessage.unifiedResponse?.data)
      : null;
    const analysis = decodedUnified ? analyzeUnified(decodedUnified) : { primitives: [] };
    const typename = decodedUnified
      ? (analysis.primitives.join(', ') || null)
      : richResponseMessage?.submessages?.length ? 'V1-submessages' : null;
    insertCapture.run(
      String(id || `unknown-${Date.now()}`),
      String(chat || 'unknown'),
      String(sender || ''),
      direction === 'out' ? 'out' : 'in',
      typename ? typename.slice(0, 500) : via === 'botMetadata' ? 'botMetadata-LaTeX' : null,
      JSON.stringify(analysis.primitives),
      decodedUnified ? JSON.stringify(decodedUnified) : null,
      JSON.stringify(normalizeBytes(messageContent)) + (via ? '' : '') // envelope kept verbatim (tagged bytes)
    );
    return countStmt.get().n;
  } catch (err) {
    logLine('storeError', { id, chat, via: 'recordCapture', error: String(err?.message || err) });
    return -1;
  }
}

// ── Binding (WeakSet-guarded, never throws) ─────────────────────────────────

if (!global.__richSnifferBoundConns) global.__richSnifferBoundConns = new WeakSet();

/**
 * Counter + log mapping for outgoing verdicts (sendMessage / relayMessage
 * patches): same rules as the incoming hook, out-specific counters.
 */
function diagOutgoingVerdict(jid, result) {
  switch (result.verdict) {
    case 'capture':
      diagEvent(result.via === 'botMetadata' ? 'botMeta' : 'richSeen', { jid, via: result.via, where: result.where });
      diagEvent('outStore', { jid });
      logLine('capture', { jid, via: result.via, direction: 'out', rowid: result.rowid });
      break;
    case 'quoted':
      diagEvent('quotedSeen', { jid, quotedId: result.quotedId, via: result.via });
      diagEvent('quotedStore');
      logLine('capture', { id: result.quotedId, jid, via: `quoted:${result.via}`, direction: 'out', rowid: result.rowid });
      break;
    case 'dup':
      diagEvent('quotedSeen', { jid, reason: 'dup' });
      diagEvent('quotedDup');
      logLine('dup', { jid, via: 'quoted', direction: 'out' });
      break;
    case 'fail':
      diagEvent('richStoreFail', { jid });
      logLine('storeFail', { jid, via: result.via, direction: 'out', reason: 'insert failed' });
      break;
    default:
      logLine('out-skip', { jid, reason: result.reason, shape: result.shape });
  }
}

export function bindRichSniffer(sock) {
  if (!sock) return sock;
  if (global.__richSnifferBoundConns.has(sock)) return sock;
  global.__richSnifferBoundConns.add(sock);

  // Incoming: every messages.upsert (notify or not — app-state replays can
  // carry rich payloads too, and those are exactly the Meta AI history).
  sock.ev.on('messages.upsert', ({ messages }) => {
    try {
      diagEvent('upserts');
      for (const message of messages || []) {
        try {
          if (!message?.key?.id) continue;
          diagEvent('messages', { id: message.key.id, jid: message.key.remoteJid });
          const content = unwrapContainers(message.message);
          if (content && Object.keys(content).length) lastRaw = content;
          const result = captureFromContent({
            id: message.key.id,
            chat: message.key.remoteJid,
            sender: message.key.participant || message.key.remoteJid,
            direction: 'in',
            messageContent: content,
            where: 'messages.upsert',
          });
          if (result.verdict === 'capture') {
            diagEvent(result.via === 'botMetadata' ? 'botMeta' : 'richSeen', { id: message.key.id, jid: message.key.remoteJid, via: result.via });
            diagEvent(result.via === 'botMetadata' ? 'botMetaStore' : 'richStore', { id: message.key.id });
            logLine('capture', { id: message.key.id, jid: message.key.remoteJid, via: result.via, rowid: result.rowid });
          } else if (result.verdict === 'quoted') {
            // Tag path: the message itself is plain, but it quotes a rich
            // payload — stored under the original's stanzaId.
            diagEvent('quotedSeen', { id: message.key.id, quotedId: result.quotedId, via: result.via });
            diagEvent('quotedStore');
            logLine('capture', { id: result.quotedId, taggedBy: message.key.id, jid: message.key.remoteJid, via: `quoted:${result.via}`, rowid: result.rowid });
          } else if (result.verdict === 'dup') {
            diagEvent('quotedSeen', { id: message.key.id, reason: 'dup' });
            diagEvent('quotedDup');
            logLine('dup', { taggedBy: message.key.id, jid: message.key.remoteJid, via: 'quoted' });
          } else if (result.verdict === 'fail') {
            diagEvent('richStoreFail', { id: message.key.id });
            logLine('storeFail', { id: message.key.id, jid: message.key.remoteJid, via: result.via, reason: 'insert failed' });
          } else {
            // The census: WHY each message was skipped — the single most
            // useful log when the corpus stays empty. Reason + the envelope's
            // top-level keys: an unrecognized shape self-documents for porting.
            logLine('skip', { id: message.key.id, jid: message.key.remoteJid, reason: result.reason, shape: result.shape });
          }
        } catch (err) {
          // Per-message isolation: one bad message must not kill the batch.
          diagEvent('errors');
          logLine('error', { id: message?.key?.id, jid: message?.key?.remoteJid, where: 'messages.upsert', error: String(err?.message || err) });
        }
      }
    } catch (err) {
      diagEvent('errors');
      logLine('error', { where: 'messages.upsert.batch', error: String(err?.message || err) });
    }
  });

  // Outgoing: patch sendMessage + relayMessage the same way crmStore does.
  if (typeof sock.sendMessage === 'function' && !sock.sendMessage.__richSnifferPatched) {
    const orig = sock.sendMessage.bind(sock);
    const patched = async (jid, content, options = {}) => {
      try {
        diagEvent('outSeen', { jid });
        const result = captureFromContent({
          id: options.messageId || generateMessageIDV2(),
          chat: jid,
          sender: sock.user?.id || '',
          direction: 'out',
          messageContent: content,
          where: 'sendMessage',
        });
        diagOutgoingVerdict(jid, result);
      } catch (err) {
        diagEvent('errors');
        logLine('error', { jid, where: 'sendMessage.patch', error: String(err?.message || err) });
      }
      return orig(jid, content, options);
    };
    patched.__richSnifferPatched = true;
    sock.sendMessage = patched;
  }

  if (typeof sock.relayMessage === 'function' && !sock.relayMessage.__richSnifferPatched) {
    const orig = sock.relayMessage.bind(sock);
    const patched = async (jid, content, options = {}) => {
      try {
        diagEvent('outSeen', { jid });
        const result = captureFromContent({
          id: options.messageId || generateMessageIDV2(),
          chat: jid,
          sender: sock.user?.id || '',
          direction: 'out',
          messageContent: content,
          where: 'relayMessage',
        });
        diagOutgoingVerdict(jid, result);
      } catch (err) {
        diagEvent('errors');
        logLine('error', { jid, where: 'relayMessage.patch', error: String(err?.message || err) });
      }
      return orig(jid, content, options);
    };
    patched.__richSnifferPatched = true;
    sock.relayMessage = patched;
  }

  return sock;
}

// ── Analysis ────────────────────────────────────────────────────────────────

/** { total, in, out } counters. */
export function sniffStats() {
  try {
    const total = countStmt.get().n;
    const inCount = db.prepare(`SELECT COUNT(*) AS n FROM captures WHERE direction='in'`).get().n;
    return { total, in: inCount, out: total - inCount, dir: path.dirname(dbPath) };
  } catch {
    return { total: 0, in: 0, out: 0, dir: path.dirname(dbPath) };
  }
}

/** Primitive __typename census over the whole corpus. */
export function primitiveCensus() {
  try {
    const rows = db.prepare(`SELECT rowid, primitives, typename FROM captures WHERE primitives IS NOT NULL`).all();
    const census = new Map();
    for (const row of rows) {
      let list = [];
      try { list = JSON.parse(row.primitives) || []; } catch { list = []; }
      for (const p of list) {
        if (!census.has(p)) census.set(p, { count: 0, rows: [] });
        const entry = census.get(p);
        entry.count += 1;
        if (entry.rows.length < 5) entry.rows.push(row.rowid);
      }
    }
    return [...census.entries()]
      .map(([name, { count, rows }]) => ({ name, count, sampleRows: rows }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// The __typenames the fork's toUnified() already emits — anything NOT in
// this list is a rendering surface the fork can't produce yet: the
// discovery list. Keep in sync with rich-message-utils.js toUnified().
const KNOWN_PRIMITIVES = new Set([
  'GenAICodeUXPrimitive',
  'GenAISingleLayoutViewModel',
  'GenAIHScrollLayoutViewModel',
  'GenAIActionRowLayoutViewModel',
  'GenAIContentItemsUXPrimitive',
  'GenAIImaginePrimitive',
  'GenAIDynamicUXPrimitive',
  'GenAIMarkdownTextUXPrimitive',
  'GenAITableUXPrimitive',
  'GenAIFollowUpSuggestionPillPrimitive',
  'GenAISearchResultPrimitive',
  'GenAIMetadataTextPrimitive',
  'GenAILatexItem',
  'GenAIPostPrimitive',
  'GenAIProductItemCard',
  // V1 names (submessage wire names from the fork's tokenizer family)
  'GenAIaeacdsnwHtmlPrimitive',
]);

/**
 * Primitives present in the corpus but NOT emitted by toUnified().
 * Each hit is a candidate "new rendering" to port into the fork.
 */
export function findNewPrimitives() {
  return primitiveCensus().filter((c) => !KNOWN_PRIMITIVES.has(c.name));
}

/** Recent captures for the .sniff list view. */
export function recentCaptures(limit = 15) {
  try {
    return recentStmt.all(Math.max(1, Number(limit) || 15));
  } catch {
    return [];
  }
}

/** Full stored row (decoded + raw) by message id. */
export function getCapture(id) {
  try {
    const row = byIdStmt.get(String(id));
    if (!row) return null;
    return {
      ...row,
      decoded: row.decoded ? JSON.parse(row.decoded) : null,
      raw: row.raw ? reviveBytes(JSON.parse(row.raw)) : null,
    };
  } catch {
    return null;
  }
}

/** Wipes the corpus (`.sniff clear`). */
export function clearCaptures() {
  try { clearStmt.run(); return true; } catch { return false; }
}

/**
 * Builds a relayable copy of an archived payload for mutation testing:
 * `.sniff replay <id>` → re-sends the exact rich content to the same chat.
 * generateUnifiedResponseContent(quoted, captured) round-trips an existing
 * rich message — we use the raw stored content directly instead, so
 * bit-for-bit fidelity (the archived copy is what actually rendered).
 */
export async function replayCapture(sock, id, jid) {
  const row = getCapture(id);
  if (!row?.raw) return { ok: false, reason: 'capture not found or no raw payload' };

  // row.raw is revived plain data ({ __bytes } tags already turned back
  // into Buffers), shaped like a fresh proto decode — relay verbatim.
  const messageId = generateMessageIDV2();
  await sock.relayMessage(jid, row.raw, { messageId });
  return { ok: true, messageId, typename: row.typename };
}

/**
 * Extracts the body text from a rich payload (for .sniff grep previews).
 */
export function richPreviewText(messageContent, max = 200) {
  const rich = extractRichPayload(messageContent);
  if (!rich) return '';
  const decoded = decodeUnifiedData(rich.richResponseMessage.unifiedResponse?.data);
  if (decoded) {
    const texts = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.text === 'string') texts.push(node.text);
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(decoded.sections);
    return texts.join(' ').slice(0, max);
  }
  return '';
}

export const richSniffer = {
  db,
  bind: bindRichSniffer,
  recordCapture,
  captureFromContent,
  findQuotedContext,
  sniffStats,
  primitiveCensus,
  findNewPrimitives,
  recentCaptures,
  getCapture,
  clearCaptures,
  replayCapture,
  readEventLog,
  clearEventLog,
  eventLogPath,
};

export default richSniffer;
