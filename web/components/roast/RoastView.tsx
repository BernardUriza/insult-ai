import { Card } from "../ui/Card";
import { RoastText } from "./RoastText";

/** Single-shot roast card: wraps the shared <RoastText> in a Card. The split
 * + sententia render lives in RoastText so the chat can reuse it. */
export function RoastView({ text }: { text: string }) {
  return (
    <Card>
      <RoastText text={text} />
    </Card>
  );
}
