/**
 * camera.js — the film's camera operator for "The Little Paper Boat" (contract §4 "src/camera.js").
 *
 * createCameraRig(camera) -> { update(t) } poses a THREE.PerspectiveCamera (position, look-at
 * target, roll, vertical fov) as a pure function of film time t, so seeking works both ways.
 *
 * Shots: SHOTS is a list of keys — camera position, look-at target, lens (vertical fov at 16:9)
 * and handheld amount at a film time. A key is fixed in the world or FOLLOWS the boat/crane
 * (`on: <spread>`): its position and target are then offsets from the boat (the target from
 * where the boat will be LEAD seconds later, so the frame leads the motion).
 * Every channel is a cubic Hermite spline in time through the keys' actual values, with
 * shape-preserving (Fritsch–Butland) tangents: moves never overshoot a key. At a follow key the
 * tangent is that of the offsets plus the boat's own velocity, and inside a follow stretch the
 * spline is corrected by (boat path − its Hermite between the keys), a C1 term that vanishes at
 * every key — so between follow keys the camera tracks the boat EXACTLY (offset spline + boat),
 * and world → follow → world transitions blend it in and out with a smoothstep weight. All
 * tangents are precomputed; the result is C1 everywhere (no jerks, no direction flips). `hold`
 * keys come to rest; most keys flow, like a slider/crane rig in a stop-motion studio.
 *
 * Subject: the boat's journey is the shared waypoint list of SPREADS.md (spread frame) lifted by
 * each open spread's page height (book.js hinge chain), as a C1 Catmull-Rom curve in time;
 * subjectPosition(t, out) exposes it (dev/camera.html marks it).
 *
 * Handheld: deterministic overlaid slow sines on position, aim and roll, scaled by the key's
 * shake and by the camera-target distance (wide shots float a little, close-ups stay steady),
 * plus a slight lens breathing.
 *
 * Aspect: framed for 16:9; wider frames (21:9) keep the vertical view and show more desk at the
 * sides. Below REF_ASPECT the rig keeps the horizontal coverage a REF_ASPECT frame has at the
 * target (REF_ASPECT_CLOSE for close-ups): it widens the vertical fov (up to MAX_FOV) and dollies
 * back along the line of sight for the rest, so the 6-unit open book and the action stay in frame
 * down to portrait phones. The
 * extra height of such a frame is placed by a per-key `band` (vertical lens shift): e.g. the
 * closed book sits low under the opening title card.
 *
 * Imports no three.js (uses only the camera's own API) and allocates nothing per frame.
 */
import { clamp, smoothstep } from './timeline.js';

const DEG = Math.PI / 180;
const LEAD = 0.45; // follow shots aim where the boat will be this many seconds later
const REF_ASPECT = 1.5; // narrower frames keep this aspect's horizontal coverage (wide shots) …
const REF_ASPECT_CLOSE = 1.1; // … easing to this one's for close-ups (camera-target distance ≤ 3.5)
const MAX_FOV = 62;
const WIDEN_SHARE = 0.5; // portrait: this power of the coverage deficit goes to the lens, the rest to dolly
const DRIFT_AIM = 0.006; // handheld aim wander × camera-target distance × shake
const DRIFT_POS = 0.004; // handheld position wander × distance × shake
const DRIFT_ROLL = 0.004; // handheld roll (radians) × shake
const BREATH = 0.3; // lens breathing (degrees of fov) × shake

/** World height of each open spread's printed surface (book.js: Q[k] above the desk). */
const PAGE_Y = { forest: 0.15, sea: 0.115, city: 0.115, sky: 0.15 };

/**
 * The boat's journey (SPREADS.md) in the spread frame: [t, x, y, z, rest?] — y = waterline above
 * the page; `rest` = zero velocity there. The sky path becomes the crane's flight at 78.5.
 */
const REST = true;
const JOURNEY = {
  forest: [
    [15.5, -1.9, 0, -1.2, REST],
    [20.5, -1.9, 0, -1.2, REST],
    [22, -1.0, 0, -0.6],
    [23.5, -0.2, 0, 0.1],
    [25, 0.8, 0, 0.5],
    [26.5, 1.7, 0, 1.0],
    [27.5, 2.3, 0, 1.5],
  ],
  sea: [
    [31, -2.3, 0.15, 0.6],
    [35, -1.2, 0.15, 0.5],
    [39, 0.0, 0.2, 0.7],
    [44, 1.0, 0.5, 0.4],
    [48.5, 2.1, 0.15, 0.8],
  ],
  city: [
    [52, -2.4, 0, 1.1],
    [56, -1.3, 0, 0.8],
    [60, -0.6, 0, 0.4, REST],
    [65, -0.6, 0, 0.4, REST],
    [67, 0.6, 0, 0.2],
    [68.5, 1.3, 0, 0.15],
    [70, 2.2, 0, 0.3],
  ],
  sky: [
    [73, -1.7, 0.55, 0.7, REST],
    [75.5, -1.7, 0.55, 0.7, REST],
    [78.5, -1.7, 0.8, 0.7, REST],
    [81, -0.6, 1.5, 0.2],
    [83.5, 0.6, 2.2, -0.5],
    [86, 1.4, 2.8, 0.2],
    [89, 1.2, 3.4, 1.0],
    [93.4, 0.6, 5.5, 2.2], // sky.js reaches the last waypoint early and climbs on out of frame
  ],
};
/** Which spread's path subjectPosition() reports: it switches halfway through each page turn. */
const SUBJECT_SWITCH = [
  [29.5, 'forest'],
  [50.5, 'sea'],
  [71.5, 'city'],
  [Infinity, 'sky'],
];

// ------------------------------------------------------------------------------ curves

function hermite(p0, m0, p1, m1, s, dt) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * dt * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * dt * m1;
}

/** d/dt of hermite(). */
function hermiteSlope(p0, m0, p1, m1, s, dt) {
  const s2 = s * s;
  return ((6 * s2 - 6 * s) * (p0 - p1)) / dt + (3 * s2 - 4 * s + 1) * m0 + (3 * s2 - 2 * s) * m1;
}

/** Shape-preserving tangent between slopes d0 (over h0 s) and d1 (over h1 s); 0 at a turn. */
function pchip(d0, d1, h0, h1) {
  if (d0 * d1 <= 0) return 0;
  const w0 = 2 * h1 + h0;
  const w1 = h1 + 2 * h0;
  return ((w0 + w1) * d0 * d1) / (w0 * d1 + w1 * d0);
}

/** Index i of the segment [times[i], times[i+1]] holding t (t already clamped to the range). */
function segmentAt(times, t) {
  let i = 0;
  while (i < times.length - 2 && t >= times[i + 1]) i++;
  return i;
}

/** A waypoint path as flat arrays with Catmull-Rom tangents (zero at the ends and at rests). */
function buildPath(points, lift) {
  const n = points.length;
  const times = new Float64Array(n);
  const v = new Float64Array(n * 3);
  const m = new Float64Array(n * 3);
  points.forEach(([t, x, y, z], i) => {
    times[i] = t;
    v.set([x, y + lift, z], i * 3);
  });
  for (let i = 1; i < n - 1; i++) {
    if (points[i][4]) continue;
    const span = times[i + 1] - times[i - 1];
    for (let c = 0; c < 3; c++) m[i * 3 + c] = (v[(i + 1) * 3 + c] - v[(i - 1) * 3 + c]) / span;
  }
  return { times, v, m };
}

/** Position (or, with slope = true, velocity) on `path` at time t into out[o..o+2]; held at the ends. */
function samplePath(path, t, out, o = 0, slope = false) {
  const { times, v, m } = path;
  const last = times.length - 1;
  if (slope && (t <= times[0] || t >= times[last])) {
    out[o] = out[o + 1] = out[o + 2] = 0;
    return;
  }
  const tc = clamp(t, times[0], times[last]);
  const i = segmentAt(times, tc);
  const dt = times[i + 1] - times[i];
  const s = (tc - times[i]) / dt;
  const f = slope ? hermiteSlope : hermite;
  for (let c = 0; c < 3; c++) {
    const a = i * 3 + c;
    out[o + c] = f(v[a], m[a], v[a + 3], m[a + 3], s, dt);
  }
}

const PATHS = Object.fromEntries(Object.entries(JOURNEY).map(([id, pts]) => [id, buildPath(pts, PAGE_Y[id])]));

const _subject = new Float64Array(3);

/**
 * World position of the boat (from 78.5 the crane) at film time t, per the shared journey — the
 * point the follow shots frame. Writes out.x/y/z (a THREE.Vector3 works) and returns out.
 */
export function subjectPosition(t, out) {
  let i = 0;
  while (t >= SUBJECT_SWITCH[i][0]) i++;
  samplePath(PATHS[SUBJECT_SWITCH[i][1]], t, _subject);
  out.x = _subject[0];
  out.y = _subject[1];
  out.z = _subject[2];
  return out;
}

// ------------------------------------------------------------------------------ shot list

/**
 * One shot key. pos/tgt: world points — or, with `on` naming a spread's boat path, offsets from
 * the boat (target from the boat LEAD s ahead). fov: vertical degrees at 16:9. shake: handheld
 * 0..1. band: where a portrait frame puts the landscape composition, −1 (bottom) … 1 (top).
 */
function key(t, pos, tgt, { fov = 35, shake = 1, band = 0, hold = false, on = null } = {}) {
  return { t, pos, tgt, fov, shake, band, hold, path: on ? PATHS[on] : null };
}

const SHOTS = [
  // Prologue 0–7: the lamp warms up; a slow, high approach. Title card 1.2–6: book in the lower third.
  key(0, [7.0, 8.4, 14.8], [1.1, 2.9, -1.0], { fov: 34, shake: 1, band: -0.6 }),
  key(3.4, [6.0, 7.6, 12.6], [1.2, 2.6, -0.8], { fov: 34.5, shake: 0.9, band: -0.6 }),
  key(6.3, [3.5, 5.3, 7.4], [1.2, 0.7, -0.3], { shake: 0.8 }),
  // 7–10 the cover opens: swing round to the reader's centred view as the forest rises.
  key(8.6, [1.4, 5.6, 7.9], [0.4, 0.9, -0.4], { shake: 0.8 }),
  key(10.4, [0, 5.4, 7.7], [0, 0.85, -0.45], { shake: 0.8 }),
  // Forest: glide low from the left past the cottage; watch the boat being folded at the spring
  // (15.5–18) from the front-left, clear of the cottage (a standUp at (−1.85, 0, 0.62))...
  key(13.0, [-4.0, 2.8, 5.0], [-1.4, 0.95, -0.2], { fov: 33, shake: 0.6 }),
  key(15.6, [-3.7, 2.05, 1.85], [-1.9, 0.42, -1.05], { fov: 31, shake: 0.35 }),
  key(18.6, [-3.5, 2.25, 1.75], [-1.88, 0.4, -1.1], { fov: 30, shake: 0.3 }),
  // ...crane up over the cottage as it slips into the stream, then ride along in front of it.
  key(20.8, [-1.6, 3.0, 2.2], [-1.75, 0.4, -1.0], { fov: 31, shake: 0.35 }),
  key(22.6, [0.4, 1.9, 2.8], [0, 0.2, 0], { on: 'forest', fov: 31, shake: 0.35 }),
  key(24.2, [-0.4, 1.7, 2.8], [0, 0.2, 0], { on: 'forest', fov: 32, shake: 0.4 }),
  key(26.0, [-0.9, 2.4, 3.4], [0, 0.2, 0], { on: 'forest', fov: 33, shake: 0.5 }),
  // ...and rise out wide for the page turn 28–31, drifting with the sweep of the page.
  key(28.8, [1.8, 6.0, 8.8], [0.2, 1.15, -0.35], { shake: 0.9 }),
  key(31.0, [-0.5, 5.7, 8.6], [-0.2, 1.0, -0.3], { shake: 0.9 }),
  // Sea: down to wave level from the front, drift right to the lighthouse, ride the big wave.
  key(34.0, [-2.4, 1.3, 5.2], [-1.0, 0.65, 0.0], { fov: 33, shake: 0.6 }),
  key(37.5, [-1.0, 1.25, 5.9], [0.3, 0.95, -0.2], { fov: 33, shake: 0.6 }),
  key(40.5, [-0.1, 1.3, 6.2], [0.85, 1.15, -0.2], { fov: 33, shake: 0.55 }),
  key(43.0, [-0.6, 1.0, 3.3], [0, 0.15, 0], { on: 'sea', fov: 32, shake: 0.4 }),
  key(46.0, [-1.0, 0.95, 3.2], [0, 0.15, 0], { on: 'sea', fov: 32, shake: 0.4 }),
  // Page turn 49–52.
  key(49.5, [1.8, 6.0, 8.8], [0.2, 1.15, -0.35], { shake: 0.9 }),
  key(52.0, [-0.5, 5.7, 8.6], [-0.2, 1.0, -0.3], { shake: 0.9 }),
  // City: down to the canal, push in through the lanterns to the quiet window, then follow the
  // boat under the arched bridge, seen from the front-left.
  key(55.0, [-3.0, 2.3, 5.2], [-1.3, 0.66, 0.35], { fov: 33, shake: 0.6 }),
  key(58.5, [-1.6, 1.75, 5.0], [-0.9, 0.62, -0.1], { fov: 31, shake: 0.45 }),
  key(62.0, [-0.9, 1.45, 4.6], [-0.8, 0.6, -0.1], { fov: 29, shake: 0.3 }),
  key(65.5, [-0.75, 1.35, 4.3], [-0.75, 0.5, 0.0], { fov: 29, shake: 0.3 }),
  key(67.2, [-1.2, 1.2, 3.3], [0.1, 0.3, 0], { on: 'city', fov: 30, shake: 0.35 }),
  key(68.5, [-1.7, 1.15, 2.8], [0.1, 0.3, 0], { on: 'city', fov: 31, shake: 0.4 }),
  // Page turn 70–73.
  key(71.5, [-0.9, 5.4, 8.6], [0.1, 1.15, -0.35], { shake: 0.9 }),
  key(73.2, [-0.4, 3.6, 6.0], [-0.9, 0.85, 0.0], { shake: 0.7 }),
  // Sky: close on the boat on its cloud (unfold 75.5–77, crane 77–78.5), rise with the crane...
  key(75.3, [-0.95, 1.55, 3.0], [-1.6, 0.85, 0.55], { fov: 31, shake: 0.3 }),
  key(78.0, [-1.05, 1.45, 2.7], [-1.65, 0.95, 0.6], { fov: 30, shake: 0.25 }),
  key(80.5, [0.9, 0.55, 3.0], [0, 0.1, 0], { on: 'sky', fov: 32, shake: 0.35 }),
  key(83.5, [0.3, 0.85, 3.7], [0, -0.3, 0], { on: 'sky', fov: 33, shake: 0.45 }),
  // ...and end wide and majestic: sun, balloons, crane.
  key(86.5, [0.4, 2.8, 8.0], [0.25, 1.7, -0.5], { fov: 36, shake: 0.8 }),
  // Epilogue 89–96: slow pull back and up over the whole book while the lamp fades.
  key(89.5, [0.3, 3.3, 9.2], [0.2, 1.8, -0.4], { fov: 36, shake: 0.9 }),
  key(96, [0, 4.6, 15.2], [0, 1.45, -0.2], { fov: 36, shake: 1, band: -0.5 }),
];

// ------------------------------------------------------------------------------ precomputed spline

const N = SHOTS.length;
const CH = 9; // channels: px py pz · tx ty tz · fov · shake · band
const KT = Float64Array.from(SHOTS, (k) => k.t);
const KV = new Float64Array(N * CH); // actual key values
const KM = new Float64Array(N * CH); // key tangents
const KF = Float64Array.from(SHOTS, (k) => (k.path ? 1 : 0)); // follow weight
/** Per segment: the boat path it follows (or null) and that path's value + velocity at both ends. */
const SEG_PATH = [];
const SEG_S = new Float64Array((N - 1) * 24); // [S(tᵢ) 6, S'(tᵢ) 6, S(tᵢ₊₁) 6, S'(tᵢ₊₁) 6]

/** Boat position at t (out[o..o+2]) and at t + LEAD (out[o+3..o+5]); velocities with slope = true. */
function sampleSubject(path, t, out, o = 0, slope = false) {
  samplePath(path, t, out, o, slope);
  samplePath(path, t + LEAD, out, o + 3, slope);
}

{
  const s = new Float64Array(6);
  SHOTS.forEach((k, j) => {
    const v = KV.subarray(j * CH, j * CH + CH);
    v.set([...k.pos, ...k.tgt, k.fov, k.shake, k.band]);
    if (k.path) {
      sampleSubject(k.path, k.t, s);
      for (let c = 0; c < 6; c++) v[c] += s[c];
    }
  });
  const sPrev = new Float64Array(6);
  const sNext = new Float64Array(6);
  for (let j = 1; j < N - 1; j++) {
    const k = SHOTS[j];
    if (k.hold) continue;
    const h0 = KT[j] - KT[j - 1];
    const h1 = KT[j + 1] - KT[j];
    const at = (jj, c) => KV[jj * CH + c];
    for (let c = 0; c < CH; c++) {
      KM[j * CH + c] = pchip((at(j, c) - at(j - 1, c)) / h0, (at(j + 1, c) - at(j, c)) / h1, h0, h1);
    }
    if (!k.path) continue;
    // Follow key: shape-preserving tangent of the offsets from the boat, plus the boat's velocity.
    sampleSubject(k.path, KT[j - 1], sPrev);
    sampleSubject(k.path, KT[j], s);
    sampleSubject(k.path, KT[j + 1], sNext);
    for (let c = 0; c < 6; c++) {
      const b0 = at(j - 1, c) - sPrev[c];
      const b1 = at(j, c) - s[c];
      const b2 = at(j + 1, c) - sNext[c];
      KM[j * CH + c] = pchip((b1 - b0) / h0, (b2 - b1) / h1, h0, h1);
    }
    sampleSubject(k.path, KT[j], s, 0, true);
    for (let c = 0; c < 6; c++) KM[j * CH + c] += s[c];
  }
  for (let i = 0; i < N - 1; i++) {
    const a = SHOTS[i].path;
    const b = SHOTS[i + 1].path;
    if (a && b && a !== b) throw new Error(`camera: shot keys at ${KT[i]} and ${KT[i + 1]} follow different paths`);
    const path = a || b;
    SEG_PATH.push(path);
    if (!path) continue;
    sampleSubject(path, KT[i], SEG_S, i * 24);
    sampleSubject(path, KT[i], SEG_S, i * 24 + 6, true);
    sampleSubject(path, KT[i + 1], SEG_S, i * 24 + 12);
    sampleSubject(path, KT[i + 1], SEG_S, i * 24 + 18, true);
  }
}

// ------------------------------------------------------------------------------ rig

/** Sum of three slow sines, roughly in [−1, 1]; phases pick an independent wander per axis. */
function wander(t, a, b, c) {
  return 0.55 * Math.sin(0.31 * t + a) + 0.3 * Math.sin(0.73 * t + b) + 0.15 * Math.sin(1.37 * t + c);
}

/**
 * @param {import('three').PerspectiveCamera} camera
 * @returns {{ update(t: number): void }}
 */
export function createCameraRig(camera) {
  const out = new Float64Array(CH);
  const sub = new Float64Array(6);

  /** Every channel at film time t into `out`. */
  function evaluate(t) {
    const i = segmentAt(KT, t);
    const dt = KT[i + 1] - KT[i];
    const s = (t - KT[i]) / dt;
    const a = i * CH;
    const b = a + CH;
    for (let c = 0; c < CH; c++) out[c] = hermite(KV[a + c], KM[a + c], KV[b + c], KM[b + c], s, dt);
    const path = SEG_PATH[i];
    if (!path) return;
    // Exact tracking: add (boat − the boat's Hermite between the two keys), weighted in and out.
    const w = KF[i] + (KF[i + 1] - KF[i]) * s * s * (3 - 2 * s);
    sampleSubject(path, t, sub);
    const g = i * 24;
    for (let c = 0; c < 6; c++) {
      const approx = hermite(SEG_S[g + c], SEG_S[g + 6 + c], SEG_S[g + 12 + c], SEG_S[g + 18 + c], s, dt);
      out[c] += w * (sub[c] - approx);
    }
  }

  return {
    update(time) {
      const t = clamp(Number(time) || 0, KT[0], KT[N - 1]);
      evaluate(t);
      let px = out[0];
      let py = out[1];
      let pz = out[2];
      let tx = out[3];
      let ty = out[4];
      let tz = out[5];
      let fov = out[6];
      const shake = out[7];
      const band = out[8];

      // Handheld drift: aim and position wander in proportion to the framing distance.
      const dist = Math.hypot(tx - px, ty - py, tz - pz);
      const aim = DRIFT_AIM * dist * shake;
      const sway = DRIFT_POS * dist * shake;
      tx += aim * wander(t, 0.4, 2.1, 4.7);
      ty += aim * 0.7 * wander(t * 1.13, 1.9, 0.3, 3.3);
      tz += aim * 0.5 * wander(t * 0.87, 5.2, 1.4, 0.6);
      px += sway * wander(t * 0.93, 3.1, 4.4, 2.2);
      py += sway * 0.8 * wander(t * 1.07, 0.7, 5.9, 1.8);
      pz += sway * 0.6 * wander(t * 1.21, 2.6, 3.8, 5.1);
      const roll = DRIFT_ROLL * shake * wander(t * 0.79, 4.1, 0.9, 2.7);
      fov += BREATH * shake * Math.sin(0.17 * t + 1.1);

      // Narrow frames: keep a reference aspect's horizontal coverage (the whole book in wide shots,
      // a little less around the subject in close-ups) — widen the lens, dolly back for the rest —
      // and slide the composition (a reference-aspect band of the taller frame) by lens shift.
      let halfTan = Math.tan(0.5 * fov * DEG);
      const ref = REF_ASPECT_CLOSE + (REF_ASPECT - REF_ASPECT_CLOSE) * smoothstep(3.5, 6.5, dist);
      const deficit = ref / (camera.aspect || ref);
      let shift = 0;
      if (deficit > 1) {
        shift = 0.5 * band * (1 - 1 / deficit);
        const widen = Math.min(Math.pow(deficit, WIDEN_SHARE), Math.tan(0.5 * MAX_FOV * DEG) / halfTan);
        const dolly = deficit / widen;
        halfTan *= widen;
        px = tx + (px - tx) * dolly;
        py = ty + (py - ty) * dolly;
        pz = tz + (pz - tz) * dolly;
      }

      camera.position.set(px, py, pz);
      camera.lookAt(tx, ty, tz);
      camera.rotateZ(roll);
      camera.fov = (2 * Math.atan(halfTan)) / DEG;
      // Lens shift (also updates the projection); setViewOffset() sets aspect = fullWidth / fullHeight.
      if (Math.abs(shift) > 1e-4) camera.setViewOffset(camera.aspect, 1, 0, shift, camera.aspect, 1);
      else if (camera.view?.enabled) camera.clearViewOffset();
      else camera.updateProjectionMatrix();
    },
  };
}
