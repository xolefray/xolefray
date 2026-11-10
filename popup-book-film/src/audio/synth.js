// Synthesis: assets (noise, reverb impulse), the master bus, a playback
// "session" graph, and one function per voice. Everything is written against a
// generic BaseAudioContext so live playback (AudioContext) and the offline
// render (OfflineAudioContext) run exactly the same code.
//
// Voices may start late (t0 < now): envelopes are evaluated at `now` and only
// their remaining breakpoints are scheduled, so a voice joins mid-note at the
// level it would have had. Every voice registers its source nodes; when the
// last one ends, all of its nodes are disconnected.

import { rng } from '../util.js';

// ---------------------------------------------------------------------------
// Envelopes: points [[t, value, 'e'?], ...] relative to the voice start; the
// first point is the initial value, 'e' = exponential ramp (values > 0).
// ---------------------------------------------------------------------------
export function envAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i];
    if (x < p1[0]) {
      const p0 = pts[i - 1];
      const f = (x - p0[0]) / Math.max(1e-9, p1[0] - p0[0]);
      return p1[2] === 'e' && p0[1] > 0 && p1[1] > 0
        ? p0[1] * Math.pow(p1[1] / p0[1], f)
        : p0[1] + (p1[1] - p0[1]) * f;
    }
  }
  return pts[pts.length - 1][1];
}

export function applyEnv(param, pts, t0, now) {
  const rel = now - t0;
  let i = 1;
  if (rel <= 0) {
    param.value = pts[0][1];
    param.setValueAtTime(pts[0][1], t0);
  } else {
    const v = envAt(pts, rel);
    param.value = v;
    param.setValueAtTime(v, now);
    while (i < pts.length && pts[i][0] <= rel) i++;
  }
  for (; i < pts.length; i++) {
    const [t, v, k] = pts[i];
    if (k === 'e') param.exponentialRampToValueAtTime(v, t0 + t);
    else param.linearRampToValueAtTime(v, t0 + t);
  }
}

/** Percussive amplitude envelope: attack to `peak`, exponential decay to -80 dB by `len`. */
const perc = (peak, attack, len) => [[0, 0], [attack, peak], [len, Math.max(1e-6, peak * 1e-4), 'e']];

// ---------------------------------------------------------------------------
// Assets (built once per context, from the seeded rng)
// ---------------------------------------------------------------------------
const assetCache = new WeakMap();
export function getAssets(ac) {
  let A = assetCache.get(ac);
  if (A) return A;
  const sr = ac.sampleRate;
  // white noise, 4 s, looped by long voices
  const NL = Math.floor(sr * 4);
  const noise = ac.createBuffer(1, NL, sr);
  {
    const d = noise.getChannelData(0);
    const r = rng(0xbeef);
    for (let i = 0; i < NL; i++) d[i] = r() * 2 - 1;
  }
  // reverb impulse: 2.8 s stereo, decorrelated decaying noise that darkens as it decays
  const RT = 2.6, IL = Math.floor(sr * 2.8), pre = Math.floor(sr * 0.012);
  const ir = ac.createBuffer(2, IL, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const r = rng(0x5eed + ch * 101);
    let lp = 0;
    for (let i = pre; i < IL; i++) {
      const t = (i - pre) / sr;
      const amp = Math.exp((-6.9 * t) / RT) * Math.min(1, t / 0.02 + 0.2);
      const a = 0.75 - 0.6 * Math.min(1, t / 1.6);   // one-pole coefficient: brighter early, darker late
      lp += a * ((r() * 2 - 1) - lp);
      d[i] = lp * amp;
    }
  }
  A = { noise, ir };
  assetCache.set(ac, A);
  return A;
}

// ---------------------------------------------------------------------------
// Master bus: warmth tilt, gentle glue compression, a safety limiter, level,
// mute. Returns { input, mute }.
// ---------------------------------------------------------------------------
export const MASTER_LEVEL = 0.88;
export function createMaster(ac, destination) {
  const input = ac.createGain();
  input.gain.value = 1;
  const low = ac.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 160; low.gain.value = 1.5;
  const tilt = ac.createBiquadFilter();
  tilt.type = 'highshelf'; tilt.frequency.value = 4200; tilt.gain.value = -4;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 12000; lp.Q.value = 0.5;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.7;   // also removes any DC
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2.5;
  comp.attack.value = 0.02; comp.release.value = 0.3;
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20;
  limit.attack.value = 0.001; limit.release.value = 0.1;
  const level = ac.createGain();
  level.gain.value = MASTER_LEVEL;
  const mute = ac.createGain();
  mute.gain.value = 1;
  input.connect(hp).connect(low).connect(tilt).connect(lp).connect(comp).connect(limit).connect(level).connect(mute).connect(destination);
  return { input, mute, level };
}

// ---------------------------------------------------------------------------
// Session: one continuous playback run. Owns its buses and reverb so a stop
// silences its tail too. Buses: near (music), far (distant), foley.
// ---------------------------------------------------------------------------
/**
 * Connect `srcs` into `dest` so that no node ever sums more than two inputs.
 * Web Audio sums three or more connections in an unspecified order, which
 * changes the last float bits from run to run (and the compressor amplifies
 * that); a sum of two is exact either way. Needed for bit-identical renders.
 */
export function mixInto(ac, srcs, dest, track) {
  let level = srcs.slice();
  while (level.length > 2) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        const g = ac.createGain();
        track(g);
        level[i].connect(g);
        level[i + 1].connect(g);
        next.push(g);
      } else next.push(level[i]);
    }
    level = next;
  }
  for (const n of level) n.connect(dest);
}

export function createSession(ac, masterInput, { autoDispose = true } = {}) {
  const A = getAssets(ac);
  const out = ac.createGain();
  out.gain.value = 1;
  out.connect(masterInput);
  const verb = ac.createConvolver();
  verb.buffer = A.ir;
  const verbOut = ac.createGain();
  verbOut.gain.value = 0.9;
  verb.connect(verbOut);
  const nodes = [out, verb, verbOut];
  const track = (n) => nodes.push(n);
  const dries = [verbOut], sends = [];
  const mkBus = (dry, send, lowpass) => {
    const g = ac.createGain();
    let tail = g;
    if (lowpass) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass; f.Q.value = 0.4;
      g.connect(f);
      tail = f;
      nodes.push(f);
    }
    const d = ac.createGain(); d.gain.value = dry;
    const s = ac.createGain(); s.gain.value = send;
    tail.connect(d);
    tail.connect(s);
    dries.push(d);
    sends.push(s);
    nodes.push(g, d, s);
    return g;
  };
  const buses = {
    near: mkBus(1.0, 0.3),
    far: mkBus(0.55, 0.85, 3600),
    foley: mkBus(1.0, 0.14),
  };
  mixInto(ac, dries, out, track);
  mixInto(ac, sends, verb, track);
  const S = {
    ac, A, out, buses, nodes, voices: new Set(), created: 0, autoDispose,
    pending: { near: [], far: [], foley: [] },
    /** Live: connect a voice to its bus now. Offline: collect, see finish(). */
    connectBus(node, bus) {
      if (!buses[bus]) bus = 'near';
      if (autoDispose) node.connect(buses[bus]);
      else S.pending[bus].push(node);
    },
    /** Offline: wire all collected voices into their buses as two-input trees. */
    finish() {
      for (const bus of Object.keys(S.pending)) {
        mixInto(ac, S.pending[bus], buses[bus], track);
        S.pending[bus] = [];
      }
    },
  };
  return S;
}

export function disposeSession(S) {
  for (const n of S.nodes) { try { n.disconnect(); } catch { /* already */ } }
  S.nodes.length = 0;
}

// ---------------------------------------------------------------------------
// Voice plumbing
// ---------------------------------------------------------------------------
class Voice {
  constructor(S, ev, t0, now) {
    this.S = S; this.ac = S.ac; this.ev = ev; this.t0 = t0; this.now = now;
    this.end = t0 + ev.dur;
    this.start = Math.max(t0, now);
    this.nodes = [];
    this.srcs = [];
    this.live = 0;
  }
  node(n) { this.nodes.push(n); this.S.created++; return n; }
  gain(pts) {
    const g = this.node(this.ac.createGain());
    if (pts) applyEnv(g.gain, pts, this.t0, this.now);
    return g;
  }
  osc(type, freq, detune = 0) {
    const o = this.node(this.ac.createOscillator());
    o.type = type;
    if (Array.isArray(freq)) applyEnv(o.frequency, freq, this.t0, this.now);
    else o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    this.src(o);
    return o;
  }
  noise(offset = 0) {
    const b = this.node(this.ac.createBufferSource());
    b.buffer = this.S.A.noise;
    b.loop = true;
    this.src(b, offset + Math.max(0, this.now - this.t0));
    return b;
  }
  filter(type, freq, Q = 0.7) {
    const f = this.node(this.ac.createBiquadFilter());
    f.type = type;
    if (Array.isArray(freq)) applyEnv(f.frequency, freq, this.t0, this.now);
    else f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }
  src(s, offset) {
    this.srcs.push(s);
    this.live++;
    // Live sessions free a voice as soon as its sources end. An offline render
    // must not: a disconnect from the main thread lands at a random point of
    // the render and would make two renders differ in the last bits.
    if (this.S.autoDispose) s.onended = () => { if (--this.live === 0) this.dispose(); };
    s._offset = offset;
  }
  /** Final stage: optional pan, then the bus. */
  out(pan = this.ev.pan || 0, bus = this.ev.bus || 'near') {
    const g = this.gain();
    let tail = g;
    if (pan) {
      const p = this.node(this.ac.createStereoPanner());
      if (Array.isArray(pan)) applyEnv(p.pan, pan, this.t0, this.now);
      else p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    this.S.connectBus(tail, bus);
    return g;
  }
  go() {
    for (const s of this.srcs) {
      if (s._offset !== undefined) s.start(this.start, s._offset % (s.buffer ? s.buffer.duration : 1));
      else s.start(this.start);
      s.stop(this.end);
    }
    if (this.S.autoDispose) this.S.voices.add(this);
    return this;
  }
  /** Fade-free hard stop at `when` (the session output is already fading). */
  stop(when) {
    for (const s of this.srcs) { try { s.stop(when); } catch { /* not started */ } }
  }
  /** Sum `srcs` into `dest` (two inputs per node at most, see mixInto). */
  mix(srcs, dest) { mixInto(this.ac, srcs, dest, (n) => this.node(n)); }
  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* already */ } }
    for (const s of this.srcs) s.onended = null;
    this.nodes.length = 0;
    this.S.voices.delete(this);
  }
}

// ---------------------------------------------------------------------------
// Voices. Levels are relative; the master sets the overall loudness.
// ---------------------------------------------------------------------------
/** Sum of decaying sine partials: [[ratio, amp, decay, attack?], ...]. */
function partials(V, f, list, vel, outNode) {
  const gs = [];
  for (const [ratio, amp, dec, att = 0.004] of list) {
    if (f * ratio > 16000) continue;
    const o = V.osc('sine', f * ratio);
    const g = V.gain(perc(amp * vel, att, Math.min(dec, V.ev.dur)));
    o.connect(g);
    gs.push(g);
  }
  V.mix(gs, outNode);
}

const VOICES = {
  // Music box comb tine: bright fundamental, a weak octave, a short inharmonic ping.
  mbox(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    partials(V, f, [[1, 0.16, V.ev.dur], [2, 0.035, 1.0], [5.4, 0.022, 0.12, 0.002], [3.01, 0.01, 0.4]], vel, o);
  },
  // Celesta: rounder, a soft "4th partial" shimmer.
  celesta(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const lp = V.filter('lowpass', 5000, 0.5);
    lp.connect(o);
    partials(V, f, [[1, 0.2, V.ev.dur, 0.006], [2, 0.03, 1.4], [3.98, 0.03, 0.5, 0.003], [0.5, 0.012, 1.5, 0.02]], vel, lp);
  },
  // Low marimba / upright: warm pluck with a hint of mallet.
  bass(V) {
    const { f, vel } = V.ev;
    const o = V.out(0);
    const lp = V.filter('lowpass', 700, 0.6);
    lp.connect(o);
    const a = V.osc('triangle', f);
    const ga = V.gain(perc(0.105 * vel, 0.012, V.ev.dur));
    a.connect(ga);
    const b = V.osc('sine', f);
    const gb = V.gain(perc(0.11 * vel, 0.01, V.ev.dur * 0.9));
    b.connect(gb);
    const m = V.osc('sine', f * 4);
    const gm = V.gain(perc(0.03 * vel, 0.003, 0.09));
    m.connect(gm);
    V.mix([ga, gb, gm], lp);
  },
  // Harp pluck.
  harp(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const lp = V.filter('lowpass', Math.min(6000, f * 6), 0.4);
    lp.connect(o);
    const a = V.osc('triangle', f);
    a.connect(V.gain(perc(0.14 * vel, 0.003, V.ev.dur))).connect(lp);
    const b = V.osc('sine', f * 2);
    b.connect(V.gain(perc(0.03 * vel, 0.003, 0.6))).connect(lp);
  },
  // Small bell / star: inharmonic, delicate.
  bell(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    partials(V, f, [[1, 0.12, V.ev.dur, 0.003], [2.76, 0.035, 0.9], [5.4, 0.016, 0.35], [8.93, 0.006, 0.18]], vel, o);
  },
  // Distant clock bell: hum, prime, minor-third tierce, quint, nominal.
  clockbell(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const lp = V.filter('lowpass', 2400, 0.4);
    lp.connect(o);
    partials(V, f / 2, [[1, 0.06, 5.5, 0.01], [2, 0.08, 4.0], [2.4, 0.045, 3.0], [3, 0.03, 2.2], [4, 0.045, 2.6], [5.04, 0.015, 1.2], [6.0, 0.01, 0.8]], vel, lp);
  },
  // Glassy high note: slow-ish attack, two slightly beating sines.
  glass(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const env = [[0, 0], [0.05, 0.06 * vel], [V.ev.dur, 6e-6, 'e']];
    const a = V.osc('sine', f, -3);
    const b = V.osc('sine', f, 3);
    const g = V.gain(env);
    a.connect(g); b.connect(g);
    g.connect(o);
    const h = V.osc('sine', f * 2);
    h.connect(V.gain(perc(0.008 * vel, 0.02, 1.5))).connect(o);
  },
  // Pad: per note two detuned saws (spread L/R) through a soft lowpass.
  pad(V) {
    const { fs, level, a, len, r, cut, cut2 } = V.ev;
    const o = V.out(0);
    const lp = V.filter('lowpass', [[0, cut], [len, cut2]], 0.3);
    const amp = 0.035 * level / Math.sqrt(fs.length);
    const g = V.gain([[0, 0], [a, amp], [len, amp], [len + r, 0]]);
    lp.connect(g).connect(o);
    const pl = V.node(V.ac.createStereoPanner()); pl.pan.value = -0.35; pl.connect(lp);
    const pr = V.node(V.ac.createStereoPanner()); pr.pan.value = 0.35; pr.connect(lp);
    V.mix(fs.map((f, i) => V.osc('sawtooth', f, -7 + i)), pl);
    V.mix(fs.map((f, i) => V.osc('sawtooth', f, 6 - i)), pr);
  },
  // Page-turn whoosh: band-passed noise swept up then down, plus a crackly rustle.
  whoosh(V) {
    const { len, peak, vel, pan0, pan1, f0, f1, rustle } = V.ev;
    const o = V.out([[0, pan0], [len, pan1]], 'foley');
    const n = V.noise((V.ev.t * 0.37) % 3);
    const bp = V.filter('bandpass', [[0, f0], [len * peak, f1, 'e'], [len, f0 * 0.8, 'e']], 0.9);
    const g = V.gain([[0, 0.0001], [len * peak, 0.17 * vel, 'e'], [len, 0.0001, 'e']]);
    n.connect(bp).connect(g).connect(o);
    const n2 = V.noise((V.ev.t * 0.61) % 3);
    const hp = V.filter('highpass', 2800, 0.7);
    const g2 = V.gain(rustle.map(([t, v]) => [t, v * 0.055 * vel]));
    n2.connect(hp).connect(g2).connect(o);
  },
  // A tiny paper "pop": a click of band-passed noise and a falling blip.
  pop(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const n = V.noise((V.ev.t * 1.7) % 3);
    const bp = V.filter('bandpass', f * 1.6, 1.5);
    n.connect(bp).connect(V.gain([[0, 0], [0.002, 0.05 * vel], [0.03, 0.0001, 'e']])).connect(o);
    const s = V.osc('sine', [[0, f], [0.03, f * 0.55, 'e']]);
    s.connect(V.gain([[0, 0], [0.002, 0.03 * vel], [0.05, 0.0001, 'e']])).connect(o);
  },
  // Ratchet tick of a music box being wound.
  tick(V) {
    const { f, vel } = V.ev;
    const o = V.out(0, 'foley');
    const n = V.noise((V.ev.t * 2.3) % 3);
    const bp = V.filter('bandpass', f, 4);
    n.connect(bp).connect(V.gain([[0, 0], [0.001, 0.05 * vel], [0.025, 0.0001, 'e']])).connect(o);
  },
  // Cover creak: stick-slip pulse train through two resonances.
  creak(V) {
    const { len, rate, vel } = V.ev;
    const o = V.out(0.2, 'foley');
    const s = V.osc('sawtooth', rate);
    const b1 = V.filter('bandpass', 950, 7);
    const b2 = V.filter('bandpass', 2300, 5);
    const g = V.gain([[0, 0], [0.12, 0.06 * vel], [len * 0.7, 0.05 * vel], [len, 0]]);
    s.connect(b1).connect(g);
    s.connect(b2).connect(g);
    g.connect(o);
  },
  // Book shutting: low thud with a pitch drop and a short papery slap.
  thump(V) {
    const { vel } = V.ev;
    const o = V.out(0, 'foley');
    const s = V.osc('sine', [[0, 82], [0.22, 44, 'e']]);
    const g1 = s.connect(V.gain([[0, 0], [0.006, 0.2 * vel], [0.7, 0.0001, 'e']]));
    const n = V.noise(0.5);
    const lp = V.filter('lowpass', 420, 0.7);
    const g2 = n.connect(lp).connect(V.gain([[0, 0], [0.004, 0.2 * vel], [0.16, 0.0001, 'e']]));
    const n2 = V.noise(1.5);
    const bp = V.filter('bandpass', 1400, 0.8);
    const g3 = n2.connect(bp).connect(V.gain([[0, 0], [0.003, 0.06 * vel], [0.07, 0.0001, 'e']]));
    V.mix([g1, g2, g3], o);
  },
  // Surf: low-passed noise breathing in and out.
  surf(V) {
    const { len, vel, off } = V.ev;
    const o = V.out();
    const n = V.noise(off);
    const lp = V.filter('lowpass', [[0, 280], [len * 0.42, 1500, 'e'], [len, 300, 'e']], 0.5);
    const g = V.gain([[0, 0], [len * 0.42, 0.075 * vel], [len, 0]]);
    n.connect(lp).connect(g).connect(o);
  },
  // Mountain wind: a gust of band-passed noise with a drifting centre.
  wind(V) {
    const { len, vel, f0, f1, off } = V.ev;
    const o = V.out();
    const n = V.noise(off);
    const bp = V.filter('bandpass', [[0, f0], [len * 0.5, f1, 'e'], [len, f0 * 0.9, 'e']], 1.4);
    const g = V.gain([[0, 0], [len * 0.5, 0.13 * vel], [len, 0]]);
    n.connect(bp).connect(g).connect(o);
  },
  // Cricket: a high sine in four quick pulses.
  cricket(V) {
    const { f, vel } = V.ev;
    const o = V.out();
    const s = V.osc('sine', f);
    const pts = [[0, 0]];
    for (let i = 0; i < 4; i++) {
      const t = i * 0.045;
      pts.push([t + 0.006, 0.02 * vel], [t + 0.03, 0]);
    }
    s.connect(V.gain(pts)).connect(o);
  },
  // Lighthouse: a soft low tone swelling to the flash.
  tone(V) {
    const { f, vel, peakAt } = V.ev;
    const o = V.out(0);
    const env = [[0, 0], [peakAt, 0.075 * vel], [V.ev.dur, 0]];
    const a = V.osc('sine', f);
    a.connect(V.gain(env)).connect(o);
    const b = V.osc('sine', f * 2);
    b.connect(V.gain(env.map(([t, v]) => [t, v * 0.18]))).connect(o);
  },
  // Bird chirp: a quick upward sweep.
  chirp(V) {
    const { f0, f1, vel } = V.ev;
    const o = V.out();
    const s = V.osc('sine', [[0, f0], [0.07, f1, 'e'], [0.11, f1 * 0.85, 'e']]);
    s.connect(V.gain([[0, 0], [0.012, 0.075 * vel], [0.06, 0.05 * vel], [0.11, 0]])).connect(o);
  },
};

/**
 * Start voice `ev` in session S. t0 = context time of the event's start (may be
 * in the past), now = earliest schedulable context time. Returns the Voice or null.
 */
export function playEvent(S, ev, t0, now) {
  if (t0 + ev.dur <= now + 0.005) return null;
  const fn = VOICES[ev.v];
  if (!fn) return null;
  const V = new Voice(S, ev, t0, now);
  fn(V);
  return V.go();
}
