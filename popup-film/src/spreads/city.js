/**
 * spreads/city.js — spread 3, "The Lantern City" (k = 3; opens 49–52, open 52–70, folds 70–73).
 *
 * A canal city at night, built in the spread frame (contract §3.1) and posed as a pure function of
 * (α, t). Everything is painted procedurally at build time; update() allocates nothing.
 *
 * Pop-up pieces (mechanism)
 *   skyline      popup.vFold, mountain, γ = GAMMA, crease foot z −1.1, 4.56 × 2.35: indigo rooftops,
 *                an onion dome, the clock tower (x ≈ −0.6, glowing face), a church with a rose
 *                window, and an observatory whose spire holds the crescent moon. Stars twinkle behind.
 *   canal row    popup.vFold with the SAME γ at z −0.1, so both V-folds stay parallel and can never
 *                touch: five canal houses; the quiet window is at spread (−1.0, 1.1, −0.5).
 *   bridge       two popup.floatingLayer linkages used as a box fold (arched walls at x = 1.1 and 1.5,
 *                deck 0.42 high, z 0.15 ± 0.475) plus two railings = popup.standUps nested on the deck;
 *                two lamps on the front railing. The canal passes through both arches.
 *   street lamp  popup.standUp on the left page's near quay.
 *   reflections  popup.onPage overlays: additive, shimmering window/moon/lamp reflections on the canal.
 * Silhouettes are kept out of each other's closed footprints (rules R1–R3 of popup.js).
 *
 * Props (shrink/fade with popup.rise before the pages close on them): paper.boat on the canal
 * (centripetal Catmull-Rom through the shared waypoints, monotone-cubic timing, bob and roll); the
 * quiet light; 16 instanced paper lanterns on three swaying strings (house → house across the
 * gutter, house → street lamp, house → bridge lamp); glow halos and twinkling stars (camera-facing
 * additive quads, one draw call each); a warm pool + ripple ring on the water around the boat.
 * Lights: two warm, shadowless PointLights — one among the lanterns, one carried by the quiet light.
 *
 * Windows: each glowing card has an emissive map plus an "order" map holding one byte per window
 * (0 dark, 1 clock, 2 moon, 3 lamps, 4–20 lit from the start, 21–254 = lighting time 53→62,
 * 255 = the quiet window), so a single shader lights them one by one with a small flare.
 *
 * Beats (film seconds): 49–52 the city rises with the page, the boat glides in from the left edge;
 * 53–62 windows light up; the quiet window breathes, swells at 62.4, and at 63 its light leaves
 * it and floats down (63–66) into the bow of the waiting boat, which glows from within from then on;
 * 65–70 the boat sails on and passes under the bridge at ~68.5; 70–73 everything folds away.
 */
import { makeRng } from '../util/rng.js';
import { ease, seg, smoothstep } from '../timeline.js';

const PI = Math.PI;

// ----------------------------------------------------------------------------------------------
// Layout (spread frame) and timing
// ----------------------------------------------------------------------------------------------

const START = 49; // film time the spread starts opening
const GAMMA = 1.95; // glue angle shared by every gutter V-fold (parallel halves never meet)
const SG = Math.sin(GAMMA);
const SKY = { z0: -1.1, half: 2.28, height: 2.35, ppu: 435 };
const ROW = { z0: -0.1, halfL: 1.95, halfR: 0.74, height: 1.75, ppu: 512 };
const BRIDGE = { x1: 1.1, x2: 1.5, h: 0.42, z: 0.15, depth: 0.95 };
const POST = { x: 2.0, z: 1.72, w: 0.36, h: 0.92, lamp: 0.785 };
const RAIL_LAMP = { x: 0.165, y: 0.3 }; // front railing lamp heads (railing mount coords)
const QUIET = { x: -1.076, y: 1.1 }; // quiet window on the row's left half → spread (−1.0, 1.1, −0.5)
const BOAT_SCALE = 0.6; // same boat size as the sea and sky spreads
const ARM = 0.32; // iron brackets that hold the front lantern string out in front of the V
const WATERLINE = 0.006;
const BOAT_PATH = [[-2.75, 1.2], [-2.4, 1.1], [-1.3, 0.8], [-0.6, 0.4], [0.6, 0.2], [1.3, 0.15], [2.2, 0.3], [2.6, 0.36]];
const BOAT_TIMES = [50.5, 52, 56, 60, 65, 67, 68.5, 70, 71.2]; // film seconds …
const BOAT_KNOTS = [0, 1, 2, 3, 3, 4, 5, 6, 7]; // … → index along BOAT_PATH (waits 60–65)
const ORB_BOW = [0.1, 0.11, 0]; // where the quiet light rests in the boat (boat model coords)
const CANAL = [[-3.4, 1.27], [-2.4, 1.1], [-1.3, 0.8], [-0.6, 0.42], [0, 0.29], [0.6, 0.2], [1.3, 0.16], [2.2, 0.28], [3.4, 0.4]];
const CANAL_HALF = 0.32;
const LIGHT_FROM = 53;
const LIGHT_TO = 62;
const ORB_FROM = 63;
const ORB_TO = 66;

// ----------------------------------------------------------------------------------------------
// Colours (night palette: mid values so the paper still reads under the dimmed lamp)
// ----------------------------------------------------------------------------------------------

const INK = '#25234c';
const CREAM = '#efe5cc';
const GLASS = '#2a2b57';
const NIGHT_PAPER = '#dcd8ec'; // die-cut border: white paper under moonlight
const GLOWS = ['#ffd889', '#ffc76c', '#ffe1a2', '#ffbb62', '#ffd6a8'];
const SKY_WALLS = ['#5b5d9e', '#6463a6', '#535792', '#5f6aa6'];
const SKY_ROOF = '#45477f';
const HOUSE = { brick: '#b86e57', ochre: '#d0a15f', quiet: '#5e81bb', rose: '#c58597', lavender: '#9a88c6', teal: '#5ea1a6' };
const ROOF = '#4a4c7c';
const STORY_INK = 'rgba(118,52,20,0.78)';

// ----------------------------------------------------------------------------------------------
// Canvas helpers (layer painters draw in card units, y up: see layerTransform)
// ----------------------------------------------------------------------------------------------

function layerTransform(ctx, ppu, x0, h) {
  ctx.setTransform(ppu, 0, 0, -ppu, -x0 * ppu, h * ppu);
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function blob(ctx, x, y, rx, ry, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, PI * 2);
}

/** Flat paper shape: fill, faint courses, ground shade, moonlit rim (upper right), ink outline. */
function shape(ctx, pts, fill, px, { courses = 0.045, rim = 'rgba(205,212,255,0.32)', shade = 0.32 } = {}) {
  poly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  if (courses) {
    ctx.strokeStyle = 'rgba(28,24,62,0.1)';
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    for (let y = courses; y < 2.5; y += courses) {
      ctx.moveTo(-3, y);
      ctx.lineTo(3, y);
    }
    ctx.stroke();
  }
  if (shade) {
    const g = ctx.createLinearGradient(0, 0, 0, 0.45);
    g.addColorStop(0, `rgba(22,18,52,${shade})`);
    g.addColorStop(1, 'rgba(22,18,52,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-3, 0, 6, 0.45);
  }
  ctx.translate(-3 * px, -3 * px);
  poly(ctx, pts);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 6 * px;
  ctx.stroke();
  ctx.restore();
  poly(ctx, pts);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4 * px;
  ctx.stroke();
}

/** Roof: shape() plus rows of scalloped tiles. */
function roof(ctx, pts, fill, px, tile = 0.05) {
  shape(ctx, pts, fill, px, { courses: 0, shade: 0 });
  ctx.save();
  poly(ctx, pts);
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,18,48,0.38)';
  ctx.lineWidth = 1.3 * px;
  let ys = Infinity;
  for (let i = 1; i < pts.length; i += 2) ys = Math.min(ys, pts[i]);
  for (let y = ys + tile * 0.8, row = 0; y < 2.5; y += tile * 0.8, row++) {
    ctx.beginPath();
    for (let x = -3 + (row % 2) * tile * 0.5; x < 3; x += tile) ctx.arc(x + tile / 2, y, tile / 2, PI, 0, true);
    ctx.stroke();
  }
  ctx.restore();
  poly(ctx, pts);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4 * px;
  ctx.stroke();
}

function chimney(ctx, x0, x1, y0, y1, px) {
  shape(ctx, [x0, y0, x0, y1, x1, y1, x1, y0], '#6b5f86', px, { courses: 0.03, shade: 0 });
  shape(ctx, [x0 - 0.008, y1, x0 - 0.008, y1 + 0.018, x1 + 0.008, y1 + 0.018, x1 + 0.008, y1], '#57507a', px, { courses: 0, shade: 0 });
}

function door(ctx, x, w, h, color, px) {
  const hw = w / 2;
  ctx.beginPath();
  ctx.moveTo(x - hw, 0);
  ctx.lineTo(x - hw, h - hw);
  ctx.arc(x, h - hw, hw, PI, 0, true);
  ctx.lineTo(x + hw, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,16,40,0.45)';
  ctx.lineWidth = 1.2 * px;
  ctx.strokeRect(x - hw * 0.65, h * 0.12, hw * 0.55, h * 0.36);
  ctx.strokeRect(x + hw * 0.1, h * 0.12, hw * 0.55, h * 0.36);
  ctx.fillStyle = '#e8c76a';
  ctx.beginPath();
  ctx.arc(x + hw * 0.55, h * 0.45, 0.006, 0, PI * 2);
  ctx.fill();
}

function flowerBox(ctx, x, y, w, px) {
  const R = makeRng(Math.round(Math.abs(x * 7919 + y * 104729)) + 1);
  ctx.fillStyle = '#7a4a3a';
  ctx.fillRect(x - w / 2, y - 0.022, w, 0.022);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(x - w / 2, y - 0.022, w, 0.022);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) blob(ctx, x - w / 2 + (i + 0.5) * (w / 9), y + R.range(-0.002, 0.012), 0.011, 0.01);
  ctx.fillStyle = '#4f7d5e';
  ctx.fill();
  const petals = ['#f08aa0', '#ffd06a', '#f4f0e6', '#e86a5a'];
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    blob(ctx, x - w / 2 + R.range(0.08, 0.92) * w, y + R.range(0.004, 0.02), 0.0065, 0.0065);
    ctx.fillStyle = R.pick(petals);
    ctx.fill();
  }
}

// ----------------------------------------------------------------------------------------------
// Windows: dark glass in the colour map, warm glow (+ a little story) in the emissive map
// ----------------------------------------------------------------------------------------------

function windowPath(ctx, w) {
  const { x, y } = w;
  const hw = w.w / 2;
  const hh = w.h / 2;
  ctx.beginPath();
  if (w.shape === 'round') ctx.arc(x, y, hw, 0, PI * 2);
  else if (w.shape === 'arch') {
    ctx.moveTo(x - hw, y - hh);
    ctx.lineTo(x - hw, y + hh - hw);
    ctx.arc(x, y + hh - hw, hw, PI, 0, true);
    ctx.lineTo(x + hw, y - hh);
    ctx.closePath();
  } else ctx.rect(x - hw, y - hh, w.w, w.h);
}

/** Crescent: the outer disc minus an offset inner disc (exact outline, no stray sliver). */
function moonPath(ctx, w) {
  const r = w.w / 2;
  const dx = r * 0.36;
  const dy = r * 0.3;
  const ri = r * 0.86;
  const D = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  const th = Math.acos((r * r + D * D - ri * ri) / (2 * r * D));
  const p1x = w.x + r * Math.cos(phi + th);
  const p1y = w.y + r * Math.sin(phi + th);
  const p2x = w.x + r * Math.cos(phi - th);
  const p2y = w.y + r * Math.sin(phi - th);
  const cx = w.x + dx;
  const cy = w.y + dy;
  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.arc(w.x, w.y, r, phi + th, phi - th, false);
  ctx.arc(cx, cy, ri, Math.atan2(p2y - cy, p2x - cx), Math.atan2(p1y - cy, p1x - cx), true);
  ctx.closePath();
}

function mullions(ctx, w, color, px) {
  if (w.shape === 'tiny' || w.kind === 'moon' || w.kind === 'clock' || w.kind === 'lamp') return;
  ctx.strokeStyle = color;
  ctx.lineWidth = (w.w > 0.07 ? 2.6 : 1.8) * px;
  ctx.beginPath();
  if (w.shape === 'round') {
    ctx.moveTo(w.x - w.w / 2, w.y);
    ctx.lineTo(w.x + w.w / 2, w.y);
    ctx.moveTo(w.x, w.y - w.h / 2);
    ctx.lineTo(w.x, w.y + w.h / 2);
  } else {
    ctx.moveTo(w.x, w.y - w.h / 2);
    ctx.lineTo(w.x, w.y + w.h / 2);
    ctx.moveTo(w.x - w.w / 2, w.y + w.h * 0.12);
    ctx.lineTo(w.x + w.w / 2, w.y + w.h * 0.12);
  }
  ctx.stroke();
}

function clockFace(ctx, w, glow, px) {
  const r = w.w / 2;
  ctx.beginPath();
  ctx.arc(w.x, w.y, r, 0, PI * 2);
  if (glow) {
    const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, r);
    g.addColorStop(0, '#fff5d6');
    g.addColorStop(1, '#f2cf86');
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#ede1bf';
  ctx.fill();
  const ink = glow ? '#000' : INK;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3 * px;
  ctx.stroke();
  ctx.lineWidth = 2 * px;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2;
    const r0 = i % 3 ? 0.84 : 0.72;
    ctx.moveTo(w.x + Math.cos(a) * r * r0, w.y + Math.sin(a) * r * r0);
    ctx.lineTo(w.x + Math.cos(a) * r * 0.94, w.y + Math.sin(a) * r * 0.94);
  }
  ctx.stroke();
  // ten to nine — late, but the city is still awake
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.moveTo(w.x, w.y);
  ctx.lineTo(w.x + Math.cos(PI * 0.97) * r * 0.5, w.y + Math.sin(PI * 0.97) * r * 0.5);
  ctx.moveTo(w.x, w.y);
  ctx.lineTo(w.x + Math.cos(PI * 0.7) * r * 0.78, w.y + Math.sin(PI * 0.7) * r * 0.78);
  ctx.stroke();
}

function moonFace(ctx, w, glow, px) {
  const r = w.w / 2;
  ctx.save();
  moonPath(ctx, w);
  ctx.fillStyle = glow ? '#fbf3d4' : '#efe6c4';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = glow ? 'rgba(170,150,105,0.5)' : 'rgba(170,150,110,0.35)';
  ctx.beginPath();
  blob(ctx, w.x - r * 0.62, w.y - r * 0.05, r * 0.12, r * 0.1);
  blob(ctx, w.x - r * 0.35, w.y - r * 0.6, r * 0.09, r * 0.08);
  blob(ctx, w.x - r * 0.78, w.y + r * 0.35, r * 0.07, r * 0.06);
  ctx.fill();
  ctx.restore();
  if (!glow) {
    moonPath(ctx, w);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2 * px;
    ctx.stroke();
  }
}

/** A little story silhouetted in a lit window (emissive map only). */
function story(ctx, w, px) {
  const { x, w: W, h: H } = w;
  const b = w.y - H / 2;
  ctx.fillStyle = STORY_INK;
  ctx.strokeStyle = STORY_INK;
  ctx.beginPath();
  switch (w.story) {
    case 'cat': {
      const cx = x - W * 0.18;
      blob(ctx, cx, b + H * 0.17, W * 0.17, H * 0.17);
      blob(ctx, cx + W * 0.03, b + H * 0.38, W * 0.12, W * 0.11);
      ctx.moveTo(cx - W * 0.08, b + H * 0.42);
      ctx.lineTo(cx - W * 0.06, b + H * 0.53);
      ctx.lineTo(cx + W * 0.0, b + H * 0.44);
      ctx.moveTo(cx + W * 0.06, b + H * 0.44);
      ctx.lineTo(cx + W * 0.12, b + H * 0.53);
      ctx.lineTo(cx + W * 0.14, b + H * 0.42);
      ctx.fill();
      ctx.beginPath();
      ctx.lineWidth = 3 * px;
      ctx.moveTo(cx + W * 0.14, b + H * 0.06);
      ctx.quadraticCurveTo(cx + W * 0.42, b + H * 0.05, cx + W * 0.36, b + H * 0.24);
      ctx.stroke();
      return;
    }
    case 'plant':
      ctx.moveTo(x + W * 0.08, b);
      ctx.lineTo(x + W * 0.36, b);
      ctx.lineTo(x + W * 0.4, b + H * 0.16);
      ctx.lineTo(x + W * 0.04, b + H * 0.16);
      blob(ctx, x + W * 0.14, b + H * 0.3, W * 0.1, H * 0.14, 0.5);
      blob(ctx, x + W * 0.3, b + H * 0.33, W * 0.1, H * 0.15, -0.5);
      blob(ctx, x + W * 0.22, b + H * 0.42, W * 0.08, H * 0.16);
      break;
    case 'reader':
      blob(ctx, x - W * 0.05, b + H * 0.52, W * 0.13, W * 0.14);
      blob(ctx, x - W * 0.05, b + H * 0.16, W * 0.3, H * 0.24);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,246,214,0.95)';
      ctx.rect(x + W * 0.04, b + H * 0.26, W * 0.26, H * 0.09);
      break;
    case 'curtain':
      ctx.fillStyle = 'rgba(176,72,44,0.62)';
      ctx.moveTo(x - W / 2, w.y + H / 2);
      ctx.lineTo(x - W * 0.12, w.y + H / 2);
      ctx.quadraticCurveTo(x - W * 0.2, b + H * 0.55, x - W * 0.36, b + H * 0.42);
      ctx.quadraticCurveTo(x - W * 0.42, b + H * 0.2, x - W / 2, b);
      ctx.moveTo(x + W / 2, w.y + H / 2);
      ctx.lineTo(x + W * 0.12, w.y + H / 2);
      ctx.quadraticCurveTo(x + W * 0.2, b + H * 0.55, x + W * 0.36, b + H * 0.42);
      ctx.quadraticCurveTo(x + W * 0.42, b + H * 0.2, x + W / 2, b);
      break;
    case 'lamp':
      ctx.rect(x + W * 0.17, b, W * 0.06, H * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,252,232,0.95)';
      ctx.moveTo(x + W * 0.06, b + H * 0.3);
      ctx.lineTo(x + W * 0.34, b + H * 0.3);
      ctx.lineTo(x + W * 0.27, b + H * 0.46);
      ctx.lineTo(x + W * 0.13, b + H * 0.46);
      break;
    case 'cage':
      ctx.lineWidth = 2 * px;
      ctx.arc(x - W * 0.12, b + H * 0.42, W * 0.17, PI, 0, true);
      ctx.lineTo(x + W * 0.05, b + H * 0.2);
      ctx.lineTo(x - W * 0.29, b + H * 0.2);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      blob(ctx, x - W * 0.12, b + H * 0.3, W * 0.07, W * 0.05);
      break;
    case 'couple':
      blob(ctx, x - W * 0.2, b + H * 0.5, W * 0.12, W * 0.13);
      blob(ctx, x + W * 0.17, b + H * 0.47, W * 0.11, W * 0.12);
      blob(ctx, x - W * 0.2, b + H * 0.16, W * 0.24, H * 0.24);
      blob(ctx, x + W * 0.17, b + H * 0.14, W * 0.22, H * 0.22);
      break;
    case 'candle':
      ctx.fillStyle = 'rgba(150,90,50,0.6)';
      ctx.rect(x - W * 0.36, b, W * 0.72, H * 0.06);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,250,236,1)';
      ctx.rect(x - W * 0.05, b + H * 0.06, W * 0.1, H * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      blob(ctx, x, b + H * 0.34, W * 0.06, H * 0.08);
      break;
    case 'rose':
      ctx.lineWidth = 2.4 * px;
      ctx.strokeStyle = '#000';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        ctx.moveTo(x, w.y);
        ctx.lineTo(x + Math.cos(a) * W / 2, w.y + Math.sin(a) * W / 2);
      }
      ctx.moveTo(x + W * 0.2, w.y);
      ctx.arc(x, w.y, W * 0.2, 0, PI * 2);
      ctx.stroke();
      return;
    default:
      return;
  }
  ctx.fill();
}

/** Colour-map window: dark glass, cream frame and sill, optional shutters / flower box. */
function paintGlass(ctx, w, px) {
  if (w.kind === 'clock') return clockFace(ctx, w, false, px);
  if (w.kind === 'moon') return moonFace(ctx, w, false, px);
  windowPath(ctx, w);
  ctx.fillStyle = w.kind === 'lamp' ? '#f2dca2' : GLASS;
  ctx.fill();
  if (w.kind !== 'lamp') {
    ctx.save();
    windowPath(ctx, w);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,130,200,0.35)';
    ctx.lineWidth = w.w * 0.18;
    ctx.beginPath();
    ctx.moveTo(w.x - w.w * 0.3, w.y - w.h * 0.6);
    ctx.lineTo(w.x + w.w * 0.4, w.y + w.h * 0.6);
    ctx.stroke();
    ctx.restore();
  }
  mullions(ctx, w, CREAM, px);
  windowPath(ctx, w);
  ctx.strokeStyle = w.shape === 'tiny' ? '#2c2a5a' : CREAM;
  ctx.lineWidth = (w.shape === 'tiny' ? 1.6 : 3) * px;
  ctx.stroke();
  if ((w.shape === 'rect' || w.shape === 'arch') && w.kind !== 'lamp') {
    const sill = w.y - w.h / 2;
    ctx.fillStyle = CREAM;
    ctx.fillRect(w.x - w.w / 2 - 0.01, sill - 0.012, w.w + 0.02, 0.012);
    if (w.shutters) {
      for (const s of [-1, 1]) {
        const sx = w.x + s * (w.w / 2 + w.w * 0.22);
        ctx.fillStyle = w.shutters;
        ctx.fillRect(sx - w.w * 0.2, sill, w.w * 0.4, w.h * (w.shape === 'arch' ? 0.8 : 1));
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4 * px;
        ctx.strokeRect(sx - w.w * 0.2, sill, w.w * 0.4, w.h * (w.shape === 'arch' ? 0.8 : 1));
        ctx.beginPath();
        for (let y = sill + 0.015; y < sill + w.h * 0.8; y += 0.018) {
          ctx.moveTo(sx - w.w * 0.16, y);
          ctx.lineTo(sx + w.w * 0.16, y);
        }
        ctx.strokeStyle = 'rgba(20,16,40,0.35)';
        ctx.stroke();
      }
    }
    if (w.box) flowerBox(ctx, w.x, sill - 0.012, w.w + 0.03, px);
  }
  if (w.kind === 'dark' && w.closed) {
    // curtains drawn: someone is already asleep
    windowPath(ctx, w);
    ctx.fillStyle = 'rgba(126,84,120,0.85)';
    ctx.fill();
    mullions(ctx, w, CREAM, px);
  }
}

function spillRadius(w) {
  if (w.kind === 'moon') return w.w * 0.9;
  if (w.kind === 'clock') return w.w * 0.75;
  return Math.max(w.w, w.h) * (w.shape === 'tiny' ? 1.1 : 1.35);
}

function paintSpill(ctx, w) {
  const r = spillRadius(w);
  const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, r);
  const moon = w.kind === 'moon';
  g.addColorStop(0, moon ? 'rgba(214,220,255,0.34)' : 'rgba(255,170,84,0.34)');
  g.addColorStop(1, moon ? 'rgba(214,220,255,0)' : 'rgba(255,150,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w.x - r, w.y - r, 2 * r, 2 * r);
}

function paintPane(ctx, w, px) {
  if (w.kind === 'clock') return clockFace(ctx, w, true, px);
  if (w.kind === 'moon') return moonFace(ctx, w, true, px);
  const quiet = w.kind === 'quiet';
  windowPath(ctx, w);
  const r = Math.max(w.w, w.h);
  const g = ctx.createRadialGradient(w.x, w.y - w.h * 0.18, 0, w.x, w.y, r * 0.75);
  g.addColorStop(0, quiet ? '#fffaf0' : '#fff2c8');
  g.addColorStop(0.45, quiet ? '#ffe8b8' : w.tint ?? '#ffd27a');
  g.addColorStop(1, quiet ? '#f5c77a' : '#e98b34');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  windowPath(ctx, w);
  ctx.clip();
  story(ctx, w, px);
  ctx.restore();
  mullions(ctx, w, '#000', px);
  windowPath(ctx, w);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = (w.shape === 'tiny' ? 1.4 : 2.6) * px;
  ctx.stroke();
}

// ----------------------------------------------------------------------------------------------
// Layer painters. Signature: (ctx, mode 'color' | 'glow', px = one pixel in units, win(spec), R).
// They draw walls only in 'color' mode and call win() for every window in both modes, in the same
// order, so the colour map, emissive map and order map always agree.
// ----------------------------------------------------------------------------------------------

function paintSkyline(ctx, mode, px, win, R) {
  const C = mode === 'color';
  const body = (pts, i) => C && shape(ctx, pts, SKY_WALLS[i], px, { courses: 0.05, shade: 0.4 });
  const top = (pts) => C && roof(ctx, pts, SKY_ROOF, px, 0.04);
  const chim = (x0, x1, y0, y1) => C && chimney(ctx, x0, x1, y0, y1, px);
  const tiny = (x0, x1, y0, y1, cols, rows, lit = 0.86) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        win({
          x: cols === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * c) / (cols - 1),
          y: rows === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * r) / (rows - 1),
          w: 0.04,
          h: 0.058,
          shape: R.chance(0.3) ? 'arch' : 'tiny',
          kind: R.chance(lit) ? 'seq' : 'dark',
          tint: R.pick(GLOWS),
          story: R.chance(0.3) ? 'curtain' : 'none',
          far: true,
        });
      }
    }
  };

  // ── left half (x < 0), outer end first ──
  body([-2.27, 0, -2.27, 0.98, -2.16, 1.12, -2.05, 0.98, -2.05, 0], 2);
  chim(-2.23, -2.19, 1.0, 1.2);
  tiny(-2.21, -2.11, 0.3, 0.78, 2, 2);
  body([-2.05, 0, -2.05, 1.5, -1.7, 1.5, -1.7, 0], 0);
  top([-1.99, 1.5, -1.99, 1.62, -1.925, 1.88, -1.86, 1.62, -1.86, 1.5]);
  chim(-1.79, -1.75, 1.5, 1.63);
  tiny(-1.98, -1.77, 0.3, 1.32, 3, 4);
  body([-1.7, 0, -1.7, 1.12, -1.6, 1.3, -1.5, 1.12, -1.5, 0], 1);
  body([-1.5, 0, -1.5, 1.25, -1.4, 1.45, -1.3, 1.25, -1.3, 0], 3);
  chim(-1.68, -1.64, 1.12, 1.33);
  chim(-1.36, -1.32, 1.3, 1.5);
  tiny(-1.66, -1.54, 0.3, 0.95, 2, 3);
  tiny(-1.46, -1.34, 0.3, 1.1, 2, 3);
  // onion dome
  body([-1.3, 0, -1.3, 1.32, -0.83, 1.32, -0.83, 0], 0);
  body([-1.17, 1.32, -1.17, 1.46, -0.96, 1.46, -0.96, 1.32], 1);
  if (C) {
    ctx.beginPath();
    ctx.moveTo(-1.19, 1.46);
    ctx.bezierCurveTo(-1.26, 1.58, -1.16, 1.68, -1.065, 1.86);
    ctx.bezierCurveTo(-0.97, 1.68, -0.87, 1.58, -0.94, 1.46);
    ctx.closePath();
    ctx.fillStyle = '#7c78b8';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(30,26,70,0.4)';
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(-1.065 + i * 0.05, 1.46);
      ctx.quadraticCurveTo(-1.065 + i * 0.07, 1.62, -1.065, 1.86);
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-1.19, 1.46);
    ctx.bezierCurveTo(-1.26, 1.58, -1.16, 1.68, -1.065, 1.86);
    ctx.bezierCurveTo(-0.97, 1.68, -0.87, 1.58, -0.94, 1.46);
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4 * px;
    ctx.stroke();
    top([-1.072, 1.85, -1.065, 1.93, -1.058, 1.85]);
  }
  tiny(-1.24, -0.89, 0.3, 1.12, 4, 4);
  win({ x: -1.065, y: 1.39, w: 0.05, h: 0.07, shape: 'arch', kind: 'pre', tint: GLOWS[2], story: 'none', far: true });
  // clock tower (x ≈ −0.62)
  body([-0.79, 0, -0.79, 1.55, -0.45, 1.55, -0.45, 0], 1);
  body([-0.81, 1.55, -0.81, 1.92, -0.43, 1.92, -0.43, 1.55], 3);
  body([-0.76, 1.92, -0.76, 2.06, -0.48, 2.06, -0.48, 1.92], 0);
  if (C) {
    for (const x of [-0.69, -0.55]) {
      ctx.beginPath();
      ctx.moveTo(x - 0.035, 1.94);
      ctx.lineTo(x - 0.035, 2.0);
      ctx.arc(x, 2.0, 0.035, PI, 0, true);
      ctx.lineTo(x + 0.035, 1.94);
      ctx.closePath();
      ctx.fillStyle = '#2b2a58';
      ctx.fill();
    }
    shape(ctx, [-0.83, 1.9, -0.83, 1.935, -0.41, 1.935, -0.41, 1.9], '#7876b6', px, { courses: 0, shade: 0 });
    shape(ctx, [-0.81, 1.53, -0.81, 1.56, -0.43, 1.56, -0.43, 1.53], '#7876b6', px, { courses: 0, shade: 0 });
  }
  top([-0.79, 2.06, -0.62, 2.3, -0.45, 2.06]);
  if (C) {
    ctx.beginPath();
    ctx.arc(-0.62, 2.31, 0.013, 0, PI * 2);
    ctx.fillStyle = '#d9b85e';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6 * px;
    ctx.stroke();
  }
  win({ x: -0.62, y: 1.735, w: 0.27, h: 0.27, shape: 'round', kind: 'clock' });
  for (const y of [0.42, 0.82, 1.22]) {
    win({ x: -0.62, y, w: 0.05, h: 0.12, shape: 'arch', kind: 'seq', tint: R.pick(GLOWS), story: 'none', far: true });
  }
  body([-0.47, 0, -0.47, 1.28, -0.38, 1.28, -0.38, 0], 2);
  // mansard block at the crease
  body([-0.4, 0, -0.4, 1.42, 0, 1.42, 0, 0], 0);
  top([-0.4, 1.42, -0.36, 1.66, 0, 1.66, 0, 1.42]);
  chim(-0.1, -0.05, 1.6, 1.82);
  win({ x: -0.29, y: 1.54, w: 0.045, h: 0.07, shape: 'arch', kind: 'seq', tint: R.pick(GLOWS), story: 'none', far: true });
  win({ x: -0.15, y: 1.54, w: 0.045, h: 0.07, shape: 'arch', kind: 'seq', tint: R.pick(GLOWS), story: 'none', far: true });
  tiny(-0.33, -0.07, 0.3, 1.24, 3, 4);

  // ── right half (x > 0): tall at the crease, low over the bridge's footprint, tall again outside ──
  body([0, 0, 0, 1.22, 0.38, 1.22, 0.38, 0], 1);
  body([0.11, 1.22, 0.11, 1.72, 0.27, 1.72, 0.27, 1.22], 0);
  top([0.1, 1.72, 0.19, 2.17, 0.28, 1.72]);
  if (C) {
    ctx.strokeStyle = '#d9b85e';
    ctx.lineWidth = 3.4 * px;
    ctx.beginPath();
    ctx.moveTo(0.19, 2.16);
    ctx.lineTo(0.19, 2.25);
    ctx.moveTo(0.165, 2.215);
    ctx.lineTo(0.215, 2.215);
    ctx.stroke();
  }
  win({ x: 0.19, y: 0.9, w: 0.18, h: 0.18, shape: 'round', kind: 'pre', tint: '#ffcf78', story: 'rose', far: true });
  win({ x: 0.19, y: 1.5, w: 0.05, h: 0.13, shape: 'arch', kind: 'pre', tint: GLOWS[0], story: 'none', far: true });
  for (const x of [0.06, 0.32]) win({ x, y: 0.5, w: 0.05, h: 0.22, shape: 'arch', kind: 'seq', tint: R.pick(GLOWS), story: 'none', far: true });
  body([0.38, 0, 0.38, 1.12, 0.5, 1.26, 0.62, 1.12, 0.62, 0], 2);
  tiny(0.44, 0.56, 0.3, 0.95, 2, 3);
  body([0.62, 0, 0.62, 0.8, 0.74, 0.95, 0.86, 0.8, 0.86, 0], 3);
  body([0.86, 0, 0.86, 0.72, 0.9, 0.86, 1.08, 0.86, 1.12, 0.72, 1.12, 0], 0);
  body([1.12, 0, 1.12, 0.85, 1.21, 0.98, 1.3, 0.85, 1.3, 0], 1);
  body([1.3, 0, 1.3, 0.78, 1.4, 0.92, 1.5, 0.78, 1.5, 0], 2);
  chim(0.96, 1.0, 0.86, 1.03);
  chim(1.42, 1.46, 0.84, 1.02);
  tiny(0.68, 0.8, 0.28, 0.6, 2, 2);
  tiny(0.92, 1.06, 0.28, 0.58, 2, 2);
  tiny(1.17, 1.25, 0.28, 0.65, 2, 2);
  tiny(1.35, 1.45, 0.28, 0.6, 2, 2);
  // observatory with the moon resting on its spire
  body([1.5, 0, 1.5, 1.25, 2.26, 1.25, 2.26, 0], 1);
  if (C) {
    ctx.beginPath();
    ctx.arc(1.88, 1.26, 0.27, 0, PI, false);
    ctx.closePath();
    ctx.fillStyle = '#8b8fc8';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(30,26,70,0.45)';
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      ctx.moveTo(1.88 + i * 0.075, 1.26);
      ctx.quadraticCurveTo(1.88 + i * 0.06, 1.47, 1.88, 1.53);
    }
    ctx.stroke();
    ctx.fillStyle = '#25244f';
    ctx.fillRect(1.86, 1.3, 0.04, 0.24);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(1.88, 1.26, 0.27, 0, PI, false);
    ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4 * px;
    ctx.stroke();
    shape(ctx, [1.48, 1.24, 1.48, 1.28, 2.28, 1.28, 2.28, 1.24], '#7876b6', px, { courses: 0, shade: 0 });
    shape(ctx, [1.95, 1.4, 2.12, 1.58, 2.145, 1.555, 1.975, 1.375], '#8a7f9f', px, { courses: 0, shade: 0 });
  }
  body([1.845, 1.52, 1.845, 1.6, 1.915, 1.6, 1.915, 1.52], 3);
  top([1.84, 1.6, 1.88, 1.9, 1.92, 1.6]);
  win({ x: 1.9, y: 2.08, w: 0.4, h: 0.4, shape: 'round', kind: 'moon' });
  for (const x of [1.6, 1.74, 2.02, 2.16]) win({ x, y: 0.62, w: 0.06, h: 0.24, shape: 'arch', kind: 'seq', tint: R.pick(GLOWS), story: 'none', far: true });
  win({ x: 1.88, y: 1.04, w: 0.1, h: 0.1, shape: 'round', kind: 'pre', tint: GLOWS[2], story: 'none', far: true });
  if (C) door(ctx, 1.88, 0.12, 0.26, '#3b3768', px);
}

function paintRow(ctx, mode, px, win, R) {
  const C = mode === 'color';
  const W = (spec) => win({ shape: 'rect', kind: 'seq', story: 'none', tint: R.pick(GLOWS), ...spec });

  // ── left half ──
  // rose house with a stepped gable (outer end)
  if (C) {
    shape(ctx, [-1.93, 0, -1.93, 1.18, -1.87, 1.18, -1.87, 1.27, -1.8, 1.27, -1.8, 1.36, -1.72, 1.36, -1.72, 1.46,
      -1.54, 1.46, -1.54, 1.36, -1.46, 1.36, -1.46, 1.27, -1.39, 1.27, -1.39, 1.18, -1.336, 1.18, -1.336, 0], HOUSE.rose, px);
    chimney(ctx, -1.69, -1.64, 1.46, 1.58, px);
    door(ctx, -1.633, 0.13, 0.27, '#4c3f6e', px);
    ctx.fillStyle = '#d7c7a8';
    ctx.fillRect(-1.93, 1.15, 0.594, 0.02);
  }
  W({ x: -1.82, y: 0.38, w: 0.09, h: 0.13, story: 'cat', shutters: '#5f7f6a', box: true });
  W({ x: -1.45, y: 0.38, w: 0.09, h: 0.13, story: 'plant' });
  W({ x: -1.82, y: 0.78, w: 0.08, h: 0.14, shape: 'arch', story: 'curtain', box: true });
  W({ x: -1.633, y: 0.78, w: 0.08, h: 0.14, shape: 'arch', story: 'reader' });
  W({ x: -1.45, y: 0.78, w: 0.08, h: 0.14, shape: 'arch', story: 'lamp', box: true });
  W({ x: -1.633, y: 1.3, w: 0.06, h: 0.09, shape: 'arch', story: 'none' });

  // the quiet house: narrow, blue, asleep — except for one small window
  if (C) {
    shape(ctx, [-1.336, 0, -1.336, 1.3, -1.076, 1.72, -0.816, 1.3, -0.816, 0], HOUSE.quiet, px);
    ctx.strokeStyle = ROOF;
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.moveTo(-1.35, 1.285);
    ctx.lineTo(-1.076, 1.728);
    ctx.lineTo(-0.802, 1.285);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    door(ctx, -1.17, 0.12, 0.26, '#3e6b5e', px);
    // a lantern hook by the door
    ctx.fillStyle = '#e6c16a';
    ctx.fillRect(-1.08, 0.26, 0.022, 0.032);
  }
  W({ x: -0.96, y: 0.36, w: 0.08, h: 0.12, kind: 'dark', closed: true, shutters: '#3f5d8c' });
  W({ x: -1.076, y: 0.74, w: 0.09, h: 0.14, kind: 'dark', closed: true, shutters: '#3f5d8c' });
  W({ x: QUIET.x, y: QUIET.y, w: 0.1, h: 0.135, shape: 'arch', kind: 'quiet', story: 'candle', box: true });
  W({ x: -1.076, y: 1.47, w: 0.06, h: 0.06, shape: 'round', kind: 'dark' });

  // ochre house with a café awning (low, so the clock tower shows above it)
  if (C) {
    shape(ctx, [-0.816, 0, -0.816, 1.03, -0.32, 1.03, -0.32, 0], HOUSE.ochre, px);
    roof(ctx, [-0.83, 1.03, -0.77, 1.19, -0.37, 1.19, -0.31, 1.03], ROOF, px);
    shape(ctx, [-0.83, 1.01, -0.83, 1.045, -0.306, 1.045, -0.306, 1.01], '#e1c58f', px, { courses: 0, shade: 0 });
    // striped awning
    const ax0 = -0.79;
    const ax1 = -0.35;
    for (let i = 0; i < 11; i++) {
      const x0 = ax0 + ((ax1 - ax0) * i) / 11;
      ctx.fillStyle = i % 2 ? '#f1e6cf' : '#c4513f';
      ctx.beginPath();
      ctx.moveTo(x0, 0.4);
      ctx.lineTo(x0 + (ax1 - ax0) / 11, 0.4);
      ctx.lineTo(x0 + (ax1 - ax0) / 11, 0.335);
      ctx.arc(x0 + (ax1 - ax0) / 22, 0.335, (ax1 - ax0) / 22, 0, PI, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8 * px;
    ctx.strokeRect(ax0, 0.335, ax1 - ax0, 0.065);
    door(ctx, -0.39, 0.09, 0.25, '#7a3e3a', px);
    // balcony rail
    ctx.strokeStyle = '#2d2b52';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(-0.78, 0.64);
    ctx.lineTo(-0.36, 0.64);
    for (let x = -0.78; x <= -0.36; x += 0.021) {
      ctx.moveTo(x, 0.585);
      ctx.lineTo(x, 0.64);
    }
    ctx.moveTo(-0.78, 0.585);
    ctx.lineTo(-0.36, 0.585);
    ctx.stroke();
  }
  W({ x: -0.7, y: 0.17, w: 0.13, h: 0.17, story: 'couple' });
  W({ x: -0.53, y: 0.17, w: 0.13, h: 0.17, story: 'lamp' });
  W({ x: -0.73, y: 0.7, w: 0.08, h: 0.13, story: 'plant' });
  W({ x: -0.57, y: 0.7, w: 0.08, h: 0.13, story: 'cage', box: true });
  W({ x: -0.41, y: 0.7, w: 0.08, h: 0.13, story: 'curtain' });
  W({ x: -0.57, y: 0.94, w: 0.06, h: 0.07, story: 'none' });

  // brick house at the crease, gable toward the reader
  if (C) {
    shape(ctx, [-0.32, 0, -0.32, 1.42, -0.16, 1.62, 0, 1.42, 0, 0], HOUSE.brick, px, { courses: 0.03 });
    ctx.strokeStyle = ROOF;
    ctx.lineWidth = 0.026;
    ctx.beginPath();
    ctx.moveTo(-0.335, 1.405);
    ctx.lineTo(-0.16, 1.63);
    ctx.lineTo(0.0, 1.425);
    ctx.stroke();
    chimney(ctx, -0.29, -0.245, 1.45, 1.66, px);
    door(ctx, -0.24, 0.09, 0.22, '#3d4f7d', px);
  }
  W({ x: -0.085, y: 0.15, w: 0.1, h: 0.13, story: 'lamp' });
  W({ x: -0.235, y: 0.76, w: 0.075, h: 0.13, story: 'plant', box: true });
  W({ x: -0.085, y: 0.76, w: 0.075, h: 0.13, story: 'reader' });
  W({ x: -0.235, y: 1.1, w: 0.075, h: 0.12, story: 'curtain' });
  W({ x: -0.085, y: 1.1, w: 0.075, h: 0.12, story: 'cat', shutters: '#3e6b5e' });
  W({ x: -0.16, y: 1.47, w: 0.07, h: 0.07, shape: 'round', story: 'none' });

  // ── right half ──
  // lavender house with a mansard roof
  if (C) {
    shape(ctx, [0, 0, 0, 1.35, 0.4, 1.35, 0.4, 0], HOUSE.lavender, px);
    roof(ctx, [0, 1.35, 0.045, 1.5, 0.355, 1.5, 0.4, 1.35], ROOF, px);
    shape(ctx, [-0.005, 1.33, -0.005, 1.365, 0.405, 1.365, 0.405, 1.33], '#e1d7f0', px, { courses: 0, shade: 0 });
    door(ctx, 0.1, 0.1, 0.25, '#5b3d63', px);
  }
  W({ x: 0.29, y: 0.18, w: 0.11, h: 0.15, story: 'lamp' });
  W({ x: 0.1, y: 0.73, w: 0.08, h: 0.14, shape: 'arch', story: 'reader', box: true });
  W({ x: 0.29, y: 0.73, w: 0.08, h: 0.14, shape: 'arch', story: 'plant' });
  W({ x: 0.1, y: 1.1, w: 0.075, h: 0.12, story: 'cat' });
  W({ x: 0.29, y: 1.1, w: 0.075, h: 0.12, story: 'curtain', shutters: '#6b5a96' });
  W({ x: 0.2, y: 1.42, w: 0.05, h: 0.05, shape: 'round', story: 'none' });

  // teal house with a balcony (kept narrow: the bridge folds down just beyond it)
  if (C) {
    shape(ctx, [0.4, 0, 0.4, 1.12, 0.56, 1.3, 0.72, 1.12, 0.72, 0], HOUSE.teal, px);
    ctx.strokeStyle = ROOF;
    ctx.lineWidth = 0.024;
    ctx.beginPath();
    ctx.moveTo(0.39, 1.105);
    ctx.lineTo(0.56, 1.31);
    ctx.lineTo(0.73, 1.105);
    ctx.stroke();
    door(ctx, 0.64, 0.09, 0.24, '#7a4a3a', px);
    ctx.strokeStyle = '#2d2b52';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(0.45, 0.62);
    ctx.lineTo(0.67, 0.62);
    ctx.moveTo(0.45, 0.56);
    ctx.lineTo(0.67, 0.56);
    for (let x = 0.45; x <= 0.67; x += 0.022) {
      ctx.moveTo(x, 0.56);
      ctx.lineTo(x, 0.62);
    }
    ctx.stroke();
    flowerBox(ctx, 0.56, 0.585, 0.22, px);
  }
  W({ x: 0.48, y: 0.17, w: 0.09, h: 0.13, story: 'plant' });
  W({ x: 0.56, y: 0.71, w: 0.1, h: 0.2, shape: 'arch', story: 'couple' });
  W({ x: 0.56, y: 1.0, w: 0.07, h: 0.1, story: 'none', shutters: '#3e6b5e' });
}

function paintWall(ctx, mode, px) {
  if (mode !== 'color') return;
  const d = BRIDGE.depth / 2;
  const h = BRIDGE.h - 0.008; // the die-cut border then ends just under the deck
  const arch = (c) => {
    c.beginPath();
    c.moveTo(-0.29, -0.01);
    c.lineTo(-0.29, 0.1);
    c.ellipse(0, 0.1, 0.29, 0.235, 0, PI, 0, true);
    c.lineTo(0.29, -0.01);
    c.closePath();
  };
  shape(ctx, [-d, 0, -d, h, d, h, d, 0], '#8088ae', px, { courses: 0, shade: 0.25 });
  ctx.save();
  poly(ctx, [-d, 0, -d, h, d, h, d, 0]);
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,28,70,0.3)';
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath();
  for (let y = 0.05, r = 0; y < h; y += 0.05, r++) {
    ctx.moveTo(-d, y);
    ctx.lineTo(d, y);
    for (let x = -d + (r % 2) * 0.05; x < d; x += 0.1) {
      ctx.moveTo(x, y - 0.05);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  // voussoirs
  ctx.lineWidth = 0.045;
  ctx.strokeStyle = '#a3abcc';
  ctx.beginPath();
  ctx.ellipse(0, 0.1, 0.315, 0.26, 0, PI, 0, true);
  ctx.stroke();
  ctx.lineWidth = 1.4 * px;
  ctx.strokeStyle = 'rgba(30,28,70,0.45)';
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = PI - (i / 12) * PI;
    ctx.moveTo(Math.cos(a) * 0.29, 0.1 + Math.sin(a) * 0.235);
    ctx.lineTo(Math.cos(a) * 0.34, 0.1 + Math.sin(a) * 0.285);
  }
  ctx.stroke();
  shape(ctx, [-0.03, 0.33, -0.024, 0.375, 0.024, 0.375, 0.03, 0.33], '#c3c7e0', px, { courses: 0, shade: 0 });
  // ivy tumbling over one side
  ctx.fillStyle = '#3f6e5c';
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    blob(ctx, -d + 0.05 + Math.sin(t * 7) * 0.025, h - t * 0.3, 0.018, 0.012, t * 3);
  }
  ctx.fill();
  ctx.restore();
  shape(ctx, [-d - 0.01, h - 0.035, -d - 0.01, h, d + 0.01, h, d + 0.01, h - 0.035], '#a9afd0', px, { courses: 0, shade: 0 });
  // cut the arch out of the paper
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  arch(ctx);
  ctx.fill();
  ctx.restore();
  arch(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4 * px;
  ctx.stroke();
}

function paintDeck(ctx, mode, px, w, d) {
  if (mode !== 'color') return;
  // card units: x across the bridge (spread x), y along it (spread −z)
  const R = makeRng(77);
  ctx.fillStyle = '#8f88aa';
  ctx.fillRect(-w / 2, -d / 2, w, d);
  ctx.beginPath();
  for (let y = -d / 2 + 0.02, r = 0; y < d / 2; y += 0.034, r++) {
    for (let x = -w / 2 + 0.07 + (r % 2) * 0.02; x < w / 2 - 0.06; x += 0.042) blob(ctx, x + R.range(-0.004, 0.004), y, 0.017, 0.013);
  }
  ctx.fillStyle = '#a49dbd';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,26,64,0.35)';
  ctx.lineWidth = 1.2 * px;
  ctx.stroke();
  for (const s of [-1, 1]) shape(ctx, [s * w / 2, -d / 2, s * w / 2, d / 2, s * (w / 2 - 0.05), d / 2, s * (w / 2 - 0.05), -d / 2], '#b7b0cf', px, { courses: 0, shade: 0, rim: 'rgba(0,0,0,0)' });
  poly(ctx, [-w / 2, -d / 2, -w / 2, d / 2, w / 2, d / 2, w / 2, -d / 2]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4 * px;
  ctx.stroke();
}

function paintRailing(ctx, mode, px, win, lamps) {
  const C = mode === 'color';
  const x0 = -0.185;
  const x1 = 0.185;
  if (C) {
    shape(ctx, [x0, 0, x0, 0.02, x1, 0.02, x1, 0], '#a9afd0', px, { courses: 0, shade: 0 });
    shape(ctx, [x0, 0.1, x0, 0.125, x1, 0.125, x1, 0.1], '#b9bed9', px, { courses: 0, shade: 0 });
    for (let x = x0 + 0.03; x < x1 - 0.02; x += 0.036) {
      ctx.beginPath();
      ctx.moveTo(x - 0.007, 0.02);
      ctx.quadraticCurveTo(x - 0.017, 0.05, x - 0.006, 0.075);
      ctx.lineTo(x - 0.004, 0.1);
      ctx.lineTo(x + 0.004, 0.1);
      ctx.lineTo(x + 0.006, 0.075);
      ctx.quadraticCurveTo(x + 0.017, 0.05, x + 0.007, 0.02);
      ctx.closePath();
      ctx.fillStyle = '#9aa1c6';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4 * px;
      ctx.stroke();
    }
  }
  if (!lamps) return;
  for (const x of [-RAIL_LAMP.x, RAIL_LAMP.x]) {
    if (C) {
      shape(ctx, [x - 0.018, 0, x - 0.018, 0.14, x - 0.008, 0.15, x - 0.008, 0.26, x + 0.008, 0.26, x + 0.008, 0.15, x + 0.018, 0.14, x + 0.018, 0],
        '#3c3a66', px, { courses: 0, shade: 0 });
      shape(ctx, [x - 0.03, 0.335, x, 0.36, x + 0.03, 0.335], '#3c3a66', px, { courses: 0, shade: 0 });
    }
    win({ x, y: RAIL_LAMP.y, w: 0.045, h: 0.07, shape: 'rect', kind: 'lamp' });
    if (C) {
      ctx.strokeStyle = '#3c3a66';
      ctx.lineWidth = 3 * px;
      ctx.strokeRect(x - 0.0225, RAIL_LAMP.y - 0.035, 0.045, 0.07);
    }
  }
}

function paintPost(ctx, mode, px, win) {
  const C = mode === 'color';
  const iron = '#35335e';
  if (C) {
    // a sleeping cat curled at the foot of the lamp
    ctx.beginPath();
    blob(ctx, 0.085, 0.035, 0.06, 0.035);
    blob(ctx, 0.13, 0.05, 0.025, 0.022);
    ctx.fillStyle = '#e09a55';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.122, 0.066);
    ctx.lineTo(0.128, 0.085);
    ctx.lineTo(0.136, 0.07);
    ctx.moveTo(0.142, 0.066);
    ctx.lineTo(0.15, 0.082);
    ctx.lineTo(0.153, 0.062);
    ctx.fillStyle = '#e09a55';
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#b06a35';
    ctx.lineWidth = 2.4 * px;
    ctx.beginPath();
    ctx.moveTo(0.04, 0.03);
    ctx.quadraticCurveTo(0.03, 0.0, 0.08, 0.008);
    ctx.stroke();
    shape(ctx, [-0.05, 0, -0.05, 0.03, -0.035, 0.05, -0.035, 0.1, -0.02, 0.12, -0.012, 0.12, -0.012, 0.7, 0.012, 0.7,
      0.012, 0.12, 0.02, 0.12, 0.035, 0.1, 0.035, 0.05, 0.05, 0.03, 0.05, 0], iron, px, { courses: 0, shade: 0 });
    // scrolled arm with a hanging flower basket
    ctx.strokeStyle = iron;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(0, 0.6);
    ctx.lineTo(-0.12, 0.6);
    ctx.arc(-0.12, 0.575, 0.025, PI / 2, PI * 1.6, false);
    ctx.stroke();
    ctx.lineWidth = 1.4 * px;
    ctx.beginPath();
    ctx.moveTo(-0.13, 0.6);
    ctx.lineTo(-0.16, 0.5);
    ctx.moveTo(-0.13, 0.6);
    ctx.lineTo(-0.1, 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.13, 0.5, 0.045, PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = '#7a4a3a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
    const R = makeRng(5);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      blob(ctx, -0.13 + R.range(-0.05, 0.05), 0.5 + R.range(-0.035, 0.015), 0.012, 0.012);
      ctx.fillStyle = i < 6 ? '#4f7d5e' : R.pick(['#f08aa0', '#ffd06a', '#f4f0e6', '#e86a5a']);
      ctx.fill();
    }
    // lantern head
    shape(ctx, [-0.045, 0.7, -0.03, 0.72, 0.03, 0.72, 0.045, 0.7], iron, px, { courses: 0, shade: 0 });
    shape(ctx, [-0.06, 0.85, 0, 0.895, 0.06, 0.85], iron, px, { courses: 0, shade: 0 });
    shape(ctx, [-0.008, 0.89, -0.008, 0.905, 0.008, 0.905, 0.008, 0.89], iron, px, { courses: 0, shade: 0 });
  }
  win({ x: 0, y: POST.lamp, w: 0.09, h: 0.13, shape: 'rect', kind: 'lamp' });
  if (C) {
    ctx.strokeStyle = iron;
    ctx.lineWidth = 4 * px;
    ctx.strokeRect(-0.045, POST.lamp - 0.065, 0.09, 0.13);
    ctx.beginPath();
    ctx.moveTo(0, POST.lamp - 0.065);
    ctx.lineTo(0, POST.lamp + 0.065);
    ctx.stroke();
  }
}

// ----------------------------------------------------------------------------------------------
// Page art (both pages are painted from one spread painter so the canal runs on over the gutter)
// ----------------------------------------------------------------------------------------------

/** Uniform Catmull-Rom through 2-D points (x increasing) → dense polyline. */
function catmull(points, per) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(points[n - 1].slice());
  return out;
}

const CANAL_LINE = catmull(CANAL, 18);
const CANAL_BANKS = CANAL_LINE.map((p, i) => {
  const a = CANAL_LINE[Math.max(0, i - 1)];
  const b = CANAL_LINE[Math.min(CANAL_LINE.length - 1, i + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / len;
  const nz = (b[0] - a[0]) / len;
  return { far: [p[0] - nx * CANAL_HALF, p[1] - nz * CANAL_HALF], near: [p[0] + nx * CANAL_HALF, p[1] + nz * CANAL_HALF] };
});

function canalZ(x) {
  for (let i = 1; i < CANAL_LINE.length; i++) {
    const a = CANAL_LINE[i - 1];
    const b = CANAL_LINE[i];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return CANAL_LINE[CANAL_LINE.length - 1][1];
}

function bankPath(ctx, which, offset = 0) {
  ctx.beginPath();
  CANAL_BANKS.forEach((b, i) => {
    const p = b[which];
    if (i === 0) ctx.moveTo(p[0], p[1] + offset);
    else ctx.lineTo(p[0], p[1] + offset);
  });
}

function canalPath(ctx) {
  ctx.beginPath();
  CANAL_BANKS.forEach((b, i) => (i ? ctx.lineTo(b.far[0], b.far[1]) : ctx.moveTo(b.far[0], b.far[1])));
  for (let i = CANAL_BANKS.length - 1; i >= 0; i--) ctx.lineTo(CANAL_BANKS[i].near[0], CANAL_BANKS[i].near[1]);
  ctx.closePath();
}

function warmPool(ctx, x, z, r, a = 0.32) {
  const g = ctx.createRadialGradient(x, z, 0, x, z, r);
  g.addColorStop(0, `rgba(255,196,112,${a})`);
  g.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, z - r, 2 * r, 2 * r);
}

/** Soft horizontal dash for painted reflections. */
function dash(ctx, x, z, len, thick, rgb, a) {
  const g = ctx.createRadialGradient(x, z, 0, x, z, len / 2);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.translate(x, z);
  ctx.scale(1, thick / len);
  ctx.translate(-x, -z);
  ctx.fillStyle = g;
  ctx.fillRect(x - len / 2, z - len / 2, len, len);
  ctx.restore();
}

/** Reflection streaks on the canal (used both on the printed page and on the additive overlay). */
function paintReflections(ctx, lights, R, strength) {
  ctx.save();
  canalPath(ctx);
  ctx.clip();
  for (const L of lights) {
    const zc = canalZ(L.x);
    const z0 = zc - CANAL_HALF + 0.05 + (L.near ? CANAL_HALF : 0);
    const n = L.moon ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const z = z0 + i * (L.moon ? 0.055 : 0.05) + R.range(-0.01, 0.01);
      const a = strength * L.a * (1 - i / (n + 1));
      dash(ctx, L.x + R.range(-0.02, 0.02), z, L.len * R.range(0.7, 1.25), 0.022, L.rgb, a);
    }
  }
  ctx.restore();
}

function paintSpreadArt(ctx, side, rowWindows, R) {
  const X0 = side === 'left' ? -3 : 0;
  const px = 1 / 256;
  ctx.setTransform(256, 0, 0, 256, -X0 * 256, 512);
  // cobbles everywhere
  ctx.fillStyle = '#6f6990';
  ctx.fillRect(-3, -2, 6, 4);
  const cobble = ['#857ea6', '#7c769e', '#8d87ad'];
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let z = -2, r = 0; z < 2.02; z += 0.052, r++) {
      for (let x = -3 + (r % 2) * 0.034; x < 3.02; x += 0.068) {
        if (((r * 7 + Math.round(x * 50)) % 3 + 3) % 3 !== k) continue;
        blob(ctx, x + R.range(-0.006, 0.006), z + R.range(-0.004, 0.004), 0.028, 0.02);
      }
    }
    ctx.fillStyle = cobble[k];
    ctx.fill();
  }
  // street lamps' warm pools on the cobbles
  for (const [x, z, r] of [[-1.0, -0.85, 0.45], [-2.3, -1.15, 0.4], [1.25, -0.9, 0.5], [2.45, -1.35, 0.4], [-2.0, 1.66, 0.55],
    [1.3, 0.75, 0.38], [-0.25, -0.3, 0.5], [0.95, -0.25, 0.35]]) warmPool(ctx, x, z, r);
  // the far strip behind the skyline: in its shadow
  ctx.fillStyle = 'rgba(30,26,66,0.55)';
  for (const s of [-1, 1]) {
    poly(ctx, [0, -2.05, 0, SKY.z0, s * SKY.half * SG, SKY.z0 + SKY.half * Math.cos(GAMMA), s * 3.05, SKY.z0 + 3.05 * Math.cos(GAMMA) / SG, s * 3.05, -2.05]);
    ctx.fill();
  }
  // quays: big slabs along both banks
  for (const [which, off] of [['far', -0.36], ['near', 0.3]]) {
    ctx.beginPath();
    CANAL_BANKS.forEach((b, i) => (i ? ctx.lineTo(b[which][0], b[which][1]) : ctx.moveTo(b[which][0], b[which][1])));
    for (let i = CANAL_BANKS.length - 1; i >= 0; i--) ctx.lineTo(CANAL_BANKS[i][which][0], CANAL_BANKS[i][which][1] + off);
    ctx.closePath();
    ctx.fillStyle = '#9890b6';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,34,80,0.32)';
    ctx.lineWidth = 1.3 * px;
    ctx.beginPath();
    for (let x = -3.2, c = 0; x < 3.2; x += 0.16, c++) {
      const z = canalZ(x) + (which === 'far' ? -CANAL_HALF : CANAL_HALF);
      for (let k = 0; k < 4; k++) {
        const zz = z + (Math.sign(off) * k * Math.abs(off)) / 3.2;
        ctx.moveTo(x, zz);
        ctx.lineTo(x + 0.16, zz);
        ctx.moveTo(x + ((c + k) % 2) * 0.08, zz);
        ctx.lineTo(x + ((c + k) % 2) * 0.08, zz + (Math.sign(off) * Math.abs(off)) / 3.2);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  // the canal: deep at the far bank, lighter toward the reader
  canalPath(ctx);
  const water = ctx.createLinearGradient(0, -0.3, 0, 1.6);
  water.addColorStop(0, '#2c5689');
  water.addColorStop(1, '#4a7fb5');
  ctx.fillStyle = water;
  ctx.fill();
  ctx.save();
  canalPath(ctx);
  ctx.clip();
  bankPath(ctx, 'far', 0.035);
  ctx.strokeStyle = 'rgba(14,24,62,0.45)';
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.lineWidth = 0.007;
  for (let i = 0; i < 420; i++) {
    const x = R.range(-3.2, 3.2);
    const z = canalZ(x) + R.range(-0.8, 0.85) * CANAL_HALF;
    const len = R.range(0.05, 0.15);
    ctx.strokeStyle = R.chance(0.6) ? `rgba(170,205,240,${R.range(0.25, 0.6)})` : 'rgba(16,34,84,0.35)';
    ctx.beginPath();
    ctx.moveTo(x - len / 2, z);
    ctx.quadraticCurveTo(x, z - 0.012, x + len / 2, z);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(236,240,255,0.85)';
  for (let i = 0; i < 70; i++) {
    const x = R.range(-3.2, 3.2);
    ctx.beginPath();
    blob(ctx, x, canalZ(x) + R.range(-0.8, 0.8) * CANAL_HALF, R.range(0.005, 0.011), R.range(0.004, 0.008));
    ctx.fill();
  }
  // printed shadow of the bridge on the water (the lamp is up to the left)
  const bz0 = canalZ(1.3) - CANAL_HALF - 0.05;
  const g = ctx.createLinearGradient(BRIDGE.x1, 0, BRIDGE.x2 + 0.2, 0);
  g.addColorStop(0, 'rgba(14,18,52,0.55)');
  g.addColorStop(0.75, 'rgba(14,18,52,0.5)');
  g.addColorStop(1, 'rgba(14,18,52,0)');
  ctx.fillStyle = g;
  ctx.fillRect(BRIDGE.x1, bz0, BRIDGE.x2 - BRIDGE.x1 + 0.2, 2 * CANAL_HALF + 0.1);
  ctx.restore();
  paintReflections(ctx, reflectionLights(rowWindows), R, 0.55);
  // bank edges: light coping stones with an ink line on the water side
  for (const which of ['far', 'near']) {
    bankPath(ctx, which);
    ctx.strokeStyle = '#c9c2dc';
    ctx.lineWidth = 0.034;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,34,80,0.45)';
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath();
    CANAL_BANKS.forEach((b, i) => {
      if (i % 3) return;
      const p = b[which];
      ctx.moveTo(p[0], p[1] - 0.017);
      ctx.lineTo(p[0], p[1] + 0.017);
    });
    ctx.stroke();
    bankPath(ctx, which, which === 'far' ? 0.017 : -0.017);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * px;
    ctx.stroke();
  }
  // a lane over the bridge, back into the city and toward the reader
  ctx.fillStyle = 'rgba(190,182,216,0.22)';
  ctx.strokeStyle = 'rgba(205,198,228,0.6)';
  ctx.lineWidth = 0.014;
  for (const [z0, z1] of [[-1.35, canalZ(1.3) - CANAL_HALF - 0.36], [canalZ(1.3) + CANAL_HALF + 0.3, 2]]) {
    ctx.fillRect(BRIDGE.x1 + 0.03, z0, BRIDGE.x2 - BRIDGE.x1 - 0.06, z1 - z0);
    ctx.beginPath();
    for (const x of [BRIDGE.x1 + 0.03, BRIDGE.x2 - 0.03]) {
      ctx.moveTo(x, z0);
      ctx.lineTo(x, z1);
    }
    ctx.stroke();
  }
  // mooring bollards
  for (const [x, which] of [[-2.25, 'far'], [-1.55, 'far'], [-0.35, 'far'], [0.4, 'far'], [2.05, 'far'], [2.7, 'far'],
    [-2.6, 'near'], [-1.65, 'near'], [-0.8, 'near'], [0.3, 'near'], [2.2, 'near']]) {
    const z = canalZ(x) + (which === 'far' ? -CANAL_HALF - 0.05 : CANAL_HALF + 0.05);
    ctx.beginPath();
    ctx.arc(x, z, 0.022, 0, PI * 2);
    ctx.fillStyle = '#34315a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.006, z - 0.006, 0.008, 0, PI * 2);
    ctx.fillStyle = '#8c88b4';
    ctx.fill();
  }
  // a moored rowboat by the near bank (right page)
  ctx.save();
  ctx.translate(2.5, canalZ(2.5) + 0.17);
  ctx.rotate(-0.08);
  ctx.beginPath();
  ctx.moveTo(-0.24, 0);
  ctx.quadraticCurveTo(-0.12, -0.08, 0.16, -0.06);
  ctx.quadraticCurveTo(0.25, -0.03, 0.27, 0);
  ctx.quadraticCurveTo(0.25, 0.03, 0.16, 0.06);
  ctx.quadraticCurveTo(-0.12, 0.08, -0.24, 0);
  ctx.fillStyle = '#b4573f';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.0, 0, 0.19, 0.04, 0, 0, PI * 2);
  ctx.fillStyle = '#e0c294';
  ctx.fill();
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(-0.09, -0.045, 0.03, 0.09);
  ctx.fillRect(0.06, -0.045, 0.03, 0.09);
  ctx.restore();
  // crates and barrels on the far quay, a bench and flower tubs on the near quay
  const crate = (x, z, s) => {
    ctx.fillStyle = '#9a7552';
    ctx.fillRect(x - s / 2, z - s / 2, s, s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6 * px;
    ctx.strokeRect(x - s / 2, z - s / 2, s, s);
    ctx.beginPath();
    ctx.moveTo(x - s / 2, z - s / 2);
    ctx.lineTo(x + s / 2, z + s / 2);
    ctx.stroke();
  };
  crate(-2.62, 0.62, 0.09);
  crate(-2.5, 0.6, 0.075);
  for (const [x, z] of [[-2.38, 0.56], [-2.0, 0.42]]) {
    ctx.beginPath();
    ctx.arc(x, z, 0.04, 0, PI * 2);
    ctx.fillStyle = '#8a5e40';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, z, 0.026, 0, PI * 2);
    ctx.strokeStyle = 'rgba(30,20,20,0.5)';
    ctx.stroke();
  }
  ctx.fillStyle = '#6e5476';
  ctx.fillRect(-1.38, 1.4, 0.3, 0.05);
  ctx.fillRect(-1.38, 1.47, 0.3, 0.025);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6 * px;
  ctx.strokeRect(-1.38, 1.4, 0.3, 0.05);
  for (const [x, z] of [[-0.55, 1.12], [0.62, 0.9], [-2.75, 1.7], [2.75, 0.95], [-1.95, -0.62], [-0.55, -0.42], [0.3, -0.33]]) {
    ctx.beginPath();
    ctx.arc(x, z, 0.04, 0, PI * 2);
    ctx.fillStyle = '#9a5a44';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) blob(ctx, x + R.range(-0.025, 0.025), z + R.range(-0.025, 0.025), 0.014, 0.014);
    ctx.fillStyle = '#4f7d5e';
    ctx.fill();
    ctx.fillStyle = R.pick(['#f08aa0', '#ffd06a', '#f4f0e6']);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) blob(ctx, x + R.range(-0.02, 0.02), z + R.range(-0.02, 0.02), 0.007, 0.007);
    ctx.fill();
  }
  // a cat curled up on the near quay (right page)
  ctx.beginPath();
  blob(ctx, 0.78, canalZ(0.78) + CANAL_HALF + 0.14, 0.05, 0.035, 0.3);
  blob(ctx, 0.82, canalZ(0.78) + CANAL_HALF + 0.17, 0.022, 0.02);
  ctx.fillStyle = '#3a3654';
  ctx.fill();
  // a fountain in the square behind the right quay
  ctx.beginPath();
  ctx.arc(2.15, -1.05, 0.24, 0, PI * 2);
  ctx.fillStyle = '#c4bdd8';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2.15, -1.05, 0.2, 0, PI * 2);
  ctx.fillStyle = '#41709f';
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,220,250,0.7)';
  ctx.lineWidth = 1.5 * px;
  for (const r of [0.06, 0.11, 0.16]) {
    ctx.beginPath();
    ctx.arc(2.15, -1.05, r, 0, PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(2.15, -1.05, 0.035, 0, PI * 2);
  ctx.fillStyle = '#c4bdd8';
  ctx.fill();
  // page frame: a fine double rule along the outer edges, with little stars at the corners
  ctx.strokeStyle = 'rgba(232,206,140,0.75)';
  const s = side === 'left' ? -1 : 1;
  for (const inset of [0.07, 0.1]) {
    ctx.lineWidth = (inset < 0.08 ? 2.2 : 1.2) * px;
    ctx.beginPath();
    ctx.moveTo(0, -2 + inset);
    ctx.lineTo(s * (3 - inset), -2 + inset);
    ctx.lineTo(s * (3 - inset), 2 - inset);
    ctx.lineTo(0, 2 - inset);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(240,214,150,0.9)';
  for (const z of [-1.915, 1.915]) {
    const x = s * 2.915;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.014 : 0.035;
      const a = (i / 10) * PI * 2 - PI / 2;
      ctx.lineTo(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Warm/pale light sources that get painted reflections on the canal. */
function reflectionLights(rowWindows) {
  const lights = [];
  const seen = new Set();
  for (const w of rowWindows) {
    if (w.kind === 'dark') continue;
    const x = Math.round(w.x * SG * 20) / 20;
    if (seen.has(x)) continue;
    seen.add(x);
    lights.push({ x, len: 0.07, rgb: '255,196,104', a: w.kind === 'quiet' ? 0.9 : 0.7 });
  }
  lights.push({ x: 1.9 * SG, len: 0.16, rgb: '232,236,255', a: 0.75, moon: true });
  lights.push({ x: -POST.x, len: 0.12, rgb: '255,204,120', a: 0.9, near: true });
  lights.push({ x: BRIDGE.x1 - 0.02, len: 0.08, rgb: '255,204,120', a: 0.6, near: true });
  lights.push({ x: BRIDGE.x2 + 0.02, len: 0.08, rgb: '255,204,120', a: 0.6, near: true });
  return lights;
}

// ----------------------------------------------------------------------------------------------
// Shaders
// ----------------------------------------------------------------------------------------------

const BYTE_TIME = (LIGHT_TO - LIGHT_FROM) / 233;

/** Emissive gate for night cards: one byte per window in uOrder decides when (if) it glows. */
const WINDOW_GLSL = /* glsl */ `
#include <emissivemap_fragment>
{
  float ord = floor(texture2D(uOrder, vEmissiveMapUv).r * 255.0 + 0.5);
  float on = 0.0;
  if (ord > 254.5) on = uQuiet;
  else if (ord > 20.5) {
    float T = ${LIGHT_FROM.toFixed(1)} + (ord - 21.0) * ${BYTE_TIME.toFixed(6)};
    float x = clamp((uTime - T) / 0.35, 0.0, 1.0);
    on = x * (1.0 + 0.8 * exp(-max(uTime - T - 0.25, 0.0) * 2.2));
    on *= 0.9 + 0.1 * sin(uTime * (1.1 + fract(ord * 0.618) * 2.6) + ord);
  } else if (ord > 3.5) on = 0.92 + 0.08 * sin(uTime * (1.3 + fract(ord * 0.618) * 2.2) + ord * 2.1);
  else if (ord > 0.5) on = 1.0;
  totalEmissiveRadiance *= on * uOpen;
}`;

const GLOW_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aSize;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xy += aCorner * aSize;
  mv.z += aSize * 0.5; // pull the quad toward the camera so it clears the surface behind it
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vColor = aColor;
}`;

const GLOW_FRAG = /* glsl */ `
uniform float uSparkle;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 p = vUv * 2.0;
  float r2 = dot(p, p);
  float g = exp(-r2 * 7.0) * 0.55 + exp(-r2 * 40.0) * 0.8;
  if (uSparkle > 0.5) {
    vec2 a = abs(p);
    g = exp(-r2 * 70.0) * 1.4 + (exp(-a.x * 45.0) * exp(-a.y * 5.0) + exp(-a.y * 45.0) * exp(-a.x * 5.0)) * 0.55 * (1.0 - min(r2, 1.0));
  }
  g *= smoothstep(1.0, 0.75, sqrt(r2));
  gl_FragColor = vec4(vColor.rgb * vColor.a * g, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLAT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const REFLECT_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uAmt;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * 170.0 + uTime * 1.9) * 0.0016 + sin(uv.y * 61.0 - uTime * 1.3) * 0.0011;
  vec3 c = texture2D(uMap, uv).rgb;
  float shimmer = 0.72 + 0.28 * sin(uTime * 2.3 + uv.y * 90.0 + uv.x * 25.0);
  gl_FragColor = vec4(c * uAmt * shimmer, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const POOL_FRAG = /* glsl */ `
uniform float uGlow;
uniform float uRing;
uniform float uRingAmt;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p * vec2(0.75, 1.0));
  float pool = exp(-d * d * 8.0) * uGlow;
  float ring = exp(-pow((d - uRing) * 16.0, 2.0)) * uRingAmt;
  ring += exp(-pow((d - uRing * 0.6) * 20.0, 2.0)) * uRingAmt * 0.5;
  gl_FragColor = vec4(uColor * (pool * 0.6 + ring * 0.42), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Monotone cubic (Fritsch–Carlson) through (xs, ys) with zero end slopes; clamps outside. */
function monotone(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ----------------------------------------------------------------------------------------------
// Spread module
// ----------------------------------------------------------------------------------------------

export default {
  id: 'city',
  title: 'The Lantern City',
  build({ THREE, paper, popup, rng }) {
    const group = new THREE.Group();
    group.name = 'city';
    const uni = { uTime: { value: 0 }, uQuiet: { value: 0 }, uOpen: { value: 1 } };
    const seed = () => rng.int(1, 1e9);

    // ── night cards: colour map + emissive map + per-window order map ──────────────────────
    function nightPiece({ w, h, ppu, x0, draw, border = NIGHT_PAPER, margin = 7 }) {
      const s = seed();
      const px = 1 / ppu;
      const W = Math.round(w * ppu);
      const H = Math.round(h * ppu);
      const { canvas, ctx } = paper.makeCanvas(W, H);
      layerTransform(ctx, ppu, x0, h);
      draw(ctx, 'color', px, (spec) => paintGlass(ctx, spec, px), makeRng(s));
      const art = paper.dieCut(canvas, { margin, color: border });
      paper.addGrain(art.getContext('2d'), W, H, { amount: 0.05, seed: s });
      const glow = paper.makeCanvas(W, H);
      glow.ctx.fillStyle = '#000';
      glow.ctx.fillRect(0, 0, W, H);
      layerTransform(glow.ctx, ppu, x0, h);
      const list = [];
      const onCard = (spec) => spec.x + spec.w / 2 > x0 && spec.x - spec.w / 2 < x0 + w;
      draw(glow.ctx, 'glow', px, (spec) => spec.kind !== 'dark' && onCard(spec) && list.push(spec), makeRng(s));
      for (const spec of list) paintSpill(glow.ctx, spec);
      for (const spec of list) paintPane(glow.ctx, spec, px);
      return {
        art,
        list,
        /** Builds the card once every window in `list` has its `order` byte. */
        finish({ anchor = 'bottom-center', back } = {}) {
          const os = ppu / 2;
          const ow = Math.ceil(W / 2);
          const oh = Math.ceil(H / 2);
          const o = paper.makeCanvas(ow, oh);
          o.ctx.fillStyle = '#000';
          o.ctx.fillRect(0, 0, ow, oh);
          const fill = (spec, r) => {
            const xa = Math.floor((spec.x - r.x - x0) * os - 1);
            const xb = Math.ceil((spec.x + r.x - x0) * os + 1);
            const ya = Math.floor((h - spec.y - r.y) * os - 1);
            const yb = Math.ceil((h - spec.y + r.y) * os + 1);
            o.ctx.fillStyle = `rgb(${spec.order},${spec.order},${spec.order})`;
            o.ctx.fillRect(xa, ya, xb - xa, yb - ya);
          };
          for (const spec of list) {
            const r = spillRadius(spec);
            fill(spec, { x: r, y: r });
          }
          for (const spec of list) fill(spec, { x: spec.w / 2, y: spec.h / 2 });
          const img = o.ctx.getImageData(0, 0, ow, oh).data;
          const data = new Uint8Array(ow * oh);
          for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) data[(oh - 1 - y) * ow + x] = img[(y * ow + x) * 4];
          const orderTex = new THREE.DataTexture(data, ow, oh, THREE.RedFormat, THREE.UnsignedByteType);
          orderTex.unpackAlignment = 1;
          orderTex.minFilter = THREE.NearestFilter;
          orderTex.magFilter = THREE.NearestFilter;
          orderTex.generateMipmaps = false;
          orderTex.needsUpdate = true;
          const card = paper.card({ canvas: art, width: w, height: h, anchor, back });
          const mat = card.userData.front.material;
          mat.emissive.setRGB(1, 1, 1);
          mat.emissiveMap = paper.texture(glow.canvas);
          mat.emissiveIntensity = 1.45;
          mat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, { uOrder: { value: orderTex }, uTime: uni.uTime, uQuiet: uni.uQuiet, uOpen: uni.uOpen });
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <emissivemap_pars_fragment>', '#include <emissivemap_pars_fragment>\nuniform sampler2D uOrder;\nuniform float uTime, uQuiet, uOpen;')
              .replace('#include <emissivemap_fragment>', WINDOW_GLSL);
          };
          mat.customProgramCacheKey = () => 'city-night-windows';
          mat.needsUpdate = true;
          return card;
        },
      };
    }

    const skyL = nightPiece({ w: SKY.half, h: SKY.height, ppu: SKY.ppu, x0: -SKY.half, draw: paintSkyline });
    const skyR = nightPiece({ w: SKY.half, h: SKY.height, ppu: SKY.ppu, x0: 0, draw: paintSkyline });
    const rowL = nightPiece({ w: ROW.halfL, h: ROW.height, ppu: ROW.ppu, x0: -ROW.halfL, draw: paintRow, border: '#f1ecf6' });
    const rowR = nightPiece({ w: ROW.halfR, h: ROW.height, ppu: ROW.ppu, x0: 0, draw: paintRow, border: '#f1ecf6' });
    const railF = nightPiece({ w: 0.4, h: 0.38, ppu: 900, x0: -0.2, draw: (c, m, p, win) => paintRailing(c, m, p, win, true) });
    const postP = nightPiece({ w: POST.w, h: POST.h, ppu: 900, x0: -POST.w / 2, draw: paintPost });

    // Lighting order: near windows one by one, evenly spaced 53→62 in a shuffled order; far windows
    // at random times (some already lit when the page opens); fixed bytes for the special lights.
    const byteAt = (T) => 21 + Math.round(((T - LIGHT_FROM) / (LIGHT_TO - LIGHT_FROM)) * 233);
    const all = [skyL, skyR, rowL, rowR, railF, postP].flatMap((p) => p.list);
    const near = [];
    for (const w of all) {
      if (w.kind === 'quiet') w.order = 255;
      else if (w.kind === 'clock') w.order = 1;
      else if (w.kind === 'moon') w.order = 2;
      else if (w.kind === 'lamp') w.order = 3;
      else if (w.kind === 'pre' || (w.far && rng.chance(0.3))) w.order = rng.int(4, 20);
      else if (w.far) w.order = byteAt(rng.range(LIGHT_FROM, LIGHT_TO - 2.5));
      else near.push(w);
    }
    for (let i = near.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [near[i], near[j]] = [near[j], near[i]];
    }
    near.forEach((w, i) => {
      w.order = i < 4 ? rng.int(4, 20) : byteAt(LIGHT_FROM + 0.2 + ((i - 4) / Math.max(1, near.length - 5)) * (LIGHT_TO - LIGHT_FROM - 0.3));
    });

    // ── page art ───────────────────────────────────────────────────────────────────────────
    const artSeed = seed();
    const rowWindows = [...rowL.list, ...rowR.list];
    const leftArt = paper.page((ctx) => paintSpreadArt(ctx, 'left', rowWindows, makeRng(artSeed)), { seed: artSeed, tint: '#7a7398' });
    const rightArt = paper.page((ctx) => paintSpreadArt(ctx, 'right', rowWindows, makeRng(artSeed)), { seed: artSeed + 1, tint: '#7a7398' });

    // ── mechanisms ─────────────────────────────────────────────────────────────────────────
    const sky = popup.vFold({ z0: SKY.z0, gamma: GAMMA, width: 2 * SKY.half, height: SKY.height });
    sky.left.add(skyL.finish({ anchor: 'bottom-right', back: '#cfc9e2' }));
    sky.right.add(skyR.finish({ anchor: 'bottom-left', back: '#cfc9e2' }));
    const row = popup.vFold({ z0: ROW.z0, gamma: GAMMA, width: 2 * ROW.halfL, height: ROW.height });
    row.left.add(rowL.finish({ anchor: 'bottom-right' }));
    row.right.add(rowR.finish({ anchor: 'bottom-left' }));

    const wallArt = paper.paint(Math.round(BRIDGE.depth * 900), Math.round(BRIDGE.h * 900), (ctx) => {
      layerTransform(ctx, 900, -BRIDGE.depth / 2, BRIDGE.h);
      paintWall(ctx, 'color', 1 / 900);
    }, { dieCut: 6, seed: seed() });
    // Each wall is one card printed on both faces; offsets are sub-millimetre stacking so that,
    // folded flat (walls outward, outer face down), walls lie on the page, the deck on the walls
    // and the railings on the deck.
    const wallCard = () => {
      const card = paper.card({ canvas: wallArt, width: BRIDGE.depth, height: BRIDGE.h });
      const { front, back } = card.userData;
      back.material = front.material.clone();
      back.material.side = THREE.BackSide;
      card.position.z = -0.0015;
      return card;
    };
    const deckLayer = popup.floatingLayer({ z: BRIDGE.z, width: 2 * BRIDGE.x1, height: BRIDGE.h, depth: BRIDGE.depth });
    const farLayer = popup.floatingLayer({ z: BRIDGE.z, width: 2 * BRIDGE.x2, height: BRIDGE.h, depth: BRIDGE.depth });
    deckLayer.supports.right.add(wallCard());
    farLayer.supports.right.add(wallCard());
    const deckW = BRIDGE.x2 - BRIDGE.x1 + 0.08;
    const deckD = BRIDGE.depth + 0.02;
    const deck = paper.card({
      canvas: paper.paint(Math.round(deckW * 600), Math.round(deckD * 600), (ctx) => {
        layerTransform(ctx, 600, -deckW / 2, deckD / 2);
        paintDeck(ctx, 'color', 1 / 600, deckW, deckD);
      }, { dieCut: 0, seed: seed() }),
      width: deckW,
      height: deckD,
      anchor: 'center',
      back: '#bcb6d4',
    });
    deck.rotation.x = -PI / 2;
    deck.position.set((BRIDGE.x1 + BRIDGE.x2) / 2, 0.0048, 0);
    deckLayer.right.add(deck);
    const railFront = popup.standUp({ side: 'right', x: (BRIDGE.x1 + BRIDGE.x2) / 2, z: BRIDGE.z + BRIDGE.depth / 2 - 0.015, fold: 'back' });
    const railBack = popup.standUp({ side: 'right', x: (BRIDGE.x1 + BRIDGE.x2) / 2, z: BRIDGE.z - BRIDGE.depth / 2 + 0.015, fold: 'front' });
    deckLayer.add(railFront, railBack);
    const railFrontCard = railF.finish({ back: '#bcb6d4' });
    const railBackCard = paper.card({
      canvas: paper.paint(360, 140, (ctx) => {
        layerTransform(ctx, 900, -0.2, 0.155);
        paintRailing(ctx, 'color', 1 / 900, () => {}, false);
      }, { dieCut: 6, seed: seed() }),
      width: 0.4,
      height: 0.155,
      back: '#bcb6d4',
    });
    railFrontCard.position.set(0, 0.006, 0.008); // folds 'back': printed face up when flat
    railBackCard.position.set(0, 0.006, -0.008); // folds 'front': printed face down when flat
    railFront.mount.add(railFrontCard);
    railBack.mount.add(railBackCard);

    const post = popup.standUp({ side: 'left', x: POST.x, z: POST.z, fold: 'back', width: POST.w, height: POST.h });
    post.mount.add(postP.finish({ back: '#bcb6d4' }));

    // shimmering reflections on the canal (additive overlays lying on the pages)
    const reflSeed = seed();
    const overlay = (side) => {
      const { canvas, ctx } = paper.makeCanvas(384, 512);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 384, 512);
      ctx.setTransform(128, 0, 0, 128, side === 'left' ? 384 : 0, 256);
      paintReflections(ctx, reflectionLights(rowWindows), makeRng(reflSeed), 1);
      ctx.fillStyle = 'rgba(220,230,255,0.9)';
      const R = makeRng(reflSeed + 1);
      for (let i = 0; i < 60; i++) {
        const x = R.range(-3, 3);
        ctx.beginPath();
        blob(ctx, x, canalZ(x) + R.range(-0.75, 0.75) * CANAL_HALF, 0.012, 0.006);
        ctx.fill();
      }
      const mech = popup.onPage({ side, x: 1.5, z: 0, lift: 0.0035 });
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: paper.texture(canvas) }, uTime: uni.uTime, uAmt: { value: 0 } },
        vertexShader: FLAT_VERT,
        fragmentShader: REFLECT_FRAG,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 4).rotateX(-PI / 2), mat);
      mesh.renderOrder = 1;
      mech.mount.add(mesh);
      return { mech, mat };
    };
    const reflL = overlay('left');
    const reflR = overlay('right');

    const mechs = popup.collection([sky, row, deckLayer, farLayer, post, reflL.mech, reflR.mech]);
    group.add(mechs.object);

    // ── the boat ───────────────────────────────────────────────────────────────────────────
    const boatRig = new THREE.Group();
    const bob = new THREE.Group();
    const boat = paper.boat({ scale: BOAT_SCALE });
    const boatMat = boat.children[0].material;
    boatMat.emissive.set('#ffb35a');
    boatMat.emissiveIntensity = 0;
    bob.add(boat);
    boatRig.add(bob);
    group.add(boatRig);
    const poolMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: { value: 0 }, uRing: { value: 0 }, uRingAmt: { value: 0 }, uColor: { value: new THREE.Color('#ffb866') } },
      vertexShader: FLAT_VERT,
      fragmentShader: POOL_FRAG,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-PI / 2), poolMat);
    pool.position.y = 0.004 - WATERLINE;
    pool.renderOrder = 2;
    boatRig.add(pool);
    const boatCurve = new THREE.CatmullRomCurve3(BOAT_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const boatParam = monotone(BOAT_TIMES, BOAT_KNOTS);
    const LAST = BOAT_PATH.length - 1;

    // ── the quiet light ────────────────────────────────────────────────────────────────────
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1cf').multiplyScalar(2.4) }));
    group.add(orb);
    const quietLight = new THREE.PointLight('#ffd49a', 0, 2.2, 2);
    const garlandLight = new THREE.PointLight('#ffad62', 0, 3.8, 2);
    group.add(quietLight, garlandLight);

    // ── lanterns on three strings ─────────────────────────────────────────────────────────
    // string ends in mount coordinates: [mount, x, y, z, frameOffset?]
    const STRINGS = [
      { a: [row.left, -0.83, 1.31, ARM], b: [row.right, 0.385, 1.33, ARM], arm: true, sag: 0.17, us: [0.2, 0.34, 0.48, 0.62, 0.76, 0.89] },
      { a: [row.left, -1.915, 1.16, 0.004], b: [post.mount, 0, POST.h - 0.03, 0.006], sag: 0.3, us: [0.14, 0.28, 0.42, 0.56, 0.7, 0.84] },
      { a: [row.right, 0.705, 1.1, 0.004], b: [railFront.mount, -RAIL_LAMP.x, 0.355, 0.006, deckLayer.frame], sag: 0.16, us: [0.2, 0.4, 0.6, 0.8] },
    ];
    const SEGS = 24;
    const armGeo = new THREE.CylinderGeometry(0.0055, 0.0075, ARM, 6).rotateX(PI / 2).translate(0, 0, ARM / 2);
    const armMat = new THREE.MeshStandardMaterial({ color: '#2b2843', roughness: 0.55, metalness: 0.3 });
    const arms = [STRINGS[0].a, STRINGS[0].b].map(([mount, x, y]) => {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(x, y, 0);
      arm.castShadow = true;
      mount.add(arm);
      return arm;
    });
    const lanternCount = STRINGS.reduce((n, s) => n + s.us.length, 0);
    const lanternTex = (() => {
      const { canvas, ctx } = paper.makeCanvas(64, 128);
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#fff3dc');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#ffe9c8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = 'rgba(120,60,30,0.35)';
      for (let y = 16; y < 112; y += 9) ctx.fillRect(0, y, 64, 2);
      ctx.fillStyle = '#2a2026';
      ctx.fillRect(0, 0, 64, 12);
      ctx.fillRect(0, 116, 64, 12);
      return paper.texture(canvas);
    })();
    const lanternGeo = new THREE.LatheGeometry([
      [0.012, -0.066], [0.022, -0.06], [0.034, -0.05], [0.043, -0.032], [0.047, -0.012],
      [0.047, 0.012], [0.043, 0.032], [0.034, 0.05], [0.022, 0.06], [0.012, 0.066],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 14);
    const lanterns = new THREE.InstancedMesh(lanternGeo, new THREE.MeshBasicMaterial({ map: lanternTex }), lanternCount);
    lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lanterns.frustumCulled = false;
    const LANTERN_COLORS = ['#ff5a3c', '#ff8a34', '#ffc04a', '#ff6a6a', '#ffd88a'];
    const lanternInfo = [];
    {
      let i = 0;
      for (let si = 0; si < STRINGS.length; si++) {
        const s = STRINGS[si];
        for (const u of s.us) {
          const c = new THREE.Color(rng.pick(LANTERN_COLORS)).multiplyScalar(1.5);
          lanterns.setColorAt(i, c);
          lanternInfo.push({ si, u, size: rng.range(0.8, 1.15), phase: rng.range(0, PI * 2), freq: rng.range(1.2, 1.9), color: c });
          i++;
        }
      }
    }
    group.add(lanterns);
    const stringPos = new Float32Array(STRINGS.length * SEGS * 2 * 3);
    const stringGeo = new THREE.BufferGeometry();
    stringGeo.setAttribute('position', new THREE.BufferAttribute(stringPos, 3).setUsage(THREE.DynamicDrawUsage));
    const strings = new THREE.LineSegments(stringGeo, new THREE.LineBasicMaterial({ color: '#8a7466', transparent: true, opacity: 0.85 }));
    strings.frustumCulled = false;
    group.add(strings);

    // ── glow quads: halos (lanterns, lamps, windows, moon, the quiet light) and stars ─────────
    function glowField(n, sparkle) {
      const pos = new Float32Array(n * 12);
      const corner = new Float32Array(n * 8);
      const size = new Float32Array(n * 4);
      const color = new Float32Array(n * 16);
      const index = [];
      const C4 = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
      for (let i = 0; i < n; i++) {
        corner.set(C4, i * 8);
        index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      }
      const geo = new THREE.BufferGeometry();
      const attr = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr(pos, 3));
      geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      geo.setAttribute('aSize', attr(size, 1));
      geo.setAttribute('aColor', attr(color, 4));
      geo.setIndex(index);
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uSparkle: { value: sparkle ? 1 : 0 } },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }));
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      return {
        mesh,
        set(i, v, s, c, a) {
          for (let k = i * 4; k < i * 4 + 4; k++) {
            pos[k * 3] = v.x;
            pos[k * 3 + 1] = v.y;
            pos[k * 3 + 2] = v.z;
            size[k] = s;
            color[k * 4] = c.r;
            color[k * 4 + 1] = c.g;
            color[k * 4 + 2] = c.b;
            color[k * 4 + 3] = a;
          }
        },
        commit() {
          geo.attributes.position.needsUpdate = true;
          geo.attributes.aSize.needsUpdate = true;
          geo.attributes.aColor.needsUpdate = true;
        },
      };
    }
    const HALO = { lantern: 0, post: lanternCount, rail: lanternCount + 1, orb: lanternCount + 3, trail: lanternCount + 4 };
    const TRAIL = 5;
    const fixedHalos = [
      // [mount, x, y, z, size, colour, strength]
      [sky.left, -0.62, 1.735, 0.03, 0.55, '#ffe4a8', 0.32],
      [sky.right, 1.86, 2.1, 0.05, 1.25, '#d8e0ff', 0.3],
      [sky.right, 0.19, 0.9, 0.03, 0.45, '#ffc770', 0.35],
    ];
    const QUIET_HALO = HALO.trail + TRAIL;
    const FIXED = QUIET_HALO + 1;
    const halos = glowField(FIXED + fixedHalos.length, false);
    group.add(halos.mesh);
    const haloColors = {
      lantern: lanternInfo.map((l) => l.color.clone().multiplyScalar(0.5)),
      lamp: new THREE.Color('#ffc274'),
      orb: new THREE.Color('#ffd28a'),
      quiet: new THREE.Color('#ffe3a6'),
      fixed: fixedHalos.map((f) => new THREE.Color(f[5])),
    };

    // stars behind the skyline (skyline mount coordinates), only where the sky shows
    const skyAlpha = [skyL, skyR].map((p) => p.art.getContext('2d').getImageData(0, 0, p.art.width, p.art.height));
    const starList = [];
    for (let tries = 0; starList.length < 78 && tries < 2000; tries++) {
      const half = rng.chance(0.5) ? 0 : 1;
      const x = (half ? 1 : -1) * rng.range(0.05, 2.75);
      const y = rng.range(1.15, 2.95);
      const img = skyAlpha[half];
      const u = half ? x / SKY.half : 1 + x / SKY.half;
      const ix = Math.round(u * (img.width - 1));
      const iy = Math.round((1 - y / SKY.height) * (img.height - 1));
      const inside = ix >= 0 && ix < img.width && iy >= 0 && iy < img.height;
      if (inside && img.data[(iy * img.width + ix) * 4 + 3] > 10) continue;
      if (half && Math.hypot(x - 1.9, y - 2.08) < 0.32) continue;
      const big = rng.chance(0.12);
      starList.push({
        mount: half ? sky.right : sky.left, x, y, z: -0.06,
        size: big ? rng.range(0.1, 0.14) : rng.range(0.035, 0.07),
        phase: rng.range(0, PI * 2), freq: rng.range(1.2, 3.4),
        color: new THREE.Color(rng.pick(['#fff6dc', '#dfe6ff', '#ffe9b8'])),
      });
    }
    const stars = glowField(starList.length, true);
    group.add(stars.mesh);

    // ── per-frame state (preallocated) ───────────────────────────────────────────────────
    const _v = new THREE.Vector3();
    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _qf = new THREE.Quaternion();
    const _m = new THREE.Matrix4();
    const _s = new THREE.Vector3();
    const _e = new THREE.Euler();
    const AXIS_Y = new THREE.Vector3(0, 1, 0);
    const AXIS_Z = new THREE.Vector3(0, 0, 1);
    const winPos = new THREE.Vector3();
    const winNormal = new THREE.Vector3();
    const bowPos = new THREE.Vector3();
    const orbPos = new THREE.Vector3();
    const trailPos = new THREE.Vector3();
    const ends = STRINGS.map(() => [new THREE.Vector3(), new THREE.Vector3()]);

    /** Mount-local point → spread frame (optionally through a translated floating-layer frame). */
    function fromMount(mount, x, y, z, out, frame) {
      out.set(x, y, z).applyQuaternion(mount.quaternion).add(mount.position);
      if (frame) out.add(frame.position);
      return out;
    }

    function stringPoint(i, u, t, out) {
      const s = STRINGS[i];
      out.lerpVectors(ends[i][0], ends[i][1], u);
      const bell = 4 * u * (1 - u);
      out.y -= s.sag * bell;
      out.z += Math.sin(t * 0.9 + i * 2.1) * 0.022 * bell;
      out.x += Math.sin(t * 0.7 + i) * 0.008 * bell;
      return out;
    }

    function boatPose(alpha, t) {
      const p = boatParam(t);
      boatCurve.getPoint(p / LAST, _p);
      boatCurve.getPoint(Math.min(LAST, p + 0.02) / LAST, _a);
      boatCurve.getPoint(Math.max(0, p - 0.02) / LAST, _b);
      let yaw = Math.atan2(-(_a.z - _b.z), _a.x - _b.x);
      const waiting = smoothstep(59.5, 60.5, t) * (1 - smoothstep(64.5, 65.5, t));
      yaw += Math.sin(t * 0.8) * 0.07 * waiting;
      boatRig.position.set(_p.x, WATERLINE, _p.z);
      boatRig.quaternion.setFromAxisAngle(AXIS_Y, yaw);
      if (_p.x < 0 && alpha < PI) {
        _qf.setFromAxisAngle(AXIS_Z, alpha - PI);
        boatRig.position.applyQuaternion(_qf);
        boatRig.quaternion.premultiply(_qf);
      }
      const land = seg(t, ORB_TO - 0.1, ORB_TO + 0.7);
      bob.position.y = Math.sin(t * 2.2) * 0.004 - Math.sin(PI * land) * 0.012;
      bob.rotation.set(Math.sin(t * 1.9) * 0.05 + Math.sin(PI * land) * 0.04, 0, Math.sin(t * 1.3 + 1) * 0.035);
      const vis = popup.rise(alpha, 0.3, 0.75);
      boat.scale.setScalar(BOAT_SCALE * Math.max(vis, 0.001));
      boatRig.visible = vis > 0.001;
      boatRig.updateMatrix();
      bob.updateMatrix();
      boat.updateMatrix();
      return vis;
    }

    function quietPath(t, out) {
      // From just in front of the window, out toward the reader, then down into the bow.
      const u = ease.inOutSine(seg(t, ORB_FROM, ORB_TO));
      const v = 1 - u;
      _a.copy(winPos).addScaledVector(winNormal, 0.42).add(_s.set(0.12, -0.12, 0));
      _b.copy(bowPos).add(_s.set(-0.28, 0.5, 0.12));
      out.copy(winPos).addScaledVector(winNormal, 0.04).multiplyScalar(v * v * v);
      out.addScaledVector(_a, 3 * v * v * u).addScaledVector(_b, 3 * v * u * u).addScaledVector(bowPos, u * u * u);
      const w = Math.sin(PI * u);
      out.x += Math.sin(u * PI * 2.6) * 0.06 * w;
      out.y += Math.sin(u * PI * 4) * 0.025 * w;
      out.z += Math.cos(u * PI * 2.2) * 0.04 * w;
      return out;
    }

    function update(alpha, t) {
      mechs.update(alpha);
      const open = popup.rise(alpha, 0.55, 0.95);
      const lightAmt = popup.rise(alpha, 0.4, 0.95);
      uni.uTime.value = t;
      uni.uOpen.value = 0.3 + 0.7 * popup.rise(alpha, 0.1, 0.85);

      // the quiet window: breathes, swells, lets its light go, keeps a faint glow
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.35);
      const swell = smoothstep(62.2, 62.9, t);
      const gone = smoothstep(ORB_FROM - 0.05, ORB_FROM + 0.9, t);
      uni.uQuiet.value = (0.42 + 0.2 * breathe + 0.75 * swell) * (1 - gone) + (0.08 + 0.03 * breathe) * gone;

      // windows' painted reflections come up as the city lights
      const lit = 0.35 + 0.65 * smoothstep(LIGHT_FROM, LIGHT_TO, t);
      const reflAmt = lit * popup.rise(alpha, 0.3, 0.9) * 0.9;
      reflL.mat.uniforms.uAmt.value = reflAmt;
      reflR.mat.uniforms.uAmt.value = reflAmt;

      // boat + the light it keeps
      const vis = boatPose(alpha, t);
      bowPos.set(ORB_BOW[0], ORB_BOW[1], ORB_BOW[2]).applyMatrix4(boat.matrix).applyMatrix4(bob.matrix).applyMatrix4(boatRig.matrix);
      fromMount(row.left, QUIET.x, QUIET.y, 0, winPos);
      winNormal.set(0, 0, 1).applyQuaternion(row.left.quaternion);
      const carried = smoothstep(ORB_TO - 0.15, ORB_TO + 0.6, t);
      const emerge = smoothstep(62.4, 63.1, t);
      if (t < ORB_FROM) orbPos.copy(winPos).addScaledVector(winNormal, 0.04);
      else if (t < ORB_TO) quietPath(t, orbPos);
      else orbPos.copy(bowPos);
      const orbVis = emerge * vis;
      orb.position.copy(orbPos);
      orb.scale.setScalar(Math.max(0.001, orbVis * (1 + 0.15 * Math.sin(t * 2.6) * carried)));
      orb.visible = orbVis > 0.001;
      boatMat.emissiveIntensity = 0.42 * carried * (0.85 + 0.15 * Math.sin(t * 2.6));
      poolMat.uniforms.uGlow.value = carried * vis * (0.8 + 0.2 * Math.sin(t * 2.6));
      const ring = seg(t, ORB_TO, ORB_TO + 1.8);
      poolMat.uniforms.uRing.value = 0.12 + ring * 0.85;
      poolMat.uniforms.uRingAmt.value = ring > 0 && ring < 1 ? (1 - ring) * vis : 0;
      // keep the little light's lamp a hand's width off nearby paper: a warm wash, never a hot spot
      const away = 0.32 * (1 - emerge) + 0.16;
      quietLight.position.copy(orbPos).addScaledVector(winNormal, away * (1 - carried)).add(_s.set(0, 0.16 * carried, 0.12 * carried));
      quietLight.intensity = lightAmt * (0.035 + 0.05 * uni.uQuiet.value * (1 - carried) + 0.09 * emerge + 0.05 * carried * (1 + 0.15 * Math.sin(t * 2.6)));

      // strings and lanterns
      for (let i = 0; i < STRINGS.length; i++) {
        const s = STRINGS[i];
        const reach = s.arm ? Math.max(open, 0.001) : 1;
        fromMount(s.a[0], s.a[1], s.a[2], s.a[3] * reach, ends[i][0], s.a[4]);
        fromMount(s.b[0], s.b[1], s.b[2], s.b[3] * reach, ends[i][1], s.b[4]);
        for (let k = 0; k < SEGS; k++) {
          stringPoint(i, k / SEGS, t, _a);
          stringPoint(i, (k + 1) / SEGS, t, _b);
          const o = (i * SEGS + k) * 6;
          stringPos[o] = _a.x;
          stringPos[o + 1] = _a.y;
          stringPos[o + 2] = _a.z;
          stringPos[o + 3] = _b.x;
          stringPos[o + 4] = _b.y;
          stringPos[o + 5] = _b.z;
        }
      }
      stringGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < arms.length; i++) {
        arms[i].scale.setScalar(Math.max(open, 0.001));
        arms[i].visible = open > 0.001;
      }
      strings.material.opacity = 0.85 * open;
      strings.visible = open > 0.001;
      for (let i = 0; i < lanternInfo.length; i++) {
        const L = lanternInfo[i];
        const si = L.si;
        stringPoint(si, L.u, t, _p);
        _e.set(Math.sin(t * L.freq + L.phase) * 0.16, 0, Math.sin(t * L.freq * 0.7 + L.phase * 1.3) * 0.09);
        _q.setFromEuler(_e);
        const sc = L.size * Math.max(open, 0.001);
        _v.set(0, -0.074 * sc, 0).applyQuaternion(_q).add(_p);
        _m.compose(_v, _q, _s.set(sc, sc, sc));
        lanterns.setMatrixAt(i, _m);
        halos.set(HALO.lantern + i, _v, 0.24 * L.size, haloColors.lantern[i], open * (0.85 + 0.15 * Math.sin(t * 3.1 + L.phase)));
      }
      lanterns.instanceMatrix.needsUpdate = true;
      lanterns.visible = open > 0.001;
      garlandLight.position.copy(stringPoint(0, 0.5, t, _a)).add(_s.set(0, -0.15, 0.45));
      garlandLight.intensity = 0.9 * lightAmt * (0.94 + 0.06 * Math.sin(t * 5.3) * Math.sin(t * 2.1));

      // lamp halos, the quiet light and its trail, window/moon halos
      fromMount(post.mount, 0, POST.lamp, 0.03, _v);
      halos.set(HALO.post, _v, 0.42, haloColors.lamp, open * 0.6);
      for (let k = 0; k < 2; k++) {
        fromMount(railFront.mount, (k ? 1 : -1) * RAIL_LAMP.x, RAIL_LAMP.y, 0.03, _v, deckLayer.frame);
        halos.set(HALO.rail + k, _v, 0.3, haloColors.lamp, open * 0.55);
      }
      halos.set(HALO.orb, orbPos, 0.36 - 0.08 * carried, haloColors.orb, orbVis * (0.75 + 0.25 * Math.sin(t * 2.6)));
      const flying = t > ORB_FROM && t < ORB_TO + 0.3 ? Math.sin(PI * seg(t, ORB_FROM, ORB_TO + 0.3)) : 0;
      for (let k = 0; k < TRAIL; k++) {
        quietPath(t - (k + 1) * 0.13, trailPos);
        halos.set(HALO.trail + k, trailPos, 0.1 * (1 - k / TRAIL), haloColors.orb, flying * vis * 0.7 * (1 - k / (TRAIL + 1)));
      }
      _v.copy(winPos).addScaledVector(winNormal, 0.03);
      halos.set(QUIET_HALO, _v, 0.26, haloColors.quiet, open * 0.45 * uni.uQuiet.value);
      for (let i = 0; i < fixedHalos.length; i++) {
        const f = fixedHalos[i];
        fromMount(f[0], f[1], f[2], f[3], _v);
        halos.set(FIXED + i, _v, f[4], haloColors.fixed[i], open * f[6]);
      }
      halos.commit();
      halos.mesh.visible = open > 0.001 || orbVis > 0.001;
      for (let i = 0; i < starList.length; i++) {
        const s = starList[i];
        fromMount(s.mount, s.x, s.y, s.z, _v);
        const tw = 0.55 + 0.45 * Math.sin(t * s.freq + s.phase);
        stars.set(i, _v, s.size * (0.85 + 0.25 * tw), s.color, open * tw);
      }
      stars.commit();
      stars.mesh.visible = open > 0.001;
    }

    update(PI, START + 12);
    group.userData.debug = { boatRig }; // for dev/spread-city.html's boat camera
    return { group, leftArt, rightArt, update };
  },
};
