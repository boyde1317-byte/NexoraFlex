/**
 * testptvquote.js — verify the decorative fake ptvMessage quote.
 *
 * Usage: .testptvquote [seconds]
 * Sends text with a fake PTV message as the quoted context; no video is sent.
 */
import { buildFakePtvQuote } from '../../lib/waUtils.js';

export default {
  name: 'testptvquote',
  aliases: ['ptvquote'],
  category: 'owner',
  description: 'Test the decorative fake PTV quote. Usage: .testptvquote [seconds]',
  permissions: { owner: true },
  cooldown: 3000,
  execute: async ({ m, sock, args }) => {
    const seconds = Math.max(1, Math.min(60, Number(args[0]) || 8));
    return sock.sendMessage(
      m.from,
      { text: `🧪 Fake PTV quote test\n\nDuration: ${seconds}s\nNo video was attached.` },
      { quoted: buildFakePtvQuote({ seconds }) },
    );
  },
};
