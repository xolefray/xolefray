// Spread 1 - "The Sleeping Village" (quiet dusk).
// "She asked the sleeping village. Nobody had a spark to spare."
//
// Everyone is asleep: every window is dark (slate and indigo panes, closed
// shutters), no smoke, the street lamp unlit.
//
// Layers, back to front:
//   center  a V-fold street front across the gutter: a clock tower on the crease
//           (its clock and spire folded down the middle) and a row of tall narrow
//           houses with pitched and stepped gables on each wing;
//   left    tall town houses at the back, a terracotta house, a blue house right
//           behind the fox, a small house by the gutter, a dusty street tree,
//           the unlit street lamp, crates, flower pots and a kerb stone in
//           front; the fox walks the street (+X) carrying her dark lantern;
//   right   tall houses at the back, a narrow house, the baker's with a hanging
//           sign and its cat asleep on the awning, a little house with a
//           washing line, a stone well in the street, a corner house turned to
//           the street, a signpost, a barrel, a flower box and a picket fence;
//   pages   a warm sand wash, a cobbled street curving through both pages,
//           paving stones and a soft well shadow.
//
// Folding: as in the forest, every flap folds toward the viewer, linked to the
// V-fold street front and to the facing page; the toolkit's stagger gives the
// cascade (back houses, middle, street furniture, fox last).
// Ambient: washing swaying on the line, the baker's sign and the weather vane
// rocking, the cat's tail, a small bob in the fox's step.
import * as THREE from 'three';
import * as P from '../paper.js';
import { createFox } from '../characters.js';
import { SPREAD_LAYOUT } from '../layout.js';

const C = P.PALETTE;
const V = C.village;
const NAVY = C.night.indigo;

// Helpers shared in spirit with forest.js (each scene module is self-contained).
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

/** Half disc of radius r for u >= 0 (a clock face folded down the V-fold crease), centre at (0, r). */
function halfDisc(r) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 12; pts.push([Math.cos(a) * r, r + Math.sin(a) * r]); }
  return P.poly(pts);
}

/** Top profile [[u, v], ...] (u ascending from 0 to U) -> wing shape with base on v = 0. */
function skyline(prof) {
  const U = prof[prof.length - 1][0];
  return P.poly([[U, 0], ...prof.slice().reverse(), [0, 0]]);
}

// ---------------------------------------------------------------- shared shapes
const WIN = P.roundRect(0.1, 0.13, 0.012);
const WIN_S = P.roundRect(0.08, 0.1, 0.01);
const SHUTTER = P.roundRect(0.05, 0.13, 0.006);
const SILL = P.roundRect(0.14, 0.018, 0.004);
const DOOR = P.poly([[-0.065, 0, 0.004], [0.065, 0, 0.004], [0.065, 0.16], [0.045, 0.2, 0.02], [0, 0.215], [-0.045, 0.2, 0.02], [-0.065, 0.16]]);
const KNOB = P.circle(0.008, { segments: 8 });
const CHIM_CAP = P.roundRect(0.085, 0.025, 0.005);
const COBBLE = P.roundRect(0.075, 0.05, 0.018);
const SLAB = P.roundRect(0.16, 0.1, 0.01);
const SOCK = P.poly([[0, 0, 0.01], [0.05, 0, 0.015], [0.055, 0.03, 0.01], [0.02, 0.035], [0.02, 0.1], [-0.01, 0.1]]);
const SHIRT = P.poly([[-0.05, 0, 0.005], [0.05, 0, 0.005], [0.05, 0.08], [0.08, 0.065], [0.09, 0.09], [0.04, 0.12], [-0.04, 0.12], [-0.09, 0.09], [-0.08, 0.065], [-0.05, 0.08]]);
const SHEET = P.poly([[-0.07, 0, 0.01], [-0.02, 0.012], [0.03, 0, 0.01], [0.07, 0.01, 0.01], [0.065, 0.14], [-0.065, 0.14]]);
const CAT = P.poly([
  [-0.12, 0, 0.02], [0.1, 0, 0.02], [0.13, 0.03, 0.02], [0.13, 0.06, 0.02],
  [0.115, 0.075], [0.12, 0.1], [0.1, 0.085], [0.08, 0.1], [0.08, 0.075], [0.04, 0.08, 0.03], [-0.06, 0.07, 0.04], [-0.12, 0.04, 0.03]]);
const CAT_TAIL = P.poly([[0, 0, 0.005], [-0.06, -0.012, 0.02], [-0.11, 0.005, 0.02], [-0.12, 0.03, 0.01], [-0.1, 0.022], [-0.06, 0.012, 0.01], [0, 0.018]]);

export function createScene(ctx) {
  const pop = P.createPopup();
  const L = SPREAD_LAYOUT[1];

  // ----------------------------------------------- flaps (all fold toward the viewer)
  const ALPHA = 0.85, U = 1.45, WALL_Z = -0.8, WALL_H = 2.55;
  const link = createLinker({ alpha: ALPHA, z0: WALL_Z, U, H: WALL_H });
  let nFlaps = 0;
  function stand(side, piece, o) {
    if (!o.noBake) bake(piece);
    link.add(side, piece, o);
    const h = pop.stand(side, piece, { ...o, foldToward: 'front' });
    h.hinge.position.y += 0.0009 * (nFlaps++ % 9);
    link.list[link.list.length - 1].handle = h;
    return h;
  }
  const swingers = []; // [object, sway options] rocked about z in update (options built once)

  // ------------------------------------------------------------------ pages
  // (all page art goes into one group per page, baked per print layer at the end)
  const prints = { left: new THREE.Group(), right: new THREE.Group() };
  prints.left.name = prints.right.name = 'page-prints';
  pop.left.add(prints.left);
  pop.right.add(prints.right);
  const print = (side, mesh) => prints[side].add(mesh);
  const sand = mix(C.paper.kraft, C.paper.cream, 0.5);
  const sandDeep = mix(C.paper.kraft, C.paper.cream, 0.15);
  const street = mix(V.paleBlue, C.paper.cream, 0.5);
  const cobble = mix(V.paleBlue, V.slate, 0.15);
  print('left', pop.tint('left', sand));
  print('right', pop.tint('right', sand));
  // the cobbled street, curving through both pages
  const leftSt = [[-2.86, 1.42, 0.3], [-2.2, 1.12, 0.34], [-1.4, 0.98, 0.36], [-0.6, 1.0, 0.36], [0.0, 1.06, 0.36]];
  const rightSt = [[0.0, 1.06, 0.36], [0.6, 1.08, 0.36], [1.3, 0.95, 0.34], [1.95, 0.66, 0.3], [2.5, 0.38, 0.26], [2.86, 0.25, 0.24]];
  print('left', P.pagePrint(ribbon(leftSt), { color: street, layer: 1 }));
  print('right', P.pagePrint(ribbon(rightSt), { color: street, layer: 1 }));
  // kerb shadows along the street's far edge
  print('left', P.pagePrint(ribbon(leftSt.map(([x, z, w]) => [x, z - w - 0.025, 0.025])), { color: sandDeep, layer: 2 }));
  print('right', P.pagePrint(ribbon(rightSt.map(([x, z, w]) => [x, z - w - 0.025, 0.025])), { color: sandDeep, layer: 2 }));
  // cobbles in loose rows along the street
  const along = (pts, f) => {
    // point and direction at fraction f along a polyline
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    let s = f * total, i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const t = s / seg[i], a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i], a[2] + (b[2] - a[2]) * t];
  };
  for (const [side, pts, n] of [['left', leftSt, 15], ['right', rightSt, 17]]) {
    for (let i = 0; i < n; i++) {
      const [x, z, dx, dz, w] = along(pts, (i + 0.5) / n);
      for (const off of [-0.55, 0, 0.55]) {
        const k = (i * 3 + Math.round(off * 2) + 7) % 5;
        if (k === 0) continue;
        const ox = x - dz * w * off + dx * 0.04 * (k - 2), oz = z + dx * w * off + dz * 0.04 * (k - 2);
        if (side === 'left' && Math.hypot(ox - L.fox.x, oz - L.fox.z) < 0.18) continue;
        print(side, P.pagePrint(COBBLE, { color: cobble, x: ox, z: oz, rot: -Math.atan2(dz, dx) + (k - 2) * 0.12, layer: 2, scale: 0.85 + 0.1 * (k % 3) }));
      }
    }
  }
  // paving slabs in front of the houses, the well's shadow
  for (const [side, x, z, r] of [['left', -2.3, -0.95, 0.1], ['left', -1.95, -0.05, -0.1], ['left', -1.2, 0.18, 0.05], ['right', 1.62, 0.05, 0.08],
    ['right', 2.3, -0.75, -0.06], ['right', 0.65, -0.2, 0.0], ['left', -0.7, -0.5, 0.12], ['right', 1.15, -0.95, -0.1]]) {
    print(side, P.pagePrint(SLAB, { color: sandDeep, x, z, rot: r, layer: 1 }));
    print(side, P.pagePrint(SLAB, { color: sandDeep, x: x + 0.18, z: z + 0.02, rot: r + 0.05, layer: 1, scale: 0.85 }));
  }
  print('right', P.pagePrint(P.ellipse(0.34, 0.12), { color: mix(V.slate, C.paper.kraft, 0.55), x: 1.12, z: 0.82, layer: 3 }));

  // ---------------------------------------------------- V-fold street front
  const wallProf = [
    [0, 2.55], [0.2, 1.98], [0.2, 1.9],
    [0.22, 1.45], [0.41, 1.74], [0.6, 1.45],
    [0.6, 1.62], [0.66, 1.62], [0.66, 1.72], [0.72, 1.72], [0.72, 1.82], [0.83, 1.82], [0.83, 1.72], [0.89, 1.72], [0.89, 1.62], [0.95, 1.62],
    [0.95, 1.18], [1.15, 1.42], [1.24, 1.33], [1.24, 1.46], [1.31, 1.46], [1.31, 1.26], [1.45, 1.12],
  ];
  const wall = pop.vfold({ z: WALL_Z, angle: ALPHA, direction: 'back', shape: skyline(wallProf), color: V.blue });
  const tower = P.translate(P.rect(0.2, 1.9), 0.1, 0);
  const spire = P.poly([[0, 1.9], [0.2, 1.9], [0, 2.52]]);
  const facadeA = P.translate(P.rect(0.36, 1.43), 0.41, 0);
  const roofA = P.poly([[0.21, 1.42], [0.61, 1.42], [0.41, 1.72]]);
  const facadeB = P.translate(P.rect(0.33, 1.6), 0.775, 0);
  const facadeC = P.translate(P.rect(0.48, 1.16), 1.2, 0);
  const roofC = P.poly([[0.95, 1.15], [1.45, 1.1], [1.15, 1.4]]);
  let clockFace = null;
  for (const w of [wall.left, wall.right]) {
    const c = w.card;
    P.glue(c, tower, { color: V.plaster });
    P.glue(c, spire, { color: V.terracotta });
    const rim = P.glue(c, halfDisc(0.125), { color: NAVY, y: 1.415 });
    const face = P.glue(rim, halfDisc(0.1), { color: C.paper.edge, y: 0.025 });
    if (w === wall.right) clockFace = face;
    P.glue(c, P.poly([[0, 0], [0.07, 0], [0.07, 0.24, 0.035], [0, 0.27]]), { color: NAVY, y: 0.95 });     // tall arched window, halved
    P.glue(c, P.poly([[0, 0], [0.075, 0], [0.075, 0.2, 0.03], [0, 0.23]]), { color: V.slate });           // tower door, halved
    P.glue(c, P.rect(0.2, 0.03), { color: V.mustard, x: 0.1, y: 1.86 });                                     // mustard trim
    P.glue(c, facadeA, { color: V.paleBlue });
    P.glue(c, roofA, { color: V.terracotta });
    P.glue(c, facadeB, { color: V.plaster });
    P.glue(c, facadeC, { color: mix(V.terracotta, V.plaster, 0.45) });
    P.glue(c, roofC, { color: V.slate });
    for (const [x, y] of [[0.33, 0.95], [0.49, 0.95], [0.33, 0.55], [0.49, 0.55], [0.41, 1.5],
      [0.72, 1.2], [0.83, 1.2], [0.72, 0.8], [0.83, 0.8], [0.775, 0.4],
      [1.08, 0.72], [1.3, 0.72], [1.08, 0.36]]) {
      P.glue(c, WIN_S, { color: (x * 7 + y * 3) % 1 < 0.5 ? V.slate : NAVY, x, y });
    }
    P.glue(c, DOOR, { color: V.blue, x: 0.41, scale: 0.9 });
    P.glue(c, DOOR, { color: V.terracotta, x: 1.3, scale: 0.85 });
  }
  // clock hands at "everyone's asleep" o'clock (one wing only)
  P.glue(clockFace, P.roundRect(0.012, 0.08, 0.004), { color: NAVY, x: 0.008, y: 0.1, rot: -0.6 });
  P.glue(clockFace, P.roundRect(0.012, 0.055, 0.004), { color: NAVY, x: 0.004, y: 0.1, rot: -2.4 });
  bake(wall.left.card);
  bake(wall.right.card);

  // -------------------------------------------------------------- builders
  /**
   * A standing town house: walls `wall`, roof `roof`, dark windows (some with
   * closed shutters), a door; returns the card (base on y = 0).
   */
  function townHouse(w, h, wall, roof, o = {}) {
    const shape = P.house(w, h, { chimney: o.chimney ?? true, roof: o.roof ?? 0.38, eave: w * 0.06 });
    const card = P.cutout(shape, { color: wall, name: o.name });
    const wallH = h * (1 - (o.roof ?? 0.38));
    const eave = w * 0.06;
    P.glue(card, P.poly([[-w / 2 - eave, wallH - 0.005], [w / 2 + eave, wallH - 0.005], [0, h - 0.004]]), { color: roof });
    if (o.chimney ?? true) P.glue(card, CHIM_CAP, { color: V.slate, x: w * 0.26, y: h * 0.98 - 0.02 });
    // windows: rows from the top of the wall down
    const cols = o.cols ?? 2, rows = o.rows ?? Math.max(1, Math.floor((wallH - 0.3) / 0.3));
    const dx = w / (cols + 0.5);
    for (let r = 0; r < rows; r++) {
      const y = wallH - 0.22 - r * 0.3;
      if (y < 0.28) break;
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x = (cIdx - (cols - 1) / 2) * dx;
        const shut = ((r + cIdx + (o.seed ?? 0)) % 3) === 0;
        P.glue(card, SILL, { color: C.paper.edge, x, y: y - 0.016, scale: 0.9 });
        if (shut) {
          P.glue(card, SHUTTER, { color: o.shutter ?? V.blue, x: x - 0.026, y });
          P.glue(card, SHUTTER, { color: o.shutter ?? V.blue, x: x + 0.026, y });
        } else {
          P.glue(card, WIN, { color: (r + cIdx) % 2 ? NAVY : V.slate, x, y });
        }
      }
    }
    if (o.door !== false) {
      const d = P.glue(card, DOOR, { color: o.doorColor ?? V.slate, x: o.doorX ?? 0, scale: o.doorScale ?? 1 });
      P.glue(d, KNOB, { color: V.mustard, x: 0.035, y: 0.09 });
    }
    if (o.attic) P.glue(card, P.circle(0.045, { segments: 12 }), { color: NAVY, y: wallH + (h - wallH) * 0.3 });
    return card;
  }

  // -------------------------------------------------------------- left page
  const l1 = townHouse(0.78, 2.0, V.plaster, V.terracotta, { name: 'house-left-tall', cols: 2, rows: 4, seed: 1, attic: true });
  stand('left', l1, { x: -2.24, z: -1.42, delay: 0.08 });
  const l2 = townHouse(0.6, 1.3, V.paleBlue, V.slate, { name: 'house-left-back', cols: 2, rows: 2, seed: 2, chimney: false });
  stand('left', l2, { x: -1.72, z: -1.72, yaw: 0.08, delay: 0.12 });
  const l3 = townHouse(0.8, 1.25, mix(V.terracotta, V.plaster, 0.25), V.slate, { name: 'house-left-mid', cols: 2, rows: 2, seed: 0, shutter: V.paleBlue });
  stand('left', l3, { x: -2.25, z: -0.5, yaw: 0.15, delay: 0.17 });
  // a blue house right behind the fox
  const l4 = townHouse(0.72, 1.12, V.blue, V.terracotta, { name: 'house-blue', cols: 2, rows: 2, seed: 2, chimney: false, doorColor: V.terracotta, attic: true });
  stand('left', l4, { x: -1.25, z: -0.42, yaw: -0.06, delay: 0.19 });
  // a small house tucked in by the gutter, a dusty street tree
  const l5 = townHouse(0.46, 0.85, mix(V.paleBlue, V.plaster, 0.5), V.terracotta, { name: 'house-left-small', cols: 1, rows: 1, seed: 2, chimney: true });
  stand('left', l5, { x: -0.55, z: -0.62, yaw: -0.15, delay: 0.18 });
  const treeL = P.cutout(P.roundTree(0.48, 0.85, { seed: 17, lumps: 7 }), { color: mix(C.forest.moss, V.slate, 0.35), back: V.slate, name: 'street-tree' });
  P.glue(treeL, P.bush(0.22, 0.12, { lumps: 3, seed: 3 }), { color: mix(C.forest.moss, V.plaster, 0.25), x: -0.06, y: 0.55 });
  stand('left', treeL, { x: -1.85, z: 0.12, yaw: 0.1, delay: 0.23 });
  // unlit street lamp
  const lamp = new THREE.Group();
  lamp.name = 'street-lamp';
  const post = P.cutout(P.poly([[-0.05, 0, 0.01], [0.05, 0, 0.01], [0.022, 0.06], [0.016, 0.92], [0.035, 0.94], [-0.035, 0.94], [-0.016, 0.92], [-0.022, 0.06]]), { color: V.slate });
  lamp.add(post);
  const head = P.cutout(P.poly([[-0.07, 0.94, 0.01], [0.07, 0.94, 0.01], [0.09, 1.1], [0.05, 1.16, 0.01], [-0.05, 1.16, 0.01], [-0.09, 1.1]]), { color: V.slate });
  lamp.add(head);
  P.glue(head, P.poly([[-0.05, 0.96], [0.05, 0.96], [0.065, 1.09], [-0.065, 1.09]]), { color: NAVY });
  P.glue(head, P.poly([[-0.1, 1.15, 0.01], [0.1, 1.15, 0.01], [0, 1.22]]), { color: V.slate });
  stand('left', lamp, { x: -0.55, z: 0.42, delay: 0.27 });
  // foreground: crates, flower pots
  const crates = P.cutout(P.poly([[-0.2, 0], [0.2, 0], [0.2, 0.17], [0.06, 0.17], [0.06, 0.28], [-0.12, 0.28], [-0.12, 0.17], [-0.2, 0.17]]), { color: mix(C.paper.kraft, V.terracotta, 0.3), name: 'crates' });
  for (const [x, y, w] of [[-0.07, 0.08, 0.22], [0.13, 0.08, 0.1], [-0.03, 0.22, 0.13]]) P.glue(crates, P.rect(w, 0.012), { color: C.paper.shade, x, y });
  stand('left', crates, { x: -2.4, z: 1.55, yaw: 0.2, delay: 0.3 });
  const pots = new THREE.Group();
  pots.name = 'flower-pots';
  for (const [x, s] of [[-0.09, 1], [0.08, 0.8]]) {
    const pot = P.cutout(P.poly([[-0.05, 0, 0.005], [0.05, 0, 0.005], [0.065, 0.08], [-0.065, 0.08]]), { color: V.terracotta });
    pot.position.x = x; pot.scale.setScalar(s);
    const leaves = P.cutout(P.bush(0.15, 0.12, { lumps: 3, seed: 4 }), { color: mix(C.forest.moss, V.slate, 0.25) });
    leaves.position.set(0, 0.075, -0.004);
    pot.add(leaves);
    P.glue(leaves, P.circle(0.016, { segments: 8 }), { color: V.mustard, x: 0.02, y: 0.06 });
    pots.add(pot);
  }
  stand('left', pots, { x: -0.35, z: 1.6, yaw: -0.1, delay: 0.31 });
  const step = P.cutout(P.roundRect(0.36, 0.07, 0.01), { color: mix(V.slate, V.plaster, 0.55), name: 'kerb-stone' });
  stand('left', step, { x: -1.75, z: 1.68, yaw: 0.05, delay: 0.32 });

  // the fox walks the street toward the right, carrying her dark lantern
  const fox = createFox({ pose: 'walk', lantern: true, light: false });
  fox.setGlow(0);
  stand('left', fox.group, { x: L.fox.x, z: L.fox.z, delay: 0.38, noBake: true });

  // -------------------------------------------------------------- right page
  const r1 = townHouse(0.8, 2.05, mix(V.terracotta, V.plaster, 0.2), V.slate, { name: 'house-right-tall', cols: 2, rows: 4, seed: 0, attic: true });
  // weather vane on the ridge
  const vane = new THREE.Group();
  vane.userData.keep = true;
  vane.position.set(0, 2.03, 0.004);
  const vanePole = P.cutout(P.rect(0.012, 0.16), { color: V.slate, thickness: 0.008 });
  vane.add(vanePole);
  const arrow = P.cutout(P.poly([[-0.1, 0.13], [0.06, 0.13], [0.06, 0.105], [0.11, 0.14], [0.06, 0.175], [0.06, 0.15], [-0.07, 0.15], [-0.1, 0.17], [-0.12, 0.17], [-0.09, 0.14], [-0.12, 0.11], [-0.1, 0.11]]), { color: V.slate, thickness: 0.008 });
  arrow.position.z = 0.006;
  vane.add(arrow);
  r1.add(vane);
  swingers.push([vane, { amp: 0.09, freq: 0.11, phase: 0.3 }]);
  stand('right', r1, { x: 2.22, z: -1.38, yaw: -0.08, delay: 0.1 });
  const r2 = townHouse(0.6, 1.35, V.plaster, V.terracotta, { name: 'house-right-back', cols: 2, rows: 2, seed: 1, chimney: false });
  stand('right', r2, { x: 1.78, z: -1.74, yaw: -0.06, delay: 0.12 });
  // the baker's, with a hanging sign
  const r3 = townHouse(0.78, 1.2, V.paleBlue, V.terracotta, { name: 'house-baker', cols: 2, rows: 2, seed: 1, doorColor: V.blue, doorX: -0.18 });
  P.glue(r3, P.roundRect(0.32, 0.17, 0.02), { color: V.slate, x: 0.12, y: 0.12 });            // shop window (dark)
  P.glue(r3, P.rect(0.36, 0.04), { color: V.mustard, x: 0.12, y: 0.3 });                     // awning trim
  // the baker's cat, asleep on the awning
  const cat = P.glue(r3, CAT, { color: NAVY, x: 0.1, y: 0.338 });
  const catTail = new THREE.Group();
  catTail.userData.keep = true;
  catTail.position.set(-0.115, 0.03, 0.001);
  catTail.add(P.cutout(CAT_TAIL, { color: NAVY, thickness: 0.007 }));
  cat.add(catTail);
  const bracket = P.glue(r3, P.rect(0.2, 0.016), { color: V.slate, x: 0.42, y: 0.62, shadow: true });
  const sign = new THREE.Group();
  sign.userData.keep = true;
  sign.position.set(0.07, 0.0, 0.002);
  const board = P.cutout(P.poly([[-0.07, -0.13, 0.02], [0.07, -0.13, 0.02], [0.07, -0.02], [-0.07, -0.02]]), { color: V.terracotta, thickness: 0.008 });
  sign.add(board);
  P.glue(board, P.ellipse(0.04, 0.025), { color: V.mustard, y: -0.1 });                       // a loaf
  for (const x of [-0.05, 0.05]) { const ch = P.cutout(P.rect(0.006, 0.02), { color: V.slate, thickness: 0.004 }); ch.position.set(x, -0.022, 0.002); sign.add(ch); }
  bracket.add(sign);
  swingers.push([sign, { amp: 0.08, freq: 0.23, phase: 0.0 }]);
  stand('right', r3, { x: 1.62, z: -0.5, yaw: -0.1, delay: 0.17 });
  // a small house with a washing line strung to the baker's
  const r5 = townHouse(0.5, 0.95, mix(V.blue, V.plaster, 0.35), V.terracotta, { name: 'house-small', cols: 1, rows: 1, seed: 1, chimney: false });
  stand('right', r5, { x: 0.68, z: -0.62, yaw: 0.12, delay: 0.17 });
  const line = new THREE.Group();
  line.name = 'washing-line';
  const lineW = 0.62;
  for (const x of [-lineW / 2, lineW / 2]) {
    const p = P.cutout(P.rect(0.018, 0.62), { color: C.fox.dark });
    p.position.x = x;
    line.add(p);
  }
  const cord = P.cutout(P.poly([[-lineW / 2, 0.585], [0, 0.565], [lineW / 2, 0.585], [lineW / 2, 0.593], [0, 0.573], [-lineW / 2, 0.593]]), { color: C.paper.edge, thickness: 0.006 });
  line.add(cord);
  const clothes = [[SHIRT, V.terracotta, -0.17, 1], [SOCK, V.mustard, -0.04, 1], [SHEET, C.paper.edge, 0.08, 1], [SOCK, V.paleBlue, 0.21, 0.9]];
  clothes.forEach(([shape, col, x, s], i) => {
    const peg = new THREE.Group();
    peg.userData.keep = true;
    peg.position.set(x, 0.575 - 0.012 * (1 - Math.abs(x) / (lineW / 2)), 0.012);
    const cl = P.cutout(shape, { color: col, thickness: 0.006 });
    cl.rotation.z = Math.PI; // hangs down from the line
    cl.scale.setScalar(s);
    peg.add(cl);
    line.add(peg);
    swingers.push([peg, { amp: 0.07, freq: 0.21 + i * 0.03, phase: i * 0.23 }]);
  });
  stand('right', line, { x: 1.0, z: -0.28, delay: 0.21 });
  // the well in the street
  const well = new THREE.Group();
  well.name = 'well';
  const wellBase = P.cutout(P.poly([[-0.24, 0, 0.02], [0.24, 0, 0.02], [0.24, 0.24, 0.02], [-0.24, 0.24, 0.02]]), { color: mix(V.slate, V.plaster, 0.45) });
  well.add(wellBase);
  for (const [x, y] of [[-0.13, 0.03], [0.07, 0.03], [-0.03, 0.1], [0.17, 0.1], [-0.17, 0.17], [0.05, 0.17]]) P.glue(wellBase, P.roundRect(0.14, 0.05, 0.012), { color: mix(V.slate, V.plaster, 0.7), x, y });
  for (const x of [-0.2, 0.2]) { const p = P.cutout(P.rect(0.035, 0.52), { color: C.fox.dark }); p.position.set(x, 0.2, -0.01); well.add(p); }
  const wellRoof = P.cutout(P.poly([[-0.3, 0.68, 0.01], [0.3, 0.68, 0.01], [0, 0.86]]), { color: V.terracotta });
  well.add(wellRoof);
  P.glue(wellRoof, P.rect(0.6, 0.02), { color: V.mustard, y: 0.68 });
  const bucket = P.cutout(P.poly([[-0.04, 0.38, 0.005], [0.04, 0.38, 0.005], [0.05, 0.46], [-0.05, 0.46]]), { color: V.blue });
  bucket.position.z = -0.005;
  well.add(bucket);
  const rope = P.cutout(P.rect(0.006, 0.22), { color: C.paper.kraft, thickness: 0.005 });
  rope.position.set(0, 0.46, -0.006);
  well.add(rope);
  stand('right', well, { x: 1.12, z: 0.72, yaw: -0.1, delay: 0.28 });
  // a corner house turned toward the street
  const r4 = townHouse(0.56, 1.0, V.plaster, V.slate, { name: 'house-corner', cols: 1, rows: 2, seed: 0, chimney: true, shutter: V.terracotta });
  stand('right', r4, { x: 2.4, z: 0.0, yaw: -0.55, delay: 0.22 });
  // a narrow house between the back row and the baker's
  const r6 = townHouse(0.44, 1.05, mix(V.terracotta, V.plaster, 0.55), V.slate, { name: 'house-right-narrow', cols: 1, rows: 2, seed: 0, chimney: true, shutter: V.blue });
  stand('right', r6, { x: 1.28, z: -1.15, yaw: -0.05, delay: 0.14 });
  // a signpost pointing on toward the sea
  const signpost = P.cutout(P.rect(0.03, 0.5), { color: C.fox.dark, name: 'signpost' });
  const arrowR = P.glue(signpost, P.poly([[0, 0], [0.17, 0], [0.21, 0.035], [0.17, 0.07], [0, 0.07]]), { color: V.plaster, x: -0.01, y: 0.4, shadow: true });
  P.glue(arrowR, P.rect(0.1, 0.012), { color: V.slate, x: 0.09, y: 0.03 });
  P.glue(signpost, P.poly([[0, 0], [-0.15, 0], [-0.19, 0.03], [-0.15, 0.06], [0, 0.06]]), { color: V.mustard, x: 0.01, y: 0.3, rot: 0.08, shadow: true });
  stand('right', signpost, { x: 2.45, z: 0.8, yaw: -0.2, delay: 0.29 });
  // foreground: a barrel, a picket fence
  const barrel = P.cutout(P.poly([[-0.08, 0, 0.02], [0.08, 0, 0.02], [0.1, 0.11, 0.04], [0.08, 0.22, 0.02], [-0.08, 0.22, 0.02], [-0.1, 0.11, 0.04]]), { color: mix(C.paper.kraft, V.terracotta, 0.45), name: 'barrel' });
  for (const y of [0.05, 0.16]) P.glue(barrel, P.rect(0.19, 0.016), { color: V.slate, y });
  stand('right', barrel, { x: 0.45, z: 1.55, yaw: 0.1, delay: 0.31 });
  const fencePts = [[-0.36, 0], [0.36, 0], [0.36, 0.06]];
  for (let i = 6; i >= 0; i--) { const x = -0.33 + i * 0.11; fencePts.push([x + 0.03, 0.06], [x + 0.03, 0.2], [x, 0.24], [x - 0.03, 0.2], [x - 0.03, 0.06]); }
  fencePts.push([-0.36, 0.06]);
  const fence = P.cutout(P.poly(fencePts.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1])), { color: C.paper.edge, name: 'fence' });
  P.glue(fence, P.rect(0.72, 0.03), { color: V.paleBlue, y: 0.12 });
  stand('right', fence, { x: 1.95, z: 1.62, yaw: -0.15, delay: 0.32 });
  const pots2 = P.cutout(P.bush(0.3, 0.16, { lumps: 4, seed: 9 }), { color: mix(C.forest.moss, V.slate, 0.25), name: 'flower-box' });
  P.glue(pots2, P.roundRect(0.32, 0.07, 0.01), { color: V.terracotta });
  stand('right', pots2, { x: 2.5, z: 1.15, yaw: -0.4, delay: 0.3 });

  link.finalize();
  bakePrints(prints.left);
  bakePrints(prints.right);

  // ------------------------------------------------------------------ update
  const CAT_SWAY = { freq: 0.18, amp: 0.22, phase: 0.4 };
  const TAIL_SWAY = { freq: 0.45, amp: 0.05, phase: 0.1 };
  function update(state, spread) {
    pop.update(spread);
    link.apply(spread.theta);
    const t = state.t;
    for (let i = 0; i < swingers.length; i++) {
      const s = swingers[i];
      s[0].rotation.z = P.sway(t, s[1]);
    }
    catTail.rotation.z = 0.15 + P.sway(t, CAT_SWAY);
    // the fox's step: a small bob and a degree of rock, twice per stride
    const st = t * 0.9;
    fox.flip.position.y = 0.012 * Math.abs(Math.sin(Math.PI * st));
    fox.flip.rotation.z = 0.02 * Math.sin(2 * Math.PI * st);
    fox.tail.rotation.z = P.sway(t, TAIL_SWAY);
  }

  return { left: pop.left, right: pop.right, center: pop.center, update };
}
