// Paper toolkit bench: the real book + stage modules, one spread opened to
// ?open=<0..1>, decorated with every paper.js helper, plus a gallery of all
// shapes standing on the desk behind the book. Reference for scene authors.
//
// URL: dev/paper.html?open=0.6&spread=0&cam=front|low|side|top|gallery|fox&night=0|1&glow=0..1&t=<s>&ui=0
// window.__paper = { ready, set({open, night, glow, cam, t}), check(), render() }
import * as THREE from 'three';
import { getFilmState } from '../src/timeline.js';
import { clamp01 } from '../src/util.js';
import { createStage } from '../src/stage.js';
import { createBook } from '../src/book.js';
import { LEAF_T, PAGE_W } from '../src/constants.js';
import * as P from '../src/paper.js';
import { createFox, createLantern } from '../src/characters.js';

const C = P.PALETTE;
const params = new URLSearchParams(location.search);
const num = (k, d) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d; };

const opts = {
  open: clamp01(num('open', 1)),
  spread: Math.max(0, Math.min(4, Math.round(num('spread', 0)))),
  night: num('night', 0),
  glow: num('glow', 1),
  t: num('t', 0),
  cam: params.get('cam') || 'front',
};

// --- renderer: same settings as src/main.js ---
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const ctx = { renderer, scene, canvas, overlay: null, params };
const stage = createStage(ctx);
scene.add(stage.group);
const book = createBook(ctx);
scene.add(book.group);
const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);

// ---------------------------------------------------------------------------
// The demo "scene" (written exactly like a film scene would be)
// ---------------------------------------------------------------------------
function createDemoScene() {
  const pop = P.createPopup();

  // --- page prints ---
  pop.tint('left', C.paper.shade);
  pop.tint('right', C.paper.shade);
  pop.print('left', P.pagePrint(P.hill(2.4, 0.9), { color: C.forest.moss, x: -1.5, z: 1.9, layer: 1 }));
  pop.print('left', P.pagePrint(P.ellipse(0.55, 0.3), { color: C.sea.aqua, x: -2.0, z: 0.75, layer: 2 }));
  pop.print('right', P.pagePrint(P.grass(2.6, 0.35, { seed: 4 }), { color: C.forest.moss, x: 1.5, z: 1.88, layer: 1 }));
  pop.print('right', P.pagePrint(P.cloud(1.0, 0.4), { color: C.mountain.pink, x: 2.0, z: -1.2, layer: 1 }));
  for (let i = 0; i < 5; i++) {
    pop.print('right', P.pagePrint(P.star(0.07), { color: C.night.gold, x: 0.55 + i * 0.5, z: -1.55 + (i % 2) * 0.18, layer: 2, rot: i * 0.4 }));
  }

  // --- standing flaps on the left page: different yaw / foldToward / delay ---
  const pineShape = P.pine(0.8, 1.45, { seed: 2 });
  const pineA = P.cutout(pineShape, { color: C.forest.mid, name: 'pine' });
  // tall pieces at the back fold toward the FRONT so they stay on the page when closed
  pop.stand('left', pineA, { x: -2.35, z: -1.2, foldToward: 'front', delay: 0 });
  const pineB = P.cutout(pineShape, { color: C.forest.deep, name: 'pine-2' });   // same Shape: shared geometry
  pop.stand('left', pineB, { x: -1.75, z: -1.5, foldToward: 'front', delay: 0.05 });
  const tree = P.cutout(P.roundTree(0.9, 1.2, { seed: 5 }), { color: C.forest.light, back: C.forest.deep, name: 'round tree' });
  for (const [x, y] of [[-0.2, 0.75], [0.15, 0.9], [0.05, 0.6]]) P.glue(tree, P.circle(0.045), { color: C.fox.orange, x, y });
  pop.stand('left', tree, { x: -1.0, z: -0.95, yaw: 0.25, foldToward: 'front', delay: 0.2 });

  const houseShape = P.house(0.8, 0.85, { chimney: true, windows: true });
  const house = P.cutout(houseShape, { color: C.village.terracotta, name: 'house' });
  P.glue(house, P.roundRect(houseShape.door.w, houseShape.door.h, 0.03), { color: C.village.slate, x: houseShape.door.x, y: 0 });
  // window glow: panes glued BEHIND the holes (on a card behind the house)
  const backing = P.cutout(P.roundRect(0.6, 0.5), { color: C.night.lantern, emissive: true, key: 'demo-windows', glow: 0, thickness: 0.006, shadow: false });
  backing.position.set(0, 0.08, -0.008);
  house.add(backing);
  pop.stand('left', house, { x: -2.1, z: 0.2, yaw: 0.35, foldToward: 'front', delay: 0.15 });

  const bushM = P.cutout(P.bush(0.7, 0.35, { seed: 8 }), { color: C.forest.moss, name: 'bush' });
  pop.stand('left', bushM, { x: -1.0, z: 1.05, yaw: -0.3, delay: 0.25 });
  const cloudM = P.cutout(P.cloud(0.8, 0.35), { color: C.paper.edge, name: 'cloud (yaw 90)' });
  pop.stand('left', cloudM, { x: -2.35, z: 1.0, yaw: Math.PI / 2, delay: 0.2, maxAngle: Math.PI / 2 });

  // --- V-folds across the gutter ---
  const W = 1.3;
  const mtn = P.translate(P.ridge(W, 1.15, { peaks: 2, jag: 0.5, seed: 4 }), W / 2 + 0.02, 0);
  const vBack = pop.vfold({ z: -0.55, angle: 0.95, direction: 'back', shape: mtn, color: C.mountain.lavender });
  const caps = P.snowCap(mtn, 0.78);
  for (const wing of [vBack.left, vBack.right]) for (const s of caps) P.glue(wing.card, s, { color: C.mountain.snow });
  const sea = P.translate(P.waves(1.1, 0.45, { count: 3 }), 0.57, 0);
  const vFront = pop.vfold({ z: 0.55, angle: 0.7, direction: 'front', shape: sea, color: C.sea.teal });
  for (const wing of [vFront.left, vFront.right]) P.glue(wing.card, P.translate(P.waves(1.0, 0.16, { count: 3 }), 0.57, 0), { color: C.sea.foam, y: 0.22 });
  // something perched on a V-fold wing rides with it
  const flag = P.cutout(P.poly([[0, 0], [0.02, 0], [0.02, 0.3], [0.17, 0.25], [0.02, 0.2]]), { color: C.sea.red, name: 'flag' });
  flag.position.set(0.25, 0.42, 0.0);
  vFront.right.add(flag);

  // --- characters on the right page ---
  const sit = createFox({ pose: 'sit' });
  pop.stand('right', sit.group, { x: 1.35, z: 0.05, delay: 0.12 });
  const walk = createFox({ pose: 'walk', facing: -1, lantern: true, light: false });
  pop.stand('right', walk.group, { x: 1.9, z: 1.2, delay: 0.2 });
  const reach = createFox({ pose: 'reach' });
  pop.stand('right', reach.group, { x: 2.35, z: -0.8, delay: 0.18 });
  const lampOff = createLantern({ light: false });
  pop.stand('right', lampOff.group, { x: 0.65, z: 1.35, delay: 0.3 });
  const lampOn = createLantern();
  pop.stand('right', lampOn.group, { x: 2.65, z: 0.5, delay: 0.3 });
  const windowsMat = backing.material[0];

  function update(state, spread) {
    pop.update(spread);
    const t = state.t;
    sit.tail.rotation.z = P.sway(t, { freq: 0.4, amp: 0.06 });
    walk.tail.rotation.z = P.sway(t, { freq: 0.3, amp: 0.05, phase: 0.3 });
    lampOn.setGlow(state.glow * P.flicker(t, 1));
    lampOff.setGlow(0);
    walk.setGlow(state.glow * P.flicker(t, 2));
    windowsMat.emissiveIntensity = state.night * 1.2;
  }
  return { left: pop.left, right: pop.right, center: pop.center, update, pop, vfolds: [vBack, vFront] };
}

// ---------------------------------------------------------------------------
// Gallery of every shape helper, standing on the desk behind the book
// ---------------------------------------------------------------------------
function createGallery() {
  const g = new THREE.Group();
  g.name = 'gallery';
  const row1 = [
    ['bush', P.bush(0.8, 0.4), C.forest.moss], ['grass', P.grass(0.9, 0.35), C.forest.light],
    ['star', P.star(0.25), C.night.gold], ['crescent', P.crescent(0.28), C.mountain.moon],
    ['circle', P.circle(0.22), C.sea.red], ['roundRect', P.roundRect(0.5, 0.4, 0.08), C.village.mustard],
    ['waves', P.waves(1.0, 0.4), C.sea.teal], ['cloud', P.cloud(0.9, 0.4), C.paper.edge],
  ];
  const row2 = [
    ['pine', P.pine(0.7, 1.3), C.forest.mid], ['roundTree', P.roundTree(0.8, 1.1), C.forest.light],
    ['hill', P.hill(1.2, 0.6), C.forest.moss], ['ridge jag', P.ridge(1.3, 1.0, { jag: 1, seed: 3 }), C.mountain.slate],
    ['ridge soft', P.ridge(1.3, 0.8, { jag: 0, seed: 2 }), C.mountain.lavender], ['house', P.house(0.7, 0.8, { windows: true, chimney: true }), C.village.blue],
    ['ellipse', P.ellipse(0.35, 0.2), C.village.paleBlue], ['poly', P.poly([[-0.3, 0, 0.05], [0.3, 0, 0.05], [0.1, 0.6, 0.05], [-0.1, 0.45]]), C.night.indigo],
  ];
  const place = (row, z, x0, dx) => row.forEach(([name, shape, color], i) => {
    const m = P.cutout(shape, { color, name });
    m.position.set(x0 + i * dx, 0, z);
    g.add(m);
  });
  place(row1, -2.75, -5.0, 1.42);
  place(row2, -3.9, -5.4, 1.55);
  return g;
}

// ---------------------------------------------------------------------------
const demo = createDemoScene();
const anchors = book.getSpreadAnchors(opts.spread);
anchors.left.add(demo.left);
anchors.right.add(demo.right);
anchors.center.add(demo.center);
scene.add(createGallery());

const baseState = getFilmState(12);
function makeState() {
  const k = opts.spread;
  const leafTurn = [0, 1, 2, 3, 4].map((j) => (j < k ? 1 : j === k ? opts.open : 0));
  const spreadOpen = leafTurn.map((v, j) => clamp01(v - (j + 1 < 5 ? leafTurn[j + 1] : 0)));
  return { ...baseState, t: opts.t, leafTurn, spreadOpen, activeSpread: k, night: opts.night, glow: opts.glow };
}

const CAMS = {
  front: [[1.2, 7.8, 9.6], [0, 0.3, -0.9]],
  low: [[-0.4, 1.7, 6.8], [0, 0.45, -0.3]],
  side: [[7.0, 1.7, 1.2], [0, 0.45, 0]],
  top: [[0, 10.5, 0.6], [0, 0, -0.6]],
  gallery: [[0, 3.4, 2.4], [0, 0.4, -3.3]],
  fox: [[2.6, 1.7, 4.9], [1.75, 0.45, 0.3]],
};
let orbit = { yaw: 0, pitch: 0 };
function placeCamera() {
  const [pos, tgt] = CAMS[opts.cam] ?? CAMS.front;
  const target = new THREE.Vector3(...tgt);
  const off = new THREE.Vector3(...pos).sub(target);
  const sph = new THREE.Spherical().setFromVector3(off);
  sph.theta += orbit.yaw;
  sph.phi = Math.min(Math.PI / 2 - 0.02, Math.max(0.05, sph.phi + orbit.pitch));
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
  camera.lookAt(target);
}

function render() {
  const state = makeState();
  stage.update(state);
  book.update(state);
  const k = opts.spread, open = state.spreadOpen[k];
  const vis = open > 0.001;
  demo.left.visible = demo.right.visible = demo.center.visible = vis;
  if (vis) demo.update(state, { index: k, open, theta: Math.PI * open, time: opts.t });
  placeCamera();
  renderer.render(scene, camera);
}

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

/**
 * V-fold numeric check: for theta in [0, PI] (181 samples) pose the real book
 * and the demo, then measure in each V-fold's center frame
 *   crease: distance between the two wings' crease points (u = 0, v in [0, 1.5])
 *   hinge:  distance of each wing's hinge points (v = 0, u in [0, 1.5]) from
 *           its ideal page plane (through the center origin, contract frame)
 *   inside: smallest signed distance of wing points to the OTHER page (>= 0: no crossing)
 *   actual: distance of hinge points from the real page surfaces (world space;
 *           expected <= 2*LEAF_T: the gutter height step the skirt covers)
 *   ortho:  max |frame orthonormality error|
 */
function check() {
  const saved = opts.open;
  const res = { samples: 0, crease: 0, hinge: 0, inside: Infinity, actual: 0, ortho: 0, maxAllowedActual: 2 * LEAF_T };
  const p = new THREE.Vector3(), q = new THREE.Vector3(), wp = new THREE.Vector3(), n = new THREE.Vector3(), o = new THREE.Vector3();
  const e = new THREE.Matrix4();
  for (let i = 0; i <= 180; i++) {
    opts.open = i / 180;
    const theta = Math.PI * opts.open;
    // pose without the visibility cut-off (check theta = 0 too)
    const state = makeState();
    book.update(state);
    demo.update(state, { index: opts.spread, open: opts.open, theta, time: 0 });
    scene.updateMatrixWorld(true);
    res.samples++;
    const a = Math.sin(theta / 2), b = Math.cos(theta / 2);
    const NR = new THREE.Vector3(-b, a, 0), NL = new THREE.Vector3(b, a, 0);
    for (const v of demo.vfolds) {
      for (let s = 0; s <= 10; s++) {
        const vv = (1.5 * s) / 10;
        p.set(0, vv, 0).applyMatrix4(v.right.matrix);
        q.set(0, vv, 0).applyMatrix4(v.left.matrix);
        res.crease = Math.max(res.crease, p.distanceTo(q));
        const uu = (1.5 * s) / 10;
        for (const [w, N, Nother, anchor] of [[v.right, NR, NL, anchors.right], [v.left, NL, NR, anchors.left]]) {
          p.set(uu, 0, 0).applyMatrix4(w.matrix);
          res.hinge = Math.max(res.hinge, Math.abs(N.dot(p)));
          // whole wing (u, v in [0, 1.5]) stays on the open side of the other page
          q.set(uu, vv, 0).applyMatrix4(w.matrix);
          res.inside = Math.min(res.inside, Nother.dot(q));
          // real page surface: plane through the anchor origin with normal = anchor +Y (world)
          if (theta > 0.5) {
            wp.set(uu, 0, 0).applyMatrix4(w.matrixWorld);
            anchor.getWorldPosition(o);
            n.setFromMatrixColumn(anchor.matrixWorld, 1).normalize();
            res.actual = Math.max(res.actual, Math.abs(n.dot(wp.sub(o))));
          }
        }
        // orthonormality of each wing basis (|det| = 1, unit axes)
        for (const w of [v.left, v.right]) {
          e.copy(w.matrix);
          const el = e.elements;
          const len = (c) => Math.hypot(el[c * 4], el[c * 4 + 1], el[c * 4 + 2]);
          const dot = (c, d) => el[c * 4] * el[d * 4] + el[c * 4 + 1] * el[d * 4 + 1] + el[c * 4 + 2] * el[d * 4 + 2];
          res.ortho = Math.max(res.ortho, Math.abs(len(0) - 1), Math.abs(len(1) - 1), Math.abs(len(2) - 1),
            Math.abs(dot(0, 1)), Math.abs(dot(0, 2)), Math.abs(dot(1, 2)));
        }
      }
    }
  }
  opts.open = saved;
  render();
  res.pass = res.crease < 1e-3 && res.hinge < 1e-3 && res.inside > -1e-6 && res.ortho < 1e-6 && res.actual <= res.maxAllowedActual + 1e-3;
  return res;
}

// --- UI ---
const panel = document.getElementById('panel');
if (params.get('ui') === '0') panel.classList.add('hidden');
const openEl = document.getElementById('open'), openV = document.getElementById('openv');
const nightEl = document.getElementById('night'), glowEl = document.getElementById('glow');
openEl.value = opts.open; openV.textContent = opts.open.toFixed(2);
nightEl.checked = opts.night > 0.5; glowEl.value = opts.glow;
openEl.addEventListener('input', () => { opts.open = +openEl.value; openV.textContent = opts.open.toFixed(2); render(); });
nightEl.addEventListener('change', () => { opts.night = nightEl.checked ? 1 : 0; render(); });
glowEl.addEventListener('input', () => { opts.glow = +glowEl.value; render(); });
for (const b of panel.querySelectorAll('button[data-cam]')) b.addEventListener('click', () => { opts.cam = b.dataset.cam; orbit = { yaw: 0, pitch: 0 }; render(); });
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag[0]) * 0.006;
  orbit.pitch -= (e.clientY - drag[1]) * 0.006;
  drag = [e.clientX, e.clientY];
  render();
});
canvas.addEventListener('pointerup', () => { drag = null; });
addEventListener('resize', () => { resize(); render(); });

resize();
render();
window.__paper = {
  ready: new Promise((r) => requestAnimationFrame(() => r(true))),
  set(o) { Object.assign(opts, o); if (o.cam) orbit = { yaw: 0, pitch: 0 }; openEl.value = opts.open; openV.textContent = (+opts.open).toFixed(2); render(); },
  check,
  render,
  renderer,
  PAGE_W,
};
