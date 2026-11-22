import fs from 'node:fs';
import { richCodeCard } from '../../lib/interactiveKit.js';
import { allCaptures, getCapture } from '../../lib/richSniffer.js';
import {
  buildJavascriptSource,
  extractCodeSnippet,
  shortNameFor,
  snippetDirectory,
  snippetFileName,
} from '../../lib/sniffSnippet.js';

export default {
  name: 'savesniffs',
  aliases: ['savesniff'],
  category: 'owner',
  description: 'Paste and save every captured Meta AI response as JavaScript files.',
  permissions: { owner: true },
  cooldown: 5000,

  execute: async ({ m, sock }) => {
    const summaries = allCaptures(1000);
    if (!summaries.length) return m.reply('No captured Meta AI responses yet.');

    const directory = snippetDirectory();
    fs.mkdirSync(directory, { recursive: true });
    let sent = 0;
    let failed = 0;

    for (const summary of summaries) {
      const row = getCapture(summary.id);
      if (!row) {
        failed += 1;
        continue;
      }
      const name = shortNameFor(summary.rowid);
      const snippet = extractCodeSnippet(row.decoded, row.raw);
      const source = buildJavascriptSource({ name, row, snippet });
      const fileName = snippetFileName(name);
      const filePath = `${directory}/${fileName}`;
      fs.writeFileSync(filePath, source, 'utf8');

      try {
        await richCodeCard(sock, m.from, {
          code: snippet?.code || source,
          language: snippet?.language || 'javascript',
          caption: `NEXORA META AI CAPTURE • ${name}`,
          footer: `Saved as ${fileName} • ${filePath}`,
          copyable: (snippet?.code || source).length <= 4096,
        }, { quoted: m });
      } catch (err) {
        console.warn('[savesniffs] rich code card failed:', err.message || err);
        await m.reply(`NEXORA META AI CAPTURE • ${name}\n\n${(snippet?.code || source).slice(0, 6000)}`);
      }

      await sock.sendMessage(m.from, {
        document: Buffer.from(source, 'utf8'),
        fileName,
        mimetype: 'application/javascript',
        caption: `Meta AI capture ${name}\nSaved file: ${filePath}`,
      }, { quoted: m });
      sent += 1;
    }

    return m.reply(`Saved and pasted ${sent} Meta AI capture${sent === 1 ? '' : 's'} as .js file${sent === 1 ? '' : 's'}.${failed ? ` ${failed} capture${failed === 1 ? '' : 's'} could not be loaded.` : ''}`);
  },
};
