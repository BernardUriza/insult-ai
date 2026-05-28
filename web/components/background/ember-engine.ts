/** Ember particle engine — the simulation half of EmberField, lifted out of
 *  the React component so the component is pure wiring (canvas + lifecycle).
 *
 *  Discrete glowing embers advected by a curl-noise flow with an upward bias,
 *  painted with additive ('lighter') compositing over a translucent navy veil
 *  so trails smear into fading streaks instead of a hard per-frame clear.
 *
 *  Stateless toward React: `createEmberEngine` closes over its own particle
 *  array, activity, and time cursor. The component calls `resize`, `step`,
 *  `drawStatic`, and `setActivity` — nothing else.
 */

import { curl } from "./curl-noise";

/** Custom-event name the agentic surface dispatches to drive ember intensity.
 *  Shared so the emitter (chat page) and the listener (EmberField) can never
 *  drift apart on a hand-typed string. */
export const EMBER_ACTIVITY_EVENT = "iai:ember-activity";

/** Dispatch an activity level (0–1) to any mounted activity-driven EmberField.
 *  Clamped on the receiving end; callers pass a raw 0–1 intent. */
export function emitEmberActivity(activity: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EMBER_ACTIVITY_EVENT, { detail: { activity } }),
  );
}

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

export interface EmberEngineOptions {
  opacity: number;
  veilAlpha: number;
  glowScale: number;
  idleSpeed: number;
  activeSpeed: number;
}

// ── Tuning constants (named so a reader knows what each magic number means) ──
const NOISE_SCALE = 0.0016; // world→noise-space scale of the flow field
const BASE_SPEED = 0.55; // base acceleration applied along the curl flow
const RISE = 0.28; // upward bias — embers float up like sparks off a fire
const DAMPING = 0.9; // per-frame velocity retention (1 = frictionless)
const ACTIVITY_LERP = 0.08; // how fast displayed activity chases its target
const TIME_STEP = 0.00012; // base flow-field evolution per frame
const FADE_FRAMES = 60; // ease-in/out window (frames) for per-particle alpha
const DENSITY_DIVISOR = 11000; // viewport area per particle
const MIN_PARTICLES = 70;
const MAX_PARTICLES = 220;
const DRIFT_IDLE = 0.28; // flow strength at rest
const DRIFT_GAIN = 0.42; // extra flow strength at full activity
const RISE_IDLE = 0.4; // rise multiplier at rest
const RISE_GAIN = 0.6; // extra rise multiplier at full activity
const SPAWN_MARGIN = 20; // off-screen recycle margin (px)
const VEIL_RGB = "9, 27, 54"; // BD --dark navy, the trail veil color

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function spawn(W: number, H: number): Particle {
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    vx: 0,
    vy: 0,
    life: Math.random() * 200,
    maxLife: 200 + Math.random() * 320,
    size: 0.8 + Math.random() * 1.8,
    warm: Math.random(),
  };
}

export interface EmberEngine {
  /** Update viewport dimensions; seeds particles on first call. */
  resize(width: number, height: number): void;
  /** Advance one animation frame (veil + physics + recycle + draw). */
  step(): void;
  /** Paint a single static scatter (prefers-reduced-motion path). */
  drawStatic(): void;
  /** Set the target activity level (0–1); eased toward over subsequent steps. */
  setActivity(next: number): void;
}

export function createEmberEngine(
  ctx: CanvasRenderingContext2D,
  options: EmberEngineOptions,
): EmberEngine {
  const { opacity, veilAlpha, glowScale, idleSpeed, activeSpeed } = options;

  let W = 0;
  let H = 0;
  let particles: Particle[] = [];
  let targetActivity = 0;
  let activity = 0;
  let t = 0;

  const drawParticle = (p: Particle) => {
    const fade = Math.min(p.life, p.maxLife - p.life, FADE_FRAMES) / FADE_FRAMES;
    const alpha = Math.max(0, fade) * opacity;
    const g = Math.round(92 + p.warm * (179 - 92)); // 92→179 (fire→ember)
    const b = Math.round(40 + p.warm * (71 - 40)); // 40→71
    const radius = p.size * 4 * glowScale;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    grd.addColorStop(0, `rgba(255, ${g}, ${b}, ${alpha})`);
    grd.addColorStop(1, `rgba(255, ${g}, ${b}, 0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const resize: EmberEngine["resize"] = (width, height) => {
    W = width;
    H = height;
    // Seed once on first sizing; later resizes keep existing particles so the
    // field doesn't flicker/reset when the window changes size.
    if (particles.length === 0) {
      const count = Math.round(
        Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, (W * H) / DENSITY_DIVISOR)),
      );
      particles = Array.from({ length: count }, () => spawn(W, H));
    }
  };

  const setActivity: EmberEngine["setActivity"] = (next) => {
    targetActivity = clamp01(Number.isFinite(next) ? next : 0);
  };

  const step: EmberEngine["step"] = () => {
    activity += (targetActivity - activity) * ACTIVITY_LERP;
    const flowBoost = idleSpeed + (activeSpeed - idleSpeed) * activity;
    t += TIME_STEP * flowBoost;

    const driftBoost = DRIFT_IDLE + activity * DRIFT_GAIN;
    const riseBoost = RISE * (RISE_IDLE + activity * RISE_GAIN);

    // Translucent navy veil → fading trails instead of a hard clear.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${VEIL_RGB}, ${veilAlpha})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      const [cx, cy] = curl(p.x * NOISE_SCALE, p.y * NOISE_SCALE + t);
      p.vx += cx * BASE_SPEED * driftBoost;
      p.vy += cy * BASE_SPEED * driftBoost - riseBoost;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
      p.life += 1;

      if (
        p.life >= p.maxLife ||
        p.y < -SPAWN_MARGIN ||
        p.y > H + SPAWN_MARGIN ||
        p.x < -SPAWN_MARGIN ||
        p.x > W + SPAWN_MARGIN
      ) {
        Object.assign(p, spawn(W, H), { y: H + 10, life: 0 });
      }
      drawParticle(p);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const drawStatic: EmberEngine["drawStatic"] = () => {
    ctx.fillStyle = "#091B36";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) drawParticle(p);
    ctx.globalCompositeOperation = "source-over";
  };

  return { resize, step, drawStatic, setActivity };
}
