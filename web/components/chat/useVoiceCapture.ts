"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiHeaders, apiUrl } from "../../lib/api";

type CaptureState = "idle" | "recording" | "transcribing";

/** Owns the mic flow: getUserMedia → MediaRecorder → POST /voice/transcribe.
 *
 * Why a hook (not a component): the recording lifecycle owns MediaStream +
 * MediaRecorder refs that must survive re-renders AND be torn down on
 * unmount — leaking either stays a red browser tab in the user's UI forever.
 * The component just paints state, the hook does plumbing.
 *
 * MIME choice: MediaRecorder defaults to `audio/webm;codecs=opus` on
 * Chrome/Edge/Firefox and `audio/mp4` on Safari. Both are accepted by
 * Azure Whisper without re-encoding, so we let the browser pick and just
 * forward whatever blob it produces. We DO pass the right `filename`
 * extension to the backend so Azure's content sniffer routes correctly.
 *
 * Permission UX: a denied getUserMedia is permanent until the user goes
 * into site settings — surface that as a distinct error state so a UI can
 * say "Allow mic access in your browser settings" instead of a generic
 * "recording failed". */
export function useVoiceCapture(opts: {
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const { onTranscribed, onError } = opts;
  const [state, setState] = useState<CaptureState>("idle");

  // Refs survive re-renders; state changes don't reset them. The stream
  // owns OS-level mic access and must be released explicitly via
  // `getTracks().forEach(t => t.stop())` — without that the browser keeps
  // the red "recording" indicator on the tab.
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  // Always release the mic if the component unmounts mid-recording.
  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanup();
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const fd = new FormData();
          fd.append("audio", blob, `recording.${ext}`);
          // apiHeaders WITHOUT Content-Type — let the browser set the
          // multipart boundary. Manually setting Content-Type strips the
          // boundary and the server rejects the body as malformed.
          const res = await fetch(apiUrl("/voice/transcribe"), {
            method: "POST",
            headers: apiHeaders(),
            body: fd,
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) onTranscribed(text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "transcription failed";
          onError?.(msg);
        } finally {
          setState("idle");
        }
      };
      recorder.start();
      setState("recording");
    } catch (err) {
      cleanup();
      setState("idle");
      // NotAllowedError = user denied / browser blocked. Spell it out so a
      // UI can route to settings; generic "recording failed" is useless.
      const name = (err as { name?: string } | null)?.name;
      const msg =
        name === "NotAllowedError"
          ? "microphone access denied — enable it in browser settings"
          : err instanceof Error
            ? err.message
            : "could not start recording";
      onError?.(msg);
    }
  }, [state, onTranscribed, onError, cleanup]);

  const stop = useCallback(() => {
    if (state !== "recording") return;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, [state]);

  const toggle = useCallback(() => {
    if (state === "idle") void start();
    else if (state === "recording") stop();
    // 'transcribing' = no-op; let the request finish.
  }, [state, start, stop]);

  return { state, start, stop, toggle };
}
