/**
 * aiQuote.js — fixed quote strip for rich replies.
 *
 * The strip is the galaxy menu's card (thumbnail + title drawn from a
 * review_and_pay button) rather than the old vcard contact card. The
 * thumbnail is the compressed menu preview, loaded once and cached,
 * because aiQuoted() is called synchronously on every reply. Until the
 * first load resolves the card still renders, just without the preview
 * image.
 *
 * The card carries the bot's own brand (NEXORA MD) and the house
 * US$1.00 pass price — the same price as the greeting card — so a reply
 * never shows the menu's US$720,000.00 placeholder.
 *
 * Usage: the serializer's replyFn passes the reply kind, and interactiveKit
 * passes 'card'. Plugins can override with their own `quoted` in the reply
 * options when a real quote is needed.
 */

import { buildFakeGalaxyQuote } from './waUtils.js';

let quoteThumbnail = null;
let thumbnailPrimed = false;

function ensureThumbnail() {
  if (thumbnailPrimed) return;
  thumbnailPrimed = true;
  import('../images/imageManager.js')
    .then(({ imageManager }) => imageManager.getMenuThumbnail(19))
    .then((buf) => { quoteThumbnail = buf || null; })
    .catch(() => { quoteThumbnail = null; });
}

export function aiQuoted(m, kind = 'default') {
  ensureThumbnail();
  return buildFakeGalaxyQuote({
    title: 'NEXORA MD',
    thumbnail: quoteThumbnail || undefined,
    referenceId: 'NEXORA MD',
    amount: 100,
  });
}
