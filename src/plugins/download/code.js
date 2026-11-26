/**
 * @file src/plugins/download/code.js
 *
 * .pull <url> [path] [--mediafire] — download an archive/file, optionally upload it to MediaFire.
 * GitHub repository URLs are downloaded as ZIP archives and sent as documents.
 *
 * Usage:
 *   .pull https://github.com/owner/repo   → sends the repository ZIP
 *   .pull <zip-or-mediafire-url>          → sends the archive
 *   .pull <url> README.md                 → sends one matching file
 *   .pull <url> --mediafire               → uploads the archive/file (owner only)
 *
 * Supports MediaFire pages, GitHub repository URLs, direct .zip/.tar.gz files,
 * and any single-file URL. Downloads are size-capped and archives are unpacked
 * in memory only when a specific file is requested.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { pullCode, findInCodebase } from '../../lib/codePull.js';
import { uploadToMediaFire } from '../../lib/mediafireUpload.js';

// extension → mimetype for the common file types we hand back
const MIME = {
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  ts: 'text/plain', md: 'text/markdown', txt: 'text/plain', html: 'text/html',
  css: 'text/css', py: 'text/plain', sh: 'text/plain', yml: 'text/plain',
  yaml: 'text/plain', xml: 'application/xml', zip: 'application/zip',
  gz: 'application/gzip', tgz: 'application/gzip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

const safeFilename = (name) =>
  (name || 'download').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'download';

const mimeFor = (name) => MIME[name.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

export default {
  name: 'pull',
  aliases: ['codebase', 'srcpull'],
  category: 'download',
  description: 'Download a repository/archive as a ZIP or upload it to MediaFire with --mediafire (owner only).',
  cooldown: 10000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const usage = async () => await m.reply.info(
      `Usage: \`${p}pull <url> [file] [--mediafire]\`\n\n` +
      `\`${p}pull github.com/user/repo\` — sends the repository ZIP\n` +
      `\`${p}pull github.com/user/repo --mediafire\` — uploads the ZIP and returns its MediaFire link (owner only)\n` +
      `\`${p}pull <zip-or-mediafire-url>\` — sends the archive\n` +
      `\`${p}pull <url> <filename>\` — sends one file from the archive\n\n` +
      'A direct file URL (js/json/txt/...) is sent as a document. MediaFire upload requires API credentials in the bot environment.',
      'PULL CODE'
    );

    const mediafireMode = args.some((arg) => /^--mediafire$/i.test(arg));
    const pullArgs = args.filter((arg) => !/^--mediafire$/i.test(arg));
    if (!pullArgs[0]) return usage();
    if (mediafireMode && !m.isOwner) {
      return await m.reply.warn('The MediaFire upload option is restricted to the NEXORA owner.');
    }

    const url = pullArgs[0];
    const wanted = pullArgs.slice(1).join(' ').trim() || null;

    const uploadAndReply = async (buffer, filename) => {
      const uploaded = await uploadToMediaFire(Buffer.from(buffer), filename);
      await m.reply(`*NEXORA MD | MediaFire Upload*\nFile: ${uploaded.filename}\n${uploaded.url}`);
    };

    try {
      await withReactionStatus(m, async () => {
      const result = await pullCode(url);

      // Single-file URL: send the downloaded file directly.
      if (result.kind === 'file') {
        const name = safeFilename(result.name);
        if (mediafireMode) return await uploadAndReply(result.buf, name);
        await sock.sendMessage(m.from, {
          document: Buffer.from(result.buf),
          fileName: name,
          mimetype: mimeFor(name),
        }, { quoted: m });
        return;
      }

      // A requested path keeps the convenient single-file extraction behavior.
      if (wanted) {
        const hit = findInCodebase(result.files, wanted);
        if (!hit) {
          const tip = wanted.length > 3 ? '' : ' (try a longer, unique part of the path)';
          return await m.reply.error(`No file matching \`${wanted}\` in this codebase${tip}. Re-run \`${p}pull ${url}\` to download the archive.`, 'PULL CODE');
        }
        const [path, data, allMatches] = hit;
        if (allMatches && allMatches.length > 1) {
          await m.reply(`Matched several files — sending \`${path}\`. Also possible:\n` +
            allMatches.slice(1, 6).map((candidate) => `• \`${candidate}\``).join('\n'));
        }
        const name = safeFilename(path.split('/').pop());
        if (mediafireMode) return await uploadAndReply(data, name);
        await sock.sendMessage(m.from, {
          document: Buffer.from(data),
          fileName: name,
          mimetype: mimeFor(name),
        }, { quoted: m });
        return;
      }

      // No path requested: return the original repository/archive as an attachment.
      const name = safeFilename(result.archiveName || `${result.name}.zip`);
      if (mediafireMode) return await uploadAndReply(result.archiveBuffer, name);
      await sock.sendMessage(m.from, {
        document: Buffer.from(result.archiveBuffer),
        fileName: name,
        mimetype: mimeFor(name),
      }, { quoted: m });
      });
    } catch (error) {
      if (!mediafireMode) throw error;
      const reason = String(error?.message || 'Unknown error').slice(0, 350);
      return await m.reply.error(`MediaFire upload failed: ${reason}`, 'MEDIAFIRE UPLOAD');
    }
  },
};
