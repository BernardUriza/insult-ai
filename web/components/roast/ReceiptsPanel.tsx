import { getUIIcon } from "../../lib/icons";
import { Card, CardTitle } from "../ui/Card";

const ReceiptIcon = getUIIcon("receipts");

/** The Receipts panel — the sources the agent actually fetched. The product's
 * differentiator: every jab is cited. */
export function ReceiptsPanel({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <Card soft>
      <CardTitle className="mb-3 inline-flex items-center gap-2">
        <ReceiptIcon className="h-4 w-4 text-zinc-300" aria-hidden />
        Receipts ({urls.length})
      </CardTitle>
      <ul className="flex flex-col gap-2 text-sm">
        {urls.map((u) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noopener noreferrer" className="iai-link">
              {u}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
