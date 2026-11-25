/**
 * fb.js — .fb <url> — Facebook video download.
 *
 * Rich tier: 🎬 Reel + Stats Table (.testrich "reelstats" pattern —
 * device-verified). Native reel player with a stats table beneath it in
 * one card. Falls back to the classic playable video message when the
 * rich card can't be sent.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { facebookDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';

export default {
  name: 'fb',
  aliases: ['facebook', 'fbdl'],
  category: 'download',
  description: 'Downloads a Facebook video. Usage: .fb <url>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const url = args[0]?.trim();

    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}fb <facebook video url>\`\n\nExample: \`${p}fb https://www.facebook.com/watch/?v=123\``,
        'FACEBOOK DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching Facebook video');
      try {
        const data = await facebookDownload(url);
        const best = data.hd || data.sd;
        const quality = data.hd ? 'HD' : 'SD';
        await progress.done(`✅ Got it! Sending ${quality} video...`);

        const formats = [data.hd && 'HD', data.sd && 'SD'].filter(Boolean).join(' + ');

        // Single message: the video carries its own caption. No stats
        // card — a second message split the reply in two.
        const caption = [
          data.title ? `🎬 *${data.title}*` : `🎬 *Facebook Video* (${quality})`,
          `📥 ${formats || quality} · Facebook`,
        ].join('\n');

        await sock.sendMessage(m.from, {
          video: { url: best },
          caption,
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`Facebook download failed: ${err.message}`);
        throw err;
      }
    });
  },
};
