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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
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
