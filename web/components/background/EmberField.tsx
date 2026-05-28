"use client";

import { useEffect, useRef } from "react";

/** EmberField — curl-noise ember background for the app surfaces (chat,
 *  library — everything that is not the landing).
 *
 *  Discrete glowing embers, not a molten surface. Each particle reads a
 *  flow direction from a curl-noise field (the curl of a scalar noise is
 *  divergence-free, so the field has no sources/sinks and the motion reads
 *  as natural swirling currents — like smoke or drifting sparks). A small
 *  upward bias makes them rise like embers off a fire.
 *
 *  The "river" trail is the key trick: instead of clearing the canvas each
 *  frame, we paint a translucent navy veil over it, so particles smear into
 *  fading streaks. Drawn with 'lighter' compositing for additive glow in
 *  iai-fire / iai-ember.
 *
 *  Cheaper than the landing's shader on purpose — this is chrome behind a
 *  working surface, so it stays light (a few hundred particles, Canvas 2D,
 *  DPR-capped). Respects prefers-reduced-motion (static scatter, no loop)
 *  and pauses on a hidden tab.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  warm: number; // 0 = fire, 1 = ember
}

// Cheap value noise (hash-lerp) — enough to derive a smooth scalar field
// whose gradient we rotate 90° to get a divergence-free (curl) flow.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (
    a * (1 - u) * (1 - v) +
    b * u * (1 - v) +
    c * (1 - u) * v +
    d * u * v
  );
}

// Curl of the scalar field: (∂N/∂y, -∂N/∂x). Divergence-free → swirls.
function curl(x: number, y: number): [number, number] {
  const e = 0.35;
  const n1 = valueNoise(x, y + e);
  const n2 = valueNoise(x, y - e);
  const n3 = valueNoise(x + e, y);
  const n4 = valueNoise(x - e, y);
  const dx = (n1 - n2) / (2 * e);
  const dy = (n3 - n4) / (2 * e);
  return [dy, -dx];
}

export function EmberField({
  opacity = 0.55,
  veilAlpha = 0.16,
  glowScale = 1,
  idleSpeed = 0.55,
  activeSpeed = 0.55,
  activityDriven = false,
}: {
  opacity?: number;
  veilAlpha?: number;
  glowScale?: number;
  idleSpeed?: number;
  activeSpeed?: number;
  activityDriven?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      const ratio = dpr();
      canvas.width = Math.floor(W * ratio);
      canvas.height = Math.floor(H * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.round(
      Math.min(220, Math.max(70, (W * H) / 11000)),
    );

    const spawn = (): Particle => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0,
      vy: 0,
      life: Math.random() * 200,
      maxLife: 200 + Math.random() * 320,
      size: 0.8 + Math.random() * 1.8,
      warm: Math.random(),
    });

    const particles: Particle[] = Array.from({ length: count }, spawn);

    const NOISE_SCALE = 0.0016;
    const SPEED = 0.55;
    const RISE = 0.18; // upward bias — embers float up
    let targetActivity = 0;
    let activity = 0;
    let t = 0;

    const drawParticle = (p: Particle) => {
      const fade =
        Math.min(p.life, p.maxLife - p.life, 60) / 60; // ease in/out alpha
      const a = Math.max(0, fade) * opacity;
      const r = Math.round(255);
      const g = Math.round(92 + p.warm * (179 - 92)); // 92→179
      const b = Math.round(40 + p.warm * (71 - 40)); // 40→71
      const radius = p.size * 4 * glowScale;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
      grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const step = () => {
      activity += (targetActivity - activity) * 0.08;
      const speedBoost = idleSpeed + (activeSpeed - idleSpeed) * activity;
      const riseBoost = RISE * (0.35 + activity * 1.65);

      // Translucent navy veil → fading trails instead of a hard clear.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(9, 27, 54, ${veilAlpha})`;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        const [cx, cy] = curl(p.x * NOISE_SCALE, p.y * NOISE_SCALE + t);
        p.vx += cx * SPEED * speedBoost;
        p.vy += cy * SPEED * speedBoost - riseBoost;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;

        if (
          p.life >= p.maxLife ||
          p.y < -20 ||
          p.x < -20 ||
          p.x > W + 20
        ) {
          Object.assign(p, spawn(), { y: H + 10, life: 0 });
        }
        drawParticle(p);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    const loop = () => {
      t += 0.00018 + activity * 0.0032;
      step();
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      ctx.fillStyle = "#091B36";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) drawParticle(p);
      ctx.globalCompositeOperation = "source-over";
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onActivity = (event: Event) => {
      if (!activityDriven) return;
      const detail = (event as CustomEvent<{ activity?: number }>).detail;
      const next = Number(detail?.activity ?? 0);
      targetActivity = Math.min(1, Math.max(0, Number.isFinite(next) ? next : 0));
    };
    window.addEventListener("iai:ember-activity", onActivity);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("iai:ember-activity", onActivity);
    };
  }, [activeSpeed, activityDriven, glowScale, idleSpeed, opacity, veilAlpha]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
