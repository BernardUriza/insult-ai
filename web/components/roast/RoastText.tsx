/** Render a roast string with the **sententia** convention.
 *
 * The agent emits its key one-liners as ``**bold**``; we lift those into
 * an `iai-sententia` highlight and render the surrounding text plain.
 * The split logic used to live verbatim in both `RoastView` (single-shot)
 * and `MessageBubble` (chat) — this module is the single source.
 *
 * The optional `caret` prop appends a soft pulsing ▍ at the end (for the
 * streaming state in the chat). Default off, single-shot doesn't need it. */
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
      {caret && <span className="ml-0.5 animate-pulse">▍</span>}
    </div>
  );
}
