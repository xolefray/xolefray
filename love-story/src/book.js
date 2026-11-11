/**
 * book.js — the hand-made scrapbook: LEAVES hinged leaves (dims.js), a red cloth spine tied with a
 * cord, the leather cover with its cut-paper title and photo medallion, and one anchor per spread
 * (contract §3, §5 "src/book.js"). Version 2 has nine leaves and eight spreads; nothing below
 * assumes that count.
 *
 * Leaves: 0 = front cover, 1..LEAVES−2 = thick scrapbook card, LEAVES−1 = back cover. Every leaf is
 * a rounded slab in its own local frame (x ∈ [0, w] from its gutter edge, y ∈ [0, t] from its BACK
 * face to its FRONT face, z centred) and is turned by exactly its φ about a Z-parallel hinge line
 * at its gutter edge.
 *
 * Hinge chain (why gutters stay clean and nothing interpenetrates): leaf i's back-face gutter edge
 * sits on point Q[i+1] and its front-face gutter edge is Q[i] = Q[i+1] + t_i·n(φ_i), with
 * n(φ) = (−sin φ, cos φ) and Q[LEAVES] the back cover's outer gutter edge. So the two printed
 * surfaces of spread k (back face of leaf k−1, front face of leaf k) both start on the line through
 * Q[k] for every opening angle — during turns too. Adjacent leaves only ever touch along that line,
 * so no two leaves can overlap; the pile that is not under the turning leaf just glides around a
 * circle of radius t_k while the leaf turns. The chain is finally lifted so that its lowest corner
 * rests on the desk (y = 0).
 *
 * Float: an open spread is perfectly flat, so its two piles — of different thickness — cannot both
 * lie on the desk: the thinner one hovers by |2k − LEAVES|·BOARD_T. The cover boards do not count,
 * only the inner cards, which is why those are thin. The gap is hidden by a dark recessed plinth
 * under each hovering pile (it reads as the shadow under the cover's overhang and stops any
 * see-through at desk level) and by a soft contact shadow round both footprints.
 *
 * Anchor k (1..LEAVES−1) sits on Q[k] rotated by φ_k: origin on the right page's printed surface at
 * the gutter, +X along the right page, +Y its normal, +Z toward the reader; the left page (back of
 * leaf k−1) leaves the same Z axis in direction L(α_k) exactly. Page art (1024 × 853 canvases) is mapped
 * with explicit UVs: front faces u = x/W, back faces u = 1 − x/W, v = 1 at the far edge; the page
 * shader darkens a soft strip along the gutter, and the cards' gutter-side faces are dark so the
 * fold never shows as a bright seam. Cards differ by a hair in size and edge tint (a hand-cut
 * stack); the printed area is always exactly PAGE_W × PAGE_D.
 *
 * The cover: one 2048-px painting of the whole board (pebbled leather with patina, a tooled and
 * hand-stitched border, the red cloth hinge strip, the title in cut-paper letters with their paper
 * thickness in the bump map, the couple's photograph — or a cut-paper heart emblem — in a scalloped
 * paper mat, their names in gold pen), plus real geometry lying on it: a brass oval frame, two brass
 * eyelets and a three-strand cord tied in a bow with two tassels. All of that relief belongs to leaf
 * 0 and travels with it; when the cover has turned over and comes down towards the desk the relief
 * is pressed flat exactly as far as the remaining clearance demands (and hidden once there is
 * none), so it never pierces the desk. Nothing of it reaches past the cover's edges.
 *
 * Light: nothing here knows the film's schedule. The brass reflects a small private "room"; how
 * bright that reflection is follows update(t, lampLevel) — pass the lamp level (0 = dark, 1 = the
 * lamp at full) — or, when lampLevel is omitted, the light actually falling on the book from the
 * scene's spot and hemisphere lights (so it dims and fades with whatever the environment does).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './util/rng.js';
import { PAGE_W, PAGE_D, LEAVES as LEAF_COUNT } from './dims.js';
import { FONT } from './fonts.js';
import { tr } from './i18n.js';
import * as paperLib from './paper.js';
import * as timeline from './timeline.js';

const COVER_T = 0.05; // cover board thickness (inner cards are T)
export const BOOK = { PAGE_W, PAGE_D, BOARD_T: 0.022, COVER_T, LEAVES: LEAF_COUNT };

const { PAGE_W: W, PAGE_D: D, BOARD_T: T, LEAVES } = BOOK;
const OVERHANG_X = 0.08; // the covers' "squares" beyond the cards: fore-edge …
const OVERHANG_Z = 0.06; // … and head / tail
const COVER_W = W + OVERHANG_X;
const COVER_D = D + 2 * OVERHANG_Z;
const STRIP_W = 0.5; // red cloth hinge strip along the gutter side of both covers
const BOARD_R = 0.005; // edge rounding radii
const COVER_R = 0.012;
const SHEET_LIFT = 0.0008; // endpaper sheets sit this far off the cover board
const THICK = Array.from({ length: LEAVES }, (_, i) => (i === 0 || i === LEAVES - 1 ? COVER_T : T));
const ART_PX = [1024, 853]; // page-art canvas size (aspect PAGE_W : PAGE_D)

// Cover painting resolution, and the world size of the tiling textures painted at the same scale.
const COVER_PX = 2048;
const K = COVER_PX / COVER_W; // px per world unit on the cover painting
const COVER_PX_H = Math.round(COVER_D * K);
const LEATHER_PX = 512;
const LEATHER_TILE = LEATHER_PX / K;
const CLOTH_PX = 384;
const CLOTH_TILE = CLOTH_PX / K;
const EDGE_TILE = 1.0; // world units covered by one card-edge texture tile

const PAL = {
  tomato: '#e2574c', mustard: '#e9b23e', teal: '#3f9c95', sky: '#78b7dd', leaf: '#7fb069',
  blush: '#f0a3a0', cream: '#f6edd9', kraft: '#c9a273', leather: '#6b4630', spine: '#b5382f',
  ...(paperLib.PALETTES && paperLib.PALETTES.scrapbook ? paperLib.PALETTES.scrapbook : {}),
};
const EDGE_INK = '#2a180e'; // the thin dark edge of every cut-paper piece
const BLANK_PAGE = '#f1e6cf';
const GOLD_INK = ['#f7e7b4', '#e3bf73'];

// Cover composition (world units in the cover's frame: x from the hinge edge, z toward the reader).
const BORDER_INSET = 0.11; // stitched border, measured from the leather panel's edges
// English keeps the original column. Spanish is a narrower three-line block (NUESTRA / HISTORIA /
// DE AMOR) so the letters stay clear of the photo medallion on the right and the names below it.
const TITLE_EN = {
  x: 1.47, // centre line of the title column
  z: -0.1, // centre of the three-line block
  width: 1.46,
  gap: 0.125,
  lines: [
    { text: 'OUR', cap: 0.43, colors: ['mustard', 'sky', 'tomato'], dx: -0.13, tilt: -0.035 },
    { text: 'LOVE', cap: 0.43, colors: ['tomato', 'cream', 'teal', 'mustard'], dx: 0, tilt: 0.012 },
    { text: 'STORY', cap: 0.345, colors: ['leaf', 'mustard', 'sky', 'tomato', 'cream'], dx: 0, tilt: -0.015 },
  ],
};
const TITLE_ES = {
  x: 1.4,
  z: -0.12,
  width: 1.28,
  gap: 0.09,
  lines: [
    { text: 'NUESTRA', cap: 0.3, colors: ['mustard', 'sky', 'tomato'], dx: -0.06, tilt: -0.03 },
    { text: 'HISTORIA', cap: 0.28, colors: ['tomato', 'cream', 'teal', 'mustard'], dx: 0.02, tilt: 0.01 },
    { text: 'DE AMOR', cap: 0.3, colors: ['leaf', 'mustard', 'sky', 'tomato', 'cream', 'teal'], dx: 0.04, tilt: -0.012 },
  ],
};
/** The layout paintCover reads. selectCoverLayout sets it before the cover is painted. */
let COVER_TITLE = TITLE_EN;

function selectCoverLayout(title) {
  const upper = String(title || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (upper === 'NUESTRA HISTORIA DE AMOR') {
    COVER_TITLE = TITLE_ES;
    return;
  }
  COVER_TITLE = TITLE_EN;
  const words = upper.split(' ');
  if (words.length === TITLE_EN.lines.length) words.forEach((word, i) => (TITLE_EN.lines[i].text = word));
}
const MEDALLION = { x: 2.815, z: -0.2, rx: 0.5, rz: 0.65, mat: 0.105, frame: 0.05 };
/** Which part of the cover photo shows in the oval: centre and height as fractions of the photo. */
const COVER_PHOTO_CROP = { cx: 0.475, cy: 0.345, h: 0.63 };
const NAMES_Z = MEDALLION.z + MEDALLION.rz + MEDALLION.mat + 0.25;

// Cord (cover frame; heights are above the cover's outer face).
const ROPE_OFFSET = 0.0105; // strand centre-line distance from the cord's axis
const ROPE_STRAND_R = 0.0125;
const ROPE_R = ROPE_OFFSET + ROPE_STRAND_R;
const ROPE_PITCH = 0.1; // length of one full twist
const ROPE_HEX = ['#e3ab3c', '#f3e6c4', '#4a2c1a'];
const EYELETS = [[0.25, -0.9], [0.25, 0.9]];
const KNOT = [0.27, -0.06];
const RELIEF_X0 = 0.03; // nothing raised lies nearer to the hinge edge than this
const RELIEF_GAP = 0.004; // clearance kept between the pressed relief and the desk

const BRASS_ENV_INTENSITY = 1.25;
const BRASS_ENV_FLOOR = 0.06; // share of the reflection that survives in the dark
const REFERENCE_IRRADIANCE = 3.5; // scene light (see measureLight) at which the lamp level counts as 1

const SPINE_SEGMENTS = 16;
const SPINE_BULGE = 0.35; // spine control-point offset as a fraction of the cover-to-cover chord

const SKIRT_IN = 0.045; // plinth inset from the cover's outer edges
const SKIRT_IN_HINGE = 0.012;
const SKIRT_COLOR = '#120b07';
const CONTACT_MARGIN = 0.26; // how far the contact shadow reaches beyond a footprint
const CONTACT_OPACITY = 0.5;

// ---------------------------------------------------------------------------------------------
// Canvas helpers and tiling painters (all deterministic)

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

function srgb255(hex) {
  const o = { r: 0, g: 0, b: 0 };
  new THREE.Color(hex).getRGB(o, THREE.SRGBColorSpace);
  return [o.r * 255, o.g * 255, o.b * 255];
}

function rgba(hex, a) {
  const c = srgb255(hex);
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

function gray(v) {
  const g = Math.round(v);
  return `rgb(${g},${g},${g})`;
}

/** n×n lattice of random values in [−1, 1] for smooth, wrap-around value noise. */
function lattice(n, rand) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rand() * 2 - 1;
  return g;
}

function sampleLattice(g, n, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const ix0 = ((x0 % n) + n) % n;
  const iy0 = ((y0 % n) + n) % n;
  const ix1 = (ix0 + 1) % n;
  const iy1 = (iy0 + 1) % n;
  const a = g[iy0 * n + ix0];
  const b = g[iy0 * n + ix1];
  const c = g[iy1 * n + ix0];
  const d = g[iy1 * n + ix1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Three same-sized canvases a tile painter fills per pixel: colour, height (grey), roughness (grey). */
function tileLayers(S) {
  const make = () => {
    const layer = makeCanvas(S, S);
    layer.data = layer.ctx.createImageData(S, S);
    return layer;
  };
  const layers = { color: make(), height: make(), rough: make() };
  const put = (k, r, g, b, h, rough) => {
    const c = layers.color.data.data;
    const hd = layers.height.data.data;
    const rd = layers.rough.data.data;
    c[k] = clamp255(r);
    c[k + 1] = clamp255(g);
    c[k + 2] = clamp255(b);
    hd[k] = hd[k + 1] = hd[k + 2] = clamp255(255 * h);
    rd[k] = rd[k + 1] = rd[k + 2] = clamp255(255 * rough);
    c[k + 3] = hd[k + 3] = rd[k + 3] = 255;
  };
  const finish = () => {
    for (const layer of Object.values(layers)) layer.ctx.putImageData(layer.data, 0, 0);
    const out = { color: layers.color.canvas, height: layers.height.canvas, rough: layers.rough.canvas };
    out.surface = packSurface(out.height, out.rough);
    return out;
  };
  return { put, finish };
}

/** Packs a height canvas and a roughness canvas into one surface map: R = bump height, G = roughness. */
function packSurface(heightCanvas, roughCanvas) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hd = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rd = roughCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const img = out.ctx.createImageData(w, h);
  const d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    d[k] = hd[k];
    d[k + 1] = rd[k + 1];
    d[k + 2] = 0;
    d[k + 3] = 255;
  }
  out.ctx.putImageData(img, 0, 0);
  return out.canvas;
}

/**
 * Pebbled leather tile (wraps seamlessly): jittered cells make the pebbles, the creases between
 * them are darker, lower and rougher. Heights stay in the lower third so glued-on paper rises
 * clearly above the grain.
 */
function paintLeather(baseHex, seed) {
  const S = LEATHER_PX;
  const G = 58; // cells per tile → pebbles ≈ 9 px ≈ 0.016 world units
  const rand = mulberry32(seed);
  const n = G * G;
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  const fv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fx[i] = rand();
    fy[i] = rand();
    fv[i] = rand();
  }
  const m1 = lattice(5, rand);
  const m2 = lattice(19, rand);
  const m3 = lattice(96, rand);
  const base = srgb255(baseHex);
  const cell = S / G;
  const { put, finish } = tileLayers(S);
  for (let y = 0; y < S; y++) {
    const gy = y / cell;
    const cy = Math.floor(gy);
    for (let x = 0; x < S; x++) {
      const gx = x / cell;
      const cx = Math.floor(gx);
      let d1 = 9;
      let d2 = 9;
      let id = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const iy = (cy + oy + G) % G;
        for (let ox = -1; ox <= 1; ox++) {
          const i = iy * G + ((cx + ox + G) % G);
          const dx = cx + ox + fx[i] - gx;
          const dy = cy + oy + fy[i] - gy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = i;
          } else if (d < d2) d2 = d;
        }
      }
      d1 = Math.sqrt(d1);
      d2 = Math.sqrt(d2);
      const c = Math.min(1, (d2 - d1) / 0.32); // 0 in a crease → 1 on the pebble
      const pebble = c * c * (3 - 2 * c) * (1 - 0.3 * d1 * d1);
      const a = sampleLattice(m1, 5, (x / S) * 5, (y / S) * 5);
      const b = sampleLattice(m2, 19, (x / S) * 19, (y / S) * 19);
      const f = sampleLattice(m3, 96, (x / S) * 96, (y / S) * 96);
      const shade = 0.7 + 0.3 * pebble + 0.14 * (fv[id] - 0.5) + 0.03 * a + 0.06 * b + 0.035 * f;
      put((y * S + x) * 4, base[0] * shade + 8 * pebble, base[1] * shade + 3 * pebble, base[2] * shade,
        0.16 + 0.26 * pebble + 0.03 * b + 0.02 * f, 0.72 - 0.24 * pebble + 0.05 * b);
    }
  }
  return finish();
}

/** Plain-weave book cloth tile (wraps seamlessly), threads P px wide. */
function paintCloth(baseHex, seed) {
  const S = CLOTH_PX;
  const P = 6; // thread pitch in px ≈ 0.011 world units
  const N = S / P;
  const rand = mulberry32(seed);
  const base = srgb255(baseHex);
  const warp = new Float32Array(N);
  const weft = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    warp[i] = (rand() - 0.5) * 0.12 + (rand() < 0.07 ? 0.09 : 0);
    weft[i] = (rand() - 0.5) * 0.12 + (rand() < 0.07 ? -0.08 : 0);
  }
  const mottle = lattice(6, rand);
  const fuzz = lattice(64, rand);
  const { put, finish } = tileLayers(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (x / P) | 0;
      const j = (y / P) | 0;
      const fx = ((x % P) + 0.5) / P;
      const fy = ((y % P) + 0.5) / P;
      const warpOver = ((i + j) & 1) === 0;
      const across = warpOver ? fx : fy;
      const along = warpOver ? fy : fx;
      const h = Math.pow(Math.sin(Math.PI * across), 0.7) * (0.8 + 0.2 * Math.sin(Math.PI * along));
      const m = sampleLattice(mottle, 6, (x / S) * 6, (y / S) * 6);
      const f = sampleLattice(fuzz, 64, (x / S) * 64, (y / S) * 64);
      const shade = (0.78 + 0.26 * h + (warpOver ? warp[i] : weft[j]) + 0.05 * m + 0.03 * f) * (warpOver ? 1.03 : 0.96);
      put((y * S + x) * 4, base[0] * shade + 6 * h, base[1] * shade + 2 * h, base[2] * shade,
        0.2 + 0.3 * h + 0.03 * f, 0.95 - 0.12 * h + 0.03 * m);
    }
  }
  return finish();
}

/** Card edge: cream facing plies over a kraft core across the thickness (v), fibre streaks along u. */
function paintEdge(seed) {
  const Wpx = 512;
  const Hpx = 64;
  const rand = mulberry32(seed);
  // [top row, colour] from the card's top (canvas y = 0 → v = 1) down to its bottom.
  const plies = [
    [0, '#faf4e6'], [5, '#e8dcc0'], [9, '#d2b98c'], [10, '#c6a777'], [30, '#bd9c6a'], [34, '#caae80'],
    [53, '#d2b98c'], [55, '#e8dcc0'], [59, '#faf4e6'],
  ].map(([row, hex]) => [row, srgb255(hex)]);
  const fib = lattice(64, rand);
  const { canvas, ctx } = makeCanvas(Wpx, Hpx);
  const img = ctx.createImageData(Wpx, Hpx);
  let p = 0;
  for (let y = 0; y < Hpx; y++) {
    while (p + 1 < plies.length && plies[p + 1][0] <= y) p++;
    const c = plies[p][1];
    for (let x = 0; x < Wpx; x++) {
      const n = 0.06 * sampleLattice(fib, 64, x / 8, y * 0.6) + 0.04 * (rand() - 0.5);
      const k = (y * Wpx + x) * 4;
      img.data[k] = clamp255(c[0] * (1 + n));
      img.data[k + 1] = clamp255(c[1] * (1 + n));
      img.data[k + 2] = clamp255(c[2] * (1 + n));
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Fine paper tooth for the page bump map (tiles). */
function paintGrain(seed) {
  const S = 256;
  const rand = mulberry32(seed);
  const coarse = lattice(32, rand);
  const { canvas, ctx } = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = 128 + 70 * sampleLattice(coarse, 32, x / 8, y / 8) + 40 * (rand() - 0.5);
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp255(v);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Fine speckle and a few fibres (transparent), laid over every cut-paper piece. */
function paintPaperSpeckle(seed) {
  const S = 256;
  const rand = mulberry32(seed);
  const soft = lattice(48, rand);
  const { canvas, ctx } = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = 0.55 * sampleLattice(soft, 48, (x / S) * 48, (y / S) * 48) + 0.9 * (rand() - 0.5);
      const k = (y * S + x) * 4;
      const v = n > 0 ? 255 : 0;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = clamp255(Math.abs(n) * 34);
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 26; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * Math.PI;
    const len = 6 + rand() * 12;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(60,40,20,0.1)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + 2, y + Math.sin(a) * len * 0.5 - 2, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return canvas;
}

/**
 * Small warm equirectangular "room" the brass reflects (PMREM'd by the renderer): dark desk below
 * the horizon, a glowing ceiling, the lamp and a few soft window strips, so the brass shows the
 * light-dark contrast that reads as metal.
 */
function paintBrassEnv() {
  const { canvas, ctx } = makeCanvas(512, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#f6dfb4');
  sky.addColorStop(0.24, '#cfa46a');
  sky.addColorStop(0.42, '#5a3f28');
  sky.addColorStop(0.5, '#2e2016');
  sky.addColorStop(1, '#0e0a07');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  const glow = (x, y, rx, ry, a) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx / ry, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
    g.addColorStop(0, `rgba(255,246,224,${a})`);
    g.addColorStop(0.5, `rgba(255,226,170,${a * 0.35})`);
    g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-ry, -ry, 2 * ry, 2 * ry);
    ctx.restore();
  };
  glow(140, 34, 46, 30, 1); // the lamp, up and to the left
  for (const x of [250, 330, 410, 470]) glow(x, 92, 12, 40, 0.55); // window strips
  glow(40, 100, 30, 26, 0.4);
  return canvas;
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + 0.92 * s);
  ctx.bezierCurveTo(cx - 1.25 * s, cy + 0.1 * s, cx - 1.0 * s, cy - 0.95 * s, cx - 0.48 * s, cy - 0.95 * s);
  ctx.bezierCurveTo(cx - 0.18 * s, cy - 0.95 * s, cx, cy - 0.72 * s, cx, cy - 0.5 * s);
  ctx.bezierCurveTo(cx, cy - 0.72 * s, cx + 0.18 * s, cy - 0.95 * s, cx + 0.48 * s, cy - 0.95 * s);
  ctx.bezierCurveTo(cx + 1.0 * s, cy - 0.95 * s, cx + 1.25 * s, cy + 0.1 * s, cx, cy + 0.92 * s);
  ctx.closePath();
}

/**
 * Default endpaper (inside of both covers until page art is set): soft sage paper with rows of
 * cream dots and the odd little heart. Painted with FAR at the top like all page art; a repeat
 * pattern, so it needs no mirroring between the left and the right page.
 */
function paintEndpaper(seed) {
  const [w, h] = ART_PX;
  const rand = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#b7d0c4';
  ctx.fillRect(0, 0, w, h);
  const soft = lattice(9, rand);
  const step = 46;
  let row = 0;
  for (let y = step * 0.5; y < h + step; y += step * 0.866, row++) {
    for (let x = (row & 1 ? step * 0.5 : 0) + step * 0.25; x < w + step; x += step) {
      const jx = (rand() - 0.5) * 2.4;
      const jy = (rand() - 0.5) * 2.4;
      const pick = rand();
      if (pick < 0.045) {
        ctx.fillStyle = rgba(PAL.tomato, 0.9);
        heartPath(ctx, x + jx, y + jy, 8.5);
        ctx.fill();
      } else {
        ctx.fillStyle = pick < 0.12 ? rgba(PAL.mustard, 0.85) : 'rgba(248,241,224,0.92)';
        ctx.beginPath();
        ctx.arc(x + jx, y + jy, 6.2 + rand() * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Gentle unevenness of the print and the paper.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const n = 1 + 0.035 * sampleLattice(soft, 9, (x / w) * 9, (y / h) * 9) + 0.035 * (rand() - 0.5);
      d[k] = clamp255(d[k] * n);
      d[k + 1] = clamp255(d[k + 1] * n);
      d[k + 2] = clamp255(d[k + 2] * n);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Edge band of the covers (u = x / COVER_W): red cloth along the hinge strip, burnished leather
 * beyond — for the head/tail edges and the turn-ins round the endpapers.
 */
function paintTrim(leather, cloth) {
  const w = 1024;
  const h = 64;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = ctx.createPattern(leather.color, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(30,14,6,0.38)'; // burnished
  ctx.fillRect(0, 0, w, h);
  const split = Math.round((STRIP_W / COVER_W) * w);
  ctx.fillStyle = ctx.createPattern(cloth.color, 'repeat');
  ctx.fillRect(0, 0, split, h);
  ctx.fillStyle = 'rgba(40,6,4,0.2)';
  ctx.fillRect(0, 0, split, h);
  ctx.fillStyle = 'rgba(20,8,4,0.55)';
  ctx.fillRect(split - 1, 0, 3, h);
  return canvas;
}

/** Soft dark rounded rectangle (alpha) for the contact shadows. */
function paintContactShadow() {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const fx = CONTACT_MARGIN / (COVER_W + 2 * CONTACT_MARGIN);
  const fz = CONTACT_MARGIN / (COVER_D + 2 * CONTACT_MARGIN);
  softShadow(ctx, S * fx * 1.15, 'rgba(0,0,0,1)', 0, 0, (c) => {
    c.fillStyle = '#000';
    c.fillRect(S * fx, S * fz, S * (1 - 2 * fx), S * (1 - 2 * fz));
  });
  softShadow(ctx, S * fx * 0.4, 'rgba(0,0,0,1)', 0, 0, (c) => {
    c.fillStyle = '#000';
    c.fillRect(S * fx * 1.2, S * fz * 1.2, S * (1 - 2.4 * fx), S * (1 - 2.4 * fz));
  });
  return canvas;
}

/**
 * Draws only the blurred shadow of whatever `draw(ctx)` paints (the drawing itself lands far off
 * the canvas): a blur that works in every browser, without ctx.filter.
 */
function softShadow(ctx, blur, color, dx, dy, draw) {
  const OFF = 30000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = OFF + dx;
  ctx.shadowOffsetY = dy;
  ctx.translate(-OFF, 0);
  draw(ctx);
  ctx.restore();
}

function tiledTexture(canvas, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// The cover painting

/** Points along a rounded rectangle's outline, `step` apart (adjusted to divide the perimeter). */
function roundRectPoints(x0, y0, x1, y1, r, step) {
  const w = x1 - x0 - 2 * r;
  const h = y1 - y0 - 2 * r;
  const q = (Math.PI / 2) * r;
  const per = 2 * (w + h) + 4 * q;
  const n = Math.max(4, Math.round(per / step));
  const pts = [];
  const arc = (cx, cy, a0, s) => {
    const a = a0 + s / r;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), -Math.sin(a), Math.cos(a)];
  };
  for (let i = 0; i < n; i++) {
    let s = (i / n) * per;
    let p;
    if (s < w) p = [x0 + r + s, y0, 1, 0];
    else if ((s -= w) < q) p = arc(x1 - r, y0 + r, -Math.PI / 2, s);
    else if ((s -= q) < h) p = [x1, y0 + r + s, 0, 1];
    else if ((s -= h) < q) p = arc(x1 - r, y1 - r, 0, s);
    else if ((s -= q) < w) p = [x1 - r - s, y1, -1, 0];
    else if ((s -= w) < q) p = arc(x0 + r, y1 - r, Math.PI / 2, s);
    else if ((s -= q) < h) p = [x0, y1 - r - s, 0, -1];
    else p = arc(x0 + r, y0 + r, Math.PI, s - h);
    pts.push(p);
  }
  return { pts, step: per / n };
}

function roundRectTrace(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

/** A canvas the size of `mask`, filled with `fill` wherever the mask is opaque. */
function tinted(mask, fill) {
  const out = makeCanvas(mask.width, mask.height);
  out.ctx.drawImage(mask, 0, 0);
  out.ctx.globalCompositeOperation = 'source-in';
  out.ctx.fillStyle = fill;
  out.ctx.fillRect(0, 0, mask.width, mask.height);
  return out.canvas;
}

/**
 * Glues one cut-paper piece onto the cover's three layers. `mask` is the piece's silhouette (opaque
 * on transparent, upright); it is given a thin dark cut edge, the paper's speckle, a hint of
 * thickness along its lit and shaded sides, a soft drop shadow and a raised, matt footprint in the
 * surface layers.
 */
function gluePiece(L, mask, o) {
  const edge = o.edgePx ?? 4.5;
  const pad = Math.ceil(edge) + 2;
  const w = mask.width + 2 * pad;
  const h = mask.height + 2 * pad;
  // Silhouette grown by the cut edge.
  const grown = makeCanvas(w, h);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    grown.ctx.drawImage(mask, pad + Math.cos(a) * edge, pad + Math.sin(a) * edge);
  }
  grown.ctx.drawImage(mask, pad, pad);
  // The paper face.
  const face = makeCanvas(w, h);
  const f = face.ctx;
  f.drawImage(mask, pad, pad);
  f.globalCompositeOperation = 'source-in';
  f.fillStyle = o.color;
  f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'source-atop';
  if (o.paint) o.paint(f, pad, pad, mask.width, mask.height);
  const sheen = f.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(40,20,0,0.12)');
  f.fillStyle = sheen;
  f.fillRect(0, 0, w, h);
  f.save();
  f.translate(-(o.seed * 37) % 256, -(o.seed * 91) % 256);
  f.fillStyle = f.createPattern(L.speckle, 'repeat');
  f.fillRect(0, 0, w + 256, h + 256);
  f.restore();
  // Paper thickness: a lit sliver along the edges facing the lamp (left), a shaded one opposite.
  const sliver = (dx, dy, fill) => {
    const band = makeCanvas(w, h);
    band.ctx.drawImage(mask, pad, pad);
    band.ctx.globalCompositeOperation = 'destination-out';
    band.ctx.drawImage(mask, pad + dx, pad + dy);
    f.drawImage(tinted(band.canvas, fill), 0, 0);
  };
  sliver(2.2, 0.8, 'rgba(255,250,235,0.42)');
  sliver(-2.2, -0.8, 'rgba(30,14,4,0.22)');
  // Edge + face.
  const piece = makeCanvas(w, h);
  piece.ctx.drawImage(tinted(grown.canvas, o.edge ?? EDGE_INK), 0, 0);
  piece.ctx.drawImage(face.canvas, 0, 0);

  const place = (ctx) => {
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot ?? 0);
    if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
    ctx.scale(o.scale ?? 1, o.scale ?? 1);
  };
  const lift = o.lift ?? 1;
  L.c.save();
  place(L.c);
  L.c.shadowColor = 'rgba(18,7,2,0.5)';
  L.c.shadowBlur = 18 * lift;
  L.c.shadowOffsetX = 6 * lift;
  L.c.shadowOffsetY = 3 * lift;
  L.c.drawImage(piece.canvas, -w / 2, -h / 2);
  L.c.shadowColor = 'rgba(18,7,2,0.6)';
  L.c.shadowBlur = 4;
  L.c.shadowOffsetX = 2;
  L.c.shadowOffsetY = 1;
  L.c.drawImage(piece.canvas, -w / 2, -h / 2);
  L.c.restore();
  for (const [ctx, value] of [[L.h, o.height ?? 222], [L.r, o.rough ?? 236]]) {
    ctx.save();
    place(ctx);
    ctx.drawImage(tinted(grown.canvas, gray(value)), -w / 2, -h / 2);
    ctx.restore();
  }
}

/** Silhouette of one glyph, tightly boxed. A space advances and carries no paper. */
function glyphMask(ch, fontSpec) {
  const probe = makeCanvas(4, 4).ctx;
  probe.font = fontSpec;
  if (ch === ' ' || ch === '\u00a0') {
    const m = probe.measureText(' ');
    return { canvas: null, advance: m.width || probe.measureText('n').width * 0.33, blank: true };
  }
  const m = probe.measureText(ch);
  const left = m.actualBoundingBoxLeft;
  const w = Math.ceil(left + m.actualBoundingBoxRight) + 4;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 4;
  const { canvas, ctx } = makeCanvas(Math.max(8, w), Math.max(8, h));
  ctx.font = fontSpec;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, 2 + left, 2 + m.actualBoundingBoxAscent);
  return { canvas, advance: m.width, left, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
}

function shapeMask(w, h, draw) {
  const { canvas, ctx } = makeCanvas(Math.ceil(w), Math.ceil(h));
  ctx.fillStyle = '#fff';
  draw(ctx);
  return canvas;
}

/** Scalloped oval (a paper doily edge): the oval plus a ring of small rounds along its outline. */
function scallopMask(rx, ry, count) {
  const sample = 720;
  const xs = [];
  const ys = [];
  const acc = [0];
  for (let i = 0; i <= sample; i++) {
    const a = (i / sample) * Math.PI * 2;
    xs.push(rx * Math.cos(a));
    ys.push(ry * Math.sin(a));
    if (i) acc.push(acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  const per = acc[sample];
  const r = (per / count) * 0.56;
  const pad = r + 3;
  return {
    pad,
    canvas: shapeMask(2 * (rx + pad), 2 * (ry + pad), (ctx) => {
      ctx.translate(rx + pad, ry + pad);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      let j = 0;
      for (let i = 0; i < count; i++) {
        const s = (i / count) * per;
        while (acc[j + 1] < s) j++;
        const u = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
        ctx.beginPath();
        ctx.arc(xs[j] + (xs[j + 1] - xs[j]) * u, ys[j] + (ys[j + 1] - ys[j]) * u, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  };
}

/**
 * Paints the front cover: returns { color, surface } canvases covering the whole board
 * (u = x / COVER_W, far edge at the top), surface R = bump height, G = roughness.
 */
function paintCover({ leather, cloth, photo, font, title, names, cord }) {
  const Wp = COVER_PX;
  const Hp = COVER_PX_H;
  const col = makeCanvas(Wp, Hp);
  const hgt = makeCanvas(Wp, Hp);
  const rgh = makeCanvas(Wp, Hp);
  const L = { c: col.ctx, h: hgt.ctx, r: rgh.ctx, speckle: paintPaperSpeckle(71) };
  const X = (x) => x * K;
  const Z = (z) => (z + COVER_D / 2) * K;
  const rand = mulberry32(20270206);
  const stripX = X(STRIP_W);

  // ---- leather and cloth grounds
  for (const [ctx, layer] of [[L.c, 'color'], [L.h, 'height'], [L.r, 'rough']]) {
    ctx.fillStyle = ctx.createPattern(leather[layer], 'repeat');
    ctx.fillRect(0, 0, Wp, Hp);
    ctx.fillStyle = ctx.createPattern(cloth[layer], 'repeat');
    ctx.fillRect(0, 0, stripX, Hp);
  }

  // ---- patina of the leather panel: mottling, darker towards the edges, rubbed edges, scratches
  const c = L.c;
  c.save();
  c.beginPath();
  c.rect(stripX, 0, Wp - stripX, Hp);
  c.clip();
  {
    const nw = 120;
    const nh = Math.round((nw * Hp) / Wp);
    const big = lattice(7, rand);
    const mid = lattice(23, rand);
    const noise = makeCanvas(nw, nh);
    const img = noise.ctx.createImageData(nw, nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const n = 0.7 * sampleLattice(big, 7, (x / nw) * 7, (y / nh) * 7) + 0.45 * sampleLattice(mid, 23, (x / nw) * 23, (y / nh) * 23);
        const k = (y * nw + x) * 4;
        if (n > 0) {
          img.data[k] = 26;
          img.data[k + 1] = 10;
          img.data[k + 2] = 4;
          img.data[k + 3] = clamp255(n * 150);
        } else {
          img.data[k] = 214;
          img.data[k + 1] = 150;
          img.data[k + 2] = 92;
          img.data[k + 3] = clamp255(-n * 78);
        }
      }
    }
    noise.ctx.putImageData(img, 0, 0);
    c.imageSmoothingQuality = 'high';
    c.drawImage(noise.canvas, 0, 0, Wp, Hp);
  }
  const edgeShade = (x0, y0, x1, y1, a) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(22,9,3,${a})`);
    g.addColorStop(1, 'rgba(22,9,3,0)');
    c.fillStyle = g;
    c.fillRect(stripX, 0, Wp - stripX, Hp);
  };
  edgeShade(stripX, 0, stripX + 0.55 * K, 0, 0.3);
  edgeShade(Wp, 0, Wp - 0.6 * K, 0, 0.42);
  edgeShade(0, 0, 0, 0.6 * K, 0.42);
  edgeShade(0, Hp, 0, Hp - 0.6 * K, 0.46);
  // A warm, slightly lighter heart of the panel where hands have polished it.
  {
    const g = c.createRadialGradient(X(2.0), Z(-0.1), 0, X(2.0), Z(-0.1), 1.5 * K);
    g.addColorStop(0, 'rgba(232,160,96,0.16)');
    g.addColorStop(1, 'rgba(232,160,96,0)');
    c.fillStyle = g;
    c.fillRect(stripX, 0, Wp - stripX, Hp);
  }
  // Rubbed outer edges and corners: the dye has worn to a lighter tan.
  c.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rand() * 3); // 0 fore-edge, 1 head, 2 tail
    const along = rand();
    const inset = Math.pow(rand(), 2.2) * 0.05 * K + 2;
    const len = (0.02 + rand() * 0.09) * K;
    let x;
    let y;
    let dx = 0;
    let dy = 0;
    if (side === 0) {
      x = Wp - inset;
      y = along * Hp;
      dy = len;
    } else {
      x = stripX + along * (Wp - stripX);
      y = side === 1 ? inset : Hp - inset;
      dx = len;
    }
    c.strokeStyle = `rgba(214,160,104,${0.1 + rand() * 0.3})`;
    c.lineWidth = 1 + rand() * 2.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + dx + (rand() - 0.5) * 3, y + dy + (rand() - 0.5) * 3);
    c.stroke();
  }
  for (const [cx, cy] of [[Wp, 0], [Wp, Hp]]) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 0.2 * K);
    g.addColorStop(0, 'rgba(222,170,112,0.6)');
    g.addColorStop(0.45, 'rgba(214,160,104,0.2)');
    g.addColorStop(1, 'rgba(214,160,104,0)');
    c.fillStyle = g;
    c.fillRect(cx - 0.2 * K, cy - 0.2 * K, 0.4 * K, 0.4 * K);
  }
  // Fine scratches and a few soft scuffs.
  for (let i = 0; i < 26; i++) {
    const x = stripX + rand() * (Wp - stripX);
    const y = rand() * Hp;
    const a = rand() * Math.PI;
    const len = (0.12 + rand() * 0.6) * K;
    const bend = (rand() - 0.5) * 0.12 * K;
    c.strokeStyle = `rgba(232,186,132,${0.06 + rand() * 0.12})`;
    c.lineWidth = 0.8 + rand() * 1.1;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = stripX + rand() * (Wp - stripX);
    const y = rand() * Hp;
    const r = (0.08 + rand() * 0.2) * K;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.6;
    g.addColorStop(0, dark ? 'rgba(20,8,2,0.16)' : 'rgba(226,170,110,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  c.restore();

  // ---- the cloth strip: a little grime towards its edges, and the leather's turned edge over it
  {
    const shade = (x0, y0, x1, y1, a) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(48,6,4,${a})`);
      g.addColorStop(1, 'rgba(48,6,4,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, stripX, Hp);
    };
    shade(0, 0, 0.16 * K, 0, 0.3);
    shade(0, 0, 0, 0.5 * K, 0.3);
    shade(0, Hp, 0, Hp - 0.5 * K, 0.34);
    // Shadow the leather's edge casts on the cloth, the groove, and the edge's rolled highlight.
    const g = c.createLinearGradient(stripX - 0.06 * K, 0, stripX, 0);
    g.addColorStop(0, 'rgba(20,4,2,0)');
    g.addColorStop(1, 'rgba(20,4,2,0.62)');
    c.fillStyle = g;
    c.fillRect(stripX - 0.06 * K, 0, 0.06 * K, Hp);
    c.fillStyle = 'rgba(14,5,2,0.8)';
    c.fillRect(stripX - 2.5, 0, 3, Hp);
    c.fillStyle = 'rgba(255,214,160,0.2)';
    c.fillRect(stripX + 1.5, 0, 2.5, Hp);
    L.h.fillStyle = gray(8);
    L.h.fillRect(stripX - 4, 0, 4.5, Hp);
    const roll = L.h.createLinearGradient(stripX, 0, stripX + 0.03 * K, 0);
    roll.addColorStop(0, 'rgba(255,255,255,0.38)');
    roll.addColorStop(1, 'rgba(255,255,255,0)');
    L.h.fillStyle = roll;
    L.h.fillRect(stripX, 0, 0.03 * K, Hp);
  }

  // ---- tooled double rule with a row of hand stitches between
  {
    const x0 = stripX + BORDER_INSET * K;
    const x1 = Wp - BORDER_INSET * K;
    const y0 = BORDER_INSET * K;
    const y1 = Hp - BORDER_INSET * K;
    const rad = 0.13 * K;
    for (const off of [-0.036 * K, 0.036 * K]) {
      const r = Math.max(4, rad - off);
      for (const [ctx, style, lw, sx] of [
        [c, 'rgba(18,7,2,0.6)', 3.4, 0], [c, 'rgba(255,216,160,0.2)', 1.4, 1.8],
        [L.h, gray(6), 4.2, 0], [L.r, gray(215), 4.2, 0],
      ]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = lw;
        roundRectTrace(ctx, x0 - off + sx, y0 - off + sx, x1 + off + sx, y1 + off + sx, r);
        ctx.stroke();
      }
    }
    const { pts, step } = roundRectPoints(x0, y0, x1, y1, rad, 0.062 * K);
    const half = step * 0.5 * 0.68;
    for (const ctx of [c, L.h, L.r]) ctx.lineCap = 'round';
    for (const [px, py, tx, ty] of pts) {
      const wob = (rand() - 0.5) * 0.09;
      const ux = tx - ty * wob;
      const uy = ty + tx * wob;
      const ax = px - ux * half;
      const ay = py - uy * half;
      const bx = px + ux * half;
      const by = py + uy * half;
      c.fillStyle = 'rgba(12,5,2,0.75)';
      for (const [hx, hy] of [[ax - ux * 2, ay - uy * 2], [bx + ux * 2, by + uy * 2]]) {
        c.beginPath();
        c.arc(hx, hy, 2.6, 0, Math.PI * 2);
        c.fill();
      }
      const line = (ctx, style, lw, ox, oy) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(ax + ox, ay + oy);
        ctx.lineTo(bx + ox, by + oy);
        ctx.stroke();
      };
      line(c, 'rgba(14,6,2,0.55)', 6.5, 2, 1.2);
      line(c, '#e9d9b4', 4.6, 0, 0);
      line(c, 'rgba(255,252,240,0.7)', 1.5, -0.8, -0.6);
      line(L.h, gray(190), 5.4, 0, 0);
      line(L.r, gray(238), 5.4, 0, 0);
    }
  }

  // ---- the medallion: scalloped mat layers, then the photograph (or the heart emblem) in the oval
  const mx = X(MEDALLION.x);
  const mz = Z(MEDALLION.z);
  const rx = MEDALLION.rx * K;
  const rz = MEDALLION.rz * K;
  {
    const under = scallopMask(rx + (MEDALLION.mat - 0.012) * K, rz + (MEDALLION.mat - 0.012) * K, 34);
    gluePiece(L, under.canvas, { x: mx, y: mz, color: PAL.tomato, rot: 0.045, seed: 3, lift: 0.9 });
    const mat = shapeMask(2 * (rx + 0.062 * K) + 4, 2 * (rz + 0.062 * K) + 4, (ctx) => {
      ctx.beginPath();
      ctx.ellipse(rx + 0.062 * K + 2, rz + 0.062 * K + 2, rx + 0.062 * K, rz + 0.062 * K, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    gluePiece(L, mat, { x: mx, y: mz, color: PAL.cream, seed: 5, lift: 0.6, edgePx: 3.2, edge: '#5a3a22' });
  }
  c.save();
  c.beginPath();
  c.ellipse(mx, mz, rx, rz, 0, 0, Math.PI * 2);
  c.clip();
  if (photo && photo.width > 8 && photo.height > 8) {
    let sh = Math.min(photo.height, COVER_PHOTO_CROP.h * photo.height);
    let sw = (sh * rx) / rz;
    if (sw > photo.width) {
      sw = photo.width;
      sh = (sw * rz) / rx;
    }
    const sx = Math.min(photo.width - sw, Math.max(0, COVER_PHOTO_CROP.cx * photo.width - sw / 2));
    const sy = Math.min(photo.height - sh, Math.max(0, COVER_PHOTO_CROP.cy * photo.height - sh / 2));
    c.imageSmoothingQuality = 'high';
    c.drawImage(photo, sx, sy, sw, sh, mx - rx, mz - rz, 2 * rx, 2 * rz);
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = 'rgba(255,214,160,0.2)'; // a touch of warmth, as on an old print
    c.fillRect(mx - rx, mz - rz, 2 * rx, 2 * rz);
    c.globalCompositeOperation = 'source-over';
  } else {
    // No photograph: a cut-paper emblem — two overlapping hearts on kraft paper.
    c.fillStyle = PAL.kraft;
    c.fillRect(mx - rx, mz - rz, 2 * rx, 2 * rz);
    c.fillStyle = c.createPattern(L.speckle, 'repeat');
    c.fillRect(mx - rx, mz - rz, 2 * rx, 2 * rz);
    c.strokeStyle = 'rgba(255,250,236,0.55)';
    c.lineWidth = 2.5;
    c.setLineDash([9, 9]);
    c.beginPath();
    c.ellipse(mx, mz, rx - 0.05 * K, rz - 0.05 * K, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    const heart = (s) => shapeMask(2.6 * s, 2.2 * s, (ctx) => {
      heartPath(ctx, 1.3 * s, 1.1 * s, s);
      ctx.fill();
    });
    const flat = { c: L.c, h: makeCanvas(4, 4).ctx, r: makeCanvas(4, 4).ctx, speckle: L.speckle };
    gluePiece(flat, heart(0.25 * K), { x: mx + 0.1 * K, y: mz - 0.1 * K, color: PAL.sky, rot: 0.22, seed: 9, lift: 0.7 });
    gluePiece(flat, heart(0.31 * K), { x: mx - 0.07 * K, y: mz + 0.07 * K, color: PAL.tomato, rot: -0.16, seed: 11, lift: 0.7 });
    gluePiece(flat, heart(0.07 * K), { x: mx + 0.24 * K, y: mz + 0.33 * K, color: PAL.mustard, rot: 0.3, seed: 13, lift: 0.5, edgePx: 3 });
    gluePiece(flat, heart(0.055 * K), { x: mx - 0.27 * K, y: mz - 0.36 * K, color: PAL.cream, rot: -0.3, seed: 15, lift: 0.5, edgePx: 3 });
  }
  // The frame's shadow on the picture: deeper on the lamp side.
  {
    const g = c.createRadialGradient(mx + 0.05 * K, mz + 0.02 * K, rz * 0.62, mx, mz, rz * 1.02);
    g.addColorStop(0, 'rgba(20,8,2,0)');
    g.addColorStop(1, 'rgba(20,8,2,0.5)');
    c.save();
    c.translate(mx, mz);
    c.scale(rx / rz, 1);
    c.translate(-mx, -mz);
    c.fillStyle = g;
    c.fillRect(mx - rz * 1.2, mz - rz * 1.2, 2.4 * rz, 2.4 * rz);
    c.restore();
  }
  c.restore();
  for (const [ctx, value] of [[L.h, 196], [L.r, 128]]) {
    ctx.fillStyle = gray(value);
    ctx.beginPath();
    ctx.ellipse(mx, mz, rx, rz, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- the title: one cut-paper letter at a time
  {
    const probe = makeCanvas(4, 4).ctx;
    probe.font = `200px ${font.display}`;
    const capRatio = probe.measureText('H').actualBoundingBoxAscent / 200 || 0.7;
    const TRACK = 0.035; // extra advance between letters, in em
    const laid = COVER_TITLE.lines.map((line) => {
      let px = (line.cap * K) / capRatio;
      const measure = () => {
        const spec = `${Math.round(px)}px ${font.display}`;
        const glyphs = [...line.text].map((ch) => glyphMask(ch, spec));
        const width = glyphs.reduce((s, g) => s + g.advance, 0) + TRACK * px * Math.max(0, glyphs.length - 1);
        return { glyphs, width };
      };
      let m = measure();
      if (m.width > COVER_TITLE.width * K) {
        px *= (COVER_TITLE.width * K) / m.width;
        m = measure();
      }
      return { line, px, cap: px * capRatio, ...m };
    });
    const total = laid.reduce((s, l) => s + l.cap, 0) + COVER_TITLE.gap * K * (laid.length - 1);
    let top = Z(COVER_TITLE.z) - total / 2;
    let n = 0;
    for (const l of laid) {
      const baseline = top + l.cap;
      let pen = -l.width / 2;
      const chars = [...l.line.text];
      const ox = X(COVER_TITLE.x + l.line.dx);
      const cosT = Math.cos(l.line.tilt);
      const sinT = Math.sin(l.line.tilt);
      l.glyphs.forEach((g, i) => {
        const ch = chars[i];
        if (g.blank || ch === ' ' || ch === '\u00a0') {
          pen += g.advance + TRACK * l.px;
          return;
        }
        const gx = pen + (g.right - g.left) / 2; // glyph box centre along the line …
        const gy = (g.descent - g.ascent) / 2 + (rand() - 0.5) * 0.045 * K; // … and across it, with a little bounce
        gluePiece(L, g.canvas, {
          x: ox + gx * cosT - gy * sinT,
          y: baseline + gx * sinT + gy * cosT,
          rot: l.line.tilt + (rand() - 0.5) * 0.17,
          skew: (rand() - 0.5) * 0.07,
          scale: 0.97 + rand() * 0.07,
          color: PAL[l.line.colors[i % l.line.colors.length]],
          seed: 20 + n++,
        });
        pen += g.advance + TRACK * l.px;
      });
      top += l.cap + COVER_TITLE.gap * K;
    }
  }

  // ---- a few cut-paper hearts
  for (const [x, z, s, colour, rot] of [
    [2.02, -0.86, 0.105, 'tomato', 0.2],
    [0.88, 0.96, 0.06, 'mustard', -0.3],
    [1.06, 1.08, 0.04, 'sky', 0.25],
    [2.0, 0.88, 0.045, 'cream', 0.15],
  ]) {
    const r = s * K;
    const mask = shapeMask(2.6 * r, 2.2 * r, (ctx) => {
      heartPath(ctx, 1.3 * r, 1.1 * r, r);
      ctx.fill();
    });
    gluePiece(L, mask, { x: X(x), y: Z(z), color: PAL[colour], rot, seed: 60 + Math.round(x * 10), edgePx: 3.6, lift: 0.75 });
  }

  // ---- the names, in gold pen straight on the leather
  {
    let px = 0.27 * K;
    const spec = () => `700 ${Math.round(px)}px ${font.hand}`;
    c.font = spec();
    const maxW = 1.3 * K;
    const w = c.measureText(names).width;
    if (w > maxW) px *= maxW / w;
    const nx = X(MEDALLION.x);
    const nz = Z(NAMES_Z);
    for (const ctx of [c, L.h, L.r]) {
      ctx.save();
      ctx.translate(nx, nz);
      ctx.rotate(-0.035);
      ctx.font = spec();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
    }
    c.fillStyle = 'rgba(16,6,2,0.6)';
    c.fillText(names, 1.8, 2.4);
    const gold = c.createLinearGradient(0, -0.5 * px, 0, 0.5 * px);
    gold.addColorStop(0, GOLD_INK[0]);
    gold.addColorStop(1, GOLD_INK[1]);
    c.fillStyle = c.strokeStyle = gold;
    c.lineWidth = 1.6;
    c.strokeText(names, 0, 0);
    c.fillText(names, 0, 0);
    // A little swash under the names.
    const half = Math.min(maxW, c.measureText(names).width) * 0.36;
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-half, 0.56 * px);
    c.bezierCurveTo(-half * 0.4, 0.44 * px, half * 0.3, 0.7 * px, half, 0.52 * px);
    c.stroke();
    L.h.fillStyle = 'rgba(150,150,150,0.75)';
    L.h.fillText(names, 0, 0);
    L.r.fillStyle = L.r.strokeStyle = gray(96);
    L.r.lineWidth = 1.6;
    L.r.strokeText(names, 0, 0);
    L.r.fillText(names, 0, 0);
    for (const ctx of [c, L.h, L.r]) ctx.restore();
  }

  // ---- shadows of the real relief (frame, eyelets, cord, tassels), baked softly into the paint
  {
    const fr = MEDALLION.frame * K;
    softShadow(c, 12, 'rgba(14,5,1,0.75)', 5, 2, (ctx) => {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = fr * 1.05;
      ctx.beginPath();
      ctx.ellipse(mx, mz, rx + fr * 0.36, rz + fr * 0.36, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    for (const [ex, ez] of EYELETS) {
      softShadow(c, 9, 'rgba(14,5,1,0.8)', 3, 1, (ctx) => {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.03 * K;
        ctx.beginPath();
        ctx.arc(X(ex), Z(ez), 0.046 * K, 0, Math.PI * 2);
        ctx.stroke();
      });
      for (const [ctx, style] of [[c, '#0a0503'], [L.h, gray(0)]]) {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(X(ex), Z(ez), 0.034 * K, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const path of cord.shadows) {
      softShadow(c, path.blur ?? 10, `rgba(14,4,1,${path.alpha ?? 0.7})`, 4, 1.5, (ctx) => {
        ctx.strokeStyle = ctx.fillStyle = '#000';
        ctx.lineWidth = path.width * K;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        path.points.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
        if (path.fill) ctx.fill();
        ctx.stroke();
      });
    }
  }

  return { color: col.canvas, surface: packSurface(hgt.canvas, rgh.canvas) };
}

// ---------------------------------------------------------------------------------------------
// Geometry

const _uv = new THREE.Vector2();

/**
 * Rounded slab spanning x ∈ [0, w], y ∈ [0, t], z ∈ [−d/2, d/2]. Material groups follow
 * BoxGeometry: 0 +x, 1 −x, 2 +y (front), 3 −y (back), 4 +z, 5 −z. `uvOf(group, x, y, z, out)`
 * writes each vertex's UV.
 */
function slab(w, t, d, r, uvOf) {
  const geo = new RoundedBoxGeometry(w, t, d, 2, r);
  geo.translate(w / 2, t / 2, 0);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const perFace = pos.count / 6;
  for (let i = 0; i < pos.count; i++) {
    uvOf(Math.floor(i / perFace), pos.getX(i), pos.getY(i), pos.getZ(i), _uv);
    uv.setXY(i, _uv.x, _uv.y);
  }
  return geo;
}

/**
 * Cover board UVs. The painted face (front cover: +y) maps the cover painting; the fore-edge is
 * tiling leather, the hinge edge tiling cloth, and the head/tail edges and the inside face (the
 * turn-ins round the endpaper) take the trim band with u = x / COVER_W.
 */
function coverUV(paintedGroup) {
  return (group, x, y, z, out) => {
    if (group === paintedGroup) out.set(x / COVER_W, (COVER_D / 2 - z) / COVER_D);
    else if (group === 0) out.set(z / LEATHER_TILE, y / LEATHER_TILE);
    else if (group === 1) out.set(z / CLOTH_TILE, y / CLOTH_TILE);
    else if (group < 4) out.set(x / COVER_W, z / 0.4);
    else out.set(x / COVER_W, y / (2.5 * COVER_T));
  };
}

/** Card UVs: page art on the front (+y) and back (−y) faces, layered edge elsewhere. */
function boardUV(t) {
  return (group, x, y, z, out) => {
    const v = (D / 2 - z) / D;
    if (group === 2) out.set(x / W, v);
    else if (group === 3) out.set(1 - x / W, v);
    else if (group < 2) out.set(z / EDGE_TILE, y / t);
    else out.set(x / EDGE_TILE, y / t);
  };
}

/**
 * Flat quad at height y over x ∈ [x0, x1], z ∈ [z0, z1], facing +y (up) or −y. UVs map the
 * reference rectangle x ∈ [0, uw], z ∈ [−ud/2, ud/2] to [0, 1]² with v = 1 at the far edge;
 * `mirrorU` makes u run from the outer edge (u = 0) to the gutter (u = 1) — left pages.
 */
function sheet({ x0, x1, z0, z1, y, up, mirrorU = false, uw, ud }) {
  const u = (x) => (mirrorU ? 1 - x / uw : x / uw);
  const v = (z) => (ud / 2 - z) / ud;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3));
  const ny = up ? 1 : -1;
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([u(x0), v(z0), u(x0), v(z1), u(x1), v(z1), u(x1), v(z0)], 2));
  geo.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return geo;
}

/** Adds a per-vertex colour attribute from `pick(x, y, z, i)` → THREE.Color (linear). */
function colorize(geo, pick) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = pick(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Three-strand twisted cord along a smooth curve through `points` (THREE.Vector3[]): each strand is
 * its own little tube winding round the cord's axis, in its own colour.
 */
function ropeGeometry(points, colors, phase = 0) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const n = Math.max(6, Math.ceil(length / 0.0085));
  const frames = curve.computeFrenetFrames(n, false);
  const pts = curve.getSpacedPoints(n);
  const radial = 6;
  const strands = colors.length;
  const rings = n + 1;
  const count = strands * rings * radial;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const index = [];
  let v = 0;
  for (let j = 0; j < strands; j++) {
    const c = colors[j];
    for (let i = 0; i <= n; i++) {
      const th = phase + (j / strands) * Math.PI * 2 + (((i / n) * length) / ROPE_PITCH) * Math.PI * 2;
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const P = pts[i];
      const ox = Math.cos(th) * ROPE_OFFSET;
      const oy = Math.sin(th) * ROPE_OFFSET;
      const cx = P.x + ox * N.x + oy * B.x;
      const cy = P.y + ox * N.y + oy * B.y;
      const cz = P.z + ox * N.z + oy * B.z;
      for (let m = 0; m < radial; m++) {
        const a = (m / radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const dx = ca * N.x + sa * B.x;
        const dy = ca * N.y + sa * B.y;
        const dz = ca * N.z + sa * B.z;
        pos[v * 3] = cx + ROPE_STRAND_R * dx;
        pos[v * 3 + 1] = cy + ROPE_STRAND_R * dy;
        pos[v * 3 + 2] = cz + ROPE_STRAND_R * dz;
        nrm[v * 3] = dx;
        nrm[v * 3 + 1] = dy;
        nrm[v * 3 + 2] = dz;
        // Strands are darker where they tuck under their neighbours (towards the cord's axis).
        const tuck = 0.72 + 0.28 * Math.max(0, (ca * ox + sa * oy) / ROPE_OFFSET * 0.5 + 0.5);
        col[v * 3] = c.r * tuck;
        col[v * 3 + 1] = c.g * tuck;
        col[v * 3 + 2] = c.b * tuck;
        v++;
      }
    }
    const base = j * rings * radial;
    for (let i = 0; i < n; i++) {
      for (let m = 0; m < radial; m++) {
        const a = base + i * radial + m;
        const b = base + i * radial + ((m + 1) % radial);
        index.push(a, b, a + radial, b, b + radial, a + radial);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  return { geo, curve };
}

/**
 * Oval frame: `profile` ([offset across the moulding, height] pairs, inner edge → outer edge) swept
 * round the ellipse (rx, rz) in the XZ plane.
 */
function ovalFrameGeometry(rx, rz, profile, segments = 160) {
  const pc = profile.length;
  const pos = new Float32Array(segments * pc * 3);
  const index = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let nx = rz * ca;
    let nz = rx * sa;
    const nl = Math.hypot(nx, nz);
    nx /= nl;
    nz /= nl;
    for (let j = 0; j < pc; j++) {
      const k = (i * pc + j) * 3;
      pos[k] = rx * ca + nx * profile[j][0];
      pos[k + 1] = profile[j][1];
      pos[k + 2] = rz * sa + nz * profile[j][0];
    }
    const next = (i + 1) % segments;
    for (let j = 0; j < pc - 1; j++) {
      const p = i * pc + j;
      const q = next * pc + j;
      index.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** A tassel lying along +X from the origin: bound head, neck wrap and a flattened skirt of threads. */
function tasselGeometries(colors, rand) {
  const [gold, cream, dark] = colors;
  const tmp = new THREE.Color();
  const head = new THREE.SphereGeometry(0.03, 14, 10);
  head.scale(1.2, 0.82, 1);
  head.translate(0.03, 0.026, 0);
  colorize(head, (x, y, z) => tmp.copy(gold).multiplyScalar(0.82 + 0.18 * Math.sin(z * 520 + x * 160)));
  const neck = new THREE.CylinderGeometry(0.0225, 0.0235, 0.02, 14, 1, true);
  neck.rotateZ(Math.PI / 2);
  neck.scale(1, 0.85, 1);
  neck.translate(0.067, 0.026, 0);
  colorize(neck, () => dark);

  const radial = 22;
  const rows = 6;
  const x0 = 0.072;
  const len = 0.2;
  const r0 = 0.02;
  const r1 = 0.05;
  const flat = 0.5;
  const pos = [];
  const col = [];
  const index = [];
  const tint = [];
  const ripple = [];
  const ragged = [];
  for (let m = 0; m < radial; m++) {
    const pick = rand();
    tint.push((pick < 0.2 ? cream : pick < 0.3 ? dark : gold).clone().multiplyScalar(0.82 + rand() * 0.3));
    ripple.push(0.9 + rand() * 0.2);
    ragged.push((rand() - 0.5) * 0.03);
  }
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const r = r0 + (r1 - r0) * Math.pow(u, 0.75);
    for (let m = 0; m < radial; m++) {
      const a = (m / radial) * Math.PI * 2;
      const rr = r * (1 + (ripple[m] - 1) * u);
      pos.push(x0 + len * u + ragged[m] * u * u, 0.027 + rr * Math.cos(a) * flat, rr * Math.sin(a));
      const c = tint[m];
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let m = 0; m < radial; m++) {
      const a = i * radial + m;
      const b = i * radial + ((m + 1) % radial);
      index.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  // Close the cut end.
  const centre = pos.length / 3;
  pos.push(x0 + len * 0.97, 0.027, 0);
  col.push(gold.r * 0.5, gold.g * 0.5, gold.b * 0.5);
  for (let m = 0; m < radial; m++) index.push(rows * radial + m, rows * radial + ((m + 1) % radial), centre);
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  skirt.setIndex(index);
  skirt.computeVertexNormals();
  return { geos: [head, neck, skirt], length: x0 + len, halfWidth: r1 };
}

// ---------------------------------------------------------------------------------------------
// The cord: paths (cover frame, heights above the outer face) shared by the painted shadows and
// the geometry.

function cordLayout() {
  const R = ROPE_R;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const [e1, e2] = EYELETS;
  const [kx, kz] = KNOT;
  const top = R * 1.55;
  const runs = [
    // from the far eyelet down to the knot, and from the near eyelet up to it
    [V(e1[0], -0.03, e1[1]), V(e1[0], 0.006, e1[1] + 0.012), V(e1[0] + 0.004, R, e1[1] + 0.07), V(e1[0] + 0.014, R, e1[1] + 0.32),
      V(kx - 0.022, R, kz - 0.3), V(kx - 0.004, R * 1.2, kz - 0.09), V(kx, top, kz)],
    [V(e2[0], -0.03, e2[1]), V(e2[0], 0.006, e2[1] - 0.012), V(e2[0] - 0.003, R, e2[1] - 0.07), V(e2[0] - 0.014, R, e2[1] - 0.3),
      V(kx - 0.012, R, kz + 0.42), V(kx + 0.004, R * 1.25, kz + 0.11), V(kx, top, kz)],
    // the two tails
    [V(kx, top, kz), V(kx - 0.035, R * 1.3, kz + 0.07), V(kx - 0.1, R, kz + 0.2), V(kx - 0.145, R, kz + 0.37), V(kx - 0.155, R, kz + 0.48)],
    [V(kx, top, kz), V(kx + 0.035, R * 1.3, kz + 0.075), V(kx + 0.1, R, kz + 0.19), V(kx + 0.135, R, kz + 0.32), V(kx + 0.14, R, kz + 0.41)],
  ];
  // Bow loops: teardrops pinched at the knot. `deg` is measured from +x towards the far edge (−z).
  const loop = (deg, len, wide, lift) => {
    const th = (deg * Math.PI) / 180;
    const dx = Math.cos(th);
    const dz = -Math.sin(th);
    const pts = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const a = 0.16 + (i / steps) * (Math.PI * 2 - 0.32);
      const u = (len * (1 - Math.cos(a))) / 2;
      const w = (wide / 2) * Math.sin(a) * Math.pow(Math.sin(a / 2), 0.6);
      const s = Math.sin(a / 2);
      pts.push(V(kx + dx * u - dz * w, top + lift * s * s + 0.007 * Math.cos(a / 2), kz + dz * u + dx * w));
    }
    return pts;
  };
  runs.push(loop(146, 0.25, 0.15, 0.012), loop(30, 0.3, 0.165, 0.014));
  const tassels = [
    { at: runs[2][runs[2].length - 1], dir: [-0.1, 1] },
    { at: runs[3][runs[3].length - 1], dir: [0.12, 1] },
  ];
  for (const t of tassels) {
    const l = Math.hypot(t.dir[0], t.dir[1]);
    t.dir = [t.dir[0] / l, t.dir[1] / l];
  }
  return { runs, tassels, knot: KNOT, shadows: [] };
}

/** Builds the relief that lies on the front cover (group origin on the cover's outer face). */
function buildRelief(cord, brassMat) {
  const relief = new THREE.Group();
  relief.name = 'cover-relief';
  const colors = ROPE_HEX.map((hex) => new THREE.Color(hex));
  const cordMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  const add = (geo, mat) => {
    const mesh = shadowed(new THREE.Mesh(geo, mat));
    relief.add(mesh);
    return mesh;
  };

  cord.runs.forEach((points, i) => {
    const { geo, curve } = ropeGeometry(points, colors, i * 1.3);
    add(geo, cordMat);
    cord.shadows.push({ points: curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.02)).filter((p) => p.y > 0).map((p) => [p.x, p.z]), width: ROPE_R * 2 });
  });

  // The knot: a tight wrapped lump.
  const knot = new THREE.SphereGeometry(1, 18, 12);
  const tmp = new THREE.Color();
  colorize(knot, (x, y, z) => {
    const band = Math.floor(((Math.atan2(z, x) / (Math.PI * 2) + 1) * 7 + y * 1.6 + 7) % 3);
    return tmp.copy(colors[band]).multiplyScalar(0.8 + 0.2 * y);
  });
  knot.scale(0.05, 0.036, 0.043);
  knot.rotateY(0.5);
  knot.translate(cord.knot[0], 0.036, cord.knot[1]);
  add(knot, cordMat);
  cord.shadows.push({ points: [[cord.knot[0], cord.knot[1]]], width: 0.1, alpha: 0.6 });

  // Tassels.
  const rand = mulberry32(88);
  for (const t of cord.tassels) {
    const { geos, length, halfWidth } = tasselGeometries(colors, rand);
    const holder = new THREE.Group();
    holder.position.set(t.at.x, 0, t.at.z);
    holder.rotation.y = Math.atan2(-t.dir[1], t.dir[0]);
    for (const geo of geos) holder.add(shadowed(new THREE.Mesh(geo, cordMat)));
    relief.add(holder);
    const [dx, dz] = t.dir;
    const tip = [t.at.x + dx * length, t.at.z + dz * length];
    const neck = [t.at.x + dx * 0.07, t.at.z + dz * 0.07];
    cord.shadows.push({ points: [[t.at.x, t.at.z], neck], width: 0.058, alpha: 0.65 });
    cord.shadows.push({
      fill: true,
      width: 0.012,
      alpha: 0.6,
      blur: 12,
      points: [
        [neck[0] - dz * 0.02, neck[1] + dx * 0.02], [tip[0] - dz * halfWidth, tip[1] + dx * halfWidth],
        [tip[0] + dz * halfWidth, tip[1] - dx * halfWidth], [neck[0] + dz * 0.02, neck[1] - dx * 0.02],
      ],
    });
  }

  // Eyelets.
  for (const [x, z] of EYELETS) {
    const ring = new THREE.TorusGeometry(0.045, 0.0135, 10, 36);
    ring.rotateX(Math.PI / 2);
    ring.scale(1, 0.7, 1);
    ring.translate(x, 0.007, z);
    add(ring, brassMat);
  }

  // The medallion's frame: a rounded bead between two small steps.
  const half = MEDALLION.frame / 2;
  const profile = [[-half - 0.007, 0], [-half - 0.005, 0.006], [-half, 0.007]];
  for (let i = 0; i <= 8; i++) {
    const b = Math.PI * (1 - i / 8);
    profile.push([half * 0.94 * Math.cos(b), 0.007 + 0.019 * Math.sin(b)]);
  }
  profile.push([half, 0.007], [half + 0.011, 0.0055], [half + 0.013, 0]);
  const frame = ovalFrameGeometry(MEDALLION.rx + half * 0.72, MEDALLION.rz + half * 0.72, profile);
  frame.translate(MEDALLION.x, 0, MEDALLION.z);
  add(frame, brassMat);

  const box = new THREE.Box3().setFromObject(relief);
  return { relief, height: box.max.y };
}

// ---------------------------------------------------------------------------------------------
// Materials

/** Page-art material; darkens a soft strip along the gutter (gutter at u = gutterU). */
function pageMaterial(gutterU, grainTex) {
  const mat = new THREE.MeshStandardMaterial({
    color: BLANK_PAGE,
    roughness: 0.88,
    metalness: 0,
    bumpMap: grainTex,
    bumpScale: 0.35,
  });
  mat.defines = { GUTTER_U: gutterU.toFixed(1), PAGE_UNITS: W.toFixed(3) };
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGutter;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvGutter = abs( uv.x - GUTTER_U ) * PAGE_UNITS;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGutter;')
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          '\tfloat gutterNear = 1.0 - smoothstep( 0.0, 0.11, vGutter );',
          '\tfloat gutterFar = 1.0 - smoothstep( 0.0, 0.5, vGutter );',
          '\tdiffuseColor.rgb *= 1.0 - 0.3 * gutterNear * gutterNear - 0.07 * gutterFar;',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => `book-page-${gutterU}`;
  return mat;
}

function artTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function setArt(mat, canvas) {
  if (mat.map) mat.map.dispose();
  mat.map = artTexture(canvas);
  mat.color.set('#ffffff');
  mat.needsUpdate = true;
}

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Spine: a curved cloth shell from the back cover's outer gutter edge (Q[LEAVES]) to the front
// cover's (Q[0]), re-shaped every time the leaves move.

function createSpine(clothMat) {
  const n1 = SPINE_SEGMENTS + 1;
  const shellCount = 8 * n1; // outer, inner, far cap, near cap — two rows each
  const shell = new THREE.BufferGeometry();
  const sPos = new Float32Array(shellCount * 3);
  const sNrm = new Float32Array(shellCount * 3);
  const sUv = new Float32Array(shellCount * 2);
  const index = [];
  // UV scale follows the closed stack. 0.26 was tuned when that stack was 0.21 (seven leaves).
  const stackH = THICK.reduce((sum, thick) => sum + thick, 0);
  const closedLength = stackH * (0.26 / 0.21);
  for (let strip = 0; strip < 4; strip++) {
    for (let i = 0; i < n1; i++) {
      for (let r = 0; r < 2; r++) {
        const vi = strip * 2 * n1 + i * 2 + r;
        const s = i / SPINE_SEGMENTS;
        sUv[vi * 2] = (s * closedLength) / CLOTH_TILE;
        sUv[vi * 2 + 1] = strip < 2 ? ((r ? 0.5 : -0.5) * COVER_D) / CLOTH_TILE : (r * 0.01) / CLOTH_TILE;
      }
    }
  }
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const quad = (base, a, b, c, d, flip) => {
      if (flip) index.push(base + a, base + c, base + b, base + b, base + c, base + d);
      else index.push(base + a, base + b, base + c, base + b, base + d, base + c);
    };
    const a = i * 2;
    // outer (faces outward), inner (faces inward): rows r = 0 far (−z), 1 near (+z)
    quad(0, a, a + 1, a + 2, a + 3, false);
    quad(2 * n1, a, a + 1, a + 2, a + 3, true);
    // far cap (−z): rows r = 0 outer, 1 inner; near cap (+z) mirrored
    quad(4 * n1, a, a + 2, a + 1, a + 3, false);
    quad(6 * n1, a, a + 2, a + 1, a + 3, true);
  }
  shell.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  shell.setAttribute('normal', new THREE.BufferAttribute(sNrm, 3));
  shell.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  shell.setIndex(index);

  const mesh = shadowed(new THREE.Mesh(shell, clothMat));
  mesh.frustumCulled = false;
  mesh.name = 'spine';

  const zf = -COVER_D / 2;
  const zn = COVER_D / 2;
  const put = (arr, vi, x, y, z) => {
    arr[vi * 3] = x;
    arr[vi * 3 + 1] = y;
    arr[vi * 3 + 2] = z;
  };

  /** Re-shapes the spine as a cubic from (x0, y0) to (x3, y3), all in group coordinates. */
  function update(x0, y0, x3, y3) {
    const cx = x3 - x0;
    const cy = y3 - y0;
    const chord = Math.hypot(cx, cy);
    const bx = -cy * SPINE_BULGE; // bulge = chord rotated +90°: outward, away from the block
    const by = cx * SPINE_BULGE;
    const x1 = x0 + bx;
    const y1 = y0 + by;
    const x2 = x3 + bx;
    const y2 = y3 + by;
    const th = Math.min(0.008, 0.25 * chord);
    let lastTx = -1;
    let lastTy = 0;
    for (let i = 0; i < n1; i++) {
      const s = i / SPINE_SEGMENTS;
      const m = 1 - s;
      const px = m * m * m * x0 + 3 * m * m * s * x1 + 3 * m * s * s * x2 + s * s * s * x3;
      const py = Math.max(0.0004, m * m * m * y0 + 3 * m * m * s * y1 + 3 * m * s * s * y2 + s * s * s * y3);
      let tx = 3 * m * m * (x1 - x0) + 6 * m * s * (x2 - x1) + 3 * s * s * (x3 - x2);
      let ty = 3 * m * m * (y1 - y0) + 6 * m * s * (y2 - y1) + 3 * s * s * (y3 - y2);
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-9) {
        tx /= tl;
        ty /= tl;
        lastTx = tx;
        lastTy = ty;
      } else {
        tx = lastTx;
        ty = lastTy;
      }
      const nx = -ty; // outward normal = tangent rotated +90°
      const ny = tx;
      const ix = px - nx * th;
      const iy = Math.max(0.0002, py - ny * th);
      for (let r = 0; r < 2; r++) {
        const z = r ? zn : zf;
        const o = i * 2 + r;
        put(sPos, o, px, py, z);
        put(sNrm, o, nx, ny, 0);
        put(sPos, 2 * n1 + o, ix, iy, z);
        put(sNrm, 2 * n1 + o, -nx, -ny, 0);
      }
      put(sPos, 4 * n1 + i * 2, px, py, zf);
      put(sPos, 4 * n1 + i * 2 + 1, ix, iy, zf);
      put(sNrm, 4 * n1 + i * 2, 0, 0, -1);
      put(sNrm, 4 * n1 + i * 2 + 1, 0, 0, -1);
      put(sPos, 6 * n1 + i * 2, px, py, zn);
      put(sPos, 6 * n1 + i * 2 + 1, ix, iy, zn);
      put(sNrm, 6 * n1 + i * 2, 0, 0, 1);
      put(sNrm, 6 * n1 + i * 2 + 1, 0, 0, 1);
    }
    shell.attributes.position.needsUpdate = true;
    shell.attributes.normal.needsUpdate = true;
  }

  return { mesh, update };
}

// ---------------------------------------------------------------------------------------------

const _lightPos = new THREE.Vector3();
const _bookPos = new THREE.Vector3();

/**
 * Light reaching the book from the scene it is in (spot lights by distance, plus the hemisphere
 * fill), relative to REFERENCE_IRRADIANCE: ≈ 1 under the film's lamp at full, 0 in the dark.
 */
function measureLight(group, cache) {
  let root = group;
  while (root.parent) root = root.parent;
  if (root === group) return 1; // not in a scene (yet)
  if (cache.root !== root || cache.count !== root.children.length) {
    cache.root = root;
    cache.count = root.children.length;
    cache.lights = [];
    root.traverse((o) => {
      if (o.isSpotLight || o.isHemisphereLight) cache.lights.push(o);
    });
  }
  if (!cache.lights.length) return 1;
  group.getWorldPosition(_bookPos);
  _bookPos.x += COVER_W / 2;
  let sum = 0;
  for (const light of cache.lights) {
    if (!light.visible) continue;
    if (light.isSpotLight) {
      const d2 = Math.max(1, light.getWorldPosition(_lightPos).distanceToSquared(_bookPos));
      sum += light.intensity / d2;
    } else sum += light.intensity;
  }
  return Math.min(1.5, sum / REFERENCE_IRRADIANCE);
}

/**
 * createBook({ photos, fonts, title, names }) →
 *   { group, setLeafAngles(φ[LEAVES]), getSpreadAnchor(k), setPageArt(k, {left, right}), update(t, lampLevel?) }
 *
 * photos  result of loadPhotos(); photos.cover (canvas | null) goes into the cover medallion, null →
 *         a cut-paper heart emblem.
 * fonts   the FONT map ({ display, hand }); call after loadFonts() so the canvas can use the faces.
 * title   cut-paper capitals. English is three lines (OUR / LOVE / STORY). Spanish
 *         "NUESTRA HISTORIA DE AMOR" is three lines too (NUESTRA / HISTORIA / DE AMOR).
 *         Default is the active language's cover title.
 * names   default timeline.COUPLE.names.
 */
export function createBook({ photos = null, fonts = null, title = null, names = null } = {}) {
  const group = new THREE.Group();
  group.name = 'book';
  const font = { display: (fonts && fonts.display) || FONT.display, hand: (fonts && fonts.hand) || FONT.hand };
  const coupleNames = names || (timeline.COUPLE && timeline.COUPLE.names) || 'Brian & Marlin';
  selectCoverLayout(title || tr('coverTitle'));

  // Shared textures and materials.
  const leather = paintLeather(PAL.leather, 11);
  const cloth = paintCloth(PAL.spine, 17);
  const clothMat = new THREE.MeshPhysicalMaterial({
    map: tiledTexture(cloth.color, true),
    roughness: 1,
    roughnessMap: tiledTexture(cloth.surface, false),
    bumpMap: tiledTexture(cloth.surface, false),
    bumpScale: 0.9,
    sheen: 0.6,
    sheenColor: new THREE.Color(PAL.spine).lerp(new THREE.Color('#ffd9c4'), 0.45),
    sheenRoughness: 0.5,
  });
  const leatherSurface = tiledTexture(leather.surface, false);
  const leatherMat = new THREE.MeshStandardMaterial({
    map: tiledTexture(leather.color, true),
    roughness: 1,
    roughnessMap: leatherSurface,
    bumpMap: leatherSurface,
    bumpScale: 1.1,
  });
  const trimTex = tiledTexture(paintTrim(leather, cloth), true);
  trimTex.wrapS = THREE.ClampToEdgeWrapping;
  const trimMat = new THREE.MeshStandardMaterial({ map: trimTex, roughness: 0.8 });

  const brassEnv = new THREE.CanvasTexture(paintBrassEnv());
  brassEnv.mapping = THREE.EquirectangularReflectionMapping;
  brassEnv.colorSpace = THREE.SRGBColorSpace;
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#d2a857',
    metalness: 1,
    roughness: 0.34,
    envMap: brassEnv,
    envMapIntensity: BRASS_ENV_INTENSITY,
  });

  const cord = cordLayout();
  const { relief, height: reliefHeight } = buildRelief(cord, brassMat);
  const coverArt = paintCover({ leather, cloth, photo: photos ? photos.cover : null, font, title, names: coupleNames, cord });
  const coverSurface = new THREE.CanvasTexture(coverArt.surface);
  coverSurface.anisotropy = 8;
  const coverMat = new THREE.MeshStandardMaterial({
    map: artTexture(coverArt.color),
    roughness: 1,
    roughnessMap: coverSurface,
    bumpMap: coverSurface,
    bumpScale: 1.6,
  });

  const edgeTex = tiledTexture(paintEdge(23), true);
  const edgeTints = ['#ffffff', '#f1e3c8', '#fbf3e2', '#ead8b6', '#f6ecd6'];
  const edgeMats = edgeTints.map((tint) => new THREE.MeshStandardMaterial({ map: edgeTex, color: tint, roughness: 0.94, bumpMap: edgeTex, bumpScale: 0.5 }));
  // The cards' gutter-side faces: where two pages meet, their rounded edges show a sliver of this
  // face, which would catch the lamp as a bright seam line; inside a real gutter it is in the shade
  // of the fold.
  const gutterEdgeMat = edgeMats[0].clone();
  gutterEdgeMat.color.setScalar(0.3);
  const grainTex = tiledTexture(paintGrain(37), false);
  grainTex.repeat.set(W / 0.35, D / 0.35);

  // Page materials: front[i] = front face of leaf i (right page of spread i), back[i] = back face
  // of leaf i (left page of spread i + 1). The covers' outer faces have none.
  const front = [];
  const back = [];
  const leaves = [];
  const irregular = mulberry32(5);
  for (let i = 0; i < LEAVES; i++) {
    const pivot = new THREE.Group();
    pivot.name = `leaf-${i}`;
    const t = THICK[i];
    const part = (mesh) => {
      mesh.userData.leafPart = true; // counted by dev/book.html's overlap sweep
      pivot.add(shadowed(mesh));
    };
    if (i === 0 || i === LEAVES - 1) {
      const isFront = i === 0;
      const bodyGeo = slab(COVER_W, t - SHEET_LIFT, COVER_D, COVER_R, coverUV(isFront ? 2 : -1));
      if (isFront) bodyGeo.translate(0, SHEET_LIFT, 0);
      // groups: +x fore-edge, −x hinge edge, +y, −y, +z, −z
      const mats = isFront
        ? [leatherMat, clothMat, coverMat, trimMat, trimMat, trimMat]
        : [leatherMat, clothMat, trimMat, trimMat, trimMat, trimMat];
      part(new THREE.Mesh(bodyGeo, mats));
      // Endpaper (the spread's printed page) pasted on the cover's inside.
      const mat = pageMaterial(isFront ? 1 : 0, grainTex);
      setArt(mat, paintEndpaper(isFront ? 41 : 43));
      const endpaper = sheet({ x0: 0, x1: W, z0: -D / 2, z1: D / 2, y: isFront ? 0 : t, up: !isFront, mirrorU: isFront, uw: W, ud: D });
      part(new THREE.Mesh(endpaper, mat));
      if (isFront) {
        back[i] = mat;
        relief.position.y = t;
        pivot.add(relief);
      } else front[i] = mat;
    } else {
      front[i] = pageMaterial(0, grainTex);
      back[i] = pageMaterial(1, grainTex);
      // A hand-cut stack: every card a hair different in size (the printed area stays W × D).
      const ex = -0.012 + irregular() * 0.017;
      const ef = -0.005 + irregular() * 0.011;
      const en = -0.005 + irregular() * 0.011;
      const geo = new RoundedBoxGeometry(W + ex, t, D + ef + en, 2, BOARD_R);
      geo.translate((W + ex) / 2, t / 2, (en - ef) / 2);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const perFace = pos.count / 6;
      const uvOf = boardUV(t);
      for (let v = 0; v < pos.count; v++) {
        uvOf(Math.floor(v / perFace), pos.getX(v), pos.getY(v), pos.getZ(v), _uv);
        uv.setXY(v, _uv.x, _uv.y);
      }
      const edgeMat = edgeMats[(i * 2) % edgeMats.length];
      part(new THREE.Mesh(geo, [edgeMat, gutterEdgeMat, front[i], back[i], edgeMat, edgeMat]));
    }
    group.add(pivot);
    leaves.push(pivot);
  }

  const spine = createSpine(clothMat);
  group.add(spine.mesh);

  // Grounding: a dark recessed plinth under whichever pile hovers, and soft contact shadows.
  const skirtGeo = new THREE.BoxGeometry(1, 1, 1);
  skirtGeo.translate(0, 0.5, 0);
  const skirtMat = new THREE.MeshStandardMaterial({ color: SKIRT_COLOR, roughness: 1 });
  const skirtWidth = COVER_W - SKIRT_IN - SKIRT_IN_HINGE;
  const skirtCentre = (SKIRT_IN_HINGE + COVER_W - SKIRT_IN) / 2;
  const skirts = [0, 1].map((side) => {
    const mesh = new THREE.Mesh(skirtGeo, skirtMat);
    mesh.name = side ? 'plinth-right' : 'plinth-left';
    mesh.receiveShadow = true;
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });
  const contactTex = new THREE.CanvasTexture(paintContactShadow());
  const contactGeo = new THREE.PlaneGeometry(COVER_W + 2 * CONTACT_MARGIN, COVER_D + 2 * CONTACT_MARGIN);
  contactGeo.rotateX(-Math.PI / 2);
  const contacts = [0, 1].map((side) => {
    const mat = new THREE.MeshBasicMaterial({
      map: contactTex, color: '#000000', transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(contactGeo, mat);
    mesh.name = side ? 'contact-right' : 'contact-left';
    mesh.position.y = 0.0015;
    mesh.renderOrder = -1;
    group.add(mesh);
    return mesh;
  });

  const anchors = [];
  for (let k = 1; k < LEAVES; k++) {
    const anchor = new THREE.Object3D();
    anchor.name = `spread-anchor-${k}`;
    group.add(anchor);
    anchors.push(anchor);
  }

  // Hinge chain scratch (no per-frame allocation).
  const qx = new Float64Array(LEAVES + 1);
  const qy = new Float64Array(LEAVES + 1);
  const phi = new Float64Array(LEAVES);
  const last = new Float64Array(LEAVES).fill(NaN);

  function setLeafAngles(phis) {
    let changed = false;
    for (let i = 0; i < LEAVES; i++) {
      phi[i] = i === LEAVES - 1 ? 0 : phis[i] ?? 0;
      if (phi[i] !== last[i]) changed = true;
      last[i] = phi[i];
    }
    if (!changed) return;
    qx[LEAVES] = 0;
    qy[LEAVES] = 0;
    let minY = 0;
    for (let i = LEAVES - 1; i >= 0; i--) {
      const c = Math.cos(phi[i]);
      const s = Math.sin(phi[i]);
      const t = THICK[i];
      const w = i === 0 || i === LEAVES - 1 ? COVER_W : W;
      qx[i] = qx[i + 1] - t * s;
      qy[i] = qy[i + 1] + t * c;
      // Lowest corner of the leaf's cross-section: corners (0|w, 0|t) rotated by φ.
      const y0 = qy[i + 1];
      minY = Math.min(minY, y0, y0 + w * s, y0 + t * c, y0 + w * s + t * c);
    }
    const lift = -minY;
    for (let i = 0; i < LEAVES; i++) {
      leaves[i].position.set(qx[i + 1], qy[i + 1] + lift, 0);
      leaves[i].rotation.z = phi[i];
    }
    for (let k = 1; k < LEAVES; k++) {
      anchors[k - 1].position.set(qx[k], qy[k] + lift, 0);
      anchors[k - 1].rotation.z = phi[k];
    }
    spine.update(qx[LEAVES], qy[LEAVES] + lift, qx[0], qy[0] + lift);

    // The cover's relief: pressed flat as far as the clearance under the turned cover demands.
    const c0 = Math.cos(phi[0]);
    const s0 = Math.sin(phi[0]);
    let press = 1;
    if (c0 < 0) {
      const clear = leaves[0].position.y + RELIEF_X0 * s0 + COVER_T * c0 - RELIEF_GAP;
      press = Math.min(1, Math.max(0, clear / (reliefHeight * -c0)));
    }
    relief.visible = press > 0.03;
    relief.scale.y = Math.max(press, 0.03);

    // Plinths and contact shadows. `down`: the front cover has (all but) landed on the left.
    const down = 1 - THREE.MathUtils.smoothstep(Math.PI - phi[0], 0, 0.08);
    const hx = leaves[0].position.x;
    const gapLeft = (leaves[0].position.y - COVER_T) * down;
    const gapRight = lift;
    const depth = COVER_D - 2 * SKIRT_IN;
    skirts[0].visible = gapLeft > 0.002;
    if (skirts[0].visible) {
      skirts[0].position.set(hx - skirtCentre, 0, 0);
      skirts[0].scale.set(skirtWidth, gapLeft - 0.0006, depth);
    }
    skirts[1].visible = gapRight > 0.002;
    if (skirts[1].visible) {
      skirts[1].position.set(skirtCentre, 0, 0);
      skirts[1].scale.set(skirtWidth, gapRight - 0.0006, depth);
    }
    contacts[0].position.x = hx - COVER_W / 2;
    contacts[0].material.opacity = CONTACT_OPACITY * down;
    contacts[0].visible = down > 0;
    contacts[1].position.x = COVER_W / 2;
    contacts[1].material.opacity = CONTACT_OPACITY;
  }

  function setPageArt(k, { left, right } = {}) {
    if (k < 1 || k >= LEAVES) return;
    if (left) setArt(back[k - 1], left);
    if (right) setArt(front[k], right);
  }

  const lightCache = { root: null, count: -1, lights: [] };

  /**
   * Follows the scene's light with the brass's private reflections. `lampLevel` (0 = dark … 1 = the
   * lamp at full, may exceed 1) is optional: without it the level is measured from the scene's own
   * lights. `t` is unused — the book has no schedule of its own.
   */
  function update(t, lampLevel) {
    const level = typeof lampLevel === 'number' ? lampLevel : measureLight(group, lightCache);
    brassMat.envMapIntensity = BRASS_ENV_INTENSITY * (BRASS_ENV_FLOOR + (1 - BRASS_ENV_FLOOR) * Math.max(0, level));
  }

  setLeafAngles(new Array(LEAVES).fill(0));
  update(0);
  return {
    group,
    setLeafAngles,
    getSpreadAnchor: (k) => anchors[k - 1],
    setPageArt,
    update,
    coverCanvas: coverArt.color, // for dev/book.html (?tex=1)
  };
}
