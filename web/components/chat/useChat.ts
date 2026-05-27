"use client";

import { useCallback, useRef, useState } from "react";
import { API_URL, apiHeaders, apiUrl } from "../../lib/api";
import { receiptsFrom } from "../../lib/text";
import type { ChatMessage, ChatMeta, Plan, PlanRejection, PlanStep, Step } from "./types";

/** Mint a short id without depending on `crypto.randomUUID` (Safari 14 etc.). */
function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Parse one SSE frame ("event: foo\ndata: {...}") into {event, data}. SSE
 * frames are separated by a blank line — the caller splits on `\n\n` first. */
function parseFrame(frame: string): { event: string; data: unknown } | null {
  const lines = frame.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

/** The chat state machine. Owns `messages`, the `sessionId` (one per
 * conversation), the in-flight assistant id, and the POST → SSE consumer.
 *
 * ``opts.corpusId`` (optional) — when set, every turn is sent with
 * ``corpus_id``, telling the agent to ``search_documents`` over that corpus
 * (rag_store MCP) for extra ammo before composing the roast/brief. Wired
 * from the /library page (sticky) and the ``?corpus=`` query param on /chat
 * so a "Use →" click from the library lands in chat with the corpus armed. */
export type ChatMode = "roast" | "brief" | "clinical";
export type ChatTone = "soft" | "medium" | "spicy" | "no_insults";

export function useChat(opts?: {
  corpusId?: string;
  mode?: ChatMode;
  tone?: ChatTone;
}) {
  const corpusId = opts?.corpusId?.trim() || undefined;
  const mode = opts?.mode ?? "roast";
  const tone = opts?.tone ?? "medium";
  // One id per browser session so the API folds prior turns into the prompt.
  // Held in a ref so re-renders don't churn it.
  const sessionRef = useRef<string>(newId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  // Abort controller for the current /chat/stream fetch (user can cancel mid-roast).
  const abortRef = useRef<AbortController | null>(null);

  /** Mutate the in-flight assistant message by id (functional update so
   * concurrent events compose cleanly). */
  const patchAssistant = useCallback(
    (id: string, patch: (m: ChatMessage & { role: "assistant" }) => Partial<ChatMessage & { role: "assistant" }>) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id || m.role !== "assistant") return m;
          return { ...m, ...patch(m) };
        }),
      );
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const userMsg: ChatMessage = { id: newId(), role: "user", content: trimmed };
      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        steps: [],
        plan: null,
        receipts: [],
        usage: null,
        meta: null,
        status: "thinking",
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl("/chat/stream"), {
          method: "POST",
          headers: apiHeaders({
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          }),
          body: JSON.stringify({
            session_id: sessionRef.current,
            message: trimmed,
            mode,
            tone,
            ...(corpusId ? { corpus_id: corpusId } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`API responded ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // SSE loop: drain the byte stream, split on blank lines, parse, dispatch.
        // We keep the trailing partial frame in `buffer` between reads.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const raw of frames) {
            const parsed = parseFrame(raw);
            if (!parsed) continue;
            const { event, data } = parsed as { event: string; data: Record<string, unknown> };

            if (event === "tool_call") {
              const step: Step = {
                id: (data.id as string) ?? null,
                name: (data.name as string) ?? "",
                server: (data.server as string | null) ?? null,
                isError: (data.is_error as boolean | null) ?? null,
              };
              patchAssistant(assistantId, (m) => ({
                steps: [...m.steps, step],
                status: "streaming",
              }));
            } else if (event === "plan") {
              // The agent committed to a route — replace any prior plan (a
              // turn that re-declares is non-canonical; per personas/roast.md
              // "one declare_plan per turn", but we'd rather track the latest
              // than splice). A fresh plan also CLEARS any prior rejection
              // banner — the agent is re-trying, the prior verdict is stale.
              const labels = (data.steps as unknown[]) ?? [];
              const plan: Plan = {
                steps: labels.map((s) => ({
                  label: String(s),
                  status: "pending" as const,
                })),
                rejection: null,
              };
              patchAssistant(assistantId, () => ({ plan, status: "streaming" }));
            } else if (event === "plan_rejected") {
              const rejection: PlanRejection = {
                reason: (data.reason as string) ?? "plan rejected",
                matched: ((data.matched as Array<Record<string, unknown>>) ?? []).map((m) => ({
                  index: Number(m.index ?? 0),
                  label: String(m.label ?? ""),
                })),
                guard: (data.guard as string | null) ?? null,
              };
              patchAssistant(assistantId, (m) => {
                if (!m.plan) return {};
                return { plan: { ...m.plan, rejection } };
              });
            } else if (event === "step_started") {
              const idx = Number(data.step_index);
              patchAssistant(assistantId, (m) => {
                if (!m.plan || !Number.isFinite(idx) || idx < 0 || idx >= m.plan.steps.length) {
                  return {};
                }
                const next = m.plan.steps.slice();
                next[idx] = { ...next[idx], status: "running" };
                return { plan: { steps: next } };
              });
            } else if (event === "step_done") {
              const idx = Number(data.step_index);
              const failed = data.status === "failed";
              patchAssistant(assistantId, (m) => {
                if (!m.plan || !Number.isFinite(idx) || idx < 0 || idx >= m.plan.steps.length) {
                  return {};
                }
                const next = m.plan.steps.slice();
                const prev = next[idx];
                const patch: PlanStep = {
                  ...prev,
                  status: failed ? "failed" : "done",
                };
                // Only attach the non-empty field — keep the object shape tight
                // so a missing summary doesn't render as an empty line in the UI.
                const summary = (data.summary as string | null) ?? "";
                if (!failed && summary) patch.summary = summary;
                const errorMsg = (data.error as string | null) ?? "";
                if (failed && errorMsg) patch.error = errorMsg;
                next[idx] = patch;
                return { plan: { steps: next } };
              });
            } else if (event === "text") {
              const delta = (data.delta as string) ?? "";
              if (!delta) continue;
              patchAssistant(assistantId, (m) => ({
                content: m.content + delta,
                status: "streaming",
              }));
            } else if (event === "result") {
              // Replace, don't append — post-guard text may diverge from the
              // streamed deltas. Backfill is_error on steps from the final list.
              const finalText = (data.text as string) ?? "";
              const finalSteps = ((data.tool_calls as Array<Record<string, unknown>>) ?? []).map((tc) => ({
                id: (tc.id as string) ?? null,
                name: (tc.name as string) ?? "",
                server: (tc.server as string | null) ?? null,
                isError: (tc.is_error as boolean | null) ?? null,
              }));
              patchAssistant(assistantId, () => ({
                content: finalText,
                steps: finalSteps,
                receipts: receiptsFrom(finalText),
                usage: (data.usage as Record<string, unknown> | null) ?? null,
                status: "done",
              }));
            } else if (event === "meta") {
              // Per-turn observability — see ChatMeta in types.ts. The full
              // payload is stored on the message so MessageBubble can render
              // a compact footer ("✓ 2.3s · 4 tools · 1,234 tokens").
              patchAssistant(assistantId, () => ({ meta: data as ChatMeta }));
            } else if (event === "error") {
              const msg = (data.message as string) ?? "stream error";
              patchAssistant(assistantId, () => ({ status: "error", errorMessage: msg }));
            }
            // `open` and `done` are wire-only — UI doesn't need them.
          }
        }
      } catch (e) {
        // AbortError on user cancel is not a real error.
        const aborted = e instanceof DOMException && e.name === "AbortError";
        if (!aborted) {
          const msg = e instanceof Error ? e.message : "request failed";
          patchAssistant(assistantId, () => ({ status: "error", errorMessage: msg }));
        } else {
          patchAssistant(assistantId, () => ({ status: "done" }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, patchAssistant, corpusId, mode, tone],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Wipe the conversation locally AND on the backend (new session id). The
   * server's store keeps the old session under its old id, but we never refer
   * to it again — InMemoryConversationStore is per-process, fine to leak. */
  const reset = useCallback(() => {
    sessionRef.current = newId();
    setMessages([]);
  }, []);

  return {
    messages,
    streaming,
    send,
    abort,
    reset,
    sessionId: sessionRef.current,
    apiUrl: API_URL,
  };
}
