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
import { sendStatsCard, sendReelWithStatsCard } from '../../lib/richContent.js';

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

        // Caption block between the player and the table: the video's own
        // title when Facebook exposes one, otherwise the quality summary.
        const description = [
          data.title ? `🎬 *${data.title}*` : `🎬 *Facebook Video* (${quality})`,
          `📥 Downloaded from Facebook${data.hd && data.sd ? ' · HD + SD available' : ''}`,
        ].join('\n');

        // ── Two messages: the video, then the info card ──────────────────
        // A reel inside a rich card needs the client to fetch card media with
        // keys it never receives from a plain CDN upload, so it never drew.
        // The video goes out as a real video message (always playable) and the
        // caption + stats follow as one rich card.
        // Single-card route stays opt-in: it renders on some clients and not
        // others, and losing the video is worse than sending two messages.
        if (process.env.NEXORA_REEL_CARD === '1') {
          const sent = await sendReelWithStatsCard(sock, m.from, m, {
            reel: { title: `Facebook Video (${quality})`, videoUrl: best },
            tableHeaders: ['Metric', 'Value'],
            tableRows: [
              ['Quality', quality === 'HD' ? 'HD' : 'SD'],
              ['Formats', formats || quality],
              ['Source',  'Facebook'],
            ],
            headerText: '🎬 Facebook Downloader',
            description,
            footer: '© NEXORA MD by Aizen',
          });
          if (sent) return;
        }

        await sock.sendMessage(m.from, {
          video: { url: best },
          caption: description,
        }, { quoted: m });

        await sendStatsCard(sock, m.from, m, {
          headerText: '🎬 Facebook Downloader',
          description,
          tableHeaders: ['Metric', 'Value'],
          tableRows: [
            ['Quality', quality === 'HD' ? 'HD' : 'SD'],
            ['Formats', formats || quality],
            ['Source',  'Facebook'],
          ],
          footer: '© NEXORA MD by Aizen',
        });
      } catch (err) {
        await m.reply.error(`Facebook download failed: ${err.message}`);
        throw err;
      }
    });
  },
};
