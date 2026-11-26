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

function mediaMetadata(node) {
  return {
    hasUrl: typeof node?.url === 'string' && node.url.length > 0,
    hasDirectPath: typeof node?.directPath === 'string' && node.directPath.length > 0,
    hasMediaKey: !!node?.mediaKey,
  };
}

function safeErrorMessage(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .slice(0, 240);
}

function recordDiagnostic(diagnostics, stage, outcome, reason, error) {
  const entry = { stage, outcome };
  if (reason) entry.reason = reason;
  if (error) {
    entry.errorName = typeof error.name === 'string' ? error.name.slice(0, 80) : 'Error';
    entry.errorMessage = safeErrorMessage(error);
    const status = statusOf(error);
    if (status !== undefined && status !== null) entry.status = status;
  }
  diagnostics.push(entry);
}

/**
 * Download an original message, allowing Baileys to refresh expired media URLs.
 * On pinned-fork Boom errors, manually request one refresh because the fork's
 * internal retry currently checks `error.status`, not `error.output.statusCode`.
 */
async function downloadMessage(message, sock, diagnostics, stage) {
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
    if (buffer && buffer.length) return buffer;
    recordDiagnostic(diagnostics, stage, 'empty', 'download_returned_no_bytes');
  } catch (error) {
    recordDiagnostic(diagnostics, stage, 'error', 'download_threw', error);

    if (canRefresh && !reuploadRequested && EXPIRED_MEDIA_STATUSES.has(statusOf(error))) {
      try {
        const refreshed = await reuploadRequest(message);
        if (!refreshed) {
          recordDiagnostic(diagnostics, `${stage} after media refresh`, 'empty', 'media_refresh_returned_no_message');
          return null;
        }
        const buffer = await downloadMediaMessage(refreshed, 'buffer', {}, {});
        if (buffer && buffer.length) return buffer;
        recordDiagnostic(diagnostics, `${stage} after media refresh`, 'empty', 'refreshed_download_returned_no_bytes');
      } catch (refreshError) {
        recordDiagnostic(diagnostics, `${stage} after media refresh`, 'error', 'media_refresh_or_retry_threw', refreshError);
      }
    }
  }
  return null;
}

/**
 * Download the media of an archived message by stanza id.
 * @returns {Promise<Buffer|null>}
 */
export async function downloadArchivedMedia(stanzaId, chat, sock, diagnostics = []) {
  if (!stanzaId) {
    recordDiagnostic(diagnostics, 'archive lookup', 'skipped', 'missing_quoted_stanza_id');
    return null;
  }

  let original = null;
  try {
    original = (chat ? loadMessage(stanzaId, chat) : null) || loadMessage(stanzaId);
  } catch (error) {
    recordDiagnostic(diagnostics, 'archive lookup', 'error', 'archive_lookup_threw', error);
    return null;
  }

  if (!original) {
    recordDiagnostic(diagnostics, 'archive lookup', 'not_found', 'archived_message_not_found');
    return null;
  }
  if (!original.message) {
    recordDiagnostic(diagnostics, 'archive lookup', 'incomplete', 'archived_message_has_no_body');
    return null;
  }
  return await downloadMessage(original, sock, diagnostics, 'archived original');
}

/**
 * The bytes of a view-once message, from the quoted copy or the archive.
 *
 * @param {object} m          the serialized command message (needs m.quoted + m.from)
 * @param {object} mediaNode  the media node returned by findViewOnceMedia()
 * @param {object} sock       the Baileys socket, used to request media refreshes
 * @param {object} context    non-sensitive command and media-type labels for diagnostics
 * @returns {Promise<Buffer|null>}
 */
export async function downloadViewOnceMedia(m, mediaNode, sock, context = {}) {
  const diagnostics = [];
  const metadata = mediaMetadata(mediaNode);

  if (!mediaNode || typeof mediaNode !== 'object') {
    recordDiagnostic(diagnostics, 'quoted copy', 'skipped', 'view_once_media_node_missing');
  } else if (!isMediaDownloadable(mediaNode)) {
    recordDiagnostic(diagnostics, 'quoted copy', 'skipped', 'incomplete_media_metadata', null);
    diagnostics[diagnostics.length - 1].metadata = metadata;
  } else if (typeof m?.quoted?.download !== 'function') {
    recordDiagnostic(diagnostics, 'quoted copy', 'skipped', 'quoted_download_method_unavailable');
  } else {
    try {
      const buffer = await m.quoted.download();
      if (buffer && buffer.length) return buffer;
      recordDiagnostic(diagnostics, 'quoted copy', 'empty', 'quoted_download_returned_no_bytes');
    } catch (error) {
      recordDiagnostic(diagnostics, 'quoted copy', 'error', 'quoted_download_threw', error);
      // Stripped or expired — the archive is the next best copy.
    }
  }

  // The original as the bot received it, with media URL refresh enabled.
  const archived = await downloadArchivedMedia(m?.quoted?.key?.id, m?.from, sock, diagnostics);
  if (archived) return archived;

  console.warn('[view-once] Media download failed:', {
    command: context.command || 'unknown',
    mediaType: context.mediaType || 'unknown',
    quotedStanzaIdPresent: Boolean(m?.quoted?.key?.id),
    quotedMediaMetadata: metadata,
    attempts: diagnostics,
  });
  return null;
}
