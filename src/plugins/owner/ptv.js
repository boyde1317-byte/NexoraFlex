/**
 * ptv.js — .ptv — send a round "video note" (ptvMessage).
 *
 * WhatsApp's round bubble is the `ptvMessage` key, carrying plain VideoMessage
 * fields (url, mimetype, fileSha256, fileLength, mediaKey, fileEncSha256,
 * directPath, mediaKeyTimestamp, jpegThumbnail). The fork builds it from
 * `{ video, ptv: true }`, and a `participant_username` additional attribute
 * tags the sender handle on the bubble — both wired through
 * baileysBridge.sendPtvMessage().
 *
 * Usage (reply to a video, or to an existing video note):
 *   .ptv                      → send the round note to this chat
 *   .ptv -u coldr_aven        → same, tagged with that username
 *   .ptv @user                → send it to someone else
 */
import { baileysBridge } from '../../core/baileysBridge.js';
import capabilities from '../../core/capabilities.js';

/** Pulls `-u <username>` and an optional @mention / bare jid out of the args. */
function parseArgs(args = []) {
  let username;
  let target;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-u' || a === '--u' || a === '--username') {
      username = args[++i];
    } else if (a.startsWith('@') || /@(s\.whatsapp\.net|lid|g\.us)$/.test(a)) {
      target = a.replace(/^@/, '');
      if (!target.includes('@')) target = `${target}@s.whatsapp.net`;
    }
  }
  return { username, target };
}

export default {
  name: 'ptv',
  aliases: ['videonote', 'roundvideo'],
  category: 'owner',
  description: '🔵 Send a round video note (ptvMessage). Reply to a video with .ptv [-u username] [@user]',
  permissions: { owner: true },
  cooldown: 5000,

  execute: async ({ sock, m, args, prefix }) => {
    if (!capabilities.ptvMessage) {
      return m.reply.error('ptvMessage is not supported by this build.');
    }

    const p = prefix || '.';
    const source = m.quoted || m;
    const mime = source.msg?.mimetype || source.mimetype || source.mediaType || '';

    if (!/video/i.test(mime) && source.type !== 'ptvMessage') {
      return m.reply(
        `⚠️ *ROUND VIDEO NOTE*\n\nReply to a video with *${p}ptv*.\n\n` +
        `• \`${p}ptv\` — send to this chat\n` +
        `• \`${p}ptv -u <username>\` — tag the sender handle\n` +
        `• \`${p}ptv @user\` — send to someone else`
      );
    }

    const { username, target } = parseArgs(args);
    const mentioned = m.msg?.contextInfo?.mentionedJid?.[0];
    const jid = target || mentioned || m.from;

    try { await m.react('⏳'); } catch { /* reactions are best-effort */ }

    try {
      const video = await source.download();
      if (!video?.length) throw new Error('video download returned no data');

      const key = await baileysBridge.sendPtvMessage(
        sock,
        jid,
        { video, mimetype: 'video/mp4', username },
        jid === m.from ? { quoted: m } : {},
      );

      try { await m.react('✅'); } catch { /* ignore */ }
      return m.reply(
        `✅ *ROUND VIDEO NOTE SENT*\n\n` +
        `• to: ${jid === m.from ? 'this chat' : jid}\n` +
        `• size: ${(video.length / 1024).toFixed(0)} KB\n` +
        `• id: \`${key?.id || 'n/a'}\`` +
        (username ? `\n• participant_username: \`${username}\`` : '')
      );
    } catch (e) {
      console.error('[ptv]', e);
      try { await m.react('❌'); } catch { /* ignore */ }
      return m.reply.error(`PTV failed: ${e.message}`);
    }
  },
};
