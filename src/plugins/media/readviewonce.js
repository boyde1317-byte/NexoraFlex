/**
 * readviewonce.js — .readviewonce / .read / .rvo — reveal a view-once message.
 *
 * Ported from LUNA MD plugins/tools-readviewonce.js. Detection and download
 * both live in shared modules now (src/lib/viewOnce.js,
 * src/lib/viewOnceDownload.js), because the local copy this file used to carry
 * had the same two defects as `.vv`:
 *
 *   - it took `Object.keys(node)[0]` as the content type, and a real quoted
 *     copy lists `messageContextInfo` first (field 35 before the envelope's
 *     62), so it read a protocol key and answered "not view-once";
 *   - it did not know `viewOnceMessageV2Extension`, the envelope current
 *     clients send for a view-once photo.
 *
 * No owner/admin gate here (matching the original): in DMs anyone can use it;
 * the audience is the chat itself. The house's `.vv` keeps its group-admin gate.
 *
 * Download strategy: prefer the original stanza saved when the message first
 * arrived. WhatsApp frequently strips mediaKey/url/directPath from the quoted
 * view-once wrapper, making that wrapper impossible to decrypt. The shared
 * downloader falls back to the quote only when the original is unavailable.
 */
import { findViewOnceMedia } from '../../lib/viewOnce.js';
import { downloadViewOnceMedia } from '../../lib/viewOnceDownload.js';

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
      const media = await downloadViewOnceMedia(m, found.msg, sock, {
        command: 'readviewonce',
        mediaType: found.type,
        preferArchive: true,
      });
      if (!media || !media.length) {
        await m.react('❌');
        return await m.reply.error('This view-once media could not be recovered. WhatsApp may have withheld the media key, or the original may have expired before it was archived.');
      }
      const caption = found.caption || '';
      let payload;
      if (found.type === 'imageMessage') payload = { image: media, caption };
      else if (found.type === 'videoMessage') payload = { video: media, mimetype: found.msg?.mimetype || 'video/mp4', caption };
      else if (found.type === 'audioMessage' || found.type === 'pttMessage') {
        payload = {
          audio: media,
          mimetype: found.msg?.mimetype || 'audio/ogg; codecs=opus',
          ptt: found.type === 'pttMessage' ? true : (found.msg?.ptt || false),
        };
      } else if (found.type === 'stickerMessage') payload = { sticker: media };
      else payload = { document: media, mimetype: found.msg?.mimetype || 'application/octet-stream', fileName: found.msg?.fileName || 'viewonce', caption };
      await sock.sendMessage(m.from, payload, { quoted: m });
      await m.react('👁️');
    } catch (err) {
      await m.react('❌');
      await m.reply.error(`Could not reveal the media: ${err.message}`);
    }
  },
};
