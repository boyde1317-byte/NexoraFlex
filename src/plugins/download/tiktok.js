/**
 * tiktok.js — TikTok video downloader (no watermark).
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent for 5-15s)
 *  - Error handling with user-friendly message
 *  - Description: the video goes out once with its title as the caption,
 *    and the rest of the description (author, source) follows as a
 *    description card — a text block plus the tappable source card the
 *    link card appends for its citations. Without rich cards the whole
 *    description rides the video caption.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { tiktokDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';
import { richEnabled, sendDescriptionCard, sendMediaCarousel } from '../../lib/richContent.js';

export default {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'download',
  description: 'Downloads a TikTok video without the watermark. Usage: .tiktok <url>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const url = args[0]?.trim();
    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}tiktok <url>\`\n\nExample: \`${p}tiktok https://vt.tiktok.com/xxxxxx\``,
        'TIKTOK DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching TikTok video');
      try {
        const data = await tiktokDownload(url);
        await progress.done('✅ Got it! Sending video...');

        // ── Photo-post tier: 📸 native swipeable carousel (ported from ──
        // Yorumi-MD's TikTok photo dump view). Each slide is its own card
        // with an "Open photo" button; falls back to plain image sends.
        if (data.images?.length) {
          await progress.done(`✅ Got it! ${data.images.length} photo${data.images.length > 1 ? 's' : ''}. Sending carousel...`);

          const sent = await sendMediaCarousel(sock, m.from, m, {
            title: `📸 ${(data.title || 'TikTok Photo Post').slice(0, 80)}`,
            images: data.images.map((u, i) => ({ url: u, title: `Slide ${i + 1}` })),
            footer: '© NEXORA MD by Aizen',
          });
          if (sent) return;

          for (const [i, u] of data.images.slice(0, 5).entries()) {
            await sock.sendMessage(m.from, {
              image: { url: u },
              ...(i === 0 ? { caption: `📸 ${(data.title || 'TikTok Photo Post').slice(0, 80)}\n${data.author ? '👤 ' + data.author : ''}` } : {}),
            }, { quoted: m });
          }
          return;
        }

        // The video carries its title; the description follows as a
        // description card with a tappable source card. Without rich cards
        // the whole description rides the video caption.
        const titleLine  = data.title ? `🎬 *${data.title}*` : '🎬 *TikTok Video*';
        const detailLine = [data.author ? `👤 ${data.author}` : null, '📥 TikTok · no watermark']
          .filter(Boolean).join('\n');
        const rich = richEnabled();

        await sock.sendMessage(m.from, {
          video: { url: data.video },
          caption: rich ? titleLine : `${titleLine}\n${detailLine}`,
        }, { quoted: m });

        if (rich) {
          const carded = await sendDescriptionCard(sock, m.from, m, {
            text: detailLine,
            entity: {
              title: data.title || 'TikTok Video',
              subtitle: data.author || undefined,
              url,
            },
            footer: '© NEXORA MD by Aizen',
          });
          if (!carded) await sock.sendMessage(m.from, { text: detailLine }, { quoted: m });
        }
      } catch (err) {
        await m.reply.error(`TikTok download failed: ${err.message}`);
        throw err;
      }
    });
  }
};
