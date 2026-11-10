// Small pure helpers shared by every module. Must NOT import three.js
// (Node tools import this through timeline.js).

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Linear 0..1 progress of x through [a, b] (clamped). */
export const ramp = (x, a, b) => (b === a ? (x >= b ? 1 : 0) : clamp01((x - a) / (b - a)));

/** Hermite smoothstep of x through [a, b] (clamped). */
export function smoothstep(a, b, x) {
  const t = ramp(x, a, b);
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}

export function easeInCubic(t) {
  t = clamp01(t);
  return t * t * t;
}

/**
 * Opacity envelope: 0 before `inStart`, rises to 1 at `inEnd`, holds,
 * falls from `outStart` to 0 at `outEnd` (smoothstep edges). Omit the out
 * pair to hold forever.
 */
export function envelope(x, inStart, inEnd, outStart = Infinity, outEnd = Infinity) {
  return smoothstep(inStart, inEnd, x) * (1 - smoothstep(outStart, outEnd, x));
}

/**
 * Seeded PRNG (mulberry32). Returns a function producing floats in [0, 1).
 * Use it at CONSTRUCTION time only - never call Math.random() in update().
 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of an integer (or string) to a float in [0, 1). */
export function hash01(n) {
  if (typeof n === 'string') {
    let h = 2166136261;
    for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619);
    n = h;
  }
  return rng((n | 0) ^ 0x9e3779b9)();
}

/** Time-periodic wobble that is a pure function of t (for idle motion). */
export function wobble(t, freq = 1, phase = 0) {
  return Math.sin((t * freq + phase) * Math.PI * 2);
}
