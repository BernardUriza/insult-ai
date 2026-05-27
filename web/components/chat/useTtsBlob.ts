"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiHeaders, apiUrl } from "../../lib/api";

export type TTSVoice = "onyx" | "echo" | "alloy";

/** POSTs text to /voice/speak and surfaces the resulting MP3 blob URL.
 *
 * Owns ONLY synthesis — playback lives in <AudioPlayer> (the floating bar
 * ported from aurity). That split matches aurity's
 * useAudioPlayer/AudioPlayer split: the hook fetches, the component
 * renders the controls. Lets a single AudioPlayer instance live at the
 * page level and switch between messages by re-synthesizing.
 *
 * Cleanup: blob URLs are revoked when text/voice changes or the hook
 * unmounts, so even abandoned roasts don't leak memory in a long
 * /chat session. */
export function useTtsBlob() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    const u = blobUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      blobUrlRef.current = null;
    }
    setAudioUrl(null);
  }, []);

  // Tear down on unmount.
  useEffect(() => () => revoke(), [revoke]);

  const synthesize = useCallback(
    async (text: string, voice: TTSVoice = "onyx") => {
      revoke();
      setError(null);
      const trimmed = text.trim();
      if (!trimmed) return;
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/voice/speak"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ text: trimmed, voice }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setAudioUrl(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "could not synthesize";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [revoke],
  );

  const close = useCallback(() => {
    revoke();
    setError(null);
    setIsLoading(false);
  }, [revoke]);

  return { audioUrl, isLoading, error, synthesize, close };
}
