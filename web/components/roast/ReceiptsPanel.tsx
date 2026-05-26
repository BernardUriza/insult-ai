import { getUIIcon } from "../../lib/icons";
import { Card, CardTitle } from "../ui/Card";

const ReceiptIcon = getUIIcon("receipts");
const ExternalIcon = getUIIcon("external");

/** Split a URL into ``{host, rest}`` so the host can be bolded and the path
 * dimmed — receipts are MORE legible when the eye lands on the source domain
 * first. Falls back gracefully on a non-URL string (e.g. an internal corpus
 * id from the rag_store flow). */
function splitReceipt(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const rest = `${u.pathname}${u.search}${u.hash}`;
    return { host, rest: rest === "/" ? "" : rest };
  } catch {
    return { host: url, rest: "" };
  }
}

/** The Receipts panel — the sources the agent actually fetched.
 *
 * This is THE product differentiator: every jab traces to a real fetched
 * URL. So the panel earns its weight visually. Each receipt renders as a
 * row card with the source DOMAIN bolded (the part the eye should scan for),
 * the path/query dimmed in mono, and an external-link icon revealing on
 * hover. Hover ring uses the Bright Data brand blue — a quiet reinforcement
 * that the live fetch happened through their MCP. */
export function ReceiptsPanel({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <Card soft>
      <CardTitle className="mb-3 inline-flex items-center gap-2">
        <ReceiptIcon className="h-4 w-4 text-iai-accent" aria-hidden />
        Receipts
        <span className="iai-hint ml-1 text-xs tabular-nums">({urls.length})</span>
      </CardTitle>
      <ul className="flex flex-col gap-1.5 text-sm">
        {urls.map((u) => {
          const { host, rest } = splitReceipt(u);
          return (
            <li key={u}>
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-transparent
                           bg-iai-surface/30 px-3 py-2 transition
                           hover:border-iai-brand/40 hover:bg-iai-surface/60
                           hover:shadow-[0_0_0_1px_rgba(61,127,252,0.15)]"
              >
                <span className="truncate">
                  <span className="font-semibold text-zinc-100">{host}</span>
                  {rest && (
                    <span className="ml-0.5 font-mono text-xs text-zinc-500">{rest}</span>
                  )}
                </span>
                <ExternalIcon
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-iai-link opacity-0 transition
                             group-hover:opacity-100"
                  aria-hidden
                />
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
