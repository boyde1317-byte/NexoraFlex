/**
 * aiRichReply.js — Production rich-render for AI replies.
 *
 * Puts the .testrich-proven Moonson/NIXCODE combo (msping/msfb anatomy) to
 * work on real AI traffic: Gemini markdown → AIRich submessages.
 *
 *   markdown text      → addText({ hyperlink, citation, latex: true })
 *     $...$ / $$...$$ math converts to NIXCODE latex markers
 *     [expr|w|h](<codecogs PNG>) — painted natively since baileys r6.
 *   ```code fences```  → addCode(language, code)
 *   | md tables |      → addTable(rows)
 *   footer/meta        → addTip
 *   follow-up pills    → addSuggest
 *   links in the answer → GenAIInlineLinkItem hyperlink chips, bare URLs →
 *                        GenAISearchCitationItem chips, and one
 *                        GenAICompactEntityPrimitive card per source
 *                        underneath (the Meta-AI citation + entity look).
 *
 * LaTeX (re-enabled): $...$ math paints via codecogs markers, and
 * ```latex fenced blocks now ship as TYPESET image cards
 * (sendLatexCard — .testrich v2lateximg anatomy) instead of raw code.
 *   - Maps stay OUT: addLocation is never called here.
 *   Both remain available only through the .testrich owner kit as
 *   experimental caption-only types.
 *
 * Every consumer of sendAIRichReply keeps its own plain-text fallback:
 * this helper returns false whenever the rich path is disabled or fails,
 * so callers fall through to their existing mixedCard/text reply.
 */
import { AIRich } from './NIXCODE.js';
import capabilities from '../core/capabilities.js';
import { sendLatexCard } from './richContent.js';
import { buildProof } from './genaiRich.js';
import { randomBytes, randomUUID } from 'node:crypto';

export const MAX_TABLE_ROWS = 12;   // keep tables readable on device
export const MAX_TABLE_COLS = 6;    // beyond this the device scrolls sideways
export const MAX_CELL_LEN = 64;     // one short value per cell, not a sentence
const MAX_TEXT_BLOCK = 3500;        // per-submessage safety cap

// WhatsApp may reduce a quoted botForwardedMessage to only its rendered
// preview when it delivers a reply. Keep the IDs of the native AI messages we
// relay so the dispatcher can still recognize a reply without changing the
// captured response shape.
const AI_RELAY_IDS = new Map();
const AI_RELAY_TTL_MS = 30 * 60 * 1000;

function rememberAIRelayId(jid, id) {
  if (!jid || !id) return;
  const now = Date.now();
  AI_RELAY_IDS.set(`${jid}:${id}`, now + AI_RELAY_TTL_MS);
  if (AI_RELAY_IDS.size > 2000) {
    for (const [key, expiresAt] of AI_RELAY_IDS) {
      if (expiresAt <= now) AI_RELAY_IDS.delete(key);
    }
  }
}

export function isKnownAIResponseId(jid, id) {
  if (!jid || !id) return false;
  const key = `${jid}:${id}`;
  const expiresAt = AI_RELAY_IDS.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    AI_RELAY_IDS.delete(key);
    return false;
  }
  return true;
}

/** Split a pipe row, honouring \| escapes and optional outer pipes. */
export function splitTableRow(line) {
  const body = String(line).trim().replace(/^\|/, '').replace(/\|\s*$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

/** GFM separator row: |---|:---:|---| (also accepts no outer pipes). */
export function isTableSeparator(line) {
  const raw = String(line).trim();
  if (!raw || !raw.includes('-')) return false;
  const cells = splitTableRow(raw);
  if (cells.length < 2) return false;
  return cells.every(c => /^:?-{2,}:?$/.test(c));
}

/** Collapse a cell to something the table primitive renders cleanly. */
const cleanCell = (cell) =>
  String(cell ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
    .slice(0, MAX_CELL_LEN);

/**
 * Pad ragged rows to one width and cap columns/cell length.
 * Models drop trailing empty cells all the time; an unpadded row shifts every
 * value one column left on the device.
 */
export function normalizeTable(header, body) {
  const natural = Math.max(header.length, ...body.map(r => r.length));
  const width = Math.min(MAX_TABLE_COLS, natural);
  const fit = (row) => {
    const cells = row.slice(0, width).map(cleanCell);
    while (cells.length < width) cells.push('');
    return cells;
  };
  const rows = [fit(header), ...body.map(fit)];
  return {
    rows: [rows[0], ...rows.slice(1, MAX_TABLE_ROWS + 1)],
    truncated: body.length > MAX_TABLE_ROWS,
    droppedCols: Math.max(0, natural - width),
  };
}

/**
 * Split an AI markdown reply into ordered blocks.
 * Recognizes: fenced code blocks, GFM pipe tables, everything else as text.
 */
export function parseAIMarkdown(text) {
  const blocks = [];
  if (!text) return blocks;

  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let buf = [];

  const flushText = () => {
    if (buf.length) {
      const t = buf.join('\n').trim();
      if (t) blocks.push({ type: 'text', text: t });
      buf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────────
    const fence = line.match(/^```([\w+#.-]*)\s*$/);
    if (fence) {
      const language = fence[1] || 'text';
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      flushText();
      if (codeLines.length) {
        blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      }
      continue;
    }

    // ── GFM pipe table (header + separator + rows) ──────────────────
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      const body = [];
      let j = i + 2; // header + separator
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() && !isTableSeparator(lines[j])) {
        body.push(splitTableRow(lines[j]));
        j++;
      }

      // A header row with no data rows under it is not a table — keep the
      // lines as text instead of shipping an empty grid.
      if (body.length && header.some(c => c.trim())) {
        flushText();
        i = j;
        const { rows, truncated, droppedCols } = normalizeTable(header, body);
        const prev = blocks[blocks.length - 1];
        // A model that splits one table across a blank line gets it rejoined
        // instead of shipping two half tables.
        if (prev && prev.type === 'table' && prev.rows[0].length === rows[0].length) {
          const combined = [...prev.rows, ...rows.slice(1)];
          prev.truncated = combined.length > MAX_TABLE_ROWS + 1;
          prev.droppedCols = prev.droppedCols || droppedCols;
          prev.rows = combined.slice(0, MAX_TABLE_ROWS + 1);
        } else {
          blocks.push({ type: 'table', rows, truncated, droppedCols });
        }

        // Absorb a headerless continuation: long tables often get split by a
        // blank line, and those bare pipe rows would otherwise ship as
        // literal "| 3 | 4 |" text.
        let k = i;
        while (k < lines.length && !lines[k].trim()) k++;
        while (k < lines.length && lines[k].includes('|') && !isTableSeparator(lines[k])) {
          const cells = splitTableRow(lines[k]);
          if (cells.length !== rows[0].length) break;
          const target = blocks[blocks.length - 1];
          const combined = [...target.rows, cells.map(cleanCell)];
          if (combined.length > MAX_TABLE_ROWS + 1) { target.truncated = true; break; }
          target.rows = combined;
          k++;
          while (k < lines.length && !lines[k].trim()) k++;
        }
        i = k;
        continue;
      }
      // fall through: treat the header line as ordinary text
    }

    buf.push(line);
    i++;
  }
  flushText();
  return blocks;
}

/**
 * Normalize inline markup for both render paths: the rich markdown primitive
 * and the plain WhatsApp fallback both use single-asterisk markup, so
 * **bold** / __italic__ have to be folded before either sees the text.
 */
export function toWhatsAppMarkup(text) {
  if (!text) return text;
  return String(text)
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '*$1*')
    .replace(/(^|\s)__(?=\S)([^_\n]+?)(?<=\S)__(?=\s|$)/g, '$1_$2_');
}

// ── Citations + compact entities ──────────────────────────────────────────
// Meta AI answers carry two things the renderer already knows how to paint:
// inline citation chips ([label](url) is a hyperlink chip, [](url) is a
// GenAISearchCitationItem chain-link chip) and one compact entity card per
// source. So the answer's own links are the source list — no search backend
// is involved, and nothing is invented: a link only appears if the model
// wrote it.

const MAX_SOURCES = 4;

/** [label](url) — the model's own markdown links. */
const MD_LINK_RE = /\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g;
/** A URL that is NOT already inside a markdown link (lookbehind: "]("). */
const BARE_URL_RE = /(?<!\]\()https?:\/\/[^\s<>"')\]]+/g;

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

/**
 * Sources named in an AI answer, in the order they appear.
 * @param {string} markdown
 * @param {Array<string|{url:string,title?:string,displayName?:string}>} [extra]
 * @returns {{ url: string, title: string, host: string }[]}
 */
export function collectSources(markdown, extra = []) {
  const out = [];
  const seen = new Set();
  const push = (rawUrl, title) => {
    // Bare URLs arrive with their sentence punctuation attached
    // ("https://x.com/a,"), which would make the card point at a dead link.
    const url = String(rawUrl || '').replace(/[.,;:!?]+$/, '');
    if (!url || seen.has(url) || out.length >= MAX_SOURCES) return;
    seen.add(url);
    const host = hostOf(url);
    out.push({ url, host, title: String(title || '').trim() || host || url });
  };

  const text = String(markdown || '');
  for (const m of text.matchAll(MD_LINK_RE)) push(m[2], m[1]);
  for (const m of text.matchAll(BARE_URL_RE)) push(m[0], '');

  for (const item of [].concat(extra || [])) {
    if (typeof item === 'string') push(item, '');
    else if (item && item.url) push(item.url, item.title || item.displayName);
  }
  return out;
}

/**
 * Turn bare URLs in a text block into citation chips, leaving markdown links
 * alone. Trailing punctuation stays outside the chip.
 */
export function citeBareUrls(text) {
  if (!text || !/https?:\/\//.test(text)) return text;
  return String(text).replace(BARE_URL_RE, (full) => {
    const m = full.match(/^(.*?)([.,;:!?]*)$/);
    const url = m ? m[1] : full;
    const tail = m ? m[2] : '';
    return url ? `[](${url})${tail}` : full;
  });
}

// codecogs pre-render — devices don't typeset LaTeX, they paint latex_image.url.
const _codecogsUrl = (expr) =>
  'https://latex.codecogs.com/png.image?\\dpi{150}%20' + encodeURIComponent(expr);

// Math heuristic: only $..$ spans that look like math convert, so dollar
// amounts in prose ("$5 and $10") stay literal text.
const _mathHint = /[\\^_{}=]|\d\s*[+\-*/×÷]\s*\d/;
const _exprToMarker = (expr) => {
  const e = expr.trim();
  const w = Math.min(640, Math.max(90, Math.round(e.length * 9)));
  return `[${e}|${w}|50](<${_codecogsUrl(e)}>)`;
};

/**
 * Convert $...$ / $$...$$ math spans to NIXCODE latex markers.
 */
export function toNixLatex(text) {
  if (!text || !text.includes('$')) return text;
  return text
    .replace(/\$\$([^$\n]+?)\$\$/g, (full, expr) => (_mathHint.test(expr) ? _exprToMarker(expr) : full))
    .replace(/\$([^$\n]+?)\$/g, (full, expr) => (_mathHint.test(expr) ? _exprToMarker(expr) : full));
}

/**
 * Build the rich envelope for a markdown reply without sending it.
 *
 * Kept separate from the send so the payload shape can be asserted offline
 * (`node scripts/verify-release.mjs`) and so a caller can decide what to do
 * after inspecting the blocks.
 *
 * @returns {{ rich: AIRich, blocks: object[], latexBlocks: string[], tableCount: number, codeCount: number, textCount: number, hasContent: boolean } | null}
 */
export function buildAIMarkdownMessage(sock, { markdown, tips = [], suggest = [], footer, links = [] } = {}) {
  if (!markdown) return null;
  const blocks = parseAIMarkdown(markdown);
  if (!blocks.length) return null;

  // The answer's own links are the source list: each one becomes a citation
  // chip inline (bare URLs) or a hyperlink chip (markdown links) plus a
  // compact entity card underneath the answer.
  const sources = collectSources(markdown, links);

  const rich = new AIRich(sock);
  let textCount = 0, codeCount = 0, tableCount = 0;
  const latexBlocks = [];
  const notes = [];

  for (const b of blocks) {
    if (b.type === 'text') {
      rich.addText(toNixLatex(citeBareUrls(toWhatsAppMarkup(b.text)).slice(0, MAX_TEXT_BLOCK)), { latex: true }); // latex: LIVE since r6 (owner go-live 2026-09-14)
      textCount++;
    } else if (b.type === 'code') {
      // LaTeX source ships TYPESET, not raw: ```latex blocks are rendered
      // as image cards right after the text envelope (.testrich
      // v2lateximg anatomy). Non-math envs (tabular) fall back to
      // codecogs inside sendLatexCard; long blocks stay as code.
      const lang = (b.language || '').toLowerCase();
      if ((lang === 'latex' || lang === 'tex') && b.code.trim().length <= 1600) {
        latexBlocks.push(b.code.trim());
      } else {
        rich.addCode(b.language, b.code);
        codeCount++;
      }
    } else if (b.type === 'table') {
      rich.addTable(b.rows);
      tableCount++;
      if (b.truncated) notes.push('_Table shortened — ask for the full breakdown._');
      if (b.droppedCols) notes.push('_Wide table trimmed — ask for one column at a time._');
    }
  }
  for (const note of notes) rich.addText(note, { latex: false });

  const hasContent = textCount > 0 || codeCount > 0 || tableCount > 0;
  if (hasContent) {
    // AIRich requires at least one text submessage to anchor the envelope —
    // a table-only or code-only reply gets a lead-in that matches what is
    // actually attached (it used to say "Here is the code:" for a table).
    if (textCount === 0) {
      const leadIn = tableCount && !codeCount
        ? 'Here is the comparison:'
        : codeCount && !tableCount
          ? 'Here is the code:'
          : 'Here you go:';
      rich.addText(leadIn, { latex: false });
    }

    // One compact entity card per cited source, under the answer and above
    // the tips/follow-ups — the same GenAICompactEntityPrimitive the link
    // card appends for its citations.
    for (const source of sources) {
      try {
        rich.addEntity({ title: source.title, subtitle: source.host, url: source.url });
      } catch (err) {
        console.warn('[aiRichReply] entity card skipped:', err.message);
      }
    }

    for (const tip of [].concat(tips)) {
      if (tip) rich.addTip(tip);
    }
    if (footer) rich.setFooter(footer);
    if (suggest.length) rich.addSuggest(suggest);
  }

  return { rich, blocks, sources, latexBlocks, tableCount, codeCount, textCount, hasContent };
}

/**
 * Send an AI reply as a native rich response (Meta-AI style).
 *
 * @returns {Promise<boolean>} true if the rich send succeeded; false if
 *   disabled or failed — caller should then use its plain fallback.
 */
export async function sendAIRichReply(sock, jid, quoted, { markdown, tips = [], suggest = [], footer, links = [] } = {}) {
  if (!capabilities.richResponse || !markdown) return false;

  try {
    const built = buildAIMarkdownMessage(sock, { markdown, tips, suggest, footer, links });
    if (!built) return false;
    const { rich, latexBlocks, hasContent } = built;

    if (hasContent) {
      await rich.send(jid, { quoted });
    }

    // Typeset LaTeX blocks — image cards sent right after the envelope.
    let delivered = hasContent;
    for (const tex of latexBlocks) {
      const ok = await sendLatexCard(sock, jid, quoted, {
        text: '📐 Typeset LaTeX:',
        expressions: [tex],
        headerText: 'LaTeX',
        footer,
      });
      if (!ok) {
        // last resort: the raw source, monospaced
        await sock.sendMessage(jid, { text: '```latex\n' + tex + '\n```' }, { quoted });
      }
      delivered = true;
    }
    return delivered;
  } catch (err) {
    console.warn('[aiRichReply] rich send failed, falling back:', err.message);
    return false;
  }
}

/**
 * Send the .ai default in the full bot-forwarded Meta response shape.
 *
 * The AIRich renderer remains the source of visible content while this path
 * retains the complete envelope: sender-key distribution for groups, bot
 * metadata/proof, rich submessages, unified response data, quoted context,
 * source metadata, and follow-up suggestions.
 */
export async function sendAIForwardedReply(sock, jid, quoted, { markdown } = {}) {
  if (!capabilities.richResponse || !markdown) return false;

  try {
    const responseId = randomUUID();
    const botResponseId = randomUUID();
    const relayMessageId = randomUUID().replaceAll('-', '').slice(0, 32).toUpperCase();
    const quoteSecret = randomBytes(32).toString('base64');
    const stanzaId = quoted?.key?.id || randomUUID().replaceAll('-', '').slice(0, 32).toUpperCase();
    const participant = quoted?.key?.participant || quoted?.sender || quoted?.key?.remoteJid || '0@lid';
    const quotedText = quoted?.text || quoted?.body || quoted?.message?.conversation || '.ai';
    const source = {
      source_type: 'THIRD_PARTY',
      source_display_name: 'Developer Channel',
      source_subtitle: 'Powered by MoonsonAI',
      source_url: 'https://sahril2nd.biz.id',
      favicon: {
        url: 'https://raw.githubusercontent.com/sahrilcode/cdn2/main/uploads/631d62-1795705821085.jpg',
        mime_type: 'image/jpeg',
        width: 16,
        height: 16,
      },
    };
    const promptPills = ['.menu', '.owner', '.ping'].map((prompt_text) => ({
      prompt_text,
      prompt_type: 'SUGGESTED_PROMPT',
      __typename: 'GenAIFollowUpSuggestionPillPrimitive',
    }));
    const sections = [
      {
        view_model: {
          primitive: { text: markdown, __typename: 'GenAIMarkdownTextUXPrimitive' },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
      {
        view_model: {
          primitive: { sources: [source], __typename: 'GenAISearchResultPrimitive' },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
      {
        view_model: {
          primitive: { text: 'ⓘ All systems are operating normally.', __typename: 'GenAIMetadataTextPrimitive' },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
      {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
          primitives: promptPills,
          __typename: 'GenAIHScrollLayoutViewModel',
        },
      },
    ];
    const submessages = [
      { messageType: 2, messageText: markdown },
      { messageType: 2, messageText: '[ UNSUPPORTED_TYPE - GenAISearchResultPrimitive]' },
      { messageType: 2, messageText: 'All systems are operating normally.' },
      { messageType: 2, messageText: '[ UNSUPPORTED_TYPE - GenAIFollowUpSuggestionPillPrimitive]' },
    ];
    const richResponse = {
      messageType: 1,
      submessages,
      unifiedResponse: {
        data: Buffer.from(JSON.stringify({ response_id: responseId, sections })).toString('base64'),
      },
      contextInfo: {
        stanzaId,
        participant,
        quotedMessage: {
          conversation: quotedText,
          messageContextInfo: { messageSecret: quoteSecret },
        },
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
        forwardOrigin: 4,
        quotedType: 0,
      },
    };
    const payload = {
      ...(String(jid).endsWith('@g.us') ? {
        senderKeyDistributionMessage: {
          groupId: jid,
          axolotlSenderKeyDistributionMessage:
            'Mwi0pOicBBCLARogHo3TSYlUfLE81MO1xg/RPf+aVpnHLXFkTLybEbpKZg0iIQVTO7034VkT2J/ugWznoE6LEzVfIl9AmbPhfD+crDtRCA==',
        },
      } : {}),
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: '',
          botResponseId,
          verificationMetadata: { proofs: [buildProof()] },
        },
      },
      botForwardedMessage: { message: { richResponseMessage: richResponse } },
    };

    // This intentionally uses the raw relay shape from the supplied snippet;
    // it is a replacement for the previous AIRich-generated response.
    // Supplying the ID lets the inbound quote's contextInfo.stanzaId be
    // matched even when WhatsApp strips the quoted rich payload.
    await sock.relayMessage(jid, payload, { messageId: relayMessageId });
    rememberAIRelayId(jid, relayMessageId);
    return true;
  } catch (err) {
    console.warn('[aiRichReply] forwarded rich send failed, falling back:', err.message);
    return false;
  }
}

export default {
  parseAIMarkdown,
  buildAIMarkdownMessage,
  sendAIRichReply,
  sendAIForwardedReply,
  isKnownAIResponseId,
  toNixLatex,
  toWhatsAppMarkup,
  collectSources,
  citeBareUrls,
  splitTableRow,
  isTableSeparator,
  normalizeTable,
};
