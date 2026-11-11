/**
 * audio.js — procedural score and paper foley for "Our Love Story".
 *
 * Everything is synthesized with WebAudio and is deterministic in film time. Times come from
 * timeline.js (SPREADS, LEAF_TURNS, BEATS, NARRATION, END_CARD, DURATION); nothing here
 * hard-codes a film time that the schedule already names.
 *
 *  SCORE   One 4-bar love theme in F major, 3/4 — sol–ti–do, held, then a walk home.
 *          The theme is data: [beat, midi, beats, vel]. An unmetered overture on the cover,
 *          then one section per spread, each beginning on that spread's page turn. Every
 *          section changes register or instrument at least every 12 s, so nothing sits in
 *          one loop for half a minute. Walmart is playful; lunch slows and warms; dates
 *          walks, turns to night, then a short chase; fate opens with a cinema-organ
 *          flourish, rises toward the same school, and holds a chord; official states the
 *          waltz in full and then a solo; life travels and turns pentatonic; the proposal
 *          hushes and blooms; the wedding states the theme, builds through the five
 *          milestones, cadences, and fades under the end card to silence.
 *  FOLEY   Lamp click, cover creak and soft thump, a paper whoosh and a lock-flap on every
 *          page turn, a shutter whenever a photo print appears, a stamp when the date is
 *          marked, a pen scratch on the deed, a clock that speeds up through the long
 *          lunch, a soft projector whirr, a school bell, a confetti pop on "yes", and a
 *          pop on each of the five milestones.
 *  NARRATION  Look for audio/narration.<lang>.(mp3|m4a|wav) first (lang from i18n.js),
 *          then audio/narration.(mp3|m4a|wav), then window.__NARRATION_URL. The file is
 *          decoded and played locked to film time (seeks and pauses restart it at the
 *          right offset). The music bus ducks 6 dB under each NARRATION line with 0.25 s
 *          ramps. No file: no duck, no error, no throw.
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
import { LANG } from './i18n.js';
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
  organ: 0.075,
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
  tick: 0.26,
  whirr: 0.45,
  scratch: 0.34,
  schoolBell: 0.3,
};

const FOLEY = new Set([
  'click', 'creak', 'whoosh', 'flap', 'thump', 'rustle', 'shutter', 'pop', 'stamp',
  'tick', 'whirr', 'scratch', 'schoolBell',
]);

/** Longest a texture may run before the register or the instrument changes. */
const PHRASE_MAX = 12;

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
    mixture = false,
  } = o;
  const spb = 60 / bpm;
  const at = (beat) => start + beat * spb;
  const jitter = () => (rng ? rng.range(-0.005, 0.005) : 0);
  const style = { attack: padAttack, release: padRelease, cutoff: padCutoff };

  for (const [beat, midi, dur, mv] of melody) {
    if (beat >= toBeat - 1e-6) continue;
    const t = at(beat) + jitter();
    const v = vel * mv;
    const note = midi + transpose;
    if (lead === 'pluck') {
      push(out, 'pluck', t, { midi: note, vel: v, pan, wet: Math.min(wet, 0.2), decay, role: 'lead' });
    } else if (lead === 'chime') {
      push(out, 'chime', t, { midi: note, vel: v, pan, wet, ring, role: 'lead' });
    } else if (lead === 'organ') {
      push(out, 'organ', t, {
        midi: note, vel: v, pan, wet: Math.min(wet, 0.34),
        decay: Math.max(decay, 0.22), mixture: mixture === true, role: 'lead',
      });
    } else {
      const sung = clamp(0.65 + 0.18 * dur * spb, 0.7, 1.25) * ring;
      push(out, 'bell', t, { midi: note, vel: v, pan, wet, ring: sung, role: 'lead' });
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
      const t = at(beat) + jitter();
      if (arp === 'bell') {
        push(out, 'bell', t, { midi, vel: v, pan: -0.22, wet: arpWet, ring: 0.55, role: 'arp' });
      } else if (arp === 'chime') {
        push(out, 'chime', t, { midi, vel: v, pan: -0.18, wet: arpWet, ring: 0.7, role: 'arp' });
      } else if (arp === 'organ') {
        push(out, 'organ', t, { midi, vel: v, pan: -0.12, wet: arpWet, decay: 0.16, mixture: false, role: 'arp' });
      } else {
        push(out, 'pluck', t, { midi, vel: v, pan: -0.22, wet: arpWet, decay: decay * 0.9, role: 'arp' });
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

/** A sustained chord bed. `dur` is in film seconds and comes from the schedule. */
function bed(out, t, dur, name, vel, extra = {}) {
  if (!(dur > 0.08) || !(vel > 0)) return;
  const tones = CHORDS[name];
  if (!tones) return;
  const attack = Math.min(extra.attack ?? 0.5, dur * 0.45);
  push(out, 'pad', t, {
    dur, len: dur, sustain: true, vel, wet: extra.wet ?? 0.32,
    notes: tones.slice(1, 5),
    bass: extra.bass ?? (tones[0] >= 48 ? tones[0] - 12 : tones[0]),
    attack,
    release: extra.release ?? 1.15,
    cutoff: extra.cutoff ?? 1100,
    role: 'pad',
  });
}

/** One complete 12-beat statement, tempo fitted so it fills [start, end). */
function statement(out, rng, start, end, spec) {
  const span = end - start;
  if (!(span > 0.35)) return;
  placeTheme(out, rng, { ...spec, start, bpm: (12 * 60) / span, toBeat: 12 });
}

/**
 * Divide [t0, t1) into phrases of at most PHRASE_MAX seconds and play `styles` across them.
 * A style that would repeat is lifted an octave so the register still changes.
 */
function layPhrases(out, rng, t0, t1, styles) {
  const span = t1 - t0;
  if (!(span > 0.3) || !styles.length) return [];
  const n = Math.max(1, Math.ceil(span / PHRASE_MAX));
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + (span * i) / n;
    const b = t0 + (span * (i + 1)) / n;
    const lap = Math.floor(i / styles.length);
    const style = styles[i % styles.length];
    const bucket = [];
    fillThemes(bucket, rng, {
      ...style,
      transpose: (style.transpose || 0) + (lap ? 12 : 0),
    }, a, b);
    buckets.push(bucket);
    out.push(...bucket);
  }
  return buckets;
}

/** Same grid as layPhrases, but each phrase is one full statement of the theme. */
function layStatements(out, rng, t0, t1, styles) {
  const span = t1 - t0;
  if (!(span > 0.3) || !styles.length) return [];
  const n = Math.max(1, Math.ceil(span / PHRASE_MAX));
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + (span * i) / n;
    const b = t0 + (span * (i + 1)) / n;
    const lap = Math.floor(i / styles.length);
    const style = styles[i % styles.length];
    const bucket = [];
    statement(bucket, rng, a, b, {
      ...style,
      transpose: (style.transpose || 0) + (lap ? 12 : 0),
    });
    buckets.push(bucket);
    out.push(...bucket);
  }
  return buckets;
}

function organNote(out, t, midi, extra = {}) {
  push(out, 'organ', t, {
    midi,
    vel: extra.vel ?? 0.4,
    pan: extra.pan ?? 0,
    wet: extra.wet ?? 0.3,
    decay: extra.decay ?? 0.3,
    mixture: extra.mixture === true,
    role: extra.role ?? 'organ',
  });
}

function organHold(out, t, dur, midis, vel, mixture = false) {
  if (!(dur > 0.08)) return;
  for (const midi of midis) {
    push(out, 'organ', t, {
      midi, vel, sustain: true, dur, len: dur,
      attack: 0.08, release: Math.min(1.3, dur * 0.45),
      wet: 0.34, mixture, pan: 0, role: 'organ',
    });
  }
}

/** Theatre-organ run into a held F chord. Returns the time the chord lands. */
function organFlourish(out, t) {
  const run = [53, 57, 60, 65, 69, 72, 77, 81, 84, 89];
  const step = 0.06;
  run.forEach((midi, i) => {
    organNote(out, t + i * step, midi, {
      vel: 0.3 + i * 0.02,
      decay: 0.22,
      mixture: i >= 6,
      pan: i % 2 ? 0.18 : -0.14,
    });
  });
  const chordT = t + run.length * step;
  organHold(out, chordT, 1.6, [65, 69, 72, 77], 0.42, true);
  return chordT;
}

const WALTZ = {
  melody: THEME,
  progression: LOVE,
  waltz: true,
  bass: true,
  bounce: false,
  pad: true,
  arp: 'bell',
  arpWet: 0.2,
  ring: 1.05,
  wet: 0.3,
  decay: 0.14,
  padAttack: 0.55,
  padRelease: 1.25,
  padCutoff: 1200,
  padVel: 0.36,
  bassVel: 0.4,
  arpVel: 0.22,
  vel: 0.56,
  lead: 'bell',
  transpose: 0,
};

// --- chapters ---------------------------------------------------------------------------

function cover(out) {
  const t0 = BEATS.lampOn;
  const t1 = spread('walmart').start;
  const span = t1 - t0;
  // Unmetered contour of the theme while the lamp warms — a hint, not a statement.
  const notes = [77, 72, 76, 77, 77, 74, 72, 70, 69, 67];
  notes.forEach((midi, i) => {
    const t = t0 + 0.35 + ((span - 0.7) * i) / (notes.length - 1);
    const reach = i === 3 || i === 4;
    const low = i >= notes.length / 2;
    bell(out, t, midi - (low ? 12 : 0), reach ? 0.52 : 0.38, {
      ring: reach ? 1.25 : 1.05, wet: 0.42, pan: low ? -0.12 : 0.12,
    });
  });
  bell(out, BEATS.lampOn + 0.22, 81, 0.28, { ring: 1.3, wet: 0.45, pan: 0.2 });
  bell(out, BEATS.coverReveal + 0.15, 53, 0.22, { ring: 1.4, wet: 0.3, pan: -0.2 });
  bed(out, BEATS.lampOn + 0.2, t1 - (BEATS.lampOn + 0.2), 'Fsus2', 0.36, {
    cutoff: 900, attack: 1.1, release: 1.4, wet: 0.4, bass: 41,
  });
}

function walmart(out, rng) {
  const t0 = spread('walmart').start;
  const t1 = spread('lunch').start;
  layPhrases(out, rng, t0, t1, [
    { ...WALTZ, bpm: 124, lead: 'pluck', progression: PLAY, bounce: true, vel: 0.56, padVel: 0.1, bassVel: 0.58, arpVel: 0.4, arp: 'pluck', decay: 0.08, padCutoff: 1700, padAttack: 0.22, padRelease: 0.5, wet: 0.14 },
    { ...WALTZ, bpm: 118, lead: 'pluck', transpose: 12, progression: PLAY, bounce: true, vel: 0.44, padVel: 0.12, bassVel: 0.5, arpVel: 0.3, arp: 'bell', decay: 0.09, padCutoff: 1850, padAttack: 0.25, padRelease: 0.55, wet: 0.16 },
    { ...WALTZ, bpm: 110, lead: 'bell', progression: PLAY, bounce: true, vel: 0.54, padVel: 0.24, bassVel: 0.46, arpVel: 0.26, arp: 'pluck', decay: 0.11, padCutoff: 1450, padAttack: 0.35, padRelease: 0.75, wet: 0.26 },
    { ...WALTZ, bpm: 102, lead: 'chime', progression: WARM, bounce: false, vel: 0.48, padVel: 0.34, bassVel: 0.38, arpVel: 0.18, arp: 'bell', ring: 0.9, padCutoff: 1300, padAttack: 0.5, padRelease: 1.05, wet: 0.3 },
  ]);
  pluck(out, BEATS.walmartSign, 77, 0.66, { decay: 0.1, pan: 0.2 });
  pluck(out, BEATS.walmartSign + 0.12, 84, 0.5, { decay: 0.09, pan: 0.24 });
  chime(out, BEATS.somethingMore, 76, 0.38, { ring: 1.15, wet: 0.34 });
  chime(out, BEATS.somethingMore + 0.14, 79, 0.3, { ring: 1.05, wet: 0.32, pan: 0.18 });
}

function lunch(out, rng) {
  const t0 = spread('lunch').start;
  const t1 = spread('dates').start;
  // Each phrase is slower and warmer than the last. hoursTalking falls in the middle
  // phrase; a thicker pad enters on that beat and stays.
  layPhrases(out, rng, t0, t1, [
    { ...WALTZ, bpm: 100, lead: 'bell', progression: LOVE, vel: 0.52, padVel: 0.28, bassVel: 0.36, arpVel: 0.2, arp: 'pluck', padCutoff: 1450, padAttack: 0.45, padRelease: 1.1, wet: 0.3 },
    { ...WALTZ, bpm: 82, lead: 'bell', progression: WARM, vel: 0.5, padVel: 0.4, bassVel: 0.34, arpVel: 0.16, arp: 'bell', padCutoff: 1050, padAttack: 0.7, padRelease: 1.35, wet: 0.34 },
    { ...WALTZ, bpm: 66, lead: 'bell', transpose: -12, progression: WARM, vel: 0.46, padVel: 0.48, bassVel: 0.32, arpVel: 0.12, arp: 'bell', padCutoff: 820, padAttack: 0.85, padRelease: 1.5, wet: 0.36, ring: 1.2 },
  ]);
  const warm = spread('dates').start - BEATS.hoursTalking;
  bed(out, BEATS.hoursTalking, warm, 'Fmaj7', 0.22, { cutoff: 760, attack: 1.15, release: 1.6, wet: 0.38 });
  [84, 88, 91].forEach((midi, i) => {
    chime(out, BEATS.sparks + i * 0.09, midi, 0.28 - i * 0.04, { ring: 1.25, wet: 0.4, pan: 0.12 });
  });
}

function dates(out, rng) {
  const t0 = spread('dates').start;
  const night = BEATS.lateNights;
  const t1 = spread('fate').start;
  layPhrases(out, rng, t0, night, [
    { ...WALTZ, bpm: 90, lead: 'bell', progression: LOVE, vel: 0.52, padVel: 0.28, bassVel: 0.36, arpVel: 0.22, arp: 'pluck', decay: 0.15, padCutoff: 1250, padAttack: 0.5, padRelease: 1.2, wet: 0.3 },
    { ...WALTZ, bpm: 96, lead: 'pluck', progression: LOVE, vel: 0.5, padVel: 0.2, bassVel: 0.4, arpVel: 0.28, arp: 'pluck', decay: 0.13, padCutoff: 1500, padAttack: 0.35, padRelease: 0.9, wet: 0.16, bounce: true },
    { ...WALTZ, bpm: 84, lead: 'bell', transpose: 12, progression: WARM, vel: 0.44, padVel: 0.3, bassVel: 0.32, arpVel: 0.18, arp: 'bell', padCutoff: 1350, padAttack: 0.55, padRelease: 1.25, wet: 0.3 },
  ]);
  pluck(out, BEATS.strictParents, 86, 0.22, { decay: 0.08, pan: -0.35 });
  pluck(out, BEATS.strictParents + 0.12, 89, 0.16, { decay: 0.07, pan: -0.28 });
  [88, 91, 88].forEach((midi, i) => {
    bell(out, BEATS.dogWalk + i * 0.14, midi, 0.2, { ring: 0.55, pan: 0.32, wet: 0.22 });
  });

  // Night colour from lateNights, under the chase and on through the memories.
  bed(out, night, t1 - night, 'Dm', 0.34, { cutoff: 680, attack: 0.7, release: 1.45, wet: 0.36 });
  bell(out, night, 58, 0.28, { ring: 1.45, wet: 0.38, pan: -0.2 });
  bell(out, night + (BEATS.uberChaseStart - night) * 0.45, 65, 0.22, { ring: 1.3, wet: 0.34 });

  const scale = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84];
  const span = BEATS.phoneRescued - BEATS.uberChaseStart;
  const step = 0.072;
  const count = Math.max(0, Math.floor(span / step));
  const cycle = scale.length * 2 - 2;
  for (let i = 0; i < count; i++) {
    const tri = i % cycle;
    const idx = tri < scale.length ? tri : cycle - tri;
    const u = i / Math.max(1, count - 1);
    const midi = scale[idx] + (u > 0.62 ? 12 : 0);
    pluck(out, BEATS.uberChaseStart + i * step, midi, 0.24 + 0.38 * u, { decay: 0.07, pan: u * 0.4 - 0.1 });
  }
  chime(out, BEATS.phoneRescued, 89, 0.7, { ring: 1.5, wet: 0.36 });
  bell(out, BEATS.phoneRescued, 65, 0.3, { ring: 1.15, pan: -0.15 });

  const after = BEATS.phoneRescued;
  const tail = t1 - after;
  const memory = [69, 72, 67, 65, 62, 65];
  memory.forEach((midi, i) => {
    bell(out, after + (tail * (i + 1)) / (memory.length + 1), midi, 0.32, { ring: 1.25, wet: 0.34, pan: -0.08 });
  });
}

function fate(out, rng) {
  const t0 = spread('fate').start;
  const t1 = spread('official').start;
  const movies = BEATS.movies;
  const intro = movies - t0;
  bed(out, t0, Math.max(0.3, intro + 0.2), 'Dm', 0.22, { cutoff: 620, attack: 0.45, release: 0.8 });
  [48, 55, 60].forEach((midi, i) => {
    organNote(out, t0 + (intro * (i + 0.45)) / 3, midi, { vel: 0.26, decay: 1.05, pan: i === 1 ? 0.12 : -0.1 });
  });

  const waltzAt = organFlourish(out, movies);
  // One cinema-organ phrase from the flourish to the rise (about ten seconds).
  // apartSeats and itsAStart sit on top of it as comic asides.
  fillThemes(out, rng, {
    ...WALTZ, bpm: 96, lead: 'organ', progression: PLAY, vel: 0.48, mixture: false,
    padVel: 0.16, bassVel: 0.32, arpVel: 0.22, arp: 'organ', decay: 0.3,
    padCutoff: 1400, padAttack: 0.3, padRelease: 0.9, wet: 0.28, arpWet: 0.18,
  }, waltzAt, BEATS.crossPaths);

  organNote(out, BEATS.apartSeats, 67, { vel: 0.4, decay: 0.45, pan: -0.62 });
  organNote(out, BEATS.apartSeats + 0.32, 79, { vel: 0.36, decay: 0.4, pan: 0.62 });
  [72, 76, 79].forEach((midi, i) => {
    organNote(out, BEATS.itsAStart + i * 0.11, midi, { vel: 0.38, decay: 0.32, mixture: true, pan: 0.08 });
  });

  // Hopeful rise: organ until college, then brighter bells landing on sameSchool.
  const riseA = [60, 64, 67, 72];
  riseA.forEach((midi, i) => {
    const t = BEATS.crossPaths + ((BEATS.college - BEATS.crossPaths) * i) / Math.max(1, riseA.length - 1);
    organNote(out, t, midi, { vel: 0.34 + i * 0.04, decay: 0.5, mixture: i > 1 });
  });
  bed(out, BEATS.crossPaths, BEATS.college - BEATS.crossPaths, 'C', 0.26, { cutoff: 1300, attack: 0.35, release: 0.9 });
  const riseB = [72, 76, 79, 84, 88];
  riseB.forEach((midi, i) => {
    const t = BEATS.college + ((BEATS.sameSchool - BEATS.college) * i) / Math.max(1, riseB.length - 1);
    bell(out, t, midi, 0.32 + i * 0.05, { ring: 0.85, wet: 0.3 });
    if (i % 2 === 0) organNote(out, t, midi - 12, { vel: 0.28, decay: 0.4, mixture: true });
  });
  bed(out, BEATS.college, BEATS.sameSchool - BEATS.college, 'F', 0.3, { cutoff: 1600, attack: 0.25, release: 1.0 });

  organHold(out, BEATS.sameSchool, BEATS.fate - BEATS.sameSchool, [72, 76, 79, 84], 0.4, true);
  bed(out, BEATS.sameSchool, BEATS.fate - BEATS.sameSchool, 'F', 0.34, { cutoff: 1550, attack: 0.15, release: 1.1 });

  const held = t1 - BEATS.fate;
  organHold(out, BEATS.fate, held, [65, 69, 72, 77], 0.38, false);
  bed(out, BEATS.fate, held, 'Fmaj7', 0.36, { cutoff: 1100, attack: 0.45, release: 1.5, wet: 0.36 });
}

function official(out, rng) {
  const t0 = spread('official').start;
  const kiss = BEATS.firstKiss;
  const t1 = spread('life').start;
  layStatements(out, rng, t0, kiss, [
    { ...WALTZ, lead: 'bell', vel: 0.64, ring: 1.15, padVel: 0.44, bassVel: 0.38, arpVel: 0.16, arp: 'bell', padCutoff: 1250, padAttack: 0.7, padRelease: 1.4 },
    { ...WALTZ, lead: 'chime', transpose: 12, vel: 0.46, ring: 0.72, padVel: 0.4, bassVel: 0.34, arpVel: 0.14, arp: 'bell', padCutoff: 1500, padAttack: 0.55, padRelease: 1.2 },
  ]);
  [89, 84, 81].forEach((midi, i) => {
    chime(out, BEATS.official + i * 0.055, midi, 0.3 - i * 0.04, { ring: 1.05, wet: 0.36, pan: 0.16 });
  });
  pluck(out, BEATS.alreadyDating - 0.07, 70, 0.28, { decay: 0.05, pan: 0.3 });
  pluck(out, BEATS.alreadyDating, 72, 0.18, { decay: 0.06, pan: 0.26 });

  const span = t1 - kiss;
  bed(out, kiss, span, 'Fmaj7', 0.2, { cutoff: 900, attack: 0.35, release: 1.35, wet: 0.36 });
  const line = [76, 77, 74, 72, 69, 65];
  line.forEach((midi, i) => {
    bell(out, kiss + (span * i) / line.length, midi, 0.4, { ring: 1.5, wet: 0.38, pan: 0.04 });
  });
}

function life(out, rng) {
  const t0 = spread('life').start;
  const jp = BEATS.japan;
  const t1 = spread('proposal').start;
  const buckets = layPhrases(out, rng, t0, jp, [
    { ...WALTZ, bpm: 78, lead: 'bell', progression: LOVE, vel: 0.54, padVel: 0.32, bassVel: 0.36, arpVel: 0.2, arp: 'pluck', decay: 0.15, padCutoff: 1200, padAttack: 0.6, padRelease: 1.3, wet: 0.3 },
    { ...WALTZ, bpm: 88, lead: 'pluck', progression: LIFE2, vel: 0.5, padVel: 0.28, bassVel: 0.48, arpVel: 0.24, arp: 'pluck', decay: 0.13, bounce: true, padCutoff: 1500, padAttack: 0.4, padRelease: 1.05, wet: 0.18 },
  ]);
  if (buckets[0]) out.push(...doubleFrom(buckets[0], BEATS.firstPlace, -12, 0.46));
  [88, 91, 88].forEach((midi, i) => {
    bell(out, BEATS.cherry + i * 0.15, midi, 0.22, { ring: 0.6, pan: 0.36, wet: 0.24 });
  });
  bell(out, BEATS.cherry + 1.1, 91, 0.18, { ring: 0.55, pan: 0.4, wet: 0.22 });
  push(out, 'bass', BEATS.home, { midi: 41, vel: 0.55, decay: 0.6, role: 'bass' });
  bell(out, BEATS.home, 65, 0.28, { ring: 1.15, wet: 0.3 });

  const yo = [65, 67, 69, 72, 74, 72, 69, 67, 65, 69];
  const stop = t1 - 0.12;
  const mid = jp + (stop - jp) / 2;
  bed(out, jp, t1 - jp, 'Fsus2', 0.3, { cutoff: 1450, attack: 0.35, release: 1.3, wet: 0.3 });
  for (let i = 0, t = jp; t < stop && i < 48; i++, t += 0.21) {
    const high = t >= mid ? 12 : 0;
    push(out, 'koto', t, {
      midi: yo[i % yo.length] + high,
      vel: 0.34 + (i % 5 === 0 ? 0.08 : 0),
      pan: high ? 0.22 : -0.26,
      wet: 0.12,
      decay: 0.22,
      role: 'koto',
    });
  }
}

function proposal(out) {
  const t0 = spread('proposal').start;
  const kneel = BEATS.kneel;
  const yes = BEATS.yes;
  const t1 = spread('wedding').start;
  bed(out, t0, kneel - t0, 'F', 0.26, { cutoff: 1000, attack: 0.4, release: 0.8, wet: 0.32 });
  [72, 76, 77, 74].forEach((midi, i) => {
    const t = t0 + (kneel - t0) * (i + 0.6) / 5;
    if (t < kneel - 0.12) bell(out, t, midi, 0.28, { ring: 0.95, wet: 0.32 });
  });

  bed(out, kneel, yes - kneel + 0.12, 'Fsus2', 0.16, { cutoff: 640, attack: 1.05, release: 0.7, wet: 0.34, bass: 41 });
  bell(out, BEATS.question, 89, 0.16, { ring: 1.85, wet: 0.46, pan: 0.12 });

  const span = t1 - yes;
  bed(out, yes, span, 'F', 0.5, { cutoff: 1750, attack: 0.06, release: 1.05, wet: 0.34 });
  const bloom = [65, 69, 72, 77, 81, 89];
  bloom.forEach((midi, i) => {
    const t = yes + (span * i) / bloom.length;
    bell(out, t, midi, 0.4 + i * 0.03, { ring: 1.1, wet: 0.32 });
    if (i === bloom.length - 1) bell(out, t, midi - 12, 0.32, { ring: 1.2, wet: 0.3, pan: -0.12 });
  });
  [89, 84, 81].forEach((midi, i) => {
    chime(out, yes + i * 0.08, midi, 0.3 - i * 0.04, { ring: 1.35, wet: 0.4 });
  });
  push(out, 'bass', yes, { midi: 41, vel: 0.5, decay: 0.45, role: 'bass' });
}

function wedding(out, rng) {
  const t0 = spread('wedding').start;
  const cele = BEATS.celebrate;
  const buckets = layStatements(out, rng, t0, cele, [
    { ...WALTZ, lead: 'bell', vel: 0.52, padVel: 0.38, bassVel: 0.36, arpVel: 0.16, arp: 'bell', padCutoff: 1300, padAttack: 0.7, padRelease: 1.5, ring: 1.15, progression: WARM },
    { ...WALTZ, lead: 'bell', vel: 0.56, padVel: 0.44, bassVel: 0.4, arpVel: 0.18, arp: 'chime', padCutoff: 1450, padAttack: 0.6, padRelease: 1.45, ring: 1.2, progression: WARM },
    { ...WALTZ, lead: 'chime', vel: 0.48, padVel: 0.48, bassVel: 0.42, arpVel: 0.16, arp: 'bell', padCutoff: 1550, padAttack: 0.5, padRelease: 1.4, ring: 0.85, progression: LOVE },
    { ...WALTZ, lead: 'bell', vel: 0.62, padVel: 0.52, bassVel: 0.48, arpVel: 0.2, arp: 'bell', padCutoff: 1650, padAttack: 0.45, padRelease: 1.35, ring: 1.25, progression: LOVE },
  ]);
  if (buckets[1]) out.push(...doubleFrom(buckets[1], buckets[1][0] ? buckets[1][0].t : t0, -12, 0.38));
  if (buckets[3]) out.push(...doubleFrom(buckets[3], buckets[3][0] ? buckets[3][0].t : cele, -12, 0.42));

  chime(out, BEATS.iDo, 81, 0.32, { ring: 1.5, wet: 0.4, pan: 0.08 });
  pluck(out, BEATS.notSunday - 0.06, 70, 0.2, { decay: 0.05, pan: 0.25 });
  pluck(out, BEATS.notSunday, 74, 0.15, { decay: 0.055, pan: 0.22 });

  const miles = [
    [BEATS.coworkersMilestone, 72],
    [BEATS.classmatesMilestone, 76],
    [BEATS.dogParentsMilestone, 79],
    [BEATS.homeownersMilestone, 84],
    [BEATS.husbandAndWife, 89],
  ];
  miles.forEach(([t, midi], i) => {
    bell(out, t, midi, 0.26 + i * 0.06, { ring: 1.05 + i * 0.06, wet: 0.3, pan: 0.1 });
    if (i === miles.length - 1) {
      chime(out, t, 84, 0.36, { ring: 1.45, wet: 0.4 });
      chime(out, t, 96, 0.22, { ring: 1.3, wet: 0.42, pan: -0.12 });
      push(out, 'bass', t, { midi: 41, vel: 0.58, decay: 0.5, role: 'bass' });
    }
  });
  [72, 76, 81].forEach((midi, i) => {
    bell(out, BEATS.fullOfFate + i * 0.16, midi, 0.2, { ring: 1.15, wet: 0.32, pan: -0.1 });
  });

  finalCadence(out, cele, END_CARD.start);
  coda(out);
}

/** Dominant anacrusis, tonic on the beat, held until the coda. */
function finalCadence(out, t, holdUntil) {
  const pickup = 0.42;
  bed(out, t - pickup, pickup + 0.05, 'C7', 0.4, { cutoff: 1500, attack: 0.04, release: 0.28 });
  [67, 72, 76].forEach((midi, i) => {
    bell(out, t - pickup + i * 0.1, midi, 0.34, { ring: 0.65, wet: 0.28 });
  });
  const hold = Math.max(0.4, holdUntil - t);
  bed(out, t, hold, 'F', 0.44, { cutoff: 1350, attack: 0.05, release: 1.45, wet: 0.36 });
  [77, 72, 69, 65].forEach((midi, i) => {
    bell(out, t + i * 0.15, midi, 0.52 - i * 0.06, { ring: 1.4, wet: 0.36 });
  });
  push(out, 'bass', t, { midi: 41, vel: 0.6, decay: 0.55, role: 'bass' });
  chime(out, t, 89, 0.28, { ring: 1.55, wet: 0.4 });
}

function coda(out) {
  const t0 = END_CARD.start;
  const t1 = END_CARD.fadeStart;
  const dur = Math.max(0.4, t1 - t0);
  bed(out, t0, dur, 'Fmaj7', 0.26, { cutoff: 880, attack: 0.75, release: 1.8, wet: 0.4, bass: 41 });
  const notes = [76, 72, 69, 65, 60];
  notes.forEach((midi, i) => {
    const t = t0 + (dur * (i + 0.4)) / notes.length;
    if (t < t1 - 0.15) bell(out, t, midi, 0.28 - i * 0.03, { ring: 1.55, wet: 0.42, pan: i % 2 ? -0.14 : 0.12 });
  });
}

function foley(out, rng) {
  const fx = (type, t, props) => push(out, type, t, props);
  fx('click', BEATS.lampOn, { vel: 1 });
  for (const turn of LEAF_TURNS) {
    const coverTurn = turn.leaf === 0;
    const dur = turn.end - turn.start;
    fx('rustle', turn.start, { dur: 0.2, vel: 0.95, off: rng.range(0, 2), pan: 0.35 });
    if (coverTurn) fx('creak', turn.start + 0.04, { vel: 0.85 });
    fx('whoosh', turn.start, {
      dur, len: dur, sustain: true, vel: coverTurn ? 1 : 0.9,
      lo: coverTurn ? 260 : 420, hi: coverTurn ? 1500 : 2400, off: rng.range(0, 3),
    });
    fx('flap', turn.end - 0.06, {
      vel: 1, f: rng.range(2400, 3300), pan: rng.range(-0.25, 0.25), off: rng.range(0, 4),
    });
    if (coverTurn) fx('thump', turn.end + 0.02, { vel: 0.55, f: 88, off: rng.range(0, 4) });
  }
  fx('stamp', BEATS.official, { vel: 1, off: rng.range(0, 3) });

  const prints = ['coworkers', 'ourThing', 'dogWalk', 'cherry', 'home', 'japan', 'photoReveal'];
  for (const name of prints) fx('shutter', BEATS[name], { vel: 1 });

  fx('scratch', BEATS.home - 0.08, { dur: 0.16, vel: 0.75, off: rng.range(0, 1.5), pan: 0.18 });
  fx('scratch', BEATS.home + 0.16, { dur: 0.2, vel: 0.6, off: rng.range(0, 1.5), pan: 0.22 });

  const tickEnd = BEATS.ourThing;
  const tickStart = BEATS.hoursTalking;
  const tickSpan = tickEnd - tickStart;
  if (tickSpan > 0.2) {
    let t = tickStart;
    let i = 0;
    while (t < tickEnd - 0.02 && i < 48) {
      const u = (t - tickStart) / tickSpan;
      fx('tick', t, { vel: 0.42 + 0.4 * u, off: rng.range(0, 1.2) });
      t += 0.5 + (0.1 - 0.5) * u;
      i++;
    }
  }

  const whirrDur = Math.max(0.4, BEATS.apartSeats - BEATS.movies);
  fx('whirr', BEATS.movies, { dur: whirrDur, len: whirrDur, sustain: true, vel: 0.55, off: rng.range(0, 2) });
  fx('schoolBell', BEATS.sameSchool, { vel: 0.9 });

  fx('pop', BEATS.yes, { vel: 1, off: rng.range(0, 2) });
  const miles = [
    'coworkersMilestone', 'classmatesMilestone', 'dogParentsMilestone',
    'homeownersMilestone', 'husbandAndWife',
  ];
  miles.forEach((name, i) => {
    fx('pop', BEATS[name], { vel: 0.7 + i * 0.06, off: rng.range(0, 2) });
  });
}

function buildEvents() {
  const rng = makeRng(20260206);
  const out = [];
  cover(out);
  walmart(out, rng);
  lunch(out, rng);
  dates(out, rng);
  fate(out, rng);
  official(out, rng);
  life(out, rng);
  proposal(out, rng);
  wedding(out, rng);
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
    const urls = [];
    const add = (base, rel) => {
      try { urls.push(new URL(rel, base).href); } catch { /* bad base */ }
    };
    const addRel = (rel) => {
      if (globalThis.document?.baseURI) add(document.baseURI, rel);
      add(import.meta.url, `../${rel}`);
    };
    const exts = ['mp3', 'm4a', 'wav'];
    // Language-specific take first, then the shared file, then an explicit URL.
    for (const ext of exts) addRel(`audio/narration.${LANG}.${ext}`);
    for (const ext of exts) addRel(`audio/narration.${ext}`);
    const explicit = globalThis.window?.__NARRATION_URL;
    if (typeof explicit === 'string' && explicit.trim()) {
      const base = globalThis.document?.baseURI ?? globalThis.location?.href ?? import.meta.url;
      add(base, explicit.trim());
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

/** Theatre organ: chorus detune, optional mixture stop. Sustained notes seek mid-hold. */
function organ(s, e, when, off = 0) {
  const { ctx } = s;
  const f = mtof(e.midi);
  if (!(f > 20)) return;
  const amp = e.vel * LEVEL.organ * clamp((440 / f) ** 0.15, 0.75, 1.3);
  const partials = e.mixture
    ? [[1, 0.48], [2, 0.42], [3, 0.26], [4, 0.3], [6, 0.14]]
    : [[1, 0.72], [2, 0.36], [3, 0.16], [4, 0.18], [6, 0.06]];
  const g = ctx.createGain();
  let stop;
  if (e.sustain) {
    const attack = e.attack ?? 0.06;
    const dur = e.dur ?? 0.4;
    const release = e.release ?? 0.5;
    if (off >= dur) return;
    stop = envelope(g.gain, when, off, attack, dur, release, amp);
  } else {
    const decay = e.decay ?? 0.28;
    const attack = 0.012;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + attack);
    g.gain.setTargetAtTime(0, when + attack, Math.max(0.02, decay / 3.2));
    stop = when + decay * 6 + 0.02;
  }
  const out = s.lane(e.pan ?? 0, e.wet ?? 0.28, true);
  g.connect(out);
  for (const [ratio, level] of partials) {
    if (f * ratio > ctx.sampleRate * 0.45) continue;
    for (const detune of [-6, 7]) {
      const osc = ctx.createOscillator();
      osc.type = ratio >= 4 ? 'sine' : 'triangle';
      osc.frequency.value = f * ratio;
      osc.detune.value = detune;
      const pg = ctx.createGain();
      pg.gain.value = level * 0.5;
      osc.connect(pg).connect(g);
      s.play(osc, when, stop);
    }
  }
}

const VOICES = {
  bell: bellVoice,
  chime: chimeVoice,
  pluck: pluckVoice,
  koto: kotoVoice,
  organ,
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
  tick(s, e, when) {
    const v = e.vel * LEVEL.tick;
    burst(s, when, { f: 2400, q: 2.4, tau: 0.0035, vel: v, pan: 0.04, wet: 0.04, off: e.off || 0.2 });
    ping(s, when, { f: 1250, f1: 860, tau: 0.007, vel: v * 0.32, pan: 0, wet: 0.03 });
  },
  whirr(s, e, when, off = 0) {
    const { ctx, bank } = s;
    const remain = e.dur - off;
    if (remain < 0.05) return;
    const src = ctx.createBufferSource();
    src.buffer = bank.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.85;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    hp.Q.value = 0.6;
    const n = Math.max(2, Math.ceil(remain * 30));
    const body = new Float32Array(n);
    const air = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = off + (remain * i) / (n - 1);
      const fadeIn = Math.min(1, t / 0.2);
      const fadeOut = Math.min(1, (e.dur - t) / 0.28);
      const sprocket = 0.78 + 0.22 * Math.sin(2 * Math.PI * 24 * t);
      body[i] = Math.max(1e-4, e.vel * LEVEL.whirr * fadeIn * fadeOut * sprocket);
      air[i] = body[i] * 0.22;
    }
    const gBody = ctx.createGain();
    gBody.gain.setValueCurveAtTime(body, when, remain);
    const gAir = ctx.createGain();
    gAir.gain.setValueCurveAtTime(air, when, remain);
    const tail = s.lane(0.12, 0.1, false);
    src.connect(bp).connect(gBody).connect(tail);
    src.connect(hp).connect(gAir).connect(tail);
    s.play(src, when, when + remain, ((e.off || 0) + off) % bank.noise.duration);
  },
  scratch(s, e, when) {
    const v = e.vel * LEVEL.scratch;
    crinkle(s, when, { dur: e.dur ?? 0.18, vel: v, off: e.off || 0.4, pan: e.pan ?? 0.2, hp: 2600, wet: 0.06 });
    burst(s, when, { type: 'highpass', f: 3200, q: 0.8, tau: 0.018, vel: v * 0.55, pan: e.pan ?? 0.2, wet: 0.04, off: e.off || 0 });
  },
  schoolBell(s, e, when) {
    const v = e.vel * LEVEL.schoolBell;
    ping(s, when, { f: 784, tau: 0.38, vel: v, pan: 0.08, wet: 0.18 });
    ping(s, when, { f: 1568, tau: 0.22, vel: v * 0.4, pan: 0.1, wet: 0.14 });
    burst(s, when, { f: 1900, q: 1.1, tau: 0.008, vel: v * 0.35, pan: 0.08, wet: 0.06, off: 0.4 });
    ping(s, when + 0.34, { f: 784, tau: 0.42, vel: v * 0.82, pan: 0.06, wet: 0.18 });
    ping(s, when + 0.34, { f: 1568, tau: 0.2, vel: v * 0.28, pan: 0.08, wet: 0.12 });
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
