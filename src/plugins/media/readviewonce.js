/**
 * readviewonce.js — .readviewonce / .read / .rvo — reveal a view-once message.
 *
 * Ported from LUNA MD plugins/tools-readviewonce.js. The original read the
 * quoted message's viewOnce flag through m.quoted.mediaMessage and
 * m.getQuotedObj(); NexoraFlex serializes the quoted message as
 * m.quoted.message, so this restores the classic check here: it reads the
 * `viewOnce` boolean flag on the media message itself
 * (imageMessage.viewOnce === true), NOT just the viewOnceMessage /
 * viewOnceMessageV2 envelope key. WhatsApp strips that envelope from the
 * quoted copy when you reply to a view-once photo, so an envelope-only
 * check saw a plain photo and said "not view-once" even though it was.
 * The flag on the media survives whether the envelope is present or
 * stripped, so this works universally. Media downloads via
 * m.quoted.download(), falling back to the bot's message archive
 * (downloadFromArchive) when the quoted copy has no media URL.
 *
 * No owner/admin gate in the original and none added here: in DMs anyone
 * can use it; the audience is the chat itself.
 *
 * Note: the house already ships media/viewonce.js (.vv / .reveal /
 * .readonce) doing the same job with a group admin gate. This is the LUNA
 * variant under its own name.
 */
import { loadMessage } from '../../lib/crmStore.js';
import { downloadMediaMessage } from 'baileys';

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

/** Walk up to 4 envelope layers to find the view-once inner media. */
function findViewOnceMedia(message) {
  let node = message;
  for (let depth = 0; node && depth < 4; depth++) {
    const type = node ? Object.keys(node)[0] : '';
    const inner = node?.[type];
    if (type === 'viewOnceMessage' || type === 'viewOnceMessageV2') {
      const content = inner?.message;
      if (!content) return null;
      for (const t of MEDIA_TYPES) {
        if (content[t]) return { type: t, msg: content[t], isViewOnce: content[t]?.viewOnce === true };
      }
      return null;
    }
    if (type === 'ephemeralMessage') {
      node = inner?.message;
      continue;
    }
    // Top-level media (envelope already stripped by WhatsApp) — the
    // viewOnce flag on the media itself is the universal signal.
    if (MEDIA_TYPES.includes(type)) {
      return { type, msg: inner, isViewOnce: inner?.viewOnce === true };
    }
    return null;
  }
  return null;
}

/**
 * Archive fallback — download the view-once media from the bot's own
 * message archive instead of the quoted copy.
 *
 * WhatsApp strips the media URL / directPath from a quoted view-once
 * message, so `m.quoted.download()` throws "No valid media URL or
 * directPath". The original message as the bot first received it is
 * archived in the .crm store (src/lib/crmStore.js) with the real URL,
 * so look it up by the quoted stanzaId and download from that.
 * Returns the media Buffer, or null when the original is not archived
 * or the media has expired.
 */
async function downloadFromArchive(m) {
  try {
    const stanzaId = m.quoted?.key?.id;
    if (!stanzaId) return null;
    const original = loadMessage(stanzaId, m.from) || loadMessage(stanzaId);
    if (!original?.message) return null;
    const buf = await downloadMediaMessage(original, 'buffer', {});
    return buf && buf.length ? buf : null;
  } catch (_) {
    return null;
  }
}

export default {
  name: 'readviewonce',
  aliases: ['read', 'rvo'],
  category: 'media',
  description: 'Reveal a view-once photo/video: reply to it with .readviewonce.',
  cooldown: 5000,
  execute: async ({ m, sock }) => {
    if (!m.quoted) {
      return await m.reply('Reply to the image/video you want to view.');
    }
    const found = findViewOnceMedia(m.quoted.message || {});
    if (!found || !found.isViewOnce) {
      return await m.reply('This is not a view-once message.');
    }
    await m.react('⏳');
    try {
      // 1. Try the quoted copy first — works when WhatsApp included the URL.
      let media = null;
      try {
        media = await m.quoted.download();
      } catch (_) {
        media = null; // quoted copy has no media URL — fall through to the archive
      }
      // 2. Archive fallback — the quoted view-once copy has no media URL,
      //    so download from the archived original instead.
      if (!media || !media.length) {
        media = await downloadFromArchive(m);
      }
      if (!media || !media.length) {
        await m.react('❌');
        return await m.reply.error('Failed to download the media — it may have expired from WhatsApp servers.');
      }
      const caption = found.msg?.caption || '';
      let payload;
      if (found.type === 'imageMessage') payload = { image: media, caption };
      else if (found.type === 'videoMessage') payload = { video: media, caption };
      else if (found.type === 'audioMessage') payload = { audio: media, mimetype: found.msg?.mimetype || 'audio/mp4', ptt: found.msg?.ptt || false };
      else if (found.type === 'stickerMessage') payload = { sticker: media };
      else payload = { document: media, mimetype: found.msg?.mimetype || 'application/octet-stream', fileName: found.msg?.fileName || 'viewonce', caption };
      await sock.sendMessage(m.from, payload, { quoted: m });
      await m.react('👁️');
    } catch (err) {
      await m.react('❌');
      await m.reply.error(`Could not reveal the media: ${err.message}`);
    }
  },
};
