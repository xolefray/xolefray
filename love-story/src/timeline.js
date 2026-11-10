/**
 * timeline.js — master schedule of "Our Love Story" (Brian & Marlin's wedding pop-up film).
 *
 * THE single source of truth for film timing: duration, leaf turns, spread windows, the narrator's
 * script (shown as captions now, recorded as a voice-over later), named story beats, the end card,
 * chapters, easing helpers, the leaf-angle function (film time -> 7 leaf angles) and a wall-clock
 * Player. Everything here is pure except Player, which reads performance.now().
 *
 * Every other module (spreads, camera, titles, environment, audio) imports its times from here:
 * never hard-code a film time anywhere else. To retime the film for a recorded narration, edit
 * NARRATION / BEATS / SPREADS / LEAF_TURNS in this file only.
 *
 * Book: 7 leaves (0 = front cover, 1..5 inner boards, 6 = back cover, which never moves) and six
 * spreads k = 1..6; spread k lies between leaf k-1 and leaf k and opens while leaf k-1 turns.
 */
import { LEAVES } from './dims.js';

export const DURATION = 153;

export const COUPLE = {
  him: 'Brian',
  her: 'Marlin',
  names: 'Brian & Marlin',
  weddingDate: 'February 6, 2027',
  officialDate: 'February 7, 2024',
};

/** Leaf turns: leaf i rotates φ 0 -> π between start and end (film seconds). */
export const LEAF_TURNS = [
  { leaf: 0, start: 9.5, end: 12.5 },
  { leaf: 1, start: 38, end: 41 },
  { leaf: 2, start: 69.5, end: 72.5 },
  { leaf: 3, start: 84, end: 87 },
  { leaf: 4, start: 104, end: 107 },
  { leaf: 5, start: 120, end: 123 },
];

/** start = begins opening, open = fully open, close = begins closing, end = closed (null = never). */
export const SPREADS = [
  { k: 1, id: 'walmart', title: 'How we met', start: 9.5, open: 12.5, close: 38, end: 41 },
  { k: 2, id: 'dates', title: 'The “dates”', start: 38, open: 41, close: 69.5, end: 72.5 },
  { k: 3, id: 'official', title: 'February 7, 2024', start: 69.5, open: 72.5, close: 84, end: 87 },
  { k: 4, id: 'life', title: 'A life together', start: 84, open: 87, close: 104, end: 107 },
  { k: 5, id: 'proposal', title: 'The question', start: 104, open: 107, close: 120, end: 123 },
  { k: 6, id: 'wedding', title: 'February 6, 2027', start: 120, open: 123, close: null, end: null },
];

/**
 * The narrator's script. start/end = when the line is spoken (and its caption shown), in film
 * seconds; spread = the spread it belongs to (0 = the closed book / cover). He / she, never names.
 */
export const NARRATION = [
  { id: 'n01', start: 2.5, end: 4.9, spread: 0, text: 'Every love story starts somewhere.' },
  { id: 'n02', start: 5.4, end: 9.4, spread: 0, text: 'A ballroom. A beach. A café in Paris.' },
  { id: 'n03', start: 12.0, end: 14.2, spread: 1, text: 'Theirs started at Walmart.' },
  { id: 'n04', start: 15.0, end: 16.3, spread: 1, text: 'Yes, really.' },
  { id: 'n05', start: 17.5, end: 19.3, spread: 1, text: 'They were coworkers first.' },
  { id: 'n06', start: 19.8, end: 26.5, spread: 1, text: 'Then came the lunch breaks, full of talking, laughing, and arguing over who was going to pay.' },
  { id: 'n07', start: 27.0, end: 28.4, spread: 1, text: 'He always won.' },
  { id: 'n08', start: 29.3, end: 33.2, spread: 1, text: 'They talked so much they could never finish their food.' },
  { id: 'n09', start: 33.8, end: 37.2, spread: 1, text: "That's when they knew this was something different." },
  { id: 'n10', start: 42.0, end: 43.8, spread: 2, text: "It wasn't exactly simple." },
  { id: 'n11', start: 44.3, end: 49.2, spread: 2, text: 'There were strict parents, so a walk with the dog became a date.' },
  { id: 'n12', start: 49.8, end: 55.6, spread: 2, text: 'Her little sister came along on just about every outing, their most dedicated chaperone.' },
  { id: 'n13', start: 56.5, end: 62.6, spread: 2, text: 'Once, they chased down an Uber to rescue a lost phone, and called it an adventure.' },
  { id: 'n14', start: 63.6, end: 68.2, spread: 2, text: 'Then fate stepped in again, and sent them to the same school.' },
  { id: 'n15', start: 73.5, end: 78.6, spread: 3, text: 'On February 7th, 2024, they finally made it official.' },
  { id: 'n16', start: 79.8, end: 82.8, spread: 3, text: 'He still swears they were already dating.' },
  { id: 'n17', start: 88.0, end: 90.6, spread: 4, text: 'After that, the pages filled up fast.' },
  { id: 'n18', start: 91.4, end: 93.0, spread: 4, text: 'A first place together.' },
  { id: 'n19', start: 93.8, end: 95.4, spread: 4, text: 'A dog of their own.' },
  { id: 'n20', start: 96.2, end: 98.8, spread: 4, text: 'A home with both their names on it.' },
  { id: 'n21', start: 99.6, end: 102.2, spread: 4, text: 'And a trip all the way to Japan.' },
  { id: 'n22', start: 108.5, end: 113.4, spread: 5, text: "Then, on her birthday, he asked the one question he'd been saving." },
  { id: 'n23', start: 116.0, end: 117.6, spread: 5, text: 'She said yes.' },
  { id: 'n24', start: 124.5, end: 131.6, spread: 6, text: "Now they're getting married on February 6th, 2027, one day before their anniversary." },
  { id: 'n25', start: 132.4, end: 133.9, spread: 6, text: 'They love that date.' },
  { id: 'n26', start: 134.4, end: 136.0, spread: 6, text: 'Just not on a Sunday.' },
  { id: 'n27', start: 138.0, end: 140.8, spread: 6, text: 'From Walmart coworkers to forever.' },
  { id: 'n28', start: 141.6, end: 144.4, spread: 6, text: "We can't wait to celebrate with you." },
];

/** Named moments (film seconds). Spreads, camera, lights and score animate to these. */
export const BEATS = {
  // cover
  lampOn: 0.4,
  coverReveal: 1.5,
  // 1 · walmart
  walmartSign: 12.0,
  coworkers: 17.5,
  lunch: 19.8,
  payArgument: 23.0,
  heWins: 27.0,
  foodUntouched: 29.3,
  sparks: 33.8,
  // 2 · dates
  strictParents: 44.3,
  dogWalk: 45.5,
  sisterTagsAlong: 49.8,
  uberChaseStart: 56.5,
  phoneRescued: 61.0,
  sameSchool: 63.6,
  // 3 · official
  calendar: 73.5,
  official: 77.0,
  alreadyDating: 79.8,
  // 4 · life
  firstPlace: 91.4,
  dogOfTheirOwn: 93.8,
  home: 96.2,
  japan: 99.6,
  // 5 · proposal
  kneel: 108.5,
  question: 112.0,
  photoReveal: 114.3,
  yes: 116.0,
  // 6 · wedding + epilogue
  weddingDate: 124.5,
  notSunday: 134.4,
  walmartToForever: 138.0,
  celebrate: 141.6,
  endCard: 145.5,
  fadeOut: 150.5,
};

/** The closing card (names + date): appears at start, the picture fades from fadeStart to end. */
export const END_CARD = { start: 145.5, end: 153, fadeStart: 150.5 };

/** Scrubber chapters, derived: the cover, one per spread (from the moment it starts opening), the end card. */
export const CHAPTERS = [
  { t: 0, label: 'Cover' },
  ...SPREADS.map((s) => ({ t: s.start, label: s.title })),
  { t: END_CARD.start, label: 'See you there' },
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
 * Leaf angles [φ0..φ6] at film time t. φ6 (back cover) is always 0. Pass `out` (an array of ≥ 7
 * numbers) to fill and return it instead of allocating a new array (per-frame use).
 */
export function leafAngles(t, out = new Array(LEAVES).fill(0)) {
  out.fill(0, 0, LEAVES);
  for (const turn of LEAF_TURNS) {
    out[turn.leaf] = Math.PI * ease.inOutCubic(seg(t, turn.start, turn.end));
  }
  return out;
}

/** Opening angle α_k of spread k (1..6) for the given leaf angles. */
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
