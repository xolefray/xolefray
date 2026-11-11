/**
 * camera.js — director of photography for "Our Love Story" (contract §5 "src/camera.js").
 *
 * createCameraRig(camera, { getCues }) → { update(t), aim }.
 * `getCues()` returns [{ t, hold, at: Vector3 (world), size, from, spread }], sorted by t.
 * The list may be replaced or mutated while the page loads; update() re-reads it and rebuilds
 * only when it actually changes. `aim` is the look-at point written by the last update
 * (a stable object, for the dev harness).
 *
 * The rig knows the book, the timeline and the cue list — nothing about a particular spread.
 * Its own shots are the prologue (lamp on, a slow approach to the closed cover), every page
 * turn (a wide, slightly high, centred view from 0.4 s before the turn until it ends) and the
 * end card (a slow pull back and up, the open book under the names). Between those it travels
 * cue to cue: arrive at each cue's t, rest for its hold (a slow drift, never a hard lock),
 * and ease on. Cues closer than about 1.2 s are blended through instead of stopped at.
 *
 * Channels are cubic Hermite with Fritsch–Butland tangents, so a move never overshoots a key
 * and velocity is continuous (C1). Holds are two identical keys with zero tangents. Pure in t,
 * seekable both ways, no per-frame allocation, finite even with an empty cue list.
 *
 * Narrow frames (aspect under the 1.5 reference, and especially under ~1.4) widen the lens and
 * dolly back so the open book (width 2 × PAGE_W) or the cue's size stays in frame. Wider frames
 * keep the vertical view and show more desk. Handheld drift — a few slow sines, a little more
 * on wide shots, plus a faint lens breath — is off under prefers-reduced-motion.
 */
import { BEATS, DURATION, END_CARD, LEAF_TURNS, SPREADS, clamp } from './timeline.js';
import { PAGE_D, PAGE_W } from './dims.js';
import { BOOK } from './book.js';

const DEG = Math.PI / 180;
const REF_ASPECT = 1.5; // shots are composed for this; narrower screens keep its horizontal coverage
const MAX_FOV = 62;
const TURN_LEAD = 0.4; // be on the wide turn shot this long before the leaf moves
const BLEND_GAP = 1.2; // cues closer than this flow through each other instead of resting
const MIN_TRAVEL = 1.05; // seconds kept free so a rest can ease into the next key
const MIN_DIST = 3.4; // stay off the pages and the pop-ups
const CH = 8; // px py pz · tx ty tz · fov · shake
const OPEN_W = PAGE_W * 2; // open scrapbook, gutter to fore-edge, both pages

/**
 * Preferred side → azimuth (0 = reader's side, +Z) and elevation, degrees.
 * Left / right stay on the reader's side of the gutter.
 */
const FROM = {
  front: { az: 0, el: 40 },
  left: { az: -34, el: 32 },
  right: { az: 34, el: 32 },
  high: { az: 0, el: 58 },
  low: { az: 0, el: 16 },
};

const DRIFT_AIM = 0.0042; // handheld aim wander × camera-target distance × shake
const DRIFT_POS = 0.0034; // handheld position wander × distance × shake
const DRIFT_ROLL = 0.0024; // handheld roll, radians × shake
const BREATH = 0.18; // lens breathing, degrees of fov × shake
const DOLLY = 0.007; // slow in-out along the view, fraction of distance × shake

/**
 * Printed-surface height of a fully open spread. The cover boards (BOOK.COVER_T) sit outside the
 * count; the taller pile of inner cards (BOOK.BOARD_T) sets the height. Works for any LEAVES.
 */
function openPageY(k) {
  const innerBefore = Math.max(0, k - 1);
  const innerAfter = Math.max(0, BOOK.LEAVES - 1 - k);
  return BOOK.COVER_T + Math.max(innerBefore, innerAfter) * BOOK.BOARD_T;
}
const COVER_TOP = 2 * BOOK.COVER_T + (BOOK.LEAVES - 2) * BOOK.BOARD_T; // closed book, outer face of the front cover

const EMPTY = [];

function fromCode(name) {
  switch (name) {
    case 'left': return 1;
    case 'right': return 2;
    case 'high': return 3;
    case 'low': return 4;
    default: return 0;
  }
}

function fovFor(size) {
  if (size >= 6.8) return 35.5;
  if (size >= 4.4) return 33.5;
  return 31.5;
}

/** Wider shots carry a little more life; close-ups stay steadier. */
function shakeFor(size) {
  return clamp(0.3 + size / 13, 0.3, 1);
}

/**
 * Distance that fits `size` across a REF_ASPECT frame, with air. Pop-ups stand much shorter
 * than a spread is wide, so the vertical fit uses that shorter height — a wide diameter must
 * not drag the camera back until the book is a postage stamp, and a close cue must actually
 * come close.
 */
function distanceFor(size, fov) {
  const halfV = Math.tan(fov * DEG * 0.5);
  const halfH = halfV * REF_ASPECT;
  // Close cues are a region of a page. They need more air than a whole-spread
  // wide, or the near edge drops into the caption band.
  const close = size < 5.2;
  const margin = close ? 1.46 : 1.2;
  const dH = (size * 0.5 * margin) / halfH;
  const tall = Math.min(size * (close ? 0.66 : 0.48), 2.5);
  const dV = (tall * 0.5 * 1.22) / halfV;
  return Math.max(MIN_DIST, dH, dV);
}

/**
 * Look-at point that places (cx, cy, cz) at vertical NDC `ndcY` (−1 bottom … +1 top).
 * Positive ndcY lifts the subject above centre, clear of the caption band.
 */
function aimBias(px, py, pz, cx, cy, cz, fov, ndcY) {
  let vx = cx - px;
  let vy = cy - py;
  let vz = cz - pz;
  const dist = Math.hypot(vx, vy, vz) || 1;
  vx /= dist;
  vy /= dist;
  vz /= dist;
  // Camera up, robust when the view is nearly vertical (a high shot).
  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (vy > 0.96) uy = -1;
  else if (Math.abs(vy) > 0.92) {
    ux = 0;
    uy = 0;
    uz = 1;
  }
  let rx = vy * uz - vz * uy;
  let ry = vz * ux - vx * uz;
  let rz = vx * uy - vy * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const cux = ry * vz - rz * vy;
  const cuy = rz * vx - rx * vz;
  const cuz = rx * vy - ry * vx;
  const beta = Math.atan((ndcY || 0) * Math.tan(fov * DEG * 0.5));
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const fx = vx * cb - cux * sb;
  const fy = vy * cb - cuy * sb;
  const fz = vz * cb - cuz * sb;
  return [px + fx * dist, py + fy * dist, pz + fz * dist];
}

/** Camera pose orbiting (cx, cy, cz): dist, azimuth, elevation, then the caption/title bias. */
function place(cx, cy, cz, dist, azDeg, elDeg, fov, ndcY, size) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const d = Math.max(MIN_DIST, dist);
  const ce = Math.cos(el);
  const px = cx + d * ce * Math.sin(az);
  const py = cy + d * Math.sin(el);
  const pz = cz + d * ce * Math.cos(az);
  const aim = aimBias(px, py, pz, cx, cy, cz, fov, ndcY);
  return { px, py, pz, tx: aim[0], ty: aim[1], tz: aim[2], fov, shake: shakeFor(size) };
}

function cuePose(c) {
  const size = clamp(Number(c.size) || OPEN_W + 0.3, 1.2, 12);
  const fov = fovFor(size);
  const spec = FROM[c.from] || FROM.front;
  // A front or low view looks along the page depth, so the near edge needs extra room.
  const pad = spec === FROM.front || spec === FROM.low ? 1.4 : 1;
  return place(c.at.x, c.at.y, c.at.z, distanceFor(size, fov) * pad, spec.az, spec.el, fov, 0.08, size);
}

/** Wide, slightly high, centred on the gutter — the turning page rises through the middle of this. */
function turnPose() {
  // The upright page's near corner (about y 3.84, z +1.56) must clear the title
  // tag, and the near edge of the open book must stay above the caption band.
  return place(0, 1.55, 0, 12.45, 0, 41, 35, -0.02, 8.2);
}

function widePose(k) {
  const y = openPageY(k) + 0.4;
  const fov = 35.5;
  const size = OPEN_W + 0.4;
  return place(0, y, 0, distanceFor(size, fov), 0, 37, fov, 0.08, size);
}

// ------------------------------------------------------------------------------ prologue / end

function addPrologue(shots, arrive) {
  // Closed cover: x ∈ [0, PAGE_W], z ∈ [−PAGE_D/2, PAGE_D/2], top at COVER_TOP.
  // A slow push toward the title, from a little off to the right, as the lamp warms.
  const y = COVER_TOP + 0.06;
  const z = -PAGE_D * 0.02;
  // Hold the cover read until shortly before the first turn, then ease out to the wide.
  const tA = clamp(BEATS.lampOn + 2.15, 1.1, arrive * 0.42);
  const tB = clamp(arrive - 1.9, tA + 1.4, arrive - 1.4);
  const keys = [
    { t: 0, x: PAGE_W * 0.54, dist: 7.5, az: 9, el: 54, fov: 33, ndc: 0.14, size: 5.8 },
    { t: tA, x: PAGE_W * 0.5, dist: 6.55, az: 5, el: 51, fov: 32.5, ndc: 0.16, size: 4.9 },
    { t: tB, x: PAGE_W * 0.47, dist: 5.85, az: 2, el: 48, fov: 32, ndc: 0.24, size: 4.4 },
  ];
  for (const k of keys) {
    if (!(k.t < arrive - 0.45)) continue;
    shots.push({
      t: k.t, hold: 0, rest: false, protect: true, tag: 'prologue',
      ...place(k.x, y, z, k.dist, k.az, k.el, k.fov, k.ndc, k.size),
    });
  }
}

function addEnd(shots) {
  // Look above the page so the open pop-up sits in the lower ~55% and the
  // names have dark room overhead. A small size keeps the end shot steady.
  const y = openPageY(SPREADS.length) + 0.85;
  const e0 = END_CARD.start;
  const e2 = DURATION;
  const e1 = e0 + (e2 - e0) * 0.42;
  const keys = [
    { t: e0, dist: 12.6, el: 33.5, ndc: -0.4, fov: 32 },
    { t: e1, dist: 12.95, el: 34.5, ndc: -0.43, fov: 32.3 },
    { t: e2, dist: 13.25, el: 35.2, ndc: -0.45, fov: 32.6 },
  ];
  for (const k of keys) {
    shots.push({
      t: k.t, hold: 0, rest: false, protect: true, tag: 'end',
      ...place(0, y, 0.05, k.dist, 0, k.el, k.fov, k.ndc, 1.6),
    });
  }
}

function insideTurn(t) {
  for (let i = 0; i < LEAF_TURNS.length; i++) {
    const tr = LEAF_TURNS[i];
    if (t > tr.start - TURN_LEAD + 0.02 && t < tr.end + 0.15) return true;
  }
  return false;
}

/**
 * A scene cue is only a shot while its spread is open. Beats that version 1 parked inside a spread
 * and version 2 moved past that spread's close would otherwise yank the camera onto a closed page.
 * A cue at the spread's open (or up to 0.2 s before it) is kept. The wedding never closes.
 */
function cueOnOpenSpread(c) {
  const k = c.spread;
  if (!(k >= 1)) return true;
  const s = SPREADS[k - 1];
  if (!s) return false;
  if (c.t < s.open - 0.2) return false;
  if (s.close != null && c.t > s.close - 0.02) return false;
  return true;
}

function validCue(c) {
  const a = c && c.at;
  if (!c || !Number.isFinite(c.t) || !a) return false;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) return false;
  if (Math.abs(a.x) > 18 || a.y < -1 || a.y > 10 || Math.abs(a.z) > 12) return false;
  if (c.t < -0.5 || c.t > DURATION + 0.5) return false;
  return true;
}

/**
 * Knots: one or two per shot. A rest becomes a pair of identical keys (arrive, depart) so the
 * Hermite between them is constant and the camera leaves and arrives at rest.
 */
function buildKnots(cues) {
  const shots = [];
  const first = LEAF_TURNS[0];
  const arrive0 = first ? first.start - TURN_LEAD : 8;

  addPrologue(shots, arrive0);

  for (let i = 0; i < LEAF_TURNS.length; i++) {
    const tr = LEAF_TURNS[i];
    if (!(tr.end > tr.start)) continue;
    const lead = Math.min(TURN_LEAD, (tr.end - tr.start) * 0.35);
    const t = tr.start - lead;
    shots.push({ t, hold: tr.end - t, rest: true, protect: true, tag: 'turn', ...turnPose() });
  }

  const list = [];
  for (let i = 0; i < cues.length; i++) if (validCue(cues[i])) list.push(cues[i]);
  list.sort((a, b) => a.t - b.t || a.spread - b.spread);

  const seenSpread = new Uint8Array(SPREADS.length + 1);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.spread >= 1 && c.spread < seenSpread.length && cueOnOpenSpread(c)) seenSpread[c.spread] = 1;
    if (!cueOnOpenSpread(c)) continue;
    if (insideTurn(c.t)) continue;
    if (c.t >= END_CARD.start - 0.08) continue;
    if (first && c.t < first.start - TURN_LEAD - 0.05) continue;
    const hold = clamp(Number.isFinite(c.hold) ? c.hold : 1.4, 0, 14);
    shots.push({ t: c.t, hold, rest: true, protect: false, tag: 'cue', ...cuePose(c) });
  }

  for (let i = 0; i < SPREADS.length; i++) {
    const s = SPREADS[i];
    if (seenSpread[s.k]) continue;
    const turn = LEAF_TURNS[s.k - 1];
    const t = (turn ? turn.end : s.open) + 0.2;
    if (t >= END_CARD.start - 0.5) continue;
    const close = s.close == null ? END_CARD.start : s.close;
    shots.push({
      t, hold: Math.max(0.5, close - t - MIN_TRAVEL), rest: true, protect: false, tag: 'wide',
      ...widePose(s.k),
    });
  }

  addEnd(shots);

  shots.sort((a, b) => a.t - b.t || (a.protect === b.protect ? 0 : a.protect ? -1 : 1));

  // Drop a non-protected shot that sits on top of another, or inside a protected rest.
  const kept = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (s.t < -0.01 || s.t > DURATION + 0.01) continue;
    const prev = kept[kept.length - 1];
    if (prev && s.t < prev.t + 0.08) {
      if (s.protect && !prev.protect) kept[kept.length - 1] = s;
      continue;
    }
    kept.push(s);
  }

  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.protect && s.tag === 'turn') continue;
    const prev = kept[i - 1];
    const next = kept[i + 1];
    if ((prev && s.t - prev.t < BLEND_GAP) || (next && next.t - s.t < BLEND_GAP)) s.rest = false;
  }

  const knots = [];
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    const next = kept[i + 1];
    knots.push(s);
    if (!s.rest || !(s.hold > 0.2)) continue;
    let depart = s.t + s.hold;
    if (s.tag === 'turn') {
      // Stay through the end of the turn even if the next cue is eager.
      depart = s.t + s.hold;
    } else if (next) {
      depart = Math.min(depart, next.t - MIN_TRAVEL);
    }
    if (next && depart > next.t - 0.12) depart = next.t - 0.12;
    if (depart > s.t + 0.18 && depart < (next ? next.t : DURATION + 1)) {
      knots.push({ ...s, t: depart, hold: 0, rest: true });
    }
  }

  knots.sort((a, b) => a.t - b.t);
  // Strictly increasing times. Nudging stays clear of the following knot.
  for (let i = 1; i < knots.length; i++) {
    if (knots[i].t <= knots[i - 1].t + 0.03) knots[i].t = knots[i - 1].t + 0.03;
  }
  if (knots.length) {
    const last = knots[knots.length - 1];
    if (last.t < DURATION - 0.05 && last.tag === 'end') last.t = DURATION;
    if (last.t > DURATION) last.t = DURATION;
    for (let i = knots.length - 2; i >= 0; i--) {
      if (knots[i].t >= knots[i + 1].t) knots[i].t = knots[i + 1].t - 0.03;
    }
  }
  return knots;
}

// ------------------------------------------------------------------------------ spline

function hermite(p0, m0, p1, m1, s, dt) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * dt * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * dt * m1;
}

/** Shape-preserving tangent; 0 where the slope changes sign, so the spline cannot overshoot. */
function pchip(d0, d1, h0, h1) {
  if (!(d0 * d1 > 0)) return 0;
  const w0 = 2 * h1 + h0;
  const w1 = h1 + 2 * h0;
  return ((w0 + w1) * d0 * d1) / (w0 * d1 + w1 * d0);
}

function segmentAt(times, n, t) {
  let i = 0;
  const last = n - 2;
  while (i < last && t >= times[i + 1]) i++;
  return i;
}

/** Sum of three slow sines, roughly in [−1, 1]. Phases keep each axis on its own path. */
function wander(t, a, b, c) {
  return 0.55 * Math.sin(0.31 * t + a) + 0.3 * Math.sin(0.73 * t + b) + 0.15 * Math.sin(1.37 * t + c);
}

function finitePose(p) {
  return Number.isFinite(p.px) && Number.isFinite(p.py) && Number.isFinite(p.pz)
    && Number.isFinite(p.tx) && Number.isFinite(p.ty) && Number.isFinite(p.tz)
    && Number.isFinite(p.fov);
}

// ------------------------------------------------------------------------------ rig

/**
 * @param {import('three').PerspectiveCamera} camera
 * @param {{ getCues?: () => Array }} [opts]
 * @returns {{ update(t: number): void, aim: { x: number, y: number, z: number } }}
 */
export function createCameraRig(camera, { getCues } = {}) {
  let KT = new Float64Array(0);
  let KV = new Float64Array(0);
  let KM = new Float64Array(0);
  let N = 0;
  const out = new Float64Array(CH);
  const aim = { x: 0, y: 0.4, z: 0 };
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  // Cue fingerprint. Grown on change, never per frame. 8 numbers per cue.
  let snap = new Float64Array(0);
  let snapN = -1;
  let warned = false;

  function cuesChanged(cues) {
    const n = cues.length;
    if (n !== snapN) return true;
    for (let i = 0; i < n; i++) {
      const c = cues[i];
      const a = c && c.at;
      const o = i * 8;
      if (snap[o] !== c.t) return true;
      if (snap[o + 1] !== (c.hold || 0)) return true;
      if (snap[o + 2] !== (c.size || 0)) return true;
      if (snap[o + 3] !== (a ? a.x : 0)) return true;
      if (snap[o + 4] !== (a ? a.y : 0)) return true;
      if (snap[o + 5] !== (a ? a.z : 0)) return true;
      if (snap[o + 6] !== fromCode(c.from)) return true;
      if (snap[o + 7] !== (c.spread || 0)) return true;
    }
    return false;
  }

  function remember(cues) {
    const n = cues.length;
    if (snap.length < n * 8) snap = new Float64Array(n * 8);
    for (let i = 0; i < n; i++) {
      const c = cues[i];
      const a = c && c.at;
      const o = i * 8;
      snap[o] = c.t;
      snap[o + 1] = c.hold || 0;
      snap[o + 2] = c.size || 0;
      snap[o + 3] = a ? a.x : 0;
      snap[o + 4] = a ? a.y : 0;
      snap[o + 5] = a ? a.z : 0;
      snap[o + 6] = fromCode(c.from);
      snap[o + 7] = c.spread || 0;
    }
    snapN = n;
  }

  function rebuild(cues) {
    const knots = buildKnots(cues).filter(finitePose);
    if (knots.length < 2) {
      const safe = place(0, 0.45, 0, 10.5, 0, 38, 35.5, 0.06, OPEN_W);
      knots.length = 0;
      knots.push({ ...safe, t: 0, rest: true }, { ...safe, t: DURATION, rest: true });
    }
    N = knots.length;
    KT = new Float64Array(N);
    KV = new Float64Array(N * CH);
    KM = new Float64Array(N * CH);
    const rest = new Uint8Array(N);
    for (let j = 0; j < N; j++) {
      const k = knots[j];
      KT[j] = k.t;
      rest[j] = k.rest ? 1 : 0;
      const o = j * CH;
      KV[o] = k.px;
      KV[o + 1] = k.py;
      KV[o + 2] = k.pz;
      KV[o + 3] = k.tx;
      KV[o + 4] = k.ty;
      KV[o + 5] = k.tz;
      KV[o + 6] = k.fov;
      KV[o + 7] = k.shake;
    }
    for (let j = 1; j < N - 1; j++) {
      if (rest[j]) continue;
      const h0 = KT[j] - KT[j - 1];
      const h1 = KT[j + 1] - KT[j];
      if (!(h0 > 0) || !(h1 > 0)) continue;
      for (let c = 0; c < CH; c++) {
        const d0 = (KV[j * CH + c] - KV[(j - 1) * CH + c]) / h0;
        const d1 = (KV[(j + 1) * CH + c] - KV[j * CH + c]) / h1;
        KM[j * CH + c] = pchip(d0, d1, h0, h1);
      }
    }
  }

  function evaluate(t) {
    const tc = t <= KT[0] ? KT[0] : t >= KT[N - 1] ? KT[N - 1] : t;
    const i = segmentAt(KT, N, tc);
    const dt = KT[i + 1] - KT[i];
    const s = dt > 1e-6 ? (tc - KT[i]) / dt : 0;
    const a = i * CH;
    const b = a + CH;
    for (let c = 0; c < CH; c++) out[c] = hermite(KV[a + c], KM[a + c], KV[b + c], KM[b + c], s, dt);
  }

  rebuild(EMPTY);

  return {
    aim,
    update(time) {
      let cues = EMPTY;
      try {
        const next = getCues ? getCues() : null;
        if (Array.isArray(next)) cues = next;
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn('[camera] getCues() failed; wide shots only:', err);
        }
      }
      if (cuesChanged(cues)) {
        remember(cues);
        rebuild(cues);
      }

      const t = clamp(Number.isFinite(+time) ? +time : 0, 0, DURATION);
      evaluate(t);

      let px = out[0];
      let py = out[1];
      let pz = out[2];
      let tx = out[3];
      let ty = out[4];
      let tz = out[5];
      let fov = out[6];
      const shake = reduced && reduced.matches ? 0 : out[7];

      const dx0 = tx - px;
      const dy0 = ty - py;
      const dz0 = tz - pz;
      const dist = Math.hypot(dx0, dy0, dz0) || 1;

      if (shake > 0) {
        const aimW = DRIFT_AIM * dist * shake;
        const sway = DRIFT_POS * dist * shake;
        tx += aimW * wander(t, 0.4, 2.1, 4.7);
        ty += aimW * 0.65 * wander(t * 1.13, 1.9, 0.3, 3.3);
        tz += aimW * 0.45 * wander(t * 0.87, 5.2, 1.4, 0.6);
        px += sway * wander(t * 0.93, 3.1, 4.4, 2.2);
        py += sway * 0.75 * wander(t * 1.07, 0.7, 5.9, 1.8);
        pz += sway * 0.55 * wander(t * 1.21, 2.6, 3.8, 5.1);
        // A slow dolly along the view, so a hold is never a frozen frame.
        const along = DOLLY * dist * shake * Math.sin(0.23 * t + 0.6);
        px += (dx0 / dist) * along;
        py += (dy0 / dist) * along;
        pz += (dz0 / dist) * along;
        fov += BREATH * shake * Math.sin(0.17 * t + 1.1);
      }
      const roll = shake > 0 ? DRIFT_ROLL * shake * wander(t * 0.79, 4.1, 0.9, 2.7) : 0;

      // Narrower than the reference: keep that frame's horizontal coverage.
      // Part of the deficit widens the lens (more so on a phone); the rest dollies back.
      let halfTan = Math.tan(0.5 * fov * DEG);
      const aspect = camera.aspect;
      if (aspect > 0.2 && aspect < REF_ASPECT - 0.01 && halfTan > 1e-4) {
        const deficit = REF_ASPECT / aspect;
        const share = aspect < 1.4 ? 0.52 : 0.38;
        const widen = Math.min(Math.pow(deficit, share), Math.tan(0.5 * MAX_FOV * DEG) / halfTan);
        const dolly = deficit / widen;
        halfTan *= widen;
        px = tx + (px - tx) * dolly;
        py = ty + (py - ty) * dolly;
        pz = tz + (pz - tz) * dolly;
      }
      fov = (2 * Math.atan(halfTan)) / DEG;

      if (!Number.isFinite(px + py + pz + tx + ty + tz + fov)) {
        px = 0;
        py = 8.2;
        pz = 10.4;
        tx = 0;
        ty = 0.5;
        tz = 0;
        fov = 35.5;
      }

      aim.x = tx;
      aim.y = ty;
      aim.z = tz;
      camera.position.set(px, py, pz);
      camera.up.set(0, 1, 0);
      camera.lookAt(tx, ty, tz);
      if (roll !== 0) camera.rotateZ(roll);
      if (camera.fov !== fov) camera.fov = fov;
      camera.updateProjectionMatrix();
    },
  };
}
