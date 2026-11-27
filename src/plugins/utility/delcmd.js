/**
 * delcmd.js — remove a sticker-to-command binding.
 *
 * Ported from Rem Bot's cmd-del.js. Refuses locked bindings, and unlike the
 * original it names what it removed instead of a bare "Berhasil!".
 */
import { db } from '../../database/db.js';
import { deleteStickerCommand, findByCommand } from '../../lib/stickerCommand.js';

function hashOf(quoted) {
  const s = quoted?.message?.stickerMessage
    ?? quoted?.message?.documentWithCaptionMessage?.message?.stickerMessage
    ?? quoted?.stickerMessage;
  if (!s) return null;
  const raw = s.fileSha256 ?? s.mediaKey ?? null;
  if (!raw) return null;
  return Buffer.isBuffer(raw) ? raw.toString('base64') : String(raw);
}

export default {
  name: 'delcmd',
  aliases: [],
  category: 'utility',
  description: 'Delete a sticker command by name or reply. Usage: .delcmd menu or reply to a sticker with .delcmd',
  cooldown: 1500,
  permissions: { owner: true },
  execute: async ({ m, args }) => {
    const commandName = args.join(' ').trim().replace(/^\./, '').toLowerCase();
    const byName = commandName ? findByCommand(commandName) : null;
    const hash = byName?.hash || (m.quoted ? hashOf(m.quoted) : null);
    if (!hash) {
      return await m.reply.error('Usage: *.delcmd <command>* or reply to the sticker whose binding you want to delete.');
    }
    const store = db.data.stickerCommands || {};
    const entry = byName || store[hash];
    if (!entry) return await m.reply.error('That sticker is not bound to a command.');
    if (entry.locked) return await m.reply.error('That binding is locked. Run .unlockcmd first.');

    deleteStickerCommand(hash);
    return await m.reply.success(`Deleted the binding for *.${entry.command || 'command'}*`);
  },
};
