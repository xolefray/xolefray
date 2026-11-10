// characters.js - the heroine (a paper fox) and her lantern, built from paper.js.
//
//   import { createFox, createLantern } from '../characters.js';
//
//   const fox = createFox({ pose: 'sit', facing: 1, lantern: false });
//   pop.stand('right', fox.group, { x: 1.4, z: 0.6, delay: 0.15 });   // she is a flat standing piece
//   // update: fox.tail.rotation.z = P.sway(state.t, { amp: 0.06 });   fox.setGlow(state.glow);
//
// createFox(opts) -> { group, flip, poses, tail, lantern, setPose(name), setGlow(g), height }
//   opts.pose     'sit' (default) | 'walk' | 'reach' (sitting up, muzzle + one paw to the sky)
//   opts.facing   1 (default, faces +X) | -1 (mirrored, faces -X)
//   opts.scale    uniform size (default 1: about 0.9 tall sitting)
//   opts.lantern  true: she carries a lantern (set down in front of her paws when
//                 sitting / reaching, hanging from her mouth when walking)
//   opts.light    false: the carried lantern has no PointLight (see createLantern)
//   group         base on y = 0, origin under her body, faces +Z (the audience);
//                 position/rotate/stand THIS. flip carries the facing/scale.
//   tail          the current pose's tail pivot (at the tail root): rotate it
//                 about Z by a few hundredths of a radian for a wag.
//   setPose(name) switches between poses (each built once, on first use).
//   setGlow(g)    forwards to the carried lantern (no-op without one).
//
// createLantern(opts) -> { group, setGlow(g), light, pane }
//   ~0.45 tall flat paper lantern, base on y = 0, faces +Z. setGlow(0..1) drives
//   the pale pane's emissive and a warm PointLight (no shadows; exactly 0 at
//   g = 0). opts.light = false omits the PointLight (each PointLight that appears
//   or disappears recompiles every shader: create lights only where they are
//   needed and keep them, at intensity 0 when off, rather than toggling).
//   opts.intensity (default 1.6) / opts.distance (default 3.2) tune the light.
//   The light casts no shadows, so it shines through pages: while the spread
//   closes, fade it with the spread, e.g. setGlow(state.glow * P.rise(spread.open)).
import * as THREE from 'three';
import { PALETTE, CARD_T, cutout, glue, poly, roundRect, circle, ellipse } from './paper.js';

const C = PALETTE;

// ---------------------------------------------------------------------------
// Lantern
// ---------------------------------------------------------------------------
let lanternCount = 0;

export function createLantern(opts = {}) {
  const id = lanternCount++;
  const group = new THREE.Group();
  group.name = 'lantern';
  const frameColor = opts.frame ?? C.fox.dark;
  const trim = opts.trim ?? C.night.gold;

  const body = cutout(poly([
    [-0.085, 0, 0.01], [0.085, 0, 0.01], [0.085, 0.03], [0.112, 0.05, 0.01], [0.112, 0.305, 0.01],
    [0.075, 0.355, 0.015], [0.03, 0.385, 0.01], [-0.03, 0.385, 0.01], [-0.075, 0.355, 0.015],
    [-0.112, 0.305, 0.01], [-0.112, 0.05, 0.01], [-0.085, 0.03],
  ]), { color: frameColor, name: 'lantern-body' });
  group.add(body);

  // Handle: a half ring tucked just behind the body.
  const ring = [];
  for (let i = 0; i <= 12; i++) { const a = (Math.PI * i) / 12; ring.push([Math.cos(a) * 0.072, 0.365 + Math.sin(a) * 0.072]); }
  for (let i = 12; i >= 0; i--) { const a = (Math.PI * i) / 12; ring.push([Math.cos(a) * 0.052, 0.365 + Math.sin(a) * 0.052]); }
  const handle = cutout(poly(ring), { color: frameColor, thickness: CARD_T * 0.8, name: 'lantern-handle' });
  handle.position.z = -CARD_T * 0.8 - 0.002;
  body.add(handle);

  const paneMat = { emissive: C.night.lantern, glow: 0, key: `lantern-pane-${id}` };
  const pane = glue(body, roundRect(0.17, 0.225, 0.02), { color: C.night.pane, y: 0.068, ...paneMat, name: 'lantern-pane' });
  const flame = glue(pane, poly([[0, 0, 0.01], [0.03, 0.035, 0.02], [0.012, 0.075, 0.004], [0, 0.1], [-0.012, 0.075, 0.004], [-0.03, 0.035, 0.02]]),
    { color: C.night.gold, emissive: '#ffb347', glow: 0, key: `lantern-flame-${id}`, y: 0.05, name: 'lantern-flame' });
  for (const x of [-0.047, 0.047]) glue(pane, roundRect(0.016, 0.225), { color: frameColor, x, name: 'lantern-bar' });
  glue(body, poly([[-0.09, 0, 0.005], [0.09, 0, 0.005], [0.062, 0.042, 0.01], [-0.062, 0.042, 0.01]]), { color: trim, y: 0.3, name: 'lantern-cap' });
  glue(body, roundRect(0.2, 0.032, 0.008), { color: trim, y: 0.036, name: 'lantern-base' });

  let light = null;
  const intensity = opts.intensity ?? 1.6;
  if (opts.light !== false) {
    light = new THREE.PointLight(0xffc27a, 0, opts.distance ?? 3.2, 2);
    light.position.set(0, 0.19, 0.16);
    light.castShadow = false;
    light.name = 'lantern-light';
    group.add(light);
  }

  function setGlow(g) {
    const k = g > 0 ? g : 0;
    pane.material[0].emissiveIntensity = 1.5 * k;
    flame.material[0].emissiveIntensity = 2.2 * k;
    if (light) light.intensity = intensity * k;
  }
  setGlow(opts.glow ?? 0);

  return { group, setGlow, light, pane };
}

// ---------------------------------------------------------------------------
// Fox
// ---------------------------------------------------------------------------
/** Dark ear tip: the top `frac` of the ear triangle (tip, baseA, baseB). */
function earTip(tip, a, b, frac = 0.42) {
  const p = (q) => [tip[0] + (q[0] - tip[0]) * frac, tip[1] + (q[1] - tip[1]) * frac];
  return poly([tip, p(a), p(b)]);
}

// Pose tables. All coordinates in fox units: facing +X, base on y = 0.
// Shared tail used by 'sit' and 'reach' (wrapped round in front of her haunch).
const SIT_TAIL = {
  root: [-0.1, 0.1],
  pts: [[0.06, 0.0, 0.03], [-0.24, -0.005, 0.06], [-0.43, 0.06, 0.09], [-0.53, 0.22, 0.07], [-0.5, 0.37, 0.03],
    [-0.42, 0.29, 0.05], [-0.33, 0.16, 0.06], [-0.14, 0.11, 0.05], [0.02, 0.08, 0.03]],
  tip: [[-0.455, 0.12, 0.02], [-0.53, 0.22, 0.07], [-0.5, 0.37, 0.03], [-0.42, 0.29, 0.03], [-0.44, 0.24], [-0.41, 0.2], [-0.44, 0.165]],
};

const POSES = {
  sit: {
    body: [[0.16, 0], [0.175, 0.17, 0.03], [0.225, 0.36, 0.09], [0.205, 0.5, 0.04], [0.345, 0.575, 0.03],
      [0.44, 0.625, 0.02], [0.315, 0.705, 0.04], [0.24, 0.755, 0.03],
      [0.235, 0.775], [0.195, 0.925, 0.01], [0.125, 0.79],
      [0.09, 0.795], [0.06, 0.9, 0.01], [0.0, 0.74],
      [-0.03, 0.62, 0.06], [-0.14, 0.42, 0.1], [-0.2, 0.17, 0.1], [-0.16, 0]],
    ears: [[[0.195, 0.925], [0.235, 0.775], [0.125, 0.79]], [[0.06, 0.9], [0.09, 0.795], [0.0, 0.74]]],
    cream: [[0.425, 0.628, 0.01], [0.345, 0.59, 0.02], [0.215, 0.515, 0.03], [0.215, 0.37, 0.06], [0.17, 0.2, 0.02],
      [0.12, 0.27], [0.11, 0.38], [0.075, 0.45], [0.1, 0.53], [0.14, 0.6, 0.03], [0.25, 0.645, 0.03], [0.33, 0.66, 0.02]],
    paws: [[0.105, 0, 0.12, 0.05], [-0.06, 0, 0.12, 0.045]],
    eye: [0.262, 0.695, 0.021],
    nose: [0.428, 0.615, 0.024],
    tail: SIT_TAIL, tailFront: true,
    lantern: { x: 0.43, y: 0, s: 0.72 },
  },
  walk: {
    body: [[-0.37, 0], [-0.3, 0], [-0.265, 0.12, 0.02], [-0.215, 0], [-0.15, 0], [-0.13, 0.18, 0.05],
      [0.1, 0.19, 0.06], [0.135, 0], [0.2, 0], [0.215, 0.12, 0.02], [0.27, 0], [0.335, 0],
      [0.315, 0.27, 0.05], [0.37, 0.4, 0.04], [0.52, 0.445, 0.03], [0.605, 0.49, 0.02], [0.48, 0.565, 0.04],
      [0.43, 0.605, 0.03], [0.41, 0.625], [0.385, 0.765, 0.01], [0.325, 0.635],
      [0.3, 0.64], [0.27, 0.745, 0.01], [0.235, 0.6],
      [0.2, 0.5, 0.05], [0.0, 0.43, 0.1], [-0.3, 0.39, 0.09], [-0.39, 0.22, 0.07]],
    ears: [[[0.385, 0.765], [0.41, 0.625], [0.325, 0.635]], [[0.27, 0.745], [0.3, 0.64], [0.235, 0.6]]],
    cream: [[0.59, 0.49, 0.01], [0.52, 0.455, 0.02], [0.375, 0.41, 0.03], [0.32, 0.28, 0.04], [0.27, 0.2],
      [0.25, 0.3], [0.28, 0.4], [0.3, 0.48, 0.02], [0.4, 0.52, 0.02], [0.5, 0.52, 0.02]],
    paws: [[-0.335, 0, 0.075, 0.045], [-0.183, 0, 0.07, 0.045], [0.167, 0, 0.07, 0.045], [0.302, 0, 0.075, 0.045]],
    eye: [0.43, 0.545, 0.02],
    nose: [0.592, 0.478, 0.024],
    tail: {
      root: [-0.3, 0.33],
      pts: [[-0.2, 0.3, 0.03], [-0.42, 0.25, 0.07], [-0.64, 0.29, 0.09], [-0.82, 0.41, 0.07], [-0.85, 0.53, 0.03],
        [-0.68, 0.51, 0.07], [-0.47, 0.43, 0.07], [-0.22, 0.41, 0.03]],
      tip: [[-0.73, 0.33, 0.02], [-0.82, 0.41, 0.07], [-0.85, 0.53, 0.03], [-0.7, 0.51, 0.03], [-0.72, 0.46], [-0.69, 0.42], [-0.72, 0.38]],
    },
    tailFront: false,
    lantern: { x: 0.53, y: 0.2, s: 0.6 }, // handle top meets her muzzle
  },
  reach: {
    body: [[0.15, 0], [0.165, 0.2, 0.03], [0.205, 0.38, 0.08], [0.165, 0.58, 0.05], [0.25, 0.785, 0.03],
      [0.315, 0.915, 0.02], [0.215, 0.93, 0.03], [0.14, 0.885, 0.03],
      [0.115, 0.885], [0.03, 1.025, 0.01], [0.035, 0.86],
      [0.0, 0.85], [-0.07, 0.97, 0.01], [-0.06, 0.79],
      [-0.085, 0.68, 0.06], [-0.17, 0.44, 0.1], [-0.21, 0.17, 0.1], [-0.16, 0]],
    ears: [[[0.03, 1.025], [0.115, 0.885], [0.035, 0.86]], [[-0.07, 0.97], [0.0, 0.85], [-0.06, 0.79]]],
    cream: [[0.305, 0.905, 0.01], [0.245, 0.8, 0.02], [0.16, 0.6, 0.03], [0.2, 0.39, 0.06], [0.16, 0.22, 0.02],
      [0.11, 0.3], [0.1, 0.42], [0.07, 0.5], [0.09, 0.62], [0.12, 0.74, 0.03], [0.2, 0.86, 0.03], [0.255, 0.9, 0.02]],
    paws: [[0.1, 0, 0.12, 0.05], [-0.06, 0, 0.12, 0.045]],
    eye: [0.19, 0.83, 0.02],
    nose: [0.305, 0.9, 0.024],
    leg: [[0.04, 0.47, 0.03], [0.15, 0.43, 0.03], [0.265, 0.585, 0.03], [0.375, 0.69, 0.03], [0.335, 0.745, 0.03], [0.22, 0.66, 0.03], [0.07, 0.55, 0.04]],
    legPaw: [[0.33, 0.645, 0.01], [0.375, 0.69, 0.03], [0.335, 0.745, 0.03], [0.295, 0.705, 0.01]],
    tail: SIT_TAIL, tailFront: true,
    lantern: { x: 0.47, y: 0, s: 0.72 },
  },
};

function buildPose(name, lanternOpts) {
  const P = POSES[name];
  if (!P) throw new Error(`createFox: unknown pose '${name}' (sit | walk | reach)`);
  const g = new THREE.Group();
  g.name = `fox-${name}`;
  const body = cutout(poly(P.body), { color: C.fox.orange, name: 'fox-body' });
  g.add(body);

  // Tail on a pivot at its root (for a wag). In front of the haunch when sitting,
  // behind the body when walking.
  const tailPivot = new THREE.Group();
  tailPivot.name = 'fox-tail-pivot';
  const [rx, ry] = P.tail.root;
  const tailPts = P.tail.pts.map(([x, y, r]) => [x - rx, y - ry, r]);
  const tail = cutout(poly(tailPts), { color: C.fox.orange, thickness: P.tailFront ? CARD_T * 0.75 : CARD_T, name: 'fox-tail' });
  tailPivot.add(tail);
  glue(tail, poly(P.tail.tip.map(([x, y, r]) => [x - rx, y - ry, r])), { color: C.fox.cream, name: 'fox-tail-tip' });
  if (P.tailFront) {
    glue(body, tailPivot, { x: rx, y: ry, shadow: true });
    tail.castShadow = true;
  } else {
    tailPivot.position.set(rx, ry, -CARD_T - 0.0015);
    body.add(tailPivot);
  }

  glue(body, poly(P.cream), { color: C.fox.cream, name: 'fox-cream' });
  for (const [tip, a, b] of P.ears) glue(body, earTip(tip, a, b), { color: C.fox.dark, name: 'fox-ear-tip' });
  for (const [x, y, w, h] of P.paws) glue(body, roundRect(w, h, 0.018), { color: C.fox.dark, x, y, name: 'fox-paw' });
  if (P.leg) {
    const leg = glue(body, poly(P.leg), { color: C.fox.orange, shadow: true, thickness: CARD_T * 0.6, name: 'fox-leg' });
    glue(leg, poly(P.legPaw), { color: C.fox.dark, name: 'fox-paw' });
  }
  const [ex, ey, er] = P.eye;
  glue(body, circle(er, { segments: 12 }), { color: C.fox.dark, x: ex, y: ey - er, name: 'fox-eye' });
  const [nx, ny, nr] = P.nose;
  glue(body, ellipse(nr, nr * 0.85, { segments: 12 }), { color: C.fox.dark, x: nx, y: ny - nr * 0.85, name: 'fox-nose' });

  let lantern = null;
  if (lanternOpts) {
    lantern = createLantern(lanternOpts);
    const L = P.lantern;
    lantern.group.scale.setScalar(L.s);
    // Just in front of everything glued on her body.
    lantern.group.position.set(L.x, L.y, CARD_T + 0.03);
    g.add(lantern.group);
  }
  return { group: g, tail: tailPivot, lantern };
}

export function createFox(opts = {}) {
  const group = new THREE.Group();
  group.name = 'fox';
  const flip = new THREE.Group();
  flip.name = 'fox-flip';
  const facing = opts.facing === -1 ? -1 : 1;
  const scale = opts.scale ?? 1;
  flip.scale.set(facing * scale, scale, scale);
  group.add(flip);

  const lanternOpts = opts.lantern ? { light: opts.light, intensity: opts.intensity, distance: opts.distance } : null;
  const poses = {};
  let glow = 0;
  const fox = {
    group, flip, poses, tail: null, lantern: null, pose: null,
    height: 0.93 * scale,
    setPose(name) {
      if (!poses[name]) {
        poses[name] = buildPose(name, lanternOpts);
        flip.add(poses[name].group);
      }
      for (const k in poses) poses[k].group.visible = k === name;
      fox.pose = name;
      fox.tail = poses[name].tail;
      fox.lantern = poses[name].lantern;
      fox.setGlow(glow);
      return fox;
    },
    setGlow(g) {
      glow = g;
      for (const k in poses) if (poses[k].lantern) poses[k].lantern.setGlow(k === fox.pose ? g : 0);
    },
  };
  fox.setPose(opts.pose ?? 'sit');
  return fox;
}
