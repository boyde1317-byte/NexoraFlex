/**
 * aiapis.js — persona helpers backed by the shared Groq AI client.
 *
 * These helpers preserve the command-facing return shapes while routing text
 * generation through GROQ_API_KEY instead of keyless third-party services.
 */
import { getAiClient } from '../assets/aiClient.js';

const GROQ_MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function generate(messages, systemInstruction) {
  const ai = getAiClient();
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' || message.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));
  const response = await ai.models.generateContent({
    model: GROQ_MODEL(),
    contents,
    config: { systemInstruction },
  });
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new Error('Groq returned no answer');
  return text;
}

/** Islamic AI chat — returns { reply, sources[] } for the existing command. */
export async function muslimAi(query) {
  const reply = await generate(
    [{ role: 'user', content: query }],
    'You are a careful Islamic studies assistant. Answer respectfully and accurately. ' +
    'When citing Quran or Hadith, name the surah, collection, or reference when you know it. ' +
    'Do not invent citations. Keep the answer concise and useful.',
  );
  return { reply, sources: [] };
}

/** Feel-better chat — preserves the existing messages-based interface. */
export async function feelBetter(messages) {
  return generate(
    messages,
    'You are a compassionate, empathetic support listener. Respond warmly and practically, ' +
    'without pretending to be a doctor or therapist. If the user may be in immediate danger, ' +
    'encourage contacting local emergency services or a trusted person. Keep replies human and concise.',
  );
}
