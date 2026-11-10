// The book: a cloth-bound hardback pop-up book with six rigid leaves.
//
// Geometry contract (kept from the T0 skeleton, verified by tools/smoke.mjs):
// every leaf j hangs from one pivot that rotates by pi*leafTurn[j] about the
// hinge line (x = 0, y = HINGE_Y, along Z); its slab sits at leafOffset(j) along
// the pivot's local +Y. Spread anchors ride those pivots (left / right) or are
// recomputed each update (center). Only the looks live here otherwise.
//
// Spine and gutters: every leaf's spine-edge face is a radial segment from the
// hinge point H = (0, HINGE_Y) at signed radii [leafOffset(j), leafOffset(j)+T].
// So the gap between two neighbouring leaves near the spine is a wedge around H,
// bounded by a circle of radius |leafOffset(j)| that is tangent to both facing
// page surfaces. Each such wedge gets a small rolled "gutter" strip (cream card)
// and the outside gets the cloth spine (radius HINGE_Y, from the front cover's
// outer corner round to the back cover's). Those arcs never enter any leaf, so
// nothing pokes through pages at any turn value, and they close every gap.
import * as THREE from 'three';
import {
  NUM_LEAVES, HINGE_Y, PAGE_H,
  leafThickness, leafWidth, leafDepth, leafOffset,
} from './constants.js';
import { rng, lerp } from './util.js';
import { FILM_TITLE } from './timeline.js';

const CLOTH_RGB = [30, 76, 71];       // deep teal-green book cloth (sRGB)
const PAPER_RGB = [242, 233, 212];    // cream card
const EDGE_RGB = [247, 242, 230];     // off-white cut edges
const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, "Liberation Serif", "Times New Roman", serif';
const WEAVE_P = 4;                    // weave thread pitch in texels
const EPS = 0.002;                    // arcs sit this far inside the leaf corners

// ---------------------------------------------------------------------------
// Procedural textures (built once, seeded).
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Plain-weave value in ~[0,1] for texel (x, y); colN/rowN are per-thread slubs. */
function weaveAt(x, y, colN, rowN) {
  const cx = (x / WEAVE_P) | 0, cy = (y / WEAVE_P) | 0;
  const fx = ((x % WEAVE_P) + 0.5) / WEAVE_P, fy = ((y % WEAVE_P) + 0.5) / WEAVE_P;
  const over = ((cx + cy) & 1) === 0;
  const prof = over ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
  const slub = over ? colN[cx % colN.length] : rowN[cy % rowN.length];
  return 0.3 + 0.55 * prof + slub;
}

function slubs(n, rand, amp) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (rand() - 0.5) * 2 * amp;
  return a;
}

/** Low-frequency mottling: a small random canvas blown up with smoothing. */
function mottle(ctx2d, w, h, rand, cells, alpha, dark) {
  const s = makeCanvas(cells, Math.max(2, Math.round(cells * h / w)));
  const g = s.getContext('2d');
  const id = g.createImageData(s.width, s.height);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = rand();
    id.data[i] = id.data[i + 1] = id.data[i + 2] = dark ? 0 : 255;
    id.data[i + 3] = Math.round(v * 255);
  }
  g.putImageData(id, 0, 0);
  ctx2d.save();
  ctx2d.globalAlpha = alpha;
  ctx2d.imageSmoothingEnabled = true;
  ctx2d.drawImage(s, 0, 0, w, h);
  ctx2d.restore();
}

/** Woven book cloth: returns { canvas, height (Float32Array) }. Tileable when w,h are multiples of 2*WEAVE_P. */
function drawCloth(w, h, seed) {
  const rand = rng(seed);
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  const colN = slubs(Math.ceil(w / WEAVE_P), rand, 0.12);
  const rowN = slubs(Math.ceil(h / WEAVE_P), rand, 0.12);
  const id = g.createImageData(w, h);
  const height = new Float32Array(w * h);
  const d = id.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = weaveAt(x, y, colN, rowN);
      const n = (rand() - 0.5) * 0.06;
      const k = 0.78 + 0.32 * v + n;
      const i = (y * w + x) * 4;
      d[i] = CLOTH_RGB[0] * k; d[i + 1] = CLOTH_RGB[1] * k; d[i + 2] = CLOTH_RGB[2] * k; d[i + 3] = 255;
      height[y * w + x] = v;
    }
  }
  g.putImageData(id, 0, 0);
  mottle(g, w, h, rand, 12, 0.07, true);
  return { canvas, height };
}

/** Cream card with a faint grain, fibres and mottling. */
function drawPaper(w, h, seed, rgb = PAPER_RGB) {
  const rand = rng(seed);
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  const id = g.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 1 + (rand() - 0.5) * 0.035;
    d[i] = rgb[0] * n; d[i + 1] = rgb[1] * n; d[i + 2] = rgb[2] * n; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  mottle(g, w, h, rand, 24, 0.035, true);
  mottle(g, w, h, rand, 90, 0.03, false);
  // a few faint fibres
  g.lineWidth = 0.7;
  for (let i = 0; i < 260; i++) {
    const x = rand() * w, y = rand() * h, a = rand() * Math.PI * 2, l = 4 + rand() * 12;
    g.strokeStyle = rand() < 0.5 ? 'rgba(120,96,60,0.07)' : 'rgba(255,255,255,0.10)';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return canvas;
}

function tex(canvas, renderer, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  t.minFilter = THREE.LinearMipmapNearestFilter; // cheaper in software GL; differences are invisible here
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// --- cover art --------------------------------------------------------------

/** Sitting fox in profile, facing right, nose raised to the moon. Origin at the base centre, unit ~ height. */
function foxPath(g, x0, y0, s) {
  const P = (x, y) => [x0 + x * s, y0 + y * s];
  g.beginPath();
  g.moveTo(...P(0.28, 0));                                   // front toe
  g.lineTo(...P(-0.34, 0));                                  // along the ground to the haunch
  g.bezierCurveTo(...P(-0.47, -0.02), ...P(-0.48, -0.30), ...P(-0.32, -0.43)); // round haunch
  g.bezierCurveTo(...P(-0.20, -0.53), ...P(-0.08, -0.60), ...P(-0.05, -0.72)); // back up to the nape
  g.bezierCurveTo(...P(-0.07, -0.80), ...P(-0.08, -0.86), ...P(-0.07, -0.90)); // back of the skull
  g.lineTo(...P(-0.19, -1.13));                              // rear ear, leaning back
  g.lineTo(...P(0.01, -0.97));
  g.lineTo(...P(0.05, -1.19));                               // front ear
  g.lineTo(...P(0.14, -0.98));
  g.bezierCurveTo(...P(0.22, -0.99), ...P(0.33, -1.04), ...P(0.46, -1.08)); // forehead and long muzzle, raised
  g.lineTo(...P(0.45, -1.03));
  g.bezierCurveTo(...P(0.36, -0.96), ...P(0.27, -0.88), ...P(0.18, -0.83)); // jaw
  g.bezierCurveTo(...P(0.17, -0.66), ...P(0.23, -0.52), ...P(0.22, -0.36)); // throat and chest
  g.lineTo(...P(0.20, -0.08));                               // front leg
  g.bezierCurveTo(...P(0.21, -0.03), ...P(0.25, -0.01), ...P(0.28, 0));
  g.closePath();
  g.fill();
  // tail: a big brush along the ground, tip curling up behind
  g.beginPath();
  g.moveTo(...P(-0.30, -0.02));
  g.bezierCurveTo(...P(-0.62, 0.01), ...P(-0.86, -0.12), ...P(-0.84, -0.44));
  g.bezierCurveTo(...P(-0.70, -0.34), ...P(-0.60, -0.25), ...P(-0.32, -0.25));
  g.closePath();
  g.fill();
}

/** Fill a canvas with white (alpha) wherever the foil goes. */
function drawFoilMask(w, h, pxPerUnit, title) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = g.strokeStyle = '#fff';
  const u = pxPerUnit;
  const groove = 0.24 * u;                 // hinge groove, near the spine (canvas left)
  const cx = (groove + w) / 2;             // optical centre of the board face

  // Border: a thin rule and a hairline inside it.
  const bx0 = groove + 0.16 * u, bx1 = w - 0.18 * u, by0 = 0.18 * u, by1 = h - 0.18 * u;
  g.lineWidth = 0.022 * u;
  g.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  g.lineWidth = 0.008 * u;
  const ins = 0.07 * u;
  g.strokeRect(bx0 + ins, by0 + ins, bx1 - bx0 - 2 * ins, by1 - by0 - 2 * ins);
  // small diamonds at the inner corners
  for (const [x, y] of [[bx0 + ins, by0 + ins], [bx1 - ins, by0 + ins], [bx0 + ins, by1 - ins], [bx1 - ins, by1 - ins]]) {
    const r = 0.045 * u;
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
  }

  // Title, three lines: "The Fox" / "and the" / "Paper Moon".
  const words = title.split(' ');
  const lines = words.length >= 6 ? [words.slice(0, 2).join(' '), words.slice(2, 4).join(' '), words.slice(4).join(' ')] : [title];
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const maxW = (bx1 - bx0) - 0.5 * u;
  const fit = (text, px, style) => {
    let size = px;
    g.font = `${style} ${size}px ${SERIF}`;
    while (g.measureText(text).width > maxW && size > 8) { size -= 2; g.font = `${style} ${size}px ${SERIF}`; }
    return size;
  };
  const big = 0.40 * u;
  if (lines.length === 3) {
    g.font = `normal ${fit(lines[0], big, 'normal')}px ${SERIF}`;
    g.fillText(lines[0], cx, 0.86 * u);
    const small = 0.19 * u;
    g.font = `italic ${fit(lines[1], small, 'italic')}px ${SERIF}`;
    g.fillText(lines[1], cx, 1.16 * u);
    // flanking rules beside "and the"
    const tw = g.measureText(lines[1]).width;
    g.lineWidth = 0.008 * u;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * (tw / 2 + 0.10 * u), 1.105 * u);
      g.lineTo(cx + s * (tw / 2 + 0.55 * u), 1.105 * u);
      g.stroke();
    }
    g.font = `normal ${fit(lines[2], big, 'normal')}px ${SERIF}`;
    g.fillText(lines[2], cx, 1.58 * u);
  } else {
    g.font = `normal ${fit(title, 0.3 * u, 'normal')}px ${SERIF}`;
    g.fillText(title, cx, 1.3 * u);
  }

  // Emblem: a medallion ring with a crescent moon and a sitting fox.
  const ey = 2.78 * u, er = 0.80 * u;
  g.lineWidth = 0.016 * u;
  g.beginPath(); g.arc(cx, ey, er, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.007 * u;
  g.beginPath(); g.arc(cx, ey, er - 0.06 * u, 0, Math.PI * 2); g.stroke();
  // crescent (upper right): a disc minus an offset disc
  const m = makeCanvas(w, h);
  const mg = m.getContext('2d');
  mg.fillStyle = '#fff';
  const mx = cx + 0.30 * u, my = ey - 0.30 * u, mr = 0.25 * u;
  mg.beginPath(); mg.arc(mx, my, mr, 0, Math.PI * 2); mg.fill();
  mg.globalCompositeOperation = 'destination-out';
  mg.beginPath(); mg.arc(mx + 0.13 * u, my - 0.08 * u, mr * 0.86, 0, Math.PI * 2); mg.fill();
  g.drawImage(m, 0, 0);
  // three small stars
  const star = (x, y, r) => {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.32 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  };
  star(cx - 0.42 * u, ey - 0.40 * u, 0.055 * u);
  star(cx - 0.16 * u, ey - 0.60 * u, 0.035 * u);
  star(cx + 0.52 * u, ey + 0.06 * u, 0.04 * u);
  // a low hill the fox sits on, clipped to the medallion
  g.save();
  g.beginPath(); g.arc(cx, ey, er - 0.06 * u, 0, Math.PI * 2); g.clip();
  g.beginPath();
  g.moveTo(cx - er, ey + 0.52 * u);
  g.quadraticCurveTo(cx - 0.25 * u, ey + 0.28 * u, cx + er, ey + 0.46 * u);
  g.lineTo(cx + er, ey + er); g.lineTo(cx - er, ey + er); g.closePath(); g.fill();
  g.restore();
  foxPath(g, cx - 0.17 * u, ey + 0.40 * u, 0.52 * u);
  return c;
}

/** Front cover: colour canvas + surface canvas (R height for bump, G roughness, B metalness). */
function drawCoverArt(w, h, pxPerUnit, title) {
  const cloth = drawCloth(w, h, 7101);
  const foil = drawFoilMask(w, h, pxPerUnit, title);
  const fa = foil.getContext('2d').getImageData(0, 0, w, h).data;

  // Gold foil colour: a warm metallic gradient, faintly following the weave.
  const goldC = makeCanvas(w, h);
  const gg = goldC.getContext('2d');
  const grad = gg.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0.00, '#e9c77a');
  grad.addColorStop(0.30, '#c99b46');
  grad.addColorStop(0.50, '#f1d68e');
  grad.addColorStop(0.72, '#bf8f3c');
  grad.addColorStop(1.00, '#e2bd6c');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, w, h);
  const gd = gg.getImageData(0, 0, w, h).data;

  const color = cloth.canvas;
  const cg = color.getContext('2d');
  // hinge groove: a soft dark line parallel to the spine
  const gx = 0.24 * pxPerUnit;
  const gr = cg.createLinearGradient(gx - 6, 0, gx + 6, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  cg.fillStyle = gr; cg.fillRect(gx - 6, 0, 12, h);
  const cid = cg.getImageData(0, 0, w, h);
  const cd = cid.data;

  const surf = makeCanvas(w, h);
  const sg = surf.getContext('2d');
  const sid = sg.createImageData(w, h);
  const sd = sid.data;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = fa[i + 3] / 255;
    const v = cloth.height[p];
    const x = p % w;
    const groove = Math.max(0, 1 - Math.abs(x - gx) / 5);
    const wv = 0.93 + 0.07 * v;
    cd[i] = lerp(cd[i], gd[i] * wv, a);
    cd[i + 1] = lerp(cd[i + 1], gd[i + 1] * wv, a);
    cd[i + 2] = lerp(cd[i + 2], gd[i + 2] * wv, a);
    sd[i] = lerp(110 + 70 * v - 90 * groove, 60 + 10 * v, a);  // height: foil is pressed in
    sd[i + 1] = lerp(225, 95, a);                               // roughness
    sd[i + 2] = lerp(0, 255, a);                                // metalness
    sd[i + 3] = 255;
  }
  cg.putImageData(cid, 0, 0);
  sg.putImageData(sid, 0, 0);
  return { color, surf };
}

/** Inside of a cover: cream pastedown, with the cloth turned in along the three outer edges (u = 1 is the fore-edge). */
function drawPastedown(w, h, pxPerUnit, clothTile) {
  const c = drawPaper(w, h, 4242, [238, 228, 205]);
  const g = c.getContext('2d');
  const b = 0.12 * pxPerUnit; // turn-in width (the 0.1 overhang plus a hair)
  // the cloth band, drawn as an even-odd frame
  g.save();
  g.fillStyle = g.createPattern(clothTile, 'repeat');
  g.beginPath();
  g.rect(0, 0, w, h);
  g.rect(-10, b, w - b + 10, h - 2 * b);
  g.fill('evenodd');
  g.restore();
  // the pastedown paper's edge: a soft shadow line on the cloth
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, b + 1); g.lineTo(w - b - 1, b + 1); g.lineTo(w - b - 1, h - b - 1); g.lineTo(-2, h - b - 1); g.stroke();
  g.strokeStyle = 'rgba(255,250,235,0.5)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(-2, b + 2.5); g.lineTo(w - b - 2.5, b + 2.5); g.lineTo(w - b - 2.5, h - b - 2.5); g.lineTo(-2, h - b - 2.5); g.stroke();
  return c;
}

/** Soft studio reflection for the foil (equirect, static). */
function drawEnv() {
  const w = 256, h = 128;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8a7462'); sky.addColorStop(0.45, '#5c4636'); sky.addColorStop(0.55, '#7a4e30'); sky.addColorStop(1, '#3a2416');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const blob = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  blob(0.62 * w, 0.22 * h, 60, 'rgba(255,230,180,1)');  // warm key, upper left
  blob(0.15 * w, 0.30 * h, 40, 'rgba(160,185,255,0.45)');  // cool fill
  blob(0.88 * w, 0.40 * h, 30, 'rgba(255,240,220,0.35)');
  return c;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A cover board in the pivot's local frame: x in [0, w] (spine at 0), y in [y0, y0+T],
 * z in [-d/2, d/2], fore-edge corners rounded. Groups: 0 = outside top (+y), 1 = bottom (-y), 2 = edges.
 */
function boardGeometry(w, T, d, y0, radius) {
  const s = new THREE.Shape();
  // shape (X, Y) -> world (x = X, z = -Y)
  s.moveTo(0, -d / 2);
  s.lineTo(w - radius, -d / 2);
  s.quadraticCurveTo(w, -d / 2, w, -d / 2 + radius);
  s.lineTo(w, d / 2 - radius);
  s.quadraticCurveTo(w, d / 2, w - radius, d / 2);
  s.lineTo(0, d / 2);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 5 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  // Split the lid group into top / bottom, decided per triangle normal.
  const pos = geo.attributes.position;
  const lid = geo.groups.find((g) => g.materialIndex === 0);
  const side = geo.groups.find((g) => g.materialIndex === 1);
  const half = lid.count / 2;
  const firstY = pos.getY(lid.start);
  const firstIsBottom = Math.abs(firstY - y0) < 1e-6;
  geo.clearGroups();
  geo.addGroup(lid.start, half, firstIsBottom ? 1 : 0);
  geo.addGroup(lid.start + half, half, firstIsBottom ? 0 : 1);
  geo.addGroup(side.start, side.count, 2);
  // UVs: lids map the whole board (u along +x, v = 1 at the page top -z); edges tile the cloth.
  const uv = geo.attributes.uv;
  const isLid = (i) => i < side.start;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (isLid(i)) uv.setXY(i, x / w, (d / 2 - z) / d);
    else uv.setXY(i, (x - z) * 0.95, y * 0.95);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * A cylindrical strip around the hinge line with both ends capped, rebuilt in place
 * each update: arc of radius r from angle a0 to a1 (CCW, seen from +Z), z in [-L, L].
 */
function createArc(material, nSeg, L, uScale) {
  const nStrip = (nSeg + 1) * 2;
  const nCap = nSeg + 2;
  const count = nStrip + 2 * nCap;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const idx = [];
  for (let i = 0; i < nSeg; i++) {
    const a = i * 2, b = a + 1, c = a + 3, d = a + 2;
    idx.push(a, c, b, a, d, c); // outward-facing
  }
  const cap0 = nStrip, cap1 = nStrip + nCap; // z = -L (normal -z), z = +L (normal +z)
  for (let i = 0; i < nSeg; i++) {
    idx.push(cap1, cap1 + 1 + i, cap1 + 2 + i);
    idx.push(cap0, cap0 + 2 + i, cap0 + 1 + i);
  }
  for (let i = 0; i <= nSeg; i++) {
    uvs[i * 4] = uvs[i * 4 + 2] = (i / nSeg) * uScale;
    uvs[i * 4 + 1] = -L * 0.95; uvs[i * 4 + 3] = L * 0.95;
  }
  for (let k = 0; k < nCap; k++) {
    nrm[(cap0 + k) * 3 + 2] = -1;
    nrm[(cap1 + k) * 3 + 2] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, HINGE_Y, 0), L + 0.5);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, HINGE_Y - 0.5, -L), new THREE.Vector3(0.5, HINGE_Y + 0.5, L));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  function set(r, a0, a1) {
    if (a1 - a0 < 1e-4 || r < 1e-4) { mesh.visible = false; return; }
    mesh.visible = true;
    for (let i = 0; i <= nSeg; i++) {
      const a = a0 + ((a1 - a0) * i) / nSeg;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = r * ca, y = HINGE_Y + r * sa;
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = e ? L : -L;
        nrm[v * 3] = ca; nrm[v * 3 + 1] = sa; nrm[v * 3 + 2] = 0;
      }
      for (let e = 0; e < 2; e++) {
        const v = (e ? cap1 : cap0) + 1 + i;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = e ? L : -L;
      }
    }
    for (let e = 0; e < 2; e++) {
      const c = e ? cap1 : cap0;
      pos[c * 3] = 0; pos[c * 3 + 1] = HINGE_Y; pos[c * 3 + 2] = e ? L : -L;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, set };
}

// ---------------------------------------------------------------------------

export function createBook(ctx) {
  const { renderer } = ctx;
  const group = new THREE.Group();
  group.name = 'book';

  // --- textures ---
  const coverW = leafWidth(0), coverD = leafDepth(0);
  const CH = 1024, CW = Math.round((CH * coverW) / coverD);   // 756 x 1024
  const pxPerUnit = CH / coverD;
  const art = drawCoverArt(CW, CH, pxPerUnit, FILM_TITLE);
  const clothTile = drawCloth(256, 256, 913).canvas;
  const artTex = tex(art.color, renderer);
  const surfTex = tex(art.surf, renderer, { srgb: false });
  const clothTex = tex(clothTile, renderer, { repeat: true });
  const pasteTex = tex(drawPastedown(CW, CH, pxPerUnit, clothTile), renderer);
  const paperTex = tex(drawPaper(768, 1024, 1234), renderer);
  const edgeC = makeCanvas(4, 32);
  {
    const g = edgeC.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 32);
    const e = `rgb(${EDGE_RGB.join(',')})`, dk = 'rgb(214,204,184)';
    gr.addColorStop(0, dk); gr.addColorStop(0.18, e); gr.addColorStop(0.82, e); gr.addColorStop(1, dk);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 32);
  }
  const edgeTex = tex(edgeC, renderer);
  const envTex = tex(drawEnv(), renderer);
  envTex.mapping = THREE.EquirectangularReflectionMapping;

  // --- materials ---
  const coverMat = new THREE.MeshStandardMaterial({
    map: artTex, roughnessMap: surfTex, metalnessMap: surfTex, bumpMap: surfTex, bumpScale: 0.9,
    roughness: 1, metalness: 0.85, envMap: envTex, envMapIntensity: 1.2,
  });
  const clothMat = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.88, metalness: 0 });
  const spineMat = clothMat.clone();
  spineMat.side = THREE.DoubleSide;
  const pasteMat = new THREE.MeshStandardMaterial({ map: pasteTex, roughness: 0.93 });
  const pageMat = new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.93 });
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95 });
  const gutterMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95, side: THREE.DoubleSide });

  // --- leaves ---
  const pivots = [];
  for (let j = 0; j < NUM_LEAVES; j++) {
    const w = leafWidth(j), T = leafThickness(j), d = leafDepth(j), o = leafOffset(j);
    const pivot = new THREE.Group(); // rotates about the hinge (world Z through (0, HINGE_Y))
    pivot.name = `leaf${j}`;
    pivot.position.set(0, HINGE_Y, 0);
    let mesh;
    if (j === 0 || j === NUM_LEAVES - 1) {
      const geo = boardGeometry(w, T, d, o, 0.07);
      // groups: 0 = top (+y), 1 = bottom (-y), 2 = edges
      const mats = j === 0 ? [coverMat, pasteMat, clothMat] : [pasteMat, clothMat, clothMat];
      mesh = new THREE.Mesh(geo, mats);
      mesh.name = j === 0 ? 'cover-front' : 'cover-back';
    } else {
      // Box material order: +x, -x, +y (front face), -y (back face), +z, -z.
      const geo = new THREE.BoxGeometry(w, T, d);
      geo.translate(w / 2, o + T / 2, 0);
      mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, pageMat, pageMat, edgeMat, edgeMat]);
      mesh.name = `leaf${j}-card`;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    pivots.push(pivot);
  }

  // --- spine (outside) and gutter strips (one per spread) ---
  const spine = createArc(spineMat, 20, leafDepth(0) / 2, 0.6);
  spine.mesh.name = 'spine';
  group.add(spine.mesh);
  const gutters = [];
  for (let k = 0; k < NUM_LEAVES - 1; k++) {
    const g = createArc(gutterMat, 14, PAGE_H / 2, 0.2);
    g.mesh.name = `gutter${k}`;
    g.mesh.castShadow = false; // too thin for the shadow map: it would only draw a dashed line
    group.add(g.mesh);
    gutters.push(g);
  }

  // Spread anchors. left = back face of leaf k, right = front face of leaf k+1.
  const anchors = [];
  for (let k = 0; k < NUM_LEAVES - 1; k++) {
    const left = new THREE.Object3D();
    left.name = `spread${k}-left`;
    left.position.set(0, leafOffset(k), 0);
    left.rotation.z = Math.PI; // so that with the leaf turned by pi it matches world axes
    pivots[k].add(left);

    const right = new THREE.Object3D();
    right.name = `spread${k}-right`;
    right.position.set(0, leafOffset(k + 1) + leafThickness(k + 1), 0);
    pivots[k + 1].add(right);

    const center = new THREE.Object3D();
    center.name = `spread${k}-center`;
    group.add(center);
    anchors.push({ left, right, center });
  }

  const turns = new Array(NUM_LEAVES).fill(0);

  function update(state) {
    for (let j = 0; j < NUM_LEAVES; j++) {
      turns[j] = j < 5 ? state.leafTurn[j] : 0;
      pivots[j].rotation.z = Math.PI * turns[j];
    }
    // Center anchors: on the spine, midway between the two page surfaces,
    // +Y along the bisector of the two pages, +Z along the spine.
    for (let k = 0; k < anchors.length; k++) {
      const pl = Math.PI * turns[k], pr = Math.PI * turns[k + 1];
      const ol = leafOffset(k), or = leafOffset(k + 1) + leafThickness(k + 1);
      // A point at local (0, o) on a leaf rotated by phi about the hinge: (-o sin phi, H + o cos phi).
      const lx = -ol * Math.sin(pl), ly = HINGE_Y + ol * Math.cos(pl);
      const rx = -or * Math.sin(pr), ry = HINGE_Y + or * Math.cos(pr);
      const c = anchors[k].center;
      c.position.set((lx + rx) / 2, (ly + ry) / 2, 0);
      c.rotation.set(0, 0, (pl + pr) / 2 - Math.PI / 2);
    }
    // Outside spine: from the front cover's outer spine corner (direction u0 =
    // angle pi/2 + phi0, radius HINGE_Y) round the back to the back cover's
    // (angle 3pi/2).
    spine.set(HINGE_Y - EPS, Math.PI / 2 + Math.PI * turns[0], 1.5 * Math.PI);
    // Gutter strip of spread k: tangent to leaf k's back face and leaf k+1's
    // front face, which both lie at signed distance leafOffset(k) from the hinge.
    for (let k = 0; k < gutters.length; k++) {
      const o = leafOffset(k);
      const base = o >= 0 ? Math.PI / 2 : 1.5 * Math.PI;
      gutters[k].set(Math.abs(o) - EPS, base + Math.PI * turns[k + 1], base + Math.PI * turns[k]);
    }
    coverMat.envMapIntensity = lerp(1.2, 0.3, state.night);
  }

  function getSpreadAnchors(k) {
    return anchors[k];
  }

  return { group, update, getSpreadAnchors };
}
