/**
 * soundSticker.js — WhatsApp "sound stickers" (audioStickerMessage).
 *
 * WhatsApp ships these as a beta format: a normal animated WebP sticker with
 * an Opus voice track attached, wrapped in `audioStickerMessage`.
 *
 * Neither field exists in this fork's proto, so both are added at runtime by
 * patching the protobuf encoders:
 *   - StickerMessage.audioMessage      → field 26   (wire 210  = 26<<3 | 2)
 *   - Message.audioStickerMessage      → field 134  (wire 1074 = 134<<3 | 2,
 *                                        encoded as FutureProofMessage)
 *
 * Wire shape (verified against a working implementation, 2026-11-24):
 *   { audioStickerMessage: { message: { stickerMessage: { ..., audioMessage } } },
 *     messageContextInfo: { messageSecret } }
 *
 * Only the encoder is patched. Incoming sound stickers still decode with the
 * audio half dropped, which is expected: the client gating lives in
 * WAWebSoundStickerGating (isSoundStickerConsumptionEnabled).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareWAMessageMedia, proto, generateMessageIDV2 } from 'baileys';

const execAsync = promisify(exec);

export const SOUND_STICKER_LIMITS = Object.freeze({
  maxSeconds: 5,
  size: 512,
  fps: 12,
  maxInputBytes: 16 * 1024 * 1024,
  audioBitrate: '64k',
  audioMimetype: 'audio/ogg; codecs=opus',
});

let extensionInstalled = false;

/** Adds the two missing fields to the fork's protobuf encoders. Idempotent. */
export function installAudioStickerExtension() {
  if (extensionInstalled) return true;
  try {
    const origStickerEncode = proto.Message.StickerMessage.encode;
    proto.Message.StickerMessage.encode = function encode(m, w) {
      w = origStickerEncode.call(this, m, w);
      if (m.audioMessage != null && Object.prototype.hasOwnProperty.call(m, 'audioMessage')) {
        proto.Message.AudioMessage.encode(m.audioMessage, w.uint32(210).fork()).ldelim();
      }
      return w;
    };

    const origMessageEncode = proto.Message.encode;
    proto.Message.encode = function encode(m, w) {
      w = origMessageEncode.call(this, m, w);
      if (m.audioStickerMessage != null && Object.prototype.hasOwnProperty.call(m, 'audioStickerMessage')) {
        proto.Message.FutureProofMessage.encode(m.audioStickerMessage, w.uint32(1074).fork()).ldelim();
      }
      return w;
    };

    extensionInstalled = true;
    return true;
  } catch {
    return false;
  }
}

/** First animation frame length, read from the WebP ANMF chunk. null when static. */
export function extractFirstFrameLength(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
    if (fourcc === 'ANMF') return offset;
  }
  return null;
}

async function withTempFiles(job) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = os.tmpdir();
  const input = path.join(dir, `saudio_in_${id}`);
  const output = path.join(dir, `saudio_out_${id}`);
  try {
    return await job({ input, output });
  } finally {
    await fs.promises.unlink(input).catch(() => {});
    await fs.promises.unlink(output).catch(() => {});
  }
}

/**
 * Duration and audio presence. The quoted `seconds` field rounds down, so this
 * is the real gate.
 */
export async function probeMedia(buffer) {
  return withTempFiles(async ({ input }) => {
    await fs.promises.writeFile(input, buffer);
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration:stream=codec_type -of json "${input}"`
      );
      const info = JSON.parse(stdout || '{}');
      const seconds = Number(info?.format?.duration) || 0;
      const hasAudio = (info?.streams || []).some((s) => s.codec_type === 'audio');
      const hasVideo = (info?.streams || []).some((s) => s.codec_type === 'video');
      return { ok: true, seconds, hasAudio, hasVideo };
    } catch (err) {
      return { ok: false, reason: `Could not read that media: ${err.message}` };
    }
  });
}

/** Video or image → 512px WebP sticker, capped at maxSeconds. */
export async function toStickerWebp(buffer, { isVideo, maxSeconds = SOUND_STICKER_LIMITS.maxSeconds } = {}) {
  return withTempFiles(async ({ input, output }) => {
    await fs.promises.writeFile(input, buffer);
    const scale = `scale=${SOUND_STICKER_LIMITS.size}:${SOUND_STICKER_LIMITS.size}:force_original_aspect_ratio=decrease`;
    const pad = `pad=${SOUND_STICKER_LIMITS.size}:${SOUND_STICKER_LIMITS.size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
    const cmd = isVideo
      ? `ffmpeg -y -i "${input}" -t ${maxSeconds} -vf "${scale},fps=${SOUND_STICKER_LIMITS.fps},${pad}" -loop 0 -an -vsync 0 -f webp "${output}"`
      : `ffmpeg -y -i "${input}" -vf "${scale},${pad}" -f webp -quality 85 "${output}"`;
    try {
      await execAsync(cmd);
      return { ok: true, buffer: await fs.promises.readFile(output) };
    } catch (err) {
      return { ok: false, reason: `Could not build the sticker: ${err.message}` };
    }
  });
}

/** Any media with an audio track → Opus/Ogg, trimmed to maxSeconds. */
export async function toStickerAudio(buffer, { maxSeconds = SOUND_STICKER_LIMITS.maxSeconds } = {}) {
  return withTempFiles(async ({ input, output }) => {
    await fs.promises.writeFile(input, buffer);
    try {
      await execAsync(
        `ffmpeg -y -i "${input}" -t ${maxSeconds} -vn -c:a libopus -b:a ${SOUND_STICKER_LIMITS.audioBitrate} -ar 48000 -f ogg "${output}"`
      );
      const audio = await fs.promises.readFile(output);
      let seconds = maxSeconds;
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${output}"`
        );
        const parsed = parseFloat(String(stdout).trim());
        if (Number.isFinite(parsed) && parsed > 0) seconds = Math.max(1, Math.round(parsed));
      } catch { /* keep the cap as the duration */ }
      return { ok: true, buffer: audio, seconds };
    } catch (err) {
      return { ok: false, reason: `Could not extract the audio: ${err.message}` };
    }
  });
}

/**
 * Upload both halves and relay the sound sticker.
 * Returns { ok: true, messageId } or { ok: false, reason }.
 */
export async function sendSoundSticker(sock, jid, { media, isVideo = false, quoted, maxSeconds = SOUND_STICKER_LIMITS.maxSeconds } = {}) {
  if (!installAudioStickerExtension()) {
    return { ok: false, reason: 'This build cannot encode sound stickers (protobuf patch failed).' };
  }

  const webp = await toStickerWebp(media, { isVideo, maxSeconds });
  if (!webp.ok) return webp;

  const audio = await toStickerAudio(media, { maxSeconds });
  if (!audio.ok) return audio;

  let stickerMedia;
  let audioMedia;
  try {
    stickerMedia = await prepareWAMessageMedia({ sticker: webp.buffer }, { upload: sock.waUploadToServer });
    audioMedia = await prepareWAMessageMedia(
      { audio: audio.buffer, mimetype: SOUND_STICKER_LIMITS.audioMimetype, ptt: false },
      { upload: sock.waUploadToServer }
    );
  } catch (err) {
    return { ok: false, reason: `Upload failed: ${err.message}` };
  }

  if (!stickerMedia?.stickerMessage) return { ok: false, reason: 'WhatsApp rejected the sticker upload.' };
  if (!audioMedia?.audioMessage) return { ok: false, reason: 'WhatsApp rejected the audio upload.' };

  const stickerNode = stickerMedia.stickerMessage;
  const firstFrameLength = extractFirstFrameLength(webp.buffer);
  stickerNode.isAnimated = isVideo;
  if (firstFrameLength) stickerNode.firstFrameLength = firstFrameLength;

  const quotedKey = quoted?.key;
  if (quotedKey?.id) {
    const participant = quotedKey.participant || quotedKey.remoteJid;
    stickerNode.contextInfo = {
      stanzaId: quotedKey.id,
      ...(participant ? { participant } : {}),
      ...(quoted?.message ? { quotedMessage: quoted.message } : {}),
    };
  }

  stickerNode.audioMessage = {
    ...audioMedia.audioMessage,
    mimetype: SOUND_STICKER_LIMITS.audioMimetype,
    seconds: audio.seconds,
    ptt: false,
  };

  const payload = {
    audioStickerMessage: { message: { stickerMessage: stickerNode } },
    messageContextInfo: { messageSecret: crypto.randomBytes(32) },
  };

  const messageId = generateMessageIDV2();
  try {
    await sock.relayMessage(jid, payload, { messageId });
  } catch (err) {
    return { ok: false, reason: `Could not send the sticker: ${err.message}` };
  }
  return { ok: true, messageId };
}

/** Whether the running fork already knows the audioStickerMessage field. */
export function hasNativeAudioStickerSupport() {
  return !!proto.Message?.fields?.audioStickerMessage;
}
