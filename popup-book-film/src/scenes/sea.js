// Spread 2 - "The Folded Sea" (bright day).
//
// A toy-theatre sea: five rows of scalloped wave strips standing at depths from
// the back of the spread to the front (one strip per page, meeting at the
// gutter), each lower toward the viewer and sliding gently side to side out of
// phase. The fox sits in a folded-paper boat between two rows with her unlit
// lantern at the bow; behind her a great cresting wave rises from the gutter as
// a V-fold; at the back of the right page a red-and-white lighthouse blinks on
// its slate rock, fanning pale paper rays with each flash. Clouds on stalks and
// paper gulls fill the sky.
//
// Everything is built from paper.js / characters.js; ambient motion is closed
// form in state.t (determinism rule), update() allocates nothing.
import * as THREE from 'three';
import * as P from '../paper.js';
import { createFox, createLantern } from '../characters.js';
import { SPREAD_LAYOUT } from '../layout.js';
import { rng, smoothstep } from '../util.js';

const C = P.PALETTE;
const S = C.sea;
const LAYOUT = SPREAD_LAYOUT[2];
const TAU = Math.PI * 2;

/** Hex mix of two palette colours (for in-between tones of the same family). */
function mixHex(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

const DEEP = mixHex(S.navy, S.teal, 0.45);     // navy-teal
const SHALLOW = mixHex(S.teal, S.aqua, 0.45);  // teal-aqua
const WASH = mixHex(S.aqua, S.foam, 0.22);     // the page wash
const SWELL = mixHex(S.aqua, S.teal, 0.4);     // printed swells
const LAMP = '#fff1b8';                        // lamp pane / rays (pale yellow)

/**
 * One foam ribbon along the whole top edge of a P.waves(w, h, {count, depth, lean})
 * strip: thick foam over each crest, a hairline in the troughs, a softly dripping
 * lower edge. One glued piece per strip instead of one per crest.
 */
function foamRibbon(w, h, count, depth, lean, seed) {
  const rand = rng(seed);
  const base = h * (1 - depth), sw = w / count, N = 8;
  const top = [], bot = [];
  for (let i = 0; i < count; i++) {
    const x0 = -w / 2 + i * sw, d = 0.6 + rand() * 0.6;
    for (let k = i === 0 ? 0 : 1; k <= N; k++) {
      const t = k / N, sn = Math.sin(Math.PI * t);
      const x = x0 + sw * (t + lean * sn * 0.5 * (1 - t));
      const y = base + (h - base) * Math.pow(sn, 0.65);
      top.push([x, y]);
      const th = 0.008 + (h - base) * 0.42 * d * Math.pow(sn, 3) * (k % 2 ? 1.12 : 0.9);
      bot.push([x, y - th]);
    }
  }
  return P.poly([...top, ...bot.reverse()]);
}

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
  const rand = rng(2202);

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
  // Pages: aqua wash, printed swells, foam flecks, the boat's wake
  // ---------------------------------------------------------------------------
  // the wash runs right up to the gutter so the sea is continuous across the spread
  const washShape = P.roundRect(2.92, 3.88, 0.08);
  pop.print('left', P.pagePrint(washShape, { color: WASH, x: -1.465, z: 1.94 }));
  pop.print('right', P.pagePrint(washShape, { color: WASH, x: 1.465, z: 1.94 }));
  const swellA = P.waves(1.3, 0.09, { count: 4, depth: 0.6 });
  const swellB = P.waves(0.9, 0.07, { count: 3, depth: 0.6 });
  const fleck = P.ellipse(0.05, 0.014, { segments: 10 });
  const fleckS = P.ellipse(0.028, 0.01, { segments: 8 });
  const wake = P.roundRect(0.34, 0.03, 0.015);
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? -1 : 1;
    // swells sit in the open water between the standing rows (one print per page)
    const swells = [], flecks = [];
    for (const [i, zz] of [-1.75, -0.95, -0.2, 0.62, 1.25, 1.8].entries()) {
      const z = zz + (rand() - 0.5) * 0.08;
      const x = sx * (0.7 + rand() * 1.6);
      swells.push(onPage(i % 2 ? swellA : swellB, x, z));
    }
    pop.print(side, P.pagePrint(bundle(swells), { color: SWELL, layer: 1 }));
    // foam flecks (and, on the left page, the boat's wake trailing behind her)
    for (const [zz, xx] of [[-1.55, 0.4], [-1.2, 1.9], [-0.7, 1.2], [0.28, 2.4], [0.4, 0.9], [1.05, 1.6], [1.62, 0.5], [1.7, 2.2]]) {
      const z = zz + (rand() - 0.5) * 0.15, x = sx * (xx + (rand() - 0.5) * 0.3);
      flecks.push(onPage(rand() < 0.4 ? fleck : fleckS, x, z, (rand() - 0.5) * 0.4));
    }
    if (side === 'left') {
      flecks.push(onPage(wake, LAYOUT.fox.x - 0.78, LAYOUT.fox.z + 0.14, 0.08));
      flecks.push(onPage(wake, LAYOUT.fox.x - 1.12, LAYOUT.fox.z + 0.27, -0.06, 0.8));
    }
    pop.print(side, P.pagePrint(bundle(flecks), { color: S.foam, layer: 2 }));
  }

  // ---------------------------------------------------------------------------
  // The great cresting wave: a V-fold rising from the gutter behind everything
  // ---------------------------------------------------------------------------
  const WAVE_Z = -1.0, WAVE_A = 0.95;
  // right wing: the long back of the wave climbing to the crest at the crease
  const waveR = P.poly([
    [0, 0], [1.3, 0], [1.3, 0.26, 0.04], [1.08, 0.5, 0.08], [0.82, 0.92, 0.1], [0.56, 1.42, 0.1],
    [0.32, 1.92, 0.08], [0.13, 2.28, 0.05], [0, 2.42],
  ]);
  // left wing: the crest curling over toward the boat, a hollow under the lip
  const waveL = P.poly([
    [0, 0], [1.3, 0], [1.3, 0.22, 0.03], [0.98, 0.4, 0.08], [0.68, 0.72, 0.08], [0.44, 1.08, 0.08],
    [0.3, 1.44, 0.06], [0.27, 1.76, 0.05], [0.34, 2.0, 0.04], [0.46, 2.1, 0.03], [0.56, 2.04, 0.02],
    [0.6, 1.9, 0.01], [0.73, 1.98, 0.03], [0.77, 2.2, 0.06], [0.64, 2.43, 0.08], [0.4, 2.56, 0.08],
    [0.15, 2.55, 0.05], [0, 2.42],
  ]);
  const wave = pop.vfold({ z: WAVE_Z, angle: WAVE_A, direction: 'back', left: waveL, right: waveR, leftColor: S.teal, rightColor: SHALLOW });
  // right wing details: darker streaks along the slope, foam crest, foam at the foot
  const streak = (pts) => P.poly(pts, { r: 0.02 });
  const baseFoam = P.translate(P.waves(1.28, 0.16, { count: 5, depth: 0.55 }), 0.66, 0);
  stick(wave.right.card, bundle([
    streak([[1.05, 0.38], [0.8, 0.78], [0.55, 1.2], [0.6, 1.24], [0.86, 0.82], [1.12, 0.42]]),
    streak([[0.7, 0.42], [0.48, 0.86], [0.3, 1.36], [0.36, 1.38], [0.55, 0.9], [0.77, 0.46]]),
  ]), { color: S.teal });
  stick(wave.right.card, bundle([...P.snowCap(waveR, 1.98, { drip: 0.07, seed: 4 }), baseFoam]), { color: S.foam });
  // left wing: navy hollow under the lip, aqua streaks, foam lip with spray, foam at the foot
  stick(wave.left.card, P.poly([[0.31, 1.95], [0.28, 1.7, 0.03], [0.33, 1.42, 0.04], [0.48, 1.12, 0.03], [0.46, 1.5, 0.05], [0.47, 1.84, 0.04], [0.55, 2.0]]), { color: S.navy });
  stick(wave.left.card, bundle([
    streak([[0.95, 0.43], [0.66, 0.78], [0.47, 1.12], [0.52, 1.14], [0.72, 0.8], [1.02, 0.46]]),
    streak([[1.2, 0.27], [0.9, 0.5], [0.95, 0.52], [1.25, 0.31]]),
  ]), { color: SHALLOW });
  const spray = P.circle(0.035, { segments: 10 });
  stick(wave.left.card, bundle([
    P.poly([
      [0, 2.24], [0, 2.42], [0.15, 2.55, 0.04], [0.4, 2.56, 0.06], [0.64, 2.43, 0.06], [0.77, 2.2, 0.04],
      [0.73, 1.98, 0.02], [0.6, 1.9], [0.62, 2.08, 0.02], [0.55, 2.26, 0.04], [0.4, 2.36, 0.04], [0.2, 2.34, 0.03], [0.08, 2.27],
    ]),
    { shape: spray, x: 0.88, y: 2.27 }, { shape: spray, x: 0.84, y: 2.47, scale: 0.75 }, { shape: spray, x: 0.97, y: 2.38, scale: 0.55 },
    baseFoam,
  ]), { color: S.foam, shadow: true });

  // ---------------------------------------------------------------------------
  // The rows of the toy-theatre sea (back to front), one strip per page
  // ---------------------------------------------------------------------------
  const ROW_W = 2.66;
  const ROWS = [
    // z, height, crests, colour, delay, phase
    { z: -0.45, h: 0.72, count: 6, depth: 0.24, color: S.teal, delay: 0.4, ph: 0.0 },
    { z: 0.05, h: 0.52, count: 6, depth: 0.3, color: DEEP, delay: 0.42, ph: 0.5 },
    { z: 0.95, h: 0.34, count: 7, depth: 0.4, color: SHALLOW, delay: 0.44, ph: 0.15 },
    { z: 1.5, h: 0.24, count: 8, depth: 0.5, color: S.navy, delay: 0.46, ph: 0.7 },
  ];
  const rows = [];
  for (const [ri, R] of ROWS.entries()) {
    const shape = P.waves(ROW_W, R.h, { count: R.count, depth: R.depth, lean: 0.4 });
    const caps = [foamRibbon(ROW_W, R.h, R.count, R.depth, 0.4, 10 + ri)];
    const strips = [];
    for (const side of ['left', 'right']) {
      const sx = side === 'left' ? -1 : 1;
      const strip = P.cutout(shape, { color: R.color, name: `sea-row${ri}-${side}` });
      for (const c of caps) stick(strip, c, { color: S.foam });
      const h = stand(side, strip, { x: sx * ROW_W / 2, z: R.z, delay: R.delay, span: 0.5 });
      strips.push({ piece: strip, x0: strip.position.x, z0: strip.position.z, h });
    }
    rows.push({ strips, ph: R.ph, amp: 0.035 - ri * 0.004 });
  }
  // the far row: only the outer parts of the pages (the great wave fills the middle)
  const farShape = P.waves(1.5, 0.95, { count: 3, depth: 0.2, lean: 0.4 });
  const farCaps = [foamRibbon(1.5, 0.95, 3, 0.2, 0.4, 31)];
  const farRows = [];
  for (const side of ['left', 'right']) {
    const sx = side === 'left' ? -1 : 1;
    const strip = P.cutout(farShape, { color: DEEP, name: `sea-far-${side}` });
    for (const c of farCaps) stick(strip, c, { color: S.foam });
    stand(side, strip, { x: sx * 1.95, z: -1.42, foldToward: 'front', delay: 0.08 });
    farRows.push({ piece: strip, x0: strip.position.x });
  }

  // ---------------------------------------------------------------------------
  // The boat: hull, paper sail, fox and lantern - one standing piece
  // ---------------------------------------------------------------------------
  const boat = new THREE.Group();
  boat.name = 'sea-boat';
  // origami paper-boat sail (the folded triangle), behind the fox
  const sail = P.cutout(P.poly([[-0.56, 0], [0.1, 0], [-0.24, 0.74, 0.02]]), { color: C.paper.edge, back: C.paper.shade, name: 'boat-sail' });
  sail.position.set(0, 0.16, -0.05);
  boat.add(sail);
  stick(sail, P.poly([[-0.25, 0.02], [-0.23, 0.02], [-0.24, 0.7]]), { color: C.paper.shade });     // centre fold
  const mast = P.cutout(P.rect(0.018, 0.3), { color: C.paper.kraft, thickness: 0.01, name: 'boat-mast' });
  mast.position.set(-0.24, 0.86, -0.06);
  boat.add(mast);
  const flag = P.cutout(P.poly([[0, 0], [0.17, 0.05, 0.01], [0, 0.11]]), { color: S.red, thickness: 0.01, name: 'boat-flag' });
  flag.position.set(-0.232, 1.03, -0.06);
  boat.add(flag);
  // the fox, sitting in the boat, facing the lighthouse
  const fox = createFox({ pose: 'sit', facing: 1 });
  fox.group.position.set(0, 0.11, 0);
  boat.add(fox.group);
  // her unlit lantern at the bow
  const lantern = createLantern({ light: false });
  lantern.group.scale.setScalar(0.62);
  lantern.group.position.set(0.5, 0.13, 0.045);
  boat.add(lantern.group);
  // the hull: a folded paper boat, with fold lines
  const hullShape = P.poly([[-0.42, 0, 0.03], [0.42, 0, 0.03], [0.64, 0.26, 0.01], [0.2, 0.2], [-0.12, 0.2], [-0.66, 0.27, 0.01]]);
  const hull = P.cutout(hullShape, { color: C.paper.edge, back: C.paper.shade, name: 'boat-hull' });
  hull.position.set(0, 0, 0.09);
  boat.add(hull);
  stick(hull, bundle([P.poly([[-0.12, 0.2], [0.2, 0.2], [0.04, 0.045]]), P.poly([[-0.39, 0.02], [0.4, 0.02], [0.41, 0.035], [-0.4, 0.035]])]), { color: C.paper.shade }); // folds
  stick(hull, P.roundRect(0.18, 0.05, 0.02), { color: S.red, x: 0.4, y: 0.12, rot: 0.6 });       // a painted stripe at the bow
  stand('left', boat, { x: LAYOUT.fox.x, z: LAYOUT.fox.z, delay: 0.32, span: 0.45 });
  boat.position.z = 0; // the fox sits exactly on her layout spot

  // ---------------------------------------------------------------------------
  // The lighthouse on its slate rock (right page, back)
  // ---------------------------------------------------------------------------
  const rockShape = P.poly([[-0.62, 0], [0.62, 0], [0.56, 0.3, 0.06], [0.42, 0.56, 0.06], [0.24, 0.8, 0.05], [0.04, 0.86, 0.04],
    [-0.16, 0.84, 0.04], [-0.34, 0.7, 0.05], [-0.48, 0.48, 0.06], [-0.58, 0.22, 0.05]]);
  const rock = P.cutout(rockShape, { color: C.mountain.slate, name: 'lighthouse' });
  stick(rock, P.poly([[-0.16, 0.84], [0.04, 0.86], [0.1, 0.5, 0.04], [-0.05, 0.2, 0.04], [-0.3, 0.12], [-0.22, 0.45, 0.04]]), { color: C.village.slate });
  stick(rock, P.waves(1.24, 0.17, { count: 6, depth: 0.5 }), { color: S.foam });
  // tower (behind the rock), tapered, with red bands
  const TW0 = 0.2, TW1 = 0.135, TH = 1.32;
  const half = (y) => TW0 + (TW1 - TW0) * (y / TH);
  const tower = P.cutout(P.poly([[-TW0, 0], [TW0, 0], [TW1, TH], [-TW1, TH]]), { color: S.foam, name: 'lighthouse-tower' });
  tower.position.set(0, 0.7, -0.03);
  rock.add(tower);
  stick(tower, bundle([[0.18, 0.42], [0.62, 0.86], [1.06, 1.3]].map(([y0, y1]) =>
    P.poly([[-half(y0), y0], [half(y0), y0], [half(y1), y1], [-half(y1), y1]]))), { color: S.red });
  stick(tower, bundle([{ shape: P.roundRect(0.075, 0.12, 0.03), y: 0.47 }, { shape: P.roundRect(0.065, 0.1, 0.03), y: 0.92 }]), { color: S.navy });
  // gallery deck and railing: one card with the railing gaps punched out
  const railing = P.withHoles(P.poly([[-0.2, 0], [0.2, 0], [0.2, 0.045], [0.17, 0.045], [0.17, 0.125], [-0.17, 0.125], [-0.17, 0.045], [-0.2, 0.045]]),
    ...[-0.12, -0.04, 0.04, 0.12].map((x) => P.translate(P.rect(0.05, 0.05), x, 0.06)));
  stick(tower, railing, { color: S.navy, y: TH - 0.02, shadow: true });
  // lamp room (its own card on top of the tower)
  const lampRoom = P.cutout(P.rect(0.22, 0.22), { color: S.navy, name: 'lighthouse-lamp-room' });
  lampRoom.position.set(0, TH + 0.025, 0);
  tower.add(lampRoom);
  // the pane, with two slits for the glazing bars (the navy lamp room shows through)
  const paneShape = P.withHoles(P.roundRect(0.16, 0.16, 0.02), P.translate(P.rect(0.014, 0.14), -0.035, 0.01), P.translate(P.rect(0.014, 0.14), 0.035, 0.01));
  const pane = stick(lampRoom, paneShape, { color: LAMP, emissive: '#ffe08a', key: 'sea-lamp', glow: 0.3, y: 0.03 });
  const roof = P.cutout(P.poly([[-0.17, 0], [0.17, 0], [0.06, 0.12, 0.03], [0, 0.15, 0.02], [-0.06, 0.12, 0.03]]), { color: S.red, name: 'lighthouse-roof' });
  roof.position.set(0, 0.215, 0);
  lampRoom.add(roof);
  stick(roof, P.circle(0.03, { segments: 10 }), { color: S.navy, y: 0.13 });
  // rays: pale yellow paper fanning from the lamp, shown only during the flash
  const rays = new THREE.Group();
  rays.name = 'lighthouse-rays';
  rays.position.set(0, 0.11, -0.012);
  lampRoom.add(rays);
  // both fans as ONE card (they meet behind the lamp room): three rays a side
  const fan = [];   // one consistent (clockwise) walk round the lamp: right fan, then left fan
  for (const side of [1, -1]) {
    const order = side > 0 ? [[0.21, 0.62], [0, 0.8], [-0.21, 0.62]] : [[-0.21, 0.62], [0, 0.8], [0.21, 0.62]];
    for (const [a, L] of order) {
      const ang = (side > 0 ? 0 : Math.PI) + a * side, hw = 0.05;
      const c = Math.cos(ang), sn = Math.sin(ang);
      fan.push([c * 0.12 - sn * 0.012, sn * 0.12 + c * 0.012]);
      fan.push([c * L - sn * hw, sn * L + c * hw, 0.01]);
      fan.push([c * L + sn * hw, sn * L - c * hw, 0.01]);
      fan.push([c * 0.12 + sn * 0.012, sn * 0.12 - c * 0.012]);
    }
  }
  const rayCard = P.cutout(P.poly(fan), { color: LAMP, emissive: '#ffe08a', key: 'sea-rays', glow: 0.9, thickness: 0.006, shadow: false, name: 'lighthouse-ray-fan' });
  rays.add(rayCard);
  const lampMat = pane.material;
  stand('right', rock, { x: 1.9, z: -1.15, foldToward: 'front', delay: 0.18 });

  // ---------------------------------------------------------------------------
  // Sky: clouds on stalks, gulls on wires; a rock islet with a gull
  // ---------------------------------------------------------------------------
  function stalked(h, w = 0.022) {
    return P.cutout(P.rect(w, h), { color: C.paper.edge, thickness: 0.012 });
  }
  const cloudA = P.cloud(0.95, 0.42, { lumps: 4, seed: 6 });
  const cloudB = P.cloud(0.72, 0.32, { lumps: 3, seed: 9 });
  const clouds = [];
  for (const [side, x, z, h, shape, delay, ph] of [
    ['left', -1.95, -1.66, 2.05, cloudA, 0.12, 0.1],
    ['right', 2.38, -1.68, 2.3, cloudB, 0.1, 0.6],
  ]) {
    const stalk = stalked(h);
    stalk.name = `sea-cloud-${side}`;
    const c = P.glue(stalk, shape, { color: S.foam, y: h - 0.12, shadow: true });
    stand(side, stalk, { x, z, foldToward: 'front', delay });
    clouds.push({ c, x0: c.position.x, ph });
  }

  const gullShape = P.poly([[-0.17, 0.07], [-0.09, 0.115, 0.02], [-0.005, 0.045], [0.0, 0.03], [0.005, 0.045], [0.09, 0.115, 0.02], [0.17, 0.07],
    [0.09, 0.085, 0.02], [0, 0], [-0.09, 0.085, 0.02]]);
  const gulls = [];
  for (const [side, x, z, h, s, delay, ph] of [
    ['left', -1.35, -1.5, 1.75, 1, 0.1, 0.0],
    ['left', -2.45, -0.95, 1.45, 0.8, 0.14, 0.37],
    ['right', 2.62, -0.6, 1.62, 0.9, 0.12, 0.71],
  ]) {
    const wire = stalked(h, 0.01);
    wire.name = `sea-gull-${side}`;
    const g = P.glue(wire, gullShape, { color: S.foam, y: h - 0.03, scale: s, shadow: true });
    stand(side, wire, { x, z, foldToward: 'front', delay });
    gulls.push({ g, y0: g.position.y, ph });
  }

  // a small rock islet with foam at its foot (left page, behind the second row)
  const islet = P.cutout(P.poly([[-0.42, 0], [0.4, 0], [0.32, 0.36, 0.05], [0.12, 0.62, 0.05], [-0.06, 0.7, 0.04], [-0.24, 0.5, 0.05], [-0.36, 0.26, 0.05]]), { color: C.mountain.slate, name: 'sea-islet' });
  stick(islet, P.poly([[-0.06, 0.7], [0.12, 0.62], [0.05, 0.3, 0.03], [-0.15, 0.12]]), { color: C.village.slate });
  stick(islet, P.waves(0.82, 0.14, { count: 4, depth: 0.5 }), { color: S.foam });
  stand('left', islet, { x: -2.05, z: -0.95, foldToward: 'front', delay: 0.12 });

  // a red-and-white buoy bobbing in the foreground (right page)
  const buoy = P.cutout(P.poly([[-0.1, 0], [0.1, 0], [0.085, 0.24, 0.02], [0.02, 0.36, 0.01], [-0.02, 0.36, 0.01], [-0.085, 0.24, 0.02]]), { color: S.red, name: 'sea-buoy' });
  stick(buoy, P.poly([[-0.095, 0.1], [0.095, 0.1], [0.09, 0.17], [-0.09, 0.17]]), { color: S.foam });
  stick(buoy, P.circle(0.03, { segments: 10 }), { color: C.night.gold, y: 0.33 });
  stand('right', buoy, { x: 2.15, z: 1.25, delay: 0.3, span: 0.45 });

  // ---------------------------------------------------------------------------
  // Ambient life (pure in state.t)
  // ---------------------------------------------------------------------------
  const boatBaseY = boat.position.y;
  const buoyBaseY = buoy.position.y;

  function update(state, spread) {
    pop.update(spread);
    pressFlat();
    const t = state.t;
    const settle = smoothstep(0.97, 1.0, spread.open);   // ambient only once the page lies open

    // toy-theatre sea: each row slides side to side, neighbours out of phase
    for (let i = 0; i < rows.length; i++) {
      const R = rows[i];
      const dx = settle * R.amp * Math.sin(TAU * (t / 3.6 + R.ph));
      const rock = settle * 0.012 * Math.sin(TAU * (t / 3.6 + R.ph + 0.25));
      for (let j = 0; j < 2; j++) {
        const s = R.strips[j];
        s.piece.position.x = s.x0 + dx;
        s.piece.rotation.x = rock;
      }
    }
    for (let j = 0; j < 2; j++) farRows[j].piece.position.x = farRows[j].x0 + settle * 0.025 * Math.sin(TAU * (t / 4.4 + 0.35));

    // the boat rocks and bobs as one piece
    boat.rotation.z = settle * (0.035 * Math.sin(TAU * t / 3.1) + 0.01 * Math.sin(TAU * t / 1.7 + 0.8));
    boat.position.y = boatBaseY + settle * 0.016 * (1 + Math.sin(TAU * t / 2.6 + 0.4));
    fox.tail.rotation.z = P.sway(t, { freq: 0.35, amp: 0.05 });

    // the lighthouse blinks: a soft flash every 2.5 s, rays only during the flash
    const p = P.phase01(t, 2.5, 0.5) - 0.5;
    const flash = Math.exp(-(p * p) / (2 * 0.075 * 0.075)) * lighthouseUp(spread);
    lampMat.emissiveIntensity = 0.3 + 2.4 * flash;
    const fr = smoothstep(0.08, 0.6, flash);
    rays.visible = fr > 0.01;
    rays.scale.set(Math.max(0.01, fr), 0.5 + 0.5 * fr, 1);

    // clouds drift, gulls bob, buoy bobs
    for (let i = 0; i < clouds.length; i++) clouds[i].c.position.x = clouds[i].x0 + settle * 0.06 * Math.sin(TAU * (t / 9 + clouds[i].ph));
    for (let i = 0; i < gulls.length; i++) {
      const g = gulls[i];
      g.g.position.y = g.y0 + settle * 0.035 * Math.sin(TAU * (t / 2.2 + g.ph));
      g.g.rotation.z = settle * 0.06 * Math.sin(TAU * (t / 2.2 + g.ph + 0.2));
    }
    buoy.position.y = buoyBaseY + settle * 0.012 * (1 + Math.sin(TAU * t / 2.0 + 1.3));
    buoy.rotation.z = settle * 0.06 * Math.sin(TAU * t / 2.4 + 0.5);
  }

  // the lamp only flashes once the lighthouse stands
  function lighthouseUp(spread) { return P.rise(spread.open, { delay: 0.18 }) > 0.5 ? 1 : 0; }

  orderFrontToBack(pop);
  return { left: pop.left, right: pop.right, center: pop.center, update };
}
