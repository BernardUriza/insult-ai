"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_VOICE_UPLOAD_BYTES,
  apiErrorMessage,
  apiHeaders,
  fetchApi,
} from "../../lib/api";
import { fetchWithRetry } from "./voiceRetry";

type CaptureState = "idle" | "recording" | "transcribing";
const MAX_RECORDING_SECONDS = 120;

export interface TranscribeRetryStatus {
  attempt: number;
  waitMs: number;
}

/** Owns the mic flow end-to-end: getUserMedia → MediaRecorder → POST
 * /voice/transcribe → onTranscribed(text).
 *
 * Now also exposes the live `MediaStream` and a `recordingTime` second
 * counter so a UI layer can wire `useAudioAnalysis(stream, ...)` for the
 * VAD pulse rings + render a MM:SS timer next to the button. The hook
 * still does NO Web-Audio-API work itself — separation of concerns
 * (recording vs. analysis) lifted directly from aurity's split between
 * useRecorder and useAudioAnalysis.
 *
 * Cleanup contract (load-bearing):
 *   - tracks stopped on stop AND on unmount → no zombie red mic
 *     indicator on the tab
 *   - timer cleared in the same places
 *   - state reset to "idle" even on error paths */
export function useVoiceCapture(opts: {
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const { onTranscribed, onError } = opts;
  const [state, setState] = useState<CaptureState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [retryStatus, setRetryStatus] = useState<TranscribeRetryStatus | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    recorderRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    chunksRef.current = [];
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
      streamRef.current = null;
    }
    setStream(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        onError?.("voice capture is not supported in this browser");
        return;
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = newStream;
      setStream(newStream);
      const recorder = new MediaRecorder(newStream);
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
          setRecordingTime(0);
          return;
        }
        if (blob.size > MAX_VOICE_UPLOAD_BYTES) {
          onError?.(
            `recording too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Try a shorter clip.`,
          );
          setState("idle");
          setRecordingTime(0);
          return;
        }
        setState("transcribing");
        setRetryStatus(null);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          // The blob is captured once; retries re-send the SAME bytes.
          // FormData is rebuilt each attempt so the boundary header
          // stays valid (browsers regenerate it per fetch).
          const res = await fetchWithRetry(
            () => {
              const fd = new FormData();
              fd.append("audio", blob, `recording.${ext}`);
              return fetchApi("/voice/transcribe", {
                method: "POST",
                headers: apiHeaders(),
                body: fd,
                signal: controller.signal,
              });
            },
            {
              onRetry: ({ attempt, waitMs }) =>
                setRetryStatus({ attempt, waitMs }),
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            throw new Error(await apiErrorMessage(res));
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) onTranscribed(text);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          const msg = err instanceof Error ? err.message : "transcription failed";
          onError?.(msg);
        } finally {
          setState("idle");
          setRecordingTime(0);
          setRetryStatus(null);
          if (abortRef.current === controller) abortRef.current = null;
        }
      };
      recorder.start();
      setState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
      maxTimerRef.current = setTimeout(() => {
        const r = recorderRef.current;
        if (r && r.state !== "inactive") r.stop();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (err) {
      cleanup();
      setState("idle");
      setRecordingTime(0);
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
  }, [state, start, stop]);

  return { state, stream, recordingTime, retryStatus, start, stop, toggle };
}
