import { getStickerTarget, stickerToMedia } from '../../lib/stickerMedia.js';

export default {
  name: 'tovideo',
  aliases: ['stickervideo'],
  category: 'media',
  description: 'Convert a sticker to MP4 video.',
  cooldown: 4000,
  execute: async ({ m, sock }) => {
    const target = getStickerTarget(m);
    if (!target) return await m.reply('Reply to a sticker with .tovideo. Animated stickers are converted to MP4 video.');

    try {
      const result = await stickerToMedia(await target.download(), { force: 'video' });
      return await sock.sendMessage(m.from, {
        video: result.buffer,
        mimetype: result.mimetype,
        fileName: result.fileName,
        caption: '🎞️ Converted sticker to video',
      }, { quoted: m });
    } catch (err) {
      console.error('[PLUGIN ERROR] sticker-to-video conversion failed:', err);
      return await m.reply.error(`Could not convert that sticker: ${err.message}`);
    }
  },
};
