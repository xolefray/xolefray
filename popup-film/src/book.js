/**
 * book.js — the hardcover pop-up book: five hinged leaves, a cloth spine, the gold-foil cover
 * and the four spread anchors (contract §3, §3.1, §3.2, §4 "src/book.js").
 *
 * Leaves: 0 = front cover, 1..3 = printed boards, 4 = back cover. Every leaf is a rounded slab in
 * its own local frame (x ∈ [0, w] from its gutter edge, y ∈ [0, t] from its BACK face to its FRONT
 * face, z centred) and is turned by exactly its φ about a Z-parallel hinge line at its gutter edge.
 *
 * Hinge chain (why gutters stay clean and nothing interpenetrates): leaf i's back-face gutter edge
 * sits on point Q[i+1] and its front-face gutter edge is Q[i] = Q[i+1] + t_i·n(φ_i), with
 * n(φ) = (−sin φ, cos φ) and Q[5] the back cover's outer gutter edge. So the two printed surfaces of
 * spread k (back face of leaf k−1, front face of leaf k) both start on the line through Q[k] for
 * every opening angle — during turns too. Adjacent leaves only ever touch along that line, so no
 * two leaves can overlap; the pile that is not under the turning leaf just glides around a circle
 * of radius t_k while the leaf turns. The chain is finally lifted so that its lowest corner rests on
 * the desk (y = 0); because the two open piles have different thicknesses, the thinner pile floats
 * a little (≤ 3·BOARD_T) and, from spread 3 on, the book rests on the left pile instead of the back
 * cover — the honest pose of a rigid book whose open spread is perfectly flat.
 *
 * Anchor k sits on Q[k] rotated by φ_k: origin on the right page's printed surface at the gutter,
 * +X along the right page, +Y its normal, +Z toward the reader; the left page (back of leaf k−1)
 * leaves the same Z axis in direction L(α_k) exactly. Page art (§3.2) is mapped with explicit UVs:
 * front faces u = x/W, back faces u = 1 − x/W, v = 1 at the far edge; the page shader darkens a
 * soft strip along the gutter. Covers are woven red book-cloth (sheen + roughness/bump weave) with
 * a gold-foil decal (title, paper-boat emblem, double border rule) that reflects its own small
 * warm environment so the foil reads as metal whatever the scene's lighting setup.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './util/rng.js';

export const BOOK = { PAGE_W: 3, PAGE_D: 4, BOARD_T: 0.035, LEAVES: 5 };

const { PAGE_W: W, PAGE_D: D, BOARD_T: T, LEAVES } = BOOK;
const COVER_T = 0.045; // cover board thickness (boards are T)
const OVERHANG = 0.06; // cover "squares" beyond the boards on the three outer sides
const COVER_W = W + OVERHANG;
const COVER_D = D + 2 * OVERHANG;
const BOARD_R = 0.006; // edge rounding radii
const COVER_R = 0.009;
const SHEET_LIFT = 0.0008; // endpaper sheets sit this far off the cover cloth
const DECAL_LIFT = 0.0006; // gold foil decals float this far off the cloth
const CLOTH_TILE = 0.4; // world units covered by one cloth texture tile
const EDGE_TILE = 1.0; // world units covered by one layered-edge texture tile
const THICK = [COVER_T, T, T, T, COVER_T];
const SERIF = 'Georgia, "Bitstream Charter", Caladea, "Liberation Serif", "DejaVu Serif", serif';
const FOIL_RGB = [238, 200, 118];
const BLANK_PAGE = '#f3ead8';
const GOLD_ENV_INTENSITY = 1.15;
const SPINE_SEGMENTS = 16;
const SPINE_BULGE = 0.35; // spine control-point offset as a fraction of the cover-to-cover chord

// ---------------------------------------------------------------------------------------------
// Canvas painters (all deterministic)

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

/**
 * Plain-weave book cloth tile (512 px = CLOTH_TILE units, wraps seamlessly).
 * Returns { color, surface } canvases; surface R = height (bump), G = roughness.
 */
function paintCloth(baseHex, seed) {
  const S = 512;
  const P = 8; // thread pitch in px (≈0.6 mm)
  const N = S / P;
  const rand = mulberry32(seed);
  const base = srgb255(baseHex);
  const warp = new Float32Array(N);
  const weft = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    warp[i] = (rand() - 0.5) * 0.1 + (rand() < 0.06 ? 0.08 : 0);
    weft[i] = (rand() - 0.5) * 0.1 + (rand() < 0.06 ? -0.07 : 0);
  }
  const mottle = lattice(8, rand);
  const fuzz = lattice(64, rand);
  const color = makeCanvas(S, S);
  const surface = makeCanvas(S, S);
  const cd = color.ctx.createImageData(S, S);
  const sd = surface.ctx.createImageData(S, S);
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
      const m = sampleLattice(mottle, 8, (x / S) * 8, (y / S) * 8);
      const f = sampleLattice(fuzz, 64, (x / S) * 64, (y / S) * 64);
      const shade = (0.68 + 0.4 * h + (warpOver ? warp[i] : weft[j]) + 0.05 * m + 0.03 * f) * (warpOver ? 1.04 : 0.95);
      const k = (y * S + x) * 4;
      cd.data[k] = clamp255(base[0] * shade + 6 * h);
      cd.data[k + 1] = clamp255(base[1] * shade + 2 * h);
      cd.data[k + 2] = clamp255(base[2] * shade);
      cd.data[k + 3] = 255;
      sd.data[k] = clamp255(255 * (0.12 + 0.78 * h + 0.05 * f));
      sd.data[k + 1] = clamp255(255 * (0.94 - 0.2 * h + 0.04 * m));
      sd.data[k + 2] = 0;
      sd.data[k + 3] = 255;
    }
  }
  color.ctx.putImageData(cd, 0, 0);
  surface.ctx.putImageData(sd, 0, 0);
  return { color: color.canvas, surface: surface.canvas };
}

/** Board edge: laminated cream paper plies across the thickness (v), fibre streaks along u. */
function paintEdge(seed) {
  const Wpx = 512;
  const Hpx = 64;
  const rand = mulberry32(seed);
  // [top row, colour] from the board's top (canvas y = 0 → v = 1) down to its bottom.
  const plies = [
    [0, '#f8f2e4'], [3, '#c9b993'], [4, '#efe5cd'], [17, '#d9cba9'], [18, '#e9dcbf'],
    [31, '#d6c7a4'], [32, '#f1e7d1'], [46, '#d9cba9'], [47, '#e6d8b9'], [60, '#c9b993'], [61, '#f8f2e4'],
  ].map(([row, hex]) => [row, srgb255(hex)]);
  const fib = lattice(64, rand);
  const { canvas, ctx } = makeCanvas(Wpx, Hpx);
  const img = ctx.createImageData(Wpx, Hpx);
  let p = 0;
  for (let y = 0; y < Hpx; y++) {
    while (p + 1 < plies.length && plies[p + 1][0] <= y) p++;
    const c = plies[p][1];
    for (let x = 0; x < Wpx; x++) {
      const n = 0.045 * sampleLattice(fib, 64, x / 8, y * 0.6) + 0.025 * (rand() - 0.5);
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

/** Small warm equirectangular "room" the gold foil reflects (PMREM'd by the renderer). */
function paintGoldEnv() {
  const { canvas, ctx } = makeCanvas(512, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#fff3da');
  sky.addColorStop(0.3, '#e8c48e');
  sky.addColorStop(0.5, '#8a6440');
  sky.addColorStop(0.62, '#3c2a1c');
  sky.addColorStop(1, '#140d08');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  for (const [x, y, r, a] of [[150, 40, 70, 1], [400, 70, 90, 0.55]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,248,230,${a})`);
    g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
  }
  return canvas;
}

/** Classic origami paper boat, filled, with its folds cut out as hairlines. */
function drawBoat(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx - s, cy);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx + 0.64 * s, cy + 0.42 * s);
  ctx.lineTo(cx - 0.64 * s, cy + 0.42 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 0.54 * s, cy);
  ctx.lineTo(cx, cy - 0.98 * s);
  ctx.lineTo(cx + 0.54 * s, cy);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, 0.035 * s);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 0.9 * s);
  ctx.lineTo(cx, cy - 0.04 * s);
  ctx.moveTo(cx - 0.97 * s, cy + 0.035 * s);
  ctx.lineTo(cx + 0.97 * s, cy + 0.035 * s);
  ctx.moveTo(cx - 0.54 * s, cy + 0.07 * s);
  ctx.lineTo(cx - 0.36 * s, cy + 0.4 * s);
  ctx.moveTo(cx + 0.54 * s, cy + 0.07 * s);
  ctx.lineTo(cx + 0.36 * s, cy + 0.4 * s);
  ctx.stroke();
  ctx.restore();
}

function drawWaves(ctx, cx, cy, s, lw) {
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (let row = 0; row < 2; row++) {
    const half = s * (1.05 - row * 0.3);
    const y = cy + row * 0.17 * s;
    const n = 6 - row * 2;
    const step = (2 * half) / n;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    for (let i = 0; i < n; i++) {
      const x0 = cx - half + i * step;
      ctx.quadraticCurveTo(x0 + step / 2, y + (i % 2 ? 0.07 : -0.07) * s, x0 + step, y);
    }
    ctx.stroke();
  }
}

function drawDiamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

/** Splits a title into two balanced lines at a word boundary. */
function titleLines(title) {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return [title];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function fitFont(ctx, text, style, px, maxWidth) {
  ctx.font = `${style} ${px}px ${SERIF}`;
  const w = ctx.measureText(text).width;
  if (w > maxWidth) ctx.font = `${style} ${Math.floor((px * maxWidth) / w)}px ${SERIF}`;
}

/** Front-cover foil artwork (white on transparent = foil mask), canvas spans the whole cover. */
function drawCoverFoil(ctx, w, h, title) {
  const k = w / COVER_W; // px per world unit
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  // Double border rule with small diamond corner ornaments.
  const outer = 0.15 * k;
  const inner = 0.19 * k;
  ctx.lineWidth = 0.016 * k;
  ctx.strokeRect(outer, outer, w - 2 * outer, h - 2 * outer);
  ctx.lineWidth = 0.006 * k;
  ctx.strokeRect(inner, inner, w - 2 * inner, h - 2 * inner);
  for (const [x, y] of [[inner, inner], [w - inner, inner], [inner, h - inner], [w - inner, h - inner]]) {
    drawDiamond(ctx, x, y, 0.035 * k);
  }
  // Title.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lines = titleLines(title);
  const maxW = w - 2 * inner - 0.3 * k;
  if (lines.length === 2) {
    fitFont(ctx, lines[0], 'italic 600', Math.round(0.23 * k), maxW);
    ctx.fillText(lines[0], w / 2, 0.205 * h);
    fitFont(ctx, lines[1], 'italic 700', Math.round(0.4 * k), maxW);
    ctx.fillText(lines[1], w / 2, 0.205 * h + 0.42 * k);
  } else {
    fitFont(ctx, lines[0], 'italic 700', Math.round(0.4 * k), maxW);
    ctx.fillText(lines[0], w / 2, 0.27 * h);
  }
  // Ornamental rule under the title.
  const ry = 0.37 * h;
  ctx.lineWidth = 0.008 * k;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 0.55 * k, ry);
  ctx.lineTo(w / 2 - 0.07 * k, ry);
  ctx.moveTo(w / 2 + 0.07 * k, ry);
  ctx.lineTo(w / 2 + 0.55 * k, ry);
  ctx.stroke();
  drawDiamond(ctx, w / 2, ry, 0.04 * k);
  // Paper-boat emblem riding two lines of waves.
  drawBoat(ctx, w / 2, 0.6 * h, 0.5 * k);
  drawWaves(ctx, w / 2, 0.6 * h + 0.3 * k, 0.5 * k, 0.012 * k);
  // Footer.
  ctx.font = `600 ${Math.round(0.1 * k)}px ${SERIF}`;
  ctx.letterSpacing = `${Math.round(0.035 * k)}px`;
  ctx.fillText('A  POP-UP  BOOK', w / 2, 0.86 * h);
  ctx.letterSpacing = '0px';
}

/** Spine foil: head and tail bands, the title running head → tail, a small boat near the tail. */
function drawSpineFoil(ctx, w, h, title) {
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  for (const v of [0.055, 0.945]) {
    const y = v * h;
    ctx.fillRect(4, y - 7, w - 8, 6);
    ctx.fillRect(4, y + 4, w - 8, 2.5);
    ctx.fillRect(4, y - 12, w - 8, 2.5);
  }
  ctx.save();
  ctx.translate(w / 2, 0.42 * h);
  ctx.rotate(Math.PI / 2); // text runs toward the tail (+z), letters' tops toward the front cover
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, title, 'italic 700', Math.round(0.36 * w), 0.6 * h);
  ctx.fillText(title, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(w / 2, 0.82 * h);
  ctx.rotate(Math.PI / 2);
  drawBoat(ctx, 0, 0.12 * w, 0.26 * w);
  ctx.restore();
}

/**
 * Turns a white-on-transparent foil mask into foil textures: RGBA colour (gold + a faint debossed
 * shadow halo) and a surface map (R = bump, G = roughness, B = metalness).
 */
function foilTextures(w, h, draw, seed) {
  const mask = makeCanvas(w, h);
  draw(mask.ctx, w, h);
  const halo = makeCanvas(w, h);
  halo.ctx.filter = 'blur(2.5px)';
  halo.ctx.drawImage(mask.canvas, 1, 2);
  const md = mask.ctx.getImageData(0, 0, w, h).data;
  const hd = halo.ctx.getImageData(0, 0, w, h).data;
  const rand = mulberry32(seed);
  const crinkle = lattice(64, rand);
  const color = makeCanvas(w, h);
  const surface = makeCanvas(w, h);
  const cd = color.ctx.createImageData(w, h);
  const sd = surface.ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const a = md[k + 3] / 255;
      const shadow = (hd[k + 3] / 255) * 0.32 * (1 - a);
      const n = sampleLattice(crinkle, 64, x / 9, y / 9) * 0.7 + (rand() - 0.5) * 0.3;
      const outA = a + shadow;
      const g = (0.93 + 0.1 * n) * (outA > 0 ? a / outA : 0);
      cd.data[k] = clamp255(FOIL_RGB[0] * g);
      cd.data[k + 1] = clamp255(FOIL_RGB[1] * g);
      cd.data[k + 2] = clamp255(FOIL_RGB[2] * g);
      cd.data[k + 3] = clamp255(255 * outA);
      sd.data[k] = clamp255(255 * (0.3 + 0.55 * a + 0.12 * n * a));
      sd.data[k + 1] = clamp255(255 * (0.9 - a * (0.62 - 0.1 * n)));
      sd.data[k + 2] = clamp255(255 * a);
      sd.data[k + 3] = 255;
    }
  }
  color.ctx.putImageData(cd, 0, 0);
  surface.ctx.putImageData(sd, 0, 0);
  const colorTex = new THREE.CanvasTexture(color.canvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = 8;
  const surfaceTex = new THREE.CanvasTexture(surface.canvas);
  surfaceTex.anisotropy = 8;
  return { colorTex, surfaceTex };
}

function tiledTexture(canvas, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

/** Cloth UVs in world units so one tiling weave lines up on every face. */
function clothUV(group, x, y, z, out) {
  if (group === 2 || group === 3) out.set(x / CLOTH_TILE, z / CLOTH_TILE);
  else if (group < 2) out.set(z / CLOTH_TILE, y / CLOTH_TILE);
  else out.set(x / CLOTH_TILE, y / CLOTH_TILE);
}

/** Board UVs: §3.2 page art on the front (+y) and back (−y) faces, layered edge elsewhere. */
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
 * `mirrorU` makes u run from the outer edge (u = 0) to the gutter (u = 1) — §3.2 left pages.
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

// ---------------------------------------------------------------------------------------------
// Materials

/** Page-art material; darkens a soft strip along the gutter (gutter at u = gutterU). */
function pageMaterial(gutterU, grainTex) {
  const mat = new THREE.MeshStandardMaterial({
    color: BLANK_PAGE,
    roughness: 0.86,
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

function foilMaterial(textures, envMap) {
  return new THREE.MeshStandardMaterial({
    map: textures.colorTex,
    transparent: true,
    depthWrite: false,
    metalness: 1,
    metalnessMap: textures.surfaceTex,
    roughness: 1,
    roughnessMap: textures.surfaceTex,
    bumpMap: textures.surfaceTex,
    bumpScale: 0.6,
    envMap,
    envMapIntensity: GOLD_ENV_INTENSITY,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function shadowed(mesh, cast = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Spine: a curved cloth shell from the back cover's outer gutter edge (Q[5]) to the front
// cover's (Q[0]), re-shaped every time the leaves move, plus its gold-foil ribbon.

function createSpine(clothMat, foilMat) {
  const n1 = SPINE_SEGMENTS + 1;
  const shellCount = 8 * n1; // outer, inner, far cap, near cap — two rows each
  const shell = new THREE.BufferGeometry();
  const sPos = new Float32Array(shellCount * 3);
  const sNrm = new Float32Array(shellCount * 3);
  const sUv = new Float32Array(shellCount * 2);
  const index = [];
  const closedLength = 0.27; // UV scale: spine profile length of the closed book
  for (let strip = 0; strip < 4; strip++) {
    for (let i = 0; i < n1; i++) {
      for (let r = 0; r < 2; r++) {
        const vi = strip * 2 * n1 + i * 2 + r;
        const s = i / SPINE_SEGMENTS;
        if (strip < 2) {
          sUv[vi * 2] = (s * closedLength) / CLOTH_TILE;
          sUv[vi * 2 + 1] = ((r ? 0.5 : -0.5) * COVER_D) / CLOTH_TILE;
        } else {
          sUv[vi * 2] = (s * closedLength) / CLOTH_TILE;
          sUv[vi * 2 + 1] = (r * 0.01) / CLOTH_TILE;
        }
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

  const ribbon = new THREE.BufferGeometry();
  const rPos = new Float32Array(2 * n1 * 3);
  const rNrm = new Float32Array(2 * n1 * 3);
  const rUv = new Float32Array(2 * n1 * 2);
  const rIndex = [];
  for (let i = 0; i < n1; i++) {
    rUv[i * 4] = i / SPINE_SEGMENTS;
    rUv[i * 4 + 1] = 1; // far edge (−z) = canvas top
    rUv[i * 4 + 2] = i / SPINE_SEGMENTS;
    rUv[i * 4 + 3] = 0;
    if (i < SPINE_SEGMENTS) {
      const a = i * 2;
      rIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  ribbon.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  ribbon.setAttribute('normal', new THREE.BufferAttribute(rNrm, 3));
  ribbon.setAttribute('uv', new THREE.BufferAttribute(rUv, 2));
  ribbon.setIndex(rIndex);

  const shellMesh = shadowed(new THREE.Mesh(shell, clothMat));
  const ribbonMesh = shadowed(new THREE.Mesh(ribbon, foilMat), false);
  shellMesh.frustumCulled = ribbonMesh.frustumCulled = false;
  shellMesh.name = 'spine';
  ribbonMesh.name = 'spine-foil';

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
        put(rPos, o, px + nx * DECAL_LIFT, py + ny * DECAL_LIFT, z);
        put(rNrm, o, nx, ny, 0);
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
    ribbon.attributes.position.needsUpdate = true;
    ribbon.attributes.normal.needsUpdate = true;
  }

  return { meshes: [shellMesh, ribbonMesh], update };
}

// ---------------------------------------------------------------------------------------------

/** Lamp level of the master schedule (§5) for the foil's private reflections. */
function lampLevel(t) {
  const up = THREE.MathUtils.smoothstep(t, 0.3, 2.8);
  const down = 1 - THREE.MathUtils.smoothstep(t, 89, 95.5);
  return up * down;
}

export function createBook({ title = 'The Little Paper Boat', coverColor = '#7a2e2a' } = {}) {
  const group = new THREE.Group();
  group.name = 'book';

  // Shared textures and materials.
  const cloth = paintCloth(coverColor, 11);
  const clothColor = tiledTexture(cloth.color, true);
  const clothSurface = tiledTexture(cloth.surface, false);
  const sheen = new THREE.Color(coverColor).lerp(new THREE.Color('#ffd9c4'), 0.45);
  const clothMat = new THREE.MeshPhysicalMaterial({
    map: clothColor,
    roughness: 1,
    roughnessMap: clothSurface,
    bumpMap: clothSurface,
    bumpScale: 1.2,
    sheen: 0.7,
    sheenColor: sheen,
    sheenRoughness: 0.5,
  });
  const edgeTex = tiledTexture(paintEdge(23), true);
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.93, bumpMap: edgeTex, bumpScale: 0.5 });
  const grainTex = tiledTexture(paintGrain(37), false);
  grainTex.repeat.set(W / 0.35, D / 0.35);
  const goldEnv = new THREE.CanvasTexture(paintGoldEnv());
  goldEnv.mapping = THREE.EquirectangularReflectionMapping;
  goldEnv.colorSpace = THREE.SRGBColorSpace;
  const coverFoil = foilMaterial(foilTextures(1024, Math.round((1024 * COVER_D) / COVER_W), (c, w, h) => drawCoverFoil(c, w, h, title), 51), goldEnv);
  const spineFoil = foilMaterial(foilTextures(128, 2048, (c, w, h) => drawSpineFoil(c, w, h, title), 53), goldEnv);
  const foils = [coverFoil, spineFoil];

  // Page materials: front[i] = front face of leaf i (right page of spread i), back[i] = back face
  // of leaf i (left page of spread i + 1). Covers' outer faces are cloth and have none.
  const front = [];
  const back = [];
  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    const pivot = new THREE.Group();
    pivot.name = `leaf-${i}`;
    const t = THICK[i];
    if (i === 0 || i === LEAVES - 1) {
      const isFront = i === 0;
      const bodyGeo = slab(COVER_W, t - SHEET_LIFT, COVER_D, COVER_R, clothUV);
      if (isFront) bodyGeo.translate(0, SHEET_LIFT, 0);
      pivot.add(shadowed(new THREE.Mesh(bodyGeo, clothMat)));
      // Endpaper (the spread's printed page) pasted on the cover's inside.
      const mat = pageMaterial(isFront ? 1 : 0, grainTex);
      const endpaper = sheet({ x0: 0, x1: W, z0: -D / 2, z1: D / 2, y: isFront ? 0 : t, up: !isFront, mirrorU: isFront, uw: W, ud: D });
      pivot.add(shadowed(new THREE.Mesh(endpaper, mat), false));
      if (isFront) {
        back[i] = mat;
        const r = COVER_R;
        const decal = sheet({ x0: r, x1: COVER_W - r, z0: -COVER_D / 2 + r, z1: COVER_D / 2 - r, y: t + DECAL_LIFT, up: true, uw: COVER_W, ud: COVER_D });
        pivot.add(shadowed(new THREE.Mesh(decal, coverFoil), false));
      } else {
        front[i] = mat;
      }
    } else {
      front[i] = pageMaterial(0, grainTex);
      back[i] = pageMaterial(1, grainTex);
      const geo = slab(W, t, D, BOARD_R, boardUV(t));
      pivot.add(shadowed(new THREE.Mesh(geo, [edgeMat, edgeMat, front[i], back[i], edgeMat, edgeMat])));
    }
    group.add(pivot);
    leaves.push(pivot);
  }

  const spine = createSpine(clothMat, spineFoil);
  group.add(...spine.meshes);

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
  }

  function setPageArt(k, { left, right } = {}) {
    if (k < 1 || k >= LEAVES) return;
    if (left) setArt(back[k - 1], left);
    if (right) setArt(front[k], right);
  }

  function update(t) {
    const intensity = GOLD_ENV_INTENSITY * (0.12 + 0.88 * lampLevel(t));
    for (const m of foils) m.envMapIntensity = intensity;
  }

  setLeafAngles([0, 0, 0, 0, 0]);
  update(0);
  return { group, setLeafAngles, getSpreadAnchor: (k) => anchors[k - 1], setPageArt, update };
}
