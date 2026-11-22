/**
 * sniff.js — .sniff — the AI-rich rendering safari dashboard.
 *
 * Owner-only inspection front-end for src/lib/richSniffer.js:
 *
 *   .sniff                   → stats + primitive census + recent captures
 *   .sniff new               → discovery list: primitives in the corpus the
 *                              fork's toUnified() can NOT emit yet (port targets)
 *   .sniff list              → recent captures with ids
 *   .sniff dump <id>         → full JSON document (decoded unified + raw proto)
 *   .sniff replay <id>       → re-relay an archived payload verbatim (mutation
 *                              testing: edit a copy, compare renderings)
 *   .sniff code <id>         → paste a captured code primitive as a Nexora
 *                              code card and send the saved source file
 *   .sniff log [n|clear]     → persistent capture verdict trail (JSONL): every
 *                              message's verdict + every swallowed error
 *   .sniff clear             → wipe the corpus
 *
 * Capture paths (any one fills the corpus): Meta AI's own replies (rich/
 * botMetadata envelopes) AND tags — reply to any rich message and the
 * quoted payload is captured under the original's stanzaId.
 *
 * The capture layer itself is bound at socket startup (connection.js calls
 * bindRichSniffer(sock) next to bindCrmStore(sock)), so the corpus fills
 * passively: chat with Meta AI from the linked number, and every rich reply
 * is archived with its full decoded unifiedResponse.
 *
 * Follows the crm.js inspection contract: reply-to-a-message works for
 * dump/replay (uses the replied message id), documents go out as .json
 * files with a metadata caption, and everything has a text fallback.
 */
import fs from 'node:fs';
import { richCodeCard } from '../../lib/interactiveKit.js';
import {
  sniffStats,
  primitiveCensus,
  findNewPrimitives,
  recentCaptures,
  allCaptures,
  getCapture,
  clearCaptures,
  replayCapture,
  sniffDiagnostics,
  lastRawIncoming,
  readEventLog,
  clearEventLog,
  eventLogPath,
} from '../../lib/richSniffer.js';
import {
  buildJavascriptSource,
  extractCodeSnippet,
  shortNameFor,
  snippetDirectory,
  snippetFileName,
} from '../../lib/sniffSnippet.js';

export default {
  name: 'sniff',
  aliases: ['richsniff', 'safari'],
  category: 'owner',
  description: 'AI-rich payload sniffer: census, discovery, code export, dump, replay. Usage: .sniff [new|list|code|dump|replay|clear]',
  permissions: { owner: true },
  cooldown: 3000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const cmd = (args[0] || '').toLowerCase();
    const targetId = args[1] || m.quoted?.key?.id || m.quoted?.id;

    // ── .sniff log [n|clear] — the persistent capture verdict trail ─────
    // Every messages.upsert verdict and every swallowed error, appended to
    // data/richsniff-events.log and surviving restarts. This is the file
    // to read when the corpus is empty but traffic flowed: each skipped
    // message appears as a `skip` line with the envelope's top-level keys
    // in `shape` — the exact list of fields a new detector must match.
    if (cmd === 'log') {
      if ((args[1] || '').toLowerCase() === 'clear') {
        const ok = clearEventLog();
        return m.reply(ok ? 'Event log wiped.' : 'Event log wipe failed.');
      }
      const n = Number(args[1]) || 15;
      const entries = readEventLog(n);
      if (!entries.length) {
        return m.reply(`Event log is empty. Nothing has flowed through the capture path yet (log: \`${eventLogPath()}\`).`);
      }
      const kinds = {};
      for (const e of entries) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      const lines = entries.slice(-10).map((e) => {
        const who = e.jid ? ` jid=${String(e.jid).split('@')[0]}` : e.id ? ` id=${String(e.id).slice(0, 10)}…` : '';
        const bits = [`• ${e.kind}${who}`];
        if (e.taggedBy) bits.push(`taggedBy=${String(e.taggedBy).slice(0, 10)}…`);
        if (e.via) bits.push(`via=${e.via}`);
        if (e.reason) bits.push(`reason=${e.reason}`);
        if (e.shape) bits.push(`shape=${e.shape}`);
        if (e.error) bits.push(`err=${String(e.error).slice(0, 60)}`);
        return bits.join(' ');
      });
      return m.reply(
        `*CAPTURE EVENT LOG* (last ${entries.length} of persistent file)\n` +
        `kinds: ${Object.entries(kinds).map(([k, c]) => `${k}×${c}`).join(' ')}\n\n` +
        `${lines.join('\n')}\n\nFull file: \`${eventLogPath()}\` — \`${p}sniff log 50\` for more lines, \`${p}sniff log clear\` to wipe.`
      );
    }

    // ── .sniff diag — capture-path telemetry ────────────────────────────
    // Answers "why is the corpus empty" with counters: upserts seen vs
    // messages inspected vs rich envelopes recognized vs stored. A large
    // `messages` with `richSeen: 0` means the payloads arrive in an
    // envelope we don't parse yet — dump one with .sniff dump and port it.
    if (cmd === 'diag') {
      const d = sniffDiagnostics();
      const c = d.counters;
      const ratio = c.messages ? Math.round(((c.richSeen + c.botMeta + c.quotedSeen) / c.messages) * 100) : 0;
      const lines = [
        `tap: ${d.level}`,
        `upsert batches: ${c.upserts}`,
        `messages inspected: ${c.messages}`,
        `rich envelopes seen: ${c.richSeen + c.botMeta + c.quotedSeen} (${ratio}% of messages)`,
        `  · richResponseMessage: ${c.richSeen}`,
        `  · botMetadata (LaTeX text): ${c.botMeta}`,
        `  · tagged (quoted rich): ${c.quotedSeen}`,
        `stored: ${c.richStore + c.botMetaStore + c.quotedStore + c.outStore} (in ${c.richStore + c.botMetaStore + c.quotedStore} / out ${c.outStore})`,
        `tag dupes skipped: ${c.quotedDup}`,
        `store failures: ${c.richStoreFail}`,
        `capture-path errors: ${c.errors}`,
        `event log: ${eventLogPath()}`,
      ];
      if (d.events.length) {
        lines.push('', '*last events:*');
        for (const e of d.events.slice(-8)) {
          lines.push(`• ${e.kind}${e.id ? ` id=${String(e.id).slice(0, 10)}…` : e.jid ? ` jid=${String(e.jid).split('@')[0]}` : ''}`);
        }
      }
      return m.reply(`*CAPTURE TELEMETRY*\n\n${lines.join('\n')}\n\nTip: tag (reply to) any Meta AI message to capture it — the quoted payload rides inside the tag's contextInfo. If counters stay 0: \`${p}sniff log\` for the persistent verdict trail, or \`${p}sniff raw\` right after a reply arrives.`);
    }

    // ── .sniff raw — grab the last incoming message verbatim ────────────
    // Emergency hatch when diag shows richSeen: 0 — captures whatever the
    // socket last delivered (post-unwrapContainers) so we can see the real
    // envelope shape offline and port extractRichPayload to it.
    if (cmd === 'raw') {
      const last = lastRawIncoming();
      if (!last) {
        return m.reply('No raw message captured yet. Send some traffic (chat with Meta AI), then `.sniff raw` again.');
      }
      // Same normalizeBytes tagging as the store: bypasses proto toJSON so
      // the JSON shows the REAL envelope shape (bytes as tagged base64).
      const payload = JSON.stringify(last, (_, v) => {
        if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __bytes: Buffer.from(v).toString('base64') };
        return v;
      });
      return sock.sendMessage(m.from, {
        document: Buffer.from(payload),
        fileName: 'raw-message.json',
        mimetype: 'application/json',
        caption: `Last incoming message content (${Object.keys(last).join(', ')}) — send this to the lab for envelope analysis.`,
      }, { quoted: m });
    }


    if (cmd === 'clear') {
      const ok = clearCaptures();
      return m.reply(ok ? 'Corpus wiped.' : 'Corpus wipe failed.');
    }

    // ── .sniff new — the discovery list ──────────────────────────────────
    if (cmd === 'new') {
      const news = findNewPrimitives();
      if (!news.length) {
        return m.reply(
          `*No new primitives yet.*\n\nThe corpus contains nothing the fork's toUnified() can't already emit. Feed it: chat with Meta AI, then \`${p}sniff new\` again.`
        );
      }
      const lines = news.map((c) =>
        `• ${c.name} ×${c.count} (rows: ${c.sampleRows.join(', ')})`);
      return m.reply(
        `*DISCOVERY — primitives the fork cannot emit yet:*\n\n${lines.join('\n')}\n\n\`${p}sniff dump\` the latest source message, port the shape into toUnified(), then mutation-test with \`${p}sniff replay\`.`
      );
    }

    // ── .sniff list — recent captures ────────────────────────────────────
    if (cmd === 'list') {
      const rows = recentCaptures(15);
      if (!rows.length) return m.reply('Corpus is empty. Chat with Meta AI from the linked number first.');
      const lines = rows.map((r) =>
        `${shortNameFor(r.rowid)} ${r.direction === 'in' ? '⬇' : '⬆'} ${(r.chat || '-').split('@')[0]} — ${r.typename ? `(${r.typename.split(',').slice(0, 2).join(',')})` : '(V1)'}`);
      return m.reply(`*Recent rich captures:*\n\n${lines.join('\n')}\n\nUse ${p}sniff code for the latest response, or ${p}savesniffs to export every capture.`);
    }

    // ── .sniff dump — full document for the latest/replied capture ───────
    if (cmd === 'dump') {
      const summary = targetId ? allCaptures(1000).find((item) => item.id === targetId) : recentCaptures(1)[0];
      const lookupId = summary?.id || targetId;
      if (!lookupId) return m.reply('No captured Meta AI response yet.');
      const row = getCapture(lookupId);
      if (!row) return m.reply(`No captured response found for ${shortNameFor(summary?.rowid)}.`);
      const name = shortNameFor(summary?.rowid || row.rowid);
      const payload = JSON.stringify({ decoded: row.decoded, raw: row.raw }, null, 2);
      return sock.sendMessage(m.from, {
        document: Buffer.from(payload),
        fileName: `${name}.json`,
        mimetype: 'application/json',
        caption: [
          `name: ${name}`,
          `chat: ${row.chat}`,
          `direction: ${row.direction}`,
          `typename: ${row.typename || '-'}`,
          `captured: ${new Date((row.created_at || 0) * 1000).toISOString()}`,
        ].join('\n'),
      }, { quoted: m });
    }

    // ── .sniff code|snippet|paste — paste + save the latest code primitive ─
    if (cmd === 'code' || cmd === 'snippet' || cmd === 'paste') {
      const summary = targetId ? allCaptures(1000).find((item) => item.id === targetId) : recentCaptures(1)[0];
      const lookupId = summary?.id || targetId;
      if (!lookupId) return m.reply('No captured Meta AI response yet.');
      const row = getCapture(lookupId);
      if (!row) return m.reply(`No captured response found for ${shortNameFor(summary?.rowid)}.`);
      const name = shortNameFor(summary?.rowid || row.rowid);
      const snippet = extractCodeSnippet(row.decoded, row.raw);
      if (!snippet) {
        return m.reply(`${name} has no code snippet. Use ${p}sniff dump to inspect the latest full payload.`);
      }
      const directory = snippetDirectory();
      fs.mkdirSync(directory, { recursive: true });
      const filePath = `${directory}/${snippetFileName(name)}`;
      const source = buildJavascriptSource({ name, row, snippet });
      fs.writeFileSync(filePath, source, 'utf8');
      const caption = `Meta AI snippet • ${name}\nLanguage: ${snippet.language}\nSaved file: ${filePath}`;
      try {
        await richCodeCard(sock, m.from, {
          code: snippet.code,
          language: snippet.language,
          caption: `NEXORA CODE SNIPPET • ${name}`,
          footer: 'Captured by NEXORA • use the attached file for the complete source',
          copyable: snippet.code.length <= 4096,
        }, { quoted: m });
      } catch (err) {
        console.warn('[sniff] rich code card failed:', err.message || err);
        await m.reply(`*NEXORA CODE SNIPPET*\n\n\`\`\`${snippet.language}\n${snippet.code.slice(0, 6000)}\n\`\`\``);
      }
      return sock.sendMessage(m.from, {
        document: Buffer.from(source, 'utf8'),
        fileName: snippetFileName(name),
        mimetype: 'application/javascript',
        caption,
      }, { quoted: m });
    }

    // ── .sniff replay — mutation testing for the latest/replied capture ──
    if (cmd === 'replay') {
      const replayTarget = targetId || recentCaptures(1)[0]?.id;
      if (!replayTarget) return m.reply('No captured Meta AI response yet.');
      const result = await replayCapture(sock, replayTarget, m.from);
      if (!result.ok) return m.reply.error(`Replay failed: ${result.reason}`);
      return m.reply(`Replayed \`${String(targetId).slice(0, 24)}…\` to this chat.\nNew id: ${result.messageId}\nPayload: ${result.typename || 'unknown primitives'}`);
    }

    // ── .sniff — the dashboard ───────────────────────────────────────────
    const stats = sniffStats();
    const census = primitiveCensus();
    const news = findNewPrimitives();
    const recent = recentCaptures(5);

    const censusLines = census.length
      ? census.slice(0, 12).map((c) => `• ${c.name} ×${c.count}`)
      : ['(empty — chat with Meta AI from the linked number to fill the corpus)'];

    const recentLines = recent.length
      ? recent.map((r) => `${shortNameFor(r.rowid)} ${r.direction === 'in' ? '⬇' : '⬆'} ${r.typename ? `(${r.typename.split(',').slice(0, 2).join(',')})` : '(V1)'}`)
      : ['(no captures yet)'];

    return m.reply(
      `*AI-RICH SNIFFER*\n\n` +
      `Corpus: ${stats.total} captures (${stats.in} in / ${stats.out} out)\n` +
      `New primitives: ${news.length ? `**${news.length} found** — \`${p}sniff new\`` : 'none yet'}\n\n` +
      `*Primitive census:*\n${censusLines.join('\n')}\n\n` +
      `*Recent:*\n${recentLines.join('\n')}\n\n` +
      `\`${p}sniff new\` discovery · \`${p}sniff list\` captures · \`${p}sniff code\` latest snippet · \`${p}savesniffs\` export all · \`${p}sniff diag\` telemetry · \`${p}sniff log\` verdict trail · \`${p}sniff raw\` last envelope · \`${p}sniff dump\` · \`${p}sniff replay\` · \`${p}sniff clear\``
    );
  },
};
