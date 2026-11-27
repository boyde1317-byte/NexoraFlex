import { getQuotedStickerHash, getStickerCommand, deleteStickerCommand, findByCommand } from '../../lib/stickerCommand.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'delsticker',
  aliases: ['removesticker', 'unsticker'],
  category: 'utility',
  description: 'Remove a sticker command by name or reply. Usage: .delsticker menu or reply to the sticker',
  permissions: { owner: true },

  execute: async ({ m, args }) => {
    const commandName = args.join(' ').trim().replace(/^\./, '').toLowerCase();
    const byName = commandName ? findByCommand(commandName) : null;
    const hash = byName?.hash || getQuotedStickerHash(m);
    if (!hash) {
      return m.reply.error('Usage: *.delsticker <command>* or reply to the sticker you want to unregister.');
    }

    const entry = byName || getStickerCommand(hash);
    if (!entry) {
      return m.reply.error('That sticker has no registered command.');
    }

    if (entry.locked) {
      return m.reply.error('That binding is locked. Run .unlockcmd first.');
    }

    await withReactionStatus(m, async () => {
      deleteStickerCommand(hash);
      await m.reply.success(`Removed sticker mapping for *.${entry.command}*`);
    });
  }
};
