// STUB (T-scaffold) — replaced by the audio owner (T-audio). The synthesis ENGINE below is the
// engine's own (unchanged) and the API is the contract's (createAudio, renderOffline), but the old
// film's SCORE is switched off: buildEvents() only schedules the generic paper foley that follows
// timeline.js (lamp click, cover creak, page whooshes, pop-up flaps, landing thumps) and the final
// fade. SECTIONS / CUES / BEDS / RUSTLES / chimes are the previous film's music, kept only as a
// worked example for the new score; nothing plays them. No narration track yet.
/**
 * audio.js — procedural music-box score and paper foley (engine of "The Little Paper Boat").
 *
 * Everything is synthesized with WebAudio and is deterministic in film time.
 *
 *  SCORE   The music is data: each section lists its melody as [beat, midi, dur, vel] and its
 *          harmony as [beat, chord, dur, vel] (chords voiced in CHORDS); arpeggios are chord-index
 *          patterns. buildEvents() compiles the sections, the free-time prologue/ending cues,
 *          the ambience beds and the foley into ONE sorted list of events in film seconds.
 *  ENGINE  A Session maps film time to AudioContext time and "pumps" events into the graph a
 *          little ahead of the playhead. Live playback (createAudio) is a lookahead scheduler
 *          driven by sync(t, playing) every frame: a seek (|t − expected| > 0.3 s), a pause or a
 *          hidden tab fades the session out in 60 ms and stops its sources; playback resumes with
 *          a fresh session at t (bells and foley that began before t are skipped, sustained pads
 *          and beds restart mid-way). renderOffline() runs the very same Session inside an
 *          OfflineAudioContext, for tests.
 *  GRAPH   voices -> lanes (pan + reverb send) -> session env (end fade) -> session out (stop
 *          fade) -> master (mute) -> high-pass -> compressor -> trim -> destination.
 *
 * Instruments: music-box bell (sine + inharmonic partials, 2 ms attack, exponential decay),
 * pad (detuned triangles through a low-pass, slow attack, soft sine bass), noise beds (sea,
 * wind), and foley built from seeded noise: lamp click, cover creak, page whoosh (band-passed
 * sweep panned right -> left with the leaf), pop-up flaps, landing thumps and paper rustles.
 * Noise, crinkle, creak and reverb buffers are generated once per context with seeded RNGs.
 * If WebAudio is unavailable every method is a silent no-op; no method ever throws.
 */
import { BEATS, DURATION, END_CARD, LEAF_TURNS, ease } from './timeline.js';
import { makeRng, mulberry32 } from './util/rng.js';

const LOOKAHEAD = 0.25; // film seconds scheduled ahead of the playhead
const SEEK_TOLERANCE = 0.3; // |t − expected| above this is a seek
const SETTLE = 0.08; // seconds of steady playback before a new session starts (scrubbing)
const STOP_FADE = 0.06; // fade-out of a stopped session, seconds
const OFFLINE_STEP = 1; // offline renders pump events one second at a time

// Instrument levels (linear). Tuned with dev/audio.html so the mix peaks near −6 dBFS.
const LEVEL = {
  bell: 0.16,
  pad: 0.0135,
  bass: 0.04,
  bed: 0.28,
  whoosh: 1.1,
  flap: 0.5,
  click: 0.45,
  creak: 0.5,
  thump: 0.55,
  rustle: 0.4,
};

// ---------------------------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------------------------

/** Chord voicings, low to high: [root, …] — tones 0..5 feed arpeggios, 1..4 the pads. */
const CHORDS = {
  D: [50, 57, 62, 66, 69, 74],
  Dsus2: [50, 57, 62, 64, 69, 74],
  Bm: [47, 54, 59, 62, 66, 71],
  Em: [52, 59, 64, 67, 71, 76],
  G: [43, 50, 55, 59, 62, 67],
  A: [45, 52, 57, 61, 64, 69],
  A7: [45, 52, 55, 61, 64, 67],
  Asus: [45, 52, 57, 62, 64, 69],
  C: [48, 55, 60, 64, 67, 72],
  Dm: [50, 57, 62, 65, 69, 74],
  Bb: [46, 53, 58, 62, 65, 70],
  Bbmaj7: [46, 53, 57, 62, 65, 69],
};

/**
 * Metered sections. melody: [beat, midi, dur(beats), vel]; chords: [beat, chord, dur, padVel];
 * arps: chord-index patterns walked every `step` beats from `from` to `to`.
 * The 4-bar lullaby motif (D major): F#  E D | A — F# | G F# E | E — — (A) …
 */
const SECTIONS = [
  {
    // The Whispering Forest — the lullaby itself, rocking arpeggios. 3/4 at 72 BPM.
    start: 10,
    bpm: 72,
    meter: 3,
    wet: 0.28,
    pad: { attack: 1.0, release: 1.6, cutoff: 1300 },
    melody: [
      [0, 78, 1.5, 0.72], [1.5, 76, 0.5, 0.58], [2, 74, 1, 0.62], // F#5 . E5 D5
      [3, 81, 2, 0.76], [5, 78, 1, 0.6], //                           A5 —  F#5
      [6, 79, 1, 0.68], [7, 78, 1, 0.58], [8, 76, 1, 0.6], //         G5 F#5 E5
      [9, 76, 2, 0.64], [11, 69, 1, 0.5], //                          E5 —  (A4)
      [12, 78, 1.5, 0.72], [13.5, 76, 0.5, 0.58], [14, 74, 1, 0.62], // F#5 . E5 D5
      [15, 81, 2, 0.74], [17, 86, 1, 0.72], //                        A5 —  D6
      [18, 83, 1, 0.68], [19, 81, 1, 0.6], [20, 73, 1, 0.58], //      B5 A5 C#5
      [21, 74, 3, 0.7], [22.5, 86, 1.5, 0.3], //                      D5 — —  (D6 sparkle)
    ],
    chords: [
      [0, 'D', 6, 0.5], [6, 'Em', 3, 0.5], [9, 'A', 3, 0.5],
      [12, 'D', 3, 0.5], [15, 'Bm', 3, 0.5], [18, 'G', 2, 0.5], [20, 'A7', 1, 0.5], [21, 'D', 4, 0.5],
    ],
    arps: [{ pattern: [0, 1, 2, 3, 2, 1], step: 0.5, from: 0, to: 21.01, vel: 0.28, pan: -0.25, ring: 0.8 }],
  },
  {
    // The Folded Sea — the motif in augmentation, doubled an octave below, rolling-wave
    // arpeggios (a 10-step pattern against the 3/4 bar) and a pad that swells with the waves.
    start: 31,
    bpm: 72,
    meter: 3,
    wet: 0.36,
    double: -12,
    pad: { attack: 1.8, release: 2.0, cutoff: 1000 },
    melody: [
      [0, 78, 3, 0.7], [3, 76, 1, 0.55], [4, 74, 2, 0.6], //          F#5 — — E5 D5 —
      [6, 81, 4, 0.76], [10, 78, 2, 0.6], //                          A5 — — — F#5 —
      [12, 79, 2, 0.68], [14, 78, 2, 0.6], [16, 76, 2, 0.62], //      G5 — F#5 — E5 —
      [18, 76, 3, 0.64], [21, 73, 1.5, 0.52], [22.5, 76, 1.5, 0.56], // E5 — — C#5 . E5 .
    ],
    chords: [
      [0, 'D', 3, 0.36], [3, 'Bm', 3, 0.42], [6, 'G', 3, 0.48], [9, 'D', 3, 0.54],
      [12, 'Em', 3, 0.62], [15, 'G', 3, 0.66], [18, 'A', 3, 0.62], [21, 'A7', 3.5, 0.5],
    ],
    arps: [{ pattern: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1], step: 0.5, from: 0, to: 24, vel: 0.24, pan: -0.3, ring: 0.9 }],
  },
  {
    // The Lantern City (night) — the motif in D minor (aeolian), 60 BPM, sparse quarter-note
    // arpeggios; distant chimes are added by chimes().
    start: 52,
    bpm: 60,
    meter: 3,
    wet: 0.45,
    pad: { attack: 1.5, release: 2.0, cutoff: 760 },
    melody: [
      [0, 77, 1.5, 0.62], [1.5, 76, 0.5, 0.5], [2, 74, 1, 0.55], //   F5 . E5 D5
      [3, 81, 2, 0.66], [5, 77, 1, 0.55], //                          A5 —  F5
      [6, 79, 1, 0.6], [7, 77, 1, 0.52], [8, 76, 1, 0.52], //         G5 F5 E5
      [9, 76, 2, 0.58], [11, 69, 1, 0.45], //                         E5 —  (A4)
      [12, 77, 1.5, 0.5], [13.5, 76, 0.5, 0.42], [14, 74, 1, 0.48], // F5 . E5 D5   (the quiet echo)
      [15, 69, 3, 0.45], //                                           A4 — —
      [18, 72, 1, 0.38], [19, 74, 1, 0.42], //                        C5 D5 -> dawn
    ],
    chords: [
      [0, 'Dm', 3, 0.42], [3, 'Bbmaj7', 3, 0.42], [6, 'C', 3, 0.42], [9, 'Asus', 1.5, 0.42],
      [10.5, 'A', 1.5, 0.42], [12, 'Dm', 3, 0.4], [15, 'Bbmaj7', 3, 0.38], [18, 'C', 1.3, 0.36],
    ],
    arps: [{ pattern: [0, 2, 3, 4, 3, 2], step: 1, from: 0, to: 18.01, vel: 0.24, pan: -0.3, ring: 1.1 }],
  },
  {
    // The Morning Sky (dawn) — the motif in G major, 80 BPM, always-rising arpeggios; from
    // bar 5 a glitter of rising sixteenths as the crane takes off; ends on A7 -> D (89 s).
    start: 71,
    bpm: 80,
    meter: 3,
    wet: 0.3,
    pad: { attack: 0.9, release: 1.6, cutoff: 1800 },
    melody: [
      [0, 83, 1.5, 0.72], [1.5, 81, 0.5, 0.6], [2, 79, 1, 0.62], //   B5 . A5 G5
      [3, 86, 2, 0.76], [5, 83, 1, 0.64], //                          D6 —  B5
      [6, 84, 1, 0.68], [7, 83, 1, 0.6], [8, 81, 1, 0.62], //         C6 B5 A5
      [9, 81, 2, 0.66], [11, 74, 1, 0.55], //                         A5 —  (D5)
      [12, 83, 1.5, 0.74], [13.5, 81, 0.5, 0.62], [14, 79, 1, 0.64], // B5 . A5 G5
      [15, 86, 2, 0.78], [17, 91, 1, 0.74], //                        D6 —  G6
      [18, 88, 1, 0.7], [19, 86, 1, 0.66], [20, 84, 1, 0.64], //      E6 D6 C6
      [21, 85, 3, 0.72], //                                           C#6 — —  -> D6
    ],
    chords: [
      [0, 'G', 6, 0.46], [6, 'C', 3, 0.46], [9, 'D', 3, 0.48], [12, 'G', 3, 0.5],
      [15, 'Em', 3, 0.5], [18, 'C', 3, 0.52], [21, 'A7', 3, 0.5],
    ],
    arps: [
      { pattern: [0, 1, 2, 3, 4, 5], step: 0.5, from: 0, to: 24, vel: 0.28, pan: -0.25, ring: 0.8 },
      { pattern: [2, 3, 4, 5], step: 0.25, from: 12, to: 21, vel: 0.13, pan: 0.45, ring: 0.6, transpose: 12 },
    ],
  },
];

/** Rising run of bells: [t, midi, vel] rows, velocity ramping v0 -> v1. */
function gliss(t0, step, notes, v0, v1) {
  return notes.map((m, i) => [t0 + i * step, m, v0 + ((v1 - v0) * i) / (notes.length - 1)]);
}

/** Free-time cues in film seconds. bells: [t, midi, vel]; pads: [t, chord, dur(s), vel]. */
const CUES = [
  {
    // Prologue: sparse bells as the lamp warms, the motif's head remembered, then a rising
    // glissando as the cover opens.
    wet: 0.4,
    pad: { attack: 4, release: 2.5, cutoff: 900 },
    bells: [
      [0.9, 81, 0.28], [1.75, 86, 0.24], [2.6, 78, 0.28], [3.4, 88, 0.2],
      [4.3, 78, 0.36], [4.9, 76, 0.3], [5.3, 74, 0.34], [6.3, 69, 0.28],
      ...gliss(8.15, 0.11, [62, 69, 74, 76, 81, 86, 88], 0.2, 0.34),
    ],
    pads: [[0.7, 'Dsus2', 9.6, 0.34]],
  },
  {
    // Page turns: a glissando over the outgoing chord (D, A7, C).
    wet: 0.4,
    bells: [
      ...gliss(29.1, 0.1, [62, 66, 69, 74, 78, 81, 86], 0.16, 0.28),
      ...gliss(50.1, 0.1, [57, 61, 64, 67, 69, 73, 76], 0.16, 0.26),
      ...gliss(70.1, 0.1, [60, 64, 67, 72, 76, 79, 84], 0.16, 0.28),
    ],
  },
  {
    // The End: the music resolves on D major, everything is silent by 95.5 s.
    wet: 0.42,
    pad: { attack: 0.5, release: 2.2, cutoff: 1200 },
    bells: [
      [89, 86, 0.62], [89, 50, 0.42],
      ...gliss(89.05, 0.07, [62, 66, 69, 74, 78, 81], 0.3, 0.4),
      [90.7, 93, 0.18], [91.9, 98, 0.13],
    ],
    pads: [[88.9, 'D', 3.6, 0.44]],
  },
];

/** Ambience beds: filtered noise whose level and colour swell like waves / gusts. */
const BEDS = [
  { t: 28.6, dur: 23, vel: 1, filter: 'lowpass', lo: 380, hi: 1300, q: 0.5, period: 6.4, fade: 3, wet: 0.2 }, // the sea
  { t: 76.5, dur: 13.5, vel: 0.4, filter: 'bandpass', lo: 600, hi: 1800, q: 0.7, period: 4.2, fade: 3, wet: 0.3 }, // wind under the wings
];

/** Moments for a small paper rustle (± jitter); the crane's refold adds a run of them. */
const RUSTLES = [12.8, 18.6, 24.2, 34.4, 39.7, 45.3, 55.2, 60.6, 66, 80.4, 86.8];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function bellEvent(t, midi, vel, { pan = 0.1, wet = 0.3, ring = 1 } = {}) {
  return { type: 'bell', layer: 'music', t, midi, vel, pan, wet, ring };
}

function padEvent(t, chord, dur, vel, style, wet) {
  const tones = CHORDS[chord];
  return {
    type: 'pad', layer: 'music', t, dur, len: dur, sustain: true, vel, wet,
    notes: tones.slice(1, 5),
    bass: tones[0] >= 48 ? tones[0] - 12 : tones[0],
    attack: Math.min(style.attack, dur * 0.6),
    release: style.release,
    cutoff: style.cutoff,
  };
}

function chordAt(chords, beat) {
  let name = chords[0][1];
  for (const [b, c] of chords) if (b <= beat + 1e-6) name = c;
  return name;
}

function compileSection(sec, rng, out) {
  const spb = 60 / sec.bpm;
  const at = (beat) => sec.start + beat * spb;
  const jitter = () => rng.range(-0.006, 0.006);
  for (const [beat, midi, dur, vel] of sec.melody) {
    const ring = clamp(0.6 + 0.2 * dur * spb, 0.7, 1.15);
    out.push(bellEvent(at(beat) + jitter(), midi, vel, { pan: 0.12, wet: sec.wet, ring }));
    if (sec.double) out.push(bellEvent(at(beat) + 0.012, midi + sec.double, vel * 0.45, { pan: -0.12, wet: sec.wet, ring }));
  }
  for (const [beat, chord, dur, vel] of sec.chords) out.push(padEvent(at(beat), chord, dur * spb, vel, sec.pad, sec.wet));
  for (const arp of sec.arps) {
    for (let i = 0; ; i++) {
      const beat = arp.from + i * arp.step;
      if (beat >= arp.to) break;
      const midi = CHORDS[chordAt(sec.chords, beat)][arp.pattern[i % arp.pattern.length]] + (arp.transpose ?? 0);
      const downbeat = Math.abs(beat / sec.meter - Math.round(beat / sec.meter)) < 1e-6;
      out.push(bellEvent(at(beat) + jitter(), midi, arp.vel * (downbeat ? 1.2 : 1), { pan: arp.pan, wet: sec.wet, ring: arp.ring }));
    }
  }
}

function compileCue(cue, out) {
  for (const [t, midi, vel] of cue.bells) out.push(bellEvent(t, midi, vel, { wet: cue.wet }));
  for (const [t, chord, dur, vel] of cue.pads ?? []) out.push(padEvent(t, chord, dur, vel, cue.pad, cue.wet));
}

/** Distant chimes over the lantern city: soft, wide, very wet bells at irregular times. */
function chimes(rng, out) {
  for (let t = 53.2; t < 69.5; t += rng.range(1.6, 3)) {
    const pan = rng.pick([-1, 1]) * rng.range(0.45, 0.8);
    out.push(bellEvent(t, rng.pick([81, 86, 88, 93]), rng.range(0.1, 0.18), { pan, wet: 0.7, ring: 1.4 }));
  }
}

function foley(rng, out) {
  const fx = (type, t, props) => out.push({ type, layer: 'foley', t, ...props });
  const rustle = (t, dur, vel) => fx('rustle', t, { dur, vel, off: rng.range(0, 2.2), pan: rng.range(-0.6, 0.6) });
  fx('click', BEATS.lampOn, { vel: 1 });
  for (const turn of LEAF_TURNS) {
    const cover = turn.leaf === 0;
    const dur = turn.end - turn.start;
    if (cover) fx('creak', turn.start, { vel: 1 });
    fx('whoosh', turn.start, {
      dur, len: dur, sustain: true, vel: cover ? 1 : 0.9,
      lo: cover ? 260 : 420, hi: cover ? 1500 : 2400, off: rng.range(0, 3),
    });
    // pop-up pieces snapping erect as the new spread finishes opening
    for (let k = 0; k < 3; k++) {
      fx('flap', turn.end - 0.42 + k * 0.16 + rng.range(-0.03, 0.03), {
        vel: 1 - 0.25 * k, f: rng.range(2300, 3400), pan: rng.range(-0.35, 0.35), off: rng.range(0, 5),
      });
    }
    // the turned leaf lands on the left-hand stack
    fx('thump', turn.end + 0.02, { vel: cover ? 1 : 0.45, f: cover ? 90 : 140, off: rng.range(0, 5) });
  }
  // STUB: the old film's timed rustles (RUSTLES, boat -> crane) are not scheduled.
  void rustle;
}

/** The whole film as one sorted event list (pure data, film seconds). */
function buildEvents() {
  const rng = makeRng(20261110);
  const out = [];
  // STUB (T-scaffold): no score. The previous film's music stays compiled-out:
  //   for (const cue of CUES) compileCue(cue, out);
  //   for (const sec of SECTIONS) compileSection(sec, rng, out);
  //   chimes(rng, out);
  //   for (const bed of BEDS) out.push({ type: 'bed', layer: 'ambience', len: bed.dur, sustain: true, ...bed });
  void [CUES, SECTIONS, BEDS, RUSTLES, compileCue, compileSection, chimes];
  foley(rng, out);
  const fadeLen = Math.max(0.5, END_CARD.end - END_CARD.fadeStart - 0.5);
  out.push({ type: 'fade', layer: 'master', t: END_CARD.fadeStart, dur: fadeLen, len: fadeLen, sustain: true });
  return out.sort((a, b) => a.t - b.t);
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

  // Paper crinkle: clusters of tiny crackles.
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

  // Book-binding creak: stick-slip pulses, fastest in the middle of the stretch.
  const creak = makeBuffer(ctx, 1, 1.1, (d, sr) => {
    const rnd = mulberry32(37);
    const dur = d.length / sr;
    for (let t = 0.01; t < dur - 0.02; ) {
      const env = Math.pow(Math.sin((Math.PI * t) / dur), 0.8);
      const f = 600 + 500 * rnd();
      const amp = env * (0.6 + 0.4 * rnd());
      addGrain(d, sr, Math.floor(t * sr), f, 0.003 + 0.003 * rnd(), amp);
      addGrain(d, sr, Math.floor(t * sr), f * 1.9, 0.002, amp * 0.4);
      t += 1 / (45 + 80 * env + 20 * (rnd() - 0.5));
    }
    normalize(d, 0.9);
  });

  // Small warm room: decorrelated stereo noise tail (T60 ≈ 2.2 s) that darkens as it decays,
  // a few early reflections, 12 ms pre-delay.
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
// Voices — each (session, event, when, offset): offset > 0 restarts a sustained event mid-way
// ---------------------------------------------------------------------------------------------

/** Music-box tine / celesta partials: [frequency ratio, level, decay factor]. */
const BELL_PARTIALS = [
  [1, 1, 1],
  [2.0012, 0.3, 0.5],
  [4.16, 0.11, 0.2],
  [5.43, 0.06, 0.12],
  [8.93, 0.04, 0.05],
];

function bell(s, e, when) {
  const { ctx } = s;
  const f = mtof(e.midi);
  const t60 = clamp(3.2 * Math.sqrt(261.63 / f), 0.9, 4.5) * e.ring;
  const amp = e.vel * LEVEL.bell * clamp(Math.pow(440 / f, 0.25), 0.7, 1.4);
  const out = s.lane(e.pan, e.wet);
  for (const [ratio, level, decay] of BELL_PARTIALS) {
    if (f * ratio > ctx.sampleRate * 0.45) break;
    const osc = ctx.createOscillator();
    osc.frequency.value = f * ratio;
    const g = ctx.createGain();
    const len = t60 * decay;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp * level, when + 0.002);
    g.gain.setTargetAtTime(0, when + 0.002, len / 6.9);
    osc.connect(g).connect(out);
    s.play(osc, when, when + len + 0.02);
  }
}

/** Attack / hold / release on an AudioParam, entered `off` seconds late; returns the stop time. */
function envelope(p, when, off, attack, dur, release, peak) {
  const fadeIn = off > 0 ? 0.15 : 0;
  const x = off + fadeIn;
  p.setValueAtTime(0, when);
  if (x < attack) {
    if (fadeIn) p.linearRampToValueAtTime((peak * x) / attack, when + fadeIn);
    p.linearRampToValueAtTime(peak, when + attack - off);
  } else {
    p.linearRampToValueAtTime(peak, when + fadeIn);
  }
  const releaseAt = when + Math.max(dur - off, fadeIn);
  p.setValueAtTime(peak, releaseAt);
  p.setTargetAtTime(0, releaseAt, release / 5);
  return releaseAt + release;
}

function pad(s, e, when, off) {
  const { ctx } = s;
  const g = ctx.createGain();
  const stop = envelope(g.gain, when, off, e.attack, e.dur, e.release, e.vel * LEVEL.pad);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const opened = Math.min(off / e.attack, 1);
  filter.frequency.setValueAtTime(e.cutoff * (0.55 + 0.45 * opened), when);
  if (opened < 1) filter.frequency.linearRampToValueAtTime(e.cutoff, when + e.attack - off);
  filter.connect(g).connect(s.lane(0, e.wet));
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
  const bass = ctx.createOscillator();
  bass.frequency.value = mtof(e.bass);
  const bassGain = ctx.createGain();
  bassGain.gain.value = LEVEL.bass / LEVEL.pad;
  bass.connect(bassGain).connect(g);
  s.play(bass, when, stop);
}

/** Wave-like swell 0..1 at `x` seconds into a bed. */
function swell(x, period) {
  const a = 0.5 + 0.5 * Math.sin((2 * Math.PI * x) / period);
  const b = 0.5 + 0.5 * Math.sin((2 * Math.PI * x) / (period * 1.618) + 1.3);
  return clamp(0.75 * a * a + 0.25 * b, 0, 1);
}

function bed(s, e, when, off) {
  const { ctx, bank } = s;
  const remain = e.dur - off;
  if (remain < 0.05) return;
  const n = Math.max(2, Math.ceil(remain * 20));
  for (const side of [-1, 1]) {
    const lag = side > 0 ? 1.1 : 0; // the swell reaches the right channel a moment later
    const gains = new Float32Array(n);
    const freqs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = off + (remain * i) / (n - 1);
      const w = swell(x - lag, e.period);
      const fade = clamp(Math.min(x / e.fade, (e.dur - x) / e.fade), 0, 1);
      gains[i] = e.vel * LEVEL.bed * fade * fade * (3 - 2 * fade) * (0.25 + 0.75 * w);
      freqs[i] = e.lo + (e.hi - e.lo) * w;
    }
    const src = ctx.createBufferSource();
    src.buffer = bank.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = e.filter;
    filter.Q.value = e.q;
    filter.frequency.setValueCurveAtTime(freqs, when, remain);
    const g = ctx.createGain();
    g.gain.setValueCurveAtTime(gains, when, remain);
    src.connect(filter).connect(g).connect(s.lane(side * 0.55, e.wet));
    s.play(src, when, when + remain, (off + (side > 0 ? 2.9 : 0)) % bank.noise.duration);
  }
}

/** Page turn: band-passed noise swept with the leaf's speed, panned right -> left. */
function whoosh(s, e, when, off) {
  const { ctx, bank } = s;
  const remain = e.dur - off;
  if (remain < 0.05) return;
  const n = Math.max(2, Math.ceil(remain * 100));
  const body = new Float32Array(n);
  const air = new Float32Array(n);
  const freq = new Float32Array(n);
  const pan = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (off + (remain * i) / (n - 1)) / e.dur;
    const speed = (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u)) / 3; // |d/du inOutCubic| / max
    const flutter = 1 + 0.18 * Math.sin(2 * Math.PI * 13 * u * e.dur + e.off);
    body[i] = e.vel * LEVEL.whoosh * Math.pow(speed, 1.4) * flutter;
    air[i] = body[i] * 0.35;
    freq[i] = e.lo * Math.pow(e.hi / e.lo, Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 1.5));
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
  let tail = s.lane(0, 0.25);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueCurveAtTime(pan, when, remain);
    panner.connect(tail);
    tail = panner;
  }
  src.connect(bp).connect(gBody).connect(tail);
  src.connect(hp).connect(gAir).connect(tail);
  s.play(src, when, when + remain, (e.off + off) % bank.noise.duration);
}

/** Short filtered noise burst with an exponential tail. */
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
  g.gain.setTargetAtTime(0, when + 0.0015, tau);
  src.connect(filter).connect(g).connect(s.lane(pan, wet));
  s.play(src, when, when + 0.0015 + tau * 7, off % 5);
}

/** Short sine ping, optionally gliding f -> f1. */
function ping(s, when, { f, f1 = f, tau, vel, pan = 0, wet = 0.15 }) {
  const { ctx } = s;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f, when);
  if (f1 !== f) osc.frequency.exponentialRampToValueAtTime(f1, when + tau * 3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.003);
  g.gain.setTargetAtTime(0, when + 0.003, tau);
  osc.connect(g).connect(s.lane(pan, wet));
  s.play(osc, when, when + 0.003 + tau * 7);
}

/** A snippet of the crinkle buffer through a high-pass, with a soft fade in and out. */
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
  g.gain.setValueAtTime(vel, when + dur - fade);
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(filter).connect(g).connect(s.lane(pan, wet));
  s.play(src, when, when + dur, off);
}

const VOICES = {
  bell,
  pad,
  bed,
  whoosh,
  click(s, e, when) {
    // switch pressed … and released
    const v = e.vel * LEVEL.click;
    burst(s, when, { f: 3800, q: 1.6, tau: 0.0035, vel: v, pan: 0.4, wet: 0.12, off: 1.3 });
    ping(s, when, { f: 1900, tau: 0.006, vel: v * 0.25, pan: 0.4, wet: 0.12 });
    burst(s, when + 0.065, { f: 2700, q: 1.6, tau: 0.003, vel: v * 0.5, pan: 0.4, wet: 0.12, off: 2.1 });
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
    src.connect(filter).connect(g).connect(s.lane(0.3, 0.25));
    s.play(src, when, when + bank.creak.duration);
  },
  flap(s, e, when) {
    const v = e.vel * LEVEL.flap;
    burst(s, when, { f: e.f, q: 0.9, tau: 0.016, vel: v, pan: e.pan, wet: 0.22, off: e.off });
    burst(s, when + 0.004, { type: 'lowpass', f: 380, q: 0.7, tau: 0.03, vel: v * 0.9, pan: e.pan, wet: 0.15, off: e.off + 0.5 });
    crinkle(s, when, { dur: 0.06, vel: v * 0.5, off: e.off % 2.5, pan: e.pan, hp: 2500 });
  },
  thump(s, e, when) {
    const v = e.vel * LEVEL.thump;
    ping(s, when, { f: e.f * 1.6, f1: e.f * 0.7, tau: 0.06, vel: v, pan: -0.35, wet: 0.15 });
    burst(s, when, { type: 'lowpass', f: 420, q: 0.7, tau: 0.028, vel: v * 0.6, pan: -0.35, wet: 0.15, off: e.off });
  },
  rustle(s, e, when) {
    crinkle(s, when, { dur: e.dur, vel: e.vel * LEVEL.rustle, off: e.off, pan: e.pan });
  },
  fade(s, e, when, off) {
    const p = s.env.gain;
    p.setValueAtTime(1 - off / e.dur, when);
    p.linearRampToValueAtTime(0, when + e.dur - off);
  },
};

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

/** Master chain shared by every session of one context. */
function createGraph(ctx) {
  const bank = createBank(ctx);
  const input = ctx.createGain();
  const mute = ctx.createGain();
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 30;
  highpass.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.3;
  const trim = ctx.createGain();
  trim.gain.value = 0.95;
  input.connect(mute).connect(highpass).connect(comp).connect(trim).connect(ctx.destination);
  return { bank, input, mute };
}

/**
 * One continuous stretch of playback: film time filmT0 plays at context time ctxT0. Owns its
 * own reverb so that stopping it silences tails too. `layers` (optional) filters event layers.
 */
class Session {
  constructor(ctx, graph, filmT0, ctxT0, layers = null) {
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
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = graph.bank.ir;
    this.reverb.connect(this.env);
    this.env.connect(this.out);
    this.out.connect(graph.input);
    this.idx = firstEventAtOrAfter(filmT0);
    for (const e of SUSTAINED) {
      if (e.t < filmT0 && e.t + e.len > filmT0 + 0.1) this.schedule(e, filmT0 - e.t);
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
    const when = Math.max(this.ctxT0 + (e.t + off - this.filmT0), this.ctx.currentTime);
    VOICES[e.type](this, e, when, off);
    this.count++;
  }

  /** Bus with a stereo position and a reverb send (cached per quantized pan/wet). */
  lane(pan = 0, wet = 0.25) {
    const p = Math.round(pan * 10) / 10;
    const w = Math.round(wet * 20) / 20;
    const key = `${p}|${w}`;
    let node = this.lanes.get(key);
    if (!node) {
      const { ctx } = this;
      node = ctx.createGain();
      let tail = node;
      if (p !== 0 && ctx.createStereoPanner) {
        tail = ctx.createStereoPanner();
        tail.pan.value = p;
        node.connect(tail);
      }
      tail.connect(this.env);
      if (w > 0) {
        const send = ctx.createGain();
        send.gain.value = w;
        tail.connect(send).connect(this.reverb);
      }
      this.lanes.set(key, node);
    }
    return node;
  }

  play(src, start, stop, offset = 0) {
    src.onended = () => {
      this.sources.delete(src);
      src.disconnect();
    };
    this.sources.add(src);
    src.start(start, offset);
    src.stop(stop);
  }

  /** Fade out quickly, stop every source and drop the session's graph. */
  stop() {
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
    }
    g.linearRampToValueAtTime(0, now + STOP_FADE);
    for (const src of this.sources) {
      try {
        src.stop(now + STOP_FADE + 0.02);
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    const out = this.out;
    setTimeout(() => out.disconnect(), (STOP_FADE + 0.25) * 1000);
  }
}

/**
 * Live audio for the film. start() must be called from a user gesture (it creates/resumes the
 * AudioContext); sync(t, playing) every frame keeps the score locked to film time.
 * `stats` (read-only diagnostics for dev/audio.html): context state, sessions started,
 * events scheduled, live sources.
 */
export function createAudio() {
  let ctx = null;
  let graph = null;
  let session = null;
  let pending = null; // { t, c } — candidate start while the playhead settles after a seek
  let lead = 0; // output latency: events are scheduled this much early so they are heard on time
  let muted = false;
  let sessions = 0;
  let scheduled = 0;

  const halt = () => {
    pending = null;
    if (!session) return;
    const s = session;
    session = null;
    scheduled += s.count;
    try {
      s.stop();
    } catch {
      // the context is gone
    }
  };
  const onVisibility = () => {
    if (document.hidden) halt();
  };

  return {
    async start() {
      try {
        if (!ctx) {
          const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AC) return;
          const c = new AC({ latencyHint: 'interactive' });
          graph = createGraph(c);
          graph.mute.gain.value = muted ? 0 : 1;
          ctx = c;
          globalThis.document?.addEventListener('visibilitychange', onVisibility);
        }
        if (ctx.state !== 'running') {
          await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
        }
      } catch {
        // audio is optional — the film plays silently
      }
    },

    sync(t, playing) {
      try {
        if (!ctx) return;
        if (!playing || ctx.state !== 'running' || t >= DURATION) {
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
          session = new Session(ctx, graph, Math.max(0, t), now - lead);
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
        if (graph) graph.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.04);
      } catch {
        // no context
      }
    },

    get muted() {
      return muted;
    },

    get stats() {
      return {
        state: ctx ? ctx.state : 'unavailable',
        sessions,
        scheduled: scheduled + (session ? session.count : 0),
        live: session ? session.sources.size : 0,
      };
    },
  };
}

/**
 * Test helper: render film time [fromT, toT) to a stereo AudioBuffer with an
 * OfflineAudioContext, using the same Session scheduling as live playback (events are pumped
 * one second ahead while rendering). `layers` optionally restricts the mix, e.g. ['foley'].
 * Resolves to null if OfflineAudioContext is unavailable.
 */
export async function renderOffline(fromT, toT, sampleRate = 22050, { layers = null } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return null;
  const span = toT - fromT;
  const ctx = new OAC(2, Math.max(1, Math.ceil(span * sampleRate)), sampleRate);
  const session = new Session(ctx, createGraph(ctx), fromT, 0, layers);
  const pumpTo = (k) => session.pump(Math.min(fromT + k * OFFLINE_STEP + LOOKAHEAD, toT));
  if (typeof ctx.suspend === 'function') {
    pumpTo(1);
    const plan = (k) => {
      if (k * OFFLINE_STEP >= span) return;
      ctx.suspend(k * OFFLINE_STEP).then(() => {
        try {
          pumpTo(k + 1);
          plan(k + 1);
        } finally {
          ctx.resume();
        }
      });
    };
    plan(1);
  } else {
    session.pump(toT);
  }
  return ctx.startRendering();
}
