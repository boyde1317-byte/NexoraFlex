/**
 * retrieve.js — manually restore a deleted message from the current chat.
 *
 * The standalone retrieve store keeps a small per-chat deleted-message
 * history in both groups and private chats. Nothing is reposted automatically;
 * this command pulls the latest entry back on demand, or accepts the deleted
 * message ID when several deletions happened in the same chat.
 */
import { repostDeletedEntry } from '../../lib/antiGuard.js';
import { findRetrievableMessage } from '../../lib/retrieveStore.js';

export default {
  name: 'retrieve',
  aliases: ['getdeleted', 'recoverdeleted'],
  category: 'general',
  description: 'Retrieve the latest deleted message in this chat.',
  cooldown: 3000,
  execute: async ({ m, sock, args }) => {
    const requestedId = args[0]?.trim();
    const entry = findRetrievableMessage(m.from, requestedId);
    if (!entry) {
      return m.reply(
        requestedId
          ? `❌ No message with ID ${requestedId} was recorded in this chat.`
          : '❌ No retrievable message has been recorded in this chat yet.',
      );
    }

    const num = String(entry.sender || '').split('@')[0].split(':')[0];
    const mentions = entry.sender ? [entry.sender] : [];
    const header = `🗑️ *Retrieved deleted message* — @${num}`;
    if (entry.body && (entry.type === 'conversation' || entry.type === 'extendedTextMessage')) {
      return sock.sendMessage(m.from, {
        text: `${header}:

${entry.body.slice(0, 3000)}`,
        mentions,
      });
    }

    try {
      if (await repostDeletedEntry(sock, m.from, entry)) return;
    } catch (err) {
      console.warn('[RETRIEVE] Media restore failed:', err.message || err);
    }

    return sock.sendMessage(m.from, {
      text: `${header}.

The message was recorded as *${entry.type}*, but its media is no longer available for download.`,
      mentions,
    });
  },
};
