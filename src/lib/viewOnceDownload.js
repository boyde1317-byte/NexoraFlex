/**
 * viewOnceDownload.js — get the bytes out of a view-once message.
 *
 * A quoted view-once copy often has url/directPath stripped, so try the
 * archived original as well. Archived media URLs can expire; Baileys supports
 * reuploadRequest, but the pinned fork's Boom errors expose HTTP status at
 * error.output.statusCode while its built-in retry checks error.status. We
 * therefore pass the callback and manually request one refresh for 404/410
 * failures when the library did not already invoke it.
 */
import { downloadMediaMessage } from 'baileys';
import { loadMessage } from './crmStore.js';

const EXPIRED_MEDIA_STATUSES = new Set([404, 410]);

/** Does this media node carry a real URL/directPath AND a media key? */
export function isMediaDownloadable(node) {
  if (!node || typeof node !== 'object') return false;
  const hasUrl = typeof node.url === 'string' && node.url.length > 0;
  const hasDirectPath = typeof node.directPath === 'string' && node.directPath.length > 0;
  const hasKey = !!node.mediaKey;
  return (hasUrl || hasDirectPath) && hasKey;
}

function statusOf(error) {
  return error?.status ?? error?.statusCode ?? error?.output?.statusCode ?? error?.data?.statusCode;
}

/**
 * Download an original message, allowing Baileys to refresh expired media URLs.
 * On pinned-fork Boom errors, manually request one refresh because the fork's
 * internal retry currently checks `error.status`, not `error.output.statusCode`.
 */
async function downloadMessage(message, sock, failures, stage) {
  let reuploadRequested = false;
  const canRefresh = typeof sock?.updateMediaMessage === 'function';
  const reuploadRequest = canRefresh
    ? async (staleMessage) => {
        reuploadRequested = true;
        return await sock.updateMediaMessage(staleMessage);
      }
    : undefined;

  try {
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      reuploadRequest ? { reuploadRequest } : {}
    );
    return buffer && buffer.length ? buffer : null;
  } catch (error) {
    failures.push({ stage, error });

    if (canRefresh && !reuploadRequested && EXPIRED_MEDIA_STATUSES.has(statusOf(error))) {
      try {
        const refreshed = await reuploadRequest(message);
        if (!refreshed) return null;
        const buffer = await downloadMediaMessage(refreshed, 'buffer', {}, {});
        return buffer && buffer.length ? buffer : null;
      } catch (refreshError) {
        failures.push({ stage: `${stage} after media refresh`, error: refreshError });
      }
    }
  }
  return null;
}

/**
 * Download the media of an archived message by stanza id.
 * @returns {Promise<Buffer|null>}
 */
export async function downloadArchivedMedia(stanzaId, chat, sock, failures = []) {
  if (!stanzaId) return null;
  let original = null;
  try {
    original = (chat ? loadMessage(stanzaId, chat) : null) || loadMessage(stanzaId);
  } catch {
    return null;
  }
  if (!original?.message) return null;
  return await downloadMessage(original, sock, failures, 'archived original');
}

/**
 * The bytes of a view-once message, from the quoted copy or the archive.
 *
 * @param {object} m          the serialized command message (needs m.quoted + m.from)
 * @param {object} mediaNode  the media node returned by findViewOnceMedia()
 * @param {object} sock       the Baileys socket, used to request media refreshes
 * @returns {Promise<Buffer|null>}
 */
export async function downloadViewOnceMedia(m, mediaNode, sock) {
  const failures = [];

  // 1. the quoted copy, but only when it actually has something to fetch
  if (isMediaDownloadable(mediaNode) && typeof m?.quoted?.download === 'function') {
    try {
      const buf = await m.quoted.download();
      if (buf && buf.length) return buf;
    } catch (error) {
      failures.push({ stage: 'quoted copy', error });
      // stripped or expired — the archive is the next best copy
    }
  }

  // 2. the original as the bot received it, with media URL refresh enabled
  const archived = await downloadArchivedMedia(m?.quoted?.key?.id, m?.from, sock, failures);
  if (archived) return archived;

  if (failures.length) {
    console.warn(
      '[view-once] Media download failed:',
      failures.map(({ stage, error }) => ({ stage, message: error?.message || String(error), status: statusOf(error) }))
    );
  }
  return null;
}
