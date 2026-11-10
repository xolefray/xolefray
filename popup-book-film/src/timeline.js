// Film timeline and the pure film-state function. Must NOT import three.js:
// Node tools (tools/smoke.mjs) import this module directly.
//
// Everything visual in the film is a pure function of getFilmState(t).

import { clamp, clamp01, ramp, smoothstep, envelope, easeInOutCubic } from './util.js';

export const FPS = 30;
export const FILM_TITLE = 'The Fox and the Paper Moon';
export const FILM_SUBTITLE = 'a pop-up film';

export const SPREADS = [
  { id: 'forest',   title: 'The Paper Forest',     caption: 'Deep in a paper forest, a small fox found a lantern with no light.' },
  { id: 'village',  title: 'The Sleeping Village', caption: 'She asked the sleeping village. Nobody had a spark to spare.' },
  { id: 'sea',      title: 'The Folded Sea',       caption: 'So she folded a boat, and sailed to where the lighthouse blinked.' },
  { id: 'mountain', title: 'The Last Mountain',    caption: 'Up the last cold mountain, the moon hung close enough to touch.' },
  { id: 'night',    title: 'Home',                 caption: 'She carried a sliver of moonlight home, and the whole forest glowed.' },
];

// ---------------------------------------------------------------------------
// THE editable segment table: [name, durationSeconds, extra]. Start times are
// accumulated, so changing one duration shifts everything after it.
// ---------------------------------------------------------------------------
const SEGMENT_TABLE = [
  ['intro',     7.0],
  ['coverOpen', 3.5],
  ['spread',    9.0, { index: 0 }],
  ['turn',      3.0, { index: 0, to: 1 }],
  ['spread',    9.0, { index: 1 }],
  ['turn',      3.0, { index: 1, to: 2 }],
  ['spread',    9.0, { index: 2 }],
  ['turn',      3.0, { index: 2, to: 3 }],
  ['spread',    9.0, { index: 3 }],
  ['turn',      3.0, { index: 3, to: 4 }],
  ['spread',   11.0, { index: 4 }],
  ['bookClose', 4.0],
  ['outro',     6.5],
];

// Other timed cues (seconds). Anything tied to a segment is derived from it below.
const CUES = {
  fadeIn: [0, 2],          // black overlay 1 -> 0
  fadeOutLen: 3,           // black overlay 0 -> 1 over the last 3 s (77-80)
  titleCard: [1, 2, 5, 6], // in 1-2, hold, out 5-6
  endCardIn: [0.5, 2.0],   // relative to outro start: in 74-75.5, hold to the end
  glowDelay: 3.0,          // lantern lights this long after spread 4 starts (61.5)
  glowLen: 2.5,            // ... ramping over 2.5 s (61.5-64)
};

/** Frozen list of segments: { name, index, to?, start, end, order }. */
export const SEGMENTS = (() => {
  let t = 0;
  return SEGMENT_TABLE.map(([name, dur, extra], order) => {
    const seg = { name, index: -1, ...(extra || {}), start: t, end: t + dur, order };
    t += dur;
    return Object.freeze(seg);
  });
})();

export const DURATION = SEGMENTS[SEGMENTS.length - 1].end; // 80

const segOf = (name, index) => SEGMENTS.find((s) => s.name === name && (index === undefined || s.index === index));
const COVER = segOf('coverOpen');
const CLOSE = segOf('bookClose');
const OUTRO = segOf('outro');
const SPREAD_SEGS = SPREADS.map((_, k) => segOf('spread', k));
const TURN_SEGS = SPREADS.slice(1).map((_, k) => segOf('turn', k)); // TURN_SEGS[k]: k -> k+1

/** Time at which spread k starts opening. */
const SPREAD_OPEN_START = SPREADS.map((_, k) => (k === 0 ? COVER.start : TURN_SEGS[k - 1].start));

/** Representative frame times covering every segment, including mid-turns. */
export const SHOT_TIMES = [
  1.0,                                  // intro, fading in, closed book
  4.0,                                  // intro, title card
  COVER.start + 1.75,                   // cover mid-open (8.75)
  SPREAD_SEGS[0].start + 4,             // forest open (14.5)
  TURN_SEGS[0].start + 1.5,             // turn 0->1, leaf near vertical (21)
  SPREAD_SEGS[1].start + 4,             // village (26.5)
  TURN_SEGS[1].start + 0.9,             // turn 1->2, early (32.4)
  SPREAD_SEGS[2].start + 4,             // sea (38.5)
  TURN_SEGS[2].start + 2.1,             // turn 2->3, late (45.6)
  SPREAD_SEGS[3].start + 4,             // mountain (50.5)
  TURN_SEGS[3].start + 1.5,             // turn 3->4, half night (57)
  SPREAD_SEGS[4].start + 2,             // night, lantern unlit (60.5)
  SPREAD_SEGS[4].start + 8,             // night, lantern glowing (66.5)
  CLOSE.start + 2,                      // book closing (71.5)
  OUTRO.start + 2,                      // end card (75.5)
  DURATION - 0.5,                       // fading out (79.5)
].map((x) => Math.round(x * 100) / 100);

/** The segment containing time t (clamped to the film). */
export function segmentAt(t) {
  t = clamp(t, 0, DURATION);
  for (const s of SEGMENTS) if (t < s.end) return s;
  return SEGMENTS[SEGMENTS.length - 1];
}

/** Eased turn (0..1) of leaf j (0..4) at time t. */
function leafTurnAt(j, t) {
  const turnSeg = j === 0 ? COVER : TURN_SEGS[j - 1];
  const opened = easeInOutCubic(ramp(t, turnSeg.start, turnSeg.end));
  const closing = easeInOutCubic(ramp(t, CLOSE.start, CLOSE.end));
  return opened * (1 - closing);
}

/**
 * The complete film state at time t. Pure: same t -> same object contents.
 * See ARCHITECTURE.md for field meanings.
 */
export function getFilmState(t) {
  t = clamp(Number.isFinite(t) ? t : 0, 0, DURATION);
  const seg = segmentAt(t);
  const segT = ramp(t, seg.start, seg.end);

  const leafTurn = [];
  for (let j = 0; j < 5; j++) leafTurn.push(leafTurnAt(j, t));

  const spreadOpen = [];
  for (let k = 0; k < 5; k++) spreadOpen.push(clamp01(leafTurn[k] - (k + 1 < 5 ? leafTurn[k + 1] : 0)));

  let activeSpread = -1;
  let best = 0.001;
  for (let k = 0; k < 5; k++) if (spreadOpen[k] > best) { best = spreadOpen[k]; activeSpread = k; }

  const spreadTime = SPREAD_OPEN_START.map((s) => Math.max(0, t - s));

  const segment = { name: seg.name, index: seg.index, start: seg.start, end: seg.end };
  if (seg.to !== undefined) segment.to = seg.to;

  const fade = Math.max(
    1 - smoothstep(CUES.fadeIn[0], CUES.fadeIn[1], t),
    smoothstep(DURATION - CUES.fadeOutLen, DURATION, t),
  );
  const [ti0, ti1, to0, to1] = CUES.titleCard;
  const titleCard = envelope(t, ti0, ti1, to0, to1);
  const endCard = smoothstep(OUTRO.start + CUES.endCardIn[0], OUTRO.start + CUES.endCardIn[1], t);
  const night = smoothstep(TURN_SEGS[3].start, TURN_SEGS[3].end, t);
  const glowStart = SPREAD_SEGS[4].start + CUES.glowDelay;
  const glow = smoothstep(glowStart, glowStart + CUES.glowLen, t);

  return {
    t, duration: DURATION,
    segment, segT,
    leafTurn, spreadOpen, activeSpread, spreadTime,
    fade, titleCard, endCard, night, glow,
  };
}
