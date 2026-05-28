"use client";

import { useEffect, useRef } from "react";
import {
  EMBER_ACTIVITY_EVENT,
  type EmberEngine,
  type EmberEngineOptions,
  createEmberEngine,
} from "./ember-engine";

/** EmberField — curl-noise ember background for the app surfaces (chat,
 *  library — everything that is not the landing).
 *
 *  Thin React shell: it owns the <canvas>, the DPR-aware sizing, the rAF
 *  loop, and the lifecycle listeners. ALL simulation (particles, flow,
 *  trails) lives in `ember-engine.ts`; ALL field math lives in
 *  `curl-noise.ts`. This component does no physics.
 *
 *  Cheaper than the landing's shader on purpose — chrome behind a working
 *  surface stays light (Canvas 2D, DPR-capped, a few hundred particles).
 *  Respects prefers-reduced-motion (static scatter, no loop) and pauses on a
 *  hidden tab.
 */
export function EmberField({
  opacity = 0.55,
  veilAlpha = 0.16,
  glowScale = 1,
  idleSpeed = 0.55,
  activeSpeed = 0.55,
  activityDriven = false,
}: Partial<EmberEngineOptions> & { activityDriven?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EmberEngine | null>(null);
  const activityDrivenRef = useRef(activityDriven);

  // Keep activityDriven in sync without restarting the engine.
  useEffect(() => {
    activityDrivenRef.current = activityDriven;
  }, [activityDriven]);

  // Hot-update visual options without tearing down particle state.
  useEffect(() => {
    engineRef.current?.updateOptions({ opacity, veilAlpha, glowScale, idleSpeed, activeSpeed });
  }, [opacity, veilAlpha, glowScale, idleSpeed, activeSpeed]);

  // Engine lifecycle — runs once; options sync handled above via engineRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const engine = createEmberEngine(ctx, {
      opacity,
      veilAlpha,
      glowScale,
      idleSpeed,
      activeSpeed,
    });
    engineRef.current = engine;

    const resize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(W * ratio);
      canvas.height = Math.floor(H * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      engine.resize(W, H);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const loop = () => {
      engine.step();
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      engine.drawStatic();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onActivity = (event: Event) => {
      if (!activityDrivenRef.current) return;
      const detail = (event as CustomEvent<{ activity?: number }>).detail;
      engine.setActivity(Number(detail?.activity ?? 0));
    };
    window.addEventListener(EMBER_ACTIVITY_EVENT, onActivity);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(EMBER_ACTIVITY_EVENT, onActivity);
      engineRef.current = null;
    };
  }, []); // intentional empty deps — engine lifecycle is independent of prop values

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-ref="ember-field"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
