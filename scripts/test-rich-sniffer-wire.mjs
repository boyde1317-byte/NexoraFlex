/**
 * test-rich-sniffer-wire.mjs — the event-path test the original harness lacked.
 *
 * Proves the full incoming chain with REAL wire bytes, no shortcuts:
 *
 *   fork encoder (proto encode) → WIRE BYTES → fork decoder (proto decode)
 *   → messages.upsert event → bindRichSniffer hook → recordCapture → corpus
 *
 * Three envelope variants, because the whole "0 captures" bug was a shape
 * the sniffer didn't recognize:
 *   A. botForwardedMessage → richResponseMessage (the fork's emit shape)
 *   B. flat top-level richResponseMessage (proto allows it: Message has the
 *      direct field) — previously dropped → your 0-capture symptom
 *   C. base64-string data via fromObject (how the fork's own builders pass
 *      it) vs Uint8Array data after decode — both must census correctly
 *
 * Plus: V1 submessages, non-rich noise (must be ignored), outgoing patch
 * path (sendMessage with rich content), diagnostics counters, and the
 * byte-faithful replay. Run: node scripts/test-rich-sniffer-wire.mjs
 * (cwd must be repo root; uses a scratch db, restores the live corpus).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

// ── isolate the store exactly like the original test does ───────────────────
const scratchDir = path.join(repoRoot, 'data');
fs.mkdirSync(scratchDir, { recursive: true });
const liveDb = path.join(scratchDir, 'richsniff.db');
const testDb = path.join(scratchDir, 'richsniff-wire-test.db');
for (const f of [testDb, `${testDb}-wal`, `${testDb}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
if (fs.existsSync(liveDb)) fs.copyFileSync(liveDb, testDb);

const restore = () => {
  for (const f of [testDb, `${testDb}-wal`, `${testDb}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
};
process.on('exit', restore);

// Isolate the persistent event log the same way: never touch the live
// data/richsniff-events.log (the test clears it, which would eat real data).
const testLog = path.join(scratchDir, 'richsniff-events-test.log');
for (const f of [testLog, `${testLog}.old`]) if (fs.existsSync(f)) fs.rmSync(f);
process.env.RICH_SNIFF_LOG = testLog; // must be set BEFORE the module import

const {
  bindRichSniffer,
  recordCapture,
  sniffStats,
  primitiveCensus,
  findNewPrimitives,
  getCapture,
  clearCaptures,
  replayCapture,
  extractRichPayload,
  decodeUnifiedData,
  sniffDiagnostics,
  lastRawIncoming,
  readEventLog,
  clearEventLog,
  eventLogPath,
} = await import('../src/lib/richSniffer.js');

// fork proto (locally linked) for true encode/decode round-trips
const { proto } = await import('baileys/WAProto/index.js');

// ── build a unified payload with a known + an unknown primitive ────────────
const KNOWN = 'GenAIMarkdownTextUXPrimitive';
const UNKNOWN = 'GenAIImagineWithTextPrimitive';
const unified = {
  response_id: 'wire-test-response',
  sections: [
    {
      view_model: {
        primitive: { text: '## Wire test\ntrue bytes', __typename: KNOWN },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
    {
      view_model: {
        primitive: { image_url: 'https://example.com/x.jpg', __typename: UNKNOWN },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
  ],
};
const unifiedJson = JSON.stringify(unified);
const base64Data = Buffer.from(unifiedJson).toString('base64');

// ── helper: stub socket with a real baileys-style event emitter ───────────
const makeStubSock = () => {
  const handlers = {};
  return {
    user: { id: '254700000000:5@s.whatsapp.net' },
    ev: {
      on: (name, fn) => { (handlers[name] ||= []).push(fn); },
      emit: (name, arg) => { for (const fn of handlers[name] || []) fn(arg); },
    },
    sendMessage: async () => ({ key: { id: 'out-' + Date.now() } }),
    relayMessage: async () => ({}),
  };
};

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  if (!cond) process.exitCode = 1;
};

clearCaptures();

// ══ VARIANT A: botForwardedMessage envelope, REAL proto round-trip ══════════
// This is what the fork emits; encode to wire bytes, decode back — exactly
// what messages.upsert delivers on a real socket.
const wireA = proto.Message.encode(proto.Message.fromObject({
  botForwardedMessage: {
    message: {
      richResponseMessage: {
        messageType: 1,
        submessages: [],
        unifiedResponse: { data: base64Data }, // fromObject: base64 string → wire bytes (raw JSON)
        contextInfo: {},
      },
    },
  },
})).finish();
const decodedA = proto.Message.decode(wireA);
const dataA = decodedA.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
check('A: wire decode yields Uint8Array data', dataA instanceof Uint8Array);

const sockA = makeStubSock();
bindRichSniffer(sockA);
sockA.ev.emit('messages.upsert', {
  messages: [{
    key: { id: 'wire-A-001', remoteJid: '13135588801@g.us', participant: '254700000000@s.whatsapp.net' },
    message: decodedA,
  }],
});
check('A: botForwardedMessage payload captured via messages.upsert', sniffStats().in === 1, `in=${sniffStats().in}`);
const storedA = getCapture('wire-A-001');
check('A: decoded unified survives wire round-trip',
  storedA?.decoded?.response_id === 'wire-test-response'
  && storedA?.decoded?.sections?.length === 2);
check('A: census sees both primitives',
  primitiveCensus().some((c) => c.name === KNOWN) && primitiveCensus().some((c) => c.name === UNKNOWN));
check('A: discovery flags only the unknown',
  findNewPrimitives().length === 1 && findNewPrimitives()[0].name === UNKNOWN);
check('A: extractRichPayload reports via=botForwardedMessage',
  extractRichPayload(decodedA)?.via === 'botForwardedMessage');

// ══ VARIANT B: flat top-level richResponseMessage (the 0-capture fix) ═════
const wireB = proto.Message.encode(proto.Message.fromObject({
  richResponseMessage: {
    messageType: 1,
    submessages: [],
    unifiedResponse: { data: base64Data },
    contextInfo: {},
  },
})).finish();
const decodedB = proto.Message.decode(wireB);
check('B: flat envelope decodes', !!decodedB.richResponseMessage);

const sockB = makeStubSock();
bindRichSniffer(sockB);
sockB.ev.emit('messages.upsert', {
  messages: [{
    key: { id: 'wire-B-001', remoteJid: '254711122233@s.whatsapp.net' },
    message: decodedB,
  }],
});
check('B: FLAT richResponseMessage captured (the 0-capture bug)',
  sniffStats().in === 2, `in=${sniffStats().in}`);
check('B: flat capture censuses the unknown primitive',
  getCapture('wire-B-001')?.decoded?.sections?.length === 2);
check('B: extractRichPayload reports via=richResponseMessage',
  extractRichPayload(decodedB)?.via === 'richResponseMessage');

// ══ VARIANT C: base64 STRING data (pre-decode / sendMessage patch shape) ══
const sockC = makeStubSock();
bindRichSniffer(sockC);
// outgoing path: sendMessage patch must recognize + store
await sockC.sendMessage('254711122233@s.whatsapp.net', {
  botForwardedMessage: {
    message: { richResponseMessage: { unifiedResponse: { data: base64Data }, submessages: [] } },
  },
}, { messageId: 'wire-C-out-001' });
const statsC = sniffStats();
check('C: outgoing rich sendMessage captured (base64-string data)',
  statsC.out === 1, `out=${statsC.out}`);
check('C: outgoing capture decodes base64-string data',
  getCapture('wire-C-out-001')?.decoded?.response_id === 'wire-test-response');

// ══ V1 submessages, noise, diag, raw, replay ═══════════════════════════════
const v1Wire = proto.Message.encode(proto.Message.fromObject({
  botForwardedMessage: {
    message: {
      richResponseMessage: {
        messageType: 1,
        submessages: [{ messageType: 2, messageText: 'v1 wire text' }],
        contextInfo: {},
      },
    },
  },
})).finish();
const sockD = makeStubSock();
bindRichSniffer(sockD);
sockD.ev.emit('messages.upsert', {
  messages: [
    { key: { id: 'wire-D-001', remoteJid: 'x@s.whatsapp.net' }, message: proto.Message.decode(v1Wire) },
    { key: { id: 'wire-D-002', remoteJid: 'x@s.whatsapp.net' }, message: { conversation: 'plain text' } },
    { key: { id: 'wire-D-003', remoteJid: 'x@s.whatsapp.net' }, message: { imageMessage: { url: 'https://x' } } },
  ],
});
check('D: V1 submessage wire payload captured',
  getCapture('wire-D-001')?.typename === 'V1-submessages');
check('D: noise messages ignored (conversation/imageMessage)',
  sniffStats().total === 4, `total=${sniffStats().total}`);

const diag = sniffDiagnostics();
check('D: diagnostics counters track the event path',
  diag.counters.upserts >= 3 && diag.counters.messages >= 5 && diag.counters.richSeen >= 3,
  JSON.stringify(diag.counters));
check('D: lastRawIncoming keeps the last envelope for .sniff raw',
  !!lastRawIncoming() && !!lastRawIncoming().imageMessage);

let relayed = null;
sockD.relayMessage = async (jid, content) => { relayed = { jid, content }; };
const replay = await replayCapture(sockD, 'wire-B-001', 'self@s.whatsapp.net');
const replayData = relayed?.content?.richResponseMessage?.unifiedResponse?.data;
check('E: replay of wire-captured payload is byte-faithful',
  replay.ok && replayData instanceof Uint8Array
  && decodeUnifiedData(replayData)?.response_id === 'wire-test-response');
check('E: replayed bytes proto-encode back to the ORIGINAL wire bytes',
  (() => {
    try {
      const reEnc = proto.Message.encode(proto.Message.fromObject(relayed.content)).finish();
      // fromObject expects base64 for bytes; compare after that convention
      const origWire = proto.Message.encode(proto.Message.fromObject({
        richResponseMessage: { messageType: 1, submessages: [], unifiedResponse: { data: base64Data }, contextInfo: {} },
      })).finish();
      return Buffer.compare(Buffer.from(reEnc), Buffer.from(origWire)) === 0;
    } catch { return false; }
  })());
check('E: replay mints a fresh message id', typeof replay.messageId === 'string' && replay.messageId.length > 8);

// ══ VARIANT F: the .crm ground-truth envelope ══════════════════════════════
// Live-captured Meta AI reply: plain extendedTextMessage (LaTeX in text) +
// top-level messageContextInfo.botMetadata.botRenderingConfigMetadata.
// bloksVersioningId is the rich marker — NO richResponseMessage on the wire.
// Wire-verified with the fork's own proto: encode → decode → upsert → store.
const crmText = 'Inline: $a^2 + b^2 = c^2$ \\n\\nDisplay:\\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}';
const wireF = proto.Message.encode(proto.Message.fromObject({
  extendedTextMessage: {
    text: crmText,
    previewType: 0,
    contextInfo: { botMessageSharingInfo: { forwardScore: 0 } },
    inviteLinkGroupTypeV2: 0,
  },
  messageContextInfo: {
    botMetadata: {
      botRenderingConfigMetadata: {
        bloksVersioningId: '62ac1a93002e9ad62773682f000af1fa870e001f760e8ace0ca2bb3010a83f62',
        pixelDensity: 1.75,
      },
    },
  },
})).finish();
const decodedF = proto.Message.decode(wireF);
check('F: .crm envelope decodes with botMetadata intact',
  !!decodedF.messageContextInfo?.botMetadata?.botRenderingConfigMetadata?.bloksVersioningId);

const sockF = makeStubSock();
bindRichSniffer(sockF);
clearEventLog();
sockF.ev.emit('messages.upsert', {
  messages: [
    {
      key: { id: 'crm-F-001', remoteJid: '13135588801@g.us', participant: '254700000000@s.whatsapp.net' },
      message: decodedF,
    },
    { key: { id: 'crm-F-002', remoteJid: '13135588801@g.us' }, message: { conversation: 'noise' } },
  ],
});
check('F: .crm botMetadata payload captured via messages.upsert',
  getCapture('crm-F-001')?.typename === 'botMetadata-LaTeX', `typename=${getCapture('crm-F-001')?.typename}`);
check('F: extractRichPayload reports via=botMetadata with text',
  extractRichPayload(decodedF)?.via === 'botMetadata'
  && extractRichPayload(decodedF)?.text === crmText);
check('F: stored raw round-trips bloksVersioningId',
  getCapture('crm-F-001')?.raw?.messageContextInfo?.botMetadata?.botRenderingConfigMetadata?.bloksVersioningId
    === '62ac1a93002e9ad62773682f000af1fa870e001f760e8ace0ca2bb3010a83f62');
check('F: diagnostics counted the botMeta path',
  sniffDiagnostics().counters.botMeta >= 1 && sniffDiagnostics().counters.botMetaStore >= 1,
  JSON.stringify(sniffDiagnostics().counters));

// ── G: persistent event log — verdicts, errors, skip census ────────────────
const logEntries = readEventLog(50);
check('G: event log records the .crm capture verdict',
  logEntries.some((e) => e.kind === 'capture' && e.id === 'crm-F-001' && e.via === 'botMetadata'));
check('G: event log records skip verdicts with envelope shape',
  logEntries.some((e) => e.kind === 'skip' && e.reason === 'no-rich-marker' && typeof e.shape === 'string' && e.shape.length > 0));
check('G: eventLogPath is a real file that exists',
  typeof eventLogPath() === 'string' && fs.existsSync(eventLogPath()));
check('G: log rotation/clear works', clearEventLog() === true && readEventLog(10).length === 0);

// storeError logging: a BigInt inside the content makes JSON.stringify
// throw (TypeError: Do not know how to serialize a BigInt) — a realistic
// poison (decoded int64 fields can surface as BigInt-ish values) that
// leaves the global JSON intact, so logLine itself still works.
const poisonSock = makeStubSock();
bindRichSniffer(poisonSock);
const poisoned = recordCapture({
  id: 'poison-001', chat: 'x', sender: 'x', direction: 'in',
  messageContent: { richResponseMessage: { unifiedResponse: { data: base64Data } }, weirdField: 10n },
});
check('G: poisoned store returns -1 without throwing', poisoned === -1);
check('G: storeError lands in the event log',
  readEventLog(20).some((e) => e.kind === 'storeError' && /BigInt/.test(String(e.error))));
clearEventLog();

// ── report ─────────────────────────────────────────────────────────────────
console.log('\n── rich sniffer WIRE round-trip (proto-verified event path) ──');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  [${r.extra}]` : ''}`);
console.log('───────────────────────────────────────────────────────────────\n');
process.exit(process.exitCode || 0);
