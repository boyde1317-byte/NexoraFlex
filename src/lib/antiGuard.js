/**
 * antiGuard.js — shared enforcement for the anti-feature suite.
 *
 * One authority for the 3-strike pattern used by antilink/antitag
 * (mirrors their inline logic in handlers/message.js) so the newer
 * guards (antisticker, antispam, antiword, antidelete, antiviewonce,
 * antiforeign) don't copy-paste it six more times.
 *
 * Strikes are shared per-group: the warnings map lives on the group
 * record (db.getGroup(jid).warnings), so a user who trips antilink
 * then antisticker is on 2/3, not 1/3 twice. At 3 the sender is
 * removed and the counter reset — with a graceful notice when the
 * bot lacks admin rights.
 *
 * Also hosts the anti-delete snitch cache (bounded, in-memory) and
 * the anti-spam flood tracker (sliding window).
 */
import { db } from '../database/db.js';
import { mixedCard } from './interactiveKit.js';
import { downloadMediaMessage, getContentType } from 'baileys';

const MAX_STRIKES = 3;

// ── 3-strike enforcement ──────────────────────────────────────────────────
export async function strikeAndKick(sock, { jid, sender, key, reason, extra }) {
  const num = String(sender).split('@')[0].split(':')[0];
  try {
    await sock.sendMessage(jid, { delete: key });
  } catch (_) { /* message already gone or bot lacks rights */ }

  const groupData = db.getGroup(jid);
  const warns = { ...(groupData.warnings || {}) };
  const count = (warns[sender] ?? 0) + 1;
  warns[sender] = count;
  db.setGroup(jid, { warnings: warns });

  // Rich strike card: offender, count, and admin quick-replies
  // (.warns view / forgive, .kick). Plain-text fallback keeps the
  // old message shape if the card relay fails.
  // Rich cards can't carry mentions — +num renders plainly there;
  // the text fallback keeps the real @mention ping.
  const strikeText =
    `🚫 +${num} ${reason}\n` +
    `⚠️ *Strike ${count}/${MAX_STRIKES}*` +
    (count >= MAX_STRIKES ? ' — removed from the group.' : '') +
    (extra ? `\n\n${extra}` : '');
  try {
    await mixedCard(sock, jid, { text: strikeText, footer: 'Protection Suite — 3 strikes = removal' }, [
      { kind: 'action', label: '📜 Strikes', cmd: `.warns @${num}` },
      { kind: 'action', label: '🕊️ Forgive', cmd: `.warns reset @${num}` },
      { kind: 'action', label: '👟 Kick now', cmd: `.kick @${num}` },
    ]);
  } catch (_) {
    await sock.sendMessage(jid, {
      text: `🚫 @${num} ${reason}\n` +
        `⚠️ *Strike ${count}/${MAX_STRIKES}*` +
        (count >= MAX_STRIKES ? ' — removed from the group.' : '') +
        (extra ? `\n\n${extra}` : ''),
      mentions: [sender],
    }).catch(() => {});
  }

  if (count >= MAX_STRIKES) {
    try {
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
      warns[sender] = 0;
      db.setGroup(jid, { warnings: warns });
    } catch (_) {
      await sock.sendMessage(jid, {
        text: `⚠️ Cannot remove @${num} — bot is not a group admin. Warnings retained.`,
        mentions: [sender],
      }).catch(() => {});
    }
  }
  return count;
}

export async function isExempt(m) {
  // Owners and admins are never struck; neither is the bot itself.
  if (m.fromMe || await m.isOwner) return true;
  try {
    return await m.isAdmin();
  } catch (_) {
    return false;
  }
}

// ── Anti-spam flood tracker ───────────────────────────────────────────────
// Sliding window per (group, sender): SPAM_MAX messages within SPAM_WINDOW ms.
const SPAM_MAX = 5;
const SPAM_WINDOW = 8000;
const floodTracker = new Map(); // `${jid}:${sender}` -> [timestamps]

export function isFlooding(jid, sender, now = Date.now()) {
  const k = `${jid}:${sender}`;
  const stamps = (floodTracker.get(k) || []).filter((t) => now - t < SPAM_WINDOW);
  stamps.push(now);
  floodTracker.set(k, stamps);
  if (floodTracker.size > 500) {
    // Bounded: drop trackers untouched for 10 minutes
    for (const [key, arr] of floodTracker) {
      if (!arr.length || now - arr[arr.length - 1] > 600000) floodTracker.delete(key);
    }
  }
  return stamps.length > SPAM_MAX;
}

export function resetFlood(jid, sender) {
  floodTracker.delete(`${jid}:${sender}`);
}

// ── Anti-delete snitch cache ──────────────────────────────────────────────
// Bounded per-group ring of recent raw messages so a REVOKE can be matched
// back to its content. Text bodies and the complete raw message are cached;
// the latter lets the connection handler attempt media re-download on repost.
const snitchCache = new Map(); // jid -> [{ id, ts, sender, body, type, message }]
const SNITCH_CAP = 100;
const MAX_SNITCH_GROUPS = 100; // total groups tracked — unbounded otherwise

export function snitchRemember(jid, { id, sender, body, type, message }) {
  if (!snitchCache.has(jid) && snitchCache.size >= MAX_SNITCH_GROUPS) {
    // Evict the least-recently-written group (Map preserves insertion order)
    snitchCache.delete(snitchCache.keys().next().value);
  }
  const ring = snitchCache.get(jid) || [];
  ring.push({ id, ts: Date.now(), sender, body, type, message });
  while (ring.length > SNITCH_CAP) ring.shift();
  snitchCache.set(jid, ring);
}

export function snitchRecall(jid, keyId) {
  const ring = snitchCache.get(jid) || [];
  return ring.find((e) => e.id === keyId) || null;
}

function findMediaContent(message) {
  let content = message?.message || {};
  let type = getContentType(content);
  for (let depth = 0; depth < 4 && type; depth += 1) {
    if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(type)) {
      return { type, content: content[type] };
    }
    const wrapped = content[type];
    if (!wrapped?.message || !['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage'].includes(type)) break;
    content = wrapped.message;
    type = getContentType(content);
  }
  return { type, content: type ? content[type] : null };
}

export async function repostDeletedEntry(sock, jid, entry) {
  const num = String(entry.sender).split('@')[0].split(':')[0];
  const mentions = [entry.sender];
  const label = `🗑️ *Anti-delete* — @${num} deleted`;
  const raw = entry.message?.message ? entry.message : null;
  if (!raw) return false;
  const media = findMediaContent(raw);
  if (!['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(media.type)) return false;
  const buffer = await downloadMediaMessage(raw, 'buffer', {});
  if (!buffer?.length) throw new Error('empty media buffer');
  const payload = { mentions };
  if (media.type === 'imageMessage') {
    payload.image = buffer;
    payload.caption = `${label}:\n\n${media.content?.caption || entry.body || 'image'}`;
    payload.mimetype = media.content?.mimetype || 'image/jpeg';
  } else if (media.type === 'videoMessage') {
    payload.video = buffer;
    payload.caption = `${label}:\n\n${media.content?.caption || entry.body || 'video'}`;
    payload.mimetype = media.content?.mimetype || 'video/mp4';
    payload.gifPlayback = !!media.content?.gifPlayback;
  } else if (media.type === 'audioMessage') {
    payload.audio = buffer;
    payload.mimetype = media.content?.mimetype || 'audio/ogg; codecs=opus';
    payload.ptt = !!media.content?.ptt;
  } else if (media.type === 'stickerMessage') {
    payload.sticker = buffer;
  } else {
    payload.document = buffer;
    payload.fileName = media.content?.fileName || 'deleted-file';
    payload.mimetype = media.content?.mimetype || 'application/octet-stream';
    payload.caption = `${label}:\n\n${media.content?.caption || entry.body || 'document'}`;
  }
  await sock.sendMessage(jid, payload);
  if (media.type === 'stickerMessage') await sock.sendMessage(jid, { text: `${label}: sticker`, mentions });
  return true;
}
