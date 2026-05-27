"use client";

import { useEffect, useRef, useState } from "react";

/** Real-time audio level analysis via Web Audio API.
 *
 * Pulls the FFT magnitude average off a MediaStream so the UI can react to
 * the user's voice as it happens (pulse rings, silent detection). 60Hz
 * via requestAnimationFrame — cheap, no extra deps.
 *
 * Ported from aurity (free-intelligence/apps/aurity/hooks/useAudioAnalysis.ts)
 * — same FFT settings, same gain default, same silence threshold default.
 * Adapted to ship as a single file without aurity's AUDIO_CONFIG module.
 */
const DEFAULT_SILENCE_THRESHOLD = 5;
const DEFAULT_GAIN = 2.5;

interface Config {
  /** Below this level the stream is treated as silent. 0-255 scale. */
  silenceThreshold?: number;
  /** Pre-analyser gain so low-volume mics still register. */
  gain?: number;
  /** Pause the loop when the recorder isn't running. */
  isActive: boolean;
}

export function useAudioAnalysis(
  stream: MediaStream | null,
  config: Config,
): { audioLevel: number; isSilent: boolean } {
  const {
    silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
    gain = DEFAULT_GAIN,
    isActive,
  } = config;

  const [audioLevel, setAudioLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const isSilent = audioLevel < silenceThreshold;

  useEffect(() => {
    if (!stream || !isActive) {
      setAudioLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const gainNode = audioContext.createGain();
    const source = audioContext.createMediaStreamSource(stream);

    gainNode.gain.value = gain;
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(gainNode);
    gainNode.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      const node = analyserRef.current;
      if (!node) return;
      node.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(avg);
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, isActive, gain, silenceThreshold]);

  return { audioLevel, isSilent };
}
