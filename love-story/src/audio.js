/**
 * audio.js — procedural score and paper foley for "Our Love Story".
 *
 * Everything is synthesized with WebAudio and is deterministic in film time. Times come from
 * timeline.js (SPREADS, LEAF_TURNS, BEATS, NARRATION, END_CARD, DURATION); nothing here
 * hard-codes a film time that the schedule already names.
 *
 *  SCORE   One 4-bar love theme in F major, 3/4 — sol–ti–do, held, then a walk home —
 *          returns in every chapter in a new setting: sparse bells on the cover, pizzicato
 *          at the store, a stroll on the dates, a plain statement when they make it official,
 *          a layer added at each step of their life, a hush then the fullest statement on
 *          "yes", and a broad golden wedding. The theme is data: [beat, midi, beats, vel].
 *  FOLEY   Lamp click, cover creak and soft thump, a paper whoosh and a lock-flap on every
 *          page turn, a shutter at the proposal photo, a confetti pop on "yes", a stamp when
 *          the calendar is marked.
 *  NARRATION  If window.__NARRATION_URL is set, or audio/narration.(mp3|m4a|wav) can be
 *          fetched, it is decoded and played locked to film time (seeks and pauses restart
 *          it at the right offset). The music bus then ducks 6 dB under each NARRATION line
 *          with 0.25 s ramps. No file: no duck, no error, no throw.
 *  ENGINE  A Session maps film time to AudioContext time and pumps a sorted event list a
 *          little ahead of the playhead. sync(t, playing) seeks by fading the session out
 *          and starting a fresh one. renderOffline() runs the same Session in an
 *          OfflineAudioContext; pass { duck: true } to print the narration envelope with
 *          no audio file, and { layers } to solo music or foley.
 *  GRAPH   Per session, music (dry + its reverb) → music gain (duck) → session env →
 *          session out; foley and narration join at the session env, so only the music
 *          ducks. Sessions sum into master gain (mute ramp) → high-pass → gentle
 *          compressor → trim → destination. The score is voiced so the music+foley peak
 *          stays at or under −3 dBFS.
 *
 * If AudioContext is unavailable every method is a silent no-op; no method ever throws.
 */
import { BEATS, DURATION, END_CARD, LEAF_TURNS, NARRATION, SPREADS, ease } from './timeline.js';
import { makeRng, mulberry32 } from './util/rng.js';

const LOOKAHEAD = 0.25; // film seconds scheduled ahead of the playhead
const SEEK_TOLERANCE = 0.3; // |t − expected| above this is a seek
const SETTLE = 0.08; // seconds of steady playback before a new session starts (scrubbing)
const STOP_FADE = 0.06; // fade-out of a stopped session, seconds
const OFFLINE_STEP = 1; // offline renders pump events one second at a time

const DUCK_DB = 6;
const DUCK_GAIN = 10 ** (-DUCK_DB / 20); // ≈ 0.501
const DUCK_RAMP = 0.25;

// Instrument levels (linear), into a gentle compressor and a trim. Tuned so the full mix
// (music + foley, no narration file) peaks under −3 dBFS and the body of the music sits
// well below where a voice-over will land.
const LEVEL = {
  bell: 0.17,
  chime: 0.095,
  pluck: 0.15,
  koto: 0.11,
  pad: 0.034,
  bass: 0.13,
  voice: 0.5,
  whoosh: 0.62,
  flap: 0.42,
  click: 0.55,
  creak: 0.42,
  thump: 0.34,
  rustle: 0.48,
  shutter: 0.58,
  pop: 0.4,
  stamp: 0.46,
};

const FOLEY = new Set(['click', 'creak', 'whoosh', 'flap', 'thump', 'rustle', 'shutter', 'pop', 'stamp']);

// ---------------------------------------------------------------------------------------------
// Score — the love theme and the chords it travels through
// ---------------------------------------------------------------------------------------------

/** Chord voicings, low to high. Index 0 is the bass note; 1..4 feed the pad. */
const CHORDS = {
  F: [53, 60, 65, 69, 72],
  Fmaj7: [53, 60, 64, 69, 72],
  Fsus2: [53, 60, 65, 67, 72],
  Dm: [50, 57, 62, 65, 69],
  Bb: [46, 58, 62, 65, 70],
  C: [48, 55, 60, 64, 67],
  C7: [48, 55, 58, 64, 70],
  Am: [45, 52, 57, 60, 64],
  G: [43, 50, 55, 59, 62],
  G7: [43, 50, 53, 59, 65],
};

/**
 * The 4-bar love theme in F, 3/4. Scale degrees 5–7–1 | 1—— 6 | 5 4 3 | 2—— 1.
 * Each row is [beat, midi, duration in beats, velocity multiplier].
 */
const THEME = [
  [0, 72, 1, 1],
  [1, 76, 0.5, 0.9],
  [1.5, 77, 1.5, 1],
  [3, 77, 2, 1.05],
  [5, 74, 1, 0.92],
  [6, 72, 1, 0.88],
  [7, 70, 1, 0.84],
  [8, 69, 1, 0.9],
  [9, 67, 2, 1],
  [11, 65, 1, 0.82],
];

/** Same theme, but the last note lands high — the joyful cadence on "yes". */
const THEME_JOY = THEME.map((n) => (n[0] === 11 ? [11, 77, 0.85, 1.12] : n.slice()));

/** I–vi–IV–V, with the tonic returning under the final step so the phrase cadences. */
const LOVE = [
  [0, 'F', 3, 1],
  [3, 'Dm', 3, 0.96],
  [6, 'Bb', 3, 0.94],
  [9, 'C7', 2, 1],
  [11, 'F', 1.2, 1],
];

const PLAY = [
  [0, 'F', 3, 0.72],
  [3, 'Bb', 3, 0.68],
  [6, 'F', 3, 0.72],
  [9, 'C', 3, 0.76],
];

const LIFT = [
  [0, 'C', 3, 1],
  [3, 'Am', 3, 0.96],
  [6, 'F', 3, 1],
  [9, 'G7', 3, 1],
];

const WARM = [
  [0, 'Fmaj7', 3, 1],
  [3, 'Bb', 3, 0.96],
  [6, 'Dm', 3, 0.94],
  [9, 'C', 3, 1],
];

/** Second life statement: opens onto a sus2 so the koto's G has a home. */
const LIFE2 = [
  [0, 'F', 3, 1],
  [3, 'Fsus2', 3, 0.98],
  [6, 'C', 3, 0.94],
  [9, 'F', 3, 1],
];

const spread = (id) => SPREADS.find((s) => s.id === id);

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function layerOf(type) {
  if (type === 'fade') return 'master';
  return FOLEY.has(type) ? 'foley' : 'music';
}

function push(out, type, t, props) {
  if (!Number.isFinite(t) || t < -0.05 || t >= DURATION) return;
  out.push({ type, t, layer: layerOf(type), ...props });
}

function chordAt(chords, beat) {
  let name = chords[0][1];
  for (const [b, c] of chords) if (b <= beat + 1e-6) name = c;
  return name;
}

/**
 * One statement (or a clipped prefix) of the love theme plus its waltz.
 * `lead` is 'bell' | 'pluck' | 'chime'. Waltz "pah-pah" uses `arp`.
 */
function placeTheme(out, rng, o) {
  const {
    start, bpm, transpose = 0, vel = 0.6, lead = 'bell', ring = 1, wet = 0.3,
    pan = 0.14, toBeat = 12, melody = THEME, progression = LOVE,
    waltz = true, bass = true, pad = true,
    padVel = 0.4, bassVel = 0.5, arpVel = 0.3,
    padCutoff = 1200, padAttack = 0.8, padRelease = 1.4,
    bounce = false, decay = 0.14, arp = 'pluck', arpWet = 0.16,
  } = o;
  const spb = 60 / bpm;
  const at = (beat) => start + beat * spb;
  const jitter = () => (rng ? rng.range(-0.005, 0.005) : 0);
  const style = { attack: padAttack, release: padRelease, cutoff: padCutoff };

  for (const [beat, midi, dur, mv] of melody) {
    if (beat >= toBeat - 1e-6) continue;
    const t = at(beat) + jitter();
    const v = vel * mv;
    if (lead === 'pluck') {
      push(out, 'pluck', t, { midi: midi + transpose, vel: v, pan, wet: Math.min(wet, 0.2), decay, role: 'lead' });
    } else if (lead === 'chime') {
      push(out, 'chime', t, { midi: midi + transpose, vel: v, pan, wet, ring, role: 'lead' });
    } else {
      const sung = clamp(0.65 + 0.18 * dur * spb, 0.7, 1.25) * ring;
      push(out, 'bell', t, { midi: midi + transpose, vel: v, pan, wet, ring: sung, role: 'lead' });
    }
  }

  if (pad) {
    for (const [beat, name, dur, mv] of progression) {
      if (beat >= toBeat - 1e-6) continue;
      const dBeats = Math.min(dur, toBeat - beat);
      if (dBeats < 0.35) continue;
      const tones = CHORDS[name];
      const seconds = dBeats * spb;
      push(out, 'pad', at(beat), {
        dur: seconds, len: seconds, sustain: true, vel: padVel * mv, wet: Math.max(wet, 0.28),
        notes: tones.slice(1, 5),
        bass: tones[0] >= 48 ? tones[0] - 12 : tones[0],
        attack: Math.min(style.attack, seconds * 0.55),
        release: style.release,
        cutoff: style.cutoff,
        role: 'pad',
      });
    }
  }

  const endBeat = toBeat;
  for (let bar = 0; bar * 3 < endBeat - 1e-3 && bar < 8; bar++) {
    const b0 = bar * 3;
    const name = chordAt(progression, b0);
    const tones = CHORDS[name];
    if (bass && b0 < endBeat) {
      push(out, 'bass', at(b0) + jitter(), {
        midi: tones[0], vel: bassVel, decay: bounce ? 0.13 : 0.26, role: 'bass',
      });
    }
    if (bounce && b0 + 2 < endBeat) {
      push(out, 'bass', at(b0 + 2) + jitter(), {
        midi: tones[0] + 12, vel: bassVel * 0.55, decay: 0.1, role: 'bass',
      });
    }
    const stab = (beat, midi, v) => {
      if (beat >= endBeat) return;
      if (arp === 'bell') {
        push(out, 'bell', at(beat) + jitter(), {
          midi, vel: v, pan: -0.22, wet: arpWet, ring: 0.55, role: 'arp',
        });
      } else {
        push(out, 'pluck', at(beat) + jitter(), {
          midi, vel: v, pan: -0.22, wet: arpWet, decay: decay * 0.9, role: 'arp',
        });
      }
    };
    if (waltz) {
      stab(b0 + 1, tones[2], arpVel);
      stab(b0 + 2, tones[Math.min(3, tones.length - 1)], arpVel * 0.92);
    }
  }
}

/** Repeat the theme from t0 until t1, clipping the last statement to what fits. */
function fillThemes(out, rng, spec, t0, t1) {
  const spb = 60 / spec.bpm;
  let t = t0;
  for (let guard = 0; guard < 8 && t + 0.5 < t1; guard++) {
    const beatsLeft = (t1 - t) / spb;
    const toBeat = Math.min(12, beatsLeft);
    if (toBeat < 1.6) break;
    placeTheme(out, rng, { ...spec, start: t, toBeat });
    t += toBeat * spb;
  }
}

/** Extra lead notes at `semi` semitones, for events that start at or after `fromT`. */
function doubleFrom(events, fromT, semi, velScale) {
  const extra = [];
  for (const e of events) {
    if (e.role !== 'lead' || e.t < fromT - 1e-6) continue;
    if (e.type !== 'bell' && e.type !== 'chime' && e.type !== 'pluck') continue;
    extra.push({ ...e, midi: e.midi + semi, vel: e.vel * velScale, pan: -Math.abs(e.pan || 0.1) });
  }
  return extra;
}

function bell(out, t, midi, vel, extra = {}) {
  push(out, 'bell', t, { midi, vel, pan: 0.12, wet: 0.32, ring: 1, role: 'cue', ...extra });
}

function chime(out, t, midi, vel, extra = {}) {
  push(out, 'chime', t, { midi, vel, pan: 0.05, wet: 0.4, ring: 1.3, role: 'cue', ...extra });
}

function pluck(out, t, midi, vel, extra = {}) {
  push(out, 'pluck', t, { midi, vel, pan: 0.1, wet: 0.14, decay: 0.12, role: 'cue', ...extra });
}

// --- chapters ---------------------------------------------------------------------------

function cover(out) {
  const t0 = BEATS.lampOn + 0.35;
  const t1 = LEAF_TURNS[0].start - 0.3;
  // The theme's contour, unmetered, as the lamp warms — a hint, not a statement.
  const notes = [77, 72, 76, 77, 77, 74, 72, 70, 69, 67];
  notes.forEach((midi, i) => {
    const t = t0 + ((t1 - t0) * i) / (notes.length - 1);
    const reach = i === 3 || i === 4;
    bell(out, t, midi, reach ? 0.55 : 0.4, { ring: reach ? 1.25 : 1.05, wet: 0.42 });
  });
  bell(out, BEATS.lampOn + 0.22, 81, 0.28, { ring: 1.3, wet: 0.45, pan: 0.2 });
  bell(out, BEATS.coverReveal + 0.15, 53, 0.22, { ring: 1.4, wet: 0.3, pan: -0.2 });
  const padAt = BEATS.lampOn + 0.2;
  const dur = LEAF_TURNS[0].start - padAt;
  push(out, 'pad', padAt, {
    dur, len: dur, sustain: true, vel: 0.36, wet: 0.4,
    notes: CHORDS.Fsus2.slice(1, 5),
    bass: 41,
    attack: 1.1,
    release: 1.6,
    cutoff: 900,
    role: 'pad',
  });
}

function walmart(out, rng) {
  const open = spread('walmart').open + 0.12;
  const spec = {
    bpm: 116, vel: 0.58, lead: 'pluck', wet: 0.16, progression: PLAY, melody: THEME,
    waltz: true, bass: true, bounce: true, pad: true, padVel: 0.14, bassVel: 0.62,
    arpVel: 0.4, decay: 0.1, arp: 'pluck', padCutoff: 1500, padAttack: 0.35, padRelease: 0.6,
    ring: 0.8,
  };
  // The groove keeps going; the ta-da sits on top of it (a pause would open a hole).
  fillThemes(out, rng, spec, open, BEATS.sparks - 0.05);
  pluck(out, BEATS.heWins, 65, 0.62, { decay: 0.09, pan: 0.2 });
  pluck(out, BEATS.heWins + 0.11, 69, 0.68, { decay: 0.09, pan: 0.22 });
  pluck(out, BEATS.heWins + 0.22, 72, 0.74, { decay: 0.1, pan: 0.24 });
  chime(out, BEATS.heWins + 0.4, 77, 0.7, { ring: 1.15, wet: 0.28 });
  chime(out, BEATS.heWins + 0.4, 89, 0.32, { ring: 1.05, wet: 0.34, pan: 0.25 });
  // The room warms: the same theme, now sung by the celesta over a real pad.
  placeTheme(out, rng, {
    start: BEATS.sparks, bpm: 88, toBeat: 6, vel: 0.62, lead: 'bell', ring: 1.15, wet: 0.32,
    progression: WARM, melody: THEME, waltz: true, bass: true, bounce: false, pad: true,
    padVel: 0.5, bassVel: 0.42, arpVel: 0.22, arp: 'bell', padCutoff: 1600, padAttack: 0.7,
    padRelease: 1.5,
  });
}

function dates(out, rng) {
  const stroll = {
    bpm: 80, vel: 0.6, lead: 'bell', ring: 1.05, wet: 0.3, progression: LOVE, melody: THEME,
    waltz: true, bass: true, bounce: false, pad: true, padVel: 0.36, bassVel: 0.4,
    arpVel: 0.26, arp: 'pluck', decay: 0.16, padCutoff: 1100, padAttack: 0.7, padRelease: 1.3,
  };
  fillThemes(out, rng, stroll, spread('dates').open + 0.2, BEATS.uberChaseStart - 0.12);

  // Scurrying run while they chase the Uber, then a bright ding as the phone is rescued.
  const scale = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84];
  const span = BEATS.phoneRescued - BEATS.uberChaseStart;
  const step = 0.072;
  const count = Math.floor(span / step);
  const cycle = scale.length * 2 - 2;
  for (let i = 0; i < count; i++) {
    const tri = i % cycle;
    const idx = tri < scale.length ? tri : cycle - tri;
    const u = i / Math.max(1, count - 1);
    const midi = scale[idx] + (u > 0.62 ? 12 : 0);
    pluck(out, BEATS.uberChaseStart + i * step, midi, 0.26 + 0.4 * u, { decay: 0.07, pan: u * 0.4 - 0.1 });
  }
  chime(out, BEATS.phoneRescued, 89, 0.74, { ring: 1.55, wet: 0.36 });
  bell(out, BEATS.phoneRescued, 65, 0.32, { ring: 1.2, pan: -0.15 });

  // A breath, then the hopeful lift — the theme a fifth higher, in C.
  push(out, 'pad', BEATS.phoneRescued + 0.1, {
    dur: BEATS.sameSchool - BEATS.phoneRescued - 0.05,
    len: BEATS.sameSchool - BEATS.phoneRescued,
    sustain: true, vel: 0.28, wet: 0.32,
    notes: CHORDS.F.slice(1, 5), bass: 41,
    attack: 0.3, release: 0.8, cutoff: 1000, role: 'pad',
  });
  const rise = [60, 64, 67, 72, 76, 79, 84];
  rise.forEach((midi, i) => {
    bell(out, BEATS.sameSchool + i * 0.07, midi, 0.3 + i * 0.04, { ring: 0.7, wet: 0.28 });
  });
  const liftStart = BEATS.sameSchool + 0.55;
  const liftEnd = spread('dates').close - 0.15;
  const liftBeats = Math.min(6, ((liftEnd - liftStart) * 92) / 60);
  placeTheme(out, rng, {
    start: liftStart, bpm: 92, toBeat: liftBeats, transpose: 7, vel: 0.64, lead: 'bell',
    ring: 1.1, wet: 0.3, progression: LIFT, melody: THEME, waltz: true, bass: true, pad: true,
    padVel: 0.4, bassVel: 0.4, arpVel: 0.24, arp: 'bell', padCutoff: 1700, padAttack: 0.4,
    padRelease: 1.3,
  });
  push(out, 'pad', liftStart + liftBeats * (60 / 92), {
    dur: Math.max(0.4, spread('dates').close - (liftStart + liftBeats * (60 / 92))),
    len: 1.2, sustain: true, vel: 0.32, wet: 0.3,
    notes: CHORDS.C.slice(1, 5), bass: 36,
    attack: 0.25, release: 1.1, cutoff: 1400, role: 'pad',
  });
}

function official(out, rng) {
  const start = spread('official').open + 0.45;
  const end = spread('official').close - 0.85;
  const bpm = (12 * 60) / (end - start);
  placeTheme(out, rng, {
    start, bpm, toBeat: 12, vel: 0.68, lead: 'bell', ring: 1.2, wet: 0.3,
    progression: LOVE, melody: THEME, waltz: true, bass: true, bounce: false, pad: true,
    padVel: 0.46, bassVel: 0.36, arpVel: 0.16, arp: 'bell', arpWet: 0.22,
    padCutoff: 1250, padAttack: 0.85, padRelease: 1.5,
  });
  // Stamp sparkle — the day they made it official.
  [89, 84, 81, 96].forEach((midi, i) => {
    chime(out, BEATS.official + i * 0.055, midi, 0.34 - i * 0.04, { ring: 1.1, wet: 0.38, pan: 0.2 });
  });
  // Tiny comic grace note: he still swears they were already dating.
  pluck(out, BEATS.alreadyDating - 0.07, 70, 0.3, { decay: 0.05, pan: 0.3 });
  pluck(out, BEATS.alreadyDating, 72, 0.2, { decay: 0.06, pan: 0.28 });
  const tail = end - 0.15;
  const hold = spread('life').open - tail;
  push(out, 'pad', tail, {
    dur: hold, len: hold, sustain: true, vel: 0.34, wet: 0.32,
    notes: CHORDS.F.slice(1, 5), bass: 41,
    attack: 0.4, release: 1.2, cutoff: 1100, role: 'pad',
  });
  bell(out, tail + 0.05, 77, 0.28, { ring: 1.3, wet: 0.3 });
}

function life(out, rng) {
  const start = spread('life').open + 0.25;
  const bpm = 76;
  const spb = 60 / bpm;
  const base = {
    bpm, lead: 'bell', ring: 1.08, wet: 0.3, melody: THEME, waltz: true, bass: false,
    bounce: false, pad: true, arp: 'pluck', decay: 0.15, arpWet: 0.14,
    padCutoff: 1150, padAttack: 0.8, padRelease: 1.45,
  };
  const lead1 = [];
  placeTheme(lead1, rng, {
    ...base, start, toBeat: 12, vel: 0.56, progression: LOVE, padVel: 0.32, arpVel: 0.22,
  });
  out.push(...lead1, ...doubleFrom(lead1, BEATS.firstPlace - 0.28, -12, 0.5));

  const start2 = start + 12 * spb;
  const beats2 = Math.min(8, (spread('life').close - 0.7 - start2) / spb);
  const lead2 = [];
  placeTheme(lead2, rng, {
    ...base, start: start2, toBeat: beats2, vel: 0.62, progression: LIFE2, padVel: 0.4, arpVel: 0.24,
    padCutoff: 1400,
  });
  out.push(...lead2, ...doubleFrom(lead2, start2, -12, 0.55));

  // The dog's little wag: a high third, over and over, from the moment he's theirs.
  for (let t = BEATS.dogOfTheirOwn, n = 0; t < spread('life').close - 0.35 && n < 12; t += 1.55, n++) {
    bell(out, t, 88, 0.26, { ring: 0.7, pan: 0.38, wet: 0.28 });
    bell(out, t + 0.14, 91, 0.22, { ring: 0.6, pan: 0.42, wet: 0.26 });
    bell(out, t + 0.3, 88, 0.18, { ring: 0.55, pan: 0.34, wet: 0.24 });
  }

  // Home: a warm bass enters and stays.
  const bar = spb * 3;
  let bt = start;
  while (bt < BEATS.home - 1e-4) bt += bar;
  const roots = [53, 48, 50, 46];
  for (let i = 0; bt < spread('life').close - 0.3 && i < 8; bt += bar, i++) {
    push(out, 'bass', bt, { midi: roots[i % roots.length], vel: 0.58, decay: 0.4, role: 'bass' });
  }

  // Japan: soft koto-like plucks on an F yo scale (F G A C D), weaving to the end of the spread.
  const yo = [65, 67, 69, 72, 69, 67, 74, 72, 69, 67];
  const stop = spread('life').close - 0.25;
  for (let i = 0, t = BEATS.japan; t < stop && i < 40; i++, t += 0.2) {
    push(out, 'koto', t, {
      midi: yo[i % yo.length] + (i % 9 === 8 ? 12 : 0),
      vel: 0.32 + (i % 5 === 0 ? 0.08 : 0),
      pan: -0.28, wet: 0.12, decay: 0.2, role: 'koto',
    });
  }
}

function proposal(out, rng) {
  // The turn has already thinned the texture. A last quiet step, then a held breath.
  bell(out, spread('proposal').open + 0.25, 72, 0.24, { ring: 1.45, wet: 0.4 });
  bell(out, spread('proposal').open + 1.05, 65, 0.16, { ring: 1.6, wet: 0.36, pan: -0.1 });
  const breath = BEATS.yes - BEATS.kneel;
  push(out, 'pad', BEATS.kneel, {
    dur: breath + 0.35, len: breath + 0.35, sustain: true, vel: 0.1, wet: 0.36,
    notes: [60, 65, 69, 72], bass: 41,
    attack: 1.3, release: 1.1, cutoff: 640, role: 'pad',
  });
  bell(out, BEATS.question, 89, 0.16, { ring: 1.8, wet: 0.45, pan: 0.15 });

  // "Yes" — the fullest statement, one 4-bar theme exactly until the wedding spread opens.
  const start = BEATS.yes;
  const end = spread('wedding').open;
  const bpm = (12 * 60) / (end - start);
  const joy = [];
  placeTheme(joy, rng, {
    start, bpm, toBeat: 12, vel: 0.6, lead: 'bell', ring: 1.05, wet: 0.3,
    progression: LOVE, melody: THEME_JOY, waltz: true, bass: true, pad: true,
    padVel: 0.4, bassVel: 0.46, arpVel: 0.28, arp: 'pluck', decay: 0.12,
    padCutoff: 1800, padAttack: 0.35, padRelease: 1.3,
  });
  out.push(...joy, ...doubleFrom(joy, start, 12, 0.28), ...doubleFrom(joy, start, -12, 0.32));
  [89, 84, 81].forEach((midi, i) => {
    chime(out, start + i * 0.09, midi, 0.28 - i * 0.04, { ring: 1.4, wet: 0.42 });
  });
  const mid = start + 6 * (60 / bpm);
  [96, 89, 84].forEach((midi, i) => {
    chime(out, mid + i * 0.08, midi, 0.32 - i * 0.05, { ring: 1.25, wet: 0.4, pan: -0.1 });
  });
}

function wedding(out, rng) {
  const start = spread('wedding').open + 0.15;
  const end = END_CARD.start;
  const bpm = (24 * 60) / (end - start);
  const spb = 60 / bpm;
  const spec = {
    bpm, vel: 0.64, lead: 'bell', ring: 1.35, wet: 0.34, progression: WARM, melody: THEME,
    waltz: true, bass: true, pad: true, padVel: 0.5, bassVel: 0.4, arpVel: 0.18, arp: 'bell',
    arpWet: 0.26, padCutoff: 1400, padAttack: 1.1, padRelease: 1.8,
  };
  const a = [];
  placeTheme(a, rng, { ...spec, start, toBeat: 12 });
  const b = [];
  placeTheme(b, rng, { ...spec, start: start + 12 * spb, toBeat: 12, vel: 0.68, padVel: 0.54 });
  out.push(...a, ...b, ...doubleFrom(a, start, -12, 0.4), ...doubleFrom(b, start, -12, 0.45));

  // Wedding bells: a small peal on each downbeat, long and golden, not a clang.
  for (let i = 0, t = start; t < end - 0.4 && i < 16; i++, t += spb * 3) {
    const peal = i % 2 === 0 ? [89, 84] : [81, 89];
    peal.forEach((midi, k) => {
      chime(out, t + k * 0.18, midi, 0.3 - k * 0.06, { ring: 1.7, wet: 0.46, pan: k ? -0.15 : 0.12 });
    });
  }

  // A wink on "just not on a Sunday", the same size as the earlier grace note.
  pluck(out, BEATS.notSunday - 0.06, 70, 0.22, { decay: 0.05, pan: 0.25 });
  pluck(out, BEATS.notSunday, 74, 0.16, { decay: 0.055, pan: 0.22 });

  // "From Walmart coworkers to forever" — four soft plucks of the theme's head, a memory.
  [72, 76, 77, 74].forEach((midi, i) => {
    pluck(out, BEATS.walmartToForever + i * 0.28, midi, 0.28, { decay: 0.14, pan: -0.05 });
  });

  // Resolve under the end card, then the master fade takes it the rest of the way to silence.
  const hold = Math.max(0.5, END_CARD.fadeStart - END_CARD.start + 0.4);
  push(out, 'pad', END_CARD.start, {
    dur: hold, len: hold, sustain: true, vel: 0.42, wet: 0.38,
    notes: CHORDS.Fmaj7.slice(1, 5), bass: 41,
    attack: 0.6, release: 1.8, cutoff: 1200, role: 'pad',
  });
  [77, 72, 69, 65].forEach((midi, i) => {
    const t = END_CARD.start + 0.25 + i * 1.15;
    if (t < END_CARD.fadeStart - 0.35) bell(out, t, midi, 0.3 - i * 0.05, { ring: 1.5, wet: 0.4 });
  });
}

/** A quiet rising (or, into the proposal, falling) celesta line across each page turn. */
function turnMusic(out) {
  for (const turn of LEAF_TURNS) {
    if (turn.leaf === 5) continue; // the "yes" theme is already playing
    const falling = turn.leaf === 4;
    const notes = falling ? [76, 74, 72, 69, 67, 65, 62] : [65, 69, 72, 76, 77, 81, 84];
    const dur = turn.end - turn.start;
    notes.forEach((midi, i) => {
      const t = turn.start + (dur * (i + 0.45)) / notes.length;
      bell(out, t, midi, falling ? 0.14 : 0.18, { ring: 0.75, wet: 0.36, pan: 0.25 - i * 0.06 });
    });
    if (!falling) {
      push(out, 'pad', turn.start, {
        dur: dur + 0.25, len: dur + 0.25, sustain: true, vel: 0.2, wet: 0.3,
        notes: CHORDS.F.slice(1, 5), bass: 41,
        attack: 0.35, release: 0.9, cutoff: 900, role: 'pad',
      });
    }
  }
}

function foley(out, rng) {
  const fx = (type, t, props) => push(out, type, t, props);
  fx('click', BEATS.lampOn, { vel: 1 });
  for (const turn of LEAF_TURNS) {
    const cover = turn.leaf === 0;
    const dur = turn.end - turn.start;
    // The page lifts (a crinkle right at the start) and then whooshes with the leaf.
    fx('rustle', turn.start, { dur: 0.2, vel: 0.95, off: rng.range(0, 2), pan: 0.35 });
    if (cover) fx('creak', turn.start + 0.04, { vel: 0.85 });
    fx('whoosh', turn.start, {
      dur, len: dur, sustain: true, vel: cover ? 1 : 0.9,
      lo: cover ? 260 : 420, hi: cover ? 1500 : 2400, off: rng.range(0, 3),
    });
    // One crisp flap as the pop-up locks at the end of the turn.
    fx('flap', turn.end - 0.06, {
      vel: 1, f: rng.range(2400, 3300), pan: rng.range(-0.25, 0.25), off: rng.range(0, 4),
    });
    if (cover) fx('thump', turn.end + 0.02, { vel: 0.55, f: 88, off: rng.range(0, 4) });
  }
  fx('stamp', BEATS.official, { vel: 1, off: rng.range(0, 3) });
  fx('shutter', BEATS.photoReveal, { vel: 1 });
  fx('pop', BEATS.yes, { vel: 1, off: rng.range(0, 2) });
}

function buildEvents() {
  const rng = makeRng(20260206);
  const out = [];
  cover(out);
  walmart(out, rng);
  dates(out, rng);
  official(out, rng);
  life(out, rng);
  proposal(out, rng);
  wedding(out, rng);
  turnMusic(out);
  foley(out, rng);
  const silenceAt = DURATION - 0.5;
  const fadeAt = Math.min(END_CARD.fadeStart, silenceAt - 0.4);
  const fadeDur = Math.max(0.4, silenceAt - fadeAt);
  push(out, 'fade', fadeAt, { dur: fadeDur, len: fadeDur, sustain: true });
  out.sort((a, b) => a.t - b.t || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  return out;
}

const EVENTS = buildEvents();
const SUSTAINED = EVENTS.filter((e) => e.sustain);

function firstEventAtOrAfter(t) {
  let lo = 0;
  let hi = EVENTS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (EVENTS[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Breakpoints of the narration duck (film seconds). Ramps are 0.25 s and do not overlap. */
function buildDuckPoints() {
  const pts = [0];
  for (const line of NARRATION) pts.push(line.start, line.start + DUCK_RAMP, line.end, line.end + DUCK_RAMP);
  pts.sort((a, b) => a - b);
  const out = [];
  for (const t of pts) {
    if (!out.length || t > out[out.length - 1] + 1e-4) out.push(t);
  }
  return out;
}

const DUCK_POINTS = buildDuckPoints();

function duckGainAt(t) {
  let g = 1;
  for (const line of NARRATION) {
    const a = line.start;
    const b = a + DUCK_RAMP;
    const c = line.end;
    const d = c + DUCK_RAMP;
    if (t < a || t >= d) continue;
    let lg;
    if (t < b) lg = 1 + (DUCK_GAIN - 1) * ((t - a) / DUCK_RAMP);
    else if (t < c) lg = DUCK_GAIN;
    else lg = DUCK_GAIN + (1 - DUCK_GAIN) * ((t - c) / DUCK_RAMP);
    if (lg < g) g = lg;
  }
  return g;
}

function scheduleDuck(param, filmT0, ctxT0, ctx) {
  const now = Math.max(ctx.currentTime, ctxT0);
  const filmNow = filmT0 + (now - ctxT0);
  try { param.cancelScheduledValues(now); } catch { /* nothing scheduled yet */ }
  param.setValueAtTime(duckGainAt(filmNow), now);
  let last = now;
  for (const t of DUCK_POINTS) {
    if (t <= filmNow + 1e-3) continue;
    const when = ctxT0 + (t - filmT0);
    if (when <= last + 1e-4) continue;
    param.linearRampToValueAtTime(duckGainAt(t), when);
    last = when;
  }
}

// ---------------------------------------------------------------------------------------------
// Narration file — optional, never an error
// ---------------------------------------------------------------------------------------------

function narrationUrls() {
  try {
    const explicit = globalThis.window?.__NARRATION_URL;
    if (typeof explicit === 'string' && explicit.trim()) {
      const base = globalThis.document?.baseURI ?? globalThis.location?.href ?? import.meta.url;
      return [new URL(explicit.trim(), base).href];
    }
    const urls = [];
    const add = (base, rel) => {
      try { urls.push(new URL(rel, base).href); } catch { /* bad base */ }
    };
    const exts = ['mp3', 'm4a', 'wav'];
    for (const ext of exts) {
      if (globalThis.document?.baseURI) add(document.baseURI, `audio/narration.${ext}`);
      add(import.meta.url, `../audio/narration.${ext}`);
    }
    return [...new Set(urls)];
  } catch {
    return [];
  }
}

async function loadNarrationBytes() {
  if (typeof fetch !== 'function') return null;
  for (const url of narrationUrls()) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await res.arrayBuffer();
    } catch {
      // missing, blocked, or not audio — try the next candidate
    }
  }
  return null;
}

let narrationBytesPromise = null;
function narrationBytes() {
  if (!narrationBytesPromise) narrationBytesPromise = loadNarrationBytes().catch(() => null);
  return narrationBytesPromise;
}

// ---------------------------------------------------------------------------------------------
// Sample bank (seeded, generated once per context)
// ---------------------------------------------------------------------------------------------

function makeBuffer(ctx, channels, seconds, fill) {
  const buf = ctx.createBuffer(channels, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  for (let c = 0; c < channels; c++) fill(buf.getChannelData(c), ctx.sampleRate, c);
  return buf;
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

/** Damped sine grain added into d at sample i0. */
function addGrain(d, sr, i0, f, tau, amp) {
  const n = Math.min(d.length - i0, Math.ceil(tau * 5 * sr));
  for (let i = 0; i < n; i++) d[i0 + i] += amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (tau * sr));
}

function createBank(ctx) {
  // White noise with a constant spectral density whatever the sample rate, so band-passed
  // levels match between a 22.05 kHz test render and 48 kHz playback.
  const noise = makeBuffer(ctx, 1, 6, (d, sr) => {
    const rnd = mulberry32(11);
    const a = 0.5 * Math.sqrt(sr / 44100);
    for (let i = 0; i < d.length; i++) d[i] = a * (rnd() * 2 - 1);
  });

  const crinkle = makeBuffer(ctx, 1, 3, (d, sr) => {
    const rnd = mulberry32(23);
    for (let t = 0; t < d.length; t += Math.floor((0.01 + rnd() * 0.05) * sr)) {
      const count = 2 + Math.floor(rnd() * 10);
      for (let k = 0; k < count; k++) {
        const i0 = t + Math.floor(rnd() * 0.012 * sr);
        const w = Math.max(2, Math.floor((0.0004 + rnd() * 0.003) * sr));
        const a = rnd() * rnd() * (rnd() < 0.5 ? -1 : 1);
        for (let i = 0; i < w && i0 + i < d.length; i++) d[i0 + i] += a * (rnd() * 2 - 1) * Math.exp(-i / (w * 0.3));
      }
    }
    normalize(d, 0.9);
  });

  const creak = makeBuffer(ctx, 1, 1.1, (d, sr) => {
    const rnd = mulberry32(37);
    const dur = d.length / sr;
    for (let t = 0.01; t < dur - 0.02; ) {
      const env = Math.sin((Math.PI * t) / dur) ** 0.8;
      const f = 600 + 500 * rnd();
      const amp = env * (0.6 + 0.4 * rnd());
      addGrain(d, sr, Math.floor(t * sr), f, 0.003 + 0.003 * rnd(), amp);
      addGrain(d, sr, Math.floor(t * sr), f * 1.9, 0.002, amp * 0.4);
      t += 1 / (45 + 80 * env + 20 * (rnd() - 0.5));
    }
    normalize(d, 0.9);
  });

  // Small warm room: decorrelated stereo tail (T60 ≈ 2.2 s), a few early reflections, 12 ms pre-delay.
  const ir = makeBuffer(ctx, 2, 2.6, (d, sr, ch) => {
    const rnd = mulberry32(5 + ch * 101);
    const pre = Math.floor(0.012 * sr);
    let lp = 0;
    for (let i = pre; i < d.length; i++) {
      const x = (i - pre) / sr;
      const a = 0.75 - 0.6 * Math.min(1, x / 1.8);
      lp += a * (rnd() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-x / 0.32);
    }
    for (const [ms, g] of [[17, 0.5], [23, -0.4], [31, 0.35], [41, -0.3], [53, 0.22]]) {
      d[Math.floor(((ms + ch * 3) / 1000) * sr)] += g;
    }
  });

  return { noise, crinkle, creak, ir };
}

// ---------------------------------------------------------------------------------------------
// Voices — each (session, event, when, offset). offset > 0 restarts a sustained event mid-way.
// ---------------------------------------------------------------------------------------------

function mallet(partials, levelKey, { sustain = 1, attack = 0.002 } = {}) {
  return function malletVoice(s, e, when) {
    const { ctx } = s;
    const f = mtof(e.midi);
    if (!(f > 0)) return;
    const t60 = clamp(3.2 * Math.sqrt(261.63 / f), 0.9, 4.5) * (e.ring ?? 1) * sustain;
    const amp = e.vel * LEVEL[levelKey] * clamp((440 / f) ** 0.25, 0.7, 1.4);
    const out = s.lane(e.pan ?? 0.1, e.wet ?? 0.3, true);
    for (const [ratio, level, decay] of partials) {
      if (f * ratio > ctx.sampleRate * 0.45) break;
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      const len = t60 * decay;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp * level, when + attack);
      g.gain.setTargetAtTime(0, when + attack, Math.max(0.008, len / 6.9));
      osc.connect(g).connect(out);
      s.play(osc, when, when + len + 0.03);
    }
  };
}

const BELL_PARTIALS = [
  [1, 1, 1],
  [2.0012, 0.3, 0.5],
  [4.16, 0.11, 0.2],
  [5.43, 0.06, 0.12],
  [8.93, 0.04, 0.05],
];

const CHIME_PARTIALS = [
  [1, 1, 1],
  [2.003, 0.4, 0.75],
  [2.99, 0.2, 0.5],
  [4.02, 0.07, 0.28],
  [5.4, 0.035, 0.15],
];

const bellVoice = mallet(BELL_PARTIALS, 'bell', { sustain: 1, attack: 0.002 });
const chimeVoice = mallet(CHIME_PARTIALS, 'chime', { sustain: 1.7, attack: 0.008 });

/** Attack / hold / release on an AudioParam, entered `off` seconds late; returns the stop time. */
function envelope(p, when, off, attack, dur, release, peak) {
  const fadeIn = off > 0 ? 0.15 : 0;
  const x = off + fadeIn;
  p.setValueAtTime(0, when);
  if (x < attack) {
    if (fadeIn) p.linearRampToValueAtTime((peak * x) / attack, when + fadeIn);
    p.linearRampToValueAtTime(peak, when + Math.max(0.005, attack - off));
  } else {
    p.linearRampToValueAtTime(peak, when + Math.max(fadeIn, 0.005));
  }
  const releaseAt = when + Math.max(dur - off, fadeIn, 0.01);
  p.setValueAtTime(peak, releaseAt);
  p.setTargetAtTime(0, releaseAt, Math.max(0.02, release / 5));
  return releaseAt + release;
}

function pad(s, e, when, off) {
  const { ctx } = s;
  const g = ctx.createGain();
  const stop = envelope(g.gain, when, off, e.attack, e.dur, e.release, e.vel * LEVEL.pad);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const opened = Math.min(off / Math.max(0.05, e.attack), 1);
  filter.frequency.setValueAtTime(Math.max(40, e.cutoff * (0.55 + 0.45 * opened)), when);
  if (opened < 1) filter.frequency.linearRampToValueAtTime(e.cutoff, when + Math.max(0.01, e.attack - off));
  filter.connect(g).connect(s.lane(0, e.wet, true));
  for (const m of e.notes) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = mtof(m);
      osc.detune.value = detune;
      osc.connect(filter);
      s.play(osc, when, stop);
    }
  }
  // A quiet sub so the chord has a root; the rhythmic bass is its own voice.
  const sub = ctx.createOscillator();
  sub.frequency.value = mtof(e.bass);
  const subGain = ctx.createGain();
  subGain.gain.value = 0.4;
  sub.connect(subGain).connect(g);
  s.play(sub, when, stop);
}

function pitchedNoise(s, when, { f, q, tau, vel, pan, wet, ducked, type = 'bandpass' }) {
  const { ctx, bank } = s;
  const src = ctx.createBufferSource();
  src.buffer = bank.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.002);
  g.gain.setTargetAtTime(0, when + 0.002, Math.max(0.004, tau));
  src.connect(filter).connect(g).connect(s.lane(pan, wet, ducked));
  s.play(src, when, when + tau * 8 + 0.02, (when * 0.37) % 5);
}

function pluckLike(s, e, when, { level, decay, bend, brightness }) {
  const { ctx } = s;
  const f = mtof(e.midi);
  if (!(f > 20)) return;
  const amp = e.vel * level * clamp((440 / f) ** 0.2, 0.7, 1.35);
  const tau = e.decay ?? decay;
  const out = s.lane(e.pan ?? 0.1, e.wet ?? 0.14, true);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const f1 = Math.max(20, f);
  osc.frequency.setValueAtTime(f1 * bend, when);
  osc.frequency.exponentialRampToValueAtTime(f1, when + Math.min(0.05, tau));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + 0.003);
  g.gain.setTargetAtTime(0, when + 0.003, Math.max(0.012, tau / 3.2));
  osc.connect(g).connect(out);
  s.play(osc, when, when + tau * 6 + 0.02);
  const harm = ctx.createOscillator();
  harm.type = 'sine';
  harm.frequency.value = Math.min(f1 * 2, ctx.sampleRate * 0.4);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(amp * brightness, when);
  hg.gain.setTargetAtTime(0, when, Math.max(0.008, tau / 6));
  harm.connect(hg).connect(out);
  s.play(harm, when, when + tau * 3 + 0.02);
  pitchedNoise(s, when, {
    f: Math.min(f1 * 3, 6000), q: 2.5, tau: 0.012, vel: amp * 0.45,
    pan: e.pan ?? 0, wet: 0.05, ducked: true, type: 'bandpass',
  });
}

function pluckVoice(s, e, when) {
  pluckLike(s, e, when, { level: LEVEL.pluck, decay: 0.13, bend: 1.025, brightness: 0.18 });
}

function kotoVoice(s, e, when) {
  // Sharper attack, a little more pitch dip, drier — a paper koto, not a real one.
  pluckLike(s, e, when, { level: LEVEL.koto, decay: 0.2, bend: 1.09, brightness: 0.08 });
}

function bassVoice(s, e, when) {
  const { ctx } = s;
  const f = mtof(e.midi);
  if (!(f > 20)) return;
  const amp = e.vel * LEVEL.bass;
  const tau = e.decay ?? 0.24;
  const out = s.lane(0, 0.06, true);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f * 1.04, when);
  osc.frequency.exponentialRampToValueAtTime(f, when + Math.min(0.05, tau));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + 0.008);
  g.gain.setTargetAtTime(0, when + 0.008, Math.max(0.02, tau / 3.2));
  osc.connect(g).connect(out);
  s.play(osc, when, when + tau * 6 + 0.02);
  const harm = ctx.createOscillator();
  harm.frequency.value = f * 2;
  const hg = ctx.createGain();
  hg.gain.value = 0.16;
  harm.connect(hg).connect(g);
  s.play(harm, when, when + tau * 6 + 0.02);
}

/** Page turn: band-passed noise swept with the leaf's speed, panned right → left. */
function whoosh(s, e, when, off) {
  const { ctx, bank } = s;
  const remain = e.dur - off;
  if (remain < 0.05) return;
  const n = Math.max(2, Math.ceil(remain * 80));
  const body = new Float32Array(n);
  const air = new Float32Array(n);
  const freq = new Float32Array(n);
  const pan = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (off + (remain * i) / (n - 1)) / e.dur;
    const speed = (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u)) / 3;
    const flutter = 1 + 0.18 * Math.sin(2 * Math.PI * 13 * u * e.dur + (e.off || 0));
    body[i] = e.vel * LEVEL.whoosh * speed ** 1.4 * flutter;
    air[i] = body[i] * 0.35;
    const sweep = Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 1.5;
    freq[i] = e.lo * (e.hi / e.lo) ** sweep;
    pan[i] = 0.55 - 1.1 * ease.inOutCubic(u);
  }
  const src = ctx.createBufferSource();
  src.buffer = bank.noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1;
  bp.frequency.setValueCurveAtTime(freq, when, remain);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3500;
  hp.Q.value = 0.7;
  const gBody = ctx.createGain();
  gBody.gain.setValueCurveAtTime(body, when, remain);
  const gAir = ctx.createGain();
  gAir.gain.setValueCurveAtTime(air, when, remain);
  let tail = s.lane(0, 0.22, false);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueCurveAtTime(pan, when, remain);
    panner.connect(tail);
    tail = panner;
  }
  src.connect(bp).connect(gBody).connect(tail);
  src.connect(hp).connect(gAir).connect(tail);
  s.play(src, when, when + remain, ((e.off || 0) + off) % bank.noise.duration);
}

function burst(s, when, { type = 'bandpass', f, q = 1, tau, vel, pan = 0, wet = 0.2, off = 0 }) {
  const { ctx, bank } = s;
  const src = ctx.createBufferSource();
  src.buffer = bank.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.0015);
  g.gain.setTargetAtTime(0, when + 0.0015, Math.max(0.003, tau));
  src.connect(filter).connect(g).connect(s.lane(pan, wet, false));
  s.play(src, when, when + 0.01 + tau * 8, Math.abs(off) % 5);
}

function ping(s, when, { f, f1 = f, tau, vel, pan = 0, wet = 0.15 }) {
  const { ctx } = s;
  if (!(f > 0) || !(f1 > 0)) return;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f, when);
  if (f1 !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), when + Math.max(0.01, tau * 3));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.003);
  g.gain.setTargetAtTime(0, when + 0.003, Math.max(0.004, tau));
  osc.connect(g).connect(s.lane(pan, wet, false));
  s.play(osc, when, when + 0.02 + tau * 8);
}

function crinkle(s, when, { dur, vel, off, pan, hp = 1800, wet = 0.2 }) {
  const { ctx, bank } = s;
  const src = ctx.createBufferSource();
  src.buffer = bank.crinkle;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  filter.Q.value = 0.7;
  const g = ctx.createGain();
  const fade = Math.min(0.03, dur / 3);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + fade);
  g.gain.setValueAtTime(vel, Math.max(when + fade, when + dur - fade));
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(filter).connect(g).connect(s.lane(pan, wet, false));
  s.play(src, when, when + dur + 0.01, Math.abs(off) % 2.5);
}

const VOICES = {
  bell: bellVoice,
  chime: chimeVoice,
  pluck: pluckVoice,
  koto: kotoVoice,
  bass: bassVoice,
  pad,
  whoosh,
  click(s, e, when) {
    const v = e.vel * LEVEL.click;
    burst(s, when, { f: 3800, q: 1.6, tau: 0.0035, vel: v, pan: 0.35, wet: 0.1, off: 1.3 });
    ping(s, when, { f: 1900, tau: 0.006, vel: v * 0.25, pan: 0.35, wet: 0.1 });
    burst(s, when + 0.06, { f: 2700, q: 1.6, tau: 0.003, vel: v * 0.45, pan: 0.35, wet: 0.1, off: 2.1 });
  },
  creak(s, e, when) {
    const { ctx, bank } = s;
    const src = ctx.createBufferSource();
    src.buffer = bank.creak;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = e.vel * LEVEL.creak;
    src.connect(filter).connect(g).connect(s.lane(0.25, 0.22, false));
    s.play(src, when, when + bank.creak.duration);
  },
  flap(s, e, when) {
    const v = e.vel * LEVEL.flap;
    burst(s, when, { f: e.f, q: 0.9, tau: 0.012, vel: v, pan: e.pan, wet: 0.18, off: e.off || 0 });
    burst(s, when + 0.004, { type: 'lowpass', f: 420, q: 0.7, tau: 0.02, vel: v * 0.7, pan: e.pan, wet: 0.12, off: (e.off || 0) + 0.4 });
    crinkle(s, when, { dur: 0.05, vel: v * 0.45, off: (e.off || 0) % 2.2, pan: e.pan, hp: 2800 });
  },
  thump(s, e, when) {
    const v = e.vel * LEVEL.thump;
    ping(s, when, { f: e.f * 1.5, f1: e.f * 0.75, tau: 0.07, vel: v, pan: -0.2, wet: 0.12 });
    burst(s, when, { type: 'lowpass', f: 380, q: 0.7, tau: 0.03, vel: v * 0.5, pan: -0.2, wet: 0.1, off: e.off || 0 });
  },
  rustle(s, e, when) {
    crinkle(s, when, { dur: e.dur, vel: e.vel * LEVEL.rustle, off: e.off || 0, pan: e.pan ?? 0.3, hp: 1600 });
  },
  stamp(s, e, when) {
    const v = e.vel * LEVEL.stamp;
    burst(s, when, { f: 1700, q: 0.8, tau: 0.01, vel: v, pan: 0.1, wet: 0.12, off: e.off || 0.2 });
    ping(s, when, { f: 180, f1: 70, tau: 0.05, vel: v * 0.7, pan: 0, wet: 0.1 });
    crinkle(s, when, { dur: 0.06, vel: v * 0.35, off: e.off || 0, pan: 0.15, hp: 2000 });
  },
  shutter(s, e, when) {
    const v = e.vel * LEVEL.shutter;
    burst(s, when, { type: 'highpass', f: 3500, q: 0.7, tau: 0.004, vel: v, pan: 0.15, wet: 0.08, off: 0.4 });
    burst(s, when + 0.014, { f: 6200, q: 1.8, tau: 0.0025, vel: v * 0.75, pan: 0.2, wet: 0.06, off: 1.1 });
    ping(s, when + 0.012, { f: 3100, tau: 0.004, vel: v * 0.28, pan: 0.15, wet: 0.05 });
  },
  pop(s, e, when) {
    const v = e.vel * LEVEL.pop;
    ping(s, when, { f: 240, f1: 70, tau: 0.045, vel: v * 0.85, pan: 0, wet: 0.12 });
    burst(s, when, { f: 1500, q: 0.6, tau: 0.02, vel: v, pan: 0.05, wet: 0.16, off: e.off || 0 });
    crinkle(s, when + 0.01, { dur: 0.14, vel: v * 0.55, off: e.off || 0.3, pan: -0.1, hp: 2200 });
    ping(s, when + 0.04, { f: 1800, tau: 0.02, vel: v * 0.22, pan: 0.3, wet: 0.1 });
    ping(s, when + 0.08, { f: 2500, tau: 0.016, vel: v * 0.16, pan: -0.25, wet: 0.1 });
  },
  fade(s, e, when, off) {
    const p = s.env.gain;
    if (off >= e.dur) {
      p.setValueAtTime(0, when);
      return;
    }
    p.setValueAtTime(1 - off / e.dur, when);
    p.linearRampToValueAtTime(0, when + e.dur - off);
  },
};

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

/** Master chain shared by every session of one context: gain → high-pass → compressor → trim. */
function createGraph(ctx) {
  const bank = createBank(ctx);
  const input = ctx.createGain();
  const mute = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 32;
  highpass.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 8;
  comp.ratio.value = 2;
  comp.attack.value = 0.012;
  comp.release.value = 0.28;
  const trim = ctx.createGain();
  trim.gain.value = 0.86;
  input.connect(mute).connect(highpass).connect(comp).connect(trim).connect(ctx.destination);
  return { bank, input, mute, trim };
}

/**
 * One continuous stretch of playback: film time filmT0 plays at context time ctxT0.
 * `duck` prints the narration envelope onto the music bus. `narration` is an AudioBuffer
 * aligned to film time, or null. `layers` (optional) restricts which event layers play;
 * the master fade always plays.
 */
class Session {
  constructor(ctx, graph, filmT0, ctxT0, options = {}) {
    const { layers = null, duck = false, narration = null } = options;
    this.ctx = ctx;
    this.bank = graph.bank;
    this.filmT0 = filmT0;
    this.ctxT0 = ctxT0;
    this.layers = layers;
    this.sources = new Set();
    this.lanes = new Map();
    this.count = 0;
    this.out = ctx.createGain();
    this.env = ctx.createGain();
    this.music = ctx.createGain();
    this.music.gain.value = 1;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = graph.bank.ir;
    this.musicReverb = ctx.createConvolver();
    this.musicReverb.buffer = graph.bank.ir;
    this.musicReverb.connect(this.music);
    this.music.connect(this.env);
    this.reverb.connect(this.env);
    this.env.connect(this.out);
    this.out.connect(graph.input);
    this.ducked = false;
    this.narrationStarted = false;
    if (duck) {
      scheduleDuck(this.music.gain, filmT0, ctxT0, ctx);
      this.ducked = true;
    }
    if (narration) this.startNarration(narration);
    this.idx = firstEventAtOrAfter(filmT0);
    for (const e of SUSTAINED) {
      if (e.t < filmT0 && e.t + e.len > filmT0 + 0.05) this.schedule(e, filmT0 - e.t);
    }
  }

  /** Film time playing at context time `c`. */
  filmAt(c) {
    return this.filmT0 + (c - this.ctxT0);
  }

  /** Schedule every event that starts before film time `horizon`. */
  pump(horizon) {
    while (this.idx < EVENTS.length && EVENTS[this.idx].t < horizon) this.schedule(EVENTS[this.idx++], 0);
  }

  schedule(e, off) {
    if (this.layers && e.layer !== 'master' && !this.layers.includes(e.layer)) return;
    const voice = VOICES[e.type];
    if (!voice) return;
    const when = Math.max(this.ctxT0 + (e.t + off - this.filmT0), this.ctx.currentTime);
    voice(this, e, when, off);
    this.count++;
  }

  /**
   * Bus with a stereo position and a reverb send. Ducked lanes (the music) sum through the
   * music gain, including their reverb, so a narration duck takes the tails with it.
   */
  lane(pan = 0, wet = 0.25, ducked = false) {
    const p = Math.round(pan * 10) / 10;
    const w = Math.round(wet * 20) / 20;
    const key = `${p}|${w}|${ducked ? 1 : 0}`;
    let node = this.lanes.get(key);
    if (!node) {
      const { ctx } = this;
      node = ctx.createGain();
      let tail = node;
      if (p !== 0 && ctx.createStereoPanner) {
        tail = ctx.createStereoPanner();
        tail.pan.value = clamp(p, -1, 1);
        node.connect(tail);
      }
      const dest = ducked ? this.music : this.env;
      const rev = ducked ? this.musicReverb : this.reverb;
      tail.connect(dest);
      if (w > 0) {
        const send = ctx.createGain();
        send.gain.value = w;
        tail.connect(send).connect(rev);
      }
      this.lanes.set(key, node);
    }
    return node;
  }

  play(src, start, stop, offset = 0) {
    if (!(stop > start + 0.004)) return;
    let off = offset > 0 ? offset : 0;
    if (src.buffer && off >= src.buffer.duration) off %= src.buffer.duration;
    src.onended = () => {
      this.sources.delete(src);
      try { src.disconnect(); } catch { /* already gone */ }
    };
    try {
      if (off > 0) src.start(start, off);
      else src.start(start);
      src.stop(Math.max(stop, start + 0.01));
      this.sources.add(src);
    } catch {
      try { src.disconnect(); } catch { /* ignore */ }
    }
  }

  /** Play the narration buffer from the film time that is audible right now. */
  startNarration(buffer) {
    if (!buffer || this.narrationStarted) return;
    this.narrationStarted = true;
    const now = Math.max(this.ctx.currentTime, this.ctxT0);
    const filmNow = this.filmT0 + (now - this.ctxT0);
    if (filmNow >= buffer.duration - 0.03 || filmNow >= DURATION - 0.05) return;
    const remain = Math.min(buffer.duration - filmNow, DURATION - filmNow);
    if (remain < 0.03) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = LEVEL.voice;
    src.connect(g).connect(this.env);
    this.play(src, now, now + remain, filmNow);
  }

  /** Fade out quickly, stop every source and drop the session's graph. */
  stop() {
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    try {
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
      }
      g.linearRampToValueAtTime(0, now + STOP_FADE);
    } catch { /* context is closing */ }
    for (const src of this.sources) {
      try { src.stop(now + STOP_FADE + 0.02); } catch { /* already stopped */ }
    }
    this.sources.clear();
    const out = this.out;
    setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, (STOP_FADE + 0.25) * 1000);
  }
}

/**
 * Live audio for the film. start() must be called from a user gesture (it creates and
 * resumes the AudioContext); sync(t, playing) every frame keeps the score locked to film time.
 * `stats` is a read-only diagnostic for dev/audio.html.
 */
export function createAudio() {
  let ctx = null;
  let graph = null;
  let session = null;
  let pending = null; // { t, c } — candidate start while the playhead settles after a seek
  let lead = 0;
  let muted = false;
  let sessions = 0;
  let scheduled = 0;
  let narrationBuffer = null;
  let narrationState = 'pending';
  let booting = null;

  const bytesP = narrationBytes().then((ab) => {
    if (!ab) narrationState = 'absent';
    return ab;
  });

  const halt = () => {
    pending = null;
    if (!session) return;
    const s = session;
    session = null;
    scheduled += s.count;
    try { s.stop(); } catch { /* context is gone */ }
  };

  const onVisibility = () => {
    if (globalThis.document?.hidden) halt();
  };

  async function decodeNarration() {
    const ab = await bytesP;
    if (!ab) {
      narrationState = 'absent';
      return;
    }
    if (!ctx) return;
    if (!narrationBuffer) {
      try {
        narrationBuffer = await ctx.decodeAudioData(ab.slice(0));
        narrationState = narrationBuffer ? 'ready' : 'absent';
      } catch {
        narrationBuffer = null;
        narrationState = 'absent';
        return;
      }
    }
    if (session && narrationBuffer) {
      if (!session.ducked) {
        try { scheduleDuck(session.music.gain, session.filmT0, session.ctxT0, ctx); } catch { /* ignore */ }
        session.ducked = true;
      }
      session.startNarration(narrationBuffer);
    }
  }

  return {
    async start() {
      try {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        if (!ctx) {
          ctx = new AC({ latencyHint: 'interactive' });
          graph = createGraph(ctx);
          graph.mute.gain.value = muted ? 0 : 1;
          globalThis.document?.addEventListener('visibilitychange', onVisibility);
        }
        const resumeP = ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
        if (!booting) {
          booting = Promise.race([resumeP, new Promise((r) => setTimeout(r, 400))])
            .then(() => decodeNarration())
            .catch(() => {})
            .finally(() => { booting = null; });
        }
        await booting;
      } catch {
        // audio is optional — the film plays silently
      }
    },

    sync(t, playing) {
      try {
        if (!ctx) return;
        if (!playing || ctx.state !== 'running' || !(t < DURATION)) {
          halt();
          return;
        }
        const now = ctx.currentTime;
        if (session && Math.abs(t - (session.filmAt(now) - lead)) > SEEK_TOLERANCE) halt();
        if (!session) {
          if (!pending || Math.abs(t - (pending.t + (now - pending.c))) > SEEK_TOLERANCE) {
            pending = { t, c: now };
            return;
          }
          if (now - pending.c < SETTLE) return;
          pending = null;
          lead = clamp(ctx.outputLatency || ctx.baseLatency || 0, 0, 0.15);
          session = new Session(ctx, graph, Math.max(0, t), now - lead, {
            duck: !!narrationBuffer,
            narration: narrationBuffer,
          });
          sessions++;
        }
        session.pump(t + LOOKAHEAD);
      } catch {
        halt();
      }
    },

    setMuted(b) {
      muted = !!b;
      try {
        if (graph && ctx) graph.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
      } catch { /* no context */ }
    },

    get muted() {
      return muted;
    },

    /** 'pending' | 'absent' | 'ready' — whether a narration file was found and decoded. */
    get narration() {
      return narrationState;
    },

    get stats() {
      return {
        state: ctx ? ctx.state : 'unavailable',
        sessions,
        scheduled: scheduled + (session ? session.count : 0),
        live: session ? session.sources.size : 0,
        narration: narrationState,
      };
    },
  };
}

/**
 * Render film time [fromT, toT) to a stereo AudioBuffer with an OfflineAudioContext, using the
 * same Session scheduling as live playback (events are pumped one second ahead). `layers`
 * optionally restricts the mix, e.g. ['foley'] or ['music']. `duck: true` applies the narration
 * ducking envelope so levels can be checked without a narration file. Resolves to null if
 * OfflineAudioContext is unavailable.
 */
export async function renderOffline(fromT, toT, sampleRate = 22050, opts) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return null;
  const options = opts && typeof opts === 'object' ? opts : {};
  const span = toT - fromT;
  if (!(span > 0) || !(sampleRate > 0)) return null;
  const ctx = new OAC(2, Math.max(1, Math.ceil(span * sampleRate)), sampleRate);
  const session = new Session(ctx, createGraph(ctx), fromT, 0, {
    layers: options.layers ?? null,
    duck: options.duck === true,
    narration: null,
  });
  const pumpTo = (k) => session.pump(Math.min(fromT + k * OFFLINE_STEP + LOOKAHEAD, toT + 0.05));
  if (typeof ctx.suspend === 'function' && span > OFFLINE_STEP) {
    pumpTo(1);
    const plan = (k) => {
      if (k * OFFLINE_STEP >= span - 1e-4) return;
      ctx.suspend(Math.min(k * OFFLINE_STEP, span - 1 / sampleRate)).then(() => {
        try { pumpTo(k + 1); plan(k + 1); } finally { ctx.resume(); }
      });
    };
    plan(1);
  } else {
    session.pump(toT + 0.05);
  }
  return ctx.startRendering();
}
