/**
 * addai.js — .addai — add the AI bot to this group.
 *
 * Ported from the LUNA MD plugins/addai.js, as-is.
 *
 * Meta AI and similar assistant accounts can use special JID suffixes such
 * as `@jid` or `@bot`, rather than the normal `@s.whatsapp.net` suffix.
 * Keep the exact JID copied from WhatsApp; this command deliberately does
 * not normalize or rewrite it.
 *
 * Differences from the LUNA original:
 *   - ESM + NexoraFlex plugin contract; `conn` -> `sock`,
 *     `m.chat` -> `m.from`.
 *   - Branding: NEXORA MD. No owner numbers, keys, or channel links.
 */
const AI_BOT_JID = String(process.env.AI_BOT_JID || '').trim();

function isValidBotJid(value) {
  return /^\d+@[a-z0-9._-]+$/i.test(value);
}

export default {
  name: 'addai',
  aliases: [],
  category: 'general',
  description: 'Add the AI bot to this group. Usage: .addai (group only)',
  cooldown: 5000,
  execute: async ({ m, sock }) => {
    try {
      const groupJid = m.from;

      if (!groupJid.endsWith('@g.us')) {
        return await m.reply('This command only works in a group.');
      }

      if (!isValidBotJid(AI_BOT_JID)) {
        return await m.reply(
          '⚠️ The AI bot JID is not configured yet.\n' +
          'Set AI_BOT_JID in .env to the exact Meta AI JID, for example: 867051314767696@jid',
        );
      }

      await sock.groupParticipantsUpdate(groupJid, [AI_BOT_JID], 'add');

      await m.reply('AI has been added 🫤');
    } catch (e) {
      console.error('[addai]', e);
      await m.reply(String(e?.stack || e));
    }
  },
};
