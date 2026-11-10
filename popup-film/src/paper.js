/**
 * paper.js — the paper look of "The Little Paper Boat": palettes, canvas painting helpers
 * (fibre grain, die-cut borders), paper materials, printed cut-out cards and folded paper models.
 * Everything is procedural and deterministic (seeded); nothing here allocates per frame.
 *
 * Exports (each with a short usage example):
 *
 *   PAPER, PALETTES — colour constants as '#rrggbb' strings.
 *     ctx.fillStyle = PALETTES.forest.fox;
 *     const { navy, foam } = PALETTES.sea;
 *     paperMaterial({ color: PAPER.cream });
 *
 *   makeCanvas(w, h) -> { canvas, ctx } — 2D canvas (CPU-backed, cheap to read back).
 *     const { canvas, ctx } = makeCanvas(512, 512);
 *     ctx.fillStyle = PALETTES.city.brick;
 *     ctx.fillRect(40, 40, 432, 432);
 *
 *   addGrain(ctx, w, h, { amount=0.06, seed=1 }) — paper fibres + mottling, only where alpha > 0.
 *     const { canvas, ctx } = makeCanvas(256, 256);
 *     drawMyArt(ctx);
 *     addGrain(ctx, 256, 256, { amount: 0.05, seed: 7 });
 *
 *   dieCut(canvas, { margin=8, color=PAPER.white, edge=true }) -> new canvas — the art on a die-cut
 *   paper border grown `margin` px around its silhouette (leave >= margin px of empty padding).
 *     const cut = dieCut(canvas, { margin: 10 });
 *     const cream = dieCut(canvas, { margin: 6, color: PAPER.cream, edge: false });
 *     scene.add(card({ canvas: cut, width: 1, height: 1 }));
 *
 *   paint(w, h, draw, { grain=0.05, dieCut=8, seed=1 }) -> canvas — make, draw, die-cut, grain.
 *     const tree = paint(384, 512, (ctx, w, h) => { ctx.fillStyle = PALETTES.forest.mid;
 *       ctx.beginPath(); ctx.moveTo(w / 2, 20); ctx.lineTo(w - 30, h - 30); ctx.lineTo(30, h - 30); ctx.fill(); },
 *       { seed: 3 });
 *
 *   page(draw, { seed=1, tint }) -> 768x1024 page-art canvas: paper base, your art, grain + print mottle.
 *     const rightArt = page((ctx, w, h) => {
 *       ctx.fillStyle = PALETTES.sea.teal; ctx.fillRect(0, h * 0.6, w, h * 0.4);
 *     }, { seed: 21 });
 *
 *   texture(canvas) -> THREE.CanvasTexture (sRGB, anisotropy 8, trilinear mipmaps). Live: redraw the
 *   canvas and set `tex.needsUpdate = true`. For alpha-cut art prefer cutoutTexture (no dark fringes).
 *     const tex = texture(page(drawSea));
 *     const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), paperMaterial({ map: tex }));
 *     mesh.receiveShadow = true;
 *
 *   cutoutTexture(canvas) -> THREE.Texture — snapshot of `canvas` whose transparent texels carry the
 *   colour of the nearest opaque texel, so filtering/mipmaps never bleed black into cut edges.
 *     const tex = cutoutTexture(paint(256, 256, drawStar));
 *     const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5 });
 *     const star = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), mat);
 *
 *   paperMaterial({ color, map, roughness=0.92, ...extra }) -> MeshStandardMaterial (metalness 0).
 *   Without a map (and without extra options) the material is cached and SHARED per colour: clone
 *   it before mutating.
 *     const mat = paperMaterial({ color: PALETTES.sky.peach });
 *     const strip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.003, 0.2), mat);
 *     const art = paperMaterial({ map: texture(canvas), side: THREE.DoubleSide });
 *
 *   card({ canvas, width, height, back=PAPER.cream, anchor='bottom-center', alphaTest=0.5 })
 *   -> THREE.Group: printed face toward +Z (z = +0.0015), plain back face toward -Z (z = -0.0015),
 *   both cut to the canvas alpha (shadows too). anchor: 'bottom-center'|'bottom-left'|
 *   'bottom-right'|'center'. group.userData = { front, back, texture } (meshes + shared texture).
 *     const tree = card({ canvas: paint(384, 512, drawTree), width: 0.9, height: 1.2 });
 *     mech.mount.add(tree);
 *     tree.rotation.y = 0.1;
 *
 *   splitCard({ canvas, width, height, back=PAPER.cream, alphaTest=0.5 }) -> { left, right } — one
 *   artwork for a V-fold: left = u in [0,.5] on x in [-w/2,0], right = u in [.5,1] on x in [0,w/2],
 *   bottom edge at y = 0, origin at the bottom of the seam. Both halves share one texture.
 *     const { left, right } = splitCard({ canvas: panorama, width: 2.4, height: 1.2 });
 *     fold.left.add(left);
 *     fold.right.add(right);
 *
 *   boat({ color=PAPER.white, scale=1 }) -> THREE.Group — folded newspaper boat, origin at the
 *   waterline centre, bow +X, 0.6 long, keel at y = -0.05, peak at y = +0.30 (x scale).
 *     const b = boat({ scale: 0.5 });
 *     b.position.set(1.2, 0.01, 0.4);
 *     b.rotation.z = Math.sin(t * 2) * 0.05;
 *
 *   crane({ color=PAPER.white, scale=1 }) -> THREE.Group — origami crane, origin at body centre,
 *   head toward +X, wingspan 0.8 (x scale). group.userData.setFlap(v), v in [-1, 1] (pure):
 *   -1 = wings fully down, 0 = slight dihedral, 1 = wings fully up.
 *     const c = crane({ color: PALETTES.sky.dawn, scale: 0.6 });
 *     c.userData.setFlap(Math.sin(t * 6));
 *     group.add(c);
 */
import * as THREE from 'three';
import { mulberry32 } from './util/rng.js';

// ----------------------------------------------------------------------------------------------
// Colours
// ----------------------------------------------------------------------------------------------

export const PAPER = { white: '#fbf7ee', cream: '#f3ead8', ink: '#2b2622' };

export const PALETTES = {
  forest: {
    deep: '#2c4a36', // pine shadow
    mid: '#4f7d4b', // leaf
    light: '#8db36b', // sunlit leaf
    moss: '#b0b763',
    bark: '#6f4c35',
    fox: '#d8742c',
    stream: '#6aa7bd',
    mushroom: '#c4473b',
  },
  sea: {
    navy: '#1f3556',
    teal: '#2f7d84',
    wave: '#5aa3b4',
    foam: '#eef2e8',
    sand: '#e5cd9b',
    lighthouse: '#c7463c',
    coral: '#ef8a6a',
  },
  city: {
    night: '#232650', // indigo night
    dusk: '#3b3a6e',
    slate: '#56607a',
    brick: '#a5543f',
    lantern: '#f2a23c',
    window: '#ffd873',
    moon: '#f5ecd0',
  },
  sky: {
    dawn: '#f2b2b0', // dawn pink
    peach: '#f8c9a0',
    sun: '#f6c24f',
    blue: '#9fc8e3',
    cloud: '#fdf9f2',
    balloonRed: '#d6544a',
    balloonTeal: '#3e9695',
  },
};

function hexToRgb(hex) {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace);
  const out = {};
  c.getRGB(out, THREE.SRGBColorSpace);
  return [out.r * 255, out.g * 255, out.b * 255];
}

// ----------------------------------------------------------------------------------------------
// Canvas helpers
// ----------------------------------------------------------------------------------------------

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  // CPU-backed: grain/die-cut read pixels back, which is slow on GPU canvases.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, ctx };
}

const TILE = 256;
const TMASK = TILE - 1;
let fibreTile = null;

/** Tileable 256² field (zero-mean, ~unit range) of fine paper tooth plus curly fibres. Built once. */
function getFibreTile() {
  if (fibreTile) return fibreTile;
  const rnd = mulberry32(0x5eed1e);
  const raw = new Float32Array(TILE * TILE);
  for (let i = 0; i < raw.length; i++) raw[i] = (rnd() + rnd() - 1) * 0.7;
  const splat = (x, y, s) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const x0 = ix & TMASK;
    const x1 = (ix + 1) & TMASK;
    const y0 = (iy & TMASK) * TILE;
    const y1 = ((iy + 1) & TMASK) * TILE;
    raw[y0 + x0] += s * (1 - fx) * (1 - fy);
    raw[y0 + x1] += s * fx * (1 - fy);
    raw[y1 + x0] += s * (1 - fx) * fy;
    raw[y1 + x1] += s * fx * fy;
  };
  for (let f = 0; f < 1500; f++) {
    let x = rnd() * TILE;
    let y = rnd() * TILE;
    let a = rnd() * Math.PI * 2;
    const len = 6 + rnd() * rnd() * 34;
    const curl = (rnd() - 0.5) * 0.16;
    const s = (rnd() < 0.65 ? 1 : -1) * (0.5 + rnd() * 0.9);
    for (let k = 0; k < len; k++) {
      splat(x, y, s * Math.sin((Math.PI * (k + 0.5)) / len));
      x += Math.cos(a) * 0.75;
      y += Math.sin(a) * 0.75;
      a += curl;
    }
  }
  // Soften once (3x3 binomial, wrapping) so speckle reads as tooth rather than digital noise.
  const tile = new Float32Array(TILE * TILE);
  let sum = 0;
  let sum2 = 0;
  for (let y = 0; y < TILE; y++) {
    const ym = ((y - 1) & TMASK) * TILE;
    const y0 = y * TILE;
    const yp = ((y + 1) & TMASK) * TILE;
    for (let x = 0; x < TILE; x++) {
      const xm = (x - 1) & TMASK;
      const xp = (x + 1) & TMASK;
      const v =
        (raw[ym + xm] + raw[ym + xp] + raw[yp + xm] + raw[yp + xp] +
          2 * (raw[ym + x] + raw[yp + x] + raw[y0 + xm] + raw[y0 + xp]) +
          4 * raw[y0 + x]) / 16;
      tile[y0 + x] = v;
      sum += v;
      sum2 += v * v;
    }
  }
  const n = TILE * TILE;
  const mean = sum / n;
  const std = Math.sqrt(sum2 / n - mean * mean);
  for (let i = 0; i < n; i++) tile[i] = (tile[i] - mean) / (2.2 * std);
  fibreTile = tile;
  return tile;
}

/**
 * Adds paper grain to everything already drawn with alpha > 0: fine tooth and fibres from a shared
 * tileable field (seed picks the offset) plus seeded low-frequency mottling. `mottle` scales the
 * blotchy part (page() uses more for an uneven printed look). ~3-6 ms for 512² on a CPU canvas.
 */
export function addGrain(ctx, w, h, { amount = 0.06, seed = 1, mottle = 1 } = {}) {
  if (!(amount > 0)) return;
  w = Math.round(w);
  h = Math.round(h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const tile = getFibreTile();
  const rnd = mulberry32((seed * 0x9e3779b1) ^ 0x2545f491);
  const ox = Math.floor(rnd() * TILE);
  const oy = Math.floor(rnd() * TILE);

  // Mottle: value noise on a 32 px lattice; two octaves (coarse 128 px blobs + per-node detail).
  const CELL = 32;
  const gw = Math.ceil(w / CELL) + 2;
  const gh = Math.ceil(h / CELL) + 2;
  const cw = Math.ceil(gw / 4) + 2;
  const coarse = new Float32Array(cw * (Math.ceil(gh / 4) + 2));
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd() * 2 - 1;
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const cy = Math.floor(gy / 4);
    let ty = gy / 4 - cy;
    ty = ty * ty * (3 - 2 * ty);
    for (let gx = 0; gx < gw; gx++) {
      const cx = Math.floor(gx / 4);
      let tx = gx / 4 - cx;
      tx = tx * tx * (3 - 2 * tx);
      const a = coarse[cy * cw + cx] + (coarse[cy * cw + cx + 1] - coarse[cy * cw + cx]) * tx;
      const b = coarse[(cy + 1) * cw + cx] + (coarse[(cy + 1) * cw + cx + 1] - coarse[(cy + 1) * cw + cx]) * tx;
      grid[gy * gw + gx] = (a + (b - a) * ty) * 0.75 + (rnd() * 2 - 1) * 0.35;
    }
  }

  const k = amount * 255;
  const km = 0.55 * mottle;
  const inv = 1 / CELL;
  const row = new Float32Array(gw);
  for (let y = 0; y < h; y++) {
    const gyf = y * inv;
    const gy = Math.floor(gyf);
    const ty = gyf - gy;
    const r0 = gy * gw;
    const r1 = r0 + gw;
    for (let gx = 0; gx < gw; gx++) row[gx] = (grid[r0 + gx] + (grid[r1 + gx] - grid[r0 + gx]) * ty) * km;
    const trow = ((y + oy) & TMASK) * TILE;
    let p = y * w * 4;
    for (let x = 0; x < w; x++, p += 4) {
      if (d[p + 3] === 0) continue;
      const gxf = x * inv;
      const gx = gxf | 0;
      const m = row[gx] + (row[gx + 1] - row[gx]) * (gxf - gx);
      const n = (tile[trow + ((x + ox) & TMASK)] + m) * k;
      // Darker fibres read warm, lighter ones a touch cooler, like real stock.
      d[p] += n * 0.92;
      d[p + 1] += n;
      d[p + 2] += n * 1.12;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const FAR = 1e20;

/**
 * Exact squared Euclidean distance from every cell of a W×H grid to the nearest cell with
 * inside[i] = 1 (Felzenszwalb & Huttenlocher), optionally with that cell's index (-1 if none).
 */
function distanceField(inside, W, H, wantNearest) {
  const n = W * H;
  const g = new Float64Array(n);
  const ny = wantNearest ? new Int32Array(n) : null;
  for (let x = 0; x < W; x++) {
    let last = -1;
    for (let y = 0, i = x; y < H; y++, i += W) {
      if (inside[i]) last = y;
      g[i] = last < 0 ? FAR : (y - last) * (y - last);
      if (ny) ny[i] = last;
    }
    let next = -1;
    for (let y = H - 1, i = x + (H - 1) * W; y >= 0; y--, i -= W) {
      if (inside[i]) next = y;
      if (next >= 0 && (next - y) * (next - y) < g[i]) {
        g[i] = (next - y) * (next - y);
        if (ny) ny[i] = next;
      }
    }
  }
  const d2 = new Float32Array(n);
  const nearest = wantNearest ? new Int32Array(n) : null;
  const f = new Float64Array(W);
  const v = new Int32Array(W);
  const z = new Float64Array(W + 1);
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) f[x] = g[r + x];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < W; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p));
        if (s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < W; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d2[r + q] = (q - p) * (q - p) + f[p];
      if (nearest) nearest[r + q] = f[p] >= FAR ? -1 : ny[r + p] * W + p;
    }
  }
  return { d2, nearest };
}

function context2d(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

export function dieCut(canvas, { margin = 8, color = PAPER.white, edge = true } = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const { canvas: out, ctx } = makeCanvas(w, h);
  if (margin > 0) {
    const src = context2d(canvas).getImageData(0, 0, w, h).data;
    // Bounding box of the silhouette (alpha >= ~10%), grown by the margin.
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0, p = 3; y < h; y++) {
      for (let x = 0; x < w; x++, p += 4) {
        if (src[p] >= 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) {
      const pad = Math.ceil(margin) + 2;
      x0 = Math.max(0, x0 - pad);
      y0 = Math.max(0, y0 - pad);
      x1 = Math.min(w - 1, x1 + pad);
      y1 = Math.min(h - 1, y1 + pad);
      const W = x1 - x0 + 1;
      const H = y1 - y0 + 1;
      const inside = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0, p = ((y + y0) * w + x0) * 4 + 3; x < W; x++, p += 4) inside[y * W + x] = src[p] >= 24 ? 1 : 0;
      }
      const { d2 } = distanceField(inside, W, H, false);
      const [pr, pg, pb] = hexToRgb(color);
      const er = pr * 0.86;
      const eg = pg * 0.84;
      const eb = pb * 0.8;
      const ew = Math.min(2.5, Math.max(1, margin * 0.17));
      const img = ctx.createImageData(W, H);
      const o = img.data;
      for (let i = 0, p = 0; i < W * H; i++, p += 4) {
        const dist = Math.sqrt(d2[i]);
        const cov = margin + 0.5 - dist;
        if (cov <= 0) continue;
        let e = edge ? dist - (margin - ew) + 0.5 : 0;
        e = e < 0 ? 0 : e > 1 ? 1 : e;
        o[p] = pr + (er - pr) * e;
        o[p + 1] = pg + (eg - pg) * e;
        o[p + 2] = pb + (eb - pb) * e;
        o[p + 3] = cov >= 1 ? 255 : cov * 255;
      }
      ctx.putImageData(img, x0, y0);
    }
  }
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function paint(w, h, draw, { grain = 0.05, dieCut: margin = 8, seed = 1 } = {}) {
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx, canvas.width, canvas.height);
  // Die-cut first so the paper border gets the same grain as the art.
  const out = margin > 0 ? dieCut(canvas, { margin }) : canvas;
  if (grain > 0) addGrain(context2d(out), out.width, out.height, { amount: grain, seed });
  return out;
}

const PAGE_SIZE = { w: 768, h: 1024 };

export function page(draw, { seed = 1, tint } = {}) {
  const { w, h } = PAGE_SIZE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = tint ?? PAPER.white;
  ctx.fillRect(0, 0, w, h);
  draw?.(ctx, w, h);
  addGrain(ctx, w, h, { amount: 0.045, seed, mottle: 1.6 });
  return canvas;
}

// ----------------------------------------------------------------------------------------------
// Textures & materials
// ----------------------------------------------------------------------------------------------

function configureTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function texture(canvas) {
  return configureTexture(new THREE.CanvasTexture(canvas));
}

export function cutoutTexture(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const img = context2d(canvas).getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const solid = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    solid[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
    any ||= solid[i] === 1;
  }
  if (any) {
    const { nearest } = distanceField(solid, w, h, true);
    for (let i = 0; i < n; i++) {
      if (solid[i]) continue;
      const p = i * 4;
      const q = nearest[i] * 4;
      d[p] = d[q];
      d[p + 1] = d[q + 1];
      d[p + 2] = d[q + 2];
    }
  }
  const tex = configureTexture(new THREE.Texture(img));
  tex.userData.source = canvas;
  return tex;
}

const materialCache = new Map();

export function paperMaterial({ color, map, roughness = 0.92, ...extra } = {}) {
  const shared = !map && Object.keys(extra).length === 0;
  const key = shared ? `${new THREE.Color(color ?? PAPER.white).getHexString()}|${roughness}` : null;
  if (shared && materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial({
    color: color ?? (map ? '#ffffff' : PAPER.white),
    map: map ?? null,
    roughness,
    metalness: 0,
    ...extra,
  });
  if (shared) materialCache.set(key, mat);
  return mat;
}

// ----------------------------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------------------------

const HALF_T = 0.0015; // half the gap between a card's printed face and its back face

const ANCHORS = {
  'bottom-center': [0, 0.5],
  'bottom-left': [0.5, 0.5],
  'bottom-right': [-0.5, 0.5],
  center: [0, 0],
};

/** Back faces take only the silhouette (alpha) from the art map and their colour from `color`. */
function alphaOnlyMap(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    '#ifdef USE_MAP\n\tdiffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif',
  );
}

function buildCard(geometry, map, backColor, alphaTest) {
  const front = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map, alphaTest, roughness: 0.92, metalness: 0 }),
  );
  const backMat = new THREE.MeshStandardMaterial({
    color: backColor,
    map,
    alphaTest,
    roughness: 0.95,
    metalness: 0,
    side: THREE.BackSide,
  });
  backMat.onBeforeCompile = alphaOnlyMap;
  backMat.customProgramCacheKey = () => 'paper-card-back';
  const back = new THREE.Mesh(geometry, backMat);
  front.position.z = HALF_T;
  back.position.z = -HALF_T;
  const group = new THREE.Group();
  for (const mesh of [front, back]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData = { front, back, texture: map };
  return group;
}

export function card({ canvas, width, height, back = PAPER.cream, anchor = 'bottom-center', alphaTest = 0.5 }) {
  const offset = ANCHORS[anchor];
  if (!offset) throw new Error(`paper.card: unknown anchor "${anchor}"`);
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(offset[0] * width, offset[1] * height, 0);
  return buildCard(geometry, cutoutTexture(canvas), back, alphaTest);
}

export function splitCard({ canvas, width, height, back = PAPER.cream, alphaTest = 0.5 }) {
  const map = cutoutTexture(canvas);
  const half = (side) => {
    const geometry = new THREE.PlaneGeometry(width / 2, height);
    geometry.translate((side * width) / 4, height / 2, 0);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (side < 0 ? 0 : 0.5) + uv.getX(i) * 0.5);
    return buildCard(geometry, map, back, alphaTest);
  };
  return { left: half(-1), right: half(1) };
}

// ----------------------------------------------------------------------------------------------
// Folded paper models
// ----------------------------------------------------------------------------------------------

let grainTex = null;

/** Shared tileable near-white fibre texture that folded models multiply their colour by. */
function grainTexture() {
  if (grainTex) return grainTex;
  const tile = getFibreTile();
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const img = ctx.createImageData(TILE, TILE);
  for (let i = 0; i < TILE * TILE; i++) {
    const v = 246 + tile[i] * 9;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v - 2;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTex = texture(canvas);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  return grainTex;
}

const UV_PER_UNIT = 2; // grain tile repeats every 0.5 units (~ the texel density of a card)
const SHEET_T = 0.002; // paper thickness of folded models (before `scale`)

/**
 * Flat-shaded facet geometry from a triangle list ([[x,y,z] x3] each). Facets are first wound so
 * their normal agrees with `outward(cx, cy, cz)` (a direction at the facet centroid). Each facet
 * then becomes two single-sided layers SHEET_T apart, offset along the averaged vertex normal so
 * folds stay watertight: a FrontSide material shows the near layer and the shadow pass (BackSide)
 * only sees the far one, so thin paper never self-shadows. Each facet gets a planar grain UV and a
 * slightly different seeded tint so the folds read even under flat light.
 */
function facetGeometry(tris, outward, seed, shade = 0.08) {
  const rnd = mulberry32(seed);
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  const smooth = new Map();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const facets = tris.map(([p0, p1, p2]) => {
    e1.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    e2.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const n = e1.clone().cross(e2).normalize();
    const out = outward((p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3);
    const flip = n.x * out[0] + n.y * out[1] + n.z * out[2] < 0;
    if (flip) n.negate();
    const pts = flip ? [p0, p2, p1] : [p0, p1, p2];
    for (const p of pts) {
      const k = key(p);
      if (!smooth.has(k)) smooth.set(k, new THREE.Vector3());
      smooth.get(k).add(n);
    }
    return { pts, n };
  });
  const pos = [];
  const uv = [];
  const col = [];
  for (const { pts, n } of facets) {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    const [i, j] = ax >= ay && ax >= az ? [2, 1] : ay >= az ? [0, 2] : [0, 1];
    const tint = 1 - rnd() * shade;
    for (const side of [1, -1]) {
      for (const p of side > 0 ? pts : [pts[0], pts[2], pts[1]]) {
        const sn = smooth.get(key(p));
        const dir = sn.lengthSq() > 1e-6 ? e1.copy(sn).normalize() : n;
        const off = (side * SHEET_T) / 2;
        pos.push(p[0] + dir.x * off, p[1] + dir.y * off, p[2] + dir.z * off);
        uv.push(p[i] * UV_PER_UNIT, p[j] * UV_PER_UNIT);
        col.push(tint, tint, tint);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function foldedMesh(tris, outward, color, seed) {
  const mesh = new THREE.Mesh(
    facetGeometry(tris, outward, seed),
    new THREE.MeshStandardMaterial({
      color,
      map: grainTexture(),
      vertexColors: true,
      flatShading: true,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const mirrorZ = (tris) => tris.map((t) => t.map(([x, y, z]) => [x, y, -z]));

/** A slim double-layer point (neck, tail, head): 2D base a-b, 3D tip; layers splay by `t` at the base. */
function blade(a, b, tip, t) {
  const tris = [];
  for (const s of [1, -1]) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, s * t * 1.5];
    const pa = [a[0], a[1], s * t];
    const pb = [b[0], b[1], s * t];
    tris.push([pa, m, tip], [m, pb, tip]);
  }
  return tris;
}

export function boat({ color = PAPER.white, scale = 1 } = {}) {
  const bow = [0.3, 0.1, 0];
  const stern = [-0.3, 0.1, 0];
  const keelBow = [0.17, -0.05, 0];
  const keelStern = [-0.17, -0.05, 0];
  const apex = [0, 0.3, 0];
  const side = [];
  // Hull wall (+Z side): bow and stern panels, each folded along a diagonal crease.
  const gunwale = [0, 0.08, 0.095];
  const keelMid = [0, -0.05, 0.075];
  side.push([bow, gunwale, keelMid], [bow, keelMid, keelBow]);
  side.push([stern, keelMid, gunwale], [stern, keelStern, keelMid]);
  side.push([keelBow, keelMid, keelStern]); // half of the flat bottom
  // Sail layer (+Z side): the hat's peak, creased down its middle, splaying into the hull pocket.
  const sailL = [-0.11, -0.04, 0.018];
  const sailR = [0.11, -0.04, 0.018];
  const sailC = [0, -0.04, 0.036];
  side.push([sailL, sailC, apex], [sailC, sailR, apex]);
  const group = new THREE.Group();
  // Outward = away from the centre plane and downward (hull walls, bottom and both sail layers).
  const outward = (x, y, z) => [0, -0.5, Math.sign(z)];
  group.add(foldedMesh([...side, ...mirrorZ(side)], outward, color, 11));
  group.scale.setScalar(scale);
  return group;
}

export function crane({ color = PAPER.white, scale = 1 } = {}) {
  // Body: a puffed diamond pocket.
  const front = [0.12, 0, 0];
  const rear = [-0.12, 0, 0];
  const top = [0, 0.03, 0];
  const bottom = [0, -0.08, 0];
  const puff = [0, -0.022, 0.045];
  const bodySide = [
    [front, top, puff],
    [top, rear, puff],
    [rear, bottom, puff],
    [bottom, front, puff],
  ];
  const neckTip = [0.24, 0.21, 0];
  const body = [
    ...bodySide,
    ...mirrorZ(bodySide),
    // Neck rising ~55 deg from the lower front edge; head reverse-folded forward-down at its tip.
    ...blade([0.02, -0.07], [0.12, 0], neckTip, 0.012),
    ...blade([0.207, 0.168], [0.24, 0.21], [0.314, 0.158, 0], 0.006),
    // Tail rising from the lower rear edge.
    ...blade([-0.02, -0.07], [-0.12, 0], [-0.27, 0.22, 0], 0.012),
  ];
  const group = new THREE.Group();
  // Body facets face away from its centre; the slim points face away from the centre plane.
  const outward = (x, y, z) => (Math.abs(x) < 0.12 && y < 0.03 ? [x, y + 0.02, z] : [0, 0, Math.sign(z)]);
  group.add(foldedMesh(body, outward, color, 23));

  // Wings hinge on the body ridge (pivot at y = 0.02) and reach +/-0.4 in Z; raised centre crease.
  const ridge = [0, 0.012, 0];
  const tip = [-0.03, 0, 0.4];
  const wing = [
    [[0.11, 0, 0], ridge, tip],
    [ridge, [-0.11, 0, 0], tip],
  ];
  const pivots = [1, -1].map((s) => {
    const pivot = new THREE.Object3D();
    pivot.position.y = 0.02;
    pivot.add(foldedMesh(s > 0 ? wing : mirrorZ(wing), () => [0, 1, 0], color, s > 0 ? 31 : 37));
    group.add(pivot);
    return pivot;
  });
  group.userData.setFlap = (v) => {
    const a = 0.12 + THREE.MathUtils.clamp(v, -1, 1) * 0.75;
    pivots[0].rotation.x = -a;
    pivots[1].rotation.x = a;
  };
  group.userData.setFlap(0);
  group.scale.setScalar(scale);
  return group;
}
