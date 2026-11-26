import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runFfmpeg(args) {
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 1024 * 1024,
  });
}

/**
 * WhatsApp stickers are WebP files. Animated stickers contain an ANIM chunk;
 * ffprobe is used first because it also handles files with unusual metadata.
 */
export async function isAnimatedSticker(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexora-sticker-'));
  const input = path.join(tempDir, 'sticker.webp');
  try {
    await fs.writeFile(input, buffer);
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_frames,duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        input,
      ], { maxBuffer: 256 * 1024 });
      const values = stdout.trim().split(/\s+/).map(Number);
      if (values.some((value) => Number.isFinite(value) && value > 1.01)) return true;
    } catch {
      // Fall through to the WebP container marker check.
    }

    const header = buffer.toString('latin1');
    return header.includes('ANIM') || header.includes('ANMF');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Convert a WhatsApp sticker into the natural media type for its animation:
 * static stickers become PNG images; animated stickers become MP4 video.
 */
export async function stickerToMedia(buffer, { force = null } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('The sticker is empty or could not be downloaded.');
  }

  const animated = await isAnimatedSticker(buffer);
  const outputType = force || (animated ? 'video' : 'image');
  if (!['image', 'video'].includes(outputType)) {
    throw new Error('Unsupported sticker output type.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexora-sticker-'));
  const input = path.join(tempDir, 'sticker.webp');
  const output = path.join(tempDir, outputType === 'video' ? 'sticker.mp4' : 'sticker.png');

  try {
    await fs.writeFile(input, buffer);
    if (outputType === 'video') {
      await runFfmpeg([
        '-i', input,
        '-an',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        output,
      ]);
    } else {
      await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', 'format=rgba', output]);
    }

    const result = await fs.readFile(output);
    return {
      buffer: result,
      type: outputType,
      animated,
      mimetype: outputType === 'video' ? 'video/mp4' : 'image/png',
      fileName: outputType === 'video' ? 'nexora-sticker.mp4' : 'nexora-sticker.png',
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function getStickerTarget(message) {
  if (message?.type === 'stickerMessage') return message;
  if (message?.quoted?.type === 'stickerMessage') return message.quoted;
  return null;
}
