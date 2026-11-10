// Spread 4 "Home": the night finale. The forest of spread 0 seen at night: a
// sky-panel V-fold with a pine ridge and a crescent moon missing its sliver,
// deep woods and the fox's den (a big old tree with a round door and window)
// on the left page, the clearing on the right where she stands with her lantern.
//
// The glow (state.glow, 61.5-64 s): the lantern swells, then the forest answers
// in a cascade that travels outward from the lantern - every glowing piece's
// response is delayed by its distance from her. Glowing parts are "hidden"
// emissive layers: dark card whose emissive is gold, so before the glow they
// read as plain silhouettes and afterwards as gold rims and highlights.
// Everything is a closed-form function of state / spread (determinism rule),
// and every light and emissive is multiplied by the spread's openness so the
// glow goes into the book as it closes.
import * as THREE from 'three';
import * as P from '../paper.js';
import { createFox } from '../characters.js';
import { SEGMENTS } from '../timeline.js';
import { SPREAD_LAYOUT } from '../layout.js';
import { PAGE_H as PAGE_DEPTH } from '../constants.js';
import { clamp01, hash01 } from '../util.js';

const C = P.PALETTE;
const N = C.night;

// --- night palette (indigo / deep teal silhouettes, gold, lantern amber) ---
const PAGE_L = '#1f2656';
const PAGE_R = '#232a5c';
const PATH = '#3b4789';
const SKY = '#1c2354';
const DARK = '#0e1a2a';        // darkest silhouettes (their emissive is the gold rim)
const TONE = '#1a3442';        // slightly lighter tier glued on top (deep teal)
const TONE_B = '#222d58';      // lighter tier, indigo variant
const TRUNK = '#3a2d42';
const DOOR = '#251b2c';
const RIM = '#ffa43c';         // emissive colour of rims and highlights
const WARM = '#ffcf7a';

// --- timing ---
const HOLD = SEGMENTS.find((s) => s.name === 'spread' && s.index === 4);
const GLOW_T0 = HOLD.start + 3.0;  // = timeline glowDelay: the lantern starts to swell (61.5)
const CASCADE_LAG = 0.9;           // the forest starts answering this long after
const SPEED = 1.0;                 // seconds per unit of distance from the lantern
const FADE = 1.4;                  // each piece fades up over this long

const FOX = SPREAD_LAYOUT[4].fox;  // right page, x 0.9, z 0.9
const LANTERN = new THREE.Vector3(FOX.x - 0.53, 0.32, FOX.z + 0.05); // walk pose, facing -X

// V-fold geometry (shared by the wing-position helper)
const BACK = { z: -0.55, angle: 0.95, len: 1.95 };
const FRONT = { z: 0.05, angle: 0.95, len: 1.45 };

/** Smooth 0..1 cascade response for a piece at distance d from the lantern. */
function cascade(t, d) {
  const x = clamp01((t - GLOW_T0 - CASCADE_LAG - d * SPEED) / FADE);
  return x * x * (3 - 2 * x);
}

/**
 * Forest skyline for a V-fold wing (u >= 0), as a height function y(u): a
 * solid band plus overlapping pines whose flanks droop in tiers (each tier
 * ends in a little drop). `inset` gives the inner line of the gold rim.
 */
function ridgeProfile(pines, base, inset = 0) {
  return (u) => {
    let y = base - inset;
    for (const p of pines) {
      const hw = p.w - inset * 1.2, h = p.h - inset * 1.6;
      const a = Math.abs(u - p.c) / hw;
      if (a >= 1) continue;
      const tiers = p.tiers ?? 3;
      const f = a * tiers - Math.floor(a * tiers);
      const yy = h * (1 - a) * (1 - 0.06 * a) + h * 0.11 * f * (1 - a * 0.5);
      if (yy > y) y = yy;
    }
    return Math.max(0.05, y);
  };
}

/** Points [u, y(u)] from u0 to u1 (reversed: from u1 to u0). */
function profilePts(yAt, u0, u1, reversed = false) {
  const n = Math.ceil(Math.abs(u1 - u0) / 0.008), out = [];
  for (let i = 0; i <= n; i++) {
    const k = reversed ? n - i : i;
    const u = u0 + ((u1 - u0) * k) / n;
    out.push([u, yAt(u)]);
  }
  return out;
}

/** Region under a profile, base on y = 0. */
function underShape(yAt, u0, u1) {
  return P.poly([[u0, 0], [u1, 0], ...profilePts(yAt, u0, u1, true)]);
}

/** The band between two profiles (the gold rim strip along a skyline). */
function bandShape(yTop, yBot, u0, u1) {
  return P.poly([...profilePts(yTop, u0, u1), ...profilePts(yBot, u0, u1, true)]);
}

/**
 * The sky card of the back V-fold, cut so it is NOT doubled behind the pine
 * ridge glued across it (software GL shades every layer, hidden or not): a
 * hinge strip along the bottom, a column at the crease, and the sky above
 * the skyline (minus a small glue margin m). Tall at the crease, falling in a
 * soft scalloped arc toward the far end.
 */
function skyCard(yRidge, len, h0, h1, strip = 0.12, m = 0.02) {
  const u0 = 0.02, cw = 0.06;
  const top = (u) => {
    const k = (u - u0) / (len - u0);
    return h0 + (h1 - h0) * k * k + 0.035 * Math.abs(Math.sin(k * Math.PI * 4.5));
  };
  const n = 40, topPts = [];
  for (let i = n; i >= 0; i--) { const u = u0 + ((len - u0) * i) / n; topPts.push([u, top(u)]); }
  return P.poly([
    [u0, 0], [len, 0], [len, strip], [u0 + cw, strip],
    ...profilePts((u) => yRidge(u) - m, u0 + cw, len),
    ...topPts,
  ]);
}

/**
 * Crescent moon (radius r) opening toward +x with its lower tip broken off
 * along a jagged tear: the sliver the fox took. Base on y = 0.
 */
function brokenMoon(r) {
  const r2 = r * 0.86, d = r * 0.42;
  // ray from the outer centre at angle psi: the inner circle (centre (d, 0), r2) is hit at s(psi)
  const s = (psi) => d * Math.cos(psi) + Math.sqrt(Math.max(0, d * d * Math.cos(psi) ** 2 - d * d + r2 * r2));
  // tips where s = r
  let tip = 0;
  for (let i = 0; i <= 400; i++) { const psi = (Math.PI * i) / 400; if (s(psi) < r) { tip = psi; break; } }
  const top = 2 * Math.PI - tip - 0.02;     // upper tip (the C opens to +x)
  const cut = tip + 1.15;                    // the upper horn is torn off up to here
  const pts = [];
  const M = 34;
  for (let i = 0; i <= M; i++) { const psi = cut + ((top - cut) * i) / M; pts.push([Math.cos(psi) * r, Math.sin(psi) * r]); }
  for (let i = M; i >= 0; i--) { const psi = cut + ((top - cut) * i) / M; const q = Math.min(r - 0.004, s(psi)); pts.push([Math.cos(psi) * q, Math.sin(psi) * q]); }
  // jagged torn edge from the inner to the outer point at `cut`
  const qi = s(cut), J = 4;
  for (let j = 1; j < J; j++) {
    const rr = qi + ((r - qi) * j) / J;
    const ang = cut + (j % 2 ? 0.07 : -0.03);
    pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr]);
  }
  // rotate a little and rest on y = 0
  const tilt = -0.35, c = Math.cos(tilt), sn = Math.sin(tilt);
  const rot = pts.map(([x, y]) => [x * c - y * sn, x * sn + y * c]);
  let minY = Infinity;
  for (const p of rot) minY = Math.min(minY, p[1]);
  const shape = P.poly(rot.map(([x, y]) => [x, y - minY]));
  // ghost: dashes along where the missing horn was (outer and inner edge), [x, y, angle]
  shape.ghost = [];
  const G = 5;
  for (const edge of [0, 1]) {
    for (let i = 0; i < G; i++) {
      const psi = tip + 0.06 + ((cut - tip - 0.14) * (i + 0.5)) / G;
      const q = edge ? Math.min(r, s(psi)) : r;
      if (edge && r - q < 0.03) continue;
      const x = Math.cos(psi) * q, y = Math.sin(psi) * q;
      const ang = psi + Math.PI / 2 + tilt;
      shape.ghost.push([x * c - y * sn, x * sn + y * c - minY, ang]);
    }
  }
  return shape;
}

/** A rounded-top door outline, w wide, h tall, base on y = 0. */
function archDoor(w, h) {
  const r = w / 2, pts = [[-r, 0], [r, 0], [r, h - r]];
  for (let i = 1; i < 12; i++) { const a = (Math.PI * i) / 12; pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]); }
  pts.push([-r, h - r]);
  return P.poly(pts);
}

/** Path strip along a page centreline [[x, z], ...] (page coords), width w(i). */
function pathStrip(line, w0, w1) {
  const L = [], R = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const w = (w0 + (w1 - w0) * (i / (line.length - 1))) / 2;
    const [x, z] = line[i];
    L.push([x + nx * w, -(z + nz * w)]);
    R.push([x - nx * w, -(z - nz * w)]);
  }
  return P.poly([...L, ...R.reverse()], { r: 0.02 });
}

/**
 * Bake several pagePrint meshes that share one material into a single mesh
 * (one draw call instead of dozens of tiny ones). Same look, same layer.
 */
function mergePrints(list) {
  let n = 0;
  for (const m of list) n += m.geometry.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  for (const m of list) {
    m.updateMatrix();
    nm.getNormalMatrix(m.matrix);
    const g = m.geometry, P0 = g.attributes.position, N0 = g.attributes.normal, U0 = g.attributes.uv;
    for (let i = 0; i < P0.count; i++, o++) {
      v.fromBufferAttribute(P0, i).applyMatrix4(m.matrix); v.toArray(pos, o * 3);
      v.fromBufferAttribute(N0, i).applyMatrix3(nm).normalize(); v.toArray(nrm, o * 3);
      uv[o * 2] = U0.getX(i); uv[o * 2 + 1] = U0.getY(i);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, list[0].material);
  mesh.receiveShadow = true;
  mesh.name = 'merged-prints';
  return mesh;
}

/**
 * glue() for this scene: glued layers are drawn with their face material only
 * (one draw call, no bright cut edge on these 0.007-thin layers, which read as
 * streaks under the moonlight). opts.edge keeps the off-white cut edge.
 */
function glue(onto, what, opts = {}) {
  const m = P.glue(onto, what, opts);
  if (!opts.edge && Array.isArray(m.material)) m.material = m.material[0];
  return m;
}

/**
 * Replace several glued meshes that share a parent and a single material by
 * one mesh (baked transforms). Purely a draw-call saving.
 */
function mergeGlued(list) {
  if (list.length < 2) return list[0];
  const parent = list[0].parent;
  let n = 0;
  for (const m of list) n += m.geometry.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  for (const m of list) {
    m.updateMatrix();
    nm.getNormalMatrix(m.matrix);
    const g = m.geometry, P0 = g.attributes.position, N0 = g.attributes.normal, U0 = g.attributes.uv;
    for (let i = 0; i < P0.count; i++, o++) {
      v.fromBufferAttribute(P0, i).applyMatrix4(m.matrix); v.toArray(pos, o * 3);
      v.fromBufferAttribute(N0, i).applyMatrix3(nm).normalize(); v.toArray(nrm, o * 3);
      uv[o * 2] = U0.getX(i); uv[o * 2 + 1] = U0.getY(i);
    }
    parent.remove(m);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, list[0].material);
  mesh.receiveShadow = true;
  mesh.name = 'merged-glued';
  parent.add(mesh);
  return mesh;
}

/** Catmull-Rom-ish resample of control points into a smooth polyline. */
function smoothLine(ctrl, per = 6) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export function createScene(ctx) {
  const pop = P.createPopup();
  const glowers = [];   // { mats: Material[], d, base, peak }
  const stars = [];     // { mat, d, base, peak, seed }
  let keyN = 0;
  const key = (s) => `night-${s}-${keyN++}`;

  /** Register materials that answer the cascade at distance d. */
  function answer(mats, d, peak = 1, base = 0) {
    glowers.push({ mats, d, peak, base });
  }
  const dist = (x, y, z) => Math.hypot(x - LANTERN.x, (y - LANTERN.y) * 0.8, z - LANTERN.z);

  /**
   * A silhouette tree with a hidden gold rim: dark base card (emissive gold),
   * a slightly lighter tier glued on top, shrunk and nudged away from the
   * lantern so the rim is widest on the side that faces her. Trees at a
   * similar distance d from the lantern share their glowing materials (one
   * band per BAND units), so the cascade still travels but the scene keeps
   * few materials.
   */
  const BAND = 0.4;
  const bandAnswered = new Set();
  function rimTree(shape, opts) {
    const band = Math.round(opts.d / BAND);
    const answerOnce = (mat, peak) => {
      if (bandAnswered.has(mat)) return;
      bandAnswered.add(mat);
      answer([mat], band * BAND, peak);
    };
    const base = P.cutout(shape, { color: opts.dark ?? DARK, emissive: RIM, key: `night-rim-${band}`, name: opts.name, shadow: !opts.noShadow });
    const tier = glue(base, shape, { color: opts.tone ?? TONE, scale: opts.inset ?? 0.91, x: opts.nudge ?? 0 });
    answerOnce(base.material[0], opts.peak ?? 0.85);
    if (opts.hi) {
      // warm glued highlights: small leaf flecks, invisible until they glow
      const flecks = opts.hi.map(([x, y, s]) => glue(tier, opts.hiShape ?? HI_SHAPE, { color: opts.tone ?? TONE, emissive: WARM, key: `night-hi-${band}`, x, y, scale: s }));
      answerOnce(mergeGlued(flecks).material, 1);
    }
    return { base, tier };
  }
  const HI_SHAPE = P.ellipse(0.07, 0.035, { segments: 14 });

  // ---------------------------------------------------------------------------
  // Pages: indigo wash, a lighter path home, star specks and dew
  // ---------------------------------------------------------------------------
  // The wash, plus a strip along the spine that closes the cream seam: on the
  // left it overhangs the gutter roll (it rides with the left page, like a
  // paper flap), so the lantern does not light up a bright cream stripe right
  // beside her. Each page's wash and strip are one mesh.
  for (const [side, col, sx, w] of [['left', PAGE_L, 0.0, 0.26], ['right', PAGE_R, 0.06, 0.12]]) {
    const wash = pop.tint(side, col);
    wash.parent.remove(wash);
    const strip = P.pagePrint(P.rect(w, PAGE_DEPTH - 0.2), { color: col, x: sx, z: PAGE_DEPTH / 2 - 0.1 });
    pop.print(side, mergePrints([wash, strip]));
  }
  const lineL = smoothLine([[-1.6, 0.12], [-1.35, 0.42], [-0.85, 0.6], [-0.35, 0.62], [0.04, 0.66]]);
  const lineR = smoothLine([[-0.04, 0.66], [0.3, 0.8], [0.75, 0.95], [1.3, 1.12], [1.9, 1.3], [2.45, 1.5], [2.86, 1.66]]);
  pop.print('left', P.pagePrint(pathStrip(lineL, 0.2, 0.3), { color: PATH, layer: 2 }));
  pop.print('right', P.pagePrint(pathStrip(lineR, 0.3, 0.4), { color: PATH, layer: 2 }));

  // dew along the path and star specks on the pages: tiny prints, merged per
  // page and band into one mesh each (bands answer the cascade in turn)
  const dewShape = P.circle(0.016, { segments: 10 });
  const speckShape = P.star(0.032);
  const r = (s) => hash01(s);
  const buckets = new Map();
  const bucket = (side, kind, band, mat, d, peak, base) => {
    const id = `${side}|${kind}|${band}`;
    if (!buckets.has(id)) buckets.set(id, { side, list: [], mat, d, peak, base });
    return buckets.get(id).list;
  };
  const pathPts = [...lineR.slice().reverse(), ...lineL.slice().reverse()];
  const dewMats = [0, 1].map(() => key('dew'));   // one per page: right (near her), left
  for (let i = 0; i < pathPts.length; i += 2) {
    const [x, z] = pathPts[i];
    if (Math.abs(x) < 0.14) continue;
    const ox = (r(i * 7.1) - 0.5) * 0.16, oz = (r(i * 3.3) - 0.5) * 0.1;
    const b = x < 0 ? 1 : 0;
    const m = P.pagePrint(dewShape, { color: N.pane, emissive: WARM, key: dewMats[b], x: x + ox, z: z + oz, layer: 3 });
    bucket(x < 0 ? 'left' : 'right', 'dew', b, m.material, 0.3 + b * 1.6, 1.6, 0.05).push(m);
  }
  const speckMats = [0, 1].map(() => key('speck'));
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 'right' : 'left';
    const x = (side === 'left' ? -1 : 1) * (0.25 + r(i * 11.7) * 2.45);
    const z = -1.7 + r(i * 5.3 + 1) * 3.4;
    const b = side === 'left' ? 1 : 0;
    const m = P.pagePrint(speckShape, { color: '#8a7a4a', emissive: N.gold, key: speckMats[b], x, z, rot: r(i) * 3, layer: 3, scale: 0.7 + r(i * 2.2) * 0.6 });
    bucket(side, 'speck', b, m.material, 0.8 + b * 1.4, 1.3, 0.04).push(m);
  }
  const answered = new Set();
  for (const B of buckets.values()) {
    pop.print(B.side, mergePrints(B.list));
    if (!answered.has(B.mat)) { answered.add(B.mat); answer([B.mat], B.d, B.peak, B.base); }
  }
  // Draw the page art before the book's own page surfaces (which it covers):
  // the page underneath then fails the depth test instead of being shaded twice.
  for (const g of [pop.left, pop.right]) for (const m of g.children) if (m.isMesh) m.renderOrder = -1;

  // ---------------------------------------------------------------------------
  // Center: the sky-panel V-fold (stars, moon, pine ridge) and a front pine row
  // ---------------------------------------------------------------------------
  const wingPos = (V, side, u, v) => {
    const s = side === 'left' ? -1 : 1;
    return [s * u * Math.sin(V.angle), v, V.z - u * Math.cos(V.angle)];
  };
  const ridgeL = [
    { c: 0.14, h: 1.38, w: 0.4 }, { c: 0.55, h: 1.56, w: 0.44 }, { c: 0.98, h: 1.22, w: 0.38 },
    { c: 1.36, h: 1.46, w: 0.42 }, { c: 1.76, h: 1.18, w: 0.36 },
  ];
  const ridgeR = [
    { c: 0.16, h: 1.42, w: 0.42 }, { c: 0.6, h: 1.2, w: 0.38 }, { c: 0.98, h: 1.5, w: 0.44 },
    { c: 1.4, h: 1.3, w: 0.4 }, { c: 1.78, h: 1.12, w: 0.34 },
  ];
  // the back V-fold: a night-sky card with the pine ridge glued across it
  const outerL = ridgeProfile(ridgeL, 0.55), outerR = ridgeProfile(ridgeR, 0.55);
  const back = pop.vfold({
    z: BACK.z, angle: BACK.angle, direction: 'back', color: SKY,
    left: skyCard(outerL, BACK.len, 2.22, 1.72), right: skyCard(outerR, BACK.len, 2.22, 1.72),
  });
  // its shadow would only fall behind it (moonlight from the upper left-front): skip the cost
  back.left.card.castShadow = back.right.card.castShadow = false;
  const RIM_W = 0.035;
  for (const [side, ridge, outer] of [['left', ridgeL, outerL], ['right', ridgeR, outerR]]) {
    const wing = back[side];
    const inner = ridgeProfile(ridge, 0.55, RIM_W);
    // the pines (deep teal) and, along their skyline, a strip of dark card
    // whose emissive is the gold rim; neither covers the other much
    glue(wing.card, underShape((u) => inner(u) + 0.01, 0.02, BACK.len), { color: TONE, thickness: 0.004 });
    const rim = glue(wing.card, bandShape(outer, inner, 0.02, BACK.len), { color: DARK, emissive: RIM, key: key('ridge'), thickness: 0.004 });
    const [x, y, z] = wingPos(BACK, side, 0.9, 0.9);
    answer([rim.material], dist(x, y, z), 0.8);
    // stars glued on the sky
    const starSpots = side === 'left'
      ? [[0.3, 1.86, 0.06], [0.75, 1.98, 0.045], [1.05, 1.72, 0.055], [1.4, 1.84, 0.04], [1.72, 1.66, 0.05]]
      : [[0.25, 1.95, 0.045], [1.35, 1.88, 0.05], [1.6, 1.6, 0.04], [1.15, 1.62, 0.035], [1.85, 1.55, 0.04]];
    for (let set = 0; set < 2; set++) {
      const k2 = key('star');
      const list = [];
      let dd = 0;
      starSpots.forEach(([u, v, rr], i) => {
        if (i % 2 !== set) return;
        list.push(glue(wing.card, P.star(rr), { color: N.gold, emissive: N.gold, key: k2, x: u, y: v, rot: u * 2 }));
        const [sx, sy, sz] = wingPos(BACK, side, u, v);
        dd += dist(sx, sy, sz) / Math.ceil((starSpots.length - set) / 2);
      });
      const sm = mergeGlued(list);
      stars.push({ mat: sm.material, d: dd, base: 0.18, peak: 1.5, seed: stars.length + 1 });
    }
  }
  // the moon, missing her sliver, on the right wing of the sky
  const MOON = { x: 0.6, y: 1.55 };
  const moonShape = brokenMoon(0.27);
  const moon = glue(back.right.card, moonShape, { color: '#f3dc96', emissive: '#ffd27a', key: 'night-moon', x: MOON.x, y: MOON.y, edge: true });
  const moonMat = moon.material[0];
  const moonD = dist(...wingPos(BACK, 'right', 0.75, 1.8));
  // nothing casts onto the sky panel (its pines are glued on; the moonlight
  // comes from the front): skip the shadow lookups on its whole wing area
  back.group.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  // a faint dashed outline where the torn-off horn used to be
  const dash = P.roundRect(0.032, 0.007, 0.003);
  const ghost = mergeGlued(moonShape.ghost.map(([x, y, a]) => glue(back.right.card, dash,
    { color: '#8f8460', emissive: '#ffd27a', key: 'night-moon-ghost', x: MOON.x + x, y: MOON.y + y, rot: a, thickness: 0.003 })));
  const crumbMat = [ghost.material];

  const rowL = [{ c: 0.2, h: 0.95, w: 0.34 }, { c: 0.62, h: 1.12, w: 0.38 }, { c: 1.08, h: 0.88, w: 0.34 }, { c: 1.4, h: 0.7, w: 0.26 }];
  const rowR = [{ c: 0.22, h: 0.88, w: 0.34 }, { c: 0.66, h: 1.06, w: 0.36 }, { c: 1.1, h: 0.86, w: 0.32 }, { c: 1.4, h: 0.66, w: 0.26 }];
  // the front V-fold: a lower row of pines (one card each side) with a rim strip
  const outerFL = ridgeProfile(rowL, 0.3), outerFR = ridgeProfile(rowR, 0.3);
  const front = pop.vfold({
    z: FRONT.z, angle: FRONT.angle, direction: 'back',
    left: underShape(outerFL, 0.02, FRONT.len), right: underShape(outerFR, 0.02, FRONT.len),
    leftColor: TONE_B, rightColor: TONE,
  });
  for (const [side, row, outer] of [['left', rowL, outerFL], ['right', rowR, outerFR]]) {
    const rim = glue(front[side].card, bandShape(outer, ridgeProfile(row, 0.3, RIM_W), 0.02, FRONT.len),
      { color: DARK, emissive: RIM, key: key('frow'), thickness: 0.004 });
    answer([rim.material], dist(...wingPos(FRONT, side, 0.7, 0.5)), 0.9);
  }

  // ---------------------------------------------------------------------------
  // Standing pieces
  // ---------------------------------------------------------------------------
  const standTree = (side, shape, x, z, opts = {}) => {
    const t = rimTree(shape, { ...opts, d: dist(x, opts.h ?? 0.8, z) });
    pop.stand(side, t.base, { x, z, foldToward: opts.fold ?? 'front', delay: opts.delay ?? 0, yaw: opts.yaw ?? 0 });
    return t;
  };
  // nudge = away from the lantern (the rim is widest on her side)
  const away = (x) => (x < LANTERN.x ? -0.025 : 0.025);

  // ---- left page: the deep woods ----
  standTree('left', P.pine(0.85, 2.2, { tiers: 4, seed: 3 }), -2.45, -1.45, { h: 1.1, nudge: away(-2.45), delay: 0.06 });
  standTree('left', P.pine(0.8, 2.35, { tiers: 4, seed: 8 }), -1.92, -1.72, { h: 1.2, nudge: away(-1.92), tone: TONE_B, delay: 0.12 });
  standTree('left', P.roundTree(0.95, 1.55, { lumps: 9, seed: 4 }), -2.5, -0.8, {
    h: 1.0, nudge: away(-2.5), delay: 0.04, hi: [[0.22, 1.1, 1], [0.3, 0.85, 0.8], [0.05, 1.3, 0.7]],
  });
  standTree('left', P.pine(0.48, 0.85, { tiers: 3, seed: 12 }), -2.42, 0.65, { h: 0.45, nudge: away(-2.42), delay: 0.14, tone: TONE_B });
  standTree('left', P.pine(0.42, 0.8, { tiers: 3, seed: 15 }), -0.42, 0.25, { h: 0.45, nudge: away(-0.42), delay: 0.22 });

  // ---- HOME: the den tree ----
  const DEN = { x: -1.55, z: -0.02 };
  const trunkShape = P.poly([
    [-0.42, 0, 0.03], [-0.28, 0.06, 0.05], [0.28, 0.06, 0.05], [0.44, 0, 0.03], [0.26, 0.2, 0.08],
    [0.24, 0.85, 0.05], [0.42, 1.12, 0.03], [0.34, 1.16, 0.02], [0.12, 0.98, 0.04],
    [-0.08, 1.02, 0.04], [-0.3, 1.2, 0.02], [-0.38, 1.14, 0.03], [-0.24, 0.86, 0.05], [-0.26, 0.2, 0.08],
  ]);
  // the trunk is rimmed like the trees (its light side faces her)
  const trunk = P.cutout(trunkShape, { color: '#2a2132', emissive: RIM, key: 'night-den-trunk', name: 'den-trunk' });
  glue(trunk, trunkShape, { color: TRUNK, scale: 0.95, x: -0.022, thickness: 0.003 });
  const canopyShape = P.cloud(1.55, 0.8, { lumps: 6, seed: 9 });
  const canopy = rimTree(canopyShape, {
    nudge: -0.03, inset: 0.92, d: dist(DEN.x, 1.3, DEN.z),
    hi: [[0.3, 0.55, 1.1], [0.45, 0.35, 0.9], [0.12, 0.7, 0.8], [-0.2, 0.62, 0.7], [0.55, 0.2, 0.8]],
  });
  canopy.base.position.set(0, 0.92, -0.024);
  trunk.add(canopy.base);
  // the den: a round door (ajar: a crack of light), a round window, a knob
  const doorShape = archDoor(0.22, 0.34);
  const glowFrame = glue(trunk, P.roundRect(0.27, 0.37, 0.12), { color: '#2a2034', emissive: WARM, key: 'night-den-door', y: 0.055 });
  const door = glue(glowFrame, doorShape, { color: DOOR, x: -0.012, y: 0.012 });
  glue(door, P.circle(0.015, { segments: 10 }), { color: N.gold, x: 0.065, y: 0.15 });
  const ring = glue(trunk, P.withHoles(P.circle(0.12), P.translate(P.circle(0.088), 0, 0.032)), { color: '#5a4660', y: 0.52 });
  const pane = glue(trunk, P.circle(0.094), { color: '#2c2640', emissive: WARM, key: 'night-den-window', y: 0.546 });
  mergeGlued([glue(pane, P.roundRect(0.014, 0.188), { color: '#3a2c3e', y: 0 }), glue(pane, P.roundRect(0.188, 0.014), { color: '#3a2c3e', y: 0.087 })]);
  void ring;
  pop.stand('left', trunk, { x: DEN.x, z: DEN.z, foldToward: 'front', delay: 0.16 });
  const denMats = [glowFrame.material, pane.material];
  const denD = dist(DEN.x, 0.4, DEN.z);
  answer([trunk.material[0]], denD, 0.7);
  // a tiny step and a mailbox
  const step = P.cutout(P.roundRect(0.3, 0.065, 0.015), { color: '#4b3d57', name: 'den-step', shadow: false });
  glue(step, P.roundRect(0.28, 0.014, 0.006), { color: '#6a5878', y: 0.045 });
  pop.stand('left', step, { x: DEN.x - 0.01, z: DEN.z + 0.13, delay: 0.2 });
  const post = P.cutout(P.roundRect(0.035, 0.34, 0.006), { color: TRUNK, name: 'mailbox' });
  const box = glue(post, P.roundRect(0.17, 0.11, 0.035), { color: '#3c4a7a', y: 0.3, shadow: true, edge: true });
  glue(box, P.roundRect(0.11, 0.012, 0.004), { color: '#25305a', y: 0.04 });
  glue(box, P.poly([[0.07, 0.03], [0.085, 0.03], [0.085, 0.17], [0.15, 0.15], [0.085, 0.12]]), { color: '#c8673f', shadow: true, edge: true });
  pop.stand('left', post, { x: -0.85, z: 0.32, delay: 0.18, yaw: 0.25 });

  // ---- left foreground ----
  standTree('left', P.bush(0.75, 0.42, { seed: 6 }), -2.3, 1.3, { h: 0.2, noShadow: true, nudge: away(-2.3), fold: 'back', delay: 0.22, hi: [[0.15, 0.25, 0.8]] });
  standTree('left', P.bush(0.5, 0.28, { seed: 13 }), -0.75, 1.45, { h: 0.15, noShadow: true, nudge: away(-0.75), fold: 'back', delay: 0.24, tone: TONE_B });
  standTree('left', P.grass(0.6, 0.2, { seed: 5 }), -1.55, 1.62, { h: 0.1, noShadow: true, fold: 'back', delay: 0.26, inset: 0.9 });

  // ---- right page: the clearing ----
  standTree('right', P.pine(0.8, 2.3, { tiers: 4, seed: 21 }), 1.95, -1.7, { h: 1.15, nudge: away(1.95), delay: 0.12 });
  standTree('right', P.pine(0.5, 1.75, { tiers: 4, seed: 24 }), 2.42, -1.18, { h: 0.9, nudge: away(2.42), tone: TONE_B, delay: 0.03 });
  standTree('right', P.roundTree(0.82, 1.3, { lumps: 8, seed: 27 }), 2.18, -0.42, {
    h: 0.8, nudge: away(2.18), delay: 0.07, hi: [[-0.2, 0.9, 1], [-0.28, 0.65, 0.8], [-0.05, 1.05, 0.7]],
  });
  standTree('right', P.pine(0.5, 0.95, { tiers: 3, seed: 30 }), 1.52, -0.18, { h: 0.5, nudge: away(1.52), delay: 0.1 });
  standTree('right', P.bush(0.7, 0.4, { seed: 31 }), 2.32, 1.2, { h: 0.2, noShadow: true, nudge: away(2.32), fold: 'back', delay: 0.22, hi: [[-0.15, 0.25, 0.8]] });
  standTree('right', P.grass(0.5, 0.16, { seed: 33 }), 1.62, 1.62, { h: 0.08, noShadow: true, fold: 'back', delay: 0.26, inset: 0.9 });
  standTree('right', P.grass(0.34, 0.13, { seed: 36 }), 0.3, 1.62, { h: 0.06, noShadow: true, fold: 'back', delay: 0.27, inset: 0.9 });

  // ---- paper stars on thin stalks above the trees ----
  const stalkSpots = [
    ['left', -2.2, -1.78, 2.45, 0.085, 0.08], ['left', -0.95, -1.78, 2.5, 0.07, 0.2], ['left', -2.65, -0.15, 1.95, 0.06, 0.04],
    ['right', 0.78, -1.78, 2.48, 0.075, 0.24], ['right', 2.55, -1.72, 2.3, 0.08, 0.06],
  ];
  for (const [side, x, z, h, rr, delay] of stalkSpots) {
    const stalk = P.cutout(P.rect(0.012, h - rr * 1.2), { color: '#141a33', thickness: 0.008, name: 'star-stalk', shadow: false });
    stalk.material = stalk.material[0]; // a dark thread: no bright cut edge on a 0.012-wide strip
    const st = glue(stalk, P.star(rr), { color: N.gold, emissive: N.gold, key: key('star'), y: h - rr * 2.1, x: 0, thickness: 0.012, edge: true });
    pop.stand(side, stalk, { x, z, foldToward: 'front', delay });
    stars.push({ mat: st.material[0], d: dist(x, h, z), base: 0.22, peak: 1.6, seed: stars.length + 1 });
  }
  // ignite one after another: order by distance, then space them out a little
  stars.sort((a, b) => a.d - b.d);
  stars.forEach((s, i) => { s.d = Math.max(s.d, 1.2 + i * 0.16); });

  // ---- the fox, walking home (facing left) with the moon's sliver in her lantern ----
  const fox = createFox({ pose: 'walk', facing: -1, lantern: true, light: true, intensity: 5.0, distance: 6 });
  pop.stand('right', fox.group, { x: FOX.x, z: FOX.z, delay: 0.2 });

  // ---- fireflies (tiny gold dots) among the trees ----
  const ffShape = P.circle(0.026, { segments: 10 });
  const ffMat = P.paperMaterial(N.gold, { emissive: '#ffd36b', key: 'night-firefly' });
  const ffGeo = P.cutout(ffShape, { thickness: 0.004 }).geometry; // drawn whole with one material
  const fireflies = [];
  const ffSpots = [
    ['left', -2.15, 0.8, -0.3], ['left', -1.05, 1.1, -0.45], ['left', -0.7, 0.55, 0.65], ['left', -2.0, 0.45, 0.85],
    ['left', -1.3, 1.6, 0.35], ['right', 1.8, 0.75, 0.25], ['right', 1.25, 1.25, -0.4], ['right', 2.1, 1.45, -0.9],
    ['right', 0.35, 1.35, 0.05], ['right', 1.6, 0.45, 1.1],
  ];
  ffSpots.forEach(([side, x, y, z], i) => {
    const m = new THREE.Mesh(ffGeo, ffMat);
    m.name = 'firefly';
    m.castShadow = false;
    (side === 'left' ? pop.left : pop.right).add(m);
    fireflies.push({ m, x, y, z, d: dist(x, y, z) + 0.3, p: hash01(i * 13 + 5) * 6.28, q: hash01(i * 7 + 2) * 6.28, f: 0.18 + hash01(i * 3 + 1) * 0.15 });
  });

  // ---- the one light: the lantern's ----
  // main.js hides this scene's groups while the spread is shut, and a light in
  // a hidden group drops out of the renderer's light list: every shader would
  // recompile when the spread opens (a hitch at 55.5 s). So the lantern's
  // light lives in an always-visible rig on the scene root from construction,
  // is placed from the lantern's frame in update(), and reads as intensity 0
  // whenever the spread is hidden (a getter, so a seek away never leaves a
  // stale light on). The forest's glow is all emissive paper: a second point
  // light cost ~40 ms per frame on this machine for little visible gain.
  const rig = new THREE.Group();
  rig.name = 'night-lights';
  ctx.scene.add(rig);
  const gate = (light) => {
    let v = 0;
    Object.defineProperty(light, 'intensity', { configurable: true, get: () => (pop.right.visible ? v : 0), set: (x) => { v = x; } });
    rig.add(light);
    return light;
  };
  const lanternLight = gate(fox.lantern.light);   // taken out of the lantern; placed below
  // a little above and in front of the pane (lantern units), so the pane keeps
  // its amber instead of burning white, and the pool is wider
  const LANTERN_LIGHT = new THREE.Vector3(0, 0.42, 0.42);

  // ---------------------------------------------------------------------------
  function update(state, spread) {
    pop.update(spread);
    const t = state.t;
    // openness: everything that shines fades into the closing book
    const k = clamp01(P.rise(spread.open, { delay: 0.12, span: 0.6, spring: 0 }));
    const g = state.glow;

    // the lantern: burning low with the sliver, then swelling to full
    const lantern = (0.17 + 0.83 * g) * P.flicker(t, 4);
    fox.setGlow(lantern * k);
    fox.tail.rotation.z = P.sway(t, { freq: 0.3, amp: 0.05 });

    // the cascade
    for (let i = 0; i < glowers.length; i++) {
      const G = glowers[i];
      const w = cascade(t, G.d);
      const v = (G.base + (G.peak - G.base) * w) * k;
      for (let j = 0; j < G.mats.length; j++) G.mats[j].emissiveIntensity = v;
    }
    for (let i = 0; i < stars.length; i++) {
      const S = stars[i];
      const w = cascade(t, S.d);
      const tw = 0.7 + 0.3 * P.twinkle(t, S.seed, { speed: 0.8 });
      S.mat.emissiveIntensity = (S.base * (0.85 + 0.15 * tw) + (S.peak - S.base) * w * tw) * k;
    }
    const mw = cascade(t, moonD);
    moonMat.emissiveIntensity = (0.32 + 0.75 * mw) * k;
    crumbMat[0].emissiveIntensity = (0.15 + 0.35 * mw) * k;

    const dw = cascade(t, denD);
    const denFl = P.flicker(t, 9);
    for (let j = 0; j < denMats.length; j++) denMats[j].emissiveIntensity = 1.6 * dw * denFl * k;
    // place the light from the current (already posed) lantern frame
    fox.lantern.group.updateWorldMatrix(true, false);
    lanternLight.position.copy(LANTERN_LIGHT).applyMatrix4(fox.lantern.group.matrixWorld);

    // fireflies wake, rise and hover (closed form)
    ffMat.emissiveIntensity = 2.2 * k;
    for (let i = 0; i < fireflies.length; i++) {
      const F = fireflies[i];
      const w = cascade(t, F.d);
      const s = w * k;
      F.m.visible = s > 0.02;
      if (!F.m.visible) continue;
      const tt = t * F.f * 6.283;
      F.m.position.set(
        F.x + 0.07 * Math.sin(tt + F.p),
        (F.y - 0.25 * (1 - w)) * k + 0.06 * Math.sin(tt * 1.37 + F.q),
        F.z + 0.05 * Math.sin(tt * 0.83 + F.q),
      );
      F.m.scale.setScalar(s * (0.8 + 0.25 * Math.sin(tt * 2.9 + F.p)));
    }
  }

  return { left: pop.left, right: pop.right, center: pop.center, update };
}
