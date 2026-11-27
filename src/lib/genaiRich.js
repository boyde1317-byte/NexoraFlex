/**
 * @file src/lib/genaiRich.js
 *
 * GenAI "rich response" envelope - the message shape WhatsApp uses for its
 * AI bot bubbles (markdown sections, native tables/code, tabbed screens,
 * "thinking" steps, sandboxed HTML mini-apps).
 *
 * Reverse-engineered from four captured `conn.relayMessage` payloads
 * (botForwardedMessage-1..4). The wire shape is:
 *
 *   {
 *     messageContextInfo: {
 *       deviceListMetadata: {}, deviceListMetadataVersion: 2,
 *       botMetadata: { messageDisclaimerText, botResponseId, verificationMetadata }
 *     },
 *     botForwardedMessage: {
 *       message: {
 *         richResponseMessage: {
 *           messageType: 1,
 *           unifiedResponse: { data: <bytes of JSON> },
 *           contextInfo: {
 *             forwardingScore: 1, isForwarded: true,
 *             forwardedAiBotMessageInfo: { botJid },
 *             forwardOrigin: 4
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * `unifiedResponse.data` is NOT a base64 string on the wire - it is raw bytes
 * holding UTF-8 JSON (Buffer.from(JSON.stringify(...))). The captures only look
 * base64 because the capture tool serialised the Buffer.
 *
 * --- About the verification block ------------------------------------------
 * `botMetadata.verificationMetadata.proofs[]` is what makes a client show the
 * message as an official AI bot response. In the captures each proof is:
 *
 *   signature        64 bytes, ASCII tag + payload
 *   certificateChain [684 bytes, 892 bytes], ASCII tag + payload
 *
 * with the tag `NIXEL.MessageBuilderV4.7-`. Those blobs are bound to the
 * original response content, so they cannot be reused for different content.
 * This module emits the same byte layout with an unsigned (random) payload so
 * the structure is faithful, and accepts a caller-supplied `proof` for
 * experiments. Nothing here can produce a valid one without Meta's signing
 * key, so rendering is unverified: always ship the text fallback.
 */

import { randomBytes, randomUUID } from 'node:crypto';

// --- Wire constants seen in every capture ----------------------------------

export const GENAI_BOT_JID = '867051314767696@bot'; // Meta AI
export const FORWARD_ORIGIN_AI_BOT = 4;

const TAG_PREFIX = 'NIXEL.MessageBuilderV4.7-';
const SIG_TAG = `${TAG_PREFIX}VerificationSignature.Metadata`;
const CHAIN_TAG = `${TAG_PREFIX}CertificateChain.Metadata`;

const SIGNATURE_BYTES = 64;
const CHAIN_BYTES = [684, 892];

// --- Primitives (sections[].view_model.primitive) ---------------------------

export const primitives = {
  /** Plain markdown body - the normal text of a bot reply. */
  markdown: (text) => ({
    __typename: 'GenAIMarkdownTextUXPrimitive',
    text: String(text ?? ''),
  }),

  /** The "Processing / Thinking" status pill with its spinner icon. */
  progress: ({ title = 'Processing', inProgress = true, icon = 'THINKING' } = {}) => ({
    __typename: 'GenAIBotProgressStatusPrimitive',
    title,
    is_in_progress: inProgress,
    icon,
  }),

  /** Native table bubble. rows: string[][] (or [{ items: string[] }]). */
  table: ({ title, headers = [], rows = [] } = {}) => ({
    __typename: 'GenATableUXPrimitive',
    title,
    rows: [
      ...(headers.length ? [{ items: headers.map(String), is_heading: true }] : []),
      ...rows.map((r) => ({ items: (Array.isArray(r) ? r : [r]).map(String) })),
    ],
  }),

  /** Syntax-highlighted code block. */
  code: ({ code, language = 'javascript' } = {}) => ({
    __typename: 'GenAICodeBlockUXPrimitive',
    language,
    code: String(code ?? ''),
  }),

  /**
   * Sandboxed HTML mini-app (the ALPHA card in the captures used this).
   * `trusted_sources` gates which hosts the webview will open links to.
   */
  html: ({ payload, url, trustedSources = [] } = {}) => ({
    __typename: 'GenAIaeacdsnwHtmlPrimitive',
    payload: String(payload ?? ''),
    url,
    trusted_sources: trustedSources,
  }),

  /** Citation list. */
  links: ({ text, links = [] } = {}) => ({
    __typename: 'GenAILinkCollectionUXPrimitive',
    text,
    links: links.map((l) => ({ title: l.title, url: l.url })),
  }),

  gridImage: ({ mainUrl, imageUrls = [] } = {}) => ({
    __typename: 'GenAIGridImageUXPrimitive',
    grid_image_url: { image_high_res_url: mainUrl },
    image_urls: imageUrls,
  }),

  dynamic: ({ url, type = 2 } = {}) => ({
    __typename: 'GenAIDynamicUXPrimitive',
    type,
    url,
  }),

  map: ({ lat, lng, annotations = [] } = {}) => ({
    __typename: 'GenAIMapUXPrimitive',
    center_latitude: lat,
    center_longitude: lng,
    annotations,
  }),

  latex: ({ text, expressions = [] } = {}) => ({
    __typename: 'GenAILatexUXPrimitive',
    text,
    expressions: expressions.map((e) => ({ latex_expression: e })),
  }),

  reels: ({ items = [] } = {}) => ({
    __typename: 'GenAIContentItemsUXPrimitive',
    content_items: items,
  }),
};

/** Wraps a primitive in the section / view-model envelope. */
export const section = (primitive) => ({
  __typename: 'GenAIUnifiedResponseSection',
  view_model: { __typename: 'GenAISingleLayoutViewModel', primitive },
});

// --- Embedded screens (tabs, thought steps, button sheets) -----------------

/** One expandable "thought" row inside the Steps tab. */
export const stepEntry = (header, body) => ({
  __typename: 'GenAIStepThoughtEntry',
  header: String(header ?? ''),
  body: String(body ?? ''),
});

/**
 * A tab. `sections` are normal sections (rendered as content), `steps` are
 * thought entries (rendered as the reasoning list).
 */
export const tab = ({ id, header, sections = [], steps = [] } = {}) => ({
  __typename: 'FOAUnifiedResponseTab',
  id: id || `tab_${randomBytes(3).toString('hex')}`,
  tab_header: header || '',
  sections,
  step_entries: steps,
});

/** Standard tabbed screen (used by the "Thoughts" / "Steps" sheet). */
export const tabbedScreen = ({ title, tabs = [] } = {}) => ({
  __typename: 'FOAUnifiedResponseEmbeddedScreen',
  title: title || '',
  content: [{ __typename: 'FOAEmbeddedScreenContentTabbed', tabs }],
});

/** Button-sheet variant - the screen the forged ALPHA capture used. */
export const buttonSheetScreen = ({ title, tabs = [] } = {}) => ({
  __typename: 'FOAUnifiedResponseEmbeddedScreen',
  title: title || '',
  content: [{ __typename: 'FOAIDNixelButtonSheets', tabs }],
});

/**
 * Convenience: the "Thoughts" sheet with a single Steps tab.
 * This is exactly the screen Meta AI emits while it is working.
 */
export const thoughtsScreen = ({ title = 'Thoughts', steps = [] } = {}) =>
  tabbedScreen({ title, tabs: [tab({ id: 'steps', header: 'Steps', steps })] });

// --- Unified response payload ----------------------------------------------

/**
 * Builds the JSON object that goes (UTF-8 encoded) into unifiedResponse.data.
 *
 * @param {object}   opts
 * @param {string}   [opts.responseId]  Stable id, also reused as botResponseId
 * @param {Array}    [opts.sections]    section() results
 * @param {Array}    [opts.screens]     tabbedScreen() / buttonSheetScreen() results
 * @param {string}   [opts.typename]    Defaults to GenAIUnifiedResponse
 */
export function buildUnifiedResponse({
  responseId = randomUUID(),
  sections = [],
  screens = [],
  typename = 'GenAIUnifiedResponse',
} = {}) {
  const payload = { __typename: typename, response_id: responseId, sections };
  if (screens.length) payload.embedded_screens = screens;
  return payload;
}

// --- Verification proof (structural placeholder) ---------------------------

const taggedBlob = (tag, total) => {
  const buf = Buffer.alloc(total);
  buf.write(tag, 0, 'ascii');
  randomBytes(total - tag.length).copy(buf, tag.length);
  return buf;
};

/**
 * Builds a proof with the exact byte layout of the captures.
 * The payload is unsigned, so this satisfies the shape, not the signature.
 * Pass your own Buffers to override individual fields.
 */
export function buildProof({ version = 1, useCase = 1, signature, certificateChain } = {}) {
  return {
    version,
    useCase,
    signature: signature || taggedBlob(SIG_TAG, SIGNATURE_BYTES),
    certificateChain: certificateChain || CHAIN_BYTES.map((len) => taggedBlob(CHAIN_TAG, len)),
  };
}

// --- Envelope --------------------------------------------------------------

/**
 * Wraps a unified response (object or pre-encoded Buffer) in the full
 * botForwardedMessage envelope, ready for sock.relayMessage().
 *
 * @param {object} opts
 * @param {object|Buffer} opts.unified   buildUnifiedResponse() result, or raw bytes
 * @param {string} [opts.botJid]         forwardedAiBotMessageInfo.botJid
 * @param {string} [opts.disclaimer]     messageDisclaimerText
 * @param {object} [opts.proof]          buildProof() override
 * @param {'raw'|'base64'} [opts.dataEncoding='raw']  unifiedResponse.data shape
 * @param {boolean} [opts.messageSecret=true]        inject a random 32-byte secret
 */
export function buildBotForwardedEnvelope({
  unified,
  botJid = GENAI_BOT_JID,
  disclaimer = '',
  proof,
  dataEncoding = 'raw',
  messageSecret = true,
} = {}) {
  const json = Buffer.isBuffer(unified) ? unified : Buffer.from(JSON.stringify(unified), 'utf8');
  // 'raw'   -> bytes of the UTF-8 JSON, exactly what a genuine Meta AI forward
  //            carries (the captures are Buffer.from(JSON.stringify(...))).
  // 'base64'-> ASCII base64 of the JSON. NEXORA's device-proven path
  //            (src/lib/htmlGames.js) sends this form, so it is kept available
  //            for parity when a client renders one shape but not the other.
  const data = dataEncoding === 'base64' ? Buffer.from(json.toString('base64'), 'utf8') : json;

  const botResponseId = (Buffer.isBuffer(unified) ? null : unified?.response_id) || randomUUID();

  return {
    messageContextInfo: {
      // Genuine forwards carry no messageSecret; the fork's relay path has
      // needed one for the bubble to render on r18+ clients, so it is on by
      // default and can be disabled to match the capture byte for byte.
      ...(messageSecret ? { messageSecret: randomBytes(32) } : {}),
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: disclaimer,
        botResponseId,
        verificationMetadata: { proofs: [proof || buildProof()] },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          unifiedResponse: { data },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid },
            forwardOrigin: FORWARD_ORIGIN_AI_BOT,
          },
        },
      },
    },
  };
}

// --- Rendering to text (fallback + incoming parser) ------------------------

/** Flattens sections into readable text. */
export function renderSectionsToText(sections = []) {
  const out = [];
  for (const s of sections) {
    const p = s?.view_model?.primitive;
    if (!p) continue;
    switch (p.__typename) {
      case 'GenAIMarkdownTextUXPrimitive':
        if (p.text) out.push(p.text);
        break;
      case 'GenAIBotProgressStatusPrimitive':
        out.push(`_${p.title || 'Processing'}_`);
        break;
      case 'GenATableUXPrimitive': {
        if (p.title) out.push(`*${p.title}*`);
        for (const r of p.rows || []) out.push((r.items || r.cells || []).join(' | '));
        break;
      }
      case 'GenAICodeBlockUXPrimitive':
        out.push('```' + (p.language || '') + '\n' + (p.code || '') + '\n```');
        break;
      case 'GenAILinkCollectionUXPrimitive': {
        if (p.text) out.push(p.text);
        (p.links || []).forEach((l, i) => out.push(`[${i + 1}] ${l.title || 'Link'}: ${l.url}`));
        break;
      }
      case 'GenAIaeacdsnwHtmlPrimitive':
        out.push(`[HTML card${p.url ? `: ${p.url}` : ''}]`);
        break;
      case 'GenAIGridImageUXPrimitive':
        out.push(`[Image grid: ${p.grid_image_url?.image_high_res_url || ''}]`);
        break;
      case 'GenAIDynamicUXPrimitive':
        out.push(`[Dynamic media: ${p.url || ''}]`);
        break;
      case 'GenAIMapUXPrimitive':
      case 'GenAIAirichMapUXPrimitive':
        out.push(`[Map: ${p.center_latitude || ''},${p.center_longitude || ''}]`);
        break;
      case 'GenAILatexUXPrimitive':
        if (p.text) out.push(p.text);
        for (const e of p.expressions || []) out.push(`  ${e.latex_expression || ''}`);
        break;
      case 'GenAIContentItemsUXPrimitive':
      case 'GenAIReelItemUXPrimitive':
        for (const item of p.content_items || []) out.push(`- ${item.title || 'Video'}: ${item.video_url || ''}`);
        break;
      default:
        if (p.text) out.push(p.text);
        else if (p.title) out.push(`*${p.title}*`);
        break;
    }
  }
  return out.join('\n\n');
}

/** Flattens embedded screens (tabs + thought steps) into readable text. */
export function renderScreensToText(screens = []) {
  const out = [];
  for (const screen of screens) {
    if (screen.title) out.push(`*${screen.title}*`);
    for (const content of screen.content || []) {
      for (const t of content.tabs || []) {
        const inner = renderSectionsToText(t.sections || []);
        const head = t.tab_header || t.id || 'tab';
        const steps = (t.step_entries || [])
          .map((s) => `- ${s.header || ''}${s.body ? `: ${s.body}` : ''}`)
          .join('\n');
        out.push([`[${head}]`, inner, steps].filter(Boolean).join('\n'));
      }
    }
  }
  return out.join('\n\n');
}

// --- Send ------------------------------------------------------------------

/**
 * Sends a GenAI rich response.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} spec
 * @param {Array}  [spec.sections]      section() results
 * @param {Array}  [spec.screens]       screen results
 * @param {Array}  [spec.tabs]          shortcut -> tabbedScreen({ title, tabs })
 * @param {string} [spec.screenTitle]   title for the tabs shortcut
 * @param {Array}  [spec.steps]         shortcut -> thoughtsScreen({ steps })
 * @param {string} [spec.username]      sets additionalAttributes.participant_username
 * @param {string} [spec.fallbackText]  overrides the auto-generated fallback
 * @param {object} [spec.proof]         buildProof() override
 * @param {object} [options]            { quoted, messageId, additionalNodes }
 * @returns {Promise<{ok:boolean, responseId:string, fellBack?:boolean, error?:string}>}
 */
export async function sendGenAICard(sock, jid, spec = {}, options = {}) {
  const {
    sections = [],
    screens = [],
    tabs,
    screenTitle = 'Details',
    steps,
    responseId,
    botJid,
    disclaimer,
    proof,
    username,
    fallbackText,
    dataEncoding,
    messageSecret,
  } = spec;

  const allScreens = [...screens];
  if (tabs?.length) allScreens.push(tabbedScreen({ title: screenTitle, tabs }));
  if (steps?.length) allScreens.push(thoughtsScreen({ steps }));

  const unified = buildUnifiedResponse({ responseId, sections, screens: allScreens });
  const envelope = buildBotForwardedEnvelope({ unified, botJid, disclaimer, proof, dataEncoding, messageSecret });

  const relayOptions = {};
  if (username) relayOptions.additionalAttributes = { participant_username: username };
  if (options.messageId) relayOptions.messageId = options.messageId;
  if (options.additionalNodes) relayOptions.additionalNodes = options.additionalNodes;

  try {
    await sock.relayMessage(jid, envelope, relayOptions);
    return { ok: true, responseId: unified.response_id, envelope };
  } catch (err) {
    const text =
      fallbackText ||
      [renderSectionsToText(unified.sections), renderScreensToText(allScreens)]
        .filter(Boolean)
        .join('\n\n') ||
      'Rich content unavailable';

    try {
      await sock.sendMessage(jid, { text }, options.quoted ? { quoted: options.quoted } : {});
    } catch { /* nothing else to try */ }

    return { ok: false, responseId: unified.response_id, fellBack: true, error: err.message };
  }
}

// --- Incoming parse --------------------------------------------------------

/**
 * Decodes an incoming botForwardedMessage / richResponseMessage.
 * Accepts either a raw proto.IMessage or a serialized message object.
 */
export function parseGenAIMessage(message) {
  const msg = message?.message || message;
  const rich =
    msg?.botForwardedMessage?.message?.richResponseMessage ||
    msg?.richResponseMessage;
  if (!rich) return { isGenAI: false };

  const ctx = rich.contextInfo || {};
  const botMeta = (msg?.messageContextInfo || message?.messageContextInfo)?.botMetadata || {};

  let payload = null;
  const raw = rich.unifiedResponse?.data;
  if (raw) {
    try {
      // Wire format is raw bytes. String input comes from capture tools, which
      // either embed JSON text or base64-encode the Buffer.
      let bytes = null;
      if (Buffer.isBuffer(raw)) bytes = raw;
      else if (raw instanceof Uint8Array) bytes = Buffer.from(raw);
      else if (typeof raw === 'string') {
        bytes = raw.trim().startsWith('{') ? Buffer.from(raw, 'utf8') : Buffer.from(raw, 'base64');
      }
      if (bytes) payload = JSON.parse(bytes.toString('utf8'));
    } catch {
      payload = null;
    }
  }

  const sections = payload?.sections || [];
  const screens = payload?.embedded_screens || [];

  return {
    isGenAI: true,
    responseId: payload?.response_id,
    botResponseId: botMeta.botResponseId,
    botJid: ctx.forwardedAiBotMessageInfo?.botJid,
    disclaimer: botMeta.messageDisclaimerText,
    forwardOrigin: ctx.forwardOrigin,
    sections,
    screens,
    text: [renderSectionsToText(sections), renderScreensToText(screens)]
      .filter(Boolean)
      .join('\n\n'),
  };
}

export default {
  primitives,
  section,
  tab,
  tabbedScreen,
  buttonSheetScreen,
  thoughtsScreen,
  stepEntry,
  buildUnifiedResponse,
  buildProof,
  buildBotForwardedEnvelope,
  renderSectionsToText,
  renderScreensToText,
  sendGenAICard,
  parseGenAIMessage,
  GENAI_BOT_JID,
  FORWARD_ORIGIN_AI_BOT,
};
