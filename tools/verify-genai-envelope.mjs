#!/usr/bin/env node
/**
 * verify-genai-envelope.mjs — conformance check for src/lib/genaiRich.js.
 *
 * Asserts that the envelope we build is structurally identical to the captured
 * Meta AI botForwardedMessage payloads (botForwardedMessage-1..4), survives a
 * protobuf encode/decode round-trip, and parses back to readable text.
 *
 *   node tools/verify-genai-envelope.mjs
 *   node tools/verify-genai-envelope.mjs path/to/captured-payload.js   # diff key paths
 *
 * No captured signature material is stored here: the proof checks are limited
 * to byte length and the NIXEL tag prefix.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { proto } from 'baileys';
import * as g from '../src/lib/genaiRich.js';

let pass = 0;
const ok = (label) => { pass++; console.log(`  ✓ ${label}`); };

console.log('\nGenAI envelope conformance\n');

// ── 1. Build a payload that exercises every primitive ──────────────────────
const unified = g.buildUnifiedResponse({
  sections: [
    g.section(g.primitives.markdown('*hello*')),
    g.section(g.primitives.progress({ title: 'Processing' })),
    g.section(g.primitives.table({ title: 'T', headers: ['A', 'B'], rows: [['1', '2']] })),
    g.section(g.primitives.code({ code: 'x=1', language: 'python' })),
    g.section(g.primitives.html({ payload: '<b>hi</b>', url: 'https://wa.me', trustedSources: ['wa.me'] })),
  ],
  screens: [
    g.thoughtsScreen({ steps: [g.stepEntry('Step 1', 'started')] }),
    g.tabbedScreen({ title: 'Details', tabs: [g.tab({ id: 'a', header: 'Info', sections: [g.section(g.primitives.markdown('tab'))] })] }),
  ],
});
// messageSecret off so the key paths match the genuine captures exactly
const env = g.buildBotForwardedEnvelope({ unified, messageSecret: false });

// ── 2. Envelope shape (exact paths observed in the captures) ───────────────
const PATHS = [
  'messageContextInfo',
  'messageContextInfo.deviceListMetadata',
  'messageContextInfo.deviceListMetadataVersion',
  'messageContextInfo.botMetadata',
  'messageContextInfo.botMetadata.messageDisclaimerText',
  'messageContextInfo.botMetadata.botResponseId',
  'messageContextInfo.botMetadata.verificationMetadata.proofs[0].version',
  'messageContextInfo.botMetadata.verificationMetadata.proofs[0].useCase',
  'messageContextInfo.botMetadata.verificationMetadata.proofs[0].signature',
  'messageContextInfo.botMetadata.verificationMetadata.proofs[0].certificateChain[0]',
  'messageContextInfo.botMetadata.verificationMetadata.proofs[0].certificateChain[1]',
  'botForwardedMessage.message.richResponseMessage.messageType',
  'botForwardedMessage.message.richResponseMessage.unifiedResponse.data',
  'botForwardedMessage.message.richResponseMessage.contextInfo.forwardingScore',
  'botForwardedMessage.message.richResponseMessage.contextInfo.isForwarded',
  'botForwardedMessage.message.richResponseMessage.contextInfo.forwardedAiBotMessageInfo.botJid',
  'botForwardedMessage.message.richResponseMessage.contextInfo.forwardOrigin',
];
const getPath = (obj, path) =>
  path.split('.').reduce((acc, part) => {
    const m = part.match(/^(.*?)\[(\d+)\]$/);
    if (m) return acc?.[m[1]]?.[Number(m[2])];
    return acc?.[part];
  }, obj);

for (const p of PATHS) assert.notEqual(getPath(env, p), undefined, `missing ${p}`);
ok(`all ${PATHS.length} captured paths present`);
assert.equal(env.messageContextInfo.deviceListMetadataVersion, 2); ok('deviceListMetadataVersion = 2');
assert.equal(env.botForwardedMessage.message.richResponseMessage.messageType, 1); ok('messageType = 1');
assert.equal(env.botForwardedMessage.message.richResponseMessage.contextInfo.forwardOrigin, g.FORWARD_ORIGIN_AI_BOT); ok('forwardOrigin = 4 (META_AI)');
assert.equal(env.messageContextInfo.botMetadata.botResponseId, unified.response_id); ok('botResponseId mirrors response_id');
assert.equal(env.messageContextInfo.messageSecret, undefined); ok('messageSecret omitted in capture-faithful mode');
assert.ok(Buffer.isBuffer(g.buildBotForwardedEnvelope({ unified }).messageContextInfo.messageSecret)); ok('messageSecret injected by default (r18 render)');

// ── 3. Payload is bytes, not a base64 string ───────────────────────────────
const data = env.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
assert.ok(Buffer.isBuffer(data)); ok('unifiedResponse.data is a Buffer');
const decoded = JSON.parse(data.toString('utf8'));
assert.equal(decoded.__typename, 'GenAIUnifiedResponse'); ok('payload __typename');
assert.equal(decoded.sections.length, 5); ok('5 sections encoded');
assert.equal(decoded.embedded_screens.length, 2); ok('2 embedded screens encoded');

// base64 variant (NEXORA's device-proven shape in htmlGames.js)
const b64Env = g.buildBotForwardedEnvelope({ unified, dataEncoding: 'base64', messageSecret: false });
const b64 = b64Env.botForwardedMessage.message.richResponseMessage.unifiedResponse.data.toString('utf8');
assert.deepEqual(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')), JSON.parse(decoded ? JSON.stringify(decoded) : '{}'));
ok('dataEncoding=base64 round-trips to the same payload');

// ── 4. Proof byte layout (tag + total length, as captured) ─────────────────
const proof = env.messageContextInfo.botMetadata.verificationMetadata.proofs[0];
assert.equal(proof.signature.length, 64); ok('signature = 64 bytes');
assert.deepEqual(proof.certificateChain.map((c) => c.length), [684, 892]); ok('certificateChain = [684, 892] bytes');
assert.ok(proof.signature.toString('latin1').startsWith('NIXEL.MessageBuilderV4.7-VerificationSignature.Metadata')); ok('signature tag prefix');
assert.ok(proof.certificateChain[0].toString('latin1').startsWith('NIXEL.MessageBuilderV4.7-CertificateChain.Metadata')); ok('certificate tag prefix');

// ── 5. Protobuf round-trip ─────────────────────────────────────────────────
const wire = proto.Message.encode(proto.Message.create(env)).finish();
const back = proto.Message.decode(wire);
ok(`proto round-trip (${wire.length} bytes)`);
assert.equal(back.botForwardedMessage.message.richResponseMessage.messageType, 1);
assert.equal(Number(back.botForwardedMessage.message.richResponseMessage.contextInfo.forwardOrigin), g.FORWARD_ORIGIN_AI_BOT);
ok('decoded contextInfo.forwardOrigin = 4 (META_AI)');
assert.equal(back.messageContextInfo.botMetadata.verificationMetadata.proofs[0].certificateChain.length, 2);
ok('decoded proofs survive');

// ── 6. Parse back to text (this is what incoming messages hit) ─────────────
const parsed = g.parseGenAIMessage(back);
assert.ok(parsed.isGenAI); ok('parseGenAIMessage detects envelope');
assert.match(parsed.text, /\*hello\*/); ok('markdown decoded');
assert.match(parsed.text, /Step 1: started/); ok('thought steps decoded');
assert.match(parsed.text, /x=1/); ok('code primitive decoded');
assert.equal(parsed.botJid, g.GENAI_BOT_JID); ok('botJid decoded');

// ── 7. Optional: diff key paths against a real capture ────────────────────
const capturePath = process.argv[2];
if (capturePath) {
  let src = fs.readFileSync(capturePath, 'utf8').trim().replace(/^>\s*/, '').replace(/^=>\s*/, '');
  let captured = null;
  const ctx = {
    Buffer, setTimeout, clearTimeout, console,
    m: { chat: 'x' },
    conn: { relayMessage: async (...a) => { captured = a; return 'ID'; } },
  };
  vm.createContext(ctx);
  vm.runInContext('(async()=>{' + src + '})()', ctx, { timeout: 5000 });
  assert.ok(captured, 'capture evaluated');
  const walk = (o, prefix = '', out = new Set()) => {
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) {
      const v = o[k];
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) && !(v instanceof Uint8Array)) {
        walk(v, p, out);
      } else {
        out.add(p.replace(/\.\d+\./g, '.[].'));
      }
    }
    return out;
  };
  const a = walk(env);
  const b = walk(captured[1]);
  const missing = [...b].filter((x) => !a.has(x));
  const extra = [...a].filter((x) => !b.has(x));
  console.log(`\n  capture: ${capturePath}`);
  console.log(`  paths only in capture (${missing.length}): ${missing.join(', ') || 'none'}`);
  console.log(`  paths only in ours    (${extra.length}): ${extra.join(', ') || 'none'}`);
  if (missing.length || extra.length) process.exitCode = 1;
}

console.log(`\n${pass} checks passed${process.exitCode ? ' — path diff above needs attention' : ''}\n`);
