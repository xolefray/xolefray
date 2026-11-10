// Spread 0 - "The Paper Forest" (day).
// "Deep in a paper forest, a small fox found a lantern with no light."
//
// Layers, back to front:
//   center  a V-fold forest wall across the gutter: a deep-green pine ridge with
//           a lighter tier, sunlit tips and a teal undergrowth band glued on;
//   left    the deep woods: tall pines behind and beside the wall, a round tree
//           and a second pine row, a stump, ferns and bushes, red-capped
//           mushrooms and grass tufts in the foreground;
//   right   the clearing: pines and a round tree behind the fox, a bush to her
//           right, the unlit lantern just in front of her nose, low grass;
//   pages   a pale moss wash, darker moss under the woods, a winding cream path
//           to the fox, stepping stones, leaf prints and soft tree shadows.
//
// Folding: every flap folds toward the viewer and is linked to the wall: its
// standing angle never exceeds the V-fold wall's (so the wall settles over the
// scenery like a real linked pop-up) nor what the half-closed facing page allows.
// On top of that the toolkit's per-flap rise gives the cascade: back trees,
// middle, foreground, lantern, fox last (and first down when the page turns).
// Ambient: treetops rocking out of phase, the fox's tail, a tiny tilt of her
// head, a paper butterfly over the lantern.
import * as THREE from 'three';
import * as P from '../paper.js';
import { createFox, createLantern } from '../characters.js';
import { SPREAD_LAYOUT } from '../layout.js';
import { rng, smoothstep } from '../util.js';

const C = P.PALETTE;
const F = C.forest;

/** Mix two palette colours (a + (b - a) * t) -> hex string. */
function mix(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** A ribbon shape along a page-space centreline [[x, z, halfWidth], ...] (pagePrint it at x = z = 0). */
function ribbon(pts) {
  const l = [], r = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const [x, z, w] = pts[i];
    l.push([x - dz * w, -(z + dx * w), 0.03]);   // shape coords = (page x, -page z)
    r.push([x + dz * w, -(z - dx * w), 0.03]);
  }
  return P.poly([...l, ...r.reverse()]);
}

/** Pine-ridge silhouette for a V-fold wing: u in [0, U], pines [[u, w, h], ...], base on v = 0. */
function pineRidge(U, pines, opts = {}) {
  const tiers = opts.tiers ?? 3;
  const base = opts.base ?? 0.25;
  const tierOf = (w, h, i) => {
    const b = h * (0.12 + 0.27 * i);
    const hw = (w / 2) * (1 - i * 0.28);
    const apex = i === tiers - 1 ? h : h * (0.12 + 0.27 * (i + 1)) + h * 0.13;
    return [b, hw, apex];
  };
  const prof = (u) => {
    let y = base;
    for (const [c, w, h] of pines) {
      const d = Math.abs(u - c);
      for (let i = 0; i < tiers; i++) {
        const [b, hw, apex] = tierOf(w, h, i);
        if (d < hw) y = Math.max(y, b + (apex - b) * (1 - d / hw));
      }
    }
    return y;
  };
  const us = new Set();
  for (let i = 0; i <= 100; i++) us.add(+(U * i / 100).toFixed(4));
  for (const [c, w, h] of pines) {
    for (let i = 0; i < tiers; i++) {
      const hw = tierOf(w, h, i)[1];
      for (const u of [c, c - hw, c + hw]) if (u >= 0 && u <= U) us.add(+u.toFixed(4));
    }
  }
  const top = [...us].sort((a, b) => a - b).map((u) => [u, prof(u)]);
  return P.poly([[U, 0], ...top.reverse(), [0, 0]]);
}

/**
 * Standing angle (radians, from its own page) of a V-fold wing hinged at
 * `alpha` from the spine, direction 'back', when the spread's page angle is
 * theta (paper.js poseVfold, reduced to the angle between wing and page).
 */
function wingTilt(alpha, theta) {
  const a = Math.sin(theta / 2), b = Math.cos(theta / 2);
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  const cy = ca, cz = sa * b, cl = Math.hypot(cy, cz);
  const cY = cy / cl, cZ = cz / cl;
  const hx = sa * a, hy = sa * b, hz = -ca;
  const nx = hy * cZ - hz * cY, ny = -hx * cZ, nz = hx * cY;
  const dot = Math.abs(-b * nx + a * ny) / Math.hypot(nx, ny, nz);
  return Math.acos(Math.min(1, dot));
}

/**
 * Bake a finished piece (a cut-out with its glued layers, or a Group of them)
 * into at most two multi-material meshes - the shadow-casting cards and the
 * thin glued layers (which cast none, as before) - with one draw group per
 * material: same look, a handful of draw calls instead of dozens (software GL
 * is draw-call bound). Children marked userData.keep (moving pivots: a cat's
 * tail, a hanging sign) are re-parented to the root unchanged. Returns the
 * root. Call it after the last glue() and before pop.stand().
 * opts.cast = false: nothing casts a shadow (page prints).
 */
const _bm = new THREE.Matrix4();
const _bn = new THREE.Matrix3();
const _bv = new THREE.Vector3();
function bake(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const meshes = [], keep = [];
  if (root.isMesh) meshes.push(root);
  (function walk(o) {
    for (const c of o.children) {
      if (c.userData.keep) { keep.push(c); continue; }
      if (c.isMesh) meshes.push(c);
      walk(c);
    }
  })(root);
  if (meshes.length <= 1 && !keep.length) return root;
  const sets = [new Map(), new Map()]; // [casting, flat]
  for (const m of meshes) {
    const buckets = sets[m.castShadow && opts.cast !== false ? 0 : 1];
    _bm.multiplyMatrices(inv, m.matrixWorld);
    _bn.getNormalMatrix(_bm);
    const order = _bm.determinant() < 0 ? [0, 2, 1] : [0, 1, 2];
    const g = m.geometry;
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex];
      let b = buckets.get(mat);
      if (!b) { b = { p: [], n: [], u: [] }; buckets.set(mat, b); }
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        for (const k of order) {
          const j = i + k;
          _bv.fromBufferAttribute(pos, j).applyMatrix4(_bm);
          b.p.push(_bv.x, _bv.y, _bv.z);
          _bv.fromBufferAttribute(nrm, j).applyMatrix3(_bn).normalize();
          b.n.push(_bv.x, _bv.y, _bv.z);
          b.u.push(uv.getX(j), uv.getY(j));
        }
      }
    }
  }
  const build = (buckets) => {
    if (!buckets.size) return null;
    const p = [], n = [], u = [], mats = [];
    const geo = new THREE.BufferGeometry();
    for (const [mat, b] of buckets) {
      geo.addGroup(p.length / 3, b.p.length / 3, mats.length);
      mats.push(mat);
      for (let i = 0; i < b.p.length; i++) { p.push(b.p[i]); n.push(b.n[i]); }
      for (let i = 0; i < b.u.length; i++) u.push(b.u[i]);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return { geo, mats };
  };
  const built = [build(sets[0]), build(sets[1])];
  const keptM = keep.map((k) => new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld));
  for (const m of meshes) if (m !== root) m.removeFromParent();
  for (const k of keep) k.removeFromParent();
  built.forEach((b, i) => {
    if (!b) return;
    let target;
    if (root.isMesh && !root.userData.baked) {
      target = root;
      root.userData.baked = true;
    } else {
      target = new THREE.Mesh();
      target.name = `${root.name || 'piece'}-baked-${i}`;
      root.add(target);
    }
    target.geometry = b.geo;
    target.material = b.mats;
    target.castShadow = i === 0;
    target.receiveShadow = true;
    // draw glued layers first, then the cards they sit on, then page art, then
    // the book: hidden fragments fail the depth test instead of being shaded
    target.renderOrder = i === 0 ? -2 : -3;
  });
  keep.forEach((k, i) => {
    keptM[i].decompose(k.position, k.quaternion, k.scale);
    root.add(k);
  });
  return root;
}

/**
 * Bake a page's art (tint + prints) into one mesh per print layer, the top
 * layer drawn first (renderOrder), so the layers below it are not shaded twice.
 */
function bakePrints(group) {
  const layers = new Map();
  for (const m of group.children.slice()) {
    if (!m.isMesh) continue;
    const u = m.material.polygonOffsetUnits;
    if (!layers.has(u)) layers.set(u, []);
    layers.get(u).push(m);
  }
  for (const [u, list] of layers) {
    const g = new THREE.Group();
    group.add(g);
    for (const m of list) g.add(m);
    bake(g, { cast: false });
    g.traverse((o) => { if (o.isMesh) { o.renderOrder = -1 + 0.05 * u; o.castShadow = false; } });
  }
}

/**
 * Linked folding for flaps that all fold toward the viewer ('front'). After
 * pop.update(), apply(theta) re-poses the flaps so that
 *   - no flap pokes over the bisector of the half-closed spread (the flaps of
 *     the facing page come down on the other side of it);
 *   - flaps in front of the 'back' V-fold wall stay under the wall as it
 *     settles forward over them; flaps behind its end stay above it;
 *   - a flap in front of a taller one stays under it, and a flap behind lifts
 *     just enough to clear the ones lying in front of it (shingled: lying-flat
 *     cards never cut through each other).
 * The toolkit's rise (with its stagger) is the starting point; these limits
 * only matter while the spread is part-open. Pure in theta and the toolkit's
 * rise; allocates nothing per frame.
 * add() measures the piece, so call it BEFORE pop.stand() parents the piece.
 */
function createLinker(wall) {
  const list = [];
  const box = new THREE.Box3();
  const sa = wall ? Math.sin(wall.alpha) : 0, ca = wall ? Math.cos(wall.alpha) : 0;
  let order = null;
  function add(side, piece, o) {
    piece.updateMatrixWorld(true); // unparented: world = its own transform
    box.setFromObject(piece);
    const yaw = o.yaw ?? 0, sx = side === 'left' ? -1 : 1;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ends = [box.min.x, box.max.x].map((bx) => [o.x + cy * bx, o.z - sy * bx]);
    const f = { handle: null, side, z: o.z, h: Math.max(0.05, box.max.y), ends, pairs: [], psi: 0, floor: 0, wall: false, over: false };
    let d = Infinity;
    for (const [px] of ends) d = Math.min(d, sx * px);
    f.reach = Math.max(0.02, (d - 0.05) / f.h);
    if (wall) {
      // wing hinge from (0, z0) along (sx*sin a, -cos a); its front normal (sx*cos a, sin a)
      let dMin = Infinity, uMin = Infinity, uMax = -Infinity;
      for (const [px, pz] of ends) {
        const rz = pz - wall.z0;
        dMin = Math.min(dMin, px * sx * ca + rz * sa);
        const u = px * sx * sa - rz * ca;
        uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      }
      f.wall = dMin > -0.05 && dMin < wall.H + 0.1 && uMax > -0.1 && uMin < wall.U + 0.1;
      f.wallD = Math.max(0, dMin - 0.06);
      f.cosG = Math.max(0.25, sy * sx * ca + cy * sa);
      // behind the wall (or past its end) but long enough to lie across it: stay above it
      let xMin = Infinity;
      for (const [px] of ends) xMin = Math.min(xMin, sx * px);
      f.over = !f.wall && (dMin < 0.05 || uMin > wall.U - 0.2) && xMin < wall.U * sa + 1.0;
    }
    list.push(f);
  }
  function finalize() {
    order = list.slice().sort((a, b) => a.z - b.z);
    for (let j = 0; j < order.length; j++) {
      const B = order[j];
      const b0 = Math.min(B.ends[0][0], B.ends[1][0]), b1 = Math.max(B.ends[0][0], B.ends[1][0]);
      for (let i = 0; i < j; i++) {
        const A = order[i];
        if (A.side !== B.side) continue;
        const a0 = Math.min(A.ends[0][0], A.ends[1][0]), a1 = Math.max(A.ends[0][0], A.ends[1][0]);
        if (a1 < b0 - 0.05 || b1 < a0 - 0.05) continue;
        const D = B.z - A.z;
        if (A.h < D * 0.9) continue;
        B.pairs.push(A, Math.max(0, D - 0.04));
      }
    }
    // shingle floors, front to back: a flap lifts at least enough to clear the
    // (lifted) flaps lying in front of it, instead of lying flat through them
    for (let j = order.length - 1; j >= 0; j--) {
      const B = order[j];
      for (let k = 0; k < B.pairs.length; k += 2) {
        const A = B.pairs[k], D = Math.max(0.05, B.pairs[k + 1]);
        A.floor = Math.max(A.floor, B.floor + 0.02, Math.asin(Math.min(1, 0.05 / D)));
      }
    }
  }
  function apply(theta) {
    const full = theta > Math.PI - 1e-4;
    const phi = wall ? wingTilt(wall.alpha, theta) : 0;
    const tb = Math.tan(theta / 2);
    for (let j = 0; j < order.length; j++) {
      const f = order[j];
      const hinge = f.handle.hinge;
      let psi = Math.max(Math.PI / 2 - hinge.rotation.x, f.floor);
      if (!full) {
        if (f.over) psi = Math.max(psi, Math.atan(Math.tan(Math.min(1.5, phi)) / 0.6) + 0.08);
        psi = Math.min(psi, Math.asin(Math.min(1, f.reach * tb)));
        if (f.wall) {
          psi = Math.min(psi, Math.atan(f.cosG * Math.tan(Math.max(0, phi - 0.03))) + Math.asin(Math.min(1, f.wallD * Math.sin(phi) / f.h)));
        }
      }
      for (let k = 0; k < f.pairs.length; k += 2) {
        const A = f.pairs[k], D = f.pairs[k + 1];
        psi = Math.min(psi, A.psi + Math.asin(Math.max(-1, Math.min(1, (D * Math.sin(A.psi) - 0.03) / f.h))));
      }
      if (psi < 0) psi = 0;
      f.psi = psi;
      hinge.rotation.x = Math.PI / 2 - psi;
    }
  }
  return { add, finalize, apply, list };
}

// Shared shapes (one geometry each).
const STEM = P.roundRect(0.028, 0.1, 0.008);
const CAP = P.poly([[-0.05, 0, 0.006], [0.05, 0, 0.006], [0.044, 0.018, 0.01], [0.022, 0.04, 0.02], [0, 0.046], [-0.022, 0.04, 0.02], [-0.044, 0.018, 0.01]]);
const DOT = P.circle(0.008, { segments: 10 });
const LEAF = P.poly([[0, 0, 0.005], [0.035, 0.05, 0.03], [0, 0.13, 0.005], [-0.035, 0.05, 0.03]]);
const WING_F = P.poly([[0, 0, 0.005], [0.07, 0.03, 0.02], [0.095, 0.075, 0.03], [0.06, 0.1, 0.02], [0.012, 0.06, 0.01]]);
const WING_H = P.poly([[0, 0, 0.005], [0.012, -0.01], [0.055, -0.045, 0.02], [0.06, -0.015, 0.015], [0.03, 0.01, 0.01]]);

/** Mushroom cluster: cream stems with red caps and glued dots. */
function mushrooms(seed, n = 3) {
  const rand = rng(seed);
  const g = new THREE.Group();
  g.name = 'mushrooms';
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.085 + (rand() - 0.5) * 0.02;
    const h = 0.07 + rand() * 0.08;
    const r = 0.035 + rand() * 0.02;
    const st = P.cutout(STEM, { color: C.paper.edge });
    st.scale.set(1, h / 0.1, 1);
    st.position.x = x;
    g.add(st);
    const cap = P.cutout(CAP, { color: C.sea.red });
    cap.scale.setScalar(r / 0.05);
    cap.position.set(x, h - 0.01, 0.004);
    g.add(cap);
    P.glue(cap, DOT, { color: C.paper.edge, x: -0.015, y: 0.018 });
    P.glue(cap, DOT, { color: C.paper.edge, x: 0.018, y: 0.012, scale: 0.8 });
  }
  return g;
}

export function createScene(ctx) {
  const pop = P.createPopup();
  const L = SPREAD_LAYOUT[0];

  // --------------------------------------------------- flaps (all fold front)
  const ALPHA = 0.85, U = 1.55, WALL_Z = -0.75, WALL_H = 2.2;
  const link = createLinker({ alpha: ALPHA, z0: WALL_Z, U, H: WALL_H });
  let nFlaps = 0;
  function stand(side, piece, o) {
    if (!o.noBake) bake(piece);
    link.add(side, piece, o);
    const h = pop.stand(side, piece, { ...o, foldToward: 'front' });
    h.hinge.position.y += 0.0009 * (nFlaps++ % 9); // flat flaps never z-fight
    link.list[link.list.length - 1].handle = h;
    return h;
  }

  // ------------------------------------------------------------------ pages
  // (all page art goes into one group per page, baked per print layer at the end)
  const prints = { left: new THREE.Group(), right: new THREE.Group() };
  prints.left.name = prints.right.name = 'page-prints';
  pop.left.add(prints.left);
  pop.right.add(prints.right);
  const print = (side, mesh) => prints[side].add(mesh);
  const wash = mix(F.moss, C.paper.cream, 0.62);
  const washDeep = mix(F.moss, C.paper.cream, 0.42);
  const pathCol = mix(C.paper.kraft, C.paper.cream, 0.55);
  const shadowCol = mix(F.mid, F.moss, 0.55);
  print('left', pop.tint('left', wash));
  print('right', pop.tint('right', wash));
  print('left', P.pagePrint(P.hill(2.9, 1.25), { color: washDeep, x: -1.5, z: -0.3, layer: 1 }));
  print('right', P.pagePrint(P.hill(2.8, 1.1), { color: washDeep, x: 1.5, z: -0.45, layer: 1 }));
  // the winding path: in at the front of the left page, across the gutter, to the fox
  print('left', P.pagePrint(ribbon([[-2.82, 1.62, 0.2], [-2.4, 1.5, 0.24], [-1.8, 1.05, 0.24], [-1.1, 0.9, 0.22],
    [-0.55, 1.05, 0.2], [0.0, 0.92, 0.19]]), { color: pathCol, layer: 2 }));
  print('right', P.pagePrint(ribbon([[0.0, 0.92, 0.19], [0.35, 0.8, 0.19], [0.9, 0.88, 0.32],
    [1.4, 0.9, 0.36], [1.85, 0.72, 0.24], [2.4, 0.32, 0.14], [2.8, 0.12, 0.09]]), { color: pathCol, layer: 2 }));
  const STONE = P.ellipse(0.07, 0.045);
  for (const [s, x, z] of [['left', -2.3, 1.45], ['left', -1.45, 0.98], ['left', -0.7, 1.02], ['right', 0.3, 0.82], ['right', 2.1, 0.52]]) {
    print(s, P.pagePrint(STONE, { color: C.paper.shade, x, z, layer: 3 }));
  }
  const SHADOW = P.ellipse(0.32, 0.12);
  for (const [s, x, z, k] of [['left', -2.2, -1.4, 1.2], ['left', -1.85, -1.65, 0.9], ['left', -1.75, -0.55, 1.1], ['left', -0.95, -0.4, 0.9],
    ['right', 2.2, -1.35, 1.1], ['right', 1.62, -0.45, 1.0], ['right', 1.0, -0.55, 0.8], ['right', 2.36, -0.35, 0.7]]) {
    print(s, P.pagePrint(SHADOW, { color: shadowCol, x: x + 0.14, z: z + 0.1, scale: k, layer: 2 }));
  }
  const leafCols = [F.moss, F.light, mix(F.moss, C.paper.kraft, 0.5)];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 'right' : 'left';
    const sx = side === 'left' ? -1 : 1;
    const x = sx * (0.3 + P.phase01(i * 0.618, 1) * 2.4);
    const z = 1.8 - P.phase01(i * 0.371, 1) * 1.4;
    if (side === 'right' && Math.hypot(x - 1.05, z - 0.9) < 0.6) continue; // the fox's patch stays clear
    print(side, P.pagePrint(LEAF, { color: leafCols[i % 3], x, z, rot: i * 1.7, layer: 3, scale: 0.8 + (i % 3) * 0.2 }));
  }

  // ------------------------------------------------------------- V-fold wall
  const wallShape = pineRidge(U, [[0, 0.62, 2.2], [0.4, 0.5, 1.7], [0.78, 0.55, 1.95], [1.15, 0.48, 1.55], [1.45, 0.4, 1.3]], { base: 0.3 });
  const wall = pop.vfold({ z: WALL_Z, angle: ALPHA, direction: 'back', shape: wallShape, color: F.deep });
  const tierShape = pineRidge(U - 0.05, [[0.2, 0.42, 1.3], [0.6, 0.42, 1.2], [0.98, 0.44, 1.38], [1.32, 0.34, 1.0]], { base: 0.2 });
  const underShape = P.translate(P.bush(U - 0.1, 0.42, { lumps: 8, seed: 21 }), (U - 0.1) / 2 + 0.03, 0);
  const sunTips = P.snowCap(wallShape, 1.6, { drip: 0.04, seed: 5 });
  for (const w of [wall.left, wall.right]) {
    P.glue(w.card, tierShape, { color: F.mid, x: 0.02 });
    P.glue(w.card, underShape, { color: F.teal });
    for (const s of sunTips) P.glue(w.card, s, { color: F.mid });
    bake(w.card);
  }

  // ----------------------------------------------------------- shared shapes
  const PINE_T = P.pine(1.0, 2.35, { tiers: 4, seed: 2 });
  const PINE_T_HI = P.pine(0.52, 1.55, { tiers: 3, seed: 3, trunk: false });
  const PINE_M = P.pine(0.8, 1.75, { tiers: 4, seed: 6 });
  const PINE_M_HI = P.pine(0.42, 1.15, { tiers: 3, seed: 8, trunk: false });
  const PINE_S = P.pine(0.62, 1.25, { tiers: 3, seed: 9 });
  const PINE_S_HI = P.pine(0.32, 0.8, { tiers: 2, seed: 4, trunk: false });
  const TREE = P.roundTree(1.05, 1.6, { seed: 5, lumps: 9 });
  const TREE_S = P.roundTree(0.7, 1.05, { seed: 12, lumps: 7 });
  const LUMP = P.bush(0.34, 0.18, { lumps: 3, seed: 2 });
  const BUSH = P.bush(0.7, 0.36, { seed: 8 });
  const BUSH_S = P.bush(0.46, 0.24, { seed: 14, lumps: 4 });
  const FERN = P.grass(0.42, 0.34, { blades: 7, seed: 31 });
  const GRASS = P.grass(0.5, 0.16, { blades: 9, seed: 13 });
  const GRASS_S = P.grass(0.3, 0.12, { blades: 6, seed: 17 });
  const TRUNK = P.roundRect(0.1, 0.26, 0.01);

  /** A pine with a lighter sunlit tier glued on its upper-left side. */
  function pineTree(shape, hi, color, hiColor, hiX, hiY, name) {
    const card = P.cutout(shape, { color, name });
    P.glue(card, hi, { color: hiColor, x: hiX, y: hiY });
    return card;
  }
  const rockers = []; // [piece, sway options] (options built once: update allocates nothing)

  // ------------------------------------------------------------- left page
  // back: tall pines beside and behind the wall's wing
  const lp1 = pineTree(PINE_T, PINE_T_HI, F.deep, F.mid, -0.08, 0.75, 'pine-left-tall');
  P.glue(lp1, TRUNK, { color: F.trunk });
  stand('left', lp1, { x: -2.2, z: -1.42, delay: 0.08 });
  rockers.push([lp1, { freq: 0.16, amp: 0.018, phase: 0.0 }]);
  const lp2 = pineTree(PINE_M, PINE_M_HI, F.teal, F.light, -0.06, 0.6, 'pine-left-back');
  lp2.scale.setScalar(0.8);
  stand('left', lp2, { x: -1.85, z: -1.7, yaw: 0.1, delay: 0.14 });
  rockers.push([lp2, { freq: 0.16, amp: 0.015, phase: 0.37 }]);
  const lp3 = pineTree(PINE_S, PINE_S_HI, F.deep, F.mid, -0.05, 0.42, 'pine-left-edge');
  stand('left', lp3, { x: -2.36, z: -0.85, yaw: 0.3, delay: 0.16 });
  // middle row
  const tree = P.cutout(TREE, { color: F.light, back: F.deep, name: 'round-tree' });
  P.glue(tree, LUMP, { color: F.moss, x: -0.18, y: 1.12 });
  P.glue(tree, LUMP, { color: F.mid, x: 0.2, y: 0.82, scale: 0.8 });
  P.glue(tree, LUMP, { color: F.moss, x: 0.08, y: 1.32, scale: 0.6 });
  stand('left', tree, { x: -1.72, z: -0.55, yaw: 0.1, delay: 0.17 });
  rockers.push([tree, { freq: 0.16, amp: 0.012, phase: 0.61 }]);
  const lp4 = pineTree(PINE_S, PINE_S_HI, F.mid, F.light, -0.05, 0.42, 'pine-left-mid');
  stand('left', lp4, { x: -0.95, z: -0.4, yaw: -0.12, delay: 0.19 });
  rockers.push([lp4, { freq: 0.16, amp: 0.02, phase: 0.83 }]);
  const fernA = P.cutout(FERN, { color: F.light, name: 'fern' });
  stand('left', fernA, { x: -2.45, z: 0.12, yaw: 0.25, delay: 0.22 });
  const stump = P.cutout(P.poly([[-0.17, 0, 0.01], [0.17, 0, 0.01], [0.12, 0.05], [0.11, 0.24, 0.02], [-0.11, 0.24, 0.02], [-0.12, 0.05]]), { color: F.trunk, name: 'stump' });
  P.glue(stump, P.ellipse(0.1, 0.035), { color: C.paper.kraft, y: 0.2 });
  P.glue(stump, P.roundRect(0.012, 0.13, 0.006), { color: C.fox.dark, x: -0.04, y: 0.04 });
  P.glue(stump, P.roundRect(0.012, 0.1, 0.006), { color: C.fox.dark, x: 0.05, y: 0.06 });
  stand('left', stump, { x: -1.2, z: 0.32, yaw: 0.2, delay: 0.24 });
  const bushL = P.cutout(BUSH, { color: F.moss, back: F.mid, name: 'bush-left' });
  P.glue(bushL, BUSH_S, { color: F.light, x: -0.1, y: 0.02 });
  stand('left', bushL, { x: -0.6, z: 0.4, yaw: -0.2, delay: 0.24 });
  const bushL2 = P.cutout(BUSH_S, { color: F.teal, name: 'bush-left-2' });
  stand('left', bushL2, { x: -2.0, z: 0.55, yaw: 0.15, delay: 0.25 });
  // foreground: low things the camera looks over
  const shrooms2 = mushrooms(7, 2);
  stand('left', shrooms2, { x: -2.6, z: 1.0, yaw: 0.3, delay: 0.28 });
  const shrooms1 = mushrooms(3, 3);
  stand('left', shrooms1, { x: -1.55, z: 1.35, yaw: 0.15, delay: 0.3 });
  const grassB = P.cutout(GRASS_S, { color: F.light, name: 'grass-2' });
  stand('left', grassB, { x: -0.35, z: 1.45, delay: 0.3 });
  const grassA = P.cutout(GRASS, { color: F.mid, name: 'grass' });
  stand('left', grassA, { x: -2.1, z: 1.65, yaw: 0.1, delay: 0.32 });
  const fernB = P.cutout(FERN, { color: F.mid, name: 'fern-front' });
  fernB.scale.setScalar(0.7);
  stand('left', fernB, { x: -0.95, z: 1.65, yaw: -0.2, delay: 0.32 });

  // ------------------------------------------------------------ right page
  const rp1 = pineTree(PINE_T, PINE_T_HI, F.deep, F.mid, -0.08, 0.75, 'pine-right-tall');
  P.glue(rp1, TRUNK, { color: F.trunk });
  stand('right', rp1, { x: 2.2, z: -1.38, yaw: -0.1, delay: 0.1 });
  rockers.push([rp1, { freq: 0.16, amp: 0.016, phase: 0.52 }]);
  const rp2 = pineTree(PINE_M, PINE_M_HI, F.mid, F.light, -0.06, 0.6, 'pine-right-back');
  rp2.scale.setScalar(0.8);
  stand('right', rp2, { x: 1.95, z: -1.72, yaw: -0.08, delay: 0.12 });
  const rTree = P.cutout(TREE_S, { color: F.teal, back: F.deep, name: 'round-tree-right' });
  P.glue(rTree, LUMP, { color: F.light, x: -0.1, y: 0.72, scale: 0.7 });
  stand('right', rTree, { x: 2.36, z: -0.35, yaw: -0.3, delay: 0.18 });
  // the two pines behind her
  const rp3 = pineTree(PINE_M, PINE_M_HI, F.deep, F.mid, -0.06, 0.6, 'pine-behind-fox');
  rp3.scale.setScalar(0.85);
  stand('right', rp3, { x: 1.65, z: -0.45, yaw: -0.12, delay: 0.18 });
  rockers.push([rp3, { freq: 0.16, amp: 0.02, phase: 0.21 }]);
  const rp4 = pineTree(PINE_S, PINE_S_HI, F.teal, F.light, -0.05, 0.42, 'pine-behind-fox-2');
  stand('right', rp4, { x: 1.0, z: -0.62, yaw: 0.12, delay: 0.17 });
  rockers.push([rp4, { freq: 0.16, amp: 0.022, phase: 0.71 }]);
  const bushR = P.cutout(BUSH, { color: F.mid, back: F.deep, name: 'bush-right' });
  P.glue(bushR, BUSH_S, { color: F.moss, x: 0.08, y: 0.02 });
  stand('right', bushR, { x: 2.15, z: 0.55, yaw: -0.25, delay: 0.24 });
  const fernR = P.cutout(FERN, { color: F.light, name: 'fern-right' });
  stand('right', fernR, { x: 2.5, z: 1.15, yaw: -0.3, delay: 0.28 });
  const bushR2 = P.cutout(BUSH_S, { color: F.teal, name: 'bush-right-2' });
  stand('right', bushR2, { x: 0.35, z: 0.2, yaw: 0.2, delay: 0.23 });
  const grassR = P.cutout(GRASS_S, { color: F.mid, name: 'grass-right' });
  stand('right', grassR, { x: 0.3, z: 1.55, yaw: 0.15, delay: 0.32 });
  const grassR2 = P.cutout(GRASS, { color: F.light, name: 'grass-right-2' });
  grassR2.scale.setScalar(0.8);
  stand('right', grassR2, { x: 1.85, z: 1.62, yaw: -0.1, delay: 0.32 });
  const shrooms3 = mushrooms(11, 2);
  stand('right', shrooms3, { x: 2.35, z: 1.5, yaw: -0.2, delay: 0.31 });

  // the lantern, then the fox: last up, first down
  const lantern = createLantern({ light: false });
  lantern.setGlow(0);
  stand('right', lantern.group, { x: 0.55, z: 0.95, yaw: 0.2, delay: 0.34, noBake: true });
  const fox = createFox({ pose: 'sit', facing: -1 });
  stand('right', fox.group, { x: L.fox.x, z: L.fox.z, delay: 0.38, noBake: true });

  link.finalize();
  bakePrints(prints.left);
  bakePrints(prints.right);

  // ------------------------------------------------- butterfly over the lantern
  const fly = new THREE.Group();
  fly.name = 'butterfly';
  const body = P.cutout(P.roundRect(0.012, 0.07, 0.006), { color: C.fox.dark, shadow: false });
  body.position.y = -0.035;
  fly.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.scale.x = s;
    const fw = P.cutout(WING_F, { color: C.paper.edge, thickness: 0.006 });
    P.glue(fw, P.circle(0.016, { segments: 10 }), { color: F.teal, x: 0.06, y: 0.045 });
    const hw = P.cutout(WING_H, { color: C.paper.edge, thickness: 0.006 });
    P.glue(hw, P.circle(0.01, { segments: 10 }), { color: F.teal, x: 0.04, y: -0.035 });
    pivot.add(fw, hw);
    fly.add(pivot);
    wings.push(pivot);
  }
  pop.right.add(fly);

  // ------------------------------------------------------------------ update
  const TAIL_SWAY = { freq: 0.32, amp: 0.07, phase: 0.2 };
  const HEAD_SWAY = { freq: 0.09, amp: 0.012, phase: 0.6 };
  function update(state, spread) {
    pop.update(spread);
    link.apply(spread.theta);

    const t = state.t;
    for (let i = 0; i < rockers.length; i++) {
      const r = rockers[i];
      r[0].rotation.z = P.sway(t, r[1]);
    }
    fox.tail.rotation.z = 0.02 + P.sway(t, TAIL_SWAY);
    fox.group.rotation.z = P.sway(t, HEAD_SWAY);

    // butterfly: only while the spread lies fully open (it flutters up and away
    // as the page starts to turn); a slow loop over the lantern, clear of the fox
    const k = smoothstep(0.988, 0.999, spread.open);
    fly.visible = k > 0.01;
    if (fly.visible) {
      const u = t * 0.21;
      const c = Math.cos(u * 2 * Math.PI), s = Math.sin(u * 2 * Math.PI);
      fly.position.set(0.42 + 0.13 * s, 0.74 + 0.07 * Math.sin(u * 4 * Math.PI + 0.7) + 0.03 * Math.sin(t * 1.7) + (1 - k) * 0.9,
        1.05 + 0.08 * c);
      fly.scale.setScalar(1.35 * k);
      fly.rotation.set(-0.35, -0.5 * c, 0.15 * s);
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(t * 2 * Math.PI * 1.1));
      wings[0].rotation.y = -flap;
      wings[1].rotation.y = flap;
    }
  }

  return { left: pop.left, right: pop.right, center: pop.center, update };
}
