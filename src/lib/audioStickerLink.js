/**
 * audioStickerLink.js — the two-hop lookup behind a stitched sound sticker.
 *
 * The flow the bot has to follow is:
 *
 *   1. you send the sound (sound sticker, voice note, audio file or video)
 *   2. you reply to that sound with the image
 *   3. you reply to that image with `.saudio`
 *
 * Step 3 hands the handler the IMAGE, and the sound is two hops away:
 * image → its own `contextInfo.stanzaId` → the sound message. WhatsApp is not
 * obliged to keep `contextInfo` inside a quoted copy (it strips it for
 * view-once, and quoted copies lose fields between clients), so every lookup
 * here tries the live quoted copy first and then the bot's own CRM archive,
 * which holds the message as it first arrived. That archive fallback is the
 * same trick `.vv` uses in src/plugins/media/viewonce.js.
 */
import { downloadMediaMessage } from 'baileys';
import { loadMessage } from './crmStore.js';
import { readAudioSticker, downloadStickerAudio } from './soundSticker.js';

const ENVELOPES = new Set([
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
  'groupStatusMessageV2',
  'spoilerMessage',
]);

/** Protocol keys that ride alongside real content and are never the message. */
const PROTOCOL_KEYS = new Set([
  'messageContextInfo',
  'senderKeyDistributionMessage',
  'deviceSentMessage',
]);

const MEDIA_KEYS = [
  'audioStickerMessage',
  'stickerMessage',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'pttMessage',
  'documentMessage',
];

/** Peel ephemeral/view-once wrappers down to the real content object. */
export function unwrapMessageContent(content) {
  let node = content;
  for (let depth = 0; node && typeof node === 'object' && depth < 6; depth++) {
    const key = Object.keys(node).find((k) => ENVELOPES.has(k));
    if (!key) return node;
    node = node[key]?.message ?? null;
  }
  return null;
}

/** { type, node } for a message content, envelopes peeled. */
export function describeContent(content) {
  const node = unwrapMessageContent(content);
  if (!node || typeof node !== 'object') return { type: '', node: null };
  const keys = Object.keys(node).filter((k) => !PROTOCOL_KEYS.has(k));
  const type = keys.find((k) => MEDIA_KEYS.includes(k))
    || keys.find((k) => k.endsWith('Message'))
    || keys[0]
    || '';
  return { type, node: type ? node[type] ?? null : null };
}

/**
 * stanzaId of the message this content is itself replying to. For a sound
 * sticker the contextInfo lives on the inner sticker node, not the wrapper.
 */
export function quotedStanzaIdOf(content) {
  const { node } = describeContent(content);
  if (!node || typeof node !== 'object') return null;
  const ctx = node.contextInfo
    || node?.message?.stickerMessage?.contextInfo
    || null;
  return ctx?.stanzaId || null;
}

/** The archived original of `id` (as first received), content only. */
export function archivedContent(m, id) {
  if (!id) return null;
  const chat = m?.from;
  const stored = (chat ? loadMessage(id, chat) : null) || loadMessage(id);
  return stored?.message || null;
}

/**
 * Resolve the sound behind a quoted image.
 * Returns { ok, stanzaId, type, node, content } or { ok: false, reason }.
 */
export async function resolveLinkedAudio(m) {
  const quoted = m?.quoted;
  if (!quoted?.key?.id) {
    return {
      ok: false,
      reason: 'Reply to an image that was itself a reply to the sound.',
    };
  }

  const live = quoted.message ? unwrapMessageContent(quoted.message) : null;
  const archived = unwrapMessageContent(archivedContent(m, quoted.key.id));

  let stanzaId = null;
  for (const candidate of [live, archived]) {
    if (!candidate) continue;
    stanzaId = quotedStanzaIdOf(candidate);
    if (stanzaId) break;
  }

  if (!stanzaId) {
    return {
      ok: false,
      reason: 'That image is not a reply to a sound. Reply to the sound with the image first, then reply to the image with .saudio',
    };
  }

  const content = archivedContent(m, stanzaId);
  if (!content) {
    return {
      ok: false,
      reason: 'I cannot find the sound that image replies to any more. Send the sound again and reply to it with the image.',
    };
  }

  const { type, node } = describeContent(content);
  return { ok: true, stanzaId, type, node, content };
}

/**
 * Download the sound from a resolved link: a sound sticker's own audio track,
 * a plain sticker carrying one, or an audio / voice-note / video message.
 * Returns { ok, buffer } or { ok: false, reason }.
 */
export async function downloadLinkedAudio(link, m) {
  if (!link?.ok) return { ok: false, reason: link?.reason || 'No sound found.' };

  const key = { id: link.stanzaId, remoteJid: m?.from };
  const sticker = readAudioSticker(link.content);

  try {
    if (sticker?.audio) {
      const buf = await downloadStickerAudio(sticker.audio, key);
      if (buf) return { ok: true, buffer: buf };
      return { ok: false, reason: 'That sound sticker has expired — its audio is no longer downloadable.' };
    }

    if (link.type === 'audioMessage' || link.type === 'pttMessage' || link.type === 'videoMessage') {
      const buf = await downloadMediaMessage(
        { message: link.content, key: { id: link.stanzaId, remoteJid: m?.from } },
        'buffer',
        {}
      );
      if (buf?.length) return { ok: true, buffer: buf };
      return { ok: false, reason: 'That sound has expired — it is no longer downloadable.' };
    }
  } catch (err) {
    return { ok: false, reason: `Could not download that sound: ${err.message}` };
  }

  if (sticker && !sticker.audio) {
    return { ok: false, reason: 'That sticker has no sound. Reply to the audio you want, not a plain sticker.' };
  }
  return { ok: false, reason: 'The message that image replies to has no sound in it.' };
}
