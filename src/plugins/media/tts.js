/**
 * tts.js — text-to-speech voice note.
 *
 * TTS is currently on standby because Groq does not provide a voice-synthesis
 * endpoint and the previous implementation depended on a Gemini-branded
 * third-party service.
 *
 *   .tts <text>   → voice note of the text
 */
export default {
  name: 'tts',
  aliases: ['speak', 'say'],
  category: 'media',
  description: '🔊 Text-to-speech is on standby until a Groq-compatible provider is configured.',
  cooldown: 6000,

  execute: async ({ m, sock, args, prefix }) => {
    return await m.reply.info('Text-to-speech is on standby. Groq currently powers the bot’s text and vision AI features, but not voice synthesis.', 'TTS');
  },
};
