import { resolveDisplayIdentity } from '../../lib/identity.js';
import { findViewOnceMedia } from '../../lib/viewOnce.js';
import { downloadViewOnceMedia } from '../../lib/viewOnceDownload.js';

/**
 * viewonce.js — 👁️ View Once reader.
 *
 * Reply to a one-view photo/video/voice note with .vv and the bot
 * re-sends it as normal media that stays in the chat. Unlike .save
 * (a generic media extractor), this is strict: it only touches actual
 * view-once media.
 *
 * Detection lives in src/lib/viewOnce.js — one implementation shared with
 * .readviewonce and the anti-view-once rescue. It used to be a local copy that
 * read `Object.keys(node)[0]` as the content type, which on a real quoted copy
 * is `messageContextInfo` (field 35 sorts before the envelope's 62), so every
 * reply to a real view-once photo was reported as "not view-once media". It
 * also did not know `viewOnceMessageV2Extension`, the envelope current clients
 * send.
 *
 * Privacy gate: in groups only admins (and the owner) may reveal —
 * a view-once is usually aimed at one person. In DMs anyone can use
 * it, since the chat participants are the only audience.
 */
export default {
  name: 'viewonce',
  aliases: ['vv', 'reveal', 'readonce'],
  category: 'media',
  description: 'View Once reader — reply to a view-once message to reveal it. Usage: .vv (reply)',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';

    if (!m.quoted) {
      return await m.reply.warn(`Reply to a view-once photo, video or voice note with \`${p}vv\` to reveal it.`);
    }

    // privacy gate: groups → admins + owner only
    if (m.isGroup) {
      const isAdmin = await m.isAdmin();
      const isOwner = await m.isOwner;
      if (!isAdmin && !isOwner) {
        return await m.reply.warn('Only group admins can reveal view-once media here.');
      }
    }

    const found = findViewOnceMedia(m.quoted.message || {});
    if (!found || !found.isViewOnce) {
      return await m.reply.warn('That message is not view-once media. Reply to a 👁️ one-view photo/video/voice note.');
    }

    await m.react('⏳');
    try {
      // Quoted copy first (works when WhatsApp left the URL in), then the
      // archive: a quoted view-once almost always arrives with url/directPath
      // stripped, so the archived original is the only copy still downloadable.
      const buffer = await downloadViewOnceMedia(m, found.msg, sock);
      if (!buffer || !buffer.length) {
        await m.react('❌');
        return await m.reply.error('Download failed — the media may have expired from WhatsApp servers.');
      }

      const voId = await resolveDisplayIdentity(sock, (m.quoted.sender || m.quoted.participant || ''), m.isGroup ? m.from : null);
      const caption = `👁️ *View Once Revealed* — from ${voId.number ? '+' + voId.number : voId.label}`;

      let payload;
      if (found.type === 'imageMessage')       payload = { image: buffer, caption };
      else if (found.type === 'videoMessage')  payload = { video: buffer, caption };
      else if (found.type === 'audioMessage' || found.type === 'pttMessage')
        payload = { audio: buffer, mimetype: found.msg?.mimetype || 'audio/ogg; codecs=opus', ptt: found.type === 'pttMessage' ? true : (found.msg?.ptt || false) };
      else if (found.type === 'stickerMessage') payload = { sticker: buffer };
      else payload = { document: buffer, mimetype: found.msg?.mimetype || 'application/octet-stream', fileName: found.msg?.fileName || 'viewonce', caption };

      await sock.sendMessage(m.from, payload, { quoted: m });
      await m.react('👁️');
    } catch (err) {
      await m.react('❌');
      await m.reply.error(`Could not reveal the media: ${err.message}`);
    }
  },
};
