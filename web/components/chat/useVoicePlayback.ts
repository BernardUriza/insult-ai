"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiHeaders, apiUrl } from "../../lib/api";

type PlaybackState = "idle" | "loading" | "playing";

export type TTSVoice = "onyx" | "echo" | "alloy";

/** Owns the TTS playback flow: POST /voice/speak → MP3 blob → HTMLAudioElement.
 *
 * One hook per message bubble. The blob URL is cached for the lifetime of the
 * hook — replay doesn't re-hit the backend (matches the Cache-Control: 1h the
 * server sets, but also a layer of defense if the cache is bypassed). Cleanup
 * revokes the blob URL so memory doesn't leak when the bubble unmounts.
 *
 * No 'pause' state — the player is binary play/idle. Pause-resume on a
 * 1-minute roast adds a tiny UX win for a meaningful complication; we opt
 * out and require a single click to stop, single click to replay. If a user
 * wants seek/scrub we'd add a full audio player, not a half one. */
export function useVoicePlayback(text: string, voice: TTSVoice = "onyx") {
  const [state, setState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Tear down the buffered audio when the hook unmounts or the source text
  // changes (a new roast = a new utterance; the old blob is stale).
  const teardown = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load(); // releases the media element's internal buffer
      audioRef.current = null;
    }
    const u = blobUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => teardown(), [teardown]);
  // Reset cached blob if the source text mutates (rare — roast text is
  // immutable post-stream, but defensive).
  useEffect(() => {
    teardown();
    setState("idle");
    setError(null);
  }, [text, voice, teardown]);

  const play = useCallback(async () => {
    setError(null);
    if (!text.trim()) return;

    // Replay path: blob already buffered — just .play() again from start.
    if (audioRef.current && blobUrlRef.current) {
      try {
        audioRef.current.currentTime = 0;
        setState("playing");
        await audioRef.current.play();
      } catch {
        setState("idle");
      }
      return;
    }

    setState("loading");
    try {
      const res = await fetch(apiUrl("/voice/speak"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setError("playback failed");
        setState("idle");
      };
      audioRef.current = audio;
      setState("playing");
      await audio.play();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "could not synthesize";
      setError(msg);
      setState("idle");
      teardown();
    }
  }, [text, voice, teardown]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setState("idle");
  }, []);

  const toggle = useCallback(() => {
    if (state === "playing") stop();
    else if (state === "idle") void play();
    // 'loading' = no-op; let the request finish.
  }, [state, play, stop]);

  return { state, error, toggle };
}
