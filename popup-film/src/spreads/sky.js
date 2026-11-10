/**
 * spreads/sky.js — spread 4, "The Morning Sky" (k = 4): the finale at dawn and the epilogue.
 * Opens 70–73 (never closes); the boat rests on its cloud, unfolds into a paper square, refolds
 * into a crane and flies up past balloons and a rising paper sun, out of frame by 96.
 *
 * Pop-up pieces (spread frame, contract 3.1; mechanisms from popup.js):
 *   sun layer     mountain vFold (γ 2.0) at the far edge, 3.3 × 2.45 — a die-cut sunburst: a sky dome,
 *                 17 long two-tone paper rays and a band of rose clouds. Its sun disk is a second
 *                 V-folded card riding up the crease (a pull-tab slider): from behind the cloud bank
 *                 at 73 to high in the rays at 89, with a soft additive glow printed in light.
 *   cloud bank    mountain vFold with the same γ in front of it, so the two are parallel at every α
 *                 and can never touch while the page folds.
 *   small clouds  three die-cut clouds sliding slowly across the sun layer halves (in their plane).
 *   front clouds  two standUps (fold 'front') framing the reader's edge, swaying a little.
 *   corner towers two standUps (fold 'back') at the far outer corners, beside the sun layer
 *                 (closed footprints disjoint from the sun layer's, rule R3).
 *   boat's cloud  a tiny layered cloud (floor + back and front puffs) on a brass wire, a standUp on
 *                 the left page that grows with the opening; the boat rests in it 73–75.5.
 *   balloons      three faceted honeycomb hot-air balloons on brass wires (standUps that unfold in
 *                 the last part of the page turn), bobbing, swaying and slowly turning.
 *   page art      one panorama over both pages: dawn sky and long rays at the far edge, then the
 *                 land far below — meadow hills, a lane, a farm and birds (left), a river delta
 *                 fanning into the sea (right) — under drifting cloud wisps.
 * The transformation: paper.boat and paper.crane get morph targets toward the SAME flat paper
 * diamond. The boat opens up flat (75.6–76.95) while it lifts off, spins and tilts its face to the
 * reader; at the flat moment (77) it is swapped for the crane under a soft glint (both glow alike);
 * then the diamond folds up in half, neck and tail rising (77.05–77.95), and the wings open last
 * (77.95–78.5). The crane flies the shared waypoints (SPREADS.md; the same C1 Hermite as camera.js)
 * with flap bursts and glides, banking into its turns; in the epilogue it reaches the last
 * waypoint at 93.4 (not 96) and keeps climbing, so it leaves the pulled-back frame before the fade.
 * Sparkles: around the sun, two bursts at the transformation, a trail behind the crane; a thin
 * star glint on the sheet's corner at the flat moment. Cards that float high over the "land far
 * below" (balloons, the boat's cloud floor) cast no shadow on it; pieces that would face the lamp
 * edge-on (front clouds, corner towers, the boat's cloud puffs) lean back a little once open.
 * Pure in (alpha, t); no per-frame allocation; 49 meshes (incl. 1 sprite) + 3 line sets +
 * 1 Points, no lights. Extra return field `focus`: the boat/crane Object3D (spread frame).
 */
import { clamp, ease, lerp, seg, smoothstep } from '../timeline.js';
import { makeRng } from '../util/rng.js';

const PI = Math.PI;
const TAU = 2 * PI;
const INK = '#2b2622';

// ------------------------------------------------------------------------------ timing & layout

/** Film seconds of the finale's beats. */
const BEAT = {
  open: 73,
  unfold: [75.6, 76.95], // boat → flat diamond
  swap: 77, // the flat moment: boat hidden, crane shown
  refold: [77.05, 77.95], // diamond → crane body, the two halves folding up together
  wingsUp: [77.05, 77.85],
  wingsOpen: [77.95, 78.5], // the wings open last
  fly: 78.5,
  sunrise: [73, 89],
};

/** Shared journey (SPREADS.md): [t, x, y, z, rest]; the crane flies from the REST point at 78.5. */
const FLIGHT_POINTS = [
  [78.5, -1.7, 0.8, 0.7, true],
  [81, -0.6, 1.5, 0.2],
  [83.5, 0.6, 2.2, -0.5],
  [86, 1.4, 2.8, 0.2],
  [89, 1.2, 3.4, 1.0],
  // Epilogue: the last shared waypoint is reached at 93.4 instead of 96 and the crane keeps
  // climbing, so it leaves the pulled-back frame before the fade (≤ 0.06 off the path before 89).
  [93.4, 0.6, 5.5, 2.2],
  [96, 0.15, 8.6, 3.6],
];
const REST = { x: -1.7, y: 0.55, z: 0.7 }; // the boat's waterline on its cloud
const TAKEOFF_Y = 0.8;

const SUN = { z0: -1.2, gamma: 2.0, w: 3.3, h: 2.45, r: 0.42, y0: 0.95, y1: 1.8, glow: 1.0, cy: 0.78 };
const BANK = { z0: -0.35, gamma: 2.0, w: 3.0, h: 1.055 };
const FRONT = [
  { side: 'left', x: 1.55, z: 1.36, w: 1.7, h: 0.5, seed: 31, phase: 0.4 },
  { side: 'right', x: 1.75, z: 1.44, w: 1.9, h: 0.52, seed: 37, phase: 2.1 },
];
/** Cloud towers at the two far outer corners, beside the sun layer (fold 'back'; R3-disjoint). */
const SIDE = [
  { side: 'left', x: 2.33, z: -1.24, w: 1.0, h: 0.74, seed: 61 },
  { side: 'right', x: 2.36, z: -1.2, w: 1.0, h: 0.66, seed: 67 },
];
/** Small clouds sliding over the sun layer: half, start x (mount frame), y, size, speed (units/s). */
const DRIFT = [
  { half: 'left', x: -1.2, y: 1.72, w: 0.64, h: 0.25, v: 0.011, min: -1.32, max: -0.36, seed: 41 },
  { half: 'right', x: 0.55, y: 2.02, w: 0.52, h: 0.2, v: 0.009, min: 0.3, max: 1.33, seed: 43 },
  { half: 'right', x: 1.05, y: 1.34, w: 0.7, h: 0.26, v: -0.008, min: 0.38, max: 1.3, seed: 47 },
];
/** The boat's cloud: standUp on the left page; wire up to the floor; boat waterline seat above it. */
const NEST = { x: 1.7, z: 0.7, wire: 0.522, seat: 0.028 };
const BALLOONS = [
  { side: 'left', x: 1.95, z: -0.15, y: 1.5, s: 0.85, gores: ['#d6544a', '#fbf1e2'], band: '#f6c24f', phase: 0.3 },
  { side: 'right', x: 1.95, z: 0.15, y: 2.0, s: 1.0, gores: ['#3e9695', '#f8ecd9'], band: '#ef8a6a', phase: 2.2 },
  { side: 'right', x: 0.45, z: -1.0, y: 2.6, s: 0.8, gores: ['#f2b23e', '#f6d2bf'], band: '#d6544a', phase: 4.0 },
];
const ENVELOPE_C = 0.55; // envelope centre above the basket bottom (balloon units)

const BOAT_SCALE = 0.6; // as in the city spread the boat sails in from
const CRANE_SCALE = 0.66;
const SHEET_R = 0.21; // half-diagonal of the flat paper diamond (spread units)
const FLAT_TINT = 0.955; // uniform facet tint of the flat sheet (both models morph to it)
const CRANE_WING_PIVOT = 0.02; // paper.crane: wing pivot height (crane units)

const FLAP_HZ = 1.45;
/** Glides (wings held, slight dihedral) between flap bursts: [start, end] film seconds. */
const GLIDES = [
  [80.5, 81.8],
  [83.0, 84.4],
  [85.6, 87.5],
  [89.3, 90.6],
  [92.1, 93.3],
];

// ------------------------------------------------------------------------------ small helpers

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function circlesPath(ctx, circles) {
  ctx.beginPath();
  for (const [x, y, r] of circles) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
}

/** Cloud paper colours: far layers a little rosier, near layers white. */
const CLOUD = {
  far: { top: '#fdf3f0', bottom: '#ecccd6' },
  mid: { top: '#fffaf5', bottom: '#f1d7d9' },
  near: { top: '#fffefa', bottom: '#f6e2dc' },
};

/**
 * Puffs whose tops follow a mound between x0 and x1 on the baseline `base`: height `ends` at the
 * two ends rising to `peak` at `at` (0..1 along the mound). Returns { circles, body } where body
 * is the polygon under the puff centres (so the mound is solid down to its base).
 */
function mound(R, { x0, x1, base, peak, ends, at = 0.5, rMin, rMax, sharp = 1.3 }) {
  const circles = [];
  const prof = (x) => {
    const u = clamp((x - x0) / (x1 - x0));
    const v = u < at ? u / at : (1 - u) / (1 - at);
    return ends + (peak - ends) * Math.sin((v * PI) / 2) ** sharp;
  };
  let x = x0 + ends / 2;
  for (;;) {
    const h = prof(x);
    const r = Math.min(h / 2, lerp(rMin, rMax, (h - ends) / Math.max(1e-6, peak - ends)) * R.range(0.82, 1.15));
    circles.push([x, base - h + r + R.range(-3, 3), r]);
    if (x >= x1 - ends / 2) break;
    x = Math.min(x1 - ends / 2, x + r * R.range(0.75, 1.15));
  }
  const body = [[circles[0][0], base + 20], ...circles.map(([cx, cy]) => [cx, cy]), [circles[circles.length - 1][0], base + 20]];
  return { circles, body };
}

/**
 * A cumulus in the picture-book manner: a soft ink outline around the union of its puffs (and an
 * optional body polygon), puffs filled left to right with one vertical gradient so each overlap
 * shows a crisp puff edge, a sunlit rim inside each top edge and a lilac shade along the bottom.
 */
function cumulus(ctx, circles, { top, bottom, body = null, rim = '#ffd890', ink = 'rgba(112, 78, 104, 0.6)', inkW = 2.2, shade = 'rgba(150, 126, 186, 0.26)', edges = 0.38 }) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y, r] of circles) {
    y0 = Math.min(y0, y - r);
    y1 = Math.max(y1, y + r);
  }
  if (body) for (const [, y] of body) y1 = Math.max(y1, y);
  const shape = () => {
    circlesPath(ctx, circles);
    if (body) {
      ctx.moveTo(body[0][0], body[0][1]);
      for (const [x, y] of body) ctx.lineTo(x, y);
      ctx.closePath();
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  shape();
  ctx.strokeStyle = ink;
  ctx.lineWidth = inkW * 2;
  ctx.stroke();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fill('nonzero');
  for (const [x, y, r] of circles) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    const hl = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.05, x - r * 0.15, y - r * 0.25, r);
    hl.addColorStop(0, 'rgba(255,255,255,0.5)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, PI * 1.08, PI * 1.62);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = edges;
    ctx.lineWidth = inkW * 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r - inkW * 2), PI * 1.2, PI * 1.75);
    ctx.strokeStyle = rim;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = inkW * 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  shape();
  ctx.clip();
  const s = ctx.createLinearGradient(0, y1 - (y1 - y0) * 0.5, 0, y1);
  s.addColorStop(0, 'rgba(0,0,0,0)');
  s.addColorStop(1, shade);
  ctx.fillStyle = s;
  ctx.fillRect(-1e4, y0, 2e4, y1 - y0);
  ctx.restore();
}

/** Small 4-point printed star. */
function star4(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4 - PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Ink bird: two curved wing strokes. */
function bird(ctx, x, y, s, alpha = 0.8) {
  ctx.save();
  ctx.strokeStyle = rgba(INK, alpha);
  ctx.lineWidth = Math.max(1.5, s * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.15);
  ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y + s * 0.05);
  ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y - s * 0.15);
  ctx.stroke();
  ctx.restore();
}

/** A tapered stroke along a polyline [[x, y], ...] whose width runs from w0 to w1. */
function taper(ctx, pts, w0, w1, style) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = style;
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = lerp(w0, w1, i / (pts.length - 1));
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Samples a quadratic Bézier chain [p0, c1, p1, c2, p2, ...] into a polyline. */
function bezierChain(pts, steps = 14) {
  const out = [pts[0]];
  for (let i = 0; i + 2 < pts.length; i += 2) {
    const [a, c, b] = [pts[i], pts[i + 1], pts[i + 2]];
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const v = 1 - u;
      out.push([v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------ page art

const PAN = { w: 1536, h: 1024, gx: 768, hz: 292 };

/** Ridge silhouette filled from a wavy top line down to yBottom. */
function ridge(ctx, y0, waves, yBottom, fill) {
  ctx.beginPath();
  ctx.moveTo(0, yBottom);
  for (let x = 0; x <= PAN.w; x += 8) {
    let y = y0;
    for (const [a, l, p] of waves) y += a * Math.sin(x / l + p);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(PAN.w, yBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function hillTop(k, x) {
  return 336 + k * 122 + 22 * Math.sin(x / 150 + 1.3 * k) + 10 * Math.sin(x / 57 + 2.1 * k);
}

function tree(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(86, 70, 120, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y + r * 0.9, r * 1.05, r * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5c8456';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#86ac6c';
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

function wisp(ctx, R, x, y, len, h) {
  const blobs = [];
  const n = 5 + R.int(0, 2);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    blobs.push([x + (u - 0.5) * len, y - Math.sin(u * PI) * h * 0.4 + R.range(-4, 4), h * (0.45 + 0.55 * Math.sin(u * PI)) * R.range(0.8, 1.1)]);
  }
  ctx.save();
  ctx.fillStyle = 'rgba(96, 78, 132, 0.13)'; // its shadow on the land, toward the reader
  for (const [bx, by, r] of blobs) {
    ctx.beginPath();
    ctx.ellipse(bx + 18, by + 40, r * 1.2, r * 0.55, 0, 0, TAU);
    ctx.fill();
  }
  for (const [bx, by, r] of blobs) {
    ctx.beginPath();
    ctx.ellipse(bx, by, r * 1.25, r * 0.62, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 250, 243, 0.82)';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 226, 170, 0.8)';
  ctx.lineWidth = 2.5;
  for (const [bx, by, r] of blobs) {
    ctx.beginPath();
    ctx.ellipse(bx, by, r * 1.25 - 3, r * 0.62 - 3, 0, PI * 1.1, PI * 1.8);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The whole two-page panorama (1536 × 1024, gutter at x = 768), drawn shifted by −ox so the left
 * page (ox = 0) and the right page (ox = 768) are cut from the same picture. Seeded: both calls
 * draw identical randomness.
 */
function paintPanorama(ctx, ox, seed) {
  const R = makeRng(seed);
  const { w: W, h: H, gx: GX, hz: HZ } = PAN;
  ctx.save();
  ctx.translate(-ox, 0);

  // Sky band at the far edge, glowing toward the sunrise behind the gutter.
  let g = ctx.createLinearGradient(0, 0, 0, HZ + 40);
  g.addColorStop(0, '#fbe4b4');
  g.addColorStop(0.55, '#f8cdb1');
  g.addColorStop(1, '#efb4b7');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HZ + 40);
  g = ctx.createRadialGradient(GX, -40, 20, GX, -40, 820);
  g.addColorStop(0, 'rgba(255, 244, 205, 0.95)');
  g.addColorStop(0.45, 'rgba(255, 226, 170, 0.4)');
  g.addColorStop(1, 'rgba(255, 220, 170, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HZ + 40);
  for (let i = 0; i < 14; i++) star4(ctx, R.range(40, W - 40), R.range(30, HZ - 90), R.range(4, 8), 'rgba(255, 250, 225, 0.85)');

  // Land far below: hazy at the horizon, greener toward the reader.
  g = ctx.createLinearGradient(0, HZ, 0, H);
  g.addColorStop(0, '#dcc1bd');
  g.addColorStop(0.28, '#cbc6a3');
  g.addColorStop(1, '#a2bf8b');
  ctx.fillStyle = g;
  ctx.fillRect(0, HZ, W, H - HZ);
  ridge(ctx, HZ - 46, [[20, 95, 0.3], [9, 41, 1.7]], HZ + 36, '#d9b1c2');
  ridge(ctx, HZ - 22, [[15, 70, 2.2], [7, 29, 0.4]], HZ + 36, '#c3a6c6');
  ridge(ctx, HZ + 4, [[9, 120, 4.1], [5, 33, 2.9]], HZ + 50, '#c9b8c4');

  // Rolling hill bands, each lit along its crest and shaded toward the reader.
  const hillCols = [
    ['#d6c79e', '#bdb88f'],
    ['#bccb93', '#9fb683'],
    ['#a8c18a', '#8daa79'],
    ['#c3c98e', '#a4b47d'],
    ['#97b982', '#7fa271'],
  ];
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hillTop(k, x));
    ctx.lineTo(W, H);
    ctx.closePath();
    g = ctx.createLinearGradient(0, 336 + k * 122 - 30, 0, 336 + k * 122 + 150);
    g.addColorStop(0, hillCols[k][0]);
    g.addColorStop(1, hillCols[k][1]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hillTop(k, x) + 3);
    ctx.strokeStyle = 'rgba(255, 230, 172, 0.7)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.22);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Left page: ploughed fields, a lane up to a farm, a pond, trees along the crests.
  const fields = [
    [70, 470, 190, 64, -0.12, '#e7cf8c'],
    [300, 452, 150, 58, 0.08, '#c8c27d'],
    [470, 520, 170, 56, -0.05, '#e3c08a'],
    [120, 600, 160, 60, 0.1, '#b9c47e'],
    [960, 380, 120, 40, -0.08, '#e2cd93'],
  ];
  for (const [fx, fy, fw, fh, rot, col] of fields) {
    ctx.save();
    ctx.translate(fx + fw / 2, fy + fh / 2);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 8);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 100, 60, 0.28)';
    ctx.lineWidth = 2;
    for (let s = -fw; s < fw; s += 9) {
      ctx.beginPath();
      ctx.moveTo(s, -fh);
      ctx.lineTo(s + fh * 0.6, fh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(fx + fw / 2, fy + fh / 2);
    ctx.rotate(rot);
    ctx.strokeStyle = rgba(INK, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-fw / 2, -fh / 2, fw, fh, 8);
    ctx.stroke();
    ctx.restore();
  }
  const lane = bezierChain([[70, 1030], [190, 930], [140, 840], [100, 760], [250, 712], [360, 672], [420, 600], [480, 528], [610, 470], [700, 430], [760, 396]]);
  taper(ctx, lane, 16, 4, rgba(INK, 0.4));
  taper(ctx, lane, 12, 2.5, '#f5e6c8');
  // Farm: a cottage and a barn seen from above, with their morning shadows.
  for (const [hx, hy, hw, hh, roof] of [[318, 648, 46, 26, '#c8634f'], [400, 618, 34, 22, '#9a6a8c']]) {
    ctx.fillStyle = 'rgba(86, 70, 120, 0.22)';
    ctx.fillRect(hx + 6, hy + 10, hw, hh);
    ctx.fillStyle = '#f6ead6';
    ctx.fillRect(hx, hy + hh * 0.45, hw, hh * 0.55);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(hx - 3, hy + hh * 0.5);
    ctx.lineTo(hx + 6, hy);
    ctx.lineTo(hx + hw - 6, hy);
    ctx.lineTo(hx + hw + 3, hy + hh * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeRect(hx, hy + hh * 0.45, hw, hh * 0.55);
  }
  ctx.beginPath();
  ctx.ellipse(585, 812, 66, 26, -0.1, 0, TAU);
  ctx.fillStyle = '#9fcbd9';
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(575, 806, 40, 9, -0.1, PI * 1.1, PI * 1.9);
  ctx.strokeStyle = 'rgba(255, 214, 200, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Trees along the crests (left page and the hills by the gutter); none on the delta.
  for (let k = 1; k < 5; k++) {
    let x = R.range(10, 40);
    while (x < W) {
      const onDelta = x > 1000 && k >= 2;
      if (!onDelta && R.chance(0.55)) {
        const n = R.int(1, 3);
        for (let i = 0; i < n; i++) tree(ctx, x + i * 13, hillTop(k, x + i * 13) + 10 + R.range(-3, 5), R.range(6, 9.5) + k * 0.6);
      }
      x += R.range(40, 90);
    }
  }
  // Flowers on the nearest meadow.
  for (let i = 0; i < 90; i++) {
    const x = R.range(20, 900);
    const y = R.range(hillTop(4, x) + 20, H - 10);
    ctx.fillStyle = R.pick(['#f6d6e0', '#fff4d8', '#f2c25a', '#e99aa8']);
    ctx.beginPath();
    ctx.arc(x, y, R.range(2, 3.6), 0, TAU);
    ctx.fill();
  }

  // Right page: the river delta fanning into the dawn sea.
  ctx.beginPath();
  ctx.moveTo(1120, 610);
  ctx.quadraticCurveTo(1040, 820, 1010, 1030);
  ctx.lineTo(W + 10, 1030);
  ctx.lineTo(W + 10, 660);
  ctx.quadraticCurveTo(1300, 600, 1120, 610);
  ctx.fillStyle = '#ecd3a7';
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const x = R.range(1060, 1500);
    const y = R.range(700, 990);
    ctx.beginPath();
    ctx.ellipse(x, y, R.range(26, 60), R.range(10, 20), R.range(-0.5, 0.5), 0, TAU);
    ctx.fillStyle = rgba(R.pick(['#b7c992', '#a9bf86', '#cdd39a']), 0.85);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(W + 10, 742);
  ctx.quadraticCurveTo(1390, 800, 1330, 920);
  ctx.quadraticCurveTo(1290, 1000, 1225, 1030);
  ctx.lineTo(W + 10, 1030);
  ctx.closePath();
  g = ctx.createLinearGradient(1300, 760, 1536, 1024);
  g.addColorStop(0, '#8cc3cd');
  g.addColorStop(1, '#4f8fa8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = R.range(1260, 1530);
    const y = R.range(790, 1020);
    ctx.beginPath();
    ctx.arc(x, y, R.range(8, 14), PI * 1.15, PI * 1.85);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 222, 150, 0.85)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const y = 820 + i * 15;
    const x = 1420 + R.range(-30, 30) - i * 8;
    ctx.beginPath();
    ctx.moveTo(x - 14 + i, y);
    ctx.lineTo(x + 14 - i, y);
    ctx.stroke();
  }
  ctx.restore();
  const channels = [
    { pts: [[905, 292], [950, 360], [890, 420], [830, 480], [960, 520], [1080, 560], [1170, 650]], w: [5, 17] },
    { pts: [[1170, 650], [1120, 830], [1085, 1030]], w: [13, 20] },
    { pts: [[1170, 650], [1190, 860], [1185, 1030]], w: [10, 16] },
    { pts: [[1170, 650], [1240, 800], [1305, 930]], w: [12, 18] },
    { pts: [[1170, 650], [1300, 720], [1400, 830]], w: [10, 16] },
    { pts: [[1170, 650], [1350, 650], [1520, 762]], w: [8, 13] },
  ];
  for (const pass of [0, 1, 2]) {
    for (const c of channels) {
      const line = bezierChain(c.pts);
      if (pass === 0) taper(ctx, line, c.w[0] + 4, c.w[1] + 4, rgba(INK, 0.38));
      if (pass === 1) taper(ctx, line, c.w[0], c.w[1], '#93c4d5');
      if (pass === 2) taper(ctx, line.map(([x, y]) => [x - 1.5, y - 1.5]), c.w[0] * 0.3, c.w[1] * 0.3, 'rgba(232, 246, 246, 0.85)');
    }
  }
  for (let i = 0; i < 24; i++) {
    const x = R.range(880, 1150);
    const y = R.range(400, 640);
    if (Math.abs(y - (380 + (x - 880) * 0.9)) < 40) continue;
    tree(ctx, x, y, R.range(5, 8));
  }

  // Cloud wisps drifting over the land, with their shadows.
  for (const [x, y, len, h] of [[250, 520, 260, 34], [660, 690, 230, 30], [1010, 420, 240, 30], [1330, 540, 280, 36], [430, 905, 300, 40], [1180, 880, 220, 30], [120, 200, 200, 26], [1400, 160, 220, 26]]) {
    wisp(ctx, R, x, y, len, h);
  }

  // Long sun rays fanning from the sunrise behind the far edge, over sky and land alike.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const ox0 = GX;
  const oy0 = -170;
  const nRays = 24;
  for (let i = 0; i < nRays; i += 2) {
    const a0 = 0.38 + (i / nRays) * (PI - 0.76);
    const a1 = 0.38 + ((i + 1) / nRays) * (PI - 0.76);
    g = ctx.createRadialGradient(ox0, oy0, 150, ox0, oy0, 1350);
    g.addColorStop(0, 'rgba(255, 238, 200, 0.5)');
    g.addColorStop(0.5, 'rgba(255, 232, 190, 0.2)');
    g.addColorStop(1, 'rgba(255, 232, 190, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox0, oy0);
    ctx.lineTo(ox0 + Math.cos(a0) * 1500, oy0 + Math.sin(a0) * 1500);
    ctx.lineTo(ox0 + Math.cos(a1) * 1500, oy0 + Math.sin(a1) * 1500);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Birds over the meadow and the sky.
  for (const [x, y, s] of [[170, 150, 13], [214, 124, 10], [252, 168, 11], [560, 214, 14], [602, 190, 10], [118, 430, 12], [1210, 120, 11], [1250, 146, 9], [990, 238, 10]]) {
    bird(ctx, x, y, s);
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------ pop-up art

/** The radiant back layer: rays, sky dome and a band of rose clouds (die-cut by paper.paint). */
function paintSunLayer(ctx, w, h, seed) {
  const R = makeRng(seed);
  const ppu = w / SUN.w;
  const cx = w / 2;
  const cy = h - SUN.cy * ppu;
  const dome = 0.86 * ppu;
  const n = 17;
  ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const a = PI + 0.075 + (i / (n - 1)) * (PI - 0.15);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const long = i % 2 === 0;
    const room = Math.min((cy - 16) / Math.max(1e-3, -sa), (cx - 16) / Math.max(1e-3, Math.abs(ca)));
    const len = Math.min(long ? 600 : 430, room);
    const half = long ? 0.088 : 0.07;
    const r0 = dome * 0.82;
    const b0 = [cx + Math.cos(a - half) * r0, cy + Math.sin(a - half) * r0];
    const b1 = [cx + Math.cos(a + half) * r0, cy + Math.sin(a + half) * r0];
    const tip = [cx + ca * len, cy + sa * len];
    const mid = [cx + ca * r0, cy + sa * r0];
    const g = ctx.createLinearGradient(mid[0], mid[1], tip[0], tip[1]);
    if (long) {
      g.addColorStop(0, '#f6b04a');
      g.addColorStop(1, '#fbe6a8');
    } else {
      g.addColorStop(0, '#ee9583');
      g.addColorStop(1, '#f9d4b8');
    }
    ctx.beginPath();
    ctx.moveTo(b0[0], b0[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(b1[0], b1[1]);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.7);
    ctx.lineWidth = 3;
    ctx.stroke();
    // A paper ray is creased down its middle: shade one half.
    ctx.beginPath();
    ctx.moveTo(mid[0], mid[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(b1[0], b1[1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(150, 70, 70, 0.14)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mid[0], mid[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.strokeStyle = 'rgba(255, 250, 230, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Sky dome with printed halo rings.
  let g = ctx.createRadialGradient(cx, cy, 10, cx, cy, dome);
  g.addColorStop(0, '#fff3cc');
  g.addColorStop(0.38, '#fbd78b');
  g.addColorStop(0.72, '#f6b690');
  g.addColorStop(1, '#ec9ea6');
  ctx.beginPath();
  ctx.arc(cx, cy, dome, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.7);
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath();
    ctx.arc(cx, cy, dome * (0.32 + k * 0.15), 0, TAU);
    ctx.strokeStyle = 'rgba(255, 252, 235, 0.32)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const a = PI + R.range(0.3, PI - 0.3);
    const r = dome * R.range(0.55, 0.92);
    star4(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, R.range(5, 9), 'rgba(255, 252, 238, 0.9)');
  }
  bird(ctx, cx - dome * 0.55, cy - dome * 0.62, 11, 0.7);
  bird(ctx, cx - dome * 0.4, cy - dome * 0.72, 8, 0.7);
  // Band of rose clouds along the horizon (full width), taller toward the two ends.
  const rose = { top: '#fbe0d8', bottom: '#e6b0bb' };
  for (const [x0, x1, at] of [[24, w * 0.56, 0.3], [w * 0.44, w - 24, 0.7]]) {
    const m = mound(R, { x0, x1, base: h, peak: 0.66 * ppu, ends: 0.3 * ppu, at, rMin: 36, rMax: 70 });
    cumulus(ctx, m.circles, { ...rose, body: m.body });
  }
  const m = mound(R, { x0: 22, x1: w - 22, base: h, peak: 0.36 * ppu, ends: 0.2 * ppu, rMin: 30, rMax: 52, sharp: 0.6 });
  cumulus(ctx, m.circles, { ...CLOUD.mid, body: m.body });
}

/** The rising sun: a gold disk inside a ring of flame petals. */
function paintSunDisk(ctx, w) {
  const c = w / 2;
  const rd = w * 0.38;
  const rp = w * 0.46;
  const n = 28;
  const petals = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const da = (0.5 / n) * TAU;
    petals.moveTo(c + Math.cos(a - da) * (rd - 4), c + Math.sin(a - da) * (rd - 4));
    petals.lineTo(c + Math.cos(a) * rp, c + Math.sin(a) * rp);
    petals.lineTo(c + Math.cos(a + da) * (rd - 4), c + Math.sin(a + da) * (rd - 4));
    petals.closePath();
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(INK, 0.75);
  ctx.lineWidth = 6;
  ctx.stroke(petals);
  ctx.beginPath();
  ctx.arc(c, c, rd, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#f0903c';
  ctx.fill(petals);
  for (let i = 0; i < n; i += 2) {
    const a = (i / n) * TAU;
    const da = (0.5 / n) * TAU;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (rd - 4), c + Math.sin(a) * (rd - 4));
    ctx.lineTo(c + Math.cos(a) * rp, c + Math.sin(a) * rp);
    ctx.lineTo(c + Math.cos(a + da) * (rd - 4), c + Math.sin(a + da) * (rd - 4));
    ctx.closePath();
    ctx.fillStyle = '#f7b04c';
    ctx.fill();
  }
  const g = ctx.createRadialGradient(c - rd * 0.3, c - rd * 0.35, rd * 0.05, c, c, rd);
  g.addColorStop(0, '#fff7d6');
  g.addColorStop(0.5, '#fcd775');
  g.addColorStop(1, '#f4a83c');
  ctx.beginPath();
  ctx.arc(c, c, rd, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 3;
  ctx.stroke();
  for (const f of [0.72, 0.86]) {
    ctx.beginPath();
    ctx.arc(c, c, rd * f, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(c, c, rd * 0.78, PI * 1.08, PI * 1.45);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Cloud bank: a tall mound of cumulus, tallest at the centre, with lower clumps in front. */
function paintBank(ctx, w, h, seed) {
  const R = makeRng(seed);
  const ppu = w / BANK.w;
  const layers = [
    [CLOUD.far, { x0: 40, x1: w - 40, peak: h - 26, ends: 0.26 * ppu, at: 0.5, rMin: 34, rMax: 92, sharp: 1.6 }],
    [CLOUD.mid, { x0: 24, x1: w * 0.62, peak: 0.62 * ppu, ends: 0.2 * ppu, at: 0.55, rMin: 30, rMax: 70 }],
    [CLOUD.mid, { x0: w * 0.4, x1: w - 24, peak: 0.54 * ppu, ends: 0.2 * ppu, at: 0.4, rMin: 30, rMax: 66 }],
    [CLOUD.near, { x0: 18, x1: w - 18, peak: 0.3 * ppu, ends: 0.14 * ppu, at: 0.5, rMin: 24, rMax: 46, sharp: 0.5 }],
  ];
  for (const [col, o] of layers) {
    const m = mound(R, { base: h, ...o });
    cumulus(ctx, m.circles, { ...col, body: m.body });
  }
}

/** A low cloud for the reader's edge: two clumps behind a long low row (mirrored by `flip`). */
function paintFrontCloud(ctx, w, h, seed, flip) {
  const R = makeRng(seed);
  const ppu = h / 0.52;
  ctx.save();
  if (flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  const layers = [
    [CLOUD.mid, { x0: 36, x1: w * 0.64, peak: 0.47 * ppu, ends: 0.14 * ppu, at: 0.42, rMin: 26, rMax: 66 }],
    [CLOUD.mid, { x0: w * 0.5, x1: w - 36, peak: 0.34 * ppu, ends: 0.14 * ppu, at: 0.55, rMin: 24, rMax: 52 }],
    [CLOUD.near, { x0: 18, x1: w - 18, peak: 0.2 * ppu, ends: 0.1 * ppu, at: 0.3, rMin: 20, rMax: 34, sharp: 0.5 }],
  ];
  for (const [col, o] of layers) {
    const m = mound(R, { base: h, ...o });
    cumulus(ctx, m.circles, { ...col, body: m.body });
  }
  ctx.restore();
}

/** A cloud tower for a far corner: tallest toward the outer page edge (mirrored by `flip`). */
function paintSideCloud(ctx, w, h, seed, flip) {
  const R = makeRng(seed);
  const ppu = w / 1.0;
  ctx.save();
  if (flip) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  const layers = [
    [CLOUD.far, { x0: 30, x1: w - 30, peak: h - 22, ends: 0.18 * ppu, at: 0.36, rMin: 26, rMax: 70, sharp: 1.2 }],
    [CLOUD.mid, { x0: 20, x1: w * 0.72, peak: 0.5 * ppu, ends: 0.14 * ppu, at: 0.4, rMin: 24, rMax: 54 }],
    [CLOUD.near, { x0: 14, x1: w - 14, peak: 0.22 * ppu, ends: 0.1 * ppu, at: 0.6, rMin: 18, rMax: 34, sharp: 0.6 }],
  ];
  for (const [col, o] of layers) {
    const m = mound(R, { base: h, ...o });
    cumulus(ctx, m.circles, { ...col, body: m.body });
  }
  ctx.restore();
}

/** A small drifting cloud with a flat underside. */
function paintSmallCloud(ctx, w, h, seed) {
  const R = makeRng(seed);
  const m = mound(R, { x0: 28, x1: w - 28, base: h - 32, peak: h * 0.62, ends: h * 0.26, at: 0.42, rMin: h * 0.13, rMax: h * 0.3 });
  cumulus(ctx, m.circles, { ...CLOUD.near, body: m.body, inkW: 2 });
}

/** The boat's cloud seen from above: a soft oval of puffs with a little hollow for the boat. */
function paintNestFloor(ctx, w, h, seed) {
  const R = makeRng(seed);
  const cx = w / 2;
  const cy = h / 2;
  const ring = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    ring.push([cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * h * 0.3, h * R.range(0.15, 0.2)]);
  }
  ring.push([cx, cy, h * 0.34]);
  cumulus(ctx, ring, { ...CLOUD.near, inkW: 2.2, edges: 0.25 });
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, h * 0.3);
  g.addColorStop(0, 'rgba(170, 120, 150, 0.25)');
  g.addColorStop(1, 'rgba(170, 120, 150, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.26, h * 0.22, 0, 0, TAU);
  ctx.fill();
}

/** A puff of the boat's cloud standing behind (tall) or in front of it. */
function paintNestPuff(ctx, w, h, seed, tall) {
  const R = makeRng(seed);
  const o = tall
    ? { x0: 40, x1: w - 40, peak: h * 0.9, ends: h * 0.3, at: 0.42, rMin: 28, rMax: 74 }
    : { x0: 30, x1: w - 30, peak: h * 0.86, ends: h * 0.36, at: 0.58, rMin: 26, rMax: 54 };
  const m = mound(R, { base: h, ...o });
  cumulus(ctx, m.circles, { ...(tall ? CLOUD.mid : CLOUD.near), body: m.body });
}

/** Gore stripes of a honeycomb balloon envelope (u around, v from neck to crown). */
function paintGores(ctx, w, h, [a, b], band) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect((i * w) / n, 0, w / n + 1, h);
  }
  // crown cap and neck in the darker gore colour
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h * 0.07);
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
  // a zigzag band just above the widest point
  ctx.fillStyle = band;
  ctx.fillRect(0, h * 0.36, w, h * 0.09);
  ctx.beginPath();
  for (let x = 0; x <= w; x += w / 48) ctx.lineTo(x, h * 0.45 + ((x / (w / 48)) % 2 === 0 ? 0 : h * 0.05));
  ctx.lineTo(w, h * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo((i * w) / n, 0);
    ctx.lineTo((i * w) / n, h);
    ctx.stroke();
  }
  for (const y of [h * 0.07, h * 0.36, h * 0.9]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function paintBasket(ctx, w, h) {
  ctx.fillStyle = '#b98a57';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(90, 58, 34, 0.7)';
  ctx.lineWidth = 2;
  for (let y = 4; y < h; y += 8) {
    for (let x = (y / 8) % 2 === 0 ? 0 : 6; x < w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y + 4);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#8a5f3a';
  ctx.fillRect(0, 0, w, 6);
}

/** Additive star sprite: a core with a halo of `halo` strength and thin cross rays. */
function starTexture(paper, THREE, { size = 64, halo = 0.75, ray = 0.035, diagonal = 0 } = {}) {
  const { canvas, ctx } = paper.makeCanvas(size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, `rgba(255,244,214,${halo})`);
  g.addColorStop(0.35, `rgba(255,232,190,${halo * 0.25})`);
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const rays = [[0, 1], [PI / 2, 1]];
  if (diagonal) rays.push([PI / 4, diagonal], [-PI / 4, diagonal]);
  for (const [a, k] of rays) {
    const s = ctx.createRadialGradient(c, c, 0, c, c, c * 0.95 * k);
    s.addColorStop(0, 'rgba(255,250,232,0.95)');
    s.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(c, c, c * 0.95 * k, size * ray, a, 0, TAU);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(paper, THREE) {
  const { canvas, ctx } = paper.makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 236, 180, 1)');
  g.addColorStop(0.3, 'rgba(255, 214, 150, 0.55)');
  g.addColorStop(0.65, 'rgba(255, 190, 150, 0.15)');
  g.addColorStop(1, 'rgba(255, 180, 150, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------------------ flight path

/** Time-parameterised Catmull-Rom (cubic Hermite) through the waypoints, like camera.js. */
function buildPath(points) {
  const n = points.length;
  const times = points.map((p) => p[0]);
  const v = points.map((p) => [p[1], p[2], p[3]]);
  const m = points.map(() => [0, 0, 0]);
  for (let i = 1; i < n - 1; i++) {
    if (points[i][4]) continue;
    const span = times[i + 1] - times[i - 1];
    for (let c = 0; c < 3; c++) m[i][c] = (v[i + 1][c] - v[i - 1][c]) / span;
  }
  return { times, v, m };
}

function hermite(p0, m0, p1, m1, s, dt) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * dt * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * dt * m1;
}

/** Position on the path at film time t (clamped to its ends), written into the Vector3 `out`. */
function samplePath(path, t, out) {
  const { times, v, m } = path;
  const n = times.length;
  const tc = clamp(t, times[0], times[n - 1]);
  let i = 0;
  while (i < n - 2 && tc >= times[i + 1]) i++;
  const dt = times[i + 1] - times[i];
  const s = (tc - times[i]) / dt;
  out.set(
    hermite(v[i][0], m[i][0], v[i + 1][0], m[i + 1][0], s, dt),
    hermite(v[i][1], m[i][1], v[i + 1][1], m[i + 1][1], s, dt),
    hermite(v[i][2], m[i][2], v[i + 1][2], m[i + 1][2], s, dt),
  );
  return out;
}

const FLIGHT = buildPath(FLIGHT_POINTS);

/** Flap-burst weight: 1 while flapping, 0 inside glides (smooth 0.35 s edges). */
function flapWeight(t) {
  let w = 1;
  for (const [a, b] of GLIDES) w -= smoothstep(a, a + 0.35, t) * (1 - smoothstep(b - 0.35, b, t));
  return clamp(w);
}

/** Crane wing pose v ∈ [−1, 1] in flight: cosine strokes (starting wings-up at 78.5), glides. */
function flapPose(t) {
  const w = flapWeight(t);
  const amp = t < 80.5 ? 1 : 0.85;
  const phase = TAU * FLAP_HZ * (t - BEAT.fly);
  return w * amp * Math.cos(phase) + (1 - w) * (0.2 + 0.05 * Math.sin(t * 2.3));
}

// ------------------------------------------------------------------------------ morphs

/**
 * Adds one morph target (absolute positions + uniform colour) that lays a folded-paper mesh
 * (paper.js facet geometry: triangles, two layers per facet) flat. map(x, y, z, side, out) writes
 * the flat position of a vertex; side = which half (sign of the facet's centroid z). Each layer
 * is then lifted onto the side it faces once flat, so the sheet stays two-sided without z-fight.
 */
function addFlatMorph(THREE, mesh, map) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const n = pos.count;
  const flat = new Float32Array(n * 3);
  const out = [0, 0, 0];
  const LAYER = 0.0012;
  for (let f = 0; f + 2 < n; f += 3) {
    const side = pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2) >= 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      map(pos.getX(f + k), pos.getY(f + k), pos.getZ(f + k), side, out);
      flat.set(out, (f + k) * 3);
    }
    const ax = flat[f * 3 + 3] - flat[f * 3];
    const az = flat[f * 3 + 5] - flat[f * 3 + 2];
    const bx = flat[f * 3 + 6] - flat[f * 3];
    const bz = flat[f * 3 + 8] - flat[f * 3 + 2];
    const up = az * bx - ax * bz >= 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) flat[(f + k) * 3 + 1] += up * LAYER;
  }
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(flat, 3)];
  if (geo.attributes.color) {
    geo.morphAttributes.color = [new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(FLAT_TINT), 3)];
  }
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences[0] = 0;
}

/** Maps a vertex to the flat target of the nearest key point ([x, y, |z|, X, Z, dy]). */
function keyMap(keys, D, y0) {
  return (x, y, z, side, out) => {
    let best = keys[0];
    let bd = Infinity;
    for (const k of keys) {
      const d = (x - k[0]) ** 2 + (y - k[1]) ** 2 + (Math.abs(z) - k[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    out[0] = best[3] * D;
    out[1] = y0 + (best[5] ?? 0);
    out[2] = side * best[4] * D;
  };
}

/** paper.boat key points → flat diamond (walls open outward, the sail folds away underneath). */
const BOAT_KEYS = [
  [0.3, 0.1, 0, 1, 0],
  [-0.3, 0.1, 0, -1, 0],
  [0.17, -0.05, 0, 0.5, 0],
  [-0.17, -0.05, 0, -0.5, 0],
  [0, -0.05, 0.075, 0, 0.3],
  [0, 0.08, 0.095, 0, 1],
  [0, 0.3, 0, 0, 0.02, -0.006],
  [-0.11, -0.04, 0.018, -0.06, 0.03, -0.006],
  [0.11, -0.04, 0.018, 0.06, 0.03, -0.006],
  [0, -0.04, 0.036, 0, 0.05, -0.006],
];
/** paper.crane wing key points → its half of the flat diamond. */
const WING_KEYS = [
  [0.11, 0, 0, 1, 0],
  [0, 0.012, 0, 0, 0],
  [-0.11, 0, 0, -1, 0],
  [-0.03, 0, 0.4, 0, 1],
];

// ------------------------------------------------------------------------------ the spread

export default {
  id: 'sky',
  title: 'The Morning Sky',
  build({ THREE, paper, popup, rng }) {
    const group = new THREE.Group();
    group.name = 'sky';
    const mechs = [];
    const seedArt = rng.int(1, 1e9);
    const seed = () => rng.int(1, 1e9);

    // ---------------------------------------------------------------- page art
    const leftArt = paper.page((ctx) => paintPanorama(ctx, 0, seedArt), { seed: seed() });
    const rightArt = paper.page((ctx) => paintPanorama(ctx, PAN.gx, seedArt), { seed: seed() });

    // ---------------------------------------------------------------- sun layer + rising disk
    const sunFold = popup.vFold({ z0: SUN.z0, gamma: SUN.gamma, width: SUN.w, height: SUN.h });
    const sunArt = paper.paint(1024, Math.round((1024 * SUN.h) / SUN.w), (c, w, h) => paintSunLayer(c, w, h, seed()), { dieCut: 9, seed: seed() });
    const sunHalves = paper.splitCard({ canvas: sunArt, width: SUN.w, height: SUN.h });
    sunFold.left.add(sunHalves.left);
    sunFold.right.add(sunHalves.right);
    mechs.push(sunFold);

    const diskArt = paper.paint(512, 512, (c, w) => paintSunDisk(c, w), { dieCut: 10, seed: seed() });
    const disk = paper.splitCard({ canvas: diskArt, width: SUN.r * 2, height: SUN.r * 2 });
    for (const half of [disk.left, disk.right]) {
      const mat = half.userData.front.material;
      mat.emissive = new THREE.Color('#ffd9a0');
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0.55;
      half.position.z = 0.006;
    }
    sunFold.left.add(disk.left);
    sunFold.right.add(disk.right);

    const glowTex = glowTexture(paper, THREE);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    });
    const glows = [-1, 1].map((s) => {
      const geo = new THREE.PlaneGeometry(SUN.glow, SUN.glow * 2);
      geo.translate((s * SUN.glow) / 2, 0, 0);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (s < 0 ? 0 : 0.5) + uv.getX(i) * 0.5);
      const mesh = new THREE.Mesh(geo, glowMat);
      mesh.position.z = 0.003;
      mesh.renderOrder = 2;
      (s < 0 ? sunFold.left : sunFold.right).add(mesh);
      return mesh;
    });

    // ---------------------------------------------------------------- small clouds on the sun layer
    const drifters = DRIFT.map((d) => {
      const art = paper.paint(384, Math.round((384 * d.h) / d.w), (c, w, h) => paintSmallCloud(c, w, h, d.seed), { dieCut: 8, seed: seed() });
      const piece = paper.card({ canvas: art, width: d.w, height: d.h, anchor: 'center' });
      piece.position.set(d.x, d.y, 0.011);
      (d.half === 'left' ? sunFold.left : sunFold.right).add(piece);
      return { piece, d };
    });

    // ---------------------------------------------------------------- cloud bank
    const bankFold = popup.vFold({ z0: BANK.z0, gamma: BANK.gamma, width: BANK.w, height: BANK.h });
    const bankArt = paper.paint(1024, Math.round((1024 * BANK.h) / BANK.w), (c, w, h) => paintBank(c, w, h, seed()), { dieCut: 9, seed: seed() });
    const bankHalves = paper.splitCard({ canvas: bankArt, width: BANK.w, height: BANK.h });
    bankFold.left.add(bankHalves.left);
    bankFold.right.add(bankHalves.right);
    mechs.push(bankFold);

    // ---------------------------------------------------------------- front clouds (standUps)
    const fronts = FRONT.map((f) => {
      const mech = popup.standUp({ side: f.side, x: f.x, z: f.z, fold: 'front', width: f.w, height: f.h });
      const art = paper.paint(768, Math.round((768 * f.h) / f.w), (c, w, h) => paintFrontCloud(c, w, h, f.seed, f.side === 'right'), { dieCut: 9, seed: seed() });
      const sway = new THREE.Group();
      sway.add(paper.card({ canvas: art, width: f.w, height: f.h }));
      mech.mount.add(sway);
      mechs.push(mech);
      return { sway, f };
    });

    // ---------------------------------------------------------------- corner cloud towers (standUps)
    const sides = SIDE.map((c) => {
      const mech = popup.standUp({ side: c.side, x: c.x, z: c.z, fold: 'back', width: c.w, height: c.h });
      const art = paper.paint(512, Math.round((512 * c.h) / c.w), (cx, w, h) => paintSideCloud(cx, w, h, c.seed, c.side === 'right'), { dieCut: 8, seed: seed() });
      const tilt = new THREE.Group();
      tilt.add(paper.card({ canvas: art, width: c.w, height: c.h }));
      mech.mount.add(tilt);
      mechs.push(mech);
      return tilt;
    });

    // ---------------------------------------------------------------- brass wires (shared)
    const wireGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 1, 6, 1, true).translate(0, 0.5, 0);
    const wireMat = new THREE.MeshStandardMaterial({ color: '#a08a58', metalness: 0.6, roughness: 0.42 });
    const makeWire = () => {
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.castShadow = true;
      return wire;
    };

    // ---------------------------------------------------------------- the boat's cloud
    const nestMech = popup.standUp({ side: 'left', x: NEST.x, z: NEST.z, fold: 'front' });
    mechs.push(nestMech);
    const nestRig = new THREE.Group();
    const nestWire = makeWire();
    const nest = new THREE.Group();
    nestRig.add(nestWire, nest);
    nestMech.mount.add(nestRig);
    {
      const floorArt = paper.paint(512, 384, (c, w, h) => paintNestFloor(c, w, h, 51), { dieCut: 8, seed: seed() });
      const floor = paper.card({ canvas: floorArt, width: 0.78, height: 0.585, anchor: 'center' });
      floor.rotation.x = -PI / 2;
      for (const mesh of floor.children) mesh.castShadow = false; // no stain on the land far below
      const backArt = paper.paint(512, 256, (c, w, h) => paintNestPuff(c, w, h, 53, true), { dieCut: 8, seed: seed() });
      const backPuff = paper.card({ canvas: backArt, width: 0.84, height: 0.42 });
      backPuff.position.set(-0.03, -0.13, -0.26);
      backPuff.rotation.x = -0.22;
      const frontArt = paper.paint(512, 176, (c, w, h) => paintNestPuff(c, w, h, 57, false), { dieCut: 8, seed: seed() });
      const frontPuff = paper.card({ canvas: frontArt, width: 0.8, height: 0.275 });
      frontPuff.position.set(0.04, -0.19, 0.31);
      frontPuff.rotation.x = -0.18;
      nest.add(floor, backPuff, frontPuff);
    }

    // ---------------------------------------------------------------- balloons
    const envelopeProfile = [
      [0.07, 0], [0.1, 0.05], [0.17, 0.13], [0.24, 0.24], [0.28, 0.34], [0.29, 0.42],
      [0.27, 0.5], [0.22, 0.57], [0.14, 0.61], [0, 0.63],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const envelopeGeo = new THREE.LatheGeometry(envelopeProfile, 16);
    const basketGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.07, 10).translate(0, 0.035, 0);
    const basketMat = new THREE.MeshStandardMaterial({
      map: paper.texture(paper.paint(128, 64, paintBasket, { dieCut: 0, grain: 0.04 })),
      roughness: 0.95,
    });
    const ropeGeo = new THREE.BufferGeometry();
    {
      const p = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + PI / 4;
        p.push(Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05, Math.cos(a) * 0.072, 0.17, Math.sin(a) * 0.072);
      }
      ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    }
    const ropeMat = new THREE.LineBasicMaterial({ color: '#6e5643' });
    const balloons = BALLOONS.map((b, i) => {
      const mech = popup.standUp({ side: b.side, x: b.x, z: b.z, fold: 'front' });
      const rig = new THREE.Group();
      const wire = makeWire();
      const craft = new THREE.Group();
      craft.scale.setScalar(b.s);
      const goreArt = paper.paint(512, 256, (c, w, h) => paintGores(c, w, h, b.gores, b.band), { dieCut: 0, seed: 70 + i });
      const envelope = new THREE.Mesh(
        envelopeGeo,
        new THREE.MeshStandardMaterial({ map: paper.texture(goreArt), roughness: 0.88, flatShading: true, side: THREE.DoubleSide }),
      );
      envelope.position.y = 0.17;
      const basket = new THREE.Mesh(basketGeo, basketMat);
      // High in the sky over the land far below: they take light and shade but cast no shadow.
      envelope.receiveShadow = true;
      basket.receiveShadow = true;
      craft.add(envelope, basket, new THREE.LineSegments(ropeGeo, ropeMat));
      rig.add(wire, craft);
      mech.mount.add(rig);
      mechs.push(mech);
      return { b, rig, wire, craft, envelope, len: b.y - ENVELOPE_C * b.s };
    });

    // ---------------------------------------------------------------- boat, sheet and crane
    const flyer = new THREE.Group();
    flyer.name = 'sky.flyer';
    group.add(flyer);
    const boat = paper.boat({ scale: BOAT_SCALE });
    const crane = paper.crane({ scale: CRANE_SCALE });
    flyer.add(boat, crane);
    const boatMeshes = [];
    boat.traverse((o) => o.isMesh && boatMeshes.push(o));
    const craneMeshes = [];
    crane.traverse((o) => o.isMesh && craneMeshes.push(o));
    const wingPivots = crane.children.filter((o) => !o.isMesh);
    // Both models fold flat into the same diamond: half-diagonal SHEET_R, in the crane's wing plane.
    const flatY = (CRANE_WING_PIVOT * CRANE_SCALE) / BOAT_SCALE;
    for (const mesh of boatMeshes) addFlatMorph(THREE, mesh, keyMap(BOAT_KEYS, SHEET_R / BOAT_SCALE, flatY));
    const Dc = SHEET_R / CRANE_SCALE;
    for (const mesh of craneMeshes) {
      if (mesh.parent === crane) {
        // body, neck, head and tail flatten onto the plane just under the wings
        const kx = (0.9 * Dc) / 0.314;
        addFlatMorph(THREE, mesh, (x, y, z, side, out) => {
          out[0] = x * kx;
          out[1] = CRANE_WING_PIVOT - 0.007;
          out[2] = z;
        });
      } else {
        addFlatMorph(THREE, mesh, keyMap(WING_KEYS, Dc, 0));
      }
    }
    const sheetMats = [...boatMeshes, ...craneMeshes].map((m) => {
      m.material.emissive = new THREE.Color('#fff1d6');
      m.material.emissiveIntensity = 0;
      return m.material;
    });
    /** Wing hinge angle a (0 = flat, π/2 = straight up together); flight poses go through setFlap. */
    const setWings = (a) => {
      if (wingPivots.length !== 2) {
        crane.userData.setFlap((a - 0.12) / 0.75);
        return;
      }
      wingPivots[0].rotation.x = -a;
      wingPivots[1].rotation.x = a;
    };

    const glint = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture(paper, THREE, { size: 128, halo: 0.3, ray: 0.012, diagonal: 0.45 }),
        color: '#fff3dc',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    glint.renderOrder = 3;
    group.add(glint);

    // ---------------------------------------------------------------- sparkles
    const SPARK = { sun: 16, burst: 14, trail: 16 };
    const nSpark = SPARK.sun + SPARK.burst + SPARK.trail;
    const sparkPos = new Float32Array(nSpark * 3);
    const sparkCol = new Float32Array(nSpark * 3);
    const sparkSize = new Float32Array(nSpark);
    const sparkData = [];
    for (let i = 0; i < nSpark; i++) {
      sparkData.push({
        a: rng.range(0, TAU),
        b: rng.range(-1, 1),
        c: rng.range(0, 1),
        f: rng.range(1.2, 2.6),
        dx: rng.range(-1, 1),
        dy: rng.range(-1, 1),
        dz: rng.range(-1, 1),
      });
      sparkSize[i] = rng.range(0.6, 1.4);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkSize, 1));
    sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 6);
    const sparkMat = new THREE.PointsMaterial({
      size: 0.11,
      map: starTexture(paper, THREE),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    sparkMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aSize;\nvoid main() {')
        .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    sparkMat.customProgramCacheKey = () => 'sky-sparkles';
    const sparkles = new THREE.Points(sparkGeo, sparkMat);
    sparkles.frustumCulled = false;
    group.add(sparkles);

    const all = popup.collection(mechs);
    group.add(all.object);

    // ---------------------------------------------------------------- per-frame state (preallocated)
    const _m = new THREE.Matrix4();
    const _seat = new THREE.Matrix4().makeTranslation(0, NEST.seat, 0);
    const _q = new THREE.Quaternion();
    const _qt = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _p = new THREE.Vector3();
    const _p2 = new THREE.Vector3();
    const _d = new THREE.Vector3();
    const _axisX = new THREE.Vector3(1, 0, 0);

    /** Heading, pitch and bank of the crane on its path at time t (into att[0..2]). */
    const att = [0, 0, 0];
    const heading = (t) => {
      const back = t > FLIGHT_POINTS[FLIGHT_POINTS.length - 1][0] - 0.4;
      samplePath(FLIGHT, back ? t - 0.3 : t, _p);
      samplePath(FLIGHT, back ? t : t + 0.3, _p2);
      _d.subVectors(_p2, _p);
      return Math.atan2(-_d.z, _d.x);
    };
    const flightAttitude = (t) => {
      const yaw = heading(t);
      const pitch = clamp(Math.atan2(_d.y, Math.hypot(_d.x, _d.z)) * 0.55, -0.3, 0.55);
      let dy = heading(t + 0.25) - heading(t - 0.25);
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const bank = clamp(-0.55 * dy, -0.55, 0.55) + 0.05 * Math.sin(t * 0.9);
      att[0] = yaw;
      att[1] = pitch + 0.05 * flapWeight(t);
      att[2] = bank;
      return att;
    };
    const start = flightAttitude(BEAT.fly);
    const yaw1 = start[0];
    const pitch1 = start[1];
    const bank1 = start[2];
    const yaw0 = -0.35; // the boat on its cloud: bow to the right, turned a little to the reader
    const spinTo = yaw1 + TAU;

    /** Writes position + attitude of the crane in flight (t ≥ 78.5) into flyer. */
    function fly(t) {
      samplePath(FLIGHT, t, flyer.position);
      const w = flapWeight(t);
      flyer.position.y += 0.022 * w * Math.sin(TAU * FLAP_HZ * (t - BEAT.fly));
      const a = flightAttitude(t);
      flyer.quaternion.setFromEuler(_e.set(a[2], a[0], a[1], 'YZX'));
      flyer.scale.setScalar(1);
    }

    function updateSparkles(t, open) {
      let i = 0;
      // around the sun: twinkling in front of the rays
      for (let k = 0; k < SPARK.sun; k++, i++) {
        const s = sparkData[i];
        const x = s.b * 1.35;
        const y = 1.15 + s.c * 1.25;
        const zLayer = SUN.z0 + (Math.abs(x) / Math.sin(SUN.gamma)) * Math.cos(SUN.gamma);
        sparkPos[i * 3] = x;
        sparkPos[i * 3 + 1] = y;
        sparkPos[i * 3 + 2] = zLayer + 0.08 + s.dz * 0.04;
        const tw = Math.max(0, Math.sin(t * s.f + s.a)) ** 8 * open * smoothstep(73, 74.5, t);
        sparkCol[i * 3] = tw;
        sparkCol[i * 3 + 1] = tw * 0.92;
        sparkCol[i * 3 + 2] = tw * 0.75;
      }
      // two bursts at the transformation: the flat moment and the wings opening
      for (let k = 0; k < SPARK.burst; k++, i++) {
        const s = sparkData[i];
        const t0 = k < 8 ? 76.85 : 78.3;
        const u = (t - t0 - s.c * 0.25) / 1.3;
        let b = 0;
        if (u > 0 && u < 1) {
          const r = 0.12 + 0.4 * ease.outCubic(u);
          sparkPos[i * 3] = flyer.position.x + s.dx * r;
          sparkPos[i * 3 + 1] = flyer.position.y + s.dy * r * 0.7 + 0.12 * u;
          sparkPos[i * 3 + 2] = flyer.position.z + s.dz * r;
          b = Math.sin(PI * u) ** 1.5 * (0.6 + 0.4 * Math.sin(t * 13 + s.a));
        }
        sparkCol[i * 3] = b;
        sparkCol[i * 3 + 1] = b * 0.94;
        sparkCol[i * 3 + 2] = b * 0.8;
      }
      // a trail of motes shed behind the crane
      const P = 1.6;
      for (let k = 0; k < SPARK.trail; k++, i++) {
        const s = sparkData[i];
        const off = (k / SPARK.trail) * P;
        let b = 0;
        if (t >= BEAT.fly + 0.3 + off) {
          const te = BEAT.fly + 0.3 + off + P * Math.floor((t - BEAT.fly - 0.3 - off) / P);
          const age = (t - te) / P;
          samplePath(FLIGHT, te - 0.08, _p);
          sparkPos[i * 3] = _p.x + s.dx * 0.07;
          sparkPos[i * 3 + 1] = _p.y + s.dy * 0.05 - 0.1 * age;
          sparkPos[i * 3 + 2] = _p.z + s.dz * 0.07;
          b = (1 - age) ** 2 * (0.55 + 0.45 * Math.sin(t * 9 + s.a)) * (1 - smoothstep(93.5, 95.5, t));
        }
        sparkCol[i * 3] = b;
        sparkCol[i * 3 + 1] = b * 0.9;
        sparkCol[i * 3 + 2] = b * 0.72;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    return {
      group,
      leftArt,
      rightArt,
      /** The boat / crane (an Object3D in the spread frame), e.g. for a camera to follow. */
      focus: flyer,
      update(alpha, t) {
        all.update(alpha);
        const open = popup.rise(alpha, 0.9, 1);

        // Sun: the disk rides up the crease 73 → 89; its glow breathes.
        const sunY = lerp(SUN.y0, SUN.y1, ease.inOutSine(seg(t, BEAT.sunrise[0], BEAT.sunrise[1])));
        disk.left.position.y = disk.right.position.y = sunY - SUN.r;
        glows[0].position.y = glows[1].position.y = sunY;
        glowMat.opacity = open * (0.42 + 0.06 * Math.sin(t * 1.3)) * (1 - 0.6 * smoothstep(89, 95.5, t));

        // Small clouds slide across the sun layer; the front clouds sway on their hinges.
        for (const { piece, d } of drifters) {
          piece.position.x = clamp(d.x + d.v * Math.max(0, t - BEAT.open), d.min + d.w / 2, d.max - d.w / 2);
          piece.position.y = d.y + 0.015 * Math.sin(t * 0.5 + d.seed);
        }
        // (leaning back a little once open, so their faces catch the lamp)
        const lean = -0.3 * popup.rise(alpha, 0.6, 1);
        for (const { sway, f } of fronts) sway.rotation.x = lean + 0.025 * Math.sin(t * 0.7 + f.phase);
        for (const tilt of sides) tilt.rotation.x = 0.5 * lean;

        // Balloons unfold late in the page turn, then bob, sway and turn on their wires.
        const inflate = Math.max(1e-3, popup.rise(alpha, 0.8, 1));
        for (const bl of balloons) {
          const { b } = bl;
          bl.rig.scale.setScalar(inflate);
          const len = bl.len + 0.04 * Math.sin(t * 0.85 + b.phase);
          bl.wire.scale.y = len;
          bl.craft.position.y = len;
          bl.rig.rotation.z = 0.025 * Math.sin(t * 0.55 + b.phase * 1.7);
          bl.rig.rotation.x = 0.02 * Math.sin(t * 0.43 + b.phase);
          bl.envelope.rotation.y = 0.35 * Math.sin(t * 0.27 + b.phase);
        }

        // The boat's cloud grows with the opening and bobs gently.
        const nestScale = Math.max(1e-3, popup.rise(alpha, 0.35, 0.95));
        const bob = 0.012 * Math.sin(t * 0.8 + 0.3);
        nestRig.scale.setScalar(nestScale);
        nest.position.y = NEST.wire + bob;
        nestWire.scale.y = NEST.wire + bob;

        // ---- boat → sheet → crane
        const kBoat = ease.inOutCubic(seg(t, BEAT.unfold[0], BEAT.unfold[1]));
        const kCrane = 1 - ease.inOutCubic(seg(t, BEAT.refold[0], BEAT.refold[1]));
        const isCrane = t >= BEAT.swap;
        boat.visible = !isCrane;
        crane.visible = isCrane;
        for (const m of boatMeshes) m.morphTargetInfluences[0] = kBoat;
        for (const m of craneMeshes) m.morphTargetInfluences[0] = kCrane;
        const glow = smoothstep(76.45, 77, t) * (1 - smoothstep(77, 77.7, t));
        for (const mat of sheetMats) mat.emissiveIntensity = 0.06 * glow;

        if (t < BEAT.fly) {
          // Wings: flat → folded up together → opening last, to the top of the first stroke.
          const up = (PI / 2 - 0.07) * ease.inOutSine(seg(t, BEAT.wingsUp[0], BEAT.wingsUp[1]));
          const openW = ease.outCubic(seg(t, BEAT.wingsOpen[0], BEAT.wingsOpen[1]));
          setWings(lerp(up, 0.12 + 0.75 * flapPose(BEAT.fly), openW));
        } else {
          crane.userData.setFlap(flapPose(t));
        }

        if (t < BEAT.unfold[0] - 0.1) {
          // Resting in the cloud (follows the left page while it opens); rocking softly.
          nestMech.mount.updateMatrix();
          nestRig.updateMatrix();
          nest.updateMatrix();
          _m.multiplyMatrices(nestMech.mount.matrix, nestRig.matrix).multiply(nest.matrix).multiply(_seat);
          _m.decompose(flyer.position, flyer.quaternion, flyer.scale);
          flyer.position.y += 0.006 * Math.sin(t * 1.1);
          flyer.quaternion.multiply(_q.setFromEuler(_e.set(0.045 * Math.sin(t * 1.3), yaw0, 0.03 * Math.sin(t * 0.9 + 1), 'YZX')));
        } else if (t < BEAT.fly) {
          // Lift off the cloud, spin a full turn plus the way to the first heading, tilt the flat
          // sheet toward the reader at its flat moment, and settle into the take-off attitude.
          const lift = smoothstep(BEAT.unfold[0] - 0.1, 77.7, t);
          const rock = 1 - smoothstep(BEAT.unfold[0] - 0.1, 76, t);
          const restY = REST.y + bob + 0.006 * Math.sin(t * 1.1);
          flyer.position.set(REST.x, lerp(restY, TAKEOFF_Y, lift), REST.z);
          const s = seg(t, BEAT.unfold[0] - 0.1, 78.3);
          const yaw = lerp(yaw0, spinTo, ease.inOutSine(s));
          const tilt = 0.62 * Math.sin(PI * seg(t, 75.7, 78.25)) ** 2;
          const settle = smoothstep(77.9, BEAT.fly, t);
          flyer.quaternion.setFromEuler(
            _e.set(bank1 * settle + rock * 0.045 * Math.sin(t * 1.3), yaw, pitch1 * settle + rock * 0.03 * Math.sin(t * 0.9 + 1), 'YZX'),
          );
          flyer.quaternion.premultiply(_qt.setFromAxisAngle(_axisX, tilt));
          flyer.scale.setScalar(1);
        } else {
          fly(t);
        }

        // The glint: a thin star catching the sheet's leading corner at its flat moment.
        const gl = smoothstep(76.6, 77, t) * (1 - smoothstep(77, 77.5, t));
        glint.visible = gl > 0.002;
        glint.position.set(SHEET_R * 0.8, 0.03, 0).applyQuaternion(flyer.quaternion).add(flyer.position);
        glint.scale.setScalar(0.12 + 0.3 * gl);
        glint.material.opacity = 0.85 * gl;
        glint.material.rotation = 0.3 + (t - 77) * 0.9;

        updateSparkles(t, open);
      },
    };
  },
};
