// Spread 3 - "The Last Mountain" (cold dusk).
//
// A tall jagged massif rises from the gutter as a V-fold (lavender and slate,
// a dripping snow cap, pink evening light on its right flank, a tiny summit
// flag). The pale moon stands just behind its right shoulder on a thin paper
// arm, glowing softly. Foothill ridges, snow-dusted pines, drifts and boulders
// stand in layers on both pages; a winding path with little paw prints climbs
// the lilac page. The fox sits up on a snowy ledge in the 'reach' pose, her
// unlit lantern at her paws. Near the end of the hold a crescent sliver of moon
// paper comes loose, drifts down on a gentle arc into the lantern, and the
// lantern pane begins to glow.
//
// Everything is built from paper.js / characters.js; all motion is closed form
// in state.t / spread (determinism rule); update() allocates nothing.
import * as THREE from 'three';
import * as P from '../paper.js';
import { createFox } from '../characters.js';
import { SPREAD_LAYOUT } from '../layout.js';
import { rng, smoothstep, clamp01 } from '../util.js';

const C = P.PALETTE;
const M = C.mountain;
const LAYOUT = SPREAD_LAYOUT[3];
const TAU = Math.PI * 2;

function mixHex(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

const LILAC = mixHex(M.lavender, M.snow, 0.62);        // page wash
const LILAC_DARK = mixHex(M.lavender, M.slate, 0.25);  // printed path
const DUSK = mixHex(M.slate, M.lavender, 0.45);        // between slate and lavender
const PINE = mixHex(M.slate, C.sea.navy, 0.35);        // cold blue-slate pines
const MOON_SHADE = mixHex(M.moon, M.lavender, 0.28);   // craters

// Sliver beat timing (film seconds).
const SL_LOOSE = 52.0, SL_FLY = 52.45, SL_ARRIVE = 54.15, SL_GONE = 54.5;

/**
 * Several flat parts as ONE Shape: each part's outline is joined to the next by
 * a zero-width slit (a hairline cut: the way a paper artist cuts a sprinkle of
 * flecks from one sheet). One mesh - one draw call per material - instead of
 * one per part, which matters a lot on software GL. Parts must not overlap.
 * parts: [{ shape, x, y, rot, scale, sx, sy }] or bare Shapes; chained in x order.
 */
function bundle(parts) {
  const loops = parts.map((p) => {
    const q = p instanceof THREE.Shape ? { shape: p } : p;
    const c = Math.cos(q.rot ?? 0), sn = Math.sin(q.rot ?? 0);
    const sx = q.sx ?? q.scale ?? 1, sy = q.sy ?? q.scale ?? 1, ox = q.x ?? 0, oy = q.y ?? 0;
    const pts = q.shape.getPoints(8);
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-9) pts.pop();
    const out = pts.map((v) => { const x = v.x * sx, y = v.y * sy; return new THREE.Vector2(x * c - y * sn + ox, x * sn + y * c + oy); });
    if (THREE.ShapeUtils.isClockWise(out)) out.reverse();
    let cx = 0; for (const v of out) cx += v.x;
    out.cx = cx / out.length;
    return out;
  }).sort((a, b) => a.cx - b.cx);
  const n = loops.length, exit = [], entry = [0];
  for (let i = 0; i < n - 1; i++) {
    let best = Infinity;
    loops[i].forEach((a, ia) => loops[i + 1].forEach((b, ib) => {
      const d = a.distanceToSquared(b);
      if (d < best) { best = d; exit[i] = ia; entry[i + 1] = ib; }
    }));
  }
  const pts = [];
  const walk = (i) => {
    const L = loops[i], m = L.length;
    let went = false;
    for (let k = 0; k <= m; k++) {
      const idx = (entry[i] + k) % m;
      pts.push(L[idx].clone());
      if (i < n - 1 && !went && idx === exit[i]) { went = true; walk(i + 1); pts.push(L[idx].clone()); }
    }
  };
  walk(0);
  pts.pop(); // the walk ends where it started
  return new THREE.Shape(pts);
}

/**
 * Glue a flat detail onto a card's face as a single-sided "print" (P.pagePrint
 * stood up in the card's plane) instead of an extruded layer: same paper
 * material and grain, no 0.007 cut edge (invisible at film distance), and one
 * draw call instead of two. Same signature as P.glue for shapes.
 */
function stick(onto, shape, opts = {}) {
  const m = P.pagePrint(shape, { color: opts.color, emissive: opts.emissive, glow: opts.glow, key: opts.key });
  m.rotation.set(0, 0, 0);
  m.position.set(0, 0, 0);
  if (opts.name) m.name = opts.name;
  return P.glue(onto, m, { x: opts.x, y: opts.y, rot: opts.rot, scale: opts.scale });
}

/**
 * Draw order, front to back (software GL is fill-bound: let the depth test
 * reject hidden fragments early). Poses the spread fully open once, then gives
 * each mesh a renderOrder from its depth toward the viewer (glued layers just
 * before their card); page prints go last of the scene, but before the book.
 */
function orderFrontToBack(pop) {
  pop.update({ open: 1, theta: Math.PI, index: -1, time: 0 });
  const v = new THREE.Vector3();
  for (const g of [pop.left, pop.right, pop.center]) {
    g.updateMatrixWorld(true);
    g.traverse((m) => {
      if (!m.isMesh) return;
      if (m.parent === pop.left || m.parent === pop.right) { m.renderOrder = -5; return; }
      m.getWorldPosition(v);
      let d = 0;
      for (let p = m.parent; p; p = p.parent) if (p.isMesh) d++;
      m.renderOrder = -Math.round((v.z + 3) * 1000) - 5 * d;
    });
  }
}

/** Page-print helper: parts placed at page (x, z) for a bundle printed at the page origin. */
const onPage = (shape, x, z, rot = 0, scale = 1) => ({ shape, x, y: -z, rot, scale });

export function createScene(ctx) {
  const pop = P.createPopup();
  const rand = rng(3303);

  // Every standing piece gets a tiny extra offset (by order) so that pieces
  // lying flat on top of each other near the closed book never z-fight, and is
  // pressed flat (its layers squeezed together) as it folds down, so a
  // multi-layer piece is no thicker than a card when the facing page closes on it.
  const standing = [];
  function stand(side, piece, opts = {}) {
    const d = 0.0015 * (standing.length % 10);
    piece.position.z += opts.foldToward === 'front' ? -d : d;
    const h = pop.stand(side, piece, opts);
    standing.push({ piece, h, sz: piece.scale.z });
    return h;
  }
  function pressFlat() {
    for (let i = 0; i < standing.length; i++) {
      const s = standing[i], r = s.h.rise;
      s.piece.scale.z = s.sz * (r >= 0.4 ? 1 : 0.08 + 0.92 * smoothstep(0, 0.4, r));
    }
  }

  // ---------------------------------------------------------------------------
  // Pages: pale lilac wash, snow patches, a winding path with paw prints
  // ---------------------------------------------------------------------------
  const washShape = P.roundRect(2.92, 3.88, 0.08);
  pop.print('left', P.pagePrint(washShape, { color: LILAC, x: -1.465, z: 1.94 }));
  pop.print('right', P.pagePrint(washShape, { color: LILAC, x: 1.465, z: 1.94 }));
  const patchA = P.hill(0.9, 0.26), patchB = P.ellipse(0.42, 0.13), patchC = P.ellipse(0.22, 0.07);
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? -1 : 1;
    const spots = side === 'left'
      ? [[0.55, -1.6], [1.6, -1.0], [2.4, -0.2], [0.7, 0.55], [1.5, 1.05], [2.45, 1.75], [0.5, 1.6]]
      : [[1.2, -1.65], [2.55, -0.85], [1.45, 0.05], [2.3, 1.05], [0.35, 1.2], [2.65, 1.8]];
    const parts = spots.map(([x, z], i) => onPage([patchA, patchB, patchC][i % 3], sx * (x + (rand() - 0.5) * 0.1), z + (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.3));
    pop.print(side, P.pagePrint(bundle(parts), { color: M.snow, layer: 1 }));
  }
  // the path: dashes along a winding curve from the front of the right page,
  // past the fox's ledge, up toward the foot of the mountain
  const PATH = [[1.55, 1.85], [1.0, 1.45], [1.25, 1.05], [0.75, 0.25], [0.3, -0.05], [0.55, -0.45], [0.2, -0.75]];
  // one printed ribbon along a smooth (Catmull-Rom) curve, narrowing as it climbs
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const NP = 48, sideA = [], sideB = [], pawSpots = [];
  for (let i = 0; i <= NP; i++) {
    const f = i / NP, q = curve.getPointAt(f), tg = curve.getTangentAt(f);
    const hw = 0.075 - 0.04 * f, nx = -tg.z, nz = tg.x;
    sideA.push([q.x + nx * hw, -(q.z + nz * hw)]);
    sideB.push([q.x - nx * hw, -(q.z - nz * hw)]);
    if (i % 7 === 3) pawSpots.push([q.x + nx * (i % 14 === 3 ? 0.13 : -0.13), q.z + nz * (i % 14 === 3 ? 0.13 : -0.13)]);
  }
  pop.print('right', P.pagePrint(P.poly([...sideA, ...sideB.reverse()]), { color: LILAC_DARK, layer: 2 }));
  // little paw prints beside it
  const paw = P.ellipse(0.024, 0.028, { segments: 8 });
  pop.print('right', P.pagePrint(bundle(pawSpots.map(([x, z]) => onPage(paw, x, z))), { color: M.slate, layer: 3 }));

  // ---------------------------------------------------------------------------
  // The massif: a V-fold from the gutter
  // ---------------------------------------------------------------------------
  const MZ = -0.68, MA = 1.12;
  const mtnR = P.poly([
    [0, 0], [1.9, 0], [1.9, 0.28], [1.7, 0.42], [1.55, 0.7, 0.01], [1.4, 0.62], [1.2, 0.98, 0.01], [1.02, 1.35, 0.01],
    [0.86, 1.28], [0.7, 1.72], [0.55, 2.05, 0.01], [0.42, 1.98], [0.3, 2.35], [0.16, 2.62, 0.01], [0.08, 2.56], [0, 2.82],
  ]);
  const mtnL = P.poly([
    [0, 0], [1.85, 0], [1.85, 0.25], [1.6, 0.5], [1.42, 0.88, 0.01], [1.28, 0.8], [1.08, 1.3], [0.9, 1.62, 0.01],
    [0.78, 1.55], [0.62, 1.95], [0.5, 2.2, 0.01], [0.38, 2.1], [0.22, 2.5], [0.1, 2.68, 0.01], [0, 2.82],
  ]);
  const massif = pop.vfold({ z: MZ, angle: MA, direction: 'back', left: mtnL, right: mtnR, leftColor: DUSK, rightColor: M.lavender });
  const R = massif.right.card, Lc = massif.left.card;
  // right flank: a slate shadow facet by the crease, pink evening light along the ridge
  stick(R, P.poly([[0, 0.6], [0, 2.7], [0.1, 2.4], [0.22, 1.7], [0.35, 1.1], [0.3, 0.6]]), { color: DUSK });
  stick(R, P.poly([[0.42, 1.98], [0.55, 2.05], [0.7, 1.72], [0.86, 1.28], [1.02, 1.35], [1.2, 0.98], [1.4, 0.62], [1.55, 0.7], [1.7, 0.42],
    [1.9, 0.28], [1.9, 0.12], [1.55, 0.36], [1.3, 0.5], [1.05, 0.88], [0.8, 1.05], [0.62, 1.42], [0.5, 1.75]], { r: 0.02 }), { color: M.pink });
  stick(R, bundle([
    P.poly([[1.02, 1.35], [1.2, 0.98], [1.12, 0.96], [1.04, 1.1], [0.97, 1.2]]),
    P.poly([[1.55, 0.7], [1.7, 0.42], [1.62, 0.42], [1.52, 0.56]]),
    ...P.snowCap(mtnR, 1.95, { drip: 0.09, seed: 5 }),
  ]), { color: M.snow });
  // left flank: in shadow, lavender facets, snow cap
  stick(Lc, bundle([
    P.poly([[0.22, 2.5], [0.38, 2.1], [0.5, 2.2], [0.4, 1.6, 0.03], [0.3, 1.1, 0.03], [0.18, 1.5, 0.02]]),
    P.poly([[0.9, 1.62], [1.08, 1.3], [1.28, 0.8], [1.15, 0.6, 0.03], [0.95, 0.9, 0.03], [0.85, 1.3, 0.02]]),
    P.poly([[1.42, 0.88], [1.6, 0.5], [1.85, 0.25], [1.85, 0.08], [1.5, 0.3, 0.03], [1.38, 0.6, 0.02]]),
  ]), { color: M.lavender });
  stick(Lc, bundle([...P.snowCap(mtnL, 1.95, { drip: 0.09, seed: 8 }), P.poly([[0.9, 1.62], [1.0, 1.46], [0.93, 1.44], [0.86, 1.53]])]), { color: M.snow });
  // summit flag (rides on the right wing)
  const pole = P.cutout(P.rect(0.016, 0.3), { color: M.slate, thickness: 0.01, name: 'summit-pole' });
  pole.position.set(0.05, 2.6, 0.004);
  massif.right.add(pole);
  const sflag = P.cutout(P.poly([[0, 0], [0.16, 0.045, 0.01], [0, 0.1]]), { color: M.pink, thickness: 0.008, name: 'summit-flag' });
  sflag.position.set(0.058, 2.78, 0.004);
  massif.right.add(sflag);

  // ---------------------------------------------------------------------------
  // The moon: a pale disc on a thin arm, just behind the right shoulder
  // ---------------------------------------------------------------------------
  const MOON_U = 1.32, MOON_V = 2.12, MOON_R = 0.5;
  const moonArm = P.cutout(P.rect(0.03, 1.4), { color: M.slate, thickness: 0.012, name: 'moon-arm' });
  moonArm.position.set(MOON_U - 0.05, 0.6, -0.04);
  massif.right.add(moonArm);
  const moonPivot = new THREE.Group();          // at the moon's centre, for breathing
  moonPivot.position.set(MOON_U, MOON_V, -0.03);
  massif.right.add(moonPivot);
  const moon = P.cutout(P.circle(MOON_R, { segments: 40 }), { color: M.moon, emissive: M.moon, key: 'moon', glow: 0.2, name: 'moon' });
  moon.position.set(0, -MOON_R, 0);
  moonPivot.add(moon);
  const moonMat = moon.material[0];
  stick(moon, bundle([[0.16, 0.62, 0.09], [-0.12, 0.3, 0.06], [0.24, 0.3, 0.045]].map(([x, y, r]) => ({ shape: P.circle(r, { segments: 14 }), x, y }))), { color: MOON_SHADE });
  // the sliver: glued to the moon's lower-left limb until it comes loose
  const sliverShape = P.crescent(0.13, { thick: 0.32, tilt: 0.55 });
  const sliverOpts = { color: M.moon, emissive: '#fff6d8', key: 'moon-sliver', glow: 0.55, thickness: 0.008 };
  const SL_X = -0.33, SL_Y = 0.12;               // on the disc, relative to its base centre
  const sliverGlued = P.glue(moon, sliverShape, { ...sliverOpts, x: SL_X, y: SL_Y });
  const sliver = P.cutout(sliverShape, { ...sliverOpts, name: 'moon-sliver-loose', shadow: false });
  const sliverHolder = new THREE.Group();
  sliverHolder.add(sliver);
  sliver.position.set(0, -0.13, 0);              // so the holder sits at the crescent's centre
  sliverHolder.visible = false;
  pop.center.add(sliverHolder);

  // ---------------------------------------------------------------------------
  // Foothills, back ridges, pines, drifts and boulders
  // ---------------------------------------------------------------------------
  function ridgePiece(name, w, h, opts, color, capY, capColor = M.snow, pink = null) {
    const shape = P.ridge(w, h, opts);
    const card = P.cutout(shape, { color, name });
    if (pink) stick(card, bundle(P.snowCap(shape, h * pink, { drip: 0.03, seed: opts.seed + 40 })), { color: M.pink });
    stick(card, bundle(P.snowCap(shape, h * capY, { drip: 0.05, seed: opts.seed + 20 })), { color: capColor });
    return card;
  }
  // tall back ridges (fold forward onto the page)
  stand('left', ridgePiece('mtn-back-left', 1.45, 1.95, { peaks: 2, jag: 0.8, seed: 3 }, M.slate, 0.72), { x: -2.0, z: -1.4, foldToward: 'front', delay: 0.1 });
  stand('right', ridgePiece('mtn-back-right', 1.15, 1.6, { peaks: 2, jag: 0.8, seed: 12 }, DUSK, 0.7), { x: 2.15, z: -1.38, foldToward: 'front', delay: 0.05 });
  // mid foothills
  stand('left', ridgePiece('mtn-foot-left', 1.6, 1.15, { peaks: 3, jag: 0.6, seed: 7 }, M.lavender, 0.78, M.snow, 0.6), { x: -1.75, z: -0.5, foldToward: 'front', delay: 0.1 });
  stand('right', ridgePiece('mtn-foot-right', 1.35, 1.0, { peaks: 2, jag: 0.6, seed: 9 }, M.lavender, 0.78, M.snow, 0.58), { x: 2.0, z: -0.42, foldToward: 'front', delay: 0.12 });
  stand('left', ridgePiece('mtn-low-left', 1.15, 0.68, { peaks: 2, jag: 0.35, seed: 15 }, M.slate, 0.74), { x: -1.0, z: 0.22, delay: 0.2 });
  stand('right', ridgePiece('mtn-low-right', 0.95, 0.6, { peaks: 2, jag: 0.4, seed: 17 }, M.slate, 0.72), { x: 2.2, z: 0.35, delay: 0.18 });

  // snow-dusted pines
  const pineShape = P.pine(0.5, 0.95, { tiers: 3, seed: 4 });
  const pineCaps = P.snowCap(pineShape, 0.72, { drip: 0.03, seed: 2 });
  const tierSnow = P.poly([[-0.2, 0, 0.01], [0.2, 0, 0.01], [0.12, 0.035, 0.01], [-0.12, 0.035, 0.01]]);
  const pineSnow = bundle([...pineCaps, { shape: tierSnow, x: -0.01, y: 0.325, scale: 0.9 }]);
  for (const [side, x, z, s, delay] of [
    ['left', -2.45, 0.35, 1.0, 0.16], ['left', -2.0, 0.72, 0.78, 0.22], ['left', -1.55, -0.95, 1.15, 0.08],
    ['right', 2.5, 0.78, 0.92, 0.2], ['right', 1.95, 1.02, 0.7, 0.26], ['right', 1.6, -0.95, 1.05, 0.08],
  ]) {
    const p = P.cutout(pineShape, { color: PINE, name: `mtn-pine-${side}` });
    stick(p, pineSnow, { color: M.snow });
    p.scale.setScalar(s);
    stand(side, p, { x, z, delay, foldToward: z < 0 ? 'front' : 'back' });
  }

  // foreground: snow drifts and boulders (low: the camera looks over them)
  const boulderShape = P.poly([[-0.24, 0], [0.24, 0], [0.22, 0.14, 0.05], [0.08, 0.27, 0.05], [-0.1, 0.26, 0.05], [-0.22, 0.14, 0.05]]);
  const boulderCap = P.poly([[-0.1, 0.26, 0.04], [0.08, 0.27, 0.04], [0.16, 0.2, 0.02], [0.02, 0.21], [-0.12, 0.19]]);
  for (const [side, x, z, s, delay] of [['left', -2.45, 1.25, 1.1, 0.3], ['left', -1.15, 1.32, 0.8, 0.33], ['right', 2.5, 1.35, 1.0, 0.32]]) {
    const b = P.cutout(boulderShape, { color: M.slate, name: `mtn-boulder-${side}` });
    stick(b, boulderCap, { color: M.snow });
    b.scale.setScalar(s);
    stand(side, b, { x, z, delay });
  }
  const driftShape = P.hill(1.0, 0.26);
  for (const [side, x, z, sx, sy, delay] of [
    ['left', -1.85, 1.55, 1.15, 1.0, 0.34], ['left', -0.75, 1.68, 0.85, 0.75, 0.38],
    ['right', 1.8, 1.6, 1.0, 0.95, 0.36], ['right', 0.75, 1.72, 0.65, 0.5, 0.4],
  ]) {
    const d = P.cutout(driftShape, { color: M.snow, name: `mtn-drift-${side}` });
    d.scale.set(sx, sy, 1);
    stand(side, d, { x, z, delay });
  }

  // clouds on stalks, drifting
  const clouds = [];
  for (const [side, x, z, h, w, color, delay, ph] of [
    ['left', -2.35, -1.75, 2.45, 0.9, M.pink, 0.08, 0.0],
    ['right', 2.45, -1.75, 2.2, 0.62, M.snow, 0.06, 0.55],
  ]) {
    const stalk = P.cutout(P.rect(0.022, h), { color: C.paper.edge, thickness: 0.012, name: `mtn-cloud-${side}` });
    const c = P.glue(stalk, P.cloud(w, w * 0.42, { lumps: 4, seed: 11 }), { color, y: h - 0.14, shadow: true });
    stand(side, stalk, { x, z, foldToward: 'front', delay });
    clouds.push({ c, x0: c.position.x, ph });
  }

  // ---------------------------------------------------------------------------
  // The fox on her snowy ledge, reaching for the moon, lantern at her paws
  // ---------------------------------------------------------------------------
  const LEDGE_H = 0.48;   // a snowy rock outcrop: lifts her (and the lantern) clear of the caption band
  const perch = new THREE.Group();
  perch.name = 'mtn-fox-perch';
  const fox = createFox({ pose: 'reach', facing: 1, lantern: true, light: false });
  fox.group.position.set(0, LEDGE_H, 0);
  perch.add(fox.group);
  const ledge = P.cutout(P.poly([[-0.55, 0], [0.76, 0], [0.72, 0.16, 0.04], [0.63, 0.32, 0.04], [0.58, LEDGE_H + 0.015, 0.03],
    [0.1, LEDGE_H + 0.025, 0.04], [-0.3, LEDGE_H + 0.01, 0.04], [-0.42, 0.3, 0.05], [-0.53, 0.13, 0.04]]), { color: DUSK, name: 'mtn-ledge' });
  ledge.position.z = 0.075;
  stick(ledge, P.poly([[0.58, LEDGE_H], [0.63, 0.32], [0.72, 0.16], [0.76, 0.12], [0.5, 0.12], [0.4, 0.22, 0.03], [0.48, 0.36, 0.03]]), { color: M.slate });
  stick(ledge, P.poly([[-0.42, 0.3], [-0.53, 0.13], [-0.54, 0.12], [-0.3, 0.12], [-0.2, 0.2, 0.03], [-0.26, 0.34, 0.03]]), { color: M.lavender });
  stick(ledge, bundle([
    P.poly([[-0.3, LEDGE_H + 0.01], [0.1, LEDGE_H + 0.025], [0.58, LEDGE_H + 0.015], [0.64, LEDGE_H - 0.05, 0.02],
      [0.45, LEDGE_H - 0.04, 0.02], [0.28, LEDGE_H - 0.08, 0.02], [0.02, LEDGE_H - 0.04, 0.02], [-0.18, LEDGE_H - 0.07, 0.02], [-0.37, LEDGE_H - 0.06]]),
    { shape: P.hill(1.3, 0.1), x: 0.1 },
  ]), { color: M.snow });
  perch.add(ledge);
  stand('right', perch, { x: LAYOUT.fox.x, z: LAYOUT.fox.z, delay: 0.3, span: 0.45 });
  perch.position.z = 0; // the fox sits exactly on her layout spot

  // Lantern pane centre in the CENTER frame when the spread lies flat open
  // (right page surface is 0.03 below the center origin on this spread).
  const lanternTarget = new THREE.Vector3(LAYOUT.fox.x + 0.47, 0.006 + LEDGE_H + 0.135 - 0.03, LAYOUT.fox.z + 0.065);

  // ---------------------------------------------------------------------------
  // Snowflakes on closed-form loops (centre frame)
  // ---------------------------------------------------------------------------
  const flakeShape = P.star(0.032, { points: 6, inner: 0.45 });
  const flakes = [];
  const flakeGroup = new THREE.Group();
  flakeGroup.name = 'mtn-snow';
  pop.center.add(flakeGroup);
  for (let i = 0; i < 10; i++) {
    const f = P.cutout(flakeShape, { color: M.snow, thickness: 0.006, shadow: false, name: 'flake' });
    f.position.y = -0.032;
    const holder = new THREE.Group();
    holder.add(f);
    flakeGroup.add(holder);
    flakes.push({
      holder,
      x: -2.3 + (i / 9) * 4.6 + (rand() - 0.5) * 0.25,
      z: -1.2 + rand() * 2.6,
      period: 7 + rand() * 4,
      off: rand(),
      sway: 0.08 + rand() * 0.1,
      spin: (rand() - 0.5) * 2,
      s: 0.7 + rand() * 0.6,
    });
  }

  // ---------------------------------------------------------------------------
  // update (pure; no allocation)
  // ---------------------------------------------------------------------------
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), tmp = new THREE.Vector3();
  const qWing = new THREE.Quaternion(), qEnd = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const moonBreath = 0.008;

  function update(state, spread) {
    pop.update(spread);
    pressFlat();
    const t = state.t;
    const open = spread.open;
    const settle = smoothstep(0.97, 1.0, open);
    const shown = P.rise(open, { delay: 0.3 });     // fades glows in/out with the page

    // the moon: soft glow by day, brighter as night falls; breathes very slightly
    moonMat.emissiveIntensity = (0.5 + 0.7 * state.night) * clamp01(shown);
    const b = 1 + settle * moonBreath * Math.sin(TAU * t / 5.5);
    moonPivot.scale.set(b, b, 1);

    // clouds drift, the fox's tail stirs
    for (let i = 0; i < clouds.length; i++) clouds[i].c.position.x = clouds[i].x0 + settle * 0.08 * Math.sin(TAU * (t / 10 + clouds[i].ph));
    fox.tail.rotation.z = P.sway(t, { freq: 0.3, amp: 0.05, phase: 0.2 });

    // snowflakes: fall from ~2.7 to ~0.15 on loops, drifting side to side
    flakeGroup.visible = settle > 0.001;
    if (flakeGroup.visible) {
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        const ph = P.phase01(t, f.period, f.off);
        f.holder.position.set(f.x + f.sway * Math.sin(TAU * (t / 3.3 + f.off)), 2.7 - 2.55 * ph, f.z);
        f.holder.rotation.z = f.spin * t;
        const sc = f.s * settle * smoothstep(0, 0.06, ph) * (1 - smoothstep(0.9, 1, ph));
        f.holder.scale.setScalar(Math.max(0.001, sc));
      }
    }

    // the sliver beat
    const beat = t >= SL_LOOSE && t < SL_GONE && open > 0.995;
    sliverGlued.visible = t < SL_LOOSE;
    sliverHolder.visible = beat;
    if (beat) {
      // start: the glued sliver's centre in the centre frame (rides the right wing)
      p0.set(SL_X, SL_Y + 0.13, 0.02);
      p0.add(moon.position).multiply(moonPivot.scale).add(moonPivot.position).applyMatrix4(massif.right.matrix);
      qWing.setFromRotationMatrix(massif.right.matrix);
      const loose = smoothstep(SL_LOOSE, SL_FLY, t);
      const fly = smoothstep(SL_FLY, SL_ARRIVE, t);
      const sink = smoothstep(SL_ARRIVE, SL_GONE, t);
      // a little lift off the disc as it comes loose
      tmp.set(0, 0, 1).applyQuaternion(qWing).multiplyScalar(0.06 * loose);
      p0.add(tmp);
      // quadratic arc: swing out to the right and down into the lantern
      p1.set((p0.x + lanternTarget.x) / 2 + 0.42, (p0.y + lanternTarget.y) / 2 + 0.3, (p0.z + lanternTarget.z) / 2 + 0.25);
      const u = fly, w = 1 - u;
      sliverHolder.position.set(
        w * w * p0.x + 2 * w * u * p1.x + u * u * lanternTarget.x,
        w * w * p0.y + 2 * w * u * p1.y + u * u * lanternTarget.y,
        w * w * p0.z + 2 * w * u * p1.z + u * u * lanternTarget.z,
      );
      // orientation: from the moon's plane toward facing the viewer, with a slow papery rock
      qEnd.setFromAxisAngle(Z, 0.5 * Math.sin(TAU * (t - SL_LOOSE) / 1.6) * (1 - sink) + 0.4 * fly);
      sliverHolder.quaternion.slerpQuaternions(qWing, qEnd, smoothstep(0, 0.5, fly));
      const s = (1 - sink) * (1 + 0.15 * loose * (1 - fly));
      sliverHolder.scale.setScalar(Math.max(0.001, s));
    }
    // the lantern begins to glow as the sliver arrives (emissive only)
    fox.setGlow(0.5 * smoothstep(SL_ARRIVE - 0.25, SL_GONE + 0.45, t) * clamp01(shown));
  }

  orderFrontToBack(pop);
  return { left: pop.left, right: pop.right, center: pop.center, update };
}
