"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const EXAMPLES = [
  "https://example.com",
  "The Great Wall of China is visible from space with the naked eye",
  "Goldfish have a three-second memory",
];

/** URLs under the last "Receipts" heading (fallback: every URL). De-duped. */
function receiptsFrom(text: string): string[] {
  const marks = [...text.matchAll(/receipts?/gi)];
  const last = marks.at(-1);
  const tail = last?.index != null ? text.slice(last.index) : text;
  const urls = tail.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls)];
}

/** Minimal **bold** → <strong>, preserving the rest verbatim (pre-wrap). */
function Roast({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed text-zinc-100">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="text-amber-300">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}

export default function Home() {
  const [target, setTarget] = useState("");
  const [roast, setRoast] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(t?: string) {
    const value = (t ?? target).trim();
    if (!value || loading) return;
    setTarget(value);
    setLoading(true);
    setError("");
    setRoast("");
    try {
      const res = await fetch(`${API_URL}/roast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: value }),
      });
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      const data = (await res.json()) as { roast?: string };
      setRoast(data.roast ?? "(empty)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  const receipts = roast ? receiptsFrom(roast) : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10 text-zinc-200">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">
          🔥 Insult <span className="text-[#ff5c5c]">AI</span>
        </h1>
        <p className="mt-1 text-zinc-400">
          Feed it a URL or a claim. It pulls{" "}
          <span className="text-[#7fd1ff]">live web data via Bright Data</span> and roasts the
          target — every jab with a real receipt.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <textarea
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          rows={3}
          placeholder="https://some-startup.com  ·  or a claim to fact-check…"
          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#ff5c5c]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => run()}
            disabled={loading || !target.trim()}
            className="rounded-lg bg-[#ff5c5c] px-5 py-2.5 font-bold text-black transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Roasting…" : "Roast it 🔥"}
          </button>
          {loading && (
            <span className="animate-pulse text-sm text-zinc-500">
              scraping live + reasoning, ~1 min…
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
          <span>try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => run(ex)}
              disabled={loading}
              className="rounded border border-zinc-800 px-2 py-1 text-zinc-400 hover:border-zinc-600 disabled:opacity-40"
            >
              {ex.length > 32 ? ex.slice(0, 32) + "…" : ex}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-300">
          ⚠️ {error}
          <span className="mt-1 block text-xs text-red-400/70">
            Is the API running at {API_URL}? (uvicorn / Container App)
          </span>
        </div>
      )}

      {roast && (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <Roast text={roast} />
        </article>
      )}

      {receipts.length > 0 && (
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-3 font-bold text-amber-400">🧾 Receipts ({receipts.length})</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {receipts.map((u) => (
              <li key={u}>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[#7fd1ff] hover:underline"
                >
                  {u}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <footer className="mt-auto pt-6 text-center text-xs text-zinc-600">
        Insult AI · Web Data UNLOCKED Hackathon · powered by Bright Data + fi-runner
      </footer>
    </main>
  );
}
