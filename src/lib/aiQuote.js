/**
 * aiQuote.js — fixed sticker-pack quote strip for rich replies.
 *
 * The strip is a decorative sticker-pack message rather than a payment-style
 * galaxy card. aiQuoted() is called synchronously on every normal reply, so
 * the quote is built locally with safe metadata and no media download paths.
 *
 * Usage: the serializer's replyFn passes the reply kind, and interactiveKit
 * passes 'card'. Plugins can override with their own `quoted` in the reply
 * options when a real quote is needed.
 */

import { buildFakeStickerPackQuote } from './waUtils.js';

export function aiQuoted(m, kind = 'default') {
  return buildFakeStickerPackQuote({
    name: 'NEXORA MD',
    publisher: 'NEXORA MD',
    description: 'NEXORA MD response stickers',
  });
}
