"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_TTS_CHARS, apiErrorMessage, apiHeaders, fetchApi } from "../../lib/api";
import { fetchWithRetry } from "./voiceRetry";

export type TTSVoice = "onyx" | "echo" | "alloy";

/** Status surfaces to the UI: "rate-limited, retrying in 32s…" beats
 * the silent multi-second wait the user would otherwise see between
 * the initial click and the audio landing. */
export interface TtsRetryStatus {
  attempt: number;
  waitMs: number;
}

/** POSTs text to /voice/speak and surfaces the resulting MP3 blob URL.
 *
 * Owns ONLY synthesis — playback lives in <AudioPlayer> (the floating bar
 * ported from aurity). That split matches aurity's
 * useAudioPlayer/AudioPlayer split: the hook fetches, the component
 * renders the controls. Lets a single AudioPlayer instance live at the
 * page level and switch between messages by re-synthesizing.
 *
 * Retry behavior: the request goes through `fetchWithRetry`, which
 * retries on 429 (Azure rate-limit, currently 3 RPM on the S0 deployment)
 * and 503 (transient). Between attempts the hook exposes `retryStatus`
 * so the UI can paint a "rate-limited, retrying in Ns" line instead of
 * looking frozen.
 *
 * Cleanup: blob URLs are revoked when text/voice changes or the hook
 * unmounts, so even abandoned roasts don't leak memory in a long
 * /chat session. */
export function useTtsBlob() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryStatus, setRetryStatus] = useState<TtsRetryStatus | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const revoke = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const u = blobUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      blobUrlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  useEffect(() => () => revoke(), [revoke]);

  const synthesize = useCallback(
    async (text: string, voice: TTSVoice = "onyx") => {
      revoke();
      setError(null);
      setRetryStatus(null);
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_TTS_CHARS) {
        setError(`text too long for speech (${trimmed.length}/${MAX_TTS_CHARS} chars)`);
        return;
      }
      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetchWithRetry(
          () =>
            fetchApi("/voice/speak", {
              method: "POST",
              headers: apiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ text: trimmed, voice }),
              signal: controller.signal,
            }),
          {
            onRetry: ({ attempt, waitMs }) => setRetryStatus({ attempt, waitMs }),
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          throw new Error(await apiErrorMessage(res));
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setAudioUrl(url);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "could not synthesize";
        setError(msg);
      } finally {
        setIsLoading(false);
        setRetryStatus(null);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [revoke],
  );

  const close = useCallback(() => {
    revoke();
    setError(null);
    setIsLoading(false);
    setRetryStatus(null);
  }, [revoke]);

  return { audioUrl, isLoading, error, retryStatus, synthesize, close };
}
