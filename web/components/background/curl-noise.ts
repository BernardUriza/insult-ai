/** Curl-noise math — pure, stateless, React-free.
 *
 *  The curl of a scalar noise field is divergence-free: the flow it induces
 *  has no sources or sinks, so particles advected by it read as natural
 *  swirling currents (smoke, drifting sparks) rather than draining toward a
 *  point. EmberField advects its embers along this field. Kept out of the
 *  component so it can be unit-tested and reused without a canvas.
 */

/** Cheap value-noise hash (sin-fract). The three constants are the canonical
 *  hash-noise magic numbers — not tunable, just a well-distributed scramble. */
export function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 2D value noise via bilinear interpolation of hashed lattice corners,
 *  with a smoothstep (3t²−2t³) ease on the fractional coordinates. */
export function valueNoise(x: number, y: number): number {
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
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Curl of the scalar field: (∂N/∂y, -∂N/∂x). Divergence-free → swirls.
 *  `EPSILON` is the central-difference step for the numerical gradient. */
export function curl(x: number, y: number): [number, number] {
  const EPSILON = 0.35;
  const n1 = valueNoise(x, y + EPSILON);
  const n2 = valueNoise(x, y - EPSILON);
  const n3 = valueNoise(x + EPSILON, y);
  const n4 = valueNoise(x - EPSILON, y);
  const dx = (n1 - n2) / (2 * EPSILON);
  const dy = (n3 - n4) / (2 * EPSILON);
  return [dy, -dx];
}
