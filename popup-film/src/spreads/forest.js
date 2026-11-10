/**
 * spreads/forest.js — spread 1, "The Whispering Forest" (film 7–31 s: rises with the cover 7–10,
 * open 10–28, folds away under leaf 1 28–31). A misty, dappled morning forest in which a little
 * paper boat folds itself out of a lost page and sails off down the stream.
 *
 * Paper engineering (spread frame, contract 3.1; checked for collisions with LAYOUT):
 *   - four gutter-straddling MOUNTAIN V-folds with the SAME γ, back to front: tall misty pines
 *     (2.2), darker firs with the spring's little waterfall, a translucent vellum mist band, and
 *     a grove of round trees with an arch over the gutter and a bough overhanging the stream.
 *     Equal γ makes their halves parallel translates of each other, so they nest as they fold and
 *     never touch, although their closed footprints overlap.
 *   - standUps: the woodcutter's cottage (warm glowing windows, a swaying paper smoke curl), the
 *     fox (time-driven head that turns to follow the boat, swishing tail), a mossy log, ferns,
 *     toadstools, mushrooms and bracken. The cottage, fox and log fold toward the reader so their
 *     footprints stay clear of (or nest under) the V-folds; the near-edge plants fold back.
 *   - props (shrink/fade with popup.rise before the pages close): the folding paper square and
 *     paper.boat, ripple rings, sunbeams, fireflies (one Points draw), falling leaves, and an
 *     additive shimmer of light on the printed stream.
 * Beats (film seconds): 7–10 the forest rises and fireflies spill out of the gutter; 10–15.5 a
 * lost page floats on the spring at (−1.9, 0, −1.2) under a sunbeam; 15.2–17.9 fireflies gather,
 * the square stands up, folds in half, folds its corners into a hat, and the hat opens into the
 * boat; 18–20.5 the boat bobs; 20.5–27.5 it sails the shared waypoints (C1 timing, starts and
 * ends at rest) leaving ripple rings while the fox's head follows it; 27.5–28.6 it drifts to
 * the corner and shrinks away as the page turns.
 * No lights of its own: every glow is emissive or additive, so shader light counts never change
 * when the spread is shown or hidden. Deterministic (all randomness from the build rng) and
 * seekable: update(alpha, t) is a pure function and allocates nothing.
 */

const PI = Math.PI;
const TAU = PI * 2;

/** Mechanism layout (spread frame). Exported for the layout checker of the dev harness. */
export const LAYOUT = Object.freeze({
  gamma: 1.9, // shared by every V-fold (mountain: V vertex toward the reader)
  folds: {
    pines: { z0: -1.3, halfWidth: 2.15, height: 2.2 },
    firs: { z0: -0.95, halfWidth: 2.55, height: 1.6 },
    mist: { z0: -0.68, halfWidth: 2.3, height: 0.7 },
    grove: { z0: -0.35, halfWidth: 2.4, height: 1.3, leftReach: 1.62 },
  },
  flats: {
    cottage: { side: 'left', x: 1.85, z: 0.62, fold: 'front', width: 1.1, height: 1.15 },
    fox: { side: 'right', x: 1.9, z: 0.55, fold: 'front', width: 0.8, height: 0.7 },
    log: { side: 'right', x: 2.42, z: -0.25, fold: 'front', width: 0.62, height: 0.3 },
    ferns: { side: 'left', x: 0.75, z: 1.62, fold: 'back', width: 0.56, height: 0.46 },
    toadstools: { side: 'left', x: 2.66, z: 1.8, fold: 'back', width: 0.5, height: 0.4 },
    mushrooms: { side: 'right', x: 0.72, z: 1.55, fold: 'back', width: 0.46, height: 0.32 },
    bracken: { side: 'right', x: 1.25, z: 1.95, fold: 'back', width: 0.52, height: 0.28 },
  },
  spring: [-1.9, -1.2],
  /** Boat waypoints [x, z, film t] (SPREADS.md) plus a slow drift to the near-right corner. */
  path: [[-1.9, -1.2, 20.5], [-1.0, -0.6, 22], [-0.2, 0.1, 23.5], [0.8, 0.5, 25], [1.7, 1.0, 26.5], [2.3, 1.5, 27.5], [2.62, 1.78, 28.6]],
  boatScale: 0.6,
});

/** Film-time beats of the boat's birth. */
const BIRTH = { glow: 15.2, stand: [15.5, 16.1], halve: [16.1, 16.7], corners: [16.7, 17.3], pop: [17.3, 17.9] };
const RING_PERIOD = 0.5;
const RING_LIFE = 3;
const RINGS = Math.ceil(RING_LIFE / RING_PERIOD);
const FIREFLIES = 46;
const ART_LIFT = 0.2; // emissive share of the printed colour on upright cards

const C = {
  ink: 'rgba(43, 38, 34, 0.62)',
  pineFar: ['#9dbcab', '#83a594', '#6c8f80'],
  pineMid: ['#98b5a5', '#799a8a', '#5f8274'],
  pineNear: ['#84a58c', '#628771', '#4a6e5b'],
  firBack: ['#9dbd8d', '#739a68', '#557c55'],
  fir: ['#82ab76', '#557f4f', '#365d40'],
  trunk: '#5b4030',
  leafA: { light: '#a8c96d', mid: '#6b9750', dark: '#3d6740', glint: '#e4eea2' },
  leafB: { light: '#c8d47b', mid: '#93ae56', dark: '#5a7a3c', glint: '#f4f1b4' },
  birch: '#f1ebdf',
  bark: '#6f4c35',
  fern: ['#93c26a', '#5f9551', '#3c6c3e'],
  water: '#5c9fb8',
  waterDeep: '#2f6c86',
  waterLight: '#a9d8e2',
  foam: '#f1f8f4',
  bank: '#c8b487',
  mud: '#857052',
  stone: ['#d5d0c4', '#a7a297', '#6f6c66'],
  fox: '#d8742c',
  foxDark: '#a5501f',
  foxLight: '#f2a65f',
  cream: '#f7eddd',
  soot: '#3a2a23',
  cap: '#c4473b',
  capDark: '#8f2f29',
  dot: '#f8efe0',
  stem: '#efe3cc',
  brown: '#a8704a',
  plaster: '#f1e3c4',
  timber: '#6b4a33',
  roof: ['#c08052', '#9a5e3c', '#6e3f2a'],
  glow: '#ffcf6e',
  door: '#7a4b2e',
  sage: '#5f8f7a',
  flowers: ['#f6f2e6', '#f2cf5b', '#e98b8f', '#b8a6e3'],
};

// ---------------------------------------------------------------------------------------------
// Small math helpers

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const lerp = (a, b, u) => a + (b - a) * u;

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------------------------------------------------------------------------------------------
// Painting helpers (Canvas2D in "unit" space: callers set a transform so 1 = 1 spread unit)

function circlesPath(ctx, cs) {
  ctx.beginPath();
  for (const [x, y, r] of cs) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
}

/** Union of circles with an ink rim around the silhouette only (wide stroke under the fill). */
function inkedCircles(ctx, cs, fill, inkW) {
  if (inkW > 0) {
    ctx.lineWidth = inkW * 2;
    ctx.strokeStyle = C.ink;
    circlesPath(ctx, cs);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  circlesPath(ctx, cs);
  ctx.fill();
}

function softSpot(ctx, x, y, r, hex, a, sx = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A puffy illustrated canopy: lobes lit from the upper left, shaded underside, glints. */
function canopy(ctx, rnd, cx, cy, r, pal, px, { lobes = 9, squash = 0.85, stretch = 1 } = {}) {
  const cs = [[cx, cy, r * 0.62]];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + rnd() * 0.5;
    const d = r * (0.42 + rnd() * 0.2);
    cs.push([cx + Math.cos(a) * d * stretch, cy + Math.sin(a) * d * squash, r * (0.3 + rnd() * 0.15)]);
  }
  inkedCircles(ctx, cs, pal.mid, 1.6 * px);
  ctx.save();
  circlesPath(ctx, cs);
  ctx.clip();
  ctx.fillStyle = pal.light;
  for (const [x, y, rr] of cs) {
    ctx.beginPath();
    ctx.arc(x - rr * 0.3, y - rr * 0.32, rr * 0.62, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.32, cy + r * 0.62, r * 1.05 * stretch, r * 0.55, -0.25, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 1.5 * px;
  for (const [x, y, rr] of cs) {
    ctx.beginPath();
    ctx.arc(x, y, rr * 0.9, 0.35, PI - 0.35);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = pal.glint;
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU;
    const d = rnd() * r * 0.8;
    const x = cx + Math.cos(a) * d - r * 0.2;
    const y = cy + Math.sin(a) * d * squash - r * 0.25;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.045, r * 0.028, rnd() * PI, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Tapered trunk from (x, base) up to height h, optional lean; birch adds dark marks. */
function trunk(ctx, rnd, x, base, h, w, px, { lean = 0, color = C.bark, birch = false } = {}) {
  const top = base - h;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.quadraticCurveTo(x - w * 0.42 + lean * 0.5, base - h * 0.5, x - w * 0.3 + lean, top);
  ctx.lineTo(x + w * 0.3 + lean, top);
  ctx.quadraticCurveTo(x + w * 0.42 + lean * 0.5, base - h * 0.5, x + w / 2, base);
  ctx.closePath();
  ctx.lineWidth = 2.4 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (birch) {
    ctx.fillStyle = 'rgba(160, 150, 135, 0.55)';
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = C.ink;
    for (let y = top + h * 0.08; y < base; y += h * (0.07 + rnd() * 0.08)) {
      const lx = x + lean * (1 - (base - y) / h) * -1 + lean * ((base - y) / h);
      ctx.fillRect(lx - w * (0.5 - rnd() * 0.3), y, w * (0.25 + rnd() * 0.35), h * 0.012 + px);
    }
  } else {
    ctx.fillStyle = 'rgba(30, 18, 10, 0.35)';
    ctx.fillRect(x + w * 0.05, top, w, h);
    ctx.strokeStyle = 'rgba(30, 18, 10, 0.4)';
    ctx.lineWidth = 1.2 * px;
    for (let i = 0; i < 4; i++) {
      const ox = (rnd() - 0.5) * w * 0.6;
      ctx.beginPath();
      ctx.moveTo(x + ox, base);
      ctx.quadraticCurveTo(x + ox + lean * 0.4, base - h * 0.5, x + ox * 0.6 + lean, top);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Stylised pine/fir: overlapping jagged tiers, lit from the left, ink-edged. */
function pine(ctx, rnd, x, base, h, w, cols, px, { trunkCol = C.trunk, tiers = 5, ink = 2 } = {}) {
  ctx.fillStyle = trunkCol;
  ctx.fillRect(x - w * 0.05, base - h * 0.16, w * 0.1, h * 0.16);
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const yb = base - h * (0.1 + 0.74 * f);
    const yt = i === tiers - 1 ? base - h : base - h * (0.1 + 0.74 * f + 0.34);
    const hw = (w / 2) * (1 - 0.72 * f) * (0.92 + rnd() * 0.16);
    ctx.beginPath();
    ctx.moveTo(x, yt);
    const steps = 4;
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      ctx.lineTo(x + hw * u * 0.82, yt + (yb - yt) * u - (yb - yt) * 0.1);
      ctx.lineTo(x + hw * u, yt + (yb - yt) * u);
    }
    const sc = 3 + Math.round(hw / (w * 0.12));
    for (let k = 1; k <= sc; k++) {
      const xx = x + hw - (2 * hw * k) / sc;
      ctx.quadraticCurveTo(xx + hw / sc, yb - (yb - yt) * (0.06 + rnd() * 0.08), xx, yb);
    }
    for (let k = steps; k >= 1; k--) {
      const u = k / steps;
      ctx.lineTo(x - hw * u, yt + (yb - yt) * u);
      ctx.lineTo(x - hw * u * 0.82, yt + (yb - yt) * u - (yb - yt) * 0.1);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.45, cols[1]);
    g.addColorStop(1, cols[2]);
    if (ink > 0) {
      ctx.lineWidth = ink * px;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
    }
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/** Haze over what is already painted (source-atop): alpha a at y0 fading to 0 at y1. */
function veil(ctx, hw, y0, y1, a) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(236, 243, 238, ${a})`);
  g.addColorStop(1, 'rgba(236, 243, 238, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-hw, Math.min(y0, y1), 2 * hw, Math.abs(y0 - y1));
  ctx.restore();
}

/** A fern frond as a curved stem with tapering paired leaflets. */
function frond(ctx, rnd, x, y, ang, len, col, px) {
  const bend = (rnd() - 0.5) * 0.9;
  const pt = (u) => {
    const a = ang + bend * u;
    return [x + Math.sin(a) * len * u, y - Math.cos(a) * len * u, a];
  };
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= 16; i++) ctx.lineTo(...pt(i / 16).slice(0, 2));
  ctx.stroke();
  for (let i = 2; i < 16; i++) {
    const u = i / 16;
    const [px0, py0, a] = pt(u);
    const l = len * 0.24 * Math.pow(1 - u, 0.7) + len * 0.02;
    for (const s of [-1, 1]) {
      const la = a + s * 1.05;
      ctx.beginPath();
      ctx.ellipse(px0 + Math.sin(la) * l * 0.5, py0 - Math.cos(la) * l * 0.5, l * 0.5, l * 0.16, la - PI / 2, 0, TAU);
      ctx.fill();
    }
  }
}

function mushroom(ctx, rnd, x, base, s, px, { cap = C.cap, dots = true, tilt = 0 } = {}) {
  ctx.save();
  ctx.translate(x, base);
  ctx.rotate(tilt);
  ctx.lineWidth = 1.8 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, 0);
  ctx.quadraticCurveTo(-s * 0.1, -s * 0.5, -s * 0.12, -s * 0.8);
  ctx.lineTo(s * 0.12, -s * 0.8);
  ctx.quadraticCurveTo(s * 0.12, -s * 0.5, s * 0.18, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = C.stem;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.72);
  ctx.bezierCurveTo(-s * 0.55, -s * 1.25, s * 0.55, -s * 1.25, s * 0.55, -s * 0.72);
  ctx.quadraticCurveTo(0, -s * 0.62, -s * 0.55, -s * 0.72);
  ctx.closePath();
  ctx.stroke();
  const g = ctx.createLinearGradient(-s * 0.5, -s * 1.1, s * 0.5, -s * 0.7);
  g.addColorStop(0, rgba(cap, 1));
  g.addColorStop(1, cap === C.cap ? C.capDark : '#704529');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.2, -s * 1.0, s * 0.16, s * 0.07, -0.4, 0, TAU);
  ctx.fill();
  if (dots) {
    ctx.fillStyle = C.dot;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc((rnd() - 0.5) * s * 0.75, -s * (0.8 + rnd() * 0.25), s * (0.04 + rnd() * 0.04), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function flower(ctx, x, y, r, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#f2b84b';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, TAU);
  ctx.fill();
}

function stone(ctx, rnd, x, y, r, px, flat = 0.7) {
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (0.85 + rnd() * 0.25);
    const fx = x + Math.cos(a) * rr;
    const fy = y + Math.sin(a) * rr * flat;
    if (i === 0) ctx.moveTo(fx, fy);
    else ctx.lineTo(fx, fy);
  }
  ctx.closePath();
  ctx.lineWidth = 1.6 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, C.stone[0]);
  g.addColorStop(0.5, C.stone[1]);
  g.addColorStop(1, C.stone[2]);
  ctx.fillStyle = g;
  ctx.fill();
}

function grassTuft(ctx, rnd, x, y, h, col, px) {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.6 * px;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (rnd() - 0.5) * 1.1;
    ctx.moveTo(x + (rnd() - 0.5) * h * 0.3, y);
    ctx.quadraticCurveTo(x + Math.sin(a) * h * 0.4, y - h * 0.6, x + Math.sin(a) * h, y - h * (0.7 + rnd() * 0.3));
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Card art. Card painters draw in card units with the origin at the card's bottom centre
// (y up = negative). V-fold art: x = signed distance from the crease (left page < 0).

function cardCanvas(paper, w, h, K, draw, { seed = 1, cut = 7, grain = 0.05 } = {}) {
  return paper.paint(
    Math.round(w * K),
    Math.round(h * K),
    (ctx, W, H) => {
      ctx.save();
      ctx.translate(W / 2, H);
      ctx.scale(K, K);
      draw(ctx, 1 / K);
      ctx.restore();
    },
    { dieCut: cut, seed, grain },
  );
}

function drawPines(ctx, rnd, px, hw) {
  // A soft skyline: neighbouring trees share a slowly varying height (sum of sines) plus jitter.
  const ph = [rnd() * TAU, rnd() * TAU];
  const sky = (x) => 0.5 + 0.28 * Math.sin(x * 1.7 + ph[0]) + 0.22 * Math.sin(x * 3.9 + ph[1]);
  // far misty row: flat silhouettes (no linework), a few round crowns among the spires
  for (let x = -hw + 0.26; x < hw - 0.24; x += 0.12 + rnd() * 0.16) {
    const e = Math.abs(x) / hw;
    const h = Math.min(2.14, 1.15 + 0.55 * sky(x) + 0.35 * e + 0.2 * rnd());
    if (rnd() < 0.18 && h < 1.9) {
      ctx.fillStyle = C.pineFar[1];
      ctx.fillRect(x - 0.02, -h * 0.6, 0.04, h * 0.6);
      canopy(ctx, rnd, x, -h * 0.72, 0.22 + rnd() * 0.08, { light: C.pineFar[0], mid: C.pineFar[1], dark: C.pineFar[2], glint: C.pineFar[0] }, px);
    } else {
      pine(ctx, rnd, x, 0, h, 0.24 + rnd() * 0.2 + 0.1 * (h > 1.8), C.pineFar, px, { tiers: h > 1.6 ? 8 : 6, ink: 0, trunkCol: C.pineFar[2] });
    }
  }
  veil(ctx, hw, 0, -2.2, 0.16);
  veil(ctx, hw, 0, -1.1, 0.45);
  // middle row, inked, blue-green
  for (let x = -hw + 0.3; x < hw - 0.28; x += 0.17 + rnd() * 0.2) {
    const h = 0.8 + 0.55 * sky(x + 2.1) + 0.25 * rnd() + 0.2 * Math.abs(x) / hw;
    pine(ctx, rnd, x, 0, h, 0.3 + rnd() * 0.18, C.pineMid, px, { trunkCol: '#6d8478', tiers: 6, ink: 1.4 });
  }
  veil(ctx, hw, 0, -0.75, 0.5);
  // a low front row
  for (let x = -hw + 0.3; x < hw - 0.28; x += 0.22 + rnd() * 0.18) {
    pine(ctx, rnd, x, 0, 0.45 + rnd() * 0.45, 0.32 + rnd() * 0.12, C.pineNear, px, { trunkCol: '#56695d', tiers: 4, ink: 1.6 });
  }
  veil(ctx, hw, 0, -0.35, 0.4);
  // sun rays from the upper left across the whole layer
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 5; i++) {
    const x0 = -hw + i * 0.9 + rnd() * 0.3;
    const g = ctx.createLinearGradient(x0, -2.2, x0 + 1.2, 0);
    g.addColorStop(0, 'rgba(255, 244, 205, 0.26)');
    g.addColorStop(1, 'rgba(255, 244, 205, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, -2.3);
    ctx.lineTo(x0 + 0.22, -2.3);
    ctx.lineTo(x0 + 1.5, 0);
    ctx.lineTo(x0 + 1.05, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFirs(ctx, rnd, px, hw, springS) {
  const sx = -springS;
  const clear = (x) => Math.abs(x - sx) < 0.24; // keep the waterfall clear
  for (let x = -hw + 0.3; x < hw - 0.3; x += 0.18 + rnd() * 0.14) {
    if (!clear(x)) pine(ctx, rnd, x, -0.05, 1.0 + rnd() * 0.48, 0.38 + rnd() * 0.12, C.firBack, px, { tiers: 6, ink: 1.6 });
  }
  veil(ctx, hw, 0, -1.6, 0.3);
  for (let x = -hw + 0.38; x < hw - 0.34; x += 0.26 + rnd() * 0.18) {
    if (!clear(x)) pine(ctx, rnd, x, -0.04, 0.62 + rnd() * 0.42, 0.4 + rnd() * 0.12, C.fir, px, { tiers: 5 });
  }
  // mossy ground mounds along the base
  const mounds = [];
  for (let x = -hw + 0.1; x < hw - 0.05; x += 0.16) mounds.push([x, 0.02, 0.1 + rnd() * 0.06]);
  inkedCircles(ctx, mounds, '#4f7a46', 1.4 * px);
  ctx.save();
  circlesPath(ctx, mounds);
  ctx.clip();
  ctx.fillStyle = '#6f9a58';
  for (const [x, y, r] of mounds) {
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // the spring's rocks and little waterfall on the left half
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * PI;
    stone(ctx, rnd, sx + Math.cos(a) * 0.26, -0.03 - Math.sin(a) * 0.2 - rnd() * 0.05, 0.06 + rnd() * 0.04, px);
  }
  const fall = ctx.createLinearGradient(0, -0.42, 0, 0);
  fall.addColorStop(0, C.waterLight);
  fall.addColorStop(1, C.foam);
  ctx.fillStyle = fall;
  ctx.beginPath();
  ctx.moveTo(sx - 0.07, -0.4);
  ctx.quadraticCurveTo(sx - 0.1, -0.15, sx - 0.13, 0);
  ctx.lineTo(sx + 0.12, 0);
  ctx.quadraticCurveTo(sx + 0.09, -0.15, sx + 0.07, -0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.5 * px;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(sx + i * 0.025, -0.38);
    ctx.lineTo(sx + i * 0.04, -0.02);
    ctx.stroke();
  }
  stone(ctx, rnd, sx - 0.16, -0.36, 0.11, px);
  stone(ctx, rnd, sx + 0.17, -0.38, 0.12, px);
  veil(ctx, hw, 0, -0.7, 0.45);
}

function drawMist(ctx, rnd, W, H) {
  // a die-cut vellum band: scalloped cloud edge on top, denser toward the ground
  const top = [];
  for (let x = 0; x <= W + 1; x += 18 + rnd() * 30) top.push([x, H * (0.18 + rnd() * 0.42)]);
  const edge = () => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, top[0][1]);
    for (let i = 1; i < top.length; i++) {
      const [x0, y0] = top[i - 1];
      const [x1, y1] = top[i];
      const r = (x1 - x0) * 0.75;
      ctx.bezierCurveTo(x0 + r * 0.2, Math.min(y0, y1) - r, x1 - r * 0.2, Math.min(y0, y1) - r, x1, y1);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
  };
  edge();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(247, 250, 246, 0.42)');
  g.addColorStop(1, 'rgba(247, 250, 246, 0.7)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const y = H * (0.4 + rnd() * 0.5);
    const r = H * (0.2 + rnd() * 0.3);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(3, 1);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    rg.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  edge();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // soften both ends so the band dissolves at the outer edges
  ctx.globalCompositeOperation = 'destination-in';
  const e = ctx.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, 'rgba(0,0,0,0)');
  e.addColorStop(0.08, 'rgba(0,0,0,1)');
  e.addColorStop(0.92, 'rgba(0,0,0,1)');
  e.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

function drawGrove(ctx, rnd, px, gap) {
  // gap = [s0, s1]: the stream passes the left half's end here; nothing below y = -0.4 there.
  // ground bushes
  const bushes = [];
  for (let x = -gap[0] + 0.05; x < 2.3; x += 0.13) bushes.push([x, -0.02, 0.07 + rnd() * 0.06]);
  inkedCircles(ctx, bushes, '#4a7a45', 1.4 * px);
  // trunks
  trunk(ctx, rnd, -0.34, 0, 0.82, 0.09, px, { lean: 0.12 });
  trunk(ctx, rnd, 0.34, 0, 0.86, 0.09, px, { lean: -0.12 });
  trunk(ctx, rnd, 0.95, 0, 0.62, 0.1, px);
  trunk(ctx, rnd, 1.4, 0, 0.8, 0.07, px, { birch: true, color: C.birch, lean: 0.03 });
  trunk(ctx, rnd, 1.78, 0, 0.5, 0.09, px);
  trunk(ctx, rnd, 2.1, 0, 0.42, 0.07, px, { lean: 0.04 });
  trunk(ctx, rnd, -0.8, 0, 0.62, 0.1, px, { lean: -0.12 });
  // the overhanging bough over the stream
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 0.075;
  ctx.beginPath();
  ctx.moveTo(-0.86, -0.55);
  ctx.quadraticCurveTo(-1.1, -0.66, -1.38, -0.62);
  ctx.stroke();
  ctx.strokeStyle = C.bark;
  ctx.lineWidth = 0.055;
  ctx.stroke();
  ctx.lineCap = 'butt';
  canopy(ctx, rnd, 2.1, -0.56, 0.2, C.leafA, px, { lobes: 7 });
  canopy(ctx, rnd, 1.76, -0.72, 0.3, C.leafB, px);
  canopy(ctx, rnd, 1.4, -0.92, 0.25, C.leafB, px, { lobes: 8, squash: 1.2, stretch: 0.8 });
  canopy(ctx, rnd, 0.95, -0.8, 0.34, C.leafA, px);
  canopy(ctx, rnd, -1.36, -0.78, 0.26, C.leafA, px, { lobes: 7 });
  canopy(ctx, rnd, -0.95, -0.86, 0.36, C.leafA, px);
  // the arch over the gutter: two canopies leaning together
  canopy(ctx, rnd, 0.28, -0.95, 0.3, C.leafA, px);
  canopy(ctx, rnd, -0.28, -0.97, 0.3, C.leafB, px);
  canopy(ctx, rnd, 0, -1.02, 0.18, C.leafA, px, { lobes: 6 });
  // flowers in the bushes
  for (let i = 0; i < 22; i++) {
    const x = -gap[0] + 0.1 + rnd() * (2.15 + gap[0]);
    flower(ctx, x, -0.03 - rnd() * 0.1, 0.016 + rnd() * 0.01, C.flowers[i % 4]);
  }
}

function drawCottage(ctx, rnd, px, glowOnly) {
  const L = -0.34;
  const R = 0.34;
  const eaves = -0.5;
  const ground = -0.04;
  const win = (x, y, w, h, round) => {
    ctx.beginPath();
    if (round) ctx.arc(x, y, w, 0, TAU);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
  };
  if (glowOnly) {
    // emissive map: windows and the door lantern only
    ctx.fillStyle = '#ffd27a';
    win(0.18, -0.29, 0.15, 0.13);
    ctx.fill();
    win(-0.02, -0.66, 0.05, 0, true);
    ctx.fill();
    const g = ctx.createRadialGradient(-0.2, -0.28, 0, -0.2, -0.28, 0.05);
    g.addColorStop(0, '#ffe2a0');
    g.addColorStop(1, 'rgba(255, 200, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(-0.2, -0.28, 0.05, 0, TAU);
    ctx.fill();
    return;
  }
  // garden ground strip
  const grass = [];
  for (let x = -0.46; x <= 0.46; x += 0.07) grass.push([x, 0.0, 0.05 + rnd() * 0.03]);
  inkedCircles(ctx, grass, '#5f8c4b', 1.3 * px);
  // chimney
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.rect(0.14, -0.98, 0.1, 0.3);
  ctx.stroke();
  ctx.fillStyle = '#9c9188';
  ctx.fill();
  ctx.fillStyle = 'rgba(60, 50, 45, 0.35)';
  for (let y = -0.96; y < -0.7; y += 0.04) ctx.fillRect(0.14 + ((y * 100) % 2 ? 0.02 : 0.05), y, 0.035, 0.012);
  // walls
  ctx.beginPath();
  ctx.rect(L, eaves, R - L, ground - eaves);
  ctx.stroke();
  const wall = ctx.createLinearGradient(L, 0, R, 0);
  wall.addColorStop(0, '#f8ecd2');
  wall.addColorStop(1, '#dcc9a5');
  ctx.fillStyle = wall;
  ctx.fill();
  // half timbering
  ctx.strokeStyle = C.timber;
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  for (const x of [L + 0.011, -0.08, R - 0.011]) {
    ctx.moveTo(x, eaves);
    ctx.lineTo(x, ground);
  }
  ctx.moveTo(L, -0.22);
  ctx.lineTo(R, -0.22);
  ctx.moveTo(L, eaves + 0.011);
  ctx.lineTo(R, eaves + 0.011);
  ctx.moveTo(-0.08, eaves);
  ctx.lineTo(L, -0.22);
  ctx.moveTo(0.04, eaves);
  ctx.lineTo(0.3, -0.22);
  ctx.stroke();
  // roof (shingled, mossy) with deep eaves
  ctx.beginPath();
  ctx.moveTo(-0.47, eaves + 0.04);
  ctx.lineTo(-0.02, -0.98);
  ctx.lineTo(0.47, eaves + 0.04);
  ctx.closePath();
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  const rg = ctx.createLinearGradient(-0.4, -0.9, 0.4, -0.5);
  rg.addColorStop(0, C.roof[0]);
  rg.addColorStop(0.55, C.roof[1]);
  rg.addColorStop(1, C.roof[2]);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(60, 30, 18, 0.45)';
  ctx.lineWidth = 1.3 * px;
  for (let y = -0.95; y < eaves + 0.04; y += 0.045) {
    ctx.beginPath();
    for (let x = -0.5; x < 0.5; x += 0.05) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 0.025, y + 0.02, x + 0.05, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(160, 178, 92, 0.85)';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.ellipse(-0.35 + rnd() * 0.7, -0.6 - rnd() * 0.25, 0.03 + rnd() * 0.04, 0.012 + rnd() * 0.01, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // gable window (round, warm)
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = C.ink;
  win(-0.02, -0.66, 0.055, 0, true);
  ctx.fillStyle = C.timber;
  ctx.fill();
  win(-0.02, -0.66, 0.045, 0, true);
  ctx.fillStyle = C.glow;
  ctx.fill();
  // main window with shutters and flower box
  ctx.fillStyle = C.sage;
  ctx.fillRect(0.06, -0.37, 0.035, 0.16);
  ctx.fillRect(0.265, -0.37, 0.035, 0.16);
  win(0.18, -0.29, 0.17, 0.15);
  ctx.fillStyle = C.timber;
  ctx.fill();
  win(0.18, -0.29, 0.14, 0.12);
  ctx.fillStyle = C.glow;
  ctx.fill();
  ctx.fillStyle = '#e8a94a';
  ctx.fillRect(0.11, -0.29, 0.14, 0.06);
  ctx.strokeStyle = C.timber;
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(0.18, -0.35);
  ctx.lineTo(0.18, -0.23);
  ctx.moveTo(0.11, -0.29);
  ctx.lineTo(0.25, -0.29);
  ctx.stroke();
  ctx.fillStyle = '#7a5236';
  ctx.fillRect(0.08, -0.215, 0.2, 0.03);
  for (let i = 0; i < 7; i++) flower(ctx, 0.095 + i * 0.028, -0.225, 0.012, C.flowers[1 + (i % 3)]);
  // arched door
  ctx.beginPath();
  ctx.moveTo(-0.27, ground);
  ctx.lineTo(-0.27, -0.22);
  ctx.arc(-0.2, -0.22, 0.07, PI, 0);
  ctx.lineTo(-0.13, ground);
  ctx.closePath();
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = C.door;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 20, 10, 0.45)';
  ctx.lineWidth = 1.2 * px;
  ctx.beginPath();
  ctx.moveTo(-0.225, -0.25);
  ctx.lineTo(-0.225, ground);
  ctx.moveTo(-0.175, -0.25);
  ctx.lineTo(-0.175, ground);
  ctx.stroke();
  ctx.fillStyle = '#e7c46a';
  ctx.beginPath();
  ctx.arc(-0.155, -0.12, 0.009, 0, TAU);
  ctx.fill();
  // lantern by the door
  ctx.fillStyle = C.soot;
  ctx.fillRect(-0.315, -0.31, 0.03, 0.045);
  ctx.fillStyle = C.glow;
  ctx.fillRect(-0.31, -0.3, 0.02, 0.03);
  // woodpile, path stones, flowers
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 4 - r; i++) {
      const x = -0.44 + i * 0.045 + r * 0.022;
      const y = -0.03 - r * 0.04;
      ctx.beginPath();
      ctx.arc(x, y, 0.022, 0, TAU);
      ctx.fillStyle = '#c99a62';
      ctx.fill();
      ctx.strokeStyle = C.timber;
      ctx.lineWidth = 1.2 * px;
      ctx.stroke();
    }
  }
  for (let i = 0; i < 10; i++) flower(ctx, 0.36 + rnd() * 0.1, -0.02 - rnd() * 0.08, 0.014, C.flowers[i % 4]);
  for (let i = 0; i < 6; i++) flower(ctx, -0.12 + rnd() * 0.16, -0.015 - rnd() * 0.03, 0.012, C.flowers[(i + 1) % 4]);
}

function drawSmoke(ctx) {
  ctx.lineCap = 'round';
  for (const [w, col] of [[0.06, C.ink], [0.045, '#eef0ee']]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, -0.02);
    ctx.bezierCurveTo(0.05, -0.08, -0.06, -0.14, 0.0, -0.19);
    ctx.bezierCurveTo(0.06, -0.24, -0.05, -0.28, -0.01, -0.31);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f5f2';
  for (const [x, y, r] of [[0.01, -0.19, 0.035], [-0.01, -0.29, 0.03]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}

/** Sitting fox body (no head: the head is its own turning piece). Faces the reader's left. */
function drawFoxBody(ctx, rnd, px) {
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  // haunch + back
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.47);
  ctx.bezierCurveTo(-0.02, -0.5, 0.17, -0.42, 0.2, -0.25);
  ctx.bezierCurveTo(0.24, -0.1, 0.2, -0.02, 0.12, -0.01);
  ctx.lineTo(-0.17, -0.01);
  ctx.bezierCurveTo(-0.2, -0.15, -0.22, -0.32, -0.13, -0.47);
  ctx.closePath();
  ctx.stroke();
  const g = ctx.createLinearGradient(-0.2, -0.45, 0.22, -0.05);
  g.addColorStop(0, C.foxLight);
  g.addColorStop(0.5, C.fox);
  g.addColorStop(1, C.foxDark);
  ctx.fillStyle = g;
  ctx.fill();
  // haunch contour
  ctx.strokeStyle = 'rgba(120, 50, 20, 0.6)';
  ctx.lineWidth = 1.8 * px;
  ctx.beginPath();
  ctx.arc(0.08, -0.15, 0.12, PI * 0.95, PI * 1.9);
  ctx.stroke();
  // white chest bib
  ctx.beginPath();
  ctx.moveTo(-0.17, -0.44);
  ctx.bezierCurveTo(-0.07, -0.4, -0.06, -0.24, -0.1, -0.12);
  ctx.lineTo(-0.16, -0.12);
  ctx.bezierCurveTo(-0.21, -0.25, -0.22, -0.36, -0.17, -0.44);
  ctx.closePath();
  ctx.fillStyle = C.cream;
  ctx.fill();
  // front legs with dark socks
  for (const x of [-0.165, -0.105]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.022, -0.2);
    ctx.lineTo(x - 0.02, -0.012);
    ctx.lineTo(x + 0.03, -0.012);
    ctx.lineTo(x + 0.022, -0.2);
    ctx.closePath();
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    const lg = ctx.createLinearGradient(0, -0.2, 0, -0.01);
    lg.addColorStop(0, C.fox);
    lg.addColorStop(0.45, C.foxDark);
    lg.addColorStop(0.6, C.soot);
    lg.addColorStop(1, C.soot);
    ctx.fillStyle = lg;
    ctx.fill();
  }
  // back paw
  ctx.beginPath();
  ctx.ellipse(0.05, -0.022, 0.07, 0.022, 0, 0, TAU);
  ctx.fillStyle = C.soot;
  ctx.fill();
  // grass at the feet
  for (let i = 0; i < 7; i++) grassTuft(ctx, rnd, -0.3 + i * 0.1, 0, 0.05 + rnd() * 0.03, '#4c7a43', px);
}

function drawFoxHead(ctx, px) {
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  // ears
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.035, -0.17);
    ctx.lineTo(s * 0.11, -0.27);
    ctx.lineTo(s * 0.115, -0.14);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = C.fox;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.06, -0.17);
    ctx.lineTo(s * 0.105, -0.24);
    ctx.lineTo(s * 0.105, -0.16);
    ctx.closePath();
    ctx.fillStyle = C.soot;
    ctx.fill();
  }
  // head: broad cheeks tapering to a muzzle
  ctx.beginPath();
  ctx.moveTo(0, -0.2);
  ctx.bezierCurveTo(0.1, -0.2, 0.14, -0.12, 0.13, -0.08);
  ctx.bezierCurveTo(0.1, -0.05, 0.05, -0.02, 0, -0.012);
  ctx.bezierCurveTo(-0.05, -0.02, -0.1, -0.05, -0.13, -0.08);
  ctx.bezierCurveTo(-0.14, -0.12, -0.1, -0.2, 0, -0.2);
  ctx.closePath();
  ctx.stroke();
  const g = ctx.createLinearGradient(-0.12, -0.2, 0.12, -0.04);
  g.addColorStop(0, C.foxLight);
  g.addColorStop(1, C.fox);
  ctx.fillStyle = g;
  ctx.fill();
  // white cheeks and muzzle
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.moveTo(-0.13, -0.08);
  ctx.quadraticCurveTo(-0.06, -0.1, 0, -0.07);
  ctx.quadraticCurveTo(0.06, -0.1, 0.13, -0.08);
  ctx.bezierCurveTo(0.1, -0.05, 0.05, -0.02, 0, -0.012);
  ctx.bezierCurveTo(-0.05, -0.02, -0.1, -0.05, -0.13, -0.08);
  ctx.fill();
  // eyes, nose
  ctx.fillStyle = C.soot;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 0.05, -0.115, 0.014, 0.019, s * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 0.05 - 0.004, -0.122, 0.005, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = C.soot;
  ctx.beginPath();
  ctx.ellipse(0, -0.03, 0.017, 0.012, 0, 0, TAU);
  ctx.fill();
}

function drawFoxTail(ctx, px) {
  // base at (−0.14, −0.03) sweeping right and up into a white tip
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.02);
  ctx.bezierCurveTo(0.0, -0.02, 0.12, -0.02, 0.17, -0.12);
  ctx.bezierCurveTo(0.21, -0.2, 0.18, -0.28, 0.12, -0.3);
  ctx.bezierCurveTo(0.16, -0.22, 0.1, -0.13, 0.02, -0.1);
  ctx.bezierCurveTo(-0.06, -0.08, -0.12, -0.08, -0.16, -0.07);
  ctx.closePath();
  ctx.stroke();
  const g = ctx.createLinearGradient(-0.15, 0, 0.18, -0.3);
  g.addColorStop(0, C.foxDark);
  g.addColorStop(0.55, C.fox);
  g.addColorStop(0.78, C.foxLight);
  g.addColorStop(0.8, C.cream);
  g.addColorStop(1, C.cream);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawFerns(ctx, rnd, px) {
  stone(ctx, rnd, 0.12, -0.04, 0.07, px);
  for (let i = 0; i < 9; i++) {
    const a = -1.05 + (i / 8) * 2.1 + (rnd() - 0.5) * 0.2;
    frond(ctx, rnd, (rnd() - 0.5) * 0.06, 0, a, 0.3 + rnd() * 0.12, C.fern[i % 3], px);
  }
  for (let i = 0; i < 5; i++) flower(ctx, -0.22 + rnd() * 0.44, -0.02 - rnd() * 0.05, 0.016, C.flowers[i % 4]);
}

function drawToadstools(ctx, rnd, px) {
  for (let i = 0; i < 5; i++) grassTuft(ctx, rnd, -0.18 + i * 0.09, 0, 0.07 + rnd() * 0.04, '#55834a', px);
  mushroom(ctx, rnd, -0.08, 0, 0.26, px, { tilt: -0.1 });
  mushroom(ctx, rnd, 0.1, 0, 0.18, px, { tilt: 0.15 });
  mushroom(ctx, rnd, 0.17, 0, 0.1, px, { tilt: 0.25 });
}

function drawMushrooms(ctx, rnd, px) {
  for (let i = 0; i < 5; i++) grassTuft(ctx, rnd, -0.2 + i * 0.1, 0, 0.06 + rnd() * 0.04, '#55834a', px);
  mushroom(ctx, rnd, -0.1, 0, 0.2, px, { cap: C.brown, dots: false, tilt: -0.15 });
  mushroom(ctx, rnd, 0.02, 0, 0.25, px, { cap: C.brown, dots: false });
  mushroom(ctx, rnd, 0.15, 0, 0.15, px, { tilt: 0.2 });
  // a snail
  ctx.fillStyle = '#d9c39a';
  ctx.beginPath();
  ctx.ellipse(-0.17, -0.012, 0.045, 0.012, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.6 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.arc(-0.17, -0.045, 0.03, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#b07a4a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-0.17, -0.045, 0.015, 0, TAU * 0.8);
  ctx.stroke();
}

function drawBracken(ctx, rnd, px) {
  for (let i = 0; i < 7; i++) {
    const a = -1.3 + (i / 6) * 2.6;
    frond(ctx, rnd, (rnd() - 0.5) * 0.25, 0, a, 0.17 + rnd() * 0.08, C.fern[(i + 1) % 3], px);
  }
  // bluebells
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    ctx.strokeStyle = '#4c7a43';
    ctx.lineWidth = 1.5 * px;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 0.02, -0.15, x + 0.06, -0.2);
    ctx.stroke();
    ctx.fillStyle = '#8f8fd8';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(x + 0.025 + k * 0.012, -0.12 - k * 0.03, 0.012, 0.018, 0.3, 0, TAU);
      ctx.fill();
    }
  }
}

function drawLog(ctx, rnd, px) {
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(-0.24, -0.02);
  ctx.lineTo(0.26, -0.02);
  ctx.quadraticCurveTo(0.3, -0.11, 0.26, -0.2);
  ctx.lineTo(-0.24, -0.2);
  ctx.closePath();
  ctx.stroke();
  const g = ctx.createLinearGradient(0, -0.2, 0, -0.02);
  g.addColorStop(0, '#9a6f4d');
  g.addColorStop(1, '#5b3d29');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 22, 12, 0.5)';
  ctx.lineWidth = 1.3 * px;
  for (let i = 0; i < 5; i++) {
    const y = -0.17 + i * 0.033;
    ctx.beginPath();
    ctx.moveTo(-0.2, y);
    ctx.bezierCurveTo(-0.05, y + 0.01, 0.1, y - 0.01, 0.24, y);
    ctx.stroke();
  }
  // hollow end
  ctx.beginPath();
  ctx.ellipse(-0.24, -0.11, 0.05, 0.09, 0, 0, TAU);
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = '#c99d6b';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.24, -0.11, 0.032, 0.065, 0, 0, TAU);
  ctx.fillStyle = '#2e2018';
  ctx.fill();
  // moss and a little mushroom family
  const moss = [];
  for (let x = -0.2; x < 0.24; x += 0.05) moss.push([x, -0.2, 0.02 + rnd() * 0.025]);
  inkedCircles(ctx, moss, '#93ae56', 1.2 * px);
  mushroom(ctx, rnd, 0.1, -0.21, 0.08, px, { cap: C.brown, dots: false });
  mushroom(ctx, rnd, 0.15, -0.2, 0.06, px, { cap: C.brown, dots: false, tilt: 0.3 });
  for (let i = 0; i < 6; i++) grassTuft(ctx, rnd, -0.28 + i * 0.11, 0, 0.05, '#55834a', px);
}

// ---------------------------------------------------------------------------------------------
// Page art: both pages painted as ONE 1536x1024 spread in spread units (x right, z toward the
// reader; 256 px per unit) so the stream is continuous across the gutter, then split.

function streamOutline(THREE, path) {
  const pts = [[-2.25, -1.42], ...path.map(([x, z]) => [x, z]), [3.25, 2.3]];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = 260;
  const P = curve.getSpacedPoints(n);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const f = i / n;
    out.push({ x: P[i].x, z: P[i].z, nx: -dz / l, nz: dx / l, f, w: 0.34 + 0.62 * Math.pow(f, 1.25) });
  }
  return out;
}

function streamPath(ctx, S, scale, wob = 0) {
  ctx.beginPath();
  S.forEach((p, i) => {
    const h = (p.w / 2) * scale * (1 + wob * Math.sin(p.f * 41 + 1.3));
    if (i === 0) ctx.moveTo(p.x + p.nx * h, p.z + p.nz * h);
    else ctx.lineTo(p.x + p.nx * h, p.z + p.nz * h);
  });
  for (let i = S.length - 1; i >= 0; i--) {
    const p = S[i];
    const h = (p.w / 2) * scale * (1 + wob * Math.sin(p.f * 37 + 4.1));
    ctx.lineTo(p.x - p.nx * h, p.z - p.nz * h);
  }
  ctx.closePath();
}

const POOL = { x: -2.02, z: -1.3, rx: 0.42, rz: 0.29, rot: 0.25 };

function poolPath(ctx, grow) {
  ctx.beginPath();
  ctx.ellipse(POOL.x, POOL.z, POOL.rx + grow, POOL.rz + grow, POOL.rot, 0, TAU);
}

function drawPageSpread(ctx, rnd, S) {
  const px = 1 / 256;
  // ground: far edge in deep shade, sunlit toward the reader
  const g = ctx.createLinearGradient(0, -2, 0, 2);
  g.addColorStop(0, '#4b6a46');
  g.addColorStop(0.4, '#6c8c50');
  g.addColorStop(1, '#93ac60');
  ctx.fillStyle = g;
  ctx.fillRect(-3, -2, 6, 4);
  for (let i = 0; i < 90; i++) {
    const x = -3 + rnd() * 6;
    const z = -2 + rnd() * 4;
    const pick = rnd();
    const col = pick < 0.35 ? '#a9bd68' : pick < 0.65 ? '#5b7c45' : pick < 0.85 ? '#86a85a' : '#c1b65f';
    softSpot(ctx, x, z, 0.2 + rnd() * 0.45, col, 0.35 + rnd() * 0.25, 1 + rnd() * 0.8, rnd() * PI);
  }
  // dappled sunlight
  for (let i = 0; i < 46; i++) {
    const x = -3 + rnd() * 6;
    const z = -1.2 + rnd() * 3.2;
    softSpot(ctx, x, z, 0.08 + rnd() * 0.2, '#fff0b8', 0.35 + rnd() * 0.25, 1.6, -0.5);
  }
  // misty far edge
  const mist = ctx.createLinearGradient(0, -2, 0, -0.8);
  mist.addColorStop(0, 'rgba(232, 240, 232, 0.45)');
  mist.addColorStop(1, 'rgba(232, 240, 232, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(-3, -2, 6, 1.2);
  // grass, clover, fallen leaves, flowers
  for (let i = 0; i < 520; i++) {
    const x = -3 + rnd() * 6;
    const z = -2 + rnd() * 4;
    grassTuft(ctx, rnd, x, z, 0.035 + rnd() * 0.03, rnd() < 0.5 ? 'rgba(62, 100, 54, 0.7)' : 'rgba(170, 196, 104, 0.8)', px);
  }
  for (let i = 0; i < 70; i++) {
    const x = -3 + rnd() * 6;
    const z = -1.6 + rnd() * 3.5;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(201, 135, 64, 0.8)' : 'rgba(214, 178, 82, 0.8)';
    ctx.beginPath();
    ctx.ellipse(x, z, 0.03, 0.013, rnd() * PI, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 26; i++) {
    const x = -2.9 + rnd() * 5.8;
    const z = -1.2 + rnd() * 3.1;
    frond(ctx, rnd, x, z, (rnd() - 0.5) * 2.4, 0.12 + rnd() * 0.12, rgba('#3f7040', 0.75), px);
  }
  for (let i = 0; i < 150; i++) {
    const x = -2.95 + rnd() * 5.9;
    const z = -1.0 + rnd() * 2.95;
    flower(ctx, x, z, 0.012 + rnd() * 0.012, C.flowers[i % 4]);
  }
  // shade pools under the standing layers (pre-printed ambient occlusion)
  for (let x = -2.6; x <= 2.6; x += 0.3) softSpot(ctx, x, -0.6 - 0.3 * Math.abs(x), 0.35, '#25402f', 0.18, 2.2, Math.sign(x) * 0.33);

  // ---- stream: banks, water, reflections, highlights
  ctx.save();
  ctx.lineJoin = 'round';
  streamPath(ctx, S, 1.55, 0.12);
  ctx.fillStyle = rgba(C.mud, 0.55);
  ctx.fill();
  poolPath(ctx, 0.14);
  ctx.fill();
  streamPath(ctx, S, 1.32, 0.1);
  ctx.fillStyle = C.bank;
  ctx.fill();
  poolPath(ctx, 0.08);
  ctx.fill();
  for (let i = 0; i < 220; i++) {
    const p = S[Math.floor(rnd() * S.length)];
    const side = rnd() < 0.5 ? -1 : 1;
    const h = (p.w / 2) * (1.04 + rnd() * 0.26) * side;
    ctx.fillStyle = C.stone[Math.floor(rnd() * 3)];
    ctx.beginPath();
    ctx.ellipse(p.x + p.nx * h, p.z + p.nz * h, 0.012 + rnd() * 0.02, 0.009 + rnd() * 0.012, rnd() * PI, 0, TAU);
    ctx.fill();
  }
  // water body
  streamPath(ctx, S, 1.0, 0.06);
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  poolPath(ctx, 0);
  ctx.stroke();
  streamPath(ctx, S, 1.0, 0.06);
  ctx.fillStyle = C.waterDeep;
  ctx.fill();
  poolPath(ctx, 0);
  ctx.fill();
  ctx.filter = 'blur(10px)';
  streamPath(ctx, S, 0.68, 0.05);
  ctx.fillStyle = C.water;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(POOL.x + 0.03, POOL.z + 0.02, POOL.rx * 0.72, POOL.rz * 0.68, POOL.rot, 0, TAU);
  ctx.fill();
  streamPath(ctx, S, 0.26, 0.2);
  ctx.fillStyle = rgba(C.waterLight, 0.75);
  ctx.fill();
  ctx.filter = 'none';
  // tree reflections along the far bank and the pool
  for (let i = 0; i < 26; i++) {
    const p = S[Math.floor(rnd() * S.length)];
    const h = (p.w / 2) * 0.62;
    softSpot(ctx, p.x + p.nx * h, p.z + p.nz * h, 0.08 + rnd() * 0.06, '#24503f', 0.35, 2.4, Math.atan2(p.nz, p.nx) + PI / 2);
  }
  // flow lines
  ctx.lineCap = 'round';
  for (let k = 0; k < 48; k++) {
    const i0 = Math.floor(rnd() * (S.length - 14));
    const len = 5 + Math.floor(rnd() * 9);
    const off = (rnd() - 0.5) * 0.7;
    ctx.strokeStyle = `rgba(241, 248, 244, ${0.35 + rnd() * 0.45})`;
    ctx.lineWidth = (1.4 + rnd() * 1.8) * px;
    ctx.beginPath();
    for (let i = i0; i < i0 + len; i++) {
      const p = S[i];
      const h = (p.w / 2) * off;
      if (i === i0) ctx.moveTo(p.x + p.nx * h, p.z + p.nz * h);
      else ctx.lineTo(p.x + p.nx * h, p.z + p.nz * h);
    }
    ctx.stroke();
  }
  ctx.restore();
  // rocks around the far side of the pool
  for (let i = 0; i < 11; i++) {
    const a = PI * (0.85 + (i / 10) * 1.05);
    stone(ctx, rnd, POOL.x + Math.cos(a) * (POOL.rx + 0.08), POOL.z + Math.sin(a) * (POOL.rz + 0.07), 0.06 + rnd() * 0.05, px);
  }
  // lily pads and a flower, kept off the boat's line
  for (const [f, side] of [[0.6, 0.62], [0.66, -0.66], [0.74, 0.6], [0.8, -0.55], [0.86, 0.6], [0.9, -0.62], [0.95, 0.5]]) {
    const p = S[Math.floor(f * (S.length - 1))];
    const h = (p.w / 2) * side;
    const x = p.x + p.nx * h;
    const z = p.z + p.nz * h;
    const r = 0.05 + rnd() * 0.025;
    ctx.beginPath();
    ctx.moveTo(x, z);
    ctx.arc(x, z, r, rnd() * TAU, rnd() * 0.5 + 5.7);
    ctx.closePath();
    ctx.lineWidth = 1.6 * px;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = '#6fa34f';
    ctx.fill();
    ctx.fillStyle = 'rgba(200, 230, 140, 0.6)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, z - r * 0.25, r * 0.4, 0, TAU);
    ctx.fill();
    if (side > 0.55 && f > 0.7) flower(ctx, x + r * 0.2, z, 0.02, '#f6d6e0');
  }
  // reeds on the right-page banks
  for (let i = 0; i < 9; i++) {
    const p = S[Math.floor((0.5 + rnd() * 0.45) * (S.length - 1))];
    const side = rnd() < 0.5 ? -1 : 1;
    const h = (p.w / 2) * 1.12 * side;
    const x = p.x + p.nx * h;
    const z = p.z + p.nz * h;
    grassTuft(ctx, rnd, x, z, 0.09, '#4a7a3f', px);
    ctx.fillStyle = '#7a4f30';
    ctx.beginPath();
    ctx.ellipse(x + 0.01, z - 0.08, 0.008, 0.025, 0.2, 0, TAU);
    ctx.fill();
  }
  // a mossy hollow log beside the stream (left page)
  ctx.save();
  ctx.translate(-0.78, 0.48);
  ctx.rotate(0.3);
  ctx.lineWidth = 2.2 * px;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(-0.31, -0.085);
  ctx.lineTo(0.3, -0.085);
  ctx.quadraticCurveTo(0.36, 0, 0.3, 0.085);
  ctx.lineTo(-0.31, 0.085);
  ctx.closePath();
  ctx.stroke();
  const lg = ctx.createLinearGradient(0, -0.085, 0, 0.085);
  lg.addColorStop(0, '#9b8063');
  lg.addColorStop(0.5, '#76593f');
  lg.addColorStop(1, '#4b3526');
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(45, 25, 14, 0.5)';
  ctx.lineWidth = 1.4 * px;
  for (let i = 0; i < 6; i++) {
    const y = -0.065 + i * 0.026;
    ctx.beginPath();
    ctx.moveTo(-0.27, y);
    ctx.bezierCurveTo(-0.1, y + 0.012, 0.1, y - 0.012, 0.29, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(-0.31, 0, 0.045, 0.085, 0, 0, TAU);
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.fillStyle = '#bfa27c';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.31, 0, 0.03, 0.06, 0, 0, TAU);
  ctx.fillStyle = '#2b1d15';
  ctx.fill();
  const moss = [];
  for (let x = -0.26; x < 0.27; x += 0.04) moss.push([x, -0.06 + rnd() * 0.03, 0.026 + rnd() * 0.022]);
  inkedCircles(ctx, moss, '#9cb45a', 1.2 * px);
  mushroom(ctx, rnd, 0.12, -0.06, 0.07, px, { cap: C.brown, dots: false });
  ctx.restore();
  // stepping stones from the cottage door toward the reader
  for (const [x, z] of [[-2.07, 0.74], [-1.97, 0.97], [-2.08, 1.2], [-1.95, 1.43], [-2.06, 1.66], [-1.96, 1.9]]) {
    stone(ctx, rnd, x, z, 0.065, px, 0.62);
  }
  // deep shade in the far corners, where the forest closes in
  softSpot(ctx, -3, -2, 1.5, '#203528', 0.55, 1.3);
  softSpot(ctx, 3, -2, 1.6, '#203528', 0.55, 1.3);
  softSpot(ctx, 0, -2.1, 1.2, '#203528', 0.35, 2.4);
}

// ---------------------------------------------------------------------------------------------
// Small textures for props

function glowCanvas(paper, size, stops) {
  const { canvas, ctx } = paper.makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function ringCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(128, 128);
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.filter = 'blur(1px)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(64, 64, 42, 0, TAU);
  ctx.stroke();
  return canvas;
}

function sparkleCanvas(paper, rnd) {
  const { canvas, ctx } = paper.makeCanvas(256, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const l = 4 + rnd() * 10;
    ctx.strokeStyle = `rgba(255, 250, 225, ${0.4 + rnd() * 0.6})`;
    ctx.lineWidth = 1 + rnd() * 1.5;
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - l / 2, y + oy - l * 0.15);
        ctx.lineTo(x + ox + l / 2, y + oy + l * 0.15);
        ctx.stroke();
      }
    }
  }
  return canvas;
}

function shaftCanvas(paper) {
  const { canvas, ctx } = paper.makeCanvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  return canvas;
}

/** The lost page: cream paper with faded lines of text. */
function sheetCanvas(paper, rnd) {
  return paper.paint(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#fbf6ea';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(80, 70, 60, 0.22)';
      for (let y = 30; y < 236; y += 15) {
        let x = 24;
        while (x < 226) {
          const w = 8 + rnd() * 26;
          if (x + w > 232) break;
          ctx.fillRect(x, y, w, 4);
          x += w + 5;
        }
      }
      ctx.strokeStyle = 'rgba(120, 110, 100, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 128);
      ctx.lineTo(256, 128);
      ctx.moveTo(128, 128);
      ctx.lineTo(0, 0);
      ctx.moveTo(128, 128);
      ctx.lineTo(256, 0);
      ctx.stroke();
    },
    { dieCut: 0, grain: 0.05, seed: 77 },
  );
}

// ---------------------------------------------------------------------------------------------
// Boat track: centripetal Catmull-Rom through the waypoints, arc length sampled; film time ->
// arc length is a monotone C1 Hermite (PCHIP-style) through (t_i, s_i), at rest at both ends.

function makeTrack(THREE, path) {
  const n = path.length;
  const per = 120;
  const M = per * (n - 1);
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const X = new Float32Array(M + 1);
  const Z = new Float32Array(M + 1);
  const L = new Float32Array(M + 1);
  const p = new THREE.Vector3();
  for (let j = 0; j <= M; j++) {
    curve.getPoint(j / M, p);
    X[j] = p.x;
    Z[j] = p.z;
    if (j) L[j] = L[j - 1] + Math.hypot(X[j] - X[j - 1], Z[j] - Z[j - 1]);
  }
  const T = path.map((q) => q[2]);
  const S = path.map((_, i) => L[i * per]);
  const sec = [];
  for (let i = 0; i < n - 1; i++) sec.push((S[i + 1] - S[i]) / (T[i + 1] - T[i]));
  const D = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) D[i] = (2 * sec[i - 1] * sec[i]) / (sec[i - 1] + sec[i]);
  const track = {
    x: 0,
    z: 0,
    hx: 1,
    hz: 0,
    /** Arc length travelled at film time t. */
    s(t) {
      if (t <= T[0]) return 0;
      if (t >= T[n - 1]) return S[n - 1];
      let i = 0;
      while (t > T[i + 1]) i++;
      const h = T[i + 1] - T[i];
      const u = (t - T[i]) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * S[i] + (u3 - 2 * u2 + u) * h * D[i] + (-2 * u3 + 3 * u2) * S[i + 1] + (u3 - u2) * h * D[i + 1];
    },
    /** Sets track.x/z (position) and track.hx/hz (unit heading) at arc length s. */
    at(s) {
      let lo = 0;
      let hi = M - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (L[mid] <= s) lo = mid;
        else hi = mid - 1;
      }
      const seg = L[lo + 1] - L[lo];
      const f = seg > 0 ? Math.min(1, Math.max(0, (s - L[lo]) / seg)) : 0;
      track.x = X[lo] + (X[lo + 1] - X[lo]) * f;
      track.z = Z[lo] + (Z[lo + 1] - Z[lo]) * f;
      const a = Math.max(0, lo - 2);
      const b = Math.min(M, lo + 3);
      const dx = X[b] - X[a];
      const dz = Z[b] - Z[a];
      const l = Math.hypot(dx, dz) || 1;
      track.hx = dx / l;
      track.hz = dz / l;
      return track;
    },
  };
  return track;
}

// ---------------------------------------------------------------------------------------------
// The folding sheet: six rigid triangles of a square (side 0.6 before scale) that stand up, fold
// in half (crease on top), fold their top corners down into a paper hat, then narrow into the
// boat's sail while paper.boat's hull opens around it.

const SHEET_TRIS = (() => {
  const h = 0.3;
  // [x, y] in the unfolded square (x in [-0.3, 0.3], y in [0, 0.6]); flags: top half, corner side
  return [
    { top: false, corner: 0, v: [[-h, 0], [h, 0], [0, h]] },
    { top: false, corner: 1, v: [[0, h], [h, 0], [h, h]] },
    { top: false, corner: -1, v: [[0, h], [-h, h], [-h, 0]] },
    { top: true, corner: 0, v: [[-h, 2 * h], [0, h], [h, 2 * h]] },
    { top: true, corner: 1, v: [[0, h], [h, h], [h, 2 * h]] },
    { top: true, corner: -1, v: [[0, h], [-h, 2 * h], [-h, h]] },
  ];
})();

function makeSheet(THREE, material) {
  // Two single-sided layers per triangle (front, then reversed back), SHEET_T apart, so each side
  // has its own outward normal and thin paper never self-shadows.
  const tris = SHEET_TRIS.length;
  const count = tris * 6;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const flat = new Float32Array(tris * 9); // posed triangle corners before layering
  let k = 0;
  for (const tri of SHEET_TRIS) {
    for (const order of [[0, 1, 2], [0, 2, 1]]) {
      for (const v of order) {
        const [x, y] = tri.v[v];
        uv[k * 2] = (x + 0.3) / 0.6;
        uv[k * 2 + 1] = y / 0.6;
        k++;
      }
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.6);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const q = [0, 0, 0];
  const HALF = 0.0012;
  /** Poses the sheet: a = stand up, b = fold in half, c = corners down (each 0..1). */
  function pose(a, b, c) {
    const ra = -(PI / 2) * (1 - a);
    const ca = Math.cos(ra);
    const sa = Math.sin(ra);
    const cb = Math.cos(PI * b);
    const sb = Math.sin(PI * b);
    const cc = Math.cos(PI * c);
    const sc = Math.sin(PI * c);
    let i = 0;
    for (const tri of SHEET_TRIS) {
      for (const [x, y] of tri.v) {
        q[0] = x;
        q[1] = y;
        q[2] = 0;
        if (tri.top) {
          const ry = y - 0.3;
          q[1] = 0.3 + ry * cb;
          q[2] = ry * sb + 0.006 * b;
        }
        if (tri.corner !== 0) {
          // Rodrigues about the diagonal through (0, 0.3, z0), axis (s, -1, 0)/√2, angle s·πc:
          // both flaps swing toward +z; the bottom layer's flap wraps outside the top layer's
          const z0 = tri.top ? 0.009 : 0.012;
          const s = tri.corner;
          const ux = s / Math.SQRT2;
          const uy = -1 / Math.SQRT2;
          const px0 = q[0];
          const py0 = q[1] - 0.3;
          const pz0 = q[2] - z0;
          const dot = px0 * ux + py0 * uy;
          const sn = s * sc;
          q[0] = px0 * cc + uy * pz0 * sn + ux * dot * (1 - cc);
          q[1] = py0 * cc - ux * pz0 * sn + uy * dot * (1 - cc) + 0.3;
          q[2] = pz0 * cc + (ux * py0 - uy * px0) * sn + z0;
        }
        // stand up: rotate about the bottom edge (x axis) and slide so the sheet stays centred
        flat[i++] = q[0];
        flat[i++] = q[1] * ca - q[2] * sa;
        flat[i++] = q[1] * sa + q[2] * ca + 0.3 * (1 - a);
      }
    }
    let o = 0;
    for (let t = 0; t < tris; t++) {
      const f = t * 9;
      const e1x = flat[f + 3] - flat[f];
      const e1y = flat[f + 4] - flat[f + 1];
      const e1z = flat[f + 5] - flat[f + 2];
      const e2x = flat[f + 6] - flat[f];
      const e2y = flat[f + 7] - flat[f + 1];
      const e2z = flat[f + 8] - flat[f + 2];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      for (const side of [1, -1]) {
        for (const v of side > 0 ? [0, 1, 2] : [0, 2, 1]) {
          pos[o] = flat[f + v * 3] + nx * HALF * side;
          pos[o + 1] = flat[f + v * 3 + 1] + ny * HALF * side;
          pos[o + 2] = flat[f + v * 3 + 2] + nz * HALF * side;
          nor[o] = nx * side;
          nor[o + 1] = ny * side;
          nor[o + 2] = nz * side;
          o += 3;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  pose(0, 0, 0);
  return { mesh, pose };
}

// ---------------------------------------------------------------------------------------------
// Fireflies: one Points draw, drifting and twinkling in the vertex shader (pure in uTime).

const FIREFLY_VERT = /* glsl */ `
uniform float uTime;
uniform float uRise;
uniform float uGather;
uniform float uBurst;
uniform float uScale;
uniform vec3 uSpring;
attribute vec4 aRand;
varying float vAlpha;
void main() {
  float t = uTime * (0.22 + aRand.x * 0.25) + aRand.y * 6.2832;
  vec3 p = position + vec3(sin(t) * 0.28, sin(t * 1.37 + aRand.z * 5.0) * 0.14, cos(t * 0.83) * 0.22);
  p = mix(vec3(0.0, 0.08 + p.y * 0.2, p.z * 0.5), p, uRise);
  float a = uTime * (1.6 + aRand.z) + aRand.x * 6.2832;
  float rr = 0.18 + aRand.w * 0.22 + uBurst * (0.6 + aRand.y);
  vec3 orbit = uSpring + vec3(cos(a) * rr, 0.12 + aRand.y * 0.3 + sin(a * 1.3) * 0.05 + uBurst * 0.25, sin(a) * rr * 0.8);
  float g = uGather * step(0.35, aRand.w);
  p = mix(p, orbit, g);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.5 + 0.5 * sin(uTime * (2.0 + aRand.z * 3.0) + aRand.x * 40.0);
  vAlpha = uRise * (0.25 + 0.75 * tw * tw);
  gl_PointSize = uScale * (0.03 + 0.03 * aRand.z) * (0.6 + 0.4 * tw) * (1.0 + 0.7 * g) / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FIREFLY_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  float core = smoothstep(0.35, 0.0, d);
  gl_FragColor = vec4(uColor * (0.6 * a * a + 1.4 * core), vAlpha * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------

export default {
  id: 'forest',
  title: 'The Whispering Forest',
  build({ THREE, paper, popup, rng }) {
    const rnd = rng.next;
    const group = new THREE.Group();
    group.name = 'forest';
    const G = LAYOUT.gamma;
    const SG = Math.sin(G);
    const S0 = LAYOUT.boatScale;
    const [SPX, SPZ] = LAYOUT.spring;
    const track = makeTrack(THREE, LAYOUT.path);

    // ---- page art
    const stream = streamOutline(THREE, LAYOUT.path);
    const spread = paper.makeCanvas(1536, 1024);
    spread.ctx.setTransform(256, 0, 0, 256, 768, 512);
    drawPageSpread(spread.ctx, rnd, stream);
    const leftArt = paper.page((ctx) => ctx.drawImage(spread.canvas, 0, 0, 768, 1024, 0, 0, 768, 1024), { seed: 11 });
    const rightArt = paper.page((ctx) => ctx.drawImage(spread.canvas, 768, 0, 768, 1024, 0, 0, 768, 1024), { seed: 12 });

    /** Upright art faces the reader and only grazes the overhead lamp: let its print glow a little. */
    const liftArt = (card, lift = ART_LIFT) => {
      const mat = card.userData.front.material;
      mat.emissiveMap = mat.map;
      mat.emissive.set('#ffffff');
      mat.emissiveIntensity = lift;
      return card;
    };

    // ---- V-folds
    const F = LAYOUT.folds;
    const mechs = [];
    const fold = (f) => {
      const m = popup.vFold({ z0: f.z0, gamma: G, width: 2 * f.halfWidth, height: f.height });
      mechs.push(m);
      return m;
    };
    const addSplit = (m, f, canvas, lift = ART_LIFT) => {
      const halves = paper.splitCard({ canvas, width: 2 * f.halfWidth, height: f.height });
      m.left.add(liftArt(halves.left, lift));
      m.right.add(liftArt(halves.right, lift));
    };
    const springS = -SPX / SG; // distance of the spring from the crease along a left half (firs)
    addSplit(fold(F.pines), F.pines, cardCanvas(paper, 2 * F.pines.halfWidth, F.pines.height, 1024 / (2 * F.pines.halfWidth), (ctx, px) => drawPines(ctx, rnd, px, F.pines.halfWidth), { seed: 21, cut: 4 }), 0.1);
    addSplit(fold(F.firs), F.firs, cardCanvas(paper, 2 * F.firs.halfWidth, F.firs.height, 1024 / (2 * F.firs.halfWidth), (ctx, px) => drawFirs(ctx, rnd, px, F.firs.halfWidth, springS * 1.04), { seed: 22, cut: 5 }));
    // vellum mist: translucent halves sharing one material
    const mistFold = fold(F.mist);
    const mistCanvas = paper.makeCanvas(1024, 160);
    drawMist(mistCanvas.ctx, rnd, 1024, 160);
    const mistMat = new THREE.MeshStandardMaterial({ map: paper.texture(mistCanvas.canvas), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(F.mist.halfWidth, F.mist.height);
      geo.translate((side * F.mist.halfWidth) / 2, F.mist.height / 2, 0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (side < 0 ? 0 : 0.5) + uv.getX(i) * 0.5);
      const mesh = new THREE.Mesh(geo, mistMat);
      mesh.renderOrder = 1;
      (side < 0 ? mistFold.left : mistFold.right).add(mesh);
    }
    addSplit(fold(F.grove), F.grove, cardCanvas(paper, 2 * F.grove.halfWidth, F.grove.height, 1024 / (2 * F.grove.halfWidth), (ctx, px) => drawGrove(ctx, rnd, px, [0.92, F.grove.leftReach]), { seed: 23 }));

    // ---- standUps
    const flat = {};
    const K = 480;
    for (const [id, s] of Object.entries(LAYOUT.flats)) {
      flat[id] = popup.standUp(s);
      mechs.push(flat[id]);
    }
    const putCard = (id, draw, seed) => {
      const s = LAYOUT.flats[id];
      const c = liftArt(paper.card({ canvas: cardCanvas(paper, s.width, s.height, K, (ctx, px) => draw(ctx, rnd, px), { seed }), width: s.width, height: s.height }));
      flat[id].mount.add(c);
      return c;
    };
    // cottage: its emissive map is the art at ART_LIFT plus the lit windows at full strength
    const cot = LAYOUT.flats.cottage;
    const COT = cot.width; // the cottage art is drawn for a 1-unit-wide card
    const cottageArt = cardCanvas(paper, cot.width, cot.height, K, (ctx, px) => {
      ctx.scale(COT, COT);
      drawCottage(ctx, rnd, px / COT, false);
    }, { seed: 31 });
    const cottage = paper.card({ canvas: cottageArt, width: cot.width, height: cot.height });
    flat.cottage.mount.add(cottage);
    const glowArt = paper.makeCanvas(cottageArt.width, cottageArt.height);
    glowArt.ctx.globalAlpha = ART_LIFT;
    glowArt.ctx.drawImage(cottageArt, 0, 0);
    glowArt.ctx.globalAlpha = 1;
    glowArt.ctx.translate(cottageArt.width / 2, cottageArt.height);
    glowArt.ctx.scale(K * COT, K * COT);
    drawCottage(glowArt.ctx, rnd, 1 / (K * COT), true);
    const cottageMat = cottage.userData.front.material;
    cottageMat.emissiveMap = paper.texture(glowArt.canvas);
    cottageMat.emissive.set('#ffffff');
    const smokePivot = new THREE.Group();
    smokePivot.position.set(0.19 * COT, 0.99 * COT, 0.002);
    smokePivot.add(liftArt(paper.card({ canvas: cardCanvas(paper, 0.24, 0.36, K, (ctx) => drawSmoke(ctx), { seed: 32 }), width: 0.24, height: 0.36 }), 0.35));
    flat.cottage.mount.add(smokePivot);

    putCard('fox', drawFoxBody, 33);
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0.14, 0.08, -0.004);
    const tail = liftArt(paper.card({ canvas: cardCanvas(paper, 0.46, 0.34, K, (ctx, px) => drawFoxTail(ctx, px), { seed: 34 }), width: 0.46, height: 0.34 }));
    tail.position.set(0.15, -0.04, 0);
    tailPivot.add(tail);
    flat.fox.mount.add(tailPivot);
    const headPivot = new THREE.Group();
    headPivot.rotation.order = 'YXZ';
    headPivot.position.set(-0.125, 0.43, 0.004);
    headPivot.add(liftArt(paper.card({ canvas: cardCanvas(paper, 0.3, 0.29, 640, (ctx, px) => drawFoxHead(ctx, px), { seed: 35 }), width: 0.3, height: 0.29 })));
    flat.fox.mount.add(headPivot);
    const HEAD = { x: LAYOUT.flats.fox.x - 0.125, y: 0.55, z: LAYOUT.flats.fox.z };

    putCard('log', drawLog, 36);
    putCard('ferns', drawFerns, 37);
    putCard('toadstools', drawToadstools, 38);
    putCard('mushrooms', drawMushrooms, 39);
    putCard('bracken', drawBracken, 40);

    // ---- the lost page on the spring (rides the left page while the book opens)
    const sheetMount = popup.onPage({ side: 'left', x: -SPX, z: SPZ, lift: 0.004 });
    mechs.push(sheetMount);
    const sheetMat = new THREE.MeshStandardMaterial({ map: paper.texture(sheetCanvas(paper, rnd)), roughness: 0.9, metalness: 0 });
    const sheet = makeSheet(THREE, sheetMat);
    const sheetRoot = new THREE.Group();
    sheetRoot.name = 'forest-sheet';
    const heading0 = Math.atan2(-track.at(0.001).hz, track.hx);
    sheetRoot.rotation.y = heading0;
    sheetRoot.scale.setScalar(S0);
    sheetRoot.add(sheet.mesh);
    sheetMount.mount.add(sheetRoot);
    const glowTex = paper.texture(glowCanvas(paper, 128, [[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,214,140,0.45)'], [1, 'rgba(255,200,120,0)']]));
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }),
    );
    halo.position.y = 0.006;
    sheetMount.mount.add(halo);

    const mechanisms = popup.collection(mechs);
    group.add(mechanisms.object);

    // ---- the boat
    const boat = paper.boat({ scale: 1 });
    boat.name = 'forest-boat';
    boat.rotation.order = 'YXZ';
    group.add(boat);

    // ---- ripple rings (a pool of RINGS meshes, ring n emitted at BIRTH.pop[0] + n·RING_PERIOD)
    const ringTex = paper.texture(ringCanvas(paper));
    const rings = [];
    const ringGeo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: '#f4fbf8', transparent: true, depthWrite: false, opacity: 0, fog: false }));
      m.renderOrder = 2;
      group.add(m);
      rings.push(m);
    }

    // ---- shimmer of light on the printed stream (one overlay per page)
    const mask = paper.makeCanvas(768, 512);
    mask.ctx.fillStyle = '#000';
    mask.ctx.fillRect(0, 0, 768, 512);
    mask.ctx.setTransform(128, 0, 0, 128, 384, 256);
    mask.ctx.filter = 'blur(4px)';
    mask.ctx.fillStyle = '#fff';
    streamPath(mask.ctx, stream, 0.85, 0.05);
    mask.ctx.fill();
    poolPath(mask.ctx, -0.05);
    mask.ctx.fill();
    const sparkle = paper.texture(sparkleCanvas(paper, rnd));
    sparkle.wrapS = sparkle.wrapT = THREE.RepeatWrapping;
    sparkle.repeat.set(9, 6);
    const shimmerMat = new THREE.MeshBasicMaterial({
      map: sparkle,
      alphaMap: paper.texture(mask.canvas),
      color: '#fff4d6',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      fog: false,
    });
    for (const side of ['left', 'right']) {
      const m = popup.onPage({ side, x: 1.5, z: 0, lift: 0.0015 });
      const geo = new THREE.PlaneGeometry(3, 4).rotateX(-PI / 2);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (side === 'left' ? 0 : 0.5) + uv.getX(i) * 0.5);
      const mesh = new THREE.Mesh(geo, shimmerMat);
      mesh.renderOrder = 1;
      m.mount.add(mesh);
      mechs.push(m);
      group.add(m.object);
    }

    // ---- sunbeams slanting from the lamp side through the trees (additive, one mesh)
    const beamPos = [];
    const beamUv = [];
    const lamp = new THREE.Vector3(-5, 9, 1.5);
    const foot = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (const [x, z, w, len] of [[SPX, SPZ, 0.42, 1.75], [0.55, -0.15, 0.34, 1.6], [1.75, -0.55, 0.38, 1.7]]) {
      foot.set(x, 0, z);
      dir.subVectors(lamp, foot).normalize();
      side.crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(w / 2);
      const top = foot.clone().addScaledVector(dir, len);
      const quad = [foot.clone().sub(side), foot.clone().add(side), top.clone().add(side), top.clone().sub(side)];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        beamPos.push(quad[k].x, quad[k].y, quad[k].z);
        beamUv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
      }
    }
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(beamPos, 3));
    beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(beamUv, 2));
    const beamMat = new THREE.MeshBasicMaterial({ map: paper.texture(shaftCanvas(paper)), color: '#ffe3a6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0, fog: false });
    const beams = new THREE.Mesh(beamGeo, beamMat);
    beams.renderOrder = 3;
    group.add(beams);

    // ---- fireflies
    const ffPos = new Float32Array(FIREFLIES * 3);
    const ffRand = new Float32Array(FIREFLIES * 4);
    for (let i = 0; i < FIREFLIES; i++) {
      ffPos[i * 3] = (rnd() * 2 - 1) * 2.5;
      ffPos[i * 3 + 1] = 0.15 + rnd() * 1.3;
      ffPos[i * 3 + 2] = -0.9 + rnd() * 2.3;
      for (let k = 0; k < 4; k++) ffRand[i * 4 + k] = rnd();
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    ffGeo.setAttribute('aRand', new THREE.BufferAttribute(ffRand, 4));
    const ffUniforms = {
      uTime: { value: 0 },
      uRise: { value: 0 },
      uGather: { value: 0 },
      uBurst: { value: 0 },
      uScale: { value: 400 },
      uSpring: { value: new THREE.Vector3(SPX, 0, SPZ) },
      uColor: { value: new THREE.Color('#ffe48a') },
    };
    const fireflies = new THREE.Points(ffGeo, new THREE.ShaderMaterial({
      uniforms: ffUniforms,
      vertexShader: FIREFLY_VERT,
      fragmentShader: FIREFLY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    fireflies.frustumCulled = false;
    fireflies.renderOrder = 4;
    const bufSize = new THREE.Vector2();
    fireflies.onBeforeRender = (renderer, scene, camera) => {
      renderer.getDrawingBufferSize(bufSize);
      ffUniforms.uScale.value = bufSize.y * 0.5 * camera.projectionMatrix.elements[5];
    };
    group.add(fireflies);

    // ---- falling leaves (looping lanes)
    const leafTex = paper.cutoutTexture(paper.paint(64, 64, (ctx) => {
      ctx.translate(32, 32);
      ctx.rotate(0.6);
      ctx.fillStyle = '#d8a645';
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.quadraticCurveTo(16, -4, 0, 24);
      ctx.quadraticCurveTo(-16, -4, 0, -24);
      ctx.fill();
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 22);
      ctx.stroke();
    }, { dieCut: 3, seed: 41 }));
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const LEAF_LANES = [[-0.55, 0.45, 0], [0.35, 0.95, 2.1], [1.15, -0.05, 3.7], [-1.25, -0.1, 5.3]];
    const leaves = LEAF_LANES.map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), leafMat);
      m.castShadow = true;
      m.rotation.order = 'YXZ';
      group.add(m);
      return m;
    });

    const PERIOD = 6.5;

    return {
      group,
      leftArt,
      rightArt,
      update(alpha, t) {
        mechanisms.update(alpha);
        const open = popup.rise(alpha, 0.55, 0.97);
        const nearOpen = popup.rise(alpha, 0.8, 0.98);

        // vellum mist, cottage glow and smoke, sunbeams
        mistMat.opacity = 0.95 * popup.rise(alpha, 0.35, 0.9) * (0.88 + 0.12 * Math.sin(t * 0.35));
        cottageMat.emissiveIntensity = 0.85 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
        smokePivot.rotation.z = 0.09 * Math.sin(t * 0.9) * nearOpen;
        beamMat.opacity = 0.13 * nearOpen * (0.8 + 0.2 * Math.sin(t * 0.4)) * (1 + 0.6 * smooth(14.5, 15.6, t) * (1 - smooth(17.6, 19, t)));
        shimmerMat.opacity = 0.55 * open;
        sparkle.offset.set(t * 0.05, -t * 0.035);

        // the boat's birth and journey
        const a = easeInOut(clamp01((t - BIRTH.stand[0]) / (BIRTH.stand[1] - BIRTH.stand[0])));
        const b = easeInOut(clamp01((t - BIRTH.halve[0]) / (BIRTH.halve[1] - BIRTH.halve[0])));
        const c = easeInOut(clamp01((t - BIRTH.corners[0]) / (BIRTH.corners[1] - BIRTH.corners[0])));
        const d = clamp01((t - BIRTH.pop[0]) / (BIRTH.pop[1] - BIRTH.pop[0]));
        const born = t >= BIRTH.pop[0];
        const float = 0.07 * smooth(BIRTH.glow, BIRTH.stand[1], t) * (1 - smooth(BIRTH.pop[0] + 0.2, BIRTH.pop[1], t));
        sheetRoot.visible = d < 1;
        if (sheetRoot.visible) {
          sheet.pose(a, b, c);
          const de = easeInOut(d);
          const sx = lerp(1, 0.367, de);
          const sy = lerp(1, 1.133, de);
          sheet.mesh.scale.set(sx, sy, 1);
          sheet.mesh.position.y = 0.3 * (1 - sy);
          const bob = 1 - a;
          sheetRoot.position.y = float + 0.002;
          sheetRoot.rotation.x = 0.03 * Math.sin(t * 1.3) * bob;
          sheetRoot.rotation.z = 0.03 * Math.sin(t * 1.1 + 1) * bob;
        }
        const glow = smooth(BIRTH.glow, BIRTH.stand[0] + 0.3, t) * (1 - smooth(BIRTH.pop[1], BIRTH.pop[1] + 0.8, t));
        halo.material.opacity = 0.75 * glow * nearOpen;
        halo.scale.setScalar(0.9 + 0.25 * Math.sin(t * 5) * glow + 0.6 * smooth(BIRTH.pop[0], BIRTH.pop[1], t));

        const tr = track.at(track.s(t));
        const bx = tr.x;
        const bz = tr.z;
        const shrink = popup.rise(alpha, 0.4, 0.85);
        boat.visible = born && shrink > 0.001;
        if (boat.visible) {
          const grow = outBack(clamp01(d));
          const sailing = smooth(20.3, 21.2, t);
          const ss = S0 * shrink;
          boat.scale.set(ss, ss * lerp(0.75, 1, Math.min(1, d * 1.6)), ss * Math.max(0.04, grow));
          boat.position.set(bx, 0.004 + float + 0.008 * (0.5 + 0.5 * Math.sin(t * 2.4)) * S0, bz);
          const yaw = Math.atan2(-tr.hz, tr.hx);
          boat.rotation.set(0.05 * Math.sin(t * 2.1) + 0.02 * sailing * Math.sin(t * 4.3), yaw, 0.04 * Math.sin(t * 1.7 + 1));
        }

        // ripple rings
        const ringsOn = born ? nearOpen : 0;
        const nNow = Math.floor((t - BIRTH.pop[0]) / RING_PERIOD);
        for (let i = 0; i < RINGS; i++) {
          const ring = rings[i];
          const n = nNow - ((((nNow - i) % RINGS) + RINGS) % RINGS);
          const te = BIRTH.pop[0] + n * RING_PERIOD;
          const age = t - te;
          ring.visible = ringsOn > 0 && n >= 0 && age >= 0 && age < RING_LIFE;
          if (!ring.visible) continue;
          const f = age / RING_LIFE;
          track.at(track.s(te));
          const r = (0.07 + 0.28 * (1 - (1 - f) * (1 - f))) * (n === 0 ? 1.6 : 1);
          ring.position.set(track.x, 0.003, track.z);
          ring.rotation.y = Math.atan2(-track.hz, track.hx);
          ring.scale.set(r * 2.5, 1, r * 2);
          ring.material.opacity = 0.85 * (1 - f) * (1 - f) * ringsOn;
        }

        // fox: tail swish, head follows the boat (or the page before it folds)
        const watch = smooth(15, 16.2, t);
        const tx = born ? bx : SPX;
        const tz = born ? bz : SPZ;
        const yawTo = Math.atan2(tx - HEAD.x, tz - HEAD.z);
        const yawClamped = Math.max(-1.0, Math.min(1.0, yawTo));
        const idle = 0.25 * Math.sin(t * 0.7) + 0.1 * Math.sin(t * 1.9);
        headPivot.rotation.set(0.12 * watch * nearOpen, lerp(idle, yawClamped, watch) * nearOpen, (0.1 * Math.sin(t * 0.8) - 0.12 * watch) * nearOpen);
        const wag = 1 + 2 * smooth(25, 25.8, t) * (1 - smooth(27, 28, t));
        tailPivot.rotation.z = (0.07 * Math.sin(t * 1.6) + 0.04 * wag * Math.sin(t * 5)) * nearOpen;

        // fireflies
        ffUniforms.uTime.value = t;
        ffUniforms.uRise.value = popup.rise(alpha, 0.25, 0.95);
        ffUniforms.uGather.value = smooth(15.0, 15.9, t) * (1 - smooth(17.4, 18.6, t));
        ffUniforms.uBurst.value = smooth(17.2, 17.9, t) * (1 - smooth(17.9, 18.8, t));

        // falling leaves
        for (let i = 0; i < leaves.length; i++) {
          const [lx, lz, off] = LEAF_LANES[i];
          const ph = (t + off) / PERIOD;
          const k = Math.floor(ph);
          const u = ph - k;
          const jx = Math.sin(k * 12.9898 + i * 78.233) * 0.35;
          const m = leaves[i];
          const sway = Math.sin(u * TAU * 2.2 + i);
          m.position.set(lx + jx + sway * 0.16, 2.1 * (1 - u) + 0.02, lz + Math.cos(u * TAU * 1.3 + i) * 0.1);
          m.rotation.set(-PI / 2 + 0.9 * sway, u * 5 + i, 0.4 * sway);
          m.scale.setScalar(Math.max(0.001, open * Math.min(1, (1 - u) * 12)));
        }
      },
    };
  },
};
