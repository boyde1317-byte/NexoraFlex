/**
 * autoread.js — .autoread [on|off|here on|here off] — owner-only auto-read toggle.
 *
 * `.autoread on|off` changes the global default. `.autoread here on|off`
 * changes only the current chat; `.autoread here reset` removes its override.
 *
 * The settings live in the bot settings (db.getSettings().autoRead and
 * autoReadChats), persisted with db.setSettings. The global setting defaults to true (see
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
  description: 'Toggle auto-read globally or for this chat. Usage: .autoread here on | .autoread here off | .autoread here reset',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m, args, db }) => {
    const scope = (args[0] || '').toLowerCase();
    const isChatScope = scope === 'here' || scope === 'chat' || scope === 'current';
    const word = (isChatScope ? args[1] : args[0] || '').toLowerCase();
    let want;
    if (ENABLE_WORDS.has(word)) want = true;
    else if (DISABLE_WORDS.has(word)) want = false;
    const settings = db.getSettings();
    const overrides = settings.autoReadChats && typeof settings.autoReadChats === 'object'
      ? { ...settings.autoReadChats }
      : {};
    if (isChatScope && ['reset', 'default', 'global'].includes(word)) {
      delete overrides[m.from];
      db.setSettings({ autoReadChats: overrides });
      return m.reply('👁️ *Auto-read reset for this chat* — it now follows the global setting.');
    }
    const current = isChatScope
      ? (Object.prototype.hasOwnProperty.call(overrides, m.from)
        ? overrides[m.from]
        : (settings.autoRead ?? true))
      : (settings.autoRead ?? true);
    const enable = want !== undefined ? want : !current;
    if (isChatScope) {
      overrides[m.from] = enable;
      db.setSettings({ autoReadChats: overrides });
      return m.reply(`👁️ *Auto-read ${enable ? 'ON' : 'OFF'} for this chat* — this chat now overrides the global setting.`);
    }

    db.setSettings({ autoRead: enable });
    if (enable) {
      return m.reply('👁️ *Global auto-read ON* — chats without a specific override will be marked as read.\nUse `.autoread here off` to disable it only here.');
    }
    return m.reply('👁️ *Global auto-read OFF* — chats without a specific override will stay unread.\nUse `.autoread here on` to enable it only here.');
  },
};
