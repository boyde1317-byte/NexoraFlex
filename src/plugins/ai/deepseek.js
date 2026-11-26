/**
 * deepseek.js — .deepseek — Groq-backed technical chat.
 *
 * The command name is retained for compatibility, but all requests now use
 * the shared GROQ_API_KEY configuration and GROQ_MODEL.
 */
import { getAiClient, hasApiKey } from '../../assets/aiClient.js';

const GROQ_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const sessions = new Map();

function extractText(response) {
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Groq returned no answer');
  return text;
}

export default {
  name: 'deepseek',
  aliases: ['deepsek', 'depseek', 'dipsek'],
  category: 'ai',
  description: 'Technical AI chat through Groq. Usage: .deepseek <question>, or reply to a message.',
  cooldown: 5000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const input = m.quoted?.text || args.join(' ').trim();
    if (!input) return await m.reply(`Enter a question or command!\n\nExample:\n${p}deepseek what is AI`);
    if (!hasApiKey()) return await m.reply.error('Groq is not configured. Set GROQ_API_KEY in .env.');

    const history = sessions.get(m.sender) || [];
    history.push({ role: 'user', parts: [{ text: input }] });
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: GROQ_MODEL(),
        contents: history,
        config: {
          systemInstruction: 'You are Nexora, a precise technical assistant. Give direct, practical answers and clear code when useful.',
        },
      });
      const reply = extractText(response);
      history.push({ role: 'model', parts: [{ text: reply }] });
      if (history.length > 12) history.splice(0, history.length - 12);
      sessions.set(m.sender, history);
      await m.reply(reply);
    } catch (err) {
      console.error('[deepseek]', err.message);
      await m.reply.error(`Groq request failed: ${err.message}`);
    }
  },
};
