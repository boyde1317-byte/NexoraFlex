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
 *   .sniff clear             → wipe the corpus
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
import {
  sniffStats,
  primitiveCensus,
  findNewPrimitives,
  recentCaptures,
  getCapture,
  clearCaptures,
  replayCapture,
  sniffDiagnostics,
  lastRawIncoming,
} from '../../lib/richSniffer.js';

export default {
  name: 'sniff',
  aliases: ['richsniff', 'safari'],
  category: 'owner',
  description: 'AI-rich payload sniffer: census, discovery, dump, replay. Usage: .sniff [new|list|dump|replay|clear] [id]',
  permissions: { owner: true },
  cooldown: 3000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const cmd = (args[0] || '').toLowerCase();
    const targetId = args[1] || m.quoted?.key?.id || m.quoted?.id;

    // ── .sniff diag — capture-path telemetry ────────────────────────────
    // Answers "why is the corpus empty" with counters: upserts seen vs
    // messages inspected vs rich envelopes recognized vs stored. A large
    // `messages` with `richSeen: 0` means the payloads arrive in an
    // envelope we don't parse yet — dump one with .sniff dump and port it.
    if (cmd === 'diag') {
      const d = sniffDiagnostics();
      const c = d.counters;
      const ratio = c.messages ? Math.round((c.richSeen / c.messages) * 100) : 0;
      const lines = [
        `tap: ${d.level}`,
        `upsert batches: ${c.upserts}`,
        `messages inspected: ${c.messages}`,
        `rich envelopes seen: ${c.richSeen} (${ratio}% of messages)`,
        `stored: ${c.richStore + c.outStore} (in ${c.richStore} / out ${c.outStore})`,
        `store failures: ${c.richStoreFail}`,
      ];
      if (d.events.length) {
        lines.push('', '*last events:*');
        for (const e of d.events.slice(-8)) {
          lines.push(`• ${e.kind}${e.id ? ` id=${String(e.id).slice(0, 10)}…` : e.jid ? ` jid=${String(e.jid).split('@')[0]}` : ''}`);
        }
      }
      return m.reply(`*CAPTURE TELEMETRY*\n\n${lines.join('\n')}\n\nIf richSeen stays 0 while you chat with Meta AI: send \`${p}sniff raw\` right after a Meta AI reply arrives.`);
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
        `*DISCOVERY — primitives the fork cannot emit yet:*\n\n${lines.join('\n')}\n\n\`${p}sniff dump <id>\` a source message, port the shape into toUnified(), then mutation-test with \`${p}sniff replay\`.`
      );
    }

    // ── .sniff list — recent captures ────────────────────────────────────
    if (cmd === 'list') {
      const rows = recentCaptures(15);
      if (!rows.length) return m.reply('Corpus is empty. Chat with Meta AI from the linked number first.');
      const lines = rows.map((r) =>
        `${r.rowid}. ${r.direction === 'in' ? '⬇' : '⬆'} ${(r.chat || '-').split('@')[0]} — ${r.id.slice(0, 12)}… ${r.typename ? `(${r.typename.split(',').slice(0, 2).join(',')})` : '(V1)'}`);
      return m.reply(`*Recent rich captures:*\n\n${lines.join('\n')}\n\n\`${p}sniff dump <id>\` to inspect one.`);
    }

    // ── .sniff dump <id> — full document ─────────────────────────────────
    if (cmd === 'dump') {
      if (!targetId) {
        return m.reply(`Usage: \`${p}sniff dump <messageId>\` (or reply to a rich message and send \`${p}sniff dump\`).`);
      }
      const row = getCapture(targetId);
      if (!row) return m.reply(`No capture for id \`${targetId}\`.`);
      const payload = JSON.stringify({ decoded: row.decoded, raw: row.raw }, null, 2);
      return sock.sendMessage(m.from, {
        document: Buffer.from(payload),
        fileName: `${String(targetId).slice(0, 24)}.json`,
        mimetype: 'application/json',
        caption: [
          `id: ${row.id}`,
          `chat: ${row.chat}`,
          `direction: ${row.direction}`,
          `typename: ${row.typename || '-'}`,
          `captured: ${new Date((row.created_at || 0) * 1000).toISOString()}`,
        ].join('\n'),
      }, { quoted: m });
    }

    // ── .sniff replay <id> — mutation testing ────────────────────────────
    if (cmd === 'replay') {
      if (!targetId) {
        return m.reply(`Usage: \`${p}sniff replay <messageId>\` (or reply to a rich message and send \`${p}sniff replay\`).`);
      }
      const result = await replayCapture(sock, targetId, m.from);
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
      ? recent.map((r) => `${r.rowid}. ${r.direction === 'in' ? '⬇' : '⬆'} ${r.id.slice(0, 12)}… ${r.typename ? `(${r.typename.split(',').slice(0, 2).join(',')})` : '(V1)'}`)
      : ['(no captures yet)'];

    return m.reply(
      `*AI-RICH SNIFFER*\n\n` +
      `Corpus: ${stats.total} captures (${stats.in} in / ${stats.out} out)\n` +
      `New primitives: ${news.length ? `**${news.length} found** — \`${p}sniff new\`` : 'none yet'}\n\n` +
      `*Primitive census:*\n${censusLines.join('\n')}\n\n` +
      `*Recent:*\n${recentLines.join('\n')}\n\n` +
      `\`${p}sniff new\` discovery · \`${p}sniff list\` captures · \`${p}sniff diag\` telemetry · \`${p}sniff raw\` last envelope · \`${p}sniff dump <id>\` · \`${p}sniff replay <id>\` · \`${p}sniff clear\``
    );
  },
};
