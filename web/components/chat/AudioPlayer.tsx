"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getStatusIcon, getUIIcon } from "../../lib/icons";

const SpeakerIcon = getUIIcon("speaker");
const PauseIcon = getUIIcon("pause");
const CloseIcon = getUIIcon("close");
const ErrorIcon = getStatusIcon("error");

/** Floating audio player bar — ChatGPT-style.
 *
 * Renders a glass bar fixed near the bottom of the viewport while a TTS
 * audio is loading or playing. Single instance per page (rendered from
 * /chat layout when a message's listen button is clicked).
 *
 * Ported from aurity (components/chat/AudioPlayer.tsx, 474 lines). Kept
 * the structural decisions — seek bar with gradient fill, skip ±10s
 * buttons, pulsing-dot loader, auto-play on URL ready — but stripped:
 *
 *   - the voice selector dropdown (Aurity exposes 50+ voices; insult-ai
 *     fixes onyx — the deadpan-anchor persona match)
 *   - the dual user/AI message styling (we only TTS the agent's roast)
 *   - the aplay-* class system (replaced with inline Tailwind matching
 *     iai-* tokens so this drops in without a globals.css edit)
 *   - the api.blob / ROUTES.tts coupling (we fetch /voice/speak ourselves)
 *
 * Pulsing-dot loader instead of a spinner: spinners read as "loading
 * forever", a triple-dot pulse reads as "speaking" — semantically right
 * for a TTS surface. */
function PulsingDots() {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          className="block h-1.5 w-1.5 rounded-full bg-iai-fire animate-pulse"
          style={{ animationDelay: `${delay}s`, animationDuration: "1.2s" }}
        />
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface AudioPlayerProps {
  /** Blob URL ready to play. Null = still loading. */
  audioUrl: string | null;
  /** When true, show the "Generating audio…" loader strip. */
  isLoading: boolean;
  /** Surfaced if synthesis or playback fails. */
  error?: string | null;
  /** Retry-in-progress status from `useTtsBlob`. When set during loading,
   * the player labels the wait so the user knows it's rate-limit, not stuck. */
  retryStatus?: { attempt: number; waitMs: number } | null;
  /** Closes the bar — caller is responsible for revoking the blob URL. */
  onClose: () => void;
  /** Optional label rendered next to the speaker icon. Defaults to "onyx". */
  voiceLabel?: string;
}

export function AudioPlayer({
  audioUrl,
  isLoading,
  error,
  retryStatus,
  onClose,
  voiceLabel = "onyx",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Build the <audio> element when a fresh URL lands. Tear it down when
  // the URL changes or the component unmounts so cached audio doesn't
  // bleed across messages.
  useEffect(() => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoaded = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      if (!isDragging) setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    // Auto-play. Browsers may block this if no user gesture preceded —
    // catch silently; user can still hit the play button.
    audio.play().catch(() => {
      /* autoplay blocked — user will hit play manually */
    });

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, [audioUrl, isDragging]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) a.pause();
    else void a.play();
  }, [isPlaying]);

  const handleSeek = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  const skipBackward = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime - 10);
  }, []);

  const skipForward = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.min(duration, a.currentTime + 10);
  }, [duration]);

  const handleClose = useCallback(() => {
    audioRef.current?.pause();
    onClose();
  }, [onClose]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Container: a self-contained glass card. Positioning is the SHELL's job
  // (ConversationShell docks it in the bottom region) — the player no longer
  // pins itself to the viewport, which is what made the old `fixed` variant
  // overlap the composer. Width caps so it reads as a player, not a banner;
  // the shell right-aligns it.
  const containerCls =
    "w-full max-w-[640px] rounded-2xl border border-iai-fire/30 bg-iai-bg/95 px-4 py-3 shadow-[0_8px_40px_-12px_rgba(255,92,40,0.45)]";

  if (error) {
    return (
      <div className={containerCls} role="alert">
        <div className="flex items-center gap-3">
          <ErrorIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
          <span className="flex-1 text-sm text-red-300">{error}</span>
          <button
            type="button"
            onClick={handleClose}
            className="iai-btn-chip"
            aria-label="Close player"
          >
            <CloseIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={containerCls}>
        <div className="flex items-center gap-3">
          <PulsingDots />
          <span className="flex-1 text-sm text-zinc-200">
            {retryStatus ? (
              <>
                <span className="text-amber-300">
                  Rate-limited — retry {retryStatus.attempt} in{" "}
                  {Math.ceil(retryStatus.waitMs / 1000)}s…
                </span>{" "}
                <span className="text-zinc-500">voice: {voiceLabel}</span>
              </>
            ) : (
              <>
                Generating audio…{" "}
                <span className="text-zinc-500">voice: {voiceLabel}</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="iai-btn-chip"
            aria-label="Cancel"
          >
            <CloseIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  if (!audioUrl) return null;

  return (
    <div className={containerCls}>
      <div className="flex items-center gap-3">
        {/* Voice badge */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <SpeakerIcon className="h-4 w-4 text-iai-fire" aria-hidden />
          <span className="text-xs font-medium text-zinc-300">{voiceLabel}</span>
        </div>

        {/* Skip back 10s */}
        <button
          type="button"
          onClick={skipBackward}
          disabled={currentTime === 0}
          className="iai-btn-chip h-9 px-2"
          title="Skip back 10s"
          aria-label="Skip back 10 seconds"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
          </svg>
          <span className="text-[10px] font-mono">10s</span>
        </button>

        {/* Play / Pause — primary action, warm accent */}
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-iai-fire text-black shadow-[0_4px_18px_-4px_rgb(var(--color-iai-fire-rgb)/0.7)] transition hover:brightness-110 active:brightness-95"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <PauseIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          ) : (
            <SpeakerIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          )}
        </button>

        {/* Skip forward 10s */}
        <button
          type="button"
          onClick={skipForward}
          disabled={currentTime >= duration}
          className="iai-btn-chip h-9 px-2"
          title="Skip forward 10s"
          aria-label="Skip forward 10 seconds"
        >
          <span className="text-[10px] font-mono">10s</span>
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
          </svg>
        </button>

        {/* Time + seek */}
        <span className="hidden font-mono text-xs tabular-nums text-zinc-400 sm:inline">
          {formatTime(currentTime)}
        </span>
        <div className="relative flex flex-1 items-center">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-iai-surface">
            <div
              className="h-full bg-iai-fire transition-[width] duration-100"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
          />
        </div>
        <span className="hidden font-mono text-xs tabular-nums text-zinc-400 sm:inline">
          {formatTime(duration)}
        </span>

        {/* Close */}
        <button
          type="button"
          onClick={handleClose}
          className="iai-btn-chip h-9 px-2"
          aria-label="Close player"
        >
          <CloseIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
