// paper.js - the cut-paper toolkit every pop-up scene is built from.
//
// Everything in the film is flat coloured card: a little thickness, an
// off-white cut edge, matte, a faint fibre grain, standing on cream pages and
// casting soft shadows. Detail comes from GLUING MORE FLAT PIECES on top (a snow
// cap on a peak, windows on a house), never from textures or gradients.
//
// ---------------------------------------------------------------------------
// QUICK START (inside a scene)
//
//   import * as P from '../paper.js';
//   const { PALETTE: C } = P;
//
//   export function createScene(ctx) {
//     const pop = P.createPopup();
//     pop.tint('left', C.forest.moss);                         // full-page wash
//     pop.print('right', P.pagePrint(P.ellipse(0.5, 0.3), { color: C.forest.teal, x: 1.5, z: 0.6 }));
//     const tree = P.cutout(P.pine(0.9, 1.6), { color: C.forest.mid });
//     P.glue(tree, P.ellipse(0.12, 0.08), { color: C.night.gold, x: 0.1, y: 0.9 });
//     pop.stand('left', tree, { x: -1.6, z: -0.8, delay: 0.1 });
//     const v = pop.vfold({ z: -0.4, angle: 0.9, direction: 'back',
//                           shape: P.ridge(1.6, 1.4, { seed: 3 }), color: C.mountain.lavender });
//     P.glue(v.right.card, P.ridge(0.6, 0.4, { seed: 9 }), { color: C.mountain.snow, x: 0.5, y: 1.0 });
//     return { left: pop.left, right: pop.right, center: pop.center,
//              update(state, spread) { pop.update(spread); /* + your ambient motion */ } };
//   }
//
// ---------------------------------------------------------------------------
// COORDINATES
//
// * 2D shapes (all shape helpers): x right, y up, the BASE ON y = 0, centred on
//   x = 0 (except `poly`, which is used as given). Units are world units
//   (a page is PAGE_W = 3 wide, PAGE_H = 4 deep; the fox is ~0.9 tall).
// * cutout(shape): the shape in the mesh's local XY plane, extruded from z = 0
//   (back) to z = thickness (FACE, the coloured side). Faces +Z.
// * pagePrint(shape, {x, z}): lies on the page (XZ plane, +Y up). The shape's
//   origin goes to page point (x, z); shape +x -> page +X, shape +y -> page -Z
//   (toward the TOP of the page, away from the viewer), i.e. it reads upright to
//   the camera.
// * Page frames are the spread frame from ARCHITECTURE.md: +X right, +Y out of
//   the page, +Z toward the viewer, right page x in [0, 3], left page x in
//   [-3, 0], z in [-2, 2] (top of the page is -Z).
//
// ---------------------------------------------------------------------------
// PUBLIC API (all pure / deterministic; nothing here reads real time)
//
//   PALETTE                         colour groups (hex strings), see below
//   CARD_T, LAYER_T                 default card / glued-layer thickness
//   paperMaterial(color, {emissive, glow, key, print}) -> shared MeshStandardMaterial
//   edgeMaterial()                  the shared off-white cut-edge material
//
//   Shapes (-> THREE.Shape, base on y = 0):
//   poly(points, {r})               points [[x,y] | [x,y,cornerRadius], ...]
//   roundRect(w, h, r)  rect(w, h)  ellipse(rx, ry, {segments})  circle(r)
//   pine(w, h, {tiers, seed})       roundTree(w, h, {lumps, seed})   bush(w, h, {lumps, seed})
//   cloud(w, h, {lumps, seed})      hill(w, h)    ridge(w, h, {peaks, jag, seed})
//   waves(w, h, {count, depth})     house(w, h, {roof, eave, chimney, windows})  -> .windows/.door rects
//   star(r, {points, inner})        crescent(r, {thick, tilt})     grass(w, h, {blades, seed})
//   withHoles(shape, ...holeShapes) punch holes (holes must lie inside)
//   translate(shape, dx, dy)        moved copy (e.g. to put V-fold wing art at u >= 0)
//   snowCap(shape, y0, {drip, seed}) -> Shape[]  the parts above y0 with a dripping edge (snow caps)
//
//   Builders:
//   cutout(shape, {color, back, thickness, emissive, glow, key, shadow}) -> Mesh (userData.faceZ)
//   glue(onto, shapeOrObject, {color, x, y, rot, scale, thickness, emissive, glow, key, shadow}) -> Mesh
//   pagePrint(shape, {color, x, z, rot, scale, layer, emissive, glow, key}) -> Mesh
//
//   Mechanisms:
//   createPopup() -> { left, right, center, print, tint, stand, vfold, update }
//   rise(open, {delay, span, spring}) -> 0..~1.05  the standing-flap curve
//
//   Ambient (pure in t):
//   sway(t, {freq, amp, phase})  twinkle(t, seed, {speed})  flicker(t, seed)  phase01(t, period, offset)
//
// PERFORMANCE: materials are cached by parameters (identical colour => identical
// material object), geometries are cached per Shape object (re-use one Shape for
// twenty trees and they share one geometry). One 256x256 grain texture total.
// update() allocates nothing.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PAGE_W, PAGE_H, LEAF_T } from './constants.js';
import { clamp01, rng, hash01 } from './util.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
/**
 * Limited per-spread palettes (hex strings, sRGB). Values are tuned to read
 * under the warm key light + ACES tone mapping. Keep to these.
 */
export const PALETTE = Object.freeze({
  paper: Object.freeze({ cream: '#f3ead4', edge: '#fbf7ec', ink: '#2b2530', kraft: '#d9c29a', shade: '#e4d6b8' }),
  fox: Object.freeze({ orange: '#e2732f', cream: '#f6e7cf', dark: '#3a2a25' }),
  forest: Object.freeze({ deep: '#1f4d3a', mid: '#2f6b4f', light: '#3f8a6a', teal: '#1f6f73', moss: '#7a9a4a', trunk: '#6b4a35' }),
  village: Object.freeze({ blue: '#5f7fa3', paleBlue: '#89a3bf', terracotta: '#c8674a', mustard: '#e2b13c', plaster: '#efe2c8', slate: '#4a5568' }),
  sea: Object.freeze({ navy: '#1d3557', teal: '#2a7f86', aqua: '#62b6b7', foam: '#f4f8f4', red: '#d1493f' }),
  mountain: Object.freeze({ lavender: '#a99bc9', slate: '#5b6078', snow: '#f7f7fb', pink: '#e7b7c8', moon: '#f6f0d8' }),
  night: Object.freeze({ indigo: '#232a5c', deep: '#151936', gold: '#f2c14e', lantern: '#ffcf7a', pane: '#f1e0b6' }),
});

/** Default thickness of a cut-out card. */
export const CARD_T = 0.02;
/** Default thickness of a glued detail layer. */
export const LAYER_T = 0.007;

const GLUE_GAP = 0.0012;     // air between a face and a glued layer
const GLUE_STEP = 0.0009;    // extra z per further glued piece on the same parent (no coplanar overlaps)
const PRINT_Y0 = 0.0016;     // page prints sit this high above the page...
const PRINT_STEP = 0.0012;   // ...plus this per print layer
const FLAP_Y = 0.006;        // standing flaps hinge this high (above all print layers)
const UV_SCALE = 0.75;       // grain repeats every 1/UV_SCALE units
const CURVE_DIV = 8;         // divisions for curves in user-supplied Shapes

// Dev warnings (flap footprint / facing-page collisions). On unless ?paperwarn=0.
const WARN = !(typeof location !== 'undefined' && /[?&]paperwarn=0\b/.test(location.search));

// ---------------------------------------------------------------------------
// Grain texture and materials
// ---------------------------------------------------------------------------
let grainTex = null;

/** The single shared fibre-grain texture (256², seeded, tileable). null outside a browser. */
export function grainTexture() {
  if (grainTex || typeof document === 'undefined') return grainTex;
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const rand = rng(20240611);
  // Fine speckle around a light base (multiplies the colour: keep it near white).
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 238 + (rand() - 0.5) * 14 + (rand() < 0.02 ? -10 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Soft mottling (blotches), then fibres; everything drawn wrapped so it tiles.
  const wrapDraw = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
  for (let i = 0; i < 40; i++) {
    const x = rand() * N, y = rand() * N, r = 10 + rand() * 30, a = 0.025 + rand() * 0.03;
    const light = rand() < 0.5;
    wrapDraw((ox, oy) => {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = rand() * N, y = rand() * N, len = 4 + rand() * 16, ang = rand() * Math.PI * 2, bend = (rand() - 0.5) * 8;
    const dark = rand() < 0.55;
    g.strokeStyle = dark ? `rgba(60,50,40,${0.05 + rand() * 0.08})` : `rgba(255,255,255,${0.1 + rand() * 0.15})`;
    g.lineWidth = 0.5 + rand() * 0.9;
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    wrapDraw((ox, oy) => {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + dx / 2 - dy * bend / len, y + oy + dy / 2 + dx * bend / len, x + ox + dx, y + oy + dy);
      g.stroke();
    });
  }
  grainTex = new THREE.CanvasTexture(cv);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.colorSpace = THREE.SRGBColorSpace;
  grainTex.anisotropy = 4;
  grainTex.name = 'paper-grain';
  return grainTex;
}

const materialCache = new Map();
const colorKey = (c) => (c === undefined || c === null || c === false ? '' : new THREE.Color(c).getHexString());

/**
 * Matte cut-paper material, tinted `color`, with the shared fibre grain.
 * CACHED: identical parameters return the SAME material object, so hundreds of
 * pieces share a handful of materials. Changing one changes all its users.
 *
 * opts.emissive  colour (or true = same as `color`) for pieces that glow at night
 *                (stars, windows, lantern pane). Drive it with
 *                `mat.emissiveIntensity = ...` (starts at opts.glow, default 0).
 * opts.glow      initial emissiveIntensity.
 * opts.key       any string: makes a separate cached material (e.g. 'windows-left'),
 *                so that its glow can be driven independently.
 * opts.print     internal: polygon-offset layer for page prints.
 */
export function paperMaterial(color, opts = {}) {
  const em = opts.emissive === true ? color : opts.emissive;
  const key = `${colorKey(color)}|${colorKey(em)}|${opts.key ?? ''}|${opts.print ?? ''}`;
  let m = materialCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    map: grainTexture(),
    roughness: 0.93,
    metalness: 0,
  });
  if (em) {
    m.emissive = new THREE.Color(em);
    m.emissiveMap = grainTexture();
    m.emissiveIntensity = opts.glow ?? 0;
  }
  if (opts.print !== undefined) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -2 * (opts.print + 1);
  }
  m.name = `paper-${key}`;
  materialCache.set(key, m);
  return m;
}

/** The shared off-white material of every cut edge. */
export function edgeMaterial() {
  return paperMaterial(PALETTE.paper.edge, { key: 'edge' });
}

// ---------------------------------------------------------------------------
// Shape helpers (all return THREE.Shape: x right, y up, base on y = 0)
// ---------------------------------------------------------------------------
const V = (x, y) => new THREE.Vector2(x, y);

/** Round each corner [x, y, r] (r = per-corner radius, else defR) with a sampled quadratic. */
function roundPts(pts, defR = 0, steps = 3) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i];
    const r = P[2] ?? defR;
    if (!r) { out.push(V(P[0], P[1])); continue; }
    const A = pts[(i + n - 1) % n], B = pts[(i + 1) % n];
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]) || 1, lb = Math.hypot(B[0] - P[0], B[1] - P[1]) || 1;
    const ta = Math.min(r, la * 0.5) / la, tb = Math.min(r, lb * 0.5) / lb;
    const p0 = [P[0] + (A[0] - P[0]) * ta, P[1] + (A[1] - P[1]) * ta];
    const p2 = [P[0] + (B[0] - P[0]) * tb, P[1] + (B[1] - P[1]) * tb];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      out.push(V(u * u * p0[0] + 2 * u * t * P[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * P[1] + t * t * p2[1]));
    }
  }
  return out;
}

/**
 * Polygon from points. Each point is [x, y] or [x, y, r] where r rounds that
 * corner (scissors never cut perfectly sharp). opts.r = default corner radius.
 */
export function poly(points, opts = {}) {
  return new THREE.Shape(roundPts(points, opts.r ?? 0, opts.steps ?? 3));
}

/** Rectangle w x h with corner radius r, from (-w/2, 0) to (w/2, h). */
export function roundRect(w, h, r = 0) {
  const x0 = -w / 2, x1 = w / 2;
  return poly([[x0, 0, r], [x1, 0, r], [x1, h, r], [x0, h, r]]);
}

/** Plain rectangle (-w/2, 0)..(w/2, h). */
export function rect(w, h) { return roundRect(w, h, 0); }

function ellipsePts(cx, cy, rx, ry, segments, a0 = 0) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = a0 + (i / segments) * Math.PI * 2;
    pts.push(V(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

/** Ellipse with radii rx, ry, resting on y = 0 (centre (0, ry)). */
export function ellipse(rx, ry = rx, opts = {}) {
  const seg = opts.segments ?? Math.max(14, Math.min(32, Math.round(28 * Math.sqrt(Math.max(rx, ry)))));
  return new THREE.Shape(ellipsePts(0, ry, rx, ry, seg));
}

/** Circle of radius r resting on y = 0. */
export function circle(r, opts = {}) { return ellipse(r, r, opts); }

/** Punch holes into `shape`. Each hole is a Shape (or Vector2[]) that lies inside it. Returns `shape`. */
export function withHoles(shape, ...holes) {
  for (const h of holes) {
    const pts = Array.isArray(h) ? h : h.getPoints(CURVE_DIV);
    shape.holes.push(new THREE.Path(pts));
  }
  return shape;
}

/**
 * A moved copy of `shape` (holes and house .windows/.door included). Handy for
 * V-fold wings, whose art must sit at u >= 0: translate(ridge(2, 1), 1, 0).
 */
export function translate(shape, dx, dy = 0) {
  const s = new THREE.Shape(shiftedPts(shape, dx, dy));
  for (const h of shape.holes) s.holes.push(new THREE.Path(h.getPoints(CURVE_DIV).map((p) => V(p.x + dx, p.y + dy))));
  const mv = (r) => ({ ...r, x: r.x + dx, y: r.y + dy });
  if (shape.windows) s.windows = shape.windows.map(mv);
  if (shape.door) s.door = mv(shape.door);
  return s;
}

/** Offset copy of a shape's outline as a hole path (helper for holes placed at (x, y)). */
function shiftedPts(shape, x, y) {
  return shape.getPoints(CURVE_DIV).map((p) => V(p.x + x, p.y + y));
}

/** Stylised pine: stacked drooping tiers on a short trunk. */
export function pine(w, h, opts = {}) {
  const tiers = opts.tiers ?? 3;
  const rand = rng(opts.seed ?? 7);
  const tw = w * 0.13, th = opts.trunk === false ? 0 : h * 0.1;
  const F = h - th;
  const right = th > 0 ? [[tw / 2, 0], [tw / 2, th]] : [];
  let prevX = 0, prevY = 0;
  for (let i = 0; i < tiers; i++) {
    const base = th + F * (i / tiers) * 0.8;
    const half = (w / 2) * (1 - (i / tiers) * 0.6) * (0.94 + rand() * 0.08);
    if (i > 0) {
      const ny = base + F * 0.05;
      const slopeX = prevX * (1 - (ny - prevY) / (h - prevY));
      right.push([slopeX * 0.78, ny]);
    }
    right.push([half, base]);
    prevX = half; prevY = base;
  }
  const left = right.map(([x, y]) => [-x, y]).reverse();
  return poly([...right, [0, h], ...left]);
}

/** Scalloped radius factor: `lumps` bumps around [0, span], depth d, seeded amplitude. */
function scallop(phi, lumps, d, amps) {
  const k = (lumps * phi) / 2;
  const idx = Math.floor(k / Math.PI);
  const s = Math.abs(Math.sin(k));
  const a = amps[((idx % amps.length) + amps.length) % amps.length];
  return 1 - d * a + d * a * Math.sqrt(s);
}

/** Round (deciduous) tree: lumpy canopy on a trunk. */
export function roundTree(w, h, opts = {}) {
  const lumps = opts.lumps ?? 8;
  const rand = rng(opts.seed ?? 11);
  const amps = Array.from({ length: lumps }, () => 0.7 + rand() * 0.6);
  const tw = w * 0.14, trunkH = h * 0.3;
  const rx = w / 2, ry = (h - trunkH * 0.75) / 2;
  const cy = h - ry;
  const pts = [[tw / 2, 0], [tw * 0.42, cy - ry * 0.8]];
  const d = 0.13, a0 = -Math.PI / 2 + 0.3, a1 = Math.PI * 1.5 - 0.3, N = lumps * 5;
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    const k = scallop(a + Math.PI / 2, lumps, d, amps) / (1 + d * 0.1);
    pts.push([Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  pts.push([-tw * 0.42, cy - ry * 0.8], [-tw / 2, 0]);
  return poly(pts);
}

/** Half-ellipse dome with scalloped lumps on top, flat base (bushes, clouds). */
function dome(w, h, lumps, depth, seed, ptsPerLump = 5) {
  const rand = rng(seed);
  const amps = Array.from({ length: lumps }, () => 0.75 + rand() * 0.5);
  const N = lumps * ptsPerLump;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = (Math.PI * i) / N;
    const k = scallop(a * 2, lumps, depth, amps);
    pts.push([Math.cos(a) * (w / 2) * k, Math.sin(a) * h * k]);
  }
  pts[0][1] = 0; pts[N][1] = 0;
  return poly(pts);
}

/** Bush: low lumpy dome. */
export function bush(w, h, opts = {}) { return dome(w, h, opts.lumps ?? 5, 0.22, opts.seed ?? 3); }

/** Cloud: wide dome with a few big lumps and a flat bottom. */
export function cloud(w, h, opts = {}) { return dome(w, h, opts.lumps ?? 4, 0.3, opts.seed ?? 5, 6); }

/** Soft rolling hill (bell profile), base on y = 0. */
export function hill(w, h, opts = {}) {
  const N = opts.segments ?? 18;
  const pts = [[w / 2, 0]];
  for (let i = 0; i <= N; i++) {
    const x = w / 2 - (w * i) / N;
    const t = (x / (w / 2));
    pts.push([x, h * Math.pow(Math.max(0, 1 - t * t), 0.7)]);
  }
  pts.push([-w / 2, 0]);
  // drop the duplicate end points (y = 0 at both ends already)
  pts.splice(1, 1); pts.splice(pts.length - 2, 1);
  return poly(pts);
}

/**
 * Mountain ridge / hill line: `peaks` summits (the tallest is h), seeded.
 * jag = 0 gives soft rounded hills, 1 gives sharp jagged rock.
 */
export function ridge(w, h, opts = {}) {
  const peaks = opts.peaks ?? 3;
  const jag = opts.jag ?? 0.6;
  const rand = rng(opts.seed ?? 1);
  const prof = [[-w / 2, h * (0.12 + rand() * 0.1)]];
  const tallest = Math.floor(rand() * peaks);
  for (let i = 0; i < peaks; i++) {
    const cx = -w / 2 + (w * (i + 0.5)) / peaks + (rand() - 0.5) * (w / peaks) * 0.35;
    const py = i === tallest ? h : h * (0.55 + rand() * 0.3);
    prof.push([cx, py, 's']);
    if (i < peaks - 1) {
      const vx = -w / 2 + (w * (i + 1)) / peaks + (rand() - 0.5) * (w / peaks) * 0.2;
      prof.push([vx, h * (0.25 + rand() * 0.2)]);
    }
  }
  prof.push([w / 2, h * (0.12 + rand() * 0.1)]);
  // Jagged: insert zigzag shoulders along each slope.
  let top = prof;
  if (jag > 0) {
    top = [];
    for (let i = 0; i < prof.length; i++) {
      top.push(prof[i]);
      if (i === prof.length - 1) break;
      const [x0, y0] = prof[i], [x1, y1] = prof[i + 1];
      const n = 2;
      for (let s = 1; s <= n; s++) {
        const t = s / (n + 1) + (rand() - 0.5) * 0.12;
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
        const off = (rand() - 0.35) * jag * 0.09 * L;
        top.push([x0 + dx * t + (-dy / L) * off, y0 + dy * t + (dx / L) * off]);
      }
    }
  }
  const softR = jag > 0 ? 0 : (w / peaks) * 0.22;
  const pts = [[w / 2, 0], ...top.slice().reverse().map(([x, y, s]) => [x, y, s && jag > 0 ? 0.015 : softR]), [-w / 2, 0]];
  return poly(pts);
}

/** Scalloped wave strip: a band of height h whose top is `count` rounded crests. */
export function waves(w, h, opts = {}) {
  const count = opts.count ?? 5;
  const base = h * (1 - (opts.depth ?? 0.4));
  const lean = opts.lean ?? 0.18; // crests lean toward +x like rolling water
  const pts = [[-w / 2, 0], [w / 2, 0]];
  const sw = w / count;
  for (let i = count - 1; i >= 0; i--) {
    const x0 = -w / 2 + i * sw;
    for (let s = 6; s >= 0; s--) {
      const t = s / 6;
      const y = base + (h - base) * Math.pow(Math.sin(Math.PI * t), 0.65);
      const x = x0 + sw * (t + lean * Math.sin(Math.PI * t) * 0.5 * (1 - t));
      if (i === count - 1 && s === 6) pts.push([w / 2, base]);
      else if (!(s === 6)) pts.push([x, y]);
    }
  }
  pts.push([-w / 2, base]);
  // remove consecutive duplicates
  return poly(pts.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6));
}

/**
 * Gabled house silhouette, w wide, h to the ridge. opts.roof = roof height
 * fraction (0.42), opts.eave overhang (0.07*w), opts.chimney (true), opts.windows
 * (true = cut window HOLES). The returned shape carries `.windows` (array of
 * {x, y, w, h}: centre x, bottom y) and `.door` rects for gluing glowing panes.
 */
export function house(w, h, opts = {}) {
  const roofH = h * (opts.roof ?? 0.42);
  const wallH = h - roofH;
  const eave = opts.eave ?? w * 0.07;
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, wallH], [w / 2 + eave, wallH]];
  if (opts.chimney) {
    // chimney on the right roof slope, between 55% and 70% of the slope
    const slope = (x) => h - (roofH * x) / (w / 2 + eave);
    const cx0 = w * 0.2, cx1 = w * 0.32;
    pts.push([cx1, slope(cx1)], [cx1, h * 0.98], [cx0, h * 0.98], [cx0, slope(cx0)]);
  }
  pts.push([0, h], [-w / 2 - eave, wallH], [-w / 2, wallH]);
  const shape = poly(pts);
  const ww = w * 0.2, wh = wallH * 0.28;
  shape.windows = [
    { x: -w * 0.24, y: wallH * 0.52, w: ww, h: wh },
    { x: w * 0.24, y: wallH * 0.52, w: ww, h: wh },
  ];
  if (roofH > 0.25 * h) shape.windows.push({ x: 0, y: wallH + roofH * 0.18, w: ww * 0.8, h: ww * 0.8 });
  shape.door = { x: 0, y: 0, w: w * 0.2, h: wallH * 0.55 };
  if (opts.windows) {
    for (const r of shape.windows) shape.holes.push(new THREE.Path(shiftedPts(roundRect(r.w, r.h, 0.01), r.x, r.y)));
  }
  return shape;
}

/** Star with `points` points, outer radius r, resting on y = 0 (centre (0, r)). */
export function star(r, opts = {}) {
  const n = opts.points ?? 5, inner = opts.inner ?? 0.45;
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    pts.push([Math.cos(a) * rr, r + Math.sin(a) * rr, i % 2 ? 0 : r * 0.04]);
  }
  return poly(pts);
}

/**
 * Crescent moon of radius r opening toward +x (a "C"), resting on y = 0.
 * opts.thick (0..1) = width of the lit band relative to r; opts.tilt rotates it (radians).
 */
export function crescent(r, opts = {}) {
  const thick = opts.thick ?? 0.45, tilt = opts.tilt ?? 0;
  const r2 = r * 0.9, d = r * thick + (r - r2) * 0.5 + r * 0.25;
  const xi = (d * d + r * r - r2 * r2) / (2 * d);
  const yi = Math.sqrt(Math.max(0, r * r - xi * xi));
  const a = Math.atan2(yi, xi), b = Math.atan2(yi, xi - d);
  const pts = [];
  const N = 22, M = 18;
  for (let i = 0; i <= N; i++) { const t = a + ((2 * Math.PI - 2 * a) * i) / N; pts.push([Math.cos(t) * r, Math.sin(t) * r]); }
  for (let i = 1; i < M; i++) { const t = -b - ((2 * Math.PI - 2 * b) * i) / M; pts.push([d + Math.cos(t) * r2, Math.sin(t) * r2]); }
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return poly(pts.map(([x, y]) => [x * c - y * s, r + x * s + y * c]));
}

/** Grass tuft strip: a thin band with `blades` pointed blades of varied height and lean. */
export function grass(w, h, opts = {}) {
  const blades = opts.blades ?? 9;
  const rand = rng(opts.seed ?? 13);
  const band = h * 0.18;
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, band]];
  const step = w / blades;
  for (let i = blades - 1; i >= 0; i--) {
    const x0 = -w / 2 + i * step;
    const tipH = h * (0.55 + rand() * 0.45);
    const lean = (rand() - 0.5) * step * 0.9;
    pts.push([x0 + step * 0.5 + lean, tipH]);
    if (i > 0) pts.push([x0, band + rand() * h * 0.08]);
  }
  pts.push([-w / 2, band]);
  return poly(pts);
}

/**
 * The part of `shape` above height y0, as an ARRAY of Shapes (one per peak),
 * with a wavy dripping lower edge: glue them on as snow caps, sunlit tops,
 * foam crests... e.g. for (const s of snowCap(peaks, 0.8)) glue(card, s, { color: C.mountain.snow }).
 * opts.drip = drip depth (default 0.05), opts.seed. Works for shapes whose
 * outline crosses y0 only on the way up/down a peak (ridges, hills, pines).
 */
export function snowCap(shape, y0, opts = {}) {
  const { outer } = contours(shape);
  const n = outer.length;
  const above = outer.map((p) => p.y > y0);
  const start = above.indexOf(false);
  if (start < 0) return [shape];
  const rand = rng(opts.seed ?? 21);
  const drip = opts.drip ?? 0.05;
  const cross = (a, b) => { const t = (y0 - a.y) / (b.y - a.y); return [a.x + (b.x - a.x) * t, y0]; };
  const out = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n, j = (i + n - 1) % n;
    const a = outer[j], b = outer[i];
    if (!above[j] && above[i]) cur = [cross(a, b), [b.x, b.y]];
    else if (above[j] && above[i]) cur?.push([b.x, b.y]);
    else if (above[j] && !above[i] && cur) {
      const exit = cross(a, b);
      cur.push(exit);
      // wavy snow line from the exit point back to the entry point
      const entry = cur[0], w = entry[0] - exit[0];
      const m = Math.max(2, Math.round(Math.abs(w) / 0.09));
      for (let s = 1; s < m; s++) {
        const x = exit[0] + (w * s) / m;
        cur.push([x, y0 - (s % 2 ? drip * (0.6 + rand() * 0.8) : drip * 0.15), s % 2 ? Math.abs(w) / m * 0.4 : 0]);
      }
      if (Math.abs(w) > 1e-4) out.push(poly(cur));
      cur = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry (custom extrusion: crisp edges, 2-3 material groups, cached per Shape)
// ---------------------------------------------------------------------------
function cleanContour(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.length || out[out.length - 1].distanceToSquared(p) > 1e-12) out.push(p);
  }
  if (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) <= 1e-12) out.pop();
  return out;
}

function contours(shape) {
  const ex = shape.extractPoints(CURVE_DIV);
  const outer = cleanContour(ex.shape);
  if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  const holes = ex.holes.map(cleanContour).filter((h) => h.length >= 3);
  for (const h of holes) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
  return { outer, holes };
}

function triangles(outer, holes) {
  const all = outer.concat(...holes);
  const faces = THREE.ShapeUtils.triangulateShape(outer.slice(), holes.map((h) => h.slice()));
  // Make every triangle CCW (front = +Z).
  for (const f of faces) {
    const [a, b, c] = f.map((i) => all[i]);
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) { const t = f[1]; f[1] = f[2]; f[2] = t; }
  }
  return { all, faces };
}

const geoCache = new WeakMap();

function cached(shape, key, build) {
  let m = geoCache.get(shape);
  if (!m) { m = new Map(); geoCache.set(shape, m); }
  let g = m.get(key);
  if (!g) { g = build(); m.set(key, g); }
  return g;
}

/**
 * Card geometry: shape extruded from z = 0 to z = T. Groups: front cap, back cap
 * (merged with the front when `twoTone` is false), sides (edge material).
 */
function cardGeometry(shape, T, twoTone) {
  return cached(shape, `card|${T}|${twoTone ? 2 : 1}`, () => {
    const { outer, holes } = contours(shape);
    const { all, faces } = triangles(outer, holes);
    const pos = [], nrm = [], uv = [];
    const push = (x, y, z, nx, ny, nz, u, v) => { pos.push(x, y, z); nrm.push(nx, ny, nz); uv.push(u, v); };
    for (const f of faces) for (const i of f) { const p = all[i]; push(p.x, p.y, T, 0, 0, 1, p.x * UV_SCALE, p.y * UV_SCALE); }
    const nFront = faces.length * 3;
    for (const f of faces) for (let k = 2; k >= 0; k--) { const p = all[f[k]]; push(p.x, p.y, 0, 0, 0, -1, -p.x * UV_SCALE + 0.37, p.y * UV_SCALE + 0.21); }
    const nCaps = faces.length * 6;
    for (const c of [outer, ...holes]) {
      let s = 0;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const nx = dy / L, ny = -dx / L;
        const u0 = s * UV_SCALE, u1 = (s + L) * UV_SCALE, vt = T * UV_SCALE * 4;
        s += L;
        push(a.x, a.y, 0, nx, ny, 0, u0, 0); push(b.x, b.y, 0, nx, ny, 0, u1, 0); push(b.x, b.y, T, nx, ny, 0, u1, vt);
        push(a.x, a.y, 0, nx, ny, 0, u0, 0); push(b.x, b.y, T, nx, ny, 0, u1, vt); push(a.x, a.y, T, nx, ny, 0, u0, vt);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const nAll = pos.length / 3;
    if (twoTone) {
      g.addGroup(0, nFront, 0);
      g.addGroup(nFront, nCaps - nFront, 1);
      g.addGroup(nCaps, nAll - nCaps, 2);
    } else {
      g.addGroup(0, nCaps, 0);
      g.addGroup(nCaps, nAll - nCaps, 1);
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}

/** Single-sided flat geometry of the shape in its XY plane (normal +Z), for prints. */
function flatGeometry(shape) {
  return cached(shape, 'flat', () => {
    const { outer, holes } = contours(shape);
    const { all, faces } = triangles(outer, holes);
    const pos = [], uv = [];
    for (const f of faces) for (const i of f) { const p = all[i]; pos.push(p.x, p.y, 0); uv.push(p.x * UV_SCALE + 0.5, p.y * UV_SCALE + 0.13); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const n = new Float32Array(pos.length);
    for (let i = 2; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
/**
 * A cut-out card: `shape` extruded to `thickness` (default CARD_T = 0.02), no
 * bevel. Face (z = thickness, +Z side) in `color`, cut edges off-white, back in
 * `back` (default: same as color). castShadow/receiveShadow on (opts.shadow =
 * false disables casting). Emissive opts as paperMaterial. Returns a Mesh with
 * userData.faceZ = thickness (where glue() puts the next layer).
 */
export function cutout(shape, opts = {}) {
  const T = opts.thickness ?? CARD_T;
  const color = opts.color ?? PALETTE.paper.cream;
  const matOpts = { emissive: opts.emissive, glow: opts.glow, key: opts.key };
  const face = paperMaterial(color, matOpts);
  const twoTone = opts.back !== undefined && colorKey(opts.back) !== colorKey(color);
  const mats = twoTone ? [face, paperMaterial(opts.back), edgeMaterial()] : [face, edgeMaterial()];
  const mesh = new THREE.Mesh(cardGeometry(shape, T, twoTone), mats);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  mesh.userData.faceZ = T;
  mesh.userData.glued = 0;
  if (opts.name) mesh.name = opts.name;
  return mesh;
}

/**
 * Glue a flat detail layer onto the FACE of `onto` (a cutout, a glued layer, or
 * any Object3D whose face is at local z = userData.faceZ || 0). `what` is a
 * Shape (made into a thin card, default thickness LAYER_T, colour opts.color)
 * or a ready Object3D. Placed at (opts.x, opts.y) in onto's local XY, rotated
 * opts.rot about the normal, scaled opts.scale; each further piece glued on the
 * same parent sits a hair prouder, so overlapping layers never z-fight. Glued
 * cards cast no shadow unless opts.shadow = true (they are too thin to matter;
 * use it for layers that stick out past their parent). Returns the layer, which
 * you can glue onto again.
 */
export function glue(onto, what, opts = {}) {
  const layer = what instanceof THREE.Shape
    ? cutout(what, { thickness: LAYER_T, shadow: !!opts.shadow, ...opts, name: opts.name })
    : what;
  if (!(what instanceof THREE.Shape) && opts.shadow !== undefined) layer.castShadow = !!opts.shadow;
  const n = onto.userData.glued ?? 0;
  onto.userData.glued = n + 1;
  layer.position.set(opts.x ?? 0, opts.y ?? 0, (onto.userData.faceZ ?? 0) + GLUE_GAP + n * GLUE_STEP);
  if (opts.rot) layer.rotation.z = opts.rot;
  if (opts.scale) layer.scale.setScalar(opts.scale);
  onto.add(layer);
  return layer;
}

/**
 * Flat art lying ON the page (page XZ plane, a hair above y = 0, receives
 * shadows, never z-fights with the page). Shape origin -> page (x, z); shape +y
 * points to the page top (-Z). opts.rot turns it about the page normal;
 * opts.layer (0, 1, 2...) stacks prints (a pond print on a meadow print: layer 1).
 * Add it with pop.print(side, mesh) or to any page-frame group.
 */
export function pagePrint(shape, opts = {}) {
  const layer = opts.layer ?? 0;
  const mat = paperMaterial(opts.color ?? PALETTE.paper.shade, { emissive: opts.emissive, glow: opts.glow, key: opts.key, print: layer });
  const mesh = new THREE.Mesh(flatGeometry(shape), mat);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(-Math.PI / 2, opts.rot ?? 0, 0);
  mesh.position.set(opts.x ?? 0, PRINT_Y0 + layer * PRINT_STEP, opts.z ?? 0);
  if (opts.scale) mesh.scale.setScalar(opts.scale);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Mechanisms
// ---------------------------------------------------------------------------
const RISE_START = 0.1;   // flaps lie flat until spread.open passes this (+ delay)
const RISE_SPAN = 0.5;    // ...and reach full height this much later
const SPRING = 1.25;      // easeOutBack constant: ~6% overshoot, settles exactly at 1

/**
 * The standing-flap curve, a pure function of spread.open: 0 (flat) until
 * open = 0.1 + delay, then an eased rise with a small overshoot that settles
 * at exactly 1 by open = 0.1 + delay + span (span shrinks so it ends <= 0.98).
 * Use it to sync your own motion with a flap (e.g. fade a glow in as it stands).
 */
export function rise(open, opts = {}) {
  const o0 = RISE_START + (opts.delay ?? 0);
  const o1 = Math.min(0.98, o0 + (opts.span ?? RISE_SPAN));
  const p = clamp01((open - o0) / Math.max(0.05, o1 - o0));
  const s = opts.spring ?? SPRING;
  const q = p - 1;
  return 1 + (s + 1) * q * q * q + s * q * q;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** Bounding box of obj's subtree in obj's PARENT space (uses current local matrices). */
function boundsInParent(obj, box = new THREE.Box3()) {
  box.makeEmpty();
  const visit = (o, parentM) => {
    o.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(parentM, o.matrix);
    if (o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m);
        box.expandByPoint(_v);
      }
    }
    for (const c of o.children) visit(c, m);
  };
  visit(obj, new THREE.Matrix4());
  return box;
}

function boxCorners(b) {
  const out = [];
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  return out;
}

/**
 * The pop-up manager. Owns three Groups to return from createScene:
 *   pop.left / pop.right  page frames (spread frame, see top of file)
 *   pop.center            the bisector frame (V-folds live here)
 * and drives every mechanism from spread.open / spread.theta in pop.update(spread).
 *
 * pop.print(side, mesh)  add flat art (pagePrint) to 'left' | 'right'. Returns mesh.
 * pop.tint(side, color, {inset = 0.08, r = 0.1, layer = 0})  full-page wash. Returns mesh.
 *
 * pop.stand(side, piece, opts) -> handle { hinge, piece, rise }
 *   A flap hinged to its page along the piece's BASE LINE (local y = 0 of
 *   `piece`, which is authored standing in its XY plane facing +Z, e.g. a
 *   cutout). opts:
 *     x, z         where the piece's local origin sits on the page (page frame)
 *     yaw          rotation about the page normal (radians). 0 = base parallel
 *                  to X, face toward the viewer (+Z). PI/2 = face toward +X.
 *     foldToward   'back' (default: the top falls away from the face, face up -
 *                  with yaw 0 it lies toward the page top, -Z) or 'front'.
 *     maxAngle     standing angle from the page (default PI/2 = upright).
 *     delay        stagger, in units of spread.open (0..~0.35). Default 0.
 *     span, spring see rise().
 *   handle.rise is the current 0..~1.05 rise value (read it in update).
 *   Build the piece completely BEFORE the first update: on the first update
 *   the piece is measured and console.warns if its folded footprint leaves the
 *   page or if it would poke through the facing page while the book closes
 *   (with a suggested delay).
 *
 * pop.vfold(opts) -> handle { group, left, right }
 *   A V-fold straddling the gutter, driven by spread.theta. Each wing is hinged
 *   to its page along a line leaving the gutter point (0, 0, z) at `angle`
 *   (radians, from the spine, 0.2..1.35; default 0.85) toward the back
 *   (direction 'back', -Z, default: the crease points at the viewer) or the
 *   front ('front', +Z: the V opens toward the viewer). The crease stands
 *   vertical when the spread is flat open and the piece folds flat as it closes.
 *   Wings, in that wing's frame (handle.left / handle.right are Groups):
 *     +X = u: along the hinge, away from the gutter
 *     +Y = v: up the crease (the crease is the line u = 0)
 *     +Z     = the face the audience sees (outside of a 'back' V, inside of a
 *              'front' V). The LEFT wing's frame is mirrored, so one shape
 *              authored for u >= 0 gives a symmetric piece.
 *     y = 0 is the hinge line on the page; keep wing art in u >= 0, v >= 0.
 *   opts.shape (both wings) or opts.left / opts.right: a THREE.Shape (built as a
 *   cutout in opts.color / leftColor / rightColor, opts.back, opts.thickness,
 *   with an automatic glue-tab skirt below the hinge that hides the up-to
 *   2*LEAF_T gap to the lower page), or any Object3D authored in the wing frame
 *   (you own its skirt then). With shapes, handle.left.card / handle.right.card
 *   are the wing cutouts: glue() details onto them. Anything you add to a wing
 *   Group rides with it.
 *   Note: a V-fold is locked to the page angle; it has no delay.
 *
 * pop.update(spread) - call every frame from your scene's update.
 */
export function createPopup() {
  const left = new THREE.Group(); left.name = 'pop-left';
  const right = new THREE.Group(); right.name = 'pop-right';
  const center = new THREE.Group(); center.name = 'pop-center';
  const groups = { left, right };
  const flaps = [];
  const vfolds = [];
  let checked = false;

  function sideGroup(side) {
    const g = groups[side];
    if (!g) throw new Error(`paper: side must be 'left' or 'right', got ${side}`);
    return g;
  }

  function print(side, mesh) { sideGroup(side).add(mesh); return mesh; }

  function tint(side, color, opts = {}) {
    const inset = opts.inset ?? 0.08;
    const m = pagePrint(roundRect(PAGE_W - 2 * inset, PAGE_H - 2 * inset, opts.r ?? 0.1), {
      color, layer: opts.layer ?? 0, x: (side === 'left' ? -1 : 1) * PAGE_W / 2, z: PAGE_H / 2 - inset,
    });
    m.name = `tint-${side}`;
    return print(side, m);
  }

  function stand(side, piece, opts = {}) {
    const hinge = new THREE.Group();
    hinge.name = `flap-${piece.name || flaps.length}`;
    hinge.rotation.order = 'YXZ';
    hinge.position.set(opts.x ?? 0, FLAP_Y, opts.z ?? 0);
    hinge.add(piece);
    sideGroup(side).add(hinge);
    const h = {
      hinge, piece, side, rise: 0,
      yaw: opts.yaw ?? 0,
      sign: opts.foldToward === 'front' ? 1 : -1,
      maxAngle: opts.maxAngle ?? Math.PI / 2,
      riseOpts: { delay: opts.delay ?? 0, span: opts.span, spring: opts.spring },
    };
    flaps.push(h);
    poseFlap(h, 0);
    return h;
  }

  function poseFlap(h, open) {
    const r = rise(open, h.riseOpts);
    h.rise = r;
    // angle from the page; lying flat = rotate the standing piece by -/+ PI/2 about X
    h.hinge.rotation.set(h.sign * (Math.PI / 2 - h.maxAngle * r), h.yaw, 0);
  }

  // ---- V-fold ----
  const SKIRT = 2 * LEAF_T + 0.015;

  function wingFromShape(shape, color, opts, flip) {
    const card = cutout(shape, { color, back: opts.back, thickness: opts.thickness });
    card.name = 'vfold-wing';
    // Keep the card's bulk on the side of its own page so the two wings fold
    // flat without crossing: outward for a 'back' V, inward for a 'front' V.
    if (flip) card.position.z = -(opts.thickness ?? CARD_T);
    const parts = [card];
    if (opts.skirt !== false) {
      const { outer } = contours(shape);
      let minY = Infinity;
      for (const p of outer) minY = Math.min(minY, p.y);
      let x0 = Infinity, x1 = -Infinity;
      const eps = 0.012 + 1e-6;
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i], b = outer[(i + 1) % outer.length];
        if (a.y <= minY + eps) { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); }
        if (a.y <= minY + eps && b.y <= minY + eps) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); }
      }
      if (x1 > x0) {
        const skirtShape = poly([[Math.max(0, x0), -SKIRT], [x1, -SKIRT], [x1, minY + 0.001], [Math.max(0, x0), minY + 0.001]]);
        const skirt = cutout(skirtShape, { color, back: opts.back, thickness: opts.thickness, shadow: false });
        skirt.name = 'vfold-skirt';
        skirt.position.z = card.position.z;
        parts.push(skirt);
      }
    }
    return parts;
  }

  function vfold(opts = {}) {
    const alpha = opts.angle ?? 0.85;
    if (!(alpha > 0.05 && alpha < Math.PI / 2 - 0.05)) throw new Error('paper.vfold: angle must be in (0.05, PI/2 - 0.05) radians');
    const dz = opts.direction === 'front' ? 1 : -1;
    const group = new THREE.Group();
    group.name = 'vfold';
    const wings = {};
    for (const side of ['left', 'right']) {
      const w = new THREE.Group();
      w.name = `vfold-${side}`;
      w.matrixAutoUpdate = false;
      const src = opts[side] ?? opts.shape;
      if (src instanceof THREE.Shape) {
        const col = opts[`${side}Color`] ?? opts.color ?? PALETTE.paper.cream;
        const parts = wingFromShape(src, col, opts, dz > 0);
        for (const p of parts) w.add(p);
        w.card = parts[0];
      } else if (src) {
        w.add(src);
      }
      group.add(w);
      wings[side] = w;
    }
    center.add(group);
    const h = {
      group, left: wings.left, right: wings.right,
      z: opts.z ?? 0, alpha, dz, sa: Math.sin(alpha), ca: Math.cos(alpha),
    };
    vfolds.push(h);
    poseVfold(h, Math.PI);
    return h;
  }

  /**
   * Pose a V-fold for page angle theta, in the center frame where the right
   * page runs along R = (a, b, 0), the left along L = (-a, b, 0),
   * a = sin(theta/2), b = cos(theta/2). Hinge directions h = sinα·(page dir) +
   * dz·cosα·Z. The crease c is perpendicular to both hinges:
   * c = normalize(0, cosα, -dz·sinα·b) (vertical at theta = PI, lying in the
   * page plane at theta = 0). Each wing is the rigid frame (h, c, ±h×c) at the
   * gutter point, so both creases are the same line for every theta.
   */
  function poseVfold(h, theta) {
    const a = Math.sin(theta / 2), b = Math.cos(theta / 2);
    const { sa, ca, dz } = h;
    const cy = ca, cz = -dz * sa * b;
    const cl = Math.hypot(cy, cz);
    const cY = cy / cl, cZ = cz / cl;
    for (let s = -1; s <= 1; s += 2) { // s = -1 left, +1 right
      const hx = s * sa * a, hy = sa * b, hz = dz * ca;
      // n = h x c  (c = (0, cY, cZ))
      let nx = hy * cZ - hz * cY, ny = -hx * cZ, nz = hx * cY;
      if (s < 0) { nx = -nx; ny = -ny; nz = -nz; } // mirrored left frame faces the audience too
      const w = s < 0 ? h.left : h.right;
      w.matrix.set(
        hx, 0, nx, 0,
        hy, cY, ny, 0,
        hz, cZ, nz, h.z,
        0, 0, 0, 1,
      );
      w.matrixWorldNeedsUpdate = true;
    }
  }

  // ---- dev checks (once, on the first update) ----
  function devChecks() {
    checked = true;
    if (!WARN) return;
    const hw = PAGE_W, hh = PAGE_H / 2, tol = 0.02;
    for (const f of flaps) {
      const sx = f.side === 'left' ? -1 : 1;
      const saved = f.hinge.rotation.x;
      const corners = boxCorners(boundsInParent(f.piece));
      const name = f.piece.name || f.hinge.name;
      // 1. folded footprint inside the page rectangle
      poseFlap(f, 0); f.hinge.updateMatrix();
      let bad = null;
      for (const c of corners) {
        _v.copy(c).applyMatrix4(f.hinge.matrix);
        const px = _v.x * sx;
        if (px < -tol || px > hw + tol || Math.abs(_v.z) > hh + tol) { bad = _v.clone(); break; }
      }
      if (bad) console.warn(`paper.stand(${f.side}, "${name}"): folded flat it reaches (${bad.x.toFixed(2)}, ${bad.z.toFixed(2)}), outside its page (x within 0..${sx * PAGE_W}, |z| <= ${hh}); it would poke out of the closed book.`);
      // 2. facing-page collision while closing
      const hits = (delay) => {
        const save = f.riseOpts.delay;
        f.riseOpts.delay = delay;
        let hit = -1;
        for (let k = 1; k <= 50 && hit < 0; k++) {
          const open = k / 50, th = Math.PI * open, st = Math.sin(th), ct = Math.cos(th);
          poseFlap(f, open); f.hinge.updateMatrix();
          if (f.rise <= 0) continue; // lying flat: only its card thickness, fine
          for (const c of corners) {
            _v.copy(c).applyMatrix4(f.hinge.matrix);
            const x = _v.x * sx, y = _v.y;
            // facing page runs from the spine along (cos th, sin th) in this page's (x, y)
            const along = x * ct + y * st, dist = x * st - y * ct;
            if (along > 0 && along < PAGE_W && dist < -0.03) { hit = open; break; }
          }
        }
        f.riseOpts.delay = save;
        return hit;
      };
      const hit = hits(f.riseOpts.delay);
      if (hit > 0) {
        let fix = null;
        for (let d = f.riseOpts.delay + 0.02; d <= 0.6; d += 0.02) if (hits(d) < 0) { fix = d; break; }
        console.warn(`paper.stand(${f.side}, "${name}"): pokes through the facing page at open ~${hit.toFixed(2)} while the book closes; ${fix !== null ? `use delay >= ${fix.toFixed(2)}` : 'move it away from the gutter / make it shorter'}.`);
      }
      f.hinge.rotation.x = saved;
    }
    for (const v of vfolds) {
      // folded-flat footprint (theta = 0) of each wing inside its page
      poseVfold(v, 0);
      for (const w of [v.left, v.right]) {
        const b = new THREE.Box3();
        for (const ch of w.children) {
          const cb = boundsInParent(ch);
          for (const c of boxCorners(cb)) {
            if (c.y < -1e-3) continue; // skirt
            b.expandByPoint(c.applyMatrix4(w.matrix));
          }
        }
        if (b.isEmpty()) continue;
        // in the closed center frame the page runs along +Y (distance from the spine), z along the spine
        if (b.max.y > PAGE_W + tol || b.max.z > hh + tol || b.min.z < -hh - tol) {
          console.warn(`paper.vfold(z=${v.z}): folded flat it reaches ${b.max.y.toFixed(2)} from the spine and z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}, outside the page.`);
          break;
        }
      }
    }
  }

  function update(spread) {
    if (!checked) devChecks();
    const open = spread.open;
    for (let i = 0; i < flaps.length; i++) poseFlap(flaps[i], open);
    const theta = spread.theta ?? Math.PI * open;
    for (let i = 0; i < vfolds.length; i++) poseVfold(vfolds[i], theta);
  }

  return { left, right, center, print, tint, stand, vfold, update, flaps, vfolds };
}

// ---------------------------------------------------------------------------
// Ambient helpers: closed-form, pure in t (seconds; use state.t or spread.time)
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;

/** Gentle irregular sway in [-amp, amp] (two incommensurate sines). freq in Hz. */
export function sway(t, opts = {}) {
  const f = opts.freq ?? 0.25, amp = opts.amp ?? 1, ph = opts.phase ?? 0;
  return amp * (0.7 * Math.sin(TAU * (f * t + ph)) + 0.3 * Math.sin(TAU * (f * 1.73 * t + ph * 2.3 + 0.37)));
}

/** Star twinkle in [0, 1], different per seed, mostly bright with soft dips. */
export function twinkle(t, seed = 0, opts = {}) {
  const sp = opts.speed ?? 1;
  const f1 = 0.35 + hash01(seed * 3 + 1) * 0.5, f2 = 0.9 + hash01(seed * 3 + 2) * 0.9, p = hash01(seed * 3 + 3);
  const s = 0.6 * Math.sin(TAU * (f1 * sp * t + p)) + 0.4 * Math.sin(TAU * (f2 * sp * t + p * 1.7));
  return clamp01(0.62 + 0.38 * s);
}

/** Candle/lantern flicker multiplier around 1 (about 0.88..1.06). */
export function flicker(t, seed = 0) {
  const p = hash01(seed + 17);
  return 0.97 + 0.05 * Math.sin(TAU * (2.3 * t + p)) + 0.03 * Math.sin(TAU * (5.1 * t + p * 3.1)) + 0.02 * Math.sin(TAU * (9.7 * t + p * 5.3));
}

/** Looping phase in [0, 1): fraction of the way through the current `period`. */
export function phase01(t, period = 1, offset = 0) {
  const x = t / period + offset;
  return x - Math.floor(x);
}
