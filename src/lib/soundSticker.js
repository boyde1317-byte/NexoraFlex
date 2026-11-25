/**
 * soundSticker.js — WhatsApp "sound stickers" (audioStickerMessage).
 *
 * WhatsApp ships these as a beta format: a normal animated WebP sticker with
 * an Opus voice track attached, wrapped in `audioStickerMessage`.
 *
 * Neither field exists in this fork's proto, so both are added at runtime by
 * patching the protobuf coders:
 *   - StickerMessage.audioMessage      → field 26   (wire 210  = 26<<3 | 2)
 *   - Message.audioStickerMessage      → field 134  (wire 1074 = 134<<3 | 2,
 *                                        encoded as FutureProofMessage)
 *
 * Wire shape (verified against a working implementation, 2026-11-24):
 *   { audioStickerMessage: { message: { stickerMessage: { ..., audioMessage } } },
 *     messageContextInfo: { messageSecret } }
 *
 * DECODING. The encoder patch alone meant every incoming sound sticker decoded
 * to `{}` — the content type was lost, so the bot could not even recognise one,
 * let alone read its audio. `installAudioStickerDecoder()` wraps the two
 * generated decoders and recovers the same two fields from the raw buffer
 * (a tiny field walker, no proto regeneration). Install it at boot, BEFORE the
 * socket is created: it has to cover live messages, quoted copies and the CRM
 * archive, or archived sound stickers are saved with the audio half missing.
 *
 * Client gating still lives in WAWebSoundStickerGating; nothing here can make
 * a phone render a sticker it refuses to consume.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareWAMessageMedia, downloadMediaMessage, proto, generateMessageIDV2 } from 'baileys';

const execAsync = promisify(exec);

export const SOUND_STICKER_LIMITS = Object.freeze({
  // 15s default. The 5s figure was WhatsApp's own sound-sticker spec, and the
  // client may still refuse longer tracks — nothing here has been verified
  // past 5s. But the relay enforces nothing: the WebP and its Opus track are
  // simply trimmed to this value, so length is a knob, not a wall. Drop it
  // back to 5 if a long sticker comes out silent or refuses to play.
  maxSeconds: 15,
  size: 512,
  fps: 12,
  maxInputBytes: 16 * 1024 * 1024,
  audioBitrate: '64k',
  audioMimetype: 'audio/ogg; codecs=opus',
});

// Wire field numbers the fork's proto is missing (see header).
const AUDIO_STICKER_FIELD = 134;      // Message.audioStickerMessage
const FUTURE_PROOF_MESSAGE_FIELD = 1; // FutureProofMessage.message
const MESSAGE_STICKER_FIELD = 26;     // Message.stickerMessage
const STICKER_AUDIO_FIELD = 26;       // StickerMessage.audioMessage

// Tag bytes for the two fields we look for, so a decode can skip the walker
// entirely when the field cannot be present (the common case, by far).
const AUDIO_STICKER_TAG = [0xb2, 0x08]; // 134 << 3 | 2 = 1074
const STICKER_AUDIO_TAG = [0xd2, 0x01]; //  26 << 3 | 2 =  210

let extensionInstalled = false;
let decoderInstalled = false;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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

// ─────────────────────────────────────────────────────────────────────────────
// Minimal protobuf field walker (length-delimited fields only)
//
// The fork's generated types cannot express fields 26/134, and protobufjs has
// no hook for unknown fields, so the only way to read them is off the raw
// buffer. Nothing here is a general protobuf parser: it walks the wire format,
// skips every wire type it does not need, and returns the bytes of the field
// asked for.
// ─────────────────────────────────────────────────────────────────────────────

function readVarint(buf, pos) {
  let value = 0;
  let shift = 0;
  while (pos < buf.length) {
    const byte = buf[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, pos];
    shift += 7;
    if (shift > 49) break;
  }
  throw new Error('truncated varint');
}

function eachField(buf, visit) {
  let pos = 0;
  while (pos < buf.length) {
    const [tag, afterTag] = readVarint(buf, pos);
    pos = afterTag;
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) {
      const [, next] = readVarint(buf, pos);
      pos = next;
      continue;
    }
    if (wire === 1) { pos += 8; continue; }
    if (wire === 5) { pos += 4; continue; }
    if (wire !== 2) throw new Error(`unsupported wire type ${wire}`);
    const [len, afterLen] = readVarint(buf, pos);
    const end = afterLen + len;
    if (end > buf.length) throw new Error('truncated field');
    if (visit(field, buf.subarray(afterLen, end)) === false) return;
    pos = end;
  }
}

/** Bytes of the first length-delimited occurrence of `field`, or null. */
export function findBytesField(buf, field) {
  let found = null;
  try {
    eachField(buf, (f, value) => {
      if (f !== field) return undefined;
      found = value;
      return false;
    });
  } catch {
    return null;
  }
  return found;
}

/** Cheap pre-test: could this buffer contain the given two-byte field tag? */
function hasTag(buf, [a, b]) {
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === a && buf[i + 1] === b) return true;
  }
  return false;
}

/**
 * Bytes the decoder is about to consume. Called BEFORE the original decode,
 * because the reader position is what delimits the nested message.
 */
function captureBytes(reader, length) {
  try {
    if (reader instanceof Uint8Array) {
      const end = length != null ? Math.min(length, reader.length) : reader.length;
      return reader.subarray(0, end);
    }
    if (reader && typeof reader.pos === 'number' && reader.buf) {
      const start = reader.pos;
      const end = length != null ? start + length : reader.len;
      if (end > start && end <= reader.buf.length) return reader.buf.subarray(start, end);
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Recovers `StickerMessage.audioMessage` and `Message.audioStickerMessage`
 * from the raw bytes and attaches them to the decoded object, so every
 * consumer (serializer, CRM archive, quoted copies) sees a normal field.
 * Idempotent, and a failure here can never break an ordinary message.
 */
export function installAudioStickerDecoder() {
  if (decoderInstalled) return true;
  try {
    // The fork's generated decoders take (reader, length, stopTag, depth) —
    // forward all four, or a nested decode loses its stop tag and depth.
    const origStickerDecode = proto.Message.StickerMessage.decode;
    proto.Message.StickerMessage.decode = function decode(...args) {
      const raw = captureBytes(args[0], args[1]);
      const msg = origStickerDecode.apply(this, args);
      try {
        if (msg && raw && !hasOwn(msg, 'audioMessage') && hasTag(raw, STICKER_AUDIO_TAG)) {
          const bytes = findBytesField(raw, STICKER_AUDIO_FIELD);
          if (bytes) msg.audioMessage = proto.Message.AudioMessage.decode(bytes);
        }
      } catch { /* a malformed extra field must never break a sticker */ }
      return msg;
    };

    const origMessageDecode = proto.Message.decode;
    proto.Message.decode = function decode(...args) {
      const raw = captureBytes(args[0], args[1]);
      const msg = origMessageDecode.apply(this, args);
      try {
        if (msg && raw && !hasOwn(msg, 'audioStickerMessage') && hasTag(raw, AUDIO_STICKER_TAG)) {
          const wrapper = findBytesField(raw, AUDIO_STICKER_FIELD);
          const inner = wrapper && findBytesField(wrapper, FUTURE_PROOF_MESSAGE_FIELD);
          const stickerBytes = inner && findBytesField(inner, MESSAGE_STICKER_FIELD);
          if (stickerBytes) {
            const sticker = proto.Message.StickerMessage.decode(stickerBytes);
            if (sticker?.audioMessage) msg.audioStickerMessage = { message: { stickerMessage: sticker } };
          }
        }
      } catch { /* never break a normal decode over a beta field */ }
      return msg;
    };

    decoderInstalled = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalises both shapes a sound sticker can arrive in:
 *   { audioStickerMessage: { message: { stickerMessage } } }   ← the wrapper
 *   { stickerMessage: { ..., audioMessage } }                  ← unwrapped
 * Returns { sticker, audio, wrapped } or null when this is not a sticker.
 */
const STICKER_MARKERS = [
  'isAnimated',
  'pngThumbnail',
  'stickerSentTs',
  'isAvatar',
  'isAiSticker',
  'isLottie',
];

/** Is this node the picture half, the sound half, or neither? */
function nodeRole(node) {
  const mime = typeof node.mimetype === 'string' ? node.mimetype.toLowerCase() : '';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/webp')) return 'sticker';
  if (STICKER_MARKERS.some((k) => node[k] !== undefined)) return 'sticker';
  if (node.ptt !== undefined && node.seconds !== undefined) return 'audio';
  return null;
}

function scanMedia(node, depth, out, seen) {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Buffer.isBuffer(node) || ArrayBuffer.isView(node) || seen.has(node)) return;
  seen.add(node);

  const role = nodeRole(node);
  if (role) out.push({ role, node, depth });

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') scanMedia(child, depth + 1, out, seen);
  }
}

/** Shallowest match wins: a quoted copy sits deeper than the real thing. */
function shallowest(matches, role) {
  const hit = matches
    .filter((match) => match.role === role)
    .sort((a, b) => a.depth - b.depth)[0];
  return hit?.node || null;
}

/**
 * Find the two halves of a sound sticker by SHAPE, not by a fixed path.
 *
 * The fork only decodes the fields it knows, so a sound sticker can arrive as
 * `audioStickerMessage.message.stickerMessage`, as a bare `stickerMessage`,
 * with the audio as a sibling of the sticker inside the 134 wrapper, or
 * nested any number of levels deeper. Reading a single hard-coded path meant
 * every variant but the one we happened to expect read as "no sound".
 */
export function readAudioSticker(content) {
  if (!content || typeof content !== 'object') return null;

  const matches = [];
  scanMedia(content, 0, matches, new Set());
  const sticker = shallowest(matches, 'sticker') || content.stickerMessage || null;
  if (!sticker) return null;
  const audio = shallowest(matches, 'audio') || null;
  return { sticker, audio, wrapped: !!content.audioStickerMessage };
}

/**
 * One-line map of what a payload actually contains, for the owner-only line
 * on a failed extraction. A refusal that says only "no sound" costs a whole
 * round trip; this says which keys arrived and where.
 */
export function describeStickerShape(content) {
  const parts = [];
  const seen = new Set();
  const walk = (node, depth, path) => {
    if (!node || typeof node !== 'object' || depth > 4 || parts.length >= 10) return;
    if (Buffer.isBuffer(node) || ArrayBuffer.isView(node) || seen.has(node)) return;
    seen.add(node);
    const keys = Object.keys(node).filter((key) => {
      const value = node[key];
      return !Buffer.isBuffer(value) && !ArrayBuffer.isView(value);
    });
    if (keys.length) parts.push(`${path || 'root'}{${keys.slice(0, 8).join(',')}}`);
    for (const key of keys.slice(0, 8)) {
      walk(node[key], depth + 1, path ? `${path}.${key}` : key);
    }
  };
  walk(content, 0, '');
  return parts.join(' > ') || 'nothing';
}

/**
 * Some clients carry the Opus track inside the sticker payload itself (the
 * "WAVP" shape: a RIFF/WebP container with an Ogg stream appended). There is
 * no audioMessage to download in that case, so slice at the OggS magic.
 */
export function extractEmbeddedOgg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) return null;
  const idx = buffer.indexOf('OggS', 0, 'ascii');
  if (idx < 0 || idx + 64 > buffer.length) return null;
  return buffer.subarray(idx);
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
      // -frames:v 1 + libwebp keeps this a STILL WebP. Without them ffmpeg's
      // webp muxer wraps the single frame in ANIM/ANMF, which is a one-frame
      // animation: a client that trusts the container would see an animated
      // sticker that claims isAnimated:false.
      : `ffmpeg -y -i "${input}" -frames:v 1 -vf "${scale},${pad}" -c:v libwebp -quality 85 -f webp "${output}"`;
    try {
      await execAsync(cmd);
      return { ok: true, buffer: await fs.promises.readFile(output) };
    } catch (err) {
      return { ok: false, reason: `Could not build the sticker: ${err.message}` };
    }
  });
}

/**
 * Any media with an audio track → Opus/Ogg. `maxSeconds: null` keeps the whole
 * track, which is what extracting a sound needs: the 15s ceiling only exists
 * for the sticker half, never for playback of the original.
 */
export async function transcodeAudio(buffer, { maxSeconds = null } = {}) {
  return withTempFiles(async ({ input, output }) => {
    await fs.promises.writeFile(input, buffer);
    const trim = maxSeconds ? `-t ${maxSeconds} ` : '';
    try {
      await execAsync(
        `ffmpeg -y -i "${input}" ${trim}-vn -c:a libopus -b:a ${SOUND_STICKER_LIMITS.audioBitrate} -ar 48000 -f ogg "${output}"`
      );
      const audio = await fs.promises.readFile(output);
      let seconds = null;
      try {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${output}"`
        );
        const parsed = parseFloat(String(stdout).trim());
        if (Number.isFinite(parsed) && parsed > 0) seconds = Math.max(1, Math.round(parsed));
      } catch { /* duration is a nicety, not a gate */ }
      return { ok: true, buffer: audio, seconds };
    } catch (err) {
      return { ok: false, reason: `Could not extract the audio: ${err.message}` };
    }
  });
}

/** Any media with an audio track → Opus/Ogg, trimmed to maxSeconds. */
export async function toStickerAudio(buffer, { maxSeconds = SOUND_STICKER_LIMITS.maxSeconds } = {}) {
  const out = await transcodeAudio(buffer, { maxSeconds });
  if (!out.ok) return out;
  return { ...out, seconds: out.seconds || maxSeconds };
}

/** Download the Opus track of a sound sticker from its own audioMessage. */
export async function downloadStickerAudio(audioMessage, key = {}) {
  const fake = {
    message: { audioMessage },
    key: { id: key.id, remoteJid: key.remoteJid, participant: key.participant },
  };
  const buf = await downloadMediaMessage(fake, 'buffer', {});
  return buf?.length ? buf : null;
}

/** Download the sticker payload itself (the WebP half). */
export async function downloadStickerBuffer(sticker, key = {}) {
  const fake = {
    message: { stickerMessage: sticker },
    key: { id: key.id, remoteJid: key.remoteJid, participant: key.participant },
  };
  const buf = await downloadMediaMessage(fake, 'buffer', {});
  return buf?.length ? buf : null;
}

/**
 * Upload both halves and relay a sound sticker from parts that are already
 * encoded. Split out of sendSoundSticker so a stitched sticker (image + a
 * separate sound) reuses the exact wire path instead of copying it.
 */
export async function sendSoundStickerParts(sock, jid, {
  webp,
  audio,
  seconds = null,
  isAnimated = false,
  quoted,
} = {}) {
  if (!installAudioStickerExtension()) {
    return { ok: false, reason: 'This build cannot encode sound stickers (protobuf patch failed).' };
  }
  if (!Buffer.isBuffer(webp) || !webp.length) return { ok: false, reason: 'No sticker image to send.' };
  if (!Buffer.isBuffer(audio) || !audio.length) return { ok: false, reason: 'No sound to attach.' };

  let stickerMedia;
  let audioMedia;
  try {
    stickerMedia = await prepareWAMessageMedia({ sticker: webp }, { upload: sock.waUploadToServer });
    audioMedia = await prepareWAMessageMedia(
      { audio, mimetype: SOUND_STICKER_LIMITS.audioMimetype, ptt: false },
      { upload: sock.waUploadToServer }
    );
  } catch (err) {
    return { ok: false, reason: `Upload failed: ${err.message}` };
  }

  if (!stickerMedia?.stickerMessage) return { ok: false, reason: 'WhatsApp rejected the sticker upload.' };
  if (!audioMedia?.audioMessage) return { ok: false, reason: 'WhatsApp rejected the audio upload.' };

  const stickerNode = stickerMedia.stickerMessage;
  const firstFrameLength = extractFirstFrameLength(webp);
  stickerNode.isAnimated = !!isAnimated;
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
    seconds: seconds || SOUND_STICKER_LIMITS.maxSeconds,
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

/**
 * Image + a separate sound → the two encoded halves of a sound sticker.
 * The image half is always static (an animated half already has its own
 * audio track, so `.saudio` on a video never needs this path).
 */
export async function buildStickerFromParts({ image, audio, maxSeconds = SOUND_STICKER_LIMITS.maxSeconds } = {}) {
  const webp = await toStickerWebp(image, { isVideo: false });
  if (!webp.ok) return webp;
  const track = await toStickerAudio(audio, { maxSeconds });
  if (!track.ok) return track;
  return { ok: true, webp: webp.buffer, audio: track.buffer, seconds: track.seconds };
}

/**
 * One media file carrying both halves → upload both and relay the sticker.
 * Returns { ok: true, messageId } or { ok: false, reason }.
 */
export async function sendSoundSticker(sock, jid, {
  media,
  isVideo = false,
  quoted,
  maxSeconds = SOUND_STICKER_LIMITS.maxSeconds,
} = {}) {
  const webp = await toStickerWebp(media, { isVideo, maxSeconds });
  if (!webp.ok) return webp;

  const audio = await toStickerAudio(media, { maxSeconds });
  if (!audio.ok) return audio;

  return sendSoundStickerParts(sock, jid, {
    webp: webp.buffer,
    audio: audio.buffer,
    seconds: audio.seconds,
    isAnimated: isVideo,
    quoted,
  });
}

/**
 * Whether the running fork already knows the audioStickerMessage field.
 * The pinned fork ships the static build, where known fields sit on the
 * prototype (`fields` is undefined), so check both shapes.
 */
export function hasNativeAudioStickerSupport() {
  if (proto.Message?.fields?.audioStickerMessage) return true;
  try {
    return 'audioStickerMessage' in proto.Message.prototype;
  } catch {
    return false;
  }
}
