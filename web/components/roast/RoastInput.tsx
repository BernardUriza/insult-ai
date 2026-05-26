"use client";

import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";

const EXAMPLES = [
  "https://example.com",
  "The Great Wall of China is visible from space with the naked eye",
  "Goldfish have a three-second memory",
];

export interface RoastInputProps {
  target: string;
  loading: boolean;
  onChange: (value: string) => void;
  onRun: (value?: string) => void;
}

export function RoastInput({ target, loading, onChange, onRun }: RoastInputProps) {
  return (
    <section className="flex flex-col gap-3">
      <Textarea
        name="target"
        aria-label="Roast target — a URL or a claim"
        value={target}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onRun();
        }}
        rows={3}
        placeholder="https://some-startup.com  ·  or a claim to fact-check…"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onRun()} disabled={!target.trim()} loading={loading}>
          {loading ? "Roasting…" : "Roast it 🔥"}
        </Button>
        {loading && <span className="iai-hint">scraping live + reasoning, ~1 min…</span>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <span>try:</span>
        {EXAMPLES.map((ex) => (
          <Button key={ex} variant="chip" onClick={() => onRun(ex)} disabled={loading}>
            {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
          </Button>
        ))}
      </div>
    </section>
  );
}
