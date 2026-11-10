// Camera rig: one continuous, eased take, as a pure function of film time and
// the viewport aspect ratio (no accumulated state; see the determinism rule).
//
// A "pose" is { t: [x,y,z] target, yaw, pitch (degrees), dist, fov (vertical
// degrees, as designed for 16:9), roll (degrees), fit? }. The camera sits at
//   target + dist * (sin(yaw)cos(pitch), sin(pitch), cos(yaw)cos(pitch))
// and looks at the target; yaw 0 = straight from +Z, negative yaw = from the left.
//
// Every shot is a closed-form function of time returning a pose. Shots follow
// each other through overlapping cross-blends (smootherstep weights), so the
// path, its velocity and its acceleration are continuous: no cuts, no jerks.
// `fit` lists world points that must stay in frame: for each viewport the pose
// dollies back (and narrow viewports widen the lens) until they do. Wide
// framings fit the whole open book up to the spread's `peak` (src/layout.js).
import * as THREE from 'three';
import { SEGMENTS } from './timeline.js';
import { clamp01, lerp, ramp, smoothstep } from './util.js';
import { SPREAD_LAYOUT, PAGE_SURFACE_Y, foxWorld, focusWorld } from './layout.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

const easeSine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };

// --- framing geometry ----------------------------------------------------------

/** Closed book on the desk (x in [0, 3.1], z in [-2.1, 2.1], top ~0.45). */
const CLOSED_BOX = boxPoints(0, 3.1, 0, 0.45, -2.1, 2.1);

/** The open book with scenery up to `peak` above the page. */
function openBookPoints(peak) {
  const top = PAGE_SURFACE_Y + peak + 0.1;
  return [
    ...boxPoints(-3.15, 3.15, 0, 0.35, -2.1, 2.1),   // the boards
    ...boxPoints(-2.7, 2.7, top, top, -1.8, 1.8),     // tallest scenery
  ];
}

/** Open book plus a leaf standing vertical at the spine (mid-turn). */
function turnPoints(peak) {
  return [...openBookPoints(peak), [0, 3.5, -2.05], [0, 3.5, 2.05], [0.15, 3.5, 0]];
}

function boxPoints(x0, x1, y0, y1, z0, z1) {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
  return out;
}

/** The subject of a close shot on spread k: the fox and the area around focus. */
function subjectPoints(k, spanX = 0.9) {
  const [fx, , fz] = foxWorld(k);
  const [cx, cy, cz] = focusWorld(k);
  return [
    [fx, 0.25, fz], [fx, 1.05, fz],
    [cx - spanX, cy, cz], [cx + spanX, cy, cz],
  ];
}

/** Narrow viewports widen the lens (portrait phones get ~+20 degrees vertical). */
function adaptFov(fov, aspect) {
  return fov + 20 * smoothstep(1.45, 0.46, aspect);
}

/** Smallest distance at which every point in `pts` is inside the frustum. */
function fitDistance(target, yaw, pitch, fovDeg, aspect, pts, margin) {
  const y = yaw * D2R, p = pitch * D2R;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  const f = [-sy * cp, -sp, -cy * cp];         // forward (camera -> target)
  const r = [cy, 0, -sy];                        // right
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; // up
  const tanV = Math.tan((fovDeg * D2R) / 2) / margin;
  const tanH = tanV * aspect;
  // Soft maximum over all constraints (log-sum-exp, >= the true max by at most
  // ~0.4): the limiting point or edge can change without a kink in the motion.
  const needs = [];
  for (const q of pts) {
    const d = [q[0] - target[0], q[1] - target[1], q[2] - target[2]];
    const xr = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const yu = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const zf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    needs.push(Math.abs(xr) / tanH - zf, Math.abs(yu) / tanV - zf);
  }
  const hard = Math.max(...needs);
  const TEMP = 0.12;
  let sum = 0;
  for (const n of needs) sum += Math.exp((n - hard) / TEMP);
  return hard + TEMP * Math.log(sum);
}

/** Apply the viewport: adapt the lens, then dolly back until `fit` points are in frame. */
function resolve(pose, aspect) {
  const fov = adaptFov(pose.fov, aspect);
  let dist = pose.dist;
  if (pose.fit) {
    // smooth max (>= both): no velocity kink when the fit takes over from the design distance
    const need = fitDistance(pose.t, pose.yaw, pose.pitch, fov, aspect, pose.fit, pose.margin ?? 1.06);
    dist = 0.5 * (dist + need + Math.hypot(dist - need, 0.5));
  }
  return { t: pose.t, yaw: pose.yaw, pitch: pose.pitch, dist, fov, roll: pose.roll ?? 0 };
}

function mix(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  return {
    t: [lerp(a.t[0], b.t[0], w), lerp(a.t[1], b.t[1], w), lerp(a.t[2], b.t[2], w)],
    yaw: lerp(a.yaw, b.yaw, w),
    pitch: lerp(a.pitch, b.pitch, w),
    dist: lerp(a.dist, b.dist, w),
    fov: lerp(a.fov, b.fov, w),
    roll: lerp(a.roll, b.roll, w),
  };
}

const P = (t, yaw, pitch, dist, fov, extra = {}) => ({ t, yaw, pitch, dist, fov, roll: 0, ...extra });

// --- the shots -------------------------------------------------------------------

const segs = (name) => SEGMENTS.filter((s) => s.name === name);
const INTRO = segs('intro')[0];
const COVER = segs('coverOpen')[0];
const HOLDS = segs('spread');
const TURNS = segs('turn');
const CLOSE = segs('bookClose')[0];
const OUTRO = segs('outro')[0];

/** Intro: close and low on the closed cover, slow push and rise. */
function shotIntro(t, aspect) {
  const u = easeSine(ramp(t, INTRO.start, INTRO.end + 1.5));
  // Opens close (the near edge may crop slightly); by the time the title card
  // has gone the whole cover is in frame on any aspect.
  const tight = CLOSED_BOX.map(([x, y, z]) => [lerp(0.2, 2.9, x / 3.1), y, z * 0.85]);
  // While the title card is up (1-6 s) the cover sits in the lower part of the
  // frame, leaving the upper third to the title; then the camera settles onto it.
  const lift = 0.9 * (1 - smoothstep(4.6, 7.6, t));
  const a = resolve(P(aboveInFrame([1.6, 0.4, 0.55], 9, 13, lift), 9, 13, 5.6, 30, { fit: tight, margin: 1.0 }), aspect);
  const b = resolve(P(aboveInFrame([1.55, 0.45, 0.05], 3, 29, lift), 3, 29, 5.1, 30, { fit: CLOSED_BOX, margin: 1.04 }), aspect);
  return mix(a, b, u);
}

/** The cover swings open: wide, high, centred on the spine. */
function shotCover(t, aspect) {
  const u = easeSine(ramp(t, COVER.start - 1, COVER.end + 2));
  return resolve(P([0, 1.05, -0.15], lerp(8, 3, u), lerp(33, 31, u), 9, 34,
    { fit: turnPoints(SPREAD_LAYOUT[0].peak), margin: 1.05 }), aspect);
}

/** A page turn: wider, higher three-quarter view centred on the spine. */
const TURN_YAW = [-15, 11, 9, 13];  // chosen to flow from each hold's end into the next one's start
function shotTurn(k) {
  const seg = TURNS[k];
  const peak = Math.max(SPREAD_LAYOUT[k].peak, SPREAD_LAYOUT[k + 1].peak);
  return (t, aspect) => {
    const u = easeSine(ramp(t, seg.start - 1.5, seg.end + 1.5));
    return resolve(P([0, 1.1, -0.15], TURN_YAW[k] * lerp(1.1, 0.9, u), lerp(37, 35, u), 9, 34,
      { fit: turnPoints(peak), margin: 1.05 }), aspect);
  };
}

/** Wide framing of a flat-open spread (used where a hold begins or ends wide). */
function widePose(k, yaw, pitch, extra = {}) {
  return P([0, 0.95, -0.1], yaw, pitch, 9, 34, { fit: openBookPoints(SPREAD_LAYOUT[k].peak), margin: 1.05, ...extra });
}

/** A close framing that keeps spread k's subject in frame on narrow screens. */
function closePose(k, target, yaw, pitch, dist, fov, extra = {}) {
  return P(target, yaw, pitch, dist, fov, { fit: subjectPoints(k), margin: 1.08, ...extra });
}

/** Hold progress: an unhurried ease from just before the hold to just before its end. */
function holdU(k, t, lead = 0.6, tail = 0.5) {
  const seg = HOLDS[k];
  return easeSine(ramp(t, seg.start - lead, seg.end - tail));
}

const HOLD_SHOTS = [
  // forest: low, from the left, looking through the trees toward the fox.
  (t, aspect) => {
    const u = holdU(0, t);
    const a = resolve(widePose(0, -8, 27), aspect);
    const b = resolve(closePose(0, [0.55, 0.95, 0.35], -30, 12, 6.1, 30), aspect);
    const m = mix(a, b, u);
    m.yaw += 4 * Math.sin(Math.PI * u);                 // a gentle arc on the way in
    return m;
  },
  // village: a slow lateral track across the street, ending on the fox.
  (t, aspect) => {
    const u = holdU(1, t, 0.4, 0.3);
    const a = resolve(closePose(1, [1.15, 0.95, 0.1], 5, 21, 7.0, 31), aspect);
    const b = resolve(closePose(1, [-0.75, 0.95, 0.3], -3, 18, 6.2, 31), aspect);
    return mix(a, b, u);
  },
  // sea: low angle, afloat (barely perceptible bob and roll).
  (t, aspect) => {
    const u = holdU(2, t);
    const a = resolve(closePose(2, [0.15, 0.85, 0.1], 12, 20, 8.2, 32), aspect);
    const b = resolve(closePose(2, [-0.05, 0.9, 0.25], -6, 11, 6.6, 30), aspect);
    const m = mix(a, b, u);
    m.t = [m.t[0], m.t[1] + 0.035 * Math.sin(TAU * t / 4.3), m.t[2]];
    m.pitch += 0.3 * Math.sin(TAU * t / 5.1 + 1.0);
    m.roll += 0.5 * Math.sin(TAU * t / 4.7 + 0.4);
    return m;
  },
  // mountain: starts low on the slope, tilts up toward the moon.
  (t, aspect) => {
    const u = holdU(3, t, 0.3, 0.6);
    const a = resolve(closePose(3, [0.35, 0.75, 0.05], 13, 16, 8.6, 32), aspect);
    const b = resolve(P([0.3, 1.95, -0.45], 6, 5, 7.6, 32,
      { fit: [[0.3, PAGE_SURFACE_Y + SPREAD_LAYOUT[3].peak + 0.1, -0.4], ...subjectPoints(3, 0.7)], margin: 1.08 }), aspect);
    return mix(a, b, u);
  },
  // night: push toward the fox and lantern; when the lantern lights (61.5-64),
  // pull back and rise to reveal the whole glowing spread.
  (t, aspect) => {
    const seg = HOLDS[4];
    const u1 = easeSine(ramp(t, seg.start - 0.4, seg.start + 4.1));
    const u2 = easeSine(ramp(t, seg.start + 3.5, seg.end - 1.3));
    const a = resolve(closePose(4, [0.25, 0.85, 0.2], 10, 24, 8.0, 32), aspect);
    const b = resolve(closePose(4, [0.8, 0.85, 0.8], 15, 17, 5.4, 30), aspect);
    const c = resolve(widePose(4, 2, 34, { margin: 1.03 }), aspect);
    const m = mix(mix(a, b, u1), c, u2);
    return m;
  },
];

/** The book closes: pull back and crane up, sliding over to the closed book. */
function shotClose(t, aspect) {
  const u = easeSine(ramp(t, CLOSE.start - 0.6, CLOSE.end + 0.6));
  const a = resolve(P([0, 1.05, -0.15], 4, 36, 9, 34, { fit: turnPoints(1.0), margin: 1.08 }), aspect);
  const b = resolve(P(aboveInFrame([1.55, 0.35, 0], -4, 48, 0.6), -4, 48, 8.4, 32, { fit: CLOSED_BOX, margin: 1.25 }), aspect);
  return mix(a, b, u);
}

/** `p` moved along the camera's up vector, so the subject sits lower in frame. */
function aboveInFrame(p, yaw, pitch, s) {
  const y = yaw * D2R, q = pitch * D2R;
  return [p[0] - s * Math.sin(y) * Math.sin(q), p[1] + s * Math.cos(q), p[2] - s * Math.cos(y) * Math.sin(q)];
}

/** Outro: settle on the closed book, framed low so "The End" sits above it; slow drift. */
function shotOutro(t, aspect) {
  const u = ramp(t, OUTRO.start, OUTRO.end);
  const yaw = lerp(-5, -10, u), pitch = lerp(50, 54, u);
  return resolve(P(aboveInFrame([1.55, 0.35, 0], yaw, pitch, lerp(1.25, 1.35, u)), yaw, pitch, lerp(9.0, 9.6, u), 32,
    { fit: CLOSED_BOX, margin: 1.12 }), aspect);
}

// Sequence: each shot blends in over [in0, in1] (then holds until the next one).
const SEQUENCE = (() => {
  const seq = [
    { shot: shotIntro, in0: -1, in1: 0 },
    { shot: shotCover, in0: COVER.start - 1.0, in1: COVER.start + 1.9 },
  ];
  for (let k = 0; k < HOLDS.length; k++) {
    const h = HOLDS[k];
    seq.push({ shot: HOLD_SHOTS[k], in0: h.start - 0.6, in1: h.start + 2.6 });
    if (k < TURNS.length) {
      const tr = TURNS[k];
      seq.push({ shot: shotTurn(k), in0: tr.start - 2.1, in1: tr.start + 1.3 });
    }
  }
  seq.push({ shot: shotClose, in0: CLOSE.start - 0.9, in1: CLOSE.start + 1.5 });
  seq.push({ shot: shotOutro, in0: CLOSE.end - 0.9, in1: OUTRO.start + 1.7 });
  return seq;
})();

/** Closed-form low-frequency sway, well under a degree: a whisper of handheld life. */
function handheld(t) {
  return {
    yaw: 0.22 * (Math.sin(TAU * 0.061 * t + 0.3) + 0.5 * Math.sin(TAU * 0.137 * t + 1.7)),
    pitch: 0.15 * (Math.sin(TAU * 0.083 * t + 2.1) + 0.5 * Math.sin(TAU * 0.171 * t + 0.4)),
    roll: 0.12 * Math.sin(TAU * 0.051 * t + 1.1),
  };
}

/** The camera pose at film time t for a viewport aspect. Pure. */
export function cameraPose(t, aspect) {
  let i = 0;
  while (i + 1 < SEQUENCE.length && t >= SEQUENCE[i + 1].in0) i++;
  const cur = SEQUENCE[i];
  let pose = cur.shot(t, aspect);
  if (i > 0 && t < cur.in1) {
    const w = smoother(ramp(t, cur.in0, cur.in1));
    pose = mix(SEQUENCE[i - 1].shot(t, aspect), pose, w);
  }
  const h = handheld(t);
  return { ...pose, yaw: pose.yaw + h.yaw, pitch: pose.pitch + h.pitch, roll: pose.roll + h.roll };
}

export function createCameraRig(ctx) {
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  const target = new THREE.Vector3();
  let aspect = 16 / 9;
  let lastT = 0;

  function place(t) {
    const p = cameraPose(t, aspect);
    const y = p.yaw * D2R, pi = p.pitch * D2R;
    target.set(p.t[0], p.t[1], p.t[2]);
    camera.position.set(
      target.x + p.dist * Math.sin(y) * Math.cos(pi),
      target.y + p.dist * Math.sin(pi),
      target.z + p.dist * Math.cos(y) * Math.cos(pi),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.rotateZ(p.roll * D2R);
    if (Math.abs(camera.fov - p.fov) > 1e-6) {
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
    }
  }

  function resize(a) {
    aspect = a > 0 && Number.isFinite(a) ? a : 16 / 9;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    place(lastT);
  }

  function update(state) {
    lastT = state.t;
    place(state.t);
  }

  resize(16 / 9);
  return { camera, update, resize, pose: (t) => cameraPose(t, aspect) };
}
