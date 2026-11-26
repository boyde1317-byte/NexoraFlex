import { Sticker, StickerTypes } from 'wa-sticker-formatter';

import brand from '../../../config/brand.js';
import { DownloadProgress } from '../../lib/progress.js';
import { mixedCard } from '../../lib/interactiveKit.js';

/**
 * `.sticker` / `.s` converts images and videos into stickers. When the input
 * is already a sticker, it is rebuilt with the requested pack and author so
 * the sticker is rebranded instead of rejected.
 */
const CROP_KEYWORDS = ['crop', 'circle', 'rounded'];
const STRETCH_KEYWORDS = ['stretch', 'full', 'contain'];

function parseArgs(args) {
  const result = {
    packName: null,
    authorName: null,
    cropMode: StickerTypes.FULL,
    emoji: null,
  };

  for (const arg of args) {
    const lower = arg.toLowerCase();

    if (arg.startsWith('--author=')) {
      result.authorName = arg.slice(9);
      continue;
    }
    if (arg.startsWith('--pack=')) {
      result.packName = arg.slice(7);
      continue;
    }
    if (arg.startsWith('--emoji=')) {
      result.emoji = arg.slice(8);
      continue;
    }
    if (CROP_KEYWORDS.includes(lower)) {
      result.cropMode = StickerTypes.CROPPED;
      continue;
    }
    if (STRETCH_KEYWORDS.includes(lower) && lower !== 'full') {
      result.cropMode = StickerTypes.FULL;
      continue;
    }
    if (/^\p{Extended_Pictographic}$/u.test(arg) && !result.emoji) {
      result.emoji = arg;
      continue;
    }

    if (!result.packName) result.packName = arg;
    else result.packName += ` ${arg}`;
  }

  return result;
}

function getInput(m) {
  if (m.type === 'imageMessage' || m.type === 'videoMessage' || m.type === 'stickerMessage') {
    return { message: m, type: m.type };
  }
  if (m.quoted && ['imageMessage', 'videoMessage', 'stickerMessage'].includes(m.quoted.type)) {
    return { message: m.quoted, type: m.quoted.type };
  }
  return null;
}

export default {
  name: 'sticker',
  aliases: ['s', 'wm', 'pack'],
  category: 'media',
  description: 'Convert image/video to sticker or rebrand a sticker. Options: crop, emoji, custom pack name.',
  cooldown: 4000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const input = getInput(m);

    if (!input) {
      return await mixedCard(sock, m.from, {
        text: `❌ *No media found*\n\nSend an image, video, or sticker with \`${p}sticker\` as the caption, or reply to one.\n\n*Options:*\n• \`${p}sticker\` — create a full sticker\n• \`${p}sticker crop\` — circular crop for image/video\n• \`${p}sticker 🎉\` — add emoji category\n• \`${p}sticker My Pack --author=Me\` — rebrand with a custom pack and author`,
        footer: 'NEXORA • Sticker Lab',
      }, [
        { kind: 'action', label: '📋 List Stickers', cmd: `${p}liststicker` },
        { kind: 'action', label: '🗑️ Delete Sticker', cmd: `${p}delsticker` },
      ], { quoted: m });
    }

    const parsed = parseArgs(args);
    const packName = parsed.packName || brand.name;
    const authorName = parsed.authorName || brand.creator;
    const isVideo = input.type === 'videoMessage';
    const isRebrand = input.type === 'stickerMessage';
    const progress = new DownloadProgress(sock, m.from, m, { intervalMs: 3000 });

    try {
      const mediaBuffer = await input.message.download();
      if (!mediaBuffer?.length) throw new Error('The media is empty or could not be downloaded.');

      await progress.start(isRebrand ? 'Rebranding sticker' : (isVideo ? 'Converting animated sticker' : 'Converting sticker'));
      const sticker = new Sticker(mediaBuffer, {
        pack: packName,
        author: authorName,
        type: parsed.cropMode,
        quality: isVideo ? 50 : 70,
        ...(parsed.emoji ? { categories: [parsed.emoji] } : {}),
      });
      const stickerBuffer = await sticker.toBuffer();
      await progress.done('');
      await sock.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
    } catch (err) {
      console.error('[PLUGIN ERROR] sticker conversion failed:', err);
      await m.reply.error(`Failed to create sticker: ${err.message}`);
    }
  },
};
