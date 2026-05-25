"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** URLs under the last "Receipts" heading (fallback: every URL), de-duped. */
function receiptsFrom(text: string): string[] {
  const marks = [...text.matchAll(/receipts?/gi)];
  const last = marks.at(-1);
  const tail = last?.index != null ? text.slice(last.index) : text;
  const urls = tail.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls)];
}

/** Owns the roast turn: input, the POST /roast call, and derived receipts. */
export function useRoast() {
  const [target, setTarget] = useState("");
  const [roast, setRoast] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(value?: string) {
    const t = (value ?? target).trim();
    if (!t || loading) return;
    setTarget(t);
    setLoading(true);
    setError("");
    setRoast("");
    try {
      const res = await fetch(`${API_URL}/roast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: t }),
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

  return {
    target,
    setTarget,
    roast,
    loading,
    error,
    run,
    apiUrl: API_URL,
    receipts: roast ? receiptsFrom(roast) : [],
  };
}
