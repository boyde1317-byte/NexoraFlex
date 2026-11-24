/**
 * saudio.js — sound sticker: reply to a short video with `.saudio`.
 *
 * WhatsApp's sound stickers are beta (Android 2.26.41.x): an animated WebP
 * sticker with an Opus track attached, wrapped in audioStickerMessage. The
 * wire work lives in src/lib/soundSticker.js, including the protobuf patch
 * this fork needs because it predates the field.
 *
 * Usage:
 *   .saudio            reply to a video of 5 seconds or less
 *   .saudio 8          allow up to 8 seconds (clamped to 15)
 *
 * Gates, in order: quoted video present, downloads, ffprobe duration, audio
 * stream present, input size. Every refusal is one line, because a beta
 * format that silently does nothing is worse than a clear "no".
 */
import {
  sendSoundSticker,
  probeMedia,
  SOUND_STICKER_LIMITS,
} from '../../lib/soundSticker.js';

const HARD_CAP_SECONDS = 15;

export default {
  name: 'saudio',
  aliases: ['ssticker', 'soundsticker'],
  category: 'media',
  description: 'Turn a short video into a sound sticker (sticker + audio). Usage: .saudio [max seconds]',
  cooldown: 8000,

  execute: async ({ sock, m, args }) => {
    const q = m.quoted || m;
    const type = q.type || q.msg?.mimetype || '';
    const isVideo = type === 'videoMessage' || /video/.test(type);

    if (!isVideo) {
      return m.reply('Reply to a video of 5 seconds or less with .saudio');
    }

    const requested = Number(args[0]);
    const maxSeconds = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.round(requested), HARD_CAP_SECONDS)
      : SOUND_STICKER_LIMITS.maxSeconds;

    const secondsField = Number(q.msg?.seconds || q.seconds || 0);
    if (secondsField > maxSeconds + 1) {
      return m.reply(`That clip is about ${secondsField}s. Sound stickers cap at ${maxSeconds}s.`);
    }

    let media;
    try {
      media = await q.download();
    } catch (err) {
      return m.reply(`Could not download that video: ${err.message}`);
    }
    if (!media?.length) return m.reply('Reply to a video of 5 seconds or less with .saudio');
    if (media.length > SOUND_STICKER_LIMITS.maxInputBytes) {
      return m.reply('That video is too large to process, try a shorter clip.');
    }

    const probe = await probeMedia(media);
    if (!probe.ok) return m.reply(probe.reason);
    if (probe.seconds > maxSeconds + 0.5) {
      return m.reply(`That clip is ${probe.seconds.toFixed(1)}s. Sound stickers cap at ${maxSeconds}s.`);
    }
    if (!probe.hasAudio) {
      return m.reply('That video has no sound, so there is nothing to stick.');
    }

    const result = await sendSoundSticker(sock, m.from, {
      media,
      isVideo: true,
      quoted: m.quoted ? { key: m.quoted.key, message: m.quoted.message } : { key: m.key, message: m.message },
      maxSeconds,
    });

    if (!result.ok) return m.reply(result.reason);
    return m.reply(`Sound sticker sent (${probe.seconds.toFixed(1)}s).`);
  },
};
