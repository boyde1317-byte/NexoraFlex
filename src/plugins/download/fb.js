/**
 * fb.js — .fb <url> — Facebook video download.
 *
 * Description: the video goes out once with its title as the caption, and
 * the rest of the description (quality, source) follows as a description
 * card — a text block plus the tappable source card sendLinkCard appends
 * for its citations. When rich cards are off, the full description rides
 * the video caption instead.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { facebookDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';
import { richEnabled, sendDescriptionCard } from '../../lib/richContent.js';

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

        // The video carries its title; the description follows as a
        // description card with a tappable source card. Without rich
        // cards the whole description rides the video caption.
        const titleLine = data.title ? `🎬 *${data.title}*` : `🎬 *Facebook Video* (${quality})`;
        const detailLine = `📥 ${formats || quality} · Facebook`;
        const rich = richEnabled();

        await sock.sendMessage(m.from, {
          video: { url: best },
          caption: rich ? titleLine : `${titleLine}\n${detailLine}`,
        }, { quoted: m });

        if (rich) {
          const carded = await sendDescriptionCard(sock, m.from, m, {
            text: detailLine,
            entity: {
              title: data.title || `Facebook Video (${quality})`,
              url,
            },
            footer: '© NEXORA MD by Aizen',
          });
          if (!carded) await sock.sendMessage(m.from, { text: detailLine }, { quoted: m });
        }
      } catch (err) {
        await m.reply.error(`Facebook download failed: ${err.message}`);
        throw err;
      }
    });
  },
};
