/** Text helpers used by both the single-shot roast view and the chat.
 *
 * Kept here (no React, no fetch) so the hook layer and the wire-type layer
 * can both import without dragging UI deps. The function used to live in
 * `useRoast.ts` AND `chat/types.ts` (identical body, the comment in the
 * latter literally said "Lifted from useRoast") — that's the duplication
 * this module retires. */

/** URLs under the last "Receipts" heading (fallback: every URL in the text),
 * de-duped. The agent's persona instructs it to close on a 🧾 Receipts list,
 * so we narrow the URL scan to the tail after the last "receipts" mention to
 * avoid picking up inline citations as receipts. */
export function receiptsFrom(text: string): string[] {
  const marks = [...text.matchAll(/receipts?/gi)];
  const last = marks.at(-1);
  const tail = last?.index != null ? text.slice(last.index) : text;
  const urls = tail.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls)];
}
