/**
 * viewOnceDownload.js — get the bytes out of a view-once message.
 *
 * Two things make this different from any other media download:
 *
 * 1. A quoted view-once copy arrives with `url` / `directPath` stripped, so
 *    `m.quoted.download()` cannot work for the common case. The archived
 *    original (crmStore) is the copy that still has them.
 *
 * 2. `'url' in media` is NOT a usable test. The pinned fork declares every
 *    proto field on the prototype, so `url` exists (as `null`) on every media
 *    node and the `in` check passes for a stripped copy. The fork's
 *    `downloadMediaMessage()` uses exactly that check, so it accepted the
 *    stripped copy and then threw "No valid media URL or directPath present in
 *    message" from the download layer. Everything here tests the VALUE.
 *
 * Order of attempts: quoted copy (cheap, works when WhatsApp left the URL in),
 * then the archived original. A quoted copy that looks downloadable but fails
 * at the CDN — expired, or a 404/410 that would need a reupload request we
 * cannot make for someone else's message — falls through to the archive
 * instead of surfacing as "expired".
 */
import { downloadMediaMessage } from 'baileys';
import { loadMessage } from './crmStore.js';

/** Does this media node carry a real URL/directPath AND a media key? */
export function isMediaDownloadable(node) {
  if (!node || typeof node !== 'object') return false;
  const hasUrl = typeof node.url === 'string' && node.url.length > 0;
  const hasDirectPath = typeof node.directPath === 'string' && node.directPath.length > 0;
  const hasKey = !!node.mediaKey;
  return (hasUrl || hasDirectPath) && hasKey;
}

/**
 * Download the media of an archived message by stanza id.
 * @returns {Promise<Buffer|null>}
 */
export async function downloadArchivedMedia(stanzaId, chat) {
  if (!stanzaId) return null;
  let original = null;
  try {
    original = (chat ? loadMessage(stanzaId, chat) : null) || loadMessage(stanzaId);
  } catch (_) {
    return null;
  }
  if (!original?.message) return null;
  try {
    const buf = await downloadMediaMessage(original, 'buffer', {});
    return buf && buf.length ? buf : null;
  } catch (_) {
    return null;
  }
}

/**
 * The bytes of a view-once message, from the quoted copy or the archive.
 *
 * @param {object} m          the serialized command message (needs m.quoted + m.from)
 * @param {object} mediaNode  the media node returned by findViewOnceMedia()
 * @returns {Promise<Buffer|null>}
 */
export async function downloadViewOnceMedia(m, mediaNode) {
  // 1. the quoted copy, but only when it actually has something to fetch
  if (isMediaDownloadable(mediaNode) && typeof m?.quoted?.download === 'function') {
    try {
      const buf = await m.quoted.download();
      if (buf && buf.length) return buf;
    } catch (_) {
      // stripped or expired — the archive is the next best copy
    }
  }

  // 2. the original as the bot received it
  const archived = await downloadArchivedMedia(m?.quoted?.key?.id, m?.from);
  if (archived) return archived;

  return null;
}
