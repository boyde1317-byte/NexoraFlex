/**
 * translate2.js — .translate2 — Groq-backed translation.
 *
 * Kept as a compatibility command for the older translate2 name; all text
 * generation uses GROQ_API_KEY and GROQ_MODEL.
 */
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';

const NAMES = {
  ar: 'Arabic', en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', tr: 'Turkish', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean', hi: 'Hindi', id: 'Indonesian', nl: 'Dutch',
  fa: 'Persian', ur: 'Urdu', he: 'Hebrew', pl: 'Polish', sv: 'Swedish',
};
const ALIASES = {
  arabic: 'ar', english: 'en', french: 'fr', spanish: 'es', german: 'de',
  italian: 'it', turkish: 'tr', russian: 'ru', chinese: 'zh', japanese: 'ja',
  korean: 'ko', hindi: 'hi',
};
const GROQ_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

function resolveLang(word = '') {
  const w = word.toLowerCase();
  return NAMES[w] ? w : ALIASES[w] || null;
}

function extractText(response) {
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Groq returned no translation');
  return text;
}

export default {
  name: 'translate2',
  aliases: [],
  category: 'ai',
  description: 'Translate text with Groq. Usage: .translate2 <lang> <text>, or reply to a message.',
  cooldown: 3000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const rawArgs = [...args];
    let code = 'en';
    if (rawArgs.length) {
      const found = resolveLang(rawArgs[0]);
      if (found) {
        code = found;
        rawArgs.shift();
      }
    }
    const quoted = m.quoted?.text || m.quoted?.caption || '';
    const input = (rawArgs.join(' ').trim() || quoted).trim();
    if (!input) {
      return await m.reply(`🌐 *NEXORA MD*\n\n> ${p}translate2 ar hello how are you\n> ${p}translate2 fr (reply to a message)\n\nLanguages: ${Object.keys(NAMES).join(', ')}`);
    }
    if (input.length > 3000) return await m.reply('❌ Text is too long (limit 3000 characters)');
    if (!hasApiKey()) return await m.reply.error('Groq is not configured. Set GROQ_API_KEY in .env.');
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: GROQ_MODEL(),
        contents: { parts: [{ text: input }] },
        config: {
          systemInstruction: `You are a professional translator. Translate the user's text to ${NAMES[code]}. Output ONLY the translation, preserving formatting, emojis, and line breaks.`,
        },
      });
      await m.reply(`🌐 *${NAMES[code]}* (${code})\n\n${extractText(response)}\n\n> NEXORA MD`);
    } catch (err) {
      await m.reply.error(`Translation failed: ${err.message}`);
    }
  },
};
