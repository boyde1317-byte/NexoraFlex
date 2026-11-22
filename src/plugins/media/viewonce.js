import { resolveDisplayIdentity, mentionChip } from '../../lib/identity.js';
import { loadMessage } from '../../lib/crmStore.js';
import { downloadMediaMessage } from 'baileys';

/**
 * viewonce.js — 👁️ View Once reader.
 *
 * Reply to a one-view photo/video/voice note with .vv and the bot
 * re-sends it as normal media that stays in the chat. Unlike .save
 * (a generic media extractor), this is strict: it only touches actual
 * view-once media.
 *
 * Classic detection (the proven LUNA/REM shape, adapted to NexoraFlex's
 * serializer): it reads the `viewOnce` boolean flag on the media message
 * itself (imageMessage.viewOnce === true), NOT just the
 * viewOnceMessage / viewOnceMessageV2 envelope key. WhatsApp strips that
 * envelope from the quoted copy when you reply to a view-once photo, so
 * the old envelope-only check saw a plain photo and said "not view-once"
 * even though it was. The flag on the media survives whether the
 * envelope is present or stripped, so this works universally.
 *
 * Privacy gate: in groups only admins (and the owner) may reveal —
 * a view-once is usually aimed at one person. In DMs anyone can use
 * it, since the chat participants are the only audience.
 */
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
      return null; // view-once without known media (e.g. location)
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
      // 1. Try the quoted copy first — works when WhatsApp included the URL.
      let buffer = null;
      try {
        buffer = await m.quoted.download();
      } catch (_) {
        buffer = null; // quoted copy has no media URL — fall through to the archive
      }
      // 2. Archive fallback — the quoted view-once copy has no media URL,
      //    so download from the archived original instead.
      if (!buffer || !buffer.length) {
        buffer = await downloadFromArchive(m);
      }
      if (!buffer || !buffer.length) {
        await m.react('❌');
        return await m.reply.error('Download failed — the media may have expired from WhatsApp servers.');
      }

      const voId = await resolveDisplayIdentity(sock, (m.quoted.sender || m.quoted.participant || ''), m.isGroup ? m.from : null);
      const caption = `👁️ *View Once Revealed* — from ${voId.number ? '+' + voId.number : voId.label}`;

      let payload;
      if (found.type === 'imageMessage')       payload = { image: buffer, caption };
      else if (found.type === 'videoMessage')  payload = { video: buffer, caption };
      else if (found.type === 'audioMessage')  payload = { audio: buffer, mimetype: found.msg?.mimetype || 'audio/mp4', ptt: found.msg?.ptt || false };
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
