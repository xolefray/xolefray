// STUB (T-scaffold) — replaced by the camera owner (T-camera).
//
// A plain cue follower with the contract's API so the film runs end to end:
//   createCameraRig(camera, { getCues }) -> { update(t) }
// getCues() returns main.js's merged list [{ t, hold, at: THREE.Vector3 (WORLD), size, from, spread }]
// (sorted by t). The stub frames the closed book for the prologue, then for every cue it ARRIVES at
// cue.t, stays `hold` seconds and eases (inOutCubic, so it starts and stops at rest) to the next one;
// a spread without cues gets one wide shot. Pure in t, aspect-aware, no handheld drift, allocates
// nothing per frame. Not done here (the real rig's job): C1 flow through keys, page-turn framing,
// caption-band composition per shot, lens work, reduced-motion handling beyond "no drift at all".
import { END_CARD, SPREADS, clamp, ease, lerp, seg } from './timeline.js';
import { PAGE_W } from './dims.js';

const DEG = Math.PI / 180;
const FOV = 35;
const MOVE = 3; // longest travel time between two cues (s); the camera waits at a cue until then
/** Preferred side -> [azimuth°, elevation°] of the camera around the look-at point (0° = reader's side). */
const FROM = { front: [0, 40], left: [-28, 34], right: [28, 34], high: [0, 62], low: [0, 22] };
const WIDE_SIZE = PAGE_W * 2 + 1.2; // the whole open book

function makeKey(t, hold, x, y, z, size, from, move = MOVE) {
  const dir = FROM[from] ?? FROM.front;
  return { t, hold, x, y, z, size: Math.max(0.5, size), az: dir[0] * DEG, el: dir[1] * DEG, move };
}

function buildKeys(cues) {
  const keys = [];
  const first = SPREADS[0];
  // Prologue: the closed book (it lies on x ∈ [0, PAGE_W]); a slow push-in until the cover turns.
  keys.push(makeKey(0, 0.6, PAGE_W / 2, 0.1, 0, PAGE_W * 2.3, 'front'));
  keys.push(makeKey(first.start - 0.8, 0.8, PAGE_W / 2, 0.1, 0, PAGE_W * 1.75, 'front', Infinity));
  for (const s of SPREADS) {
    const own = cues.filter((c) => c.spread === s.k);
    if (own.length === 0) {
      keys.push(makeKey(s.open, 1, 0, 0.3, 0, WIDE_SIZE, 'front'));
      continue;
    }
    for (const c of own) keys.push(makeKey(c.t, c.hold ?? 1, c.at.x, c.at.y, c.at.z, c.size ?? WIDE_SIZE, c.from));
  }
  // End card: ease back to the whole book from a little higher.
  keys.push(makeKey(END_CARD.start + 1.5, 1e9, 0, 0.3, 0, WIDE_SIZE * 1.15, 'high'));
  keys.sort((a, b) => a.t - b.t);
  return keys;
}

export function createCameraRig(camera, { getCues } = {}) {
  let keys = null;

  function ensureKeys() {
    if (keys) return keys;
    let cues = [];
    try {
      cues = (getCues ? getCues() : null) ?? [];
    } catch (err) {
      console.warn('[camera stub] getCues() failed; using wide shots only:', err);
    }
    keys = buildKeys(cues);
    return keys;
  }

  function update(t) {
    const ks = ensureKeys();
    // segment: last key with key.t <= t is `a`, the next one is `b`
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1].t <= t) i++;
    const a = ks[i];
    const b = ks[Math.min(i + 1, ks.length - 1)];
    let u = 0;
    if (b !== a) {
      const leave = a.t + a.hold;
      const start = Math.min(Math.max(leave, b.t - b.move), b.t - 0.6);
      u = ease.inOutCubic(seg(t, start, b.t));
    }
    const x = lerp(a.x, b.x, u);
    const y = lerp(a.y, b.y, u);
    const z = lerp(a.z, b.z, u);
    const size = Math.exp(lerp(Math.log(a.size), Math.log(b.size), u));
    const az = lerp(a.az, b.az, u);
    const el = lerp(a.el, b.el, u);

    // Distance that fits `size` across the frame width (down to portrait), with a little air.
    const aspect = camera.aspect || 16 / 9;
    const half = Math.tan((FOV * DEG) / 2);
    const dist = ((size / 2) / (half * clamp(aspect, 0.5, 1.5))) * 1.1;
    // Aim a touch toward the reader so the subject sits above the caption band.
    const tz = z + size * 0.05;
    const ce = Math.cos(el);
    camera.position.set(x + dist * ce * Math.sin(az), y + dist * Math.sin(el), tz + dist * ce * Math.cos(az));
    camera.up.set(0, 1, 0);
    camera.lookAt(x, y, tz);
    if (camera.fov !== FOV) {
      camera.fov = FOV;
      camera.updateProjectionMatrix();
    }
  }

  return { update };
}
