/** Strip the trailing "Receipts" block from the agent's raw output.
 *
 * The persona instructs the agent to close with a ``Receipts`` heading +
 * the source URLs. The ``ReceiptsPanel`` sibling already renders those URLs
 * as polished cards (with the domain bolded, hover ring, etc.) by parsing
 * the same text via :func:`receiptsFrom`. Rendering them ALSO as raw text
 * inside the roast body is a double-render and a visual eyesore — see the
 * 2026-05-26 production screenshot where ``Receipts\nhttps://…`` appeared
 * twice in a row.
 *
 * Heuristic: a ``Receipts`` heading sits on its OWN line (newline before,
 * optional whitespace + newline after). Mid-paragraph ``receipt`` mentions
 * (e.g. "the receipt was forged") are unaffected because they don't match
 * this shape. During streaming the block appears progressively — the regex
 * doesn't match until the heading lands on its own line, so the body
 * transitions cleanly from "with receipts visible" to "without" without a
 * flash. */
export function stripReceiptsTail(text: string): string {
  return text.replace(/\n+\s*Receipts\s*\n[\s\S]*$/i, "");
}

/** Render a roast string with the **sententia** convention.
 *
 * The agent emits its key one-liners as ``**bold**``; we lift those into
 * an `iai-sententia` highlight and render the surrounding text plain.
 * The split logic used to live verbatim in both `RoastView` (single-shot)
 * and `MessageBubble` (chat) — this module is the single source.
 *
 * The optional `caret` prop appends a soft pulsing terminal-style cursor at
 * the end (for the streaming state in the chat). Default off, single-shot
 * doesn't need it. The cursor is a CSS pseudo-block (a styled span with a
 * background) — NOT a Unicode block char like the old ▍, which renders with
 * the OS text font and varies in weight/baseline. */
export function RoastText({ text, caret = false }: { text: string; caret?: boolean }) {
  const body = stripReceiptsTail(text);
  const parts = body.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="iai-roast">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="iai-sententia">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      {caret && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[1em] w-[0.45em] -mb-[0.15em] animate-pulse bg-iai-brand align-baseline"
        />
      )}
    </div>
  );
}
