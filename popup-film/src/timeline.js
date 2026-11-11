/**
 * timeline.js — master schedule of "The Little Paper Boat".
 *
 * Single source of truth for film timing: duration, leaf turns, spread windows, chapters,
 * easing helpers, the leaf-angle function (film time -> 5 leaf angles) and a wall-clock
 * Player. Everything here is pure except Player, which reads performance.now().
 */

export const DURATION = 96;

/** Leaf turns: leaf i rotates φ 0 -> π between start and end (film seconds). */
export const LEAF_TURNS = [
  { leaf: 0, start: 7, end: 10 },
  { leaf: 1, start: 28, end: 31 },
  { leaf: 2, start: 49, end: 52 },
  { leaf: 3, start: 70, end: 73 },
];

/** start = when the spread starts opening; end = when it has finished closing (null = never). */
export const SPREADS = [
  { k: 1, id: 'forest', title: 'The Whispering Forest', start: 7, end: 31 },
  { k: 2, id: 'sea', title: 'The Folded Sea', start: 28, end: 52 },
  { k: 3, id: 'city', title: 'The Lantern City', start: 49, end: 73 },
  { k: 4, id: 'sky', title: 'The Morning Sky', start: 70, end: null },
];

export const CHAPTERS = [
  { t: 0, label: 'Prologue' },
  { t: 7, label: 'The Whispering Forest' },
  { t: 28, label: 'The Folded Sea' },
  { t: 49, label: 'The Lantern City' },
  { t: 70, label: 'The Morning Sky' },
  { t: 89, label: 'The End' },
];

export function clamp(x, a = 0, b = 1) {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Normalised progress of t through [a, b], clamped to [0, 1]. */
export function seg(t, a, b) {
  return clamp((t - a) / (b - a));
}

export function smoothstep(a, b, x) {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
};

/**
 * Leaf angles [φ0..φ4] at film time t. φ4 (back cover) is always 0. Pass `out` (an array of ≥ 5
 * numbers) to fill and return it instead of allocating a new array (per-frame use).
 */
export function leafAngles(t, out = [0, 0, 0, 0, 0]) {
  out.fill(0, 0, 5);
  for (const turn of LEAF_TURNS) {
    out[turn.leaf] = Math.PI * ease.inOutCubic(seg(t, turn.start, turn.end));
  }
  return out;
}

/** Opening angle α_k of spread k (1..4) for the given leaf angles. */
export function spreadAlpha(k, phis) {
  return phis[k - 1] - phis[k];
}

/** Wall-clock film player. Time is clamped to [0, duration]; pauses and fires onEnd at the end. */
export class Player {
  constructor(duration = DURATION) {
    this.duration = duration;
    this.rate = 1;
    this.onEnd = null;
    this._time = 0;
    this._playing = false;
    this._last = 0;
  }

  get playing() {
    return this._playing;
  }

  get time() {
    if (this._playing) {
      const now = performance.now();
      this._time = clamp(this._time + ((now - this._last) / 1000) * this.rate, 0, this.duration);
      this._last = now;
      if (this._time >= this.duration) {
        this._playing = false;
        if (this.onEnd) this.onEnd();
      }
    }
    return this._time;
  }

  play() {
    if (this._playing) return;
    if (this._time >= this.duration) this._time = 0;
    this._last = performance.now();
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    this.time; // fold elapsed wall time into _time
    this._playing = false;
  }

  toggle() {
    if (this._playing) this.pause();
    else this.play();
  }

  seek(t) {
    this._time = clamp(t, 0, this.duration);
    this._last = performance.now();
  }
}
