/**
 * test-rich-sniffer.mjs — offline round-trip test for src/lib/richSniffer.js.
 *
 * No network, no WhatsApp session: builds a synthetic botForwardedMessage
 * rich payload (V2 base64 unifiedResponse, the Meta AI shape) with a
 * primitive the fork does NOT emit (GenAIImagineWithTextPrimitive — a
 * plausible-but-unknown shape), then walks the exact chain the .sniff
 * commands use:
 *
 *   recordCapture → sniffStats → primitiveCensus → findNewPrimitives →
 *   getCapture → replay content rebuild
 *
 * Asserts each hop and prints a table. Run:
 *   node scripts/test-rich-sniffer.mjs
 * (cwd must be repo root — the store lives under data/richsniff.db;
 *  the test wipes its own captures first so it never pollutes a real
 *  corpus... on a live bot the ids below never collide, and clear() is
 *  called before inserting, so the only rows are the test's.)
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

// Keep the test's captures isolated from any live corpus: point the store
// at a scratch db before importing the module (dbPath resolves at import).
const scratchDir = path.join(repoRoot, 'data');
fs.mkdirSync(scratchDir, { recursive: true });
const liveDb = path.join(scratchDir, 'richsniff.db');
const testDb = path.join(scratchDir, 'richsniff-test.db');
if (fs.existsSync(testDb)) fs.rmSync(testDb);
if (fs.existsSync(liveDb) && fs.statSync(liveDb).size > 0) {
  fs.copyFileSync(liveDb, testDb);
  fs.rmSync(liveDb); // restore after
}

let restore = () => {};
if (fs.existsSync(testDb)) {
  restore = () => fs.copyFileSync(testDb, liveDb);
}

// Isolate the persistent event log (recordCapture now appends verdicts
// there): point it at a scratch file BEFORE importing the module.
const testLog = path.join(scratchDir, 'richsniff-events-offline-test.log');
for (const f of [testLog, `${testLog}.old`]) if (fs.existsSync(f)) fs.rmSync(f);
process.env.RICH_SNIFF_LOG = testLog;
restore = (() => {
  const prev = restore;
  return () => {
    prev();
    for (const f of [testLog, `${testLog}.old`]) if (fs.existsSync(f)) fs.rmSync(f);
  };
})();

const {
  recordCapture,
  sniffStats,
  primitiveCensus,
  findNewPrimitives,
  getCapture,
  clearCaptures,
  replayCapture,
  extractRichPayload,
  decodeUnifiedData,
  analyzeUnified,
} = await import('../src/lib/richSniffer.js');

// ── Build the synthetic Meta-AI-style payload ───────────────────────────────

// A primitive the fork's toUnified() never emits — the discovery target.
const UNKNOWN_PRIMITIVE = 'GenAIImagineWithTextPrimitive';
const unified = {
  response_id: 'test-response-id',
  sections: [
    {
      view_model: {
        primitive: { text: '## Sniff test\nmarkdown body', __typename: 'GenAIMarkdownTextUXPrimitive' },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
    {
      view_model: {
        primitive: {
          image_url: 'https://example.com/x.jpg',
          caption: 'imagine with text',
          __typename: UNKNOWN_PRIMITIVE,
        },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
    {
      view_model: {
        primitives: [
          { prompt_text: 'again', prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' },
          { prompt_text: 'more', prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' },
        ],
        __typename: 'GenAIActionRowLayoutViewModel',
      },
    },
  ],
};
const data = Buffer.from(JSON.stringify(unified)).toString('base64');
const messageContent = {
  botForwardedMessage: {
    message: {
      richResponseMessage: {
        unifiedResponse: { data },
        submessages: [],
        contextInfo: {},
      },
    },
  },
};

// ── Chain assertions ────────────────────────────────────────────────────────

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  if (!cond) process.exitCode = 1;
};

// 0. Payload-level helpers on the synthetic message
const rich = extractRichPayload(messageContent);
check('extractRichPayload finds botForwardedMessage envelope', !!rich);
const decoded = decodeUnifiedData(rich.richResponseMessage.unifiedResponse.data);
check('decodeUnifiedData parses base64 JSON', decoded?.response_id === 'test-response-id');
const analysis = analyzeUnified(decoded);
check('analyzeUnified finds GenAI primitives', analysis.primitives.length >= 3, analysis.primitives.join(','));

// 1. Wipe + record
clearCaptures();
const before = sniffStats().total;
check('clearCaptures empties the store', before === 0, `total=${before}`);

const rowid = recordCapture({
  id: 'sniff-test-001',
  chat: '254700000000@s.whatsapp.net',
  sender: '254700000000@s.whatsapp.net',
  direction: 'in',
  messageContent,
});
check('recordCapture stores the payload', rowid >= 1, `rowid=${rowid}`);

const stats = sniffStats();
check('sniffStats counts 1 in / 0 out', stats.total === 1 && stats.in === 1 && stats.out === 0,
  `total=${stats.total} in=${stats.in} out=${stats.out}`);

// 2. Census + discovery
const census = primitiveCensus();
const names = census.map((c) => c.name);
check('census includes the markdown primitive', names.includes('GenAIMarkdownTextUXPrimitive'), names.join(','));
check('census includes the unknown primitive', names.includes(UNKNOWN_PRIMITIVE));

const news = findNewPrimitives();
check('findNewPrimitives flags the unknown primitive only',
  news.length === 1 && news[0].name === UNKNOWN_PRIMITIVE,
  `found: ${news.map((n) => n.name).join(',') || '(none)'}`);

// 3. Retrieve + rebuild replay content
const stored = getCapture('sniff-test-001');
check('getCapture returns the stored row', !!stored);
check('stored decoded unified matches source',
  stored?.decoded?.response_id === 'test-response-id'
  && stored?.decoded?.sections?.length === 3);
check('stored raw round-trips the envelope',
  stored?.raw?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data === data);

// replayCapture with a stub sock: relayMessage must receive the exact content
let relayed = null;
const stubSock = {
  relayMessage: async (jid, content, options) => {
    relayed = { jid, content, options };
  },
};
const replayResult = await replayCapture(stubSock, 'sniff-test-001', 'self@s.whatsapp.net');
check('replayCapture relays via sock.relayMessage', !!relayed && replayResult.ok === true);
check('replayed content is byte-faithful',
  relayed?.content?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse?.data === data);
check('replayCapture mints a fresh message id',
  typeof replayResult.messageId === 'string' && replayResult.messageId.length > 8);

// 4. V1 (submessage) payloads record too
const v1Content = {
  botForwardedMessage: {
    message: {
      richResponseMessage: {
        submessages: [{ messageType: 2, messageText: 'v1 text' }],
        contextInfo: {},
      },
    },
  },
};
recordCapture({ id: 'sniff-test-002', chat: 'g@us', sender: 's', direction: 'in', messageContent: v1Content });
const storedV1 = getCapture('sniff-test-002');
check('V1 submessage payload records with typename', storedV1?.typename === 'V1-submessages');

// 5. Non-rich messages are ignored
const ignored = recordCapture({ id: 'sniff-test-003', chat: 'x', sender: 'x', direction: 'in', messageContent: { conversation: 'hi' } });
check('non-rich message is ignored', ignored === -1 && sniffStats().total === 2);

// 6. The .crm ground-truth shape: extendedTextMessage + top-level
// messageContextInfo.botMetadata (bloksVersioningId = rich marker).
const crmShape = {
  extendedTextMessage: {
    text: 'Inline: $a^2 + b^2 = c^2$',
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
};
const crmRich = extractRichPayload(crmShape);
check('extractRichPayload recognizes the .crm botMetadata envelope',
  crmRich?.via === 'botMetadata' && crmRich?.text.includes('$a^2'));
recordCapture({ id: 'sniff-test-crm', chat: '13135588801@g.us', sender: 'ai', direction: 'in', messageContent: crmShape });
const storedCrm = getCapture('sniff-test-crm');
check('.crm shape stores with botMetadata-LaTeX typename',
  storedCrm?.typename === 'botMetadata-LaTeX'
  && storedCrm?.raw?.messageContextInfo?.botMetadata?.botRenderingConfigMetadata?.pixelDensity === 1.75);

// ── Report ──────────────────────────────────────────────────────────────────

clearCaptures();
restore();
if (fs.existsSync(testDb)) fs.rmSync(testDb);

console.log('\n── rich sniffer round-trip ──────────────────────');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  [${r.extra}]` : ''}`);
}
console.log(`───────────────────────────────────────────────\n`);
process.exit(process.exitCode || 0);
