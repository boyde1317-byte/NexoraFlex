/**
 * viewOnce.js — locate the media inside a view-once message, whatever shape
 * WhatsApp put it in.
 *
 * `.vv` / `.reveal` / `.readonce` and `.readviewonce` / `.read` / `.rvo` all
 * need the same answer to one question: "is this message view-once media, and
 * which node is it?". They used to answer it with two copies of the same
 * function that took `Object.keys(node)[0]` as the content type. That single
 * line is why view-once reveal never worked:
 *
 *   - A quoted copy carries `messageContextInfo` (the messageSecret), and the
 *     proto writes field 35 before field 62, so on decode `Object.keys()[0]`
 *     is `messageContextInfo` — not the envelope. The walker looked at a
 *     protocol key, matched nothing, and reported "not view-once media" for
 *     every reply to a real view-once photo.
 *   - Current clients send `viewOnceMessageV2Extension`, which neither copy
 *     knew about, so the envelope fell through the same way.
 *   - A stripped quoted copy can arrive with the envelope but WITHOUT
 *     `viewOnce: true` on the inner media (WhatsApp strips the flag together
 *     with the URL). Requiring both signals refused a message whose envelope
 *     is itself the declaration.
 *
 * The envelope is authoritative: if it says view-once, it is view-once. The
 * `viewOnce` flag on a bare media node is only needed when the envelope has
 * already been stripped.
 *
 * Content type comes from the fork's `getContentType()`, which skips protocol
 * keys (`messageContextInfo`, `senderKeyDistributionMessage`) — the same rule
 * the main message path uses.
 */
import { getContentType } from 'baileys';

/** Envelopes that mean "the message inside is view-once". */
export const VIEW_ONCE_ENVELOPES = Object.freeze([
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'viewOnceMessageV3',
]);

/** Wrappers that carry the real content one level down. */
const CONTAINERS = Object.freeze([
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'viewOnceMessageV3',
]);

/** Media we know how to re-send. `pttMessage` is a legacy alias for audio. */
export const VIEW_ONCE_MEDIA_TYPES = Object.freeze([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'pttMessage',
  'stickerMessage',
  'documentMessage',
]);

/**
 * Content type of a message node, protocol keys excluded.
 * `getContentType()` returns the first key that is `conversation` or contains
 * `Message` (capital M), so `messageContextInfo` is already skipped; the
 * fallback below keeps the same guarantee if the fork's helper ever changes.
 */
function contentType(node) {
  if (!node || typeof node !== 'object') return '';
  const type = getContentType(node);
  if (type) return type;
  return Object.keys(node).find((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage') || '';
}

/**
 * Find the view-once media in a message.
 *
 * @param {object} message  a `proto.Message` (or plain object) — the message
 *                          body, not the WebMessageInfo wrapper
 * @returns {{type: string, msg: object, isViewOnce: true, envelope: string|null,
 *            caption: string} | null}  null when this is not view-once media
 */
export function findViewOnceMedia(message) {
  let node = message;
  let envelope = null;

  for (let depth = 0; node && typeof node === 'object' && depth < 6; depth++) {
    const type = contentType(node);
    if (!type) return null;

    const inner = node[type];

    if (VIEW_ONCE_ENVELOPES.includes(type)) {
      envelope = type;
      // The envelope declares it; descend to whatever it wraps.
      node = inner?.message;
      continue;
    }

    if (CONTAINERS.includes(type)) {
      node = inner?.message;
      continue;
    }

    if (VIEW_ONCE_MEDIA_TYPES.includes(type)) {
      if (!inner || typeof inner !== 'object') return null;
      // Envelope present → view-once regardless of the inner flag.
      const isViewOnce = envelope ? true : inner.viewOnce === true;
      // A plain photo is not view-once media: return nothing, so a caller
      // cannot reveal it by forgetting to check the flag.
      if (!isViewOnce) return null;
      return { type, msg: inner, isViewOnce: true, envelope, caption: inner.caption || '' };
    }

    return null;
  }
  return null;
}

/**
 * Is this message view-once media at all? Cheap predicate for the anti-view-once
 * rescue, which only needs a yes/no before downloading.
 */
export function isViewOnceMessage(message) {
  return findViewOnceMedia(message) !== null;
}

/** The stanza id a quoted copy points back at, if it has one. */
export function quotedStanzaId(m) {
  return m?.quoted?.key?.id || null;
}
