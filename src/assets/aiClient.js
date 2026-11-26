import dotenv from 'dotenv';

dotenv.config();

/**
 * Single shared AI client factory. Every AI-related feature in this bot
 * (image generation, chat, code generation, etc.) MUST go through this
 * module — never instantiate a separate client or call another AI provider
 * directly. This keeps API-key sourcing in exactly one place.
 *
 * All text and vision requests use Groq's OpenAI-compatible API. The
 * Gemini-shaped call surface is kept internally so existing consumers do not
 * need to change, but no Gemini or secondary-provider key is consulted.
 */

let aiClient = null;
let workingProvider = null; // memoized after the first successful call

const PROVIDERS = [
  {
    name: 'groq',
    kind: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    resolveKey: () => process.env.GROQ_API_KEY || '',
    textModel: () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    visionModel: () => process.env.GROQ_VISION_MODEL || 'openai/gpt-oss-120b',
  },
];

export function hasApiKey() {
  return !!PROVIDERS[0].resolveKey();
}

export function getActiveProviderName() {
  if (workingProvider) return workingProvider.name;
  return hasApiKey() ? PROVIDERS[0].name : null;
}

/* ---------- Gemini-shape normalization (shared helpers) ---------- */

// Accepts every shape callers use: plain string, {parts:[...]},
// [{role, parts:[...]}] multi-turn, or a bare array of raw parts.
function normalizeContents(contents) {
  const turns = [];
  const pushTurn = (role, parts) => turns.push({ role, parts: parts.filter((p) => p?.text || p?.inlineData) });

  if (typeof contents === 'string') {
    pushTurn('user', [{ text: contents }]);
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === 'string') pushTurn('user', [{ text: item }]);
      else if (Array.isArray(item?.parts)) pushTurn(item.role === 'model' ? 'model' : item.role || 'user', item.parts);
      else if (item?.text || item?.inlineData) pushTurn('user', [item]);
    }
  } else if (contents?.parts) {
    pushTurn(contents.role === 'model' ? 'model' : contents.role || 'user', contents.parts);
  } else if (contents?.text || contents?.inlineData) {
    pushTurn('user', [contents]);
  }
  return turns;
}

function systemInstructionToText(systemInstruction) {
  if (!systemInstruction) return '';
  if (typeof systemInstruction === 'string') return systemInstruction;
  return (systemInstruction.parts || []).map((p) => p.text).filter(Boolean).join('\n');
}

// Gemini contents -> OpenAI messages. Returns { messages, hasImage }.
function toOpenAiMessages(contents, systemInstruction) {
  const messages = [];
  const sys = systemInstructionToText(systemInstruction);
  if (sys) messages.push({ role: 'system', content: sys });

  let hasImage = false;
  for (const turn of normalizeContents(contents)) {
    const parts = [];
    for (const p of turn.parts) {
      if (p.text) parts.push({ type: 'text', text: p.text });
      else if (p.inlineData?.data) {
        hasImage = true;
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${p.inlineData.mimeType || 'image/jpeg'};base64,${p.inlineData.data}` },
        });
      }
    }
    messages.push({
      role: turn.role === 'model' ? 'assistant' : turn.role,
      content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts,
    });
  }
  return { messages, hasImage };
}

// OpenAI chat completion -> Gemini response shape
// ({ candidates: [{ content: { parts: [{ text }] } }] }) so every
// consumer's extractText() keeps working.
function toGeminiShape(openaiResponse) {
  const choice = openaiResponse?.choices?.[0]?.message;
  const text = typeof choice?.content === 'string' ? choice.content
    : Array.isArray(choice?.content) ? choice.content.map((c) => c?.text).filter(Boolean).join('\n')
    : '';
  return {
    text,
    candidates: [{ content: { parts: text ? [{ text }] : [] }, role: 'model' }],
  };
}

/* ---------- per-provider clients ---------- */

const providerClients = new Map();

function buildOpenAiCompatClient(provider) {
  return {
    models: {
      async generateContent({ model, contents, config }) {
        const { messages, hasImage } = toOpenAiMessages(contents, config?.systemInstruction);
        // Legacy Gemini model names map to Groq's configured text/vision model.
        const mappedModel = (model || '').startsWith('gemini')
          ? (hasImage ? provider.visionModel() : provider.textModel())
          : (model || provider.textModel());

        const body = { model: mappedModel, messages };
        if (config?.maxOutputTokens) body.max_tokens = config.maxOutputTokens;
        if (typeof config?.temperature === 'number') body.temperature = config.temperature;

        const res = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.resolveKey()}`,
          },
          body: JSON.stringify(body),
          // Hard timeout: a hung provider otherwise pends this promise
          // forever and locks the whole message handler chain.
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`${provider.name} API error ${res.status}: ${String(detail).slice(0, 300)}`);
        }
        return toGeminiShape(await res.json());
      },
    },
  };
}

function clientFor(provider) {
  if (!providerClients.has(provider.name)) {
    providerClients.set(provider.name, buildOpenAiCompatClient(provider));
  }
  return providerClients.get(provider.name);
}

const IMAGE_ONLY_MSG = 'Image generation is not available through Groq. Configure the separate image provider for image-generation commands.';

export function getAiClient() {
  if (aiClient) return aiClient;

  aiClient = {
    models: {
      async generateContent(args) {
        const isImageGen = !!args?.config?.imageConfig || (args?.model || '').includes('image');

        if (isImageGen) throw new Error(IMAGE_ONLY_MSG);

        const provider = PROVIDERS[0];
        if (!provider.resolveKey()) throw new Error('No AI provider configured. Set GROQ_API_KEY in .env.');
        try {
          const res = await clientFor(provider).models.generateContent(args);
          if (workingProvider !== provider) {
            workingProvider = provider;
            console.log(`[AI CLIENT] Provider active: ${provider.name}`);
          }
          return res;
        } catch (e) {
          workingProvider = null;
          throw e;
        }
      },
    },
  };

  return aiClient;
}

export default { getAiClient, hasApiKey, getActiveProviderName };
