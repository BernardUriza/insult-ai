"use client";

import { useCallback, useRef, useState } from "react";
import {
  API_URL,
  CHAT_STREAM_TIMEOUT_MS,
  MAX_CHAT_MESSAGE_CHARS,
  apiErrorMessage,
  apiHeaders,
  apiUrl,
} from "../../lib/api";
import { newId } from "../../lib/id";
import { parseSseFrame } from "../../lib/sse";
import { receiptsFrom } from "../../lib/text";
import { dedupeDoubledText } from "../roast/RoastText";
import type { ChatMessage, ChatMeta, ChatMode, ChatTone, Plan, PlanRejection, PlanStep, Step } from "./types";

function closeOpenPlanSteps(plan: Plan | null, error?: string): Plan | null {
  if (!plan) return null;
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      if (step.status !== "pending" && step.status !== "running") return step;
      return error ? { ...step, status: "failed", error } : { ...step, status: "done" };
    }),
  };
}

/** Pure reducer: given the current assistant message and one parsed SSE event,
 * return the patch to apply. Returns {} for unrecognised events. */
function applyStreamEvent(
  m: ChatMessage & { role: "assistant" },
  event: string,
  data: Record<string, unknown>,
): Partial<ChatMessage & { role: "assistant" }> {
  if (event === "tool_call") {
    const step: Step = {
      id: (data.id as string) ?? null,
      name: (data.name as string) ?? "",
      server: (data.server as string | null) ?? null,
      isError: (data.is_error as boolean | null) ?? null,
    };
    return { steps: [...m.steps, step], status: "streaming" };
  }

  if (event === "plan") {
    // A fresh plan clears any prior rejection — the agent is re-trying.
    const labels = (data.steps as unknown[]) ?? [];
    const plan: Plan = {
      steps: labels.map((s) => ({ label: String(s), status: "pending" as const })),
      rejection: null,
    };
    return { plan, status: "streaming" };
  }

  if (event === "plan_rejected") {
    if (!m.plan) return {};
    const rejection: PlanRejection = {
      reason: (data.reason as string) ?? "plan rejected",
      matched: ((data.matched as Array<Record<string, unknown>>) ?? []).map((r) => ({
        index: Number(r.index ?? 0),
        label: String(r.label ?? ""),
      })),
      guard: (data.guard as string | null) ?? null,
    };
    return { plan: { ...m.plan, rejection } };
  }

  if (event === "step_started") {
    const idx = Number(data.step_index);
    if (!m.plan || !Number.isFinite(idx) || idx < 0 || idx >= m.plan.steps.length) return {};
    const next = m.plan.steps.map((step, i) => {
      if (i < idx && (step.status === "pending" || step.status === "running")) {
        return { ...step, status: "done" as const };
      }
      return step;
    });
    next[idx] = { ...next[idx], status: "running" };
    return { plan: { ...m.plan, steps: next } };
  }

  if (event === "step_done") {
    const idx = Number(data.step_index);
    if (!m.plan || !Number.isFinite(idx) || idx < 0 || idx >= m.plan.steps.length) return {};
    const next = m.plan.steps.slice();
    const failed = data.status === "failed";
    const patch: PlanStep = { ...next[idx], status: failed ? "failed" : "done" };
    const summary = (data.summary as string | null) ?? "";
    if (!failed && summary) patch.summary = summary;
    const errorMsg = (data.error as string | null) ?? "";
    if (failed && errorMsg) patch.error = errorMsg;
    next[idx] = patch;
    return { plan: { ...m.plan, steps: next } };
  }

  if (event === "text") {
    const delta = (data.delta as string) ?? "";
    if (!delta) return {};
    return { content: m.content + delta, status: "streaming" };
  }

  if (event === "result") {
    // Replace, don't append — post-guard text may diverge from streamed deltas.
    // dedupeDoubledText guards the edge case where a regenerate leaves the text
    // rendered exactly twice (A+A); a no-op on normal single output.
    const finalText = dedupeDoubledText((data.text as string) ?? "");
    const finalSteps = ((data.tool_calls as Array<Record<string, unknown>>) ?? []).map((tc) => ({
      id: (tc.id as string) ?? null,
      name: (tc.name as string) ?? "",
      server: (tc.server as string | null) ?? null,
      isError: (tc.is_error as boolean | null) ?? null,
    }));
    return {
      content: finalText,
      steps: finalSteps,
      plan: closeOpenPlanSteps(m.plan),
      receipts: receiptsFrom(finalText),
      usage: (data.usage as Record<string, unknown> | null) ?? null,
      status: "done",
    };
  }

  if (event === "meta") {
    return { meta: data as ChatMeta };
  }

  if (event === "error") {
    const msg = (data.message as string) ?? "stream error";
    return { status: "error", errorMessage: msg };
  }

  // `open`, `done`, and unknown events are wire-only — no state change.
  return {};
}

/** The chat state machine. Owns `messages`, the `sessionId` (one per
 * conversation), the in-flight assistant id, and the POST → SSE consumer.
 *
 * ``opts.corpusId`` (optional) — when set, every turn is sent with
 * ``corpus_id``, telling the agent to ``search_documents`` over that corpus
 * (rag_store MCP) for extra ammo before composing the roast/brief. Wired
 * from the /library page (sticky) and the ``?corpus=`` query param on /chat
 * so a "Use →" click from the library lands in chat with the corpus armed. */
export function useChat(opts?: {
  corpusId?: string;
  mode?: ChatMode;
  tone?: ChatTone;
  backend?: string;
}) {
  const corpusId = opts?.corpusId?.trim() || undefined;
  const mode = opts?.mode ?? "roast";
  const tone = opts?.tone ?? "medium";
  const backend = opts?.backend?.trim() || undefined;
  // One id per browser session so the API folds prior turns into the prompt.
  const sessionRef = useRef<string>(newId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
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
      if (trimmed.length > MAX_CHAT_MESSAGE_CHARS) {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "user", content: trimmed.slice(0, MAX_CHAT_MESSAGE_CHARS) },
          {
            id: newId(),
            role: "assistant",
            content: "",
            steps: [],
            plan: null,
            receipts: [],
            usage: null,
            meta: null,
            status: "error",
            errorMessage: `message too long (${trimmed.length}/${MAX_CHAT_MESSAGE_CHARS} chars)`,
          },
        ]);
        return;
      }

      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "", steps: [], plan: null, receipts: [], usage: null, meta: null, status: "thinking", quip: null },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Clinical mode: fire a parallel cheap-tier quip so the ~30s wait shows a
      // line reacting to the user's message instead of a static banner. Purely
      // decorative — fire-and-forget, shares the turn's abort signal, and any
      // failure is dropped silently (the skeleton keeps its hardcoded line).
      if (mode === "clinical") {
        void (async () => {
          try {
            const qres = await fetch(apiUrl("/chat/quip"), {
              method: "POST",
              headers: apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                message: trimmed,
                tone,
                ...(backend ? { backend } : {}),
              }),
              signal: controller.signal,
            });
            if (!qres.ok) return;
            const { quip } = (await qres.json()) as { quip?: string | null };
            if (!quip) return;
            // Only paint while the envelope is still loading — never overwrite
            // anything after the turn settled.
            patchAssistant(assistantId, (m) =>
              m.status === "thinking" || m.status === "streaming" ? { quip } : {},
            );
          } catch {
            // decorative: abort / network / parse failures are all fine to drop
          }
        })();
      }
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, CHAT_STREAM_TIMEOUT_MS);

      try {
        const res = await fetch(apiUrl("/chat/stream"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
          body: JSON.stringify({
            session_id: sessionRef.current,
            message: trimmed,
            mode,
            tone,
            ...(corpusId ? { corpus_id: corpusId } : {}),
            ...(backend ? { backend } : {}),
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await apiErrorMessage(res));
        if (!res.body) throw new Error("API returned an empty stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const raw of frames) {
            const parsed = parseSseFrame(raw);
            if (!parsed) continue;
            const { event, data } = parsed as { event: string; data: Record<string, unknown> };
            patchAssistant(assistantId, (m) => applyStreamEvent(m, event, data));
          }
        }

        if (buffer.trim()) {
          const parsed = parseSseFrame(buffer);
          if (parsed?.data && typeof parsed.data === "object") {
            patchAssistant(assistantId, (m) =>
              applyStreamEvent(m, parsed.event, parsed.data as Record<string, unknown>),
            );
          }
        }
        reader.releaseLock();
        patchAssistant(assistantId, (m) => {
          if (m.status !== "thinking" && m.status !== "streaming") return {};
          // No result event arrived (stream cut after the deltas). Dedupe in
          // case a regenerate left the accumulated deltas doubled.
          return {
            status: "done",
            content: dedupeDoubledText(m.content),
            plan: closeOpenPlanSteps(m.plan),
          };
        });
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        if (timedOut) {
          patchAssistant(assistantId, (m) => ({
            status: "error",
            errorMessage: `request timed out after ${Math.round(CHAT_STREAM_TIMEOUT_MS / 1000)}s`,
            plan: closeOpenPlanSteps(m.plan, "timed out"),
          }));
        } else if (!aborted) {
          const msg = e instanceof Error ? e.message : "request failed";
          patchAssistant(assistantId, (m) => ({
            status: "error",
            errorMessage: msg,
            plan: closeOpenPlanSteps(m.plan, msg),
          }));
        } else {
          patchAssistant(assistantId, (m) => ({
            status: "done",
            plan: closeOpenPlanSteps(m.plan, "stopped"),
          }));
        }
      } finally {
        window.clearTimeout(timeout);
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, patchAssistant, corpusId, mode, tone, backend],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Wipe the conversation locally AND on the backend (new session id). The
   * server's store keeps the old session under its old id — fine to leak. */
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
