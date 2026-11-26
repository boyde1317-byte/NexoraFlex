/**
 * saudio.js — sound stickers: make them, pull the sound back out, or stitch
 * a separate sound onto an image.
 *
 * WhatsApp's sound stickers are beta (Android 2.26.41.x): an animated WebP
 * sticker with an Opus track attached, wrapped in audioStickerMessage. The
 * wire work lives in src/lib/soundSticker.js, including the protobuf patches
 * this fork needs because it predates the field.
 *
 * Usage:
 *   .saudio              reply to a video of up to 15 seconds → sound sticker
 *   .saudio 8            same, but cap the track at 8 seconds
 *   .saudio get          reply to a sound sticker → its sound back as audio
 *   .saudio vn           same, but as a voice note
 *                        (both read the two halves by shape and fall back to
 *                        the CRM archive when the quoted copy lost the clip)
 *   .saudio stitch       reply to an image that replies to a sound → one
 *                        sound sticker made of that image + that sound
 *
 * The stitch flow is three messages, in order: send the sound, reply to it
 * with the image, reply to that image with `.saudio`. Carrying `.saudio` as
 * the image's own caption works too, because the image is then already a
 * reply to the sound. src/lib/audioStickerLink.js does the two-hop lookup and
 * falls back to the CRM archive when the quoted copy lost its contextInfo.
 *
 * Gates, in order: the right quoted media present, downloads, ffprobe
 * duration, audio stream present, input size. Every refusal is one line,
 * because a beta format that silently does nothing is worse than a clear "no".
 */
import { downloadMediaMessage } from 'baileys';
import {
  sendSoundSticker,
  sendSoundStickerParts,
  buildStickerFromParts,
  readAudioSticker,
  describeStickerShape,
  isAudioDownloadable,
  downloadStickerAudio,
  downloadStickerBuffer,
  extractEmbeddedOgg,
  transcodeAudio,
  probeMedia,
  SOUND_STICKER_LIMITS,
} from '../../lib/soundSticker.js';
import {
  describeContent,
  resolveLinkedAudio,
  downloadLinkedAudio,
  archivedContent,
} from '../../lib/audioStickerLink.js';

const HARD_CAP_SECONDS = 15;
const DEFAULT_CAP_SECONDS = SOUND_STICKER_LIMITS.maxSeconds;

/** Words that force a mode. Anything numeric is still a seconds cap. */
const MODES = {
  get: 'extract',
  extract: 'extract',
  sound: 'extract',
  vn: 'voice',
  voice: 'voice',
  stitch: 'stitch',
  make: 'stitch',
  image: 'stitch',
};

const usage = (p = '.') => (
  `Sound stickers, three ways:\n\n` +
  `• \`${p}saudio\` — reply to a video (up to ${DEFAULT_CAP_SECONDS}s) and it comes back as a sound sticker.\n` +
  `• \`${p}saudio get\` — reply to a sound sticker and the sound comes back as audio.\n` +
  `• \`${p}saudio stitch\` — send the sound, reply to it with the image, then reply to the image with this.\n\n` +
  `\`${p}saudio vn\` returns the sound as a voice note. Add a number to cap the track, e.g. \`${p}saudio 8\`.`
);

/** Download the image half, falling back to the archived original. */
async function downloadImage(target, m) {
  try {
    const buf = await target.download();
    if (buf?.length) return buf;
  } catch { /* fall through to the archive */ }

  const original = archivedContent(m, target.key?.id);
  if (original) {
    try {
      const buf = await downloadMediaMessage(
        { message: original, key: { id: target.key?.id, remoteJid: m.from } },
        'buffer',
        {}
      );
      if (buf?.length) return buf;
    } catch { /* nothing else to try */ }
  }
  return null;
}

/** The sound behind the image: one hop for a caption, two hops for a reply. */
async function findSound(m, selfImage) {
  if (!selfImage) return resolveLinkedAudio(m);

  const quoted = m.quoted;
  if (!quoted?.key?.id) {
    return { ok: false, reason: 'Reply to the sound with this image, so I know which sound to use.' };
  }
  const content = archivedContent(m, quoted.key.id) || quoted.message;
  if (!content) {
    return { ok: false, reason: 'I cannot find the sound that image replies to any more.' };
  }
  const { type, node } = describeContent(content);
  return { ok: true, stanzaId: quoted.key.id, type, node, content };
}

/** Sound sticker → its sound, as audio (or a voice note). */
async function runExtract({ sock, m, target, sticker, voice }) {
  let half = sticker;
  let source = 'the quoted copy';
  let downloadError = '';

  // The archive holds the message as it first arrived, which is the same
  // reason .vv needs an archive fallback. It is the only copy that still has
  // the clip when WhatsApp strips it from the quote, and the only copy whose
  // media keys are intact when the quote keeps the node but blanks them.
  const fromArchive = () => {
    if (!target.key?.id) return null;
    const archived = archivedContent(m, target.key.id);
    const again = archived ? readAudioSticker(archived) : null;
    return again?.audio ? again : null;
  };

  if (!isAudioDownloadable(half?.audio)) {
    const again = fromArchive();
    if (again) {
      half = again;
      source = 'the archive';
    }
  }

  const owner = await m.isOwner;
  const seen = (extra) => (owner
    ? `\n\n_seen (${source}): ${describeStickerShape(target.content)}${extra ? ` · ${extra}` : ''}_`
    : '');

  if (!half?.sticker && !half?.audio) {
    return m.reply(`I cannot see a sticker in that reply. Reply to the sticker itself and try again.${seen()}`);
  }

  const fetchAudio = async (node) => {
    if (!isAudioDownloadable(node)) return null;
    try {
      const buf = await downloadStickerAudio(node, target.key);
      return buf?.length ? buf : null;
    } catch (err) {
      downloadError = String(err?.message || err || 'download failed');
      return null;
    }
  };

  let buffer = await fetchAudio(half?.audio);

  // The quoted copy still had a usable-looking clip and the download failed
  // anyway (expired URL, blanked key). Try the archive once before refusing.
  if (!buffer && source !== 'the archive') {
    const again = fromArchive();
    if (again?.audio) {
      const retried = await fetchAudio(again.audio);
      if (retried) {
        buffer = retried;
        half = again;
        source = 'the archive';
      }
    }
  }

  // Some clients carry the Opus track inside the sticker payload itself.
  if (!buffer && half?.sticker) {
    const webp = await downloadStickerBuffer(half.sticker, target.key).catch(() => null);
    if (webp) buffer = extractEmbeddedOgg(webp);
  }

  if (!buffer) {
    // Three different failures used to share one line, which made a device
    // report impossible to act on: no clip attached, or a clip we could not
    // fetch. Say which.
    if (half?.audio) {
      return m.reply(`Could not download that sticker's sound. It may have expired.${seen(downloadError)}`);
    }
    return m.reply(`That sticker has no sound attached — it is an ordinary sticker.${seen()}`);
  }

  const track = await transcodeAudio(buffer);
  if (!track.ok) return m.reply(track.reason);

  await sock.sendMessage(m.from, {
    audio: track.buffer,
    mimetype: SOUND_STICKER_LIMITS.audioMimetype,
    ptt: !!voice,
    ...(voice ? {} : { fileName: 'sound-sticker.ogg' }),
  }, { quoted: m });

  return null;
}

/** Image + a separate sound → one sound sticker. */
async function runStitch({ sock, m, target, selfImage, maxSeconds }) {
  const image = await downloadImage(target, m);
  if (!image) return m.reply('Could not download that image — it may have expired.');

  const link = await findSound(m, selfImage);
  if (!link.ok) return m.reply(link.reason);

  const sound = await downloadLinkedAudio(link, m);
  if (!sound.ok) return m.reply(sound.reason);

  const probe = await probeMedia(sound.buffer);
  if (!probe.ok) return m.reply(probe.reason);
  if (!probe.hasAudio) return m.reply('That sound has no audio track in it.');
  if (probe.seconds > maxSeconds + 0.5) {
    return m.reply(`That sound is ${probe.seconds.toFixed(1)}s. Sound stickers cap at ${maxSeconds}s.`);
  }

  const parts = await buildStickerFromParts({ image, audio: sound.buffer, maxSeconds });
  if (!parts.ok) return m.reply(parts.reason);

  const result = await sendSoundStickerParts(sock, m.from, {
    webp: parts.webp,
    audio: parts.audio,
    seconds: parts.seconds,
    isAnimated: false,
    quoted: m.quoted
      ? { key: m.quoted.key, message: m.quoted.message }
      : { key: m.key, message: m.message },
  });
  if (!result.ok) return m.reply(result.reason);
  return null;
}

export default {
  name: 'saudio',
  aliases: ['ssticker', 'soundsticker'],
  category: 'media',
  description: 'Sound stickers: reply to a video to make one, `.saudio get` to pull the sound out, `.saudio stitch` to put an image with a separate sound. Usage: .saudio [get|vn|stitch] [max seconds]',
  cooldown: 8000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const first = String(args[0] || '').toLowerCase();
    const mode = MODES[first] || null;

    const requested = Number(first);
    const maxSeconds = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.round(requested), HARD_CAP_SECONDS)
      : DEFAULT_CAP_SECONDS;

    const selfImage = m.type === 'imageMessage';
    const target = m.quoted
      ? { key: m.quoted.key, content: m.quoted.message, type: m.quoted.type, download: () => m.quoted.download() }
      : { key: m.key, content: m.message, type: m.type, download: () => m.download() };

    const sticker = readAudioSticker(target.content);
    const isSoundSticker = !!sticker?.audio || target.type === 'audioStickerMessage';
    const isPlainSticker = target.type === 'stickerMessage' || (!!sticker && !sticker.audio);
    const isVideo = target.type === 'videoMessage';
    const isImage = target.type === 'imageMessage';
    const isAudio = target.type === 'audioMessage' || target.type === 'pttMessage';

    // ── Extract ──────────────────────────────────────────────────────────────
    if (mode === 'extract' || mode === 'voice' || (!mode && (isSoundSticker || isPlainSticker))) {
      if (!isSoundSticker && !isPlainSticker) {
        return m.reply(`Reply to a sound sticker with \`${p}saudio get\` to pull its sound out.`);
      }
      return runExtract({ sock, m, target, sticker, voice: mode === 'voice' });
    }

    // ── Stitch ───────────────────────────────────────────────────────────────
    if (mode === 'stitch' || (!mode && (isImage || selfImage))) {
      if (!isImage && !selfImage) {
        return m.reply(`Reply to an image that replies to a sound with \`${p}saudio stitch\`.`);
      }
      return runStitch({ sock, m, target, selfImage, maxSeconds });
    }

    // ── Video → sound sticker (unchanged) ────────────────────────────────────
    if (isVideo) {
      const secondsField = Number(m.quoted?.msg?.seconds || m.msg?.seconds || 0);
      if (secondsField > maxSeconds + 1) {
        return m.reply(`That clip is about ${secondsField}s. Sound stickers cap at ${maxSeconds}s.`);
      }

      let media;
      try {
        media = await target.download();
      } catch (err) {
        return m.reply(`Could not download that video: ${err.message}`);
      }
      if (!media?.length) return m.reply(`Reply to a video of up to ${DEFAULT_CAP_SECONDS} seconds with ${p}saudio`);
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
    }

    // ── Everything else ──────────────────────────────────────────────────────
    if (isAudio) {
      return m.reply(`That is audio on its own. Send an image as a reply to it, then reply to the image with \`${p}saudio\` to stitch them into one sticker.`);
    }

    return m.reply(usage(p));
  },
};
