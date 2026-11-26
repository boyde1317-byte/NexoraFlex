import { getStickerTarget, stickerToMedia } from '../../lib/stickerMedia.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'stickerimage'],
  category: 'media',
  description: 'Convert a sticker to PNG, or an animated sticker to MP4 automatically.',
  cooldown: 4000,
  execute: async ({ m, sock }) => {
    const target = getStickerTarget(m);
    if (!target) {
      return await m.reply('Reply to a sticker with .toimg. Static stickers become PNG images; animated stickers become MP4 video.');
    }

    try {
      const result = await stickerToMedia(await target.download());
      if (result.type === 'video') {
        return await sock.sendMessage(m.from, {
          video: result.buffer,
          mimetype: result.mimetype,
          fileName: result.fileName,
          caption: '🎞️ Converted animated sticker to video',
        }, { quoted: m });
      }

      return await sock.sendMessage(m.from, {
        image: result.buffer,
        mimetype: result.mimetype,
        fileName: result.fileName,
        caption: '🖼️ Converted sticker to image',
      }, { quoted: m });
    } catch (err) {
      console.error('[PLUGIN ERROR] sticker-to-media conversion failed:', err);
      return await m.reply.error(`Could not convert that sticker: ${err.message}`);
    }
  },
};
