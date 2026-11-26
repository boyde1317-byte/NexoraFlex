/**
 * github.js — GitHub repository info lookup.
 *
 * Upgraded from copyResultCard → richTableCard + mixedCard for structured
 * repo stats display with quick follow-up actions.
 */
import { Providers } from '../../lib/webClient.js';

export default {
  name: 'github',
  aliases: ['repo'],
  category: 'web',
  description: 'Get information about a GitHub repository.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p    = prefix || '.';
    const repo = args[0];
    if (!repo || !repo.includes('/')) {
      return await m.reply.info(
        `Usage: \`${p}github <owner/repo>\`\nExample: \`${p}github facebook/react\``,
        'GITHUB REPO'
      );
    }

    try {
      const data = await Providers.github(repo);

      // Plain-text layout is reliable across WhatsApp clients and keeps the
      // clean, divider-free presentation without exposing native table JSON.
      const text = `🐙 *GITHUB: ${data.full_name}*\n\n` +
        `${data.description || 'No description provided.'}\n\n` +
        `📝 Language: ${data.language || 'N/A'}\n` +
        `⚖️ License: ${data.license?.name || 'N/A'}\n` +
        `⭐ Stars: ${data.stargazers_count.toLocaleString()}\n` +
        `🍴 Forks: ${data.forks_count.toLocaleString()}\n` +
        `👁️ Watchers: ${data.subscribers_count.toLocaleString()}\n` +
        `📝 Open issues: ${data.open_issues_count.toLocaleString()}\n` +
        `🌿 Default branch: ${data.default_branch || 'main'}\n` +
        `📅 Created: ${new Date(data.created_at).toLocaleDateString('en-GB')}\n` +
        `🔄 Updated: ${new Date(data.updated_at).toLocaleDateString('en-GB')}\n` +
        `🔗 URL: ${data.html_url}`;
      await m.reply(text);
    } catch (err) {
      await m.reply.error(`Repository not found or error: ${err.message}`);
    }
  }
};
