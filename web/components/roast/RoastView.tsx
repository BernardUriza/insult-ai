import { Card } from "../ui/Card";

/** Renders the roast: preserves line breaks (iai-roast) and lifts **sententia**
 * into a highlighted span. No raw Tailwind — styling lives in iai-* classes. */
export function RoastView({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Card>
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
      </div>
    </Card>
  );
}
