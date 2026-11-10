// The score of "The Fox and the Paper Moon": a deterministic list of sound
// events in film time. Pure (no Web Audio here): built once, from the seeded
// rng only, so every playthrough and every offline render is identical.
//
// Key F major, 3/4 at 60 bpm: one beat = 1 s, one bar = 3 s. The bar grid is
// anchored at 1.5 s so every spread hold and page turn starts on a downbeat
// (10.5, 19.5, 22.5, ... 58.5). The theme is 8 bars (24 s); each spread
// hears part of it, transformed:
//   intro     the first four notes alone on a music box (being wound)
//   forest    bars 1-4, music box, simple and curious
//   village   bars 5-8, low celesta, sparse and sleepy, a distant clock bell
//   sea       bars 1-4 again over minor harmony and rolling harp arpeggios
//   mountain  the head notes, glassy and far; the sliver's bell glissando
//   night     bars 1-2 + 7-8 in full, warm and wide, the cadence under The End
//
// Event: { t, dur, v, bus?, pan?, ...params }. `t` is the film time the event
// starts, `dur` the total time it sounds (including release), `v` the voice
// name in synth.js.

import { rng } from '../util.js';
import { SEGMENTS } from '../timeline.js';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'Bb4' -> MIDI number. */
export function midi(name) {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + acc;
}
export const hz = (n) => 440 * Math.pow(2, ((typeof n === 'string' ? midi(n) : n) - 69) / 12);

const BEAT = 1.0;
const BAR = 3 * BEAT;
const GRID0 = 1.5;
/** Film time of beat `beat` of the bar that starts at `barStart`. */
const at = (barStart, beat) => barStart + beat * BEAT;

const seg = (name, index) => SEGMENTS.find((s) => s.name === name && (index === undefined || s.index === index));
const TURNS = [0, 1, 2, 3].map((k) => seg('turn', k));
const COVER = seg('coverOpen');
const CLOSE = seg('bookClose');

// The theme, in beats from its first downbeat: [beat, note, beats].
const THEME = [
  [0, 'A4', 1], [1, 'C5', 1], [2, 'F5', 1],
  [3, 'E5', 2], [5, 'D5', 1],
  [6, 'C5', 1], [7, 'D5', 1], [8, 'Bb4', 1],
  [9, 'A4', 3],
  [12, 'G4', 1], [13, 'A4', 1], [14, 'Bb4', 1],
  [15, 'C5', 2], [17, 'A4', 1],
  [18, 'G4', 1], [19, 'E4', 1], [20, 'G4', 1],
  [21, 'F4', 3],
];
const up = (n, oct) => midi(n) + 12 * oct;
const themeBar = (b) => THEME.filter(([beat]) => beat >= 3 * b && beat < 3 * b + 3).map(([beat, n, len]) => [beat - 3 * b, n, len]);

export function buildScore() {
  const R = rng(20240611);
  const jit = (a) => (R() * 2 - 1) * a;
  const ev = [];
  const add = (e) => { ev.push(e); return e; };

  // --- instrument helpers ------------------------------------------------------
  const mbox = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 3.4, v: 'mbox', f: hz(n), vel, pan: o.pan ?? 0, bus: o.bus });
  const cel = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 3.6, v: 'celesta', f: hz(n), vel, pan: o.pan ?? 0, bus: o.bus });
  const bass = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 2.6, v: 'bass', f: hz(n), vel });
  const harp = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 2.4, v: 'harp', f: hz(n), vel, pan: o.pan ?? 0 });
  const bell = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 2.8, v: 'bell', f: typeof n === 'number' ? n : hz(n), vel, pan: o.pan ?? 0, bus: o.bus ?? 'far' });
  const glass = (t, n, vel = 1, o = {}) => add({ t, dur: o.dur ?? 5.0, v: 'glass', f: hz(n), vel, pan: o.pan ?? 0 });
  /** Pad chord: rises over `a`, holds until `len`, releases over `r`. */
  const pad = (t, notes, len, o = {}) => add({
    t, dur: len + (o.r ?? 2), v: 'pad', fs: notes.map(hz), level: o.level ?? 1,
    a: o.a ?? 1.5, len, r: o.r ?? 2, cut: o.cut ?? 1100, cut2: o.cut2 ?? o.cut ?? 1100, bus: o.bus,
  });

  // --- foley helpers -------------------------------------------------------------
  /** Papery page-turn whoosh; pan travels with the leaf (right -> left). */
  function whoosh(t, len, o = {}) {
    // jagged rustle envelope (paper crackle), relative to the whoosh start
    const rustle = [[0, 0.0001]];
    const n = Math.round(len * 14);
    for (let i = 1; i < n; i++) {
      const x = i / n;
      const shape = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5;
      rustle.push([x * len, Math.max(0.0001, shape * (0.25 + 0.75 * R() ** 2))]);
    }
    rustle.push([len, 0.0001]);
    add({ t, dur: len + 0.1, v: 'whoosh', len, peak: o.peak ?? 0.5, vel: o.vel ?? 1,
      pan0: o.pan0 ?? 0.45, pan1: o.pan1 ?? -0.45, f0: o.f0 ?? 350, f1: o.f1 ?? 1800, rustle, bus: 'foley' });
  }
  /** Soft flutter of tiny pops as pieces stand up. */
  function pops(t0, t1, count, vel = 1) {
    for (let i = 0; i < count; i++) {
      const x = (i + 0.5 + jit(0.35)) / count;
      add({ t: t0 + x * (t1 - t0), dur: 0.12, v: 'pop', vel: vel * (0.55 + 0.45 * R()), f: 1500 + 1600 * R(), pan: jit(0.6), bus: 'foley' });
    }
  }
  function pageTurn(turnSeg, popsCount = 9) {
    const t = turnSeg.start;
    whoosh(t + 0.35, 2.4, { peak: 0.5 });
    pops(t + 1.65, t + 2.85, popsCount);
  }

  // ===========================================================================
  // INTRO 0-7: silence, a winding ratchet, a pad swell, the first four notes.
  // ===========================================================================
  for (let i = 0; i < 11; i++) {
    add({ t: 1.05 + i * 0.115 + jit(0.008), dur: 0.08, v: 'tick', vel: 0.5 + 0.5 * (i % 2), f: 2600 + 300 * (i % 3), bus: 'foley' });
  }
  pad(1.4, ['F3', 'A3', 'C4'], 8.6, { a: 4.0, r: 2.5, level: 0.8, cut: 600, cut2: 1000 });
  mbox(3.0, 'A5', 0.5);
  mbox(3.85, 'C6', 0.46);
  mbox(4.8, 'F6', 0.46);
  mbox(6.1, 'E6', 0.44, { dur: 4.0 });

  // ===========================================================================
  // COVER OPEN 7-10.5: creak, whoosh, a rising harp run into the forest.
  // ===========================================================================
  {
    const pts = [[0, 26]];
    for (let i = 1; i <= 12; i++) pts.push([i * 0.11, 18 + 34 * R() + i * 2]);
    add({ t: COVER.start + 0.05, dur: 1.45, v: 'creak', len: 1.35, rate: pts, vel: 0.9, bus: 'foley' });
  }
  whoosh(COVER.start + 0.45, 2.9, { peak: 0.6, pan0: 0.35, pan1: -0.35, vel: 0.9 });
  {
    const run = ['F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5', 'A5', 'C6', 'F6'];
    let t = 9.0;
    run.forEach((n, i) => {
      harp(t, n, 0.55 + i * 0.04, { pan: -0.3 + i * 0.07 });
      t += 0.19 - i * 0.008;
    });
  }
  pops(9.35, 10.4, 7, 0.9);

  // ===========================================================================
  // FOREST 10.5-22.5 (incl. turn 0->1): theme bars 1-4, music box.
  // ===========================================================================
  const FOREST = 10.5;
  const forestChords = [['F3', 'A3', 'C4'], ['E3', 'A3', 'C4'], ['F3', 'Bb3', 'D4'], ['F3', 'A3', 'C4']];
  const forestBass = [['F2', 'C3'], ['A2', 'E3'], ['Bb2', 'F3'], ['F2', 'C3']];
  for (let b = 0; b < 4; b++) {
    const bs = FOREST + b * BAR;
    for (const [beat, n, len] of themeBar(b)) mbox(at(bs, beat), up(n, 1), 0.7, { dur: 2.6 + len * 0.5 });
    pad(bs - 0.4, forestChords[b], BAR + 0.6, { a: 1.2, r: 1.6, level: 0.7, cut: 900 });
    bass(bs, forestBass[b][0], 0.9);
    if (b < 3) bass(at(bs, 2), forestBass[b][1], 0.45, { dur: 1.6 });
  }
  // a little celesta answer in the held bar
  cel(at(FOREST + 3 * BAR, 1.5), 'C5', 0.35);
  cel(at(FOREST + 3 * BAR, 2.0), 'F5', 0.3);
  // birds
  for (const [t0, k] of [[13.15, 3], [17.35, 2]]) {
    for (let i = 0; i < k; i++) {
      add({ t: t0 + i * 0.17 + jit(0.02), dur: 0.16, v: 'chirp', vel: 0.8 - i * 0.12, f0: 2700 + 500 * R(), f1: 4300 + 600 * R(), pan: 0.5 + jit(0.1), bus: 'far' });
    }
  }
  pageTurn(TURNS[0]);

  // ===========================================================================
  // VILLAGE 22.5-34.5 (incl. turn 1->2): theme bars 5-8, sparse and sleepy.
  // ===========================================================================
  const VILLAGE = 22.5;
  const villageMel = [
    [[0, 'G4', 2], [2, 'Bb4', 1]],
    [[0, 'C5', 2], [2, 'A4', 1]],
    [[0, 'G4', 1.5], [1.5, 'E4', 0.5], [2, 'G4', 1]],
    [[0, 'F4', 3]],
  ];
  const villageChords = [['G3', 'Bb3', 'D4'], ['F3', 'A3', 'C4'], ['E3', 'G3', 'C4'], ['F3', 'A3', 'C4']];
  const villageBass = ['G2', 'F2', 'C2', 'F2'];
  for (let b = 0; b < 4; b++) {
    const bs = VILLAGE + b * BAR;
    for (const [beat, n, len] of villageMel[b]) cel(at(bs, beat), n, 0.65, { dur: 3.0 + len * 0.6 });
    pad(bs - 0.6, villageChords[b], BAR + 0.6, { a: 1.6, r: 2.0, level: 0.6, cut: 750 });
    if (b !== 1) bass(bs, villageBass[b], 0.7, { dur: 3.0 });
  }
  // sleepy echo, high and soft
  mbox(at(VILLAGE + BAR, 1.5), 'C6', 0.25);
  mbox(at(VILLAGE + 3 * BAR, 1.5), 'A5', 0.22);
  // distant clock bell, once
  add({ t: 27.0, dur: 6.0, v: 'clockbell', f: hz('F4'), vel: 1.3, pan: -0.35, bus: 'far' });
  pageTurn(TURNS[1]);

  // ===========================================================================
  // SEA 34.5-46.5 (incl. turn 2->3): rolling arpeggios, surf, lighthouse tones.
  // ===========================================================================
  const SEA = 34.5;
  const seaChords = [
    { pad: ['D3', 'F3', 'A3'], arp: ['D3', 'A3', 'D4', 'F4', 'A4'], bass: 'D2' },
    { pad: ['E3', 'A3', 'C4'], arp: ['A2', 'E3', 'A3', 'C4', 'E4'], bass: 'A1' },
    { pad: ['F3', 'Bb3', 'D4'], arp: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'], bass: 'Bb1' },
    { pad: ['F3', 'A3', 'C4'], arp: ['F2', 'C3', 'F3', 'A3', 'C4'], bass: 'F2' },
  ];
  const ARP = [0, 1, 2, 3, 4, 3];
  for (let b = 0; b < 4; b++) {
    const bs = SEA + b * BAR;
    const C = seaChords[b];
    pad(bs - 0.5, C.pad, BAR + 0.5, { a: 1.2, r: 1.8, level: 0.55, cut: 800 });
    bass(bs, C.bass, 0.85, { dur: 3.0 });
    const fade = b === 3 ? 0.6 : 1;
    ARP.forEach((idx, i) => harp(bs + i * 0.5, C.arp[idx], (i === 0 ? 0.62 : 0.48) * fade, { pan: (i % 2 ? 0.18 : -0.18) }));
    for (const [beat, n, len] of themeBar(b)) cel(at(bs, beat), up(n, 1), 0.7, { dur: 2.8 + len * 0.5 });
  }
  // surf: breathing in and out with the rows of the paper sea (3.6 s period)
  for (let i = 0, t = 33.6; t < 45.5; i++, t += 3.6) {
    const edge = Math.min(1, (t - 33.0) / 2.5, (46.4 - t) / 3.0);
    add({ t, dur: 4.6, v: 'surf', len: 4.6, vel: Math.max(0.25, edge) * (0.85 + 0.3 * R()), pan: i % 2 ? 0.25 : -0.25, off: R() * 3, bus: 'near' });
  }
  // lighthouse: flashes at t = 2.5 n (sea.js: phase01(t, 2.5, 0.5)); a soft low tone under each
  for (const t of [35, 37.5, 40, 42.5]) {
    const bi = Math.floor((t - SEA) / BAR);
    add({ t: t - 0.35, dur: 2.4, v: 'tone', f: hz(seaChords[bi].bass) * 2, vel: 0.9, peakAt: 0.35 });
  }
  pageTurn(TURNS[2]);

  // ===========================================================================
  // MOUNTAIN 46.5-58.5 (incl. turn 3->4): high, cold, wind; the sliver falls.
  // ===========================================================================
  pad(46.0, ['D3', 'A3', 'E4'], 6.0, { a: 2.0, r: 2.2, level: 0.8, cut: 650, cut2: 500 });
  bass(46.5, 'D2', 0.5, { dur: 4.0 });
  glass(47.4, 'A5', 1.5, { pan: -0.25 });
  glass(48.9, 'C6', 1.35, { pan: 0.2 });
  glass(50.3, 'F6', 1.3, { pan: -0.1 });
  glass(51.3, 'E6', 1.2, { pan: 0.3, dur: 4.5 });
  // wind: overlapping gusts of band-passed noise
  for (let t = 45.6; t < 56.0; t += 2.6 + R() * 0.8) {
    const edge = Math.min(1, (t - 45.0) / 2.0, (57.0 - t) / 2.5);
    add({ t, dur: 5.2, v: 'wind', len: 5.2, vel: Math.max(0.2, edge) * (1.25 + 0.7 * R()), f0: 450 + 300 * R(), f1: 900 + 500 * R(), pan: jit(0.5), off: R() * 3, bus: 'near' });
  }
  // the sliver comes loose at 52.0, flies 52.45-54.15 into the lantern
  {
    const gl = ['C7', 'Bb6', 'A6', 'G6', 'F6', 'E6', 'D6', 'C6', 'Bb5', 'A5', 'G5', 'F5'];
    bell(52.0, 'F6', 0.35, { pan: -0.05 });          // a tiny "tink" as it comes loose
    const T0 = 52.45, T1 = 54.0;
    gl.forEach((n, i) => {
      const x = i / (gl.length - 1);
      const t = T0 + (T1 - T0) * (0.85 * x + 0.15 * x * x);
      bell(t, n, 0.62 - 0.012 * i, { pan: 0.05 + 0.3 * x, dur: 2.4, bus: 'near' });
    });
    // lands warm as the lantern starts to glow
    cel(54.15, 'A4', 0.85, { dur: 4.2 });
    mbox(54.15, 'F5', 0.4, { dur: 3.5 });
    bass(54.15, 'F2', 0.6, { dur: 3.5 });
    pad(53.9, ['F3', 'A3', 'C4', 'F4'], 2.6, { a: 0.8, r: 2.6, level: 0.75, cut: 900, cut2: 1300 });
  }
  pageTurn(TURNS[3]);

  // ===========================================================================
  // NIGHT 58.5-69.5: hushed; the glow (61.5-64) brings the theme back in full;
  // star sparkles climb as the cascade ignites the forest (to ~67).
  // ===========================================================================
  pad(57.4, ['D3', 'F3', 'A3'], 4.5, { a: 2.2, r: 1.8, level: 0.85, cut: 520 });
  bass(58.5, 'D2', 0.55, { dur: 3.5 });
  cel(59.4, 'A4', 0.32);
  cel(60.4, 'C5', 0.28);
  // crickets, very soft, fading as the glow rises
  for (let t = 58.7; t < 62.6; t += 0.55 + R() * 0.4) {
    const edge = Math.min(1, (t - 58.4) / 1.0, (63.0 - t) / 1.2);
    add({ t, dur: 0.3, v: 'cricket', f: 4300 + 400 * R(), vel: 0.6 * edge * (0.6 + 0.4 * R()), pan: 0.6 * (R() * 2 - 1), bus: 'far' });
  }
  // the glow: suspension swelling into the downbeat at 64.5
  pad(61.4, ['Bb2', 'F3', 'C4', 'D4'], 1.8, { a: 1.4, r: 1.2, level: 0.75, cut: 650, cut2: 1100 });
  pad(62.9, ['C3', 'F3', 'G3', 'C4'], 1.5, { a: 0.8, r: 1.0, level: 0.85, cut: 1000, cut2: 1500 });
  bass(61.5, 'Bb1', 0.65, { dur: 2.0 });
  bass(63.0, 'C2', 0.7, { dur: 2.0 });
  {
    const rise = ['C4', 'F4', 'G4', 'A4', 'C5', 'F5', 'G5', 'A5', 'C6'];
    rise.forEach((n, i) => harp(63.25 + i * 0.13, n, 0.35 + i * 0.035, { pan: -0.3 + i * 0.075 }));
  }
  // star sparkles: one per igniting star (night.js: stars light 62.4 + d, d >= 1.2 + 0.16 i)
  {
    const sp = ['C6', 'D6', 'F6', 'G6', 'A6', 'C7', 'D7', 'F6', 'A6', 'C7', 'D7', 'F7', 'G6', 'C7', 'F7'];
    sp.forEach((n, i) => {
      const t = 63.6 + i * 0.235 + jit(0.04);
      bell(t, n, 0.4 + 0.12 * R(), { pan: jit(0.75), dur: 2.4 });
    });
  }
  const PEAK = 64.5;
  // bar 1 of the theme, full: celesta + music box an octave up, harp rolling
  const nightBars = [
    { mel: themeBar(0), pad: ['F2', 'C3', 'A3', 'C4', 'F4'], arp: ['F3', 'C4', 'F4', 'A4', 'C5'], bass: ['F1', 'C2'], cut: 1500 },
    { mel: themeBar(1), pad: ['A2', 'E3', 'G3', 'C4', 'E4'], arp: ['A3', 'E4', 'A4', 'C5', 'E5'], bass: ['A1', 'E2'], cut: 1400 },
    { mel: themeBar(6), pad: ['C3', 'E3', 'G3', 'Bb3'], arp: null, bass: ['C2', 'G2'], cut: 1000 },
  ];
  nightBars.forEach((B, b) => {
    const bs = PEAK + b * BAR;
    const v = b < 2 ? 1 : 0.55;
    for (const [beat, n, len] of B.mel) {
      cel(at(bs, beat), n, 1.15 * v, { dur: 3.0 + len * 0.6 });
      mbox(at(bs, beat), up(n, 1), 0.7 * v, { dur: 2.6 + len * 0.5 });
    }
    pad(bs - 0.5, B.pad, BAR + 0.5, { a: b === 0 ? 0.6 : 1.2, r: 2.0, level: b < 2 ? 1.6 : 0.7, cut: B.cut });
    bass(bs, B.bass[0], 1.0 * v, { dur: 3.0 });
    bass(at(bs, 2), B.bass[1], 0.45 * v, { dur: 1.6 });
    if (B.arp) ARP.forEach((idx, i) => harp(bs + i * 0.5, B.arp[idx], 0.65, { pan: (i % 2 ? 0.3 : -0.3) }));
  });
  // a gentle descending arp as the book begins to close
  ['C5', 'G4', 'E4', 'C4'].forEach((n, i) => harp(70.5 + 0.6 + i * 0.35, n, 0.3 - i * 0.03, { pan: 0.2 - i * 0.12 }));

  // ===========================================================================
  // BOOK CLOSE 69.5-73.5 and OUTRO: whoosh, thump, the cadence, ring-out.
  // ===========================================================================
  whoosh(CLOSE.start + 0.8, 2.7, { peak: 0.55, pan0: -0.35, pan1: 0.3, vel: 0.85, f0: 250, f1: 1300 });
  add({ t: 73.3, dur: 1.2, v: 'thump', vel: 1, bus: 'foley' });
  const END = 73.5;
  cel(END, 'F4', 0.6, { dur: 5.2 });
  mbox(END, 'F5', 0.35, { dur: 4.2 });
  bass(END, 'F2', 0.6, { dur: 4.5 });
  pad(END - 0.3, ['F2', 'C3', 'F3', 'A3', 'C4'], 1.6, { a: 0.6, r: 4.2, level: 0.6, cut: 900, cut2: 650 });
  // the music box winds down: the first notes once more, slower, softer
  mbox(75.6, 'A5', 0.42, { dur: 2.6 });
  mbox(76.55, 'C6', 0.36, { dur: 2.3 });
  mbox(77.7, 'F6', 0.3, { dur: 1.75 });

  ev.sort((a, b) => a.t - b.t || (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  return ev;
}

export const SCORE_INFO = { key: 'F major', bpm: 60, metre: '3/4', BAR, GRID0 };
