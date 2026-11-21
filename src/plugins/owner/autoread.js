/**
 * autoread.js — .autoread [on|off] — owner-only auto-read (blue tick) toggle.
 *
 * When auto-read is ON, the bot marks every incoming message as read
 * (blue ticks). When OFF, it leaves messages unread.
 *
 * The setting lives in the bot settings (db.getSettings().autoRead),
 * persisted with db.setSettings. It defaults to true (see
 * src/database/migrations.js and config.autoRead). The handler
 * (src/handlers/message.js) reads the DB setting with the config as
 * fallback, so the generic `.toggle autoread` command writes the same
 * key and works too.
 */
const ENABLE_WORDS = new Set(['enable', 'on', 'true', '1']);
const DISABLE_WORDS = new Set(['disable', 'off', 'false', '0']);

export default {
  name: 'autoread',
  aliases: ['bluetick'],
  category: 'owner',
  description: 'Toggle auto-read (blue ticks). Usage: .autoread on | .autoread off',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m, args, db }) => {
    const word = (args[0] || '').toLowerCase();
    let want;
    if (ENABLE_WORDS.has(word)) want = true;
    else if (DISABLE_WORDS.has(word)) want = false;
    // No on/off word: flip the current value.
    const current = db.getSettings().autoRead ?? true;
    const enable = want !== undefined ? want : !current;
    db.setSettings({ autoRead: enable });
    if (enable) {
      return m.reply('👁️ *Auto-read ON* — I will mark messages as read (blue ticks).');
    }
    return m.reply('👁️ *Auto-read OFF* — I will leave messages unread (no blue ticks).');
  },
};
