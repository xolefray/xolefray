/**
 * spreads/sea.js — Spread 2, "The Folded Sea" (k = 2): opens 28–31, open 31–49, folds 49–52.
 *
 * A paper-theatre seascape at sunset, built back to front in the spread frame (contract §3.1):
 *   - Sky backdrop: a mountain V-fold near the far edge (z0 −1.3, 5.2 × 1.85) painted as a dusk
 *     gradient with cloud streaks, rays and a far sea band; on it a big low coral sun card that
 *     sinks 31 → 49 and three die-cut clouds that drift.
 *   - Four wave rows (V-folds at z0 −0.8, −0.15, 0.45, 1.55), darker and lower toward the reader.
 *     Each half is a glued, scalloped base strip with a taller curling crest strip just behind it;
 *     the crests bob and rock on their own phase per row (a wave machine), so every row moves in
 *     parallax against the others. Crests taper below the base at the seam and the outer ends, so
 *     the motion never shows a seam or a lifted edge.
 *   - The lighthouse on its rocky island, glued onto row 2's right half at ≈ (1.9, 0, −0.6): a
 *     2.3-tall striped card with an emissive lantern, a rotating translucent double beam
 *     (additive, depthWrite off), a lantern glow sprite and one small warm PointLight. The beam
 *     turns throughout and brightens for its caption 37–42.
 *   - The boat (paper.boat) on the shared waypoints (SPREADS.md; same C1 Hermite path as the
 *     camera rig), rocking on a small carrier swell between rows 3 and 4. 42–46 the big wave
 *     rises out of its slot under the boat; the boat climbs it (summit y ≈ 0.5 at t = 44, x = 1.0)
 *     and rides down the far side, pitching with the wave's slope.
 *   - Three paper gulls fly in 31–34, circle the lighthouse, and leave 47.6–49; a fish leaps
 *     between rows 2 and 3 on the left page at 33.6, 39.9 and 46.2.
 * Folding (popup.js R1–R3): every V-fold here uses the SAME gamma (a mountain fold, γ > π/2), so
 * for every α all their halves on one page are parallel planes (crease direction and glue line
 * depend only on γ and α) — they can never intersect, they simply stack when the book closes.
 * Everything glued to a half (crests, sun, clouds, lighthouse) lives in that half's plane family,
 * with its small stand-off scaled down by popup.rise() as the book closes. Each piece's closed
 * footprint fits the page (R1, checked by dev/spread-sea.html ?check=1); halves stay in their own
 * half of the book (R2). Thick or free props (boat, carrier, big wave, gulls, fish, beam, glow)
 * shrink, sink or fade with rise() before the pages could reach them.
 * Budget: 62 meshes (incl. 1 sprite), 1 PointLight, textures ≤ 1024 px. update() is a pure
 * function of (α, t) and allocates nothing.
 */
import { clamp, smoothstep } from '../timeline.js';

const PI = Math.PI;
/** One gamma for every V-fold: parallel half-planes at every α (see header). Mountain fold. */
const GAMMA = 1.8;
const SG = Math.sin(GAMMA);
const CG = Math.cos(GAMMA); // < 0
/** Yaw of the right halves' glue lines (they recede toward −Z as x grows); left halves mirror it. */
const ROW_YAW = Math.atan2(-CG, SG);
/** Pixels per unit for piece art (canvases stay ≤ 1024 px). */
const PX = 360;

const SKY = { z0: -1.3, L: 2.6, H: 1.85 };
const SUN = { x: -1.25, r: 0.52, y0: 1.0, y1: 0.66 };

/**
 * Wave rows, back → front. Crest motion per row: bob = lift, sway = slide along the row (units),
 * rock = seesaw (rad), period (s). bob + sway trace a small loop, like a crank-driven theatre wave.
 */
const ROWS = [
  {
    z0: -0.8, L: 2.75, base: 0.44, swell: [0.045, 0.022], crest: 0.24, bob: 0.046, sway: 0.034, rock: 0.024,
    period: 4.3, phase: 0.4,
    lo: '#3d8a9b', hi: '#8cc6c6', line: 'rgba(222, 244, 236, 0.5)', rim: '#f7c4a0',
    crestLo: '#6db0b8', crestHi: '#bfe2da', crestRim: '#fbd3b0',
  },
  {
    z0: -0.15, L: 2.6, base: 0.36, swell: [0.04, 0.02], crest: 0.21, bob: 0.042, sway: 0.032, rock: 0.024,
    period: 3.7, phase: 2.2,
    lo: '#2c7489', hi: '#62adb7', line: 'rgba(200, 236, 232, 0.45)', rim: '#f2b99c',
    crestLo: '#4d9dab', crestHi: '#98d0cf', crestRim: '#f6c8a8',
  },
  {
    z0: 0.45, L: 2.75, base: 0.28, swell: [0.035, 0.016], crest: 0.19, bob: 0.038, sway: 0.03, rock: 0.022,
    period: 3.2, phase: 4.1,
    lo: '#1f5a76', hi: '#3f8fa4', line: 'rgba(170, 222, 226, 0.42)', rim: '#cfe8e4',
    crestLo: '#378aa0', crestHi: '#76bcc6', crestRim: '#e4f3ef',
  },
  {
    z0: 1.55, L: 2.75, base: 0.155, swell: [0.022, 0.01], crest: 0.15, bob: 0.03, sway: 0.026, rock: 0.02,
    period: 2.8, phase: 1.1,
    lo: '#163d5c', hi: '#2b6e8b', line: 'rgba(150, 205, 220, 0.42)', rim: '#bfe0e6',
    crestLo: '#2a7290', crestHi: '#5ea7bb', crestRim: '#dff0f0',
  },
];
const CREST_INSET = 0.3; // crest strips end this far inside the base's outer end
const CREST_DROP = 0.12; // hidden crest line below the base's smooth top (covers bob + rock)
const CREST_GAP = 0.05; // crest strips start this far from the crease (covers sway)

/** The lighthouse: glued on row 2's right half so its foot is at spread (1.9, 0, ≈ −0.6). */
const LH = { row: 1, m: 1.9 / SG, w: 0.98, h: 2.32, lamp: 1.86, standoff: 0.006 };
const BEAM_PERIOD = 6.5;

/** Shared boat waypoints (SPREADS.md): [t, x, z]; the waterline height comes from the waves. */
const WAYPOINTS = [
  [31, -2.3, 0.6],
  [35, -1.2, 0.5],
  [39, 0.0, 0.7],
  [44, 1.0, 0.4],
  [48.5, 2.1, 0.8],
];
const BOAT_SCALE = 0.6; // same as the other spreads
const BOAT_Y = 0.165; // resting waterline on the carrier swell
const CARRIER_Z = 0.14; // carrier swell / big wave planes, in front of the boat (lane coordinates)
const WAVE = { x: 1.0, z: 0.17, peak: 0.55, half: 0.92, depth: 0.66, sink: 0.04 };

const FISH = { x: -1.6, t0: 33.6, period: 6.3, dur: 1.25, jumps: 3 };

// ------------------------------------------------------------------------------- pure helpers

const frac = (x) => x - Math.floor(x);
const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

function hermite(p0, m0, p1, m1, s, dt) {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * dt * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * dt * m1;
}

/** Catmull-Rom (time-parameterised, zero end velocity) through the waypoints, like camera.js. */
const PATH = (() => {
  const n = WAYPOINTS.length;
  const T = WAYPOINTS.map((w) => w[0]);
  const X = WAYPOINTS.map((w) => w[1]);
  const Z = WAYPOINTS.map((w) => w[2]);
  const MX = new Array(n).fill(0);
  const MZ = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    MX[i] = (X[i + 1] - X[i - 1]) / (T[i + 1] - T[i - 1]);
    MZ[i] = (Z[i + 1] - Z[i - 1]) / (T[i + 1] - T[i - 1]);
  }
  return { n, T, X, Z, MX, MZ, t0: T[0], t1: T[n - 1] };
})();

/** Boat position (x, z) on the page at film time t (clamped to the journey) into out. */
function pathAt(t, out) {
  const { n, T, X, Z, MX, MZ } = PATH;
  const tc = clamp(t, PATH.t0, PATH.t1);
  let i = 0;
  while (i < n - 2 && tc >= T[i + 1]) i++;
  const dt = T[i + 1] - T[i];
  const s = (tc - T[i]) / dt;
  out.x = hermite(X[i], MX[i], X[i + 1], MX[i + 1], s, dt);
  out.z = hermite(Z[i], MZ[i], Z[i + 1], MZ[i + 1], s, dt);
  return out;
}

/** Big wave silhouette height at dx from its centre (smooth part; the art adds scallops). */
function waveProfile(dx) {
  const u = Math.abs(dx) / WAVE.half;
  return u >= 1 ? 0 : WAVE.peak * Math.pow(Math.cos((PI / 2) * u), 1.6);
}

function waveSlope(dx) {
  const e = 0.01;
  return (waveProfile(dx + e) - waveProfile(dx - e)) / (2 * e);
}

/** 0..1: how far the big wave is out of its slot (rises 41.8–43.8, sinks 44.6–46.4). */
function waveAmount(t) {
  return smoothstep(41.8, 43.8, t) * (1 - smoothstep(44.6, 46.4, t));
}

/** Rounded-end factor: 1 inside, falling to 0 at |x| = end over `r`. */
function endTaper(x, end, r) {
  return Math.sqrt(clamp((end - Math.abs(x)) / r));
}

// ------------------------------------------------------------------------------- painting

/** Traces y = f(x) from x0 to x1 (continuing the current path). */
function trace(ctx, f, x0, x1, step = 0.008) {
  for (let x = x0; x < x1; x += step) ctx.lineTo(x, f(x));
  ctx.lineTo(x1, f(x1));
}

/** Closed band under y = f(x) down to below y = yb. */
function band(ctx, f, x0, x1, yb) {
  ctx.beginPath();
  ctx.moveTo(x0, yb - 0.05);
  trace(ctx, f, x0, x1);
  ctx.lineTo(x1, yb - 0.05);
  ctx.closePath();
}

/** Strokes the curve y = f(x) from x0 to x1 with round joins and caps. */
function strokeLine(ctx, f, x0, x1, width, style) {
  ctx.beginPath();
  ctx.moveTo(x0, f(x0));
  trace(ctx, f, x0, x1);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Soft watercolour blotches inside the current clip. */
function mottle(ctx, rnd, x0, x1, y0, y1, n, light, dark) {
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * rnd.next();
    const y = y0 + (y1 - y0) * rnd.next();
    const r = rnd.range(0.06, 0.26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = i % 2 ? light : dark;
    g.addColorStop(0, c);
    g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

/** A curling foam comma (y-up art space): starts at the top, curls clockwise inward. */
function foamCurl(ctx, cx, cy, r, width) {
  const N = 18;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fbf7ee';
  let px = cx + r * Math.cos(PI * 0.75);
  let py = cy + r * Math.sin(PI * 0.75);
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    const a = PI * 0.75 - k * PI * 1.75;
    const rr = r * (1 - 0.62 * k);
    const x = cx + rr * Math.cos(a);
    const y = cy + rr * Math.sin(a);
    ctx.lineWidth = width * (1 - 0.7 * k);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    px = x;
    py = y;
  }
}

/** Builds the profile functions and crest humps of one wave row. */
function rowShape(rng, row) {
  const p1 = rng.range(0, 2 * PI);
  const p2 = rng.range(0, 2 * PI);
  const p3 = rng.next();
  const lam = rng.range(0.13, 0.17);
  const [a1, a2] = row.swell;
  const L = row.L;
  const smooth = (x) => row.base + a1 * Math.sin(2.1 * x + p1) + a2 * Math.sin(4.9 * x + p2);
  const scallop = (x) => {
    const u = 2 * frac(x / lam + p3) - 1;
    return 0.024 * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const baseTop = (x) => (smooth(x) + scallop(x)) * endTaper(x, L - 0.03, 0.17);
  const humps = [];
  const crestEnd = L - CREST_INSET;
  for (const side of [-1, 1]) {
    let d = 0.32;
    for (;;) {
      const w1 = rng.range(0.2, 0.3); // gentle back slope (−x side)
      const w2 = rng.range(0.1, 0.15); // steep face (+x side): the waves roll toward +x
      const a = row.crest * rng.range(0.78, 1.15) + 0.03;
      const lo = side > 0 ? w1 : w2 + 0.05; // extent toward the seam
      const hi = side > 0 ? w2 + 0.05 : w1; // extent toward the outer end
      const c = side * (d + lo + rng.range(0, 0.12));
      if (Math.abs(c) + hi > crestEnd - 0.08) break;
      humps.push({ c, w1, w2, a });
      d = Math.abs(c) + hi + rng.range(0.08, 0.25);
    }
  }
  const hump = (x, h) => {
    const u = x < h.c ? (x - h.c) / h.w1 : (x - h.c) / h.w2;
    return Math.abs(u) >= 1 ? 0 : h.a * Math.pow(1 - u * u, 1.5);
  };
  const crestTop = (x) => {
    let b = 0;
    for (const h of humps) b = Math.max(b, hump(x, h));
    return smooth(x) - CREST_DROP + b;
  };
  let maxBase = 0;
  let minSmooth = Infinity;
  let maxCrest = 0;
  for (let x = -L; x <= L; x += 0.004) {
    maxBase = Math.max(maxBase, baseTop(x));
    if (Math.abs(x) < L - 0.25) minSmooth = Math.min(minSmooth, smooth(x));
    maxCrest = Math.max(maxCrest, crestTop(x));
  }
  return { smooth, baseTop, crestTop, humps, hump, maxBase, minSmooth, maxCrest, crestEnd };
}

function drawRowBase(ctx, row, shape, x0, x1, rnd) {
  const { baseTop, smooth } = shape;
  band(ctx, baseTop, x0, x1, 0);
  const g = ctx.createLinearGradient(0, 0, 0, row.base + 0.06);
  g.addColorStop(0, row.lo);
  g.addColorStop(1, row.hi);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  mottle(ctx, rnd, x0, x1, 0, row.base + 0.05, 16, 'rgba(255, 255, 255, 0.07)', 'rgba(10, 30, 50, 0.08)');
  // Engraved flow lines following the swell, broken like a woodblock print.
  ctx.lineCap = 'round';
  for (let k = 1; k <= 4; k++) {
    ctx.setLineDash([rnd.range(0.2, 0.4), 0.05, rnd.range(0.06, 0.16), 0.05]);
    ctx.lineDashOffset = rnd.range(0, 1);
    const dy = 0.035 + k * 0.042;
    strokeLine(ctx, (x) => smooth(x) - dy, x0, x1, 0.0065, row.line.replace(/[\d.]+\)$/, `${(0.55 / Math.sqrt(k)).toFixed(2)})`));
  }
  ctx.setLineDash([]);
  // Contact shade where the strip meets the page.
  const s = ctx.createLinearGradient(0, 0, 0, 0.13);
  s.addColorStop(0, 'rgba(8, 24, 40, 0.38)');
  s.addColorStop(1, 'rgba(8, 24, 40, 0)');
  ctx.fillStyle = s;
  ctx.fillRect(x0, 0, x1 - x0, 0.13);
  // Bubbles under the foam.
  ctx.fillStyle = 'rgba(251, 247, 238, 0.75)';
  for (let i = 0; i < 26; i++) {
    const x = x0 + (x1 - x0) * rnd.next();
    const y = baseTop(x) - rnd.range(0.035, 0.11);
    ctx.beginPath();
    ctx.arc(x, y, rnd.range(0.004, 0.009), 0, 2 * PI);
    ctx.fill();
  }
  ctx.restore();
  // Sunset rim under the foam, then the foam edge itself.
  strokeLine(ctx, (x) => baseTop(x) - 0.016, x0, x1, 0.007, row.rim);
  strokeLine(ctx, baseTop, x0, x1, 0.014, '#fbf7ee');
}

function drawRowCrest(ctx, row, shape, x0, x1, cb, rnd) {
  const { crestTop, humps, hump, smooth } = shape;
  band(ctx, crestTop, x0, x1, cb);
  const g = ctx.createLinearGradient(0, row.base - 0.1, 0, row.base + row.crest);
  g.addColorStop(0, row.crestLo);
  g.addColorStop(1, row.crestHi);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  mottle(ctx, rnd, x0, x1, cb, row.base + row.crest, 12, 'rgba(255, 255, 255, 0.08)', 'rgba(10, 40, 60, 0.07)');
  // Inner contour lines echoing each crest.
  ctx.lineCap = 'round';
  for (const h of humps) {
    if (h.c < x0 - 0.3 || h.c > x1 + 0.3) continue;
    for (const k of [0.78, 0.56, 0.34]) {
      const y0 = smooth(h.c) - CREST_DROP;
      strokeLine(ctx, (x) => y0 + k * hump(x, h) - 0.02, h.c - h.w1 * 0.92, h.c + h.w2 * 0.85, 0.0055,
        `rgba(240, 252, 248, ${(0.5 * k).toFixed(2)})`);
    }
  }
  ctx.restore();
  strokeLine(ctx, (x) => crestTop(x) - 0.014, x0, x1, 0.006, row.crestRim);
  strokeLine(ctx, crestTop, x0, x1, 0.012, '#fbf7ee');
  // Foam curls on each crest's steep face, with a few flying drops.
  for (const h of humps) {
    if (h.c < x0 - 0.2 || h.c > x1 + 0.2) continue;
    const top = smooth(h.c) - CREST_DROP + h.a;
    const r = Math.min(0.065, 0.32 * h.a);
    foamCurl(ctx, h.c + 0.25 * h.w2, top - r * 0.95, r, 0.018);
    ctx.fillStyle = '#fbf7ee';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(h.c + h.w2 * (0.7 + 0.35 * i), top - 0.02 - 0.03 * i * i, 0.007 - 0.0015 * i, 0, 2 * PI);
      ctx.fill();
    }
  }
}

/** Sky backdrop half (shared features so both halves join at the crease). */
function drawSkyHalf(ctx, x0, x1, top, feats) {
  band(ctx, top, x0, x1, 0);
  const g = ctx.createLinearGradient(0, 0, 0, SKY.H);
  g.addColorStop(0, '#f8d8a0');
  g.addColorStop(0.17, '#f6bd8c');
  g.addColorStop(0.38, '#eb9f95');
  g.addColorStop(0.62, '#b48cad');
  g.addColorStop(1, '#6a7cae');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sy = 0.85;
  const glow = ctx.createRadialGradient(SUN.x, sy, 0.2, SUN.x, sy, 1.9);
  glow.addColorStop(0, 'rgba(255, 228, 172, 0.8)');
  glow.addColorStop(0.35, 'rgba(255, 204, 156, 0.32)');
  glow.addColorStop(1, 'rgba(255, 196, 160, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x0, 0, x1 - x0, SKY.H);
  // Sun rays: alternate pale wedges.
  ctx.fillStyle = 'rgba(255, 240, 210, 0.085)';
  for (let i = 0; i < 18; i += 2) {
    const a0 = (i / 18) * PI;
    const a1 = ((i + 1) / 18) * PI;
    ctx.beginPath();
    ctx.moveTo(SUN.x, sy);
    ctx.lineTo(SUN.x + 4 * Math.cos(a0), sy + 4 * Math.sin(a0));
    ctx.lineTo(SUN.x + 4 * Math.cos(a1), sy + 4 * Math.sin(a1));
    ctx.closePath();
    ctx.fill();
  }
  mottle(ctx, feats.rnd, x0, x1, 0.3, SKY.H, 14, 'rgba(255, 246, 230, 0.09)', 'rgba(90, 80, 140, 0.07)');
  // Cloud streaks: lavender bodies with gold-lit undersides.
  for (const c of feats.streaks) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, 2 * PI);
    ctx.fillStyle = c.y > 1.25 ? 'rgba(150, 138, 182, 0.5)' : 'rgba(214, 150, 168, 0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + c.h * 0.08, c.w / 2, c.h / 2, 0, PI * 1.08, PI * 1.92);
    ctx.strokeStyle = 'rgba(255, 216, 160, 0.85)';
    ctx.lineWidth = 0.009;
    ctx.stroke();
  }
  // Early stars.
  ctx.strokeStyle = 'rgba(255, 246, 225, 0.75)';
  ctx.lineWidth = 0.005;
  for (const s of feats.stars) {
    ctx.beginPath();
    ctx.moveTo(s.x - s.r, s.y);
    ctx.lineTo(s.x + s.r, s.y);
    ctx.moveTo(s.x, s.y - s.r);
    ctx.lineTo(s.x, s.y + s.r);
    ctx.stroke();
  }
  // Birds far away.
  ctx.strokeStyle = 'rgba(70, 58, 80, 0.7)';
  ctx.lineWidth = 0.007;
  ctx.lineCap = 'round';
  for (const b of feats.birds) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.s, b.y + b.s * 0.35);
    ctx.quadraticCurveTo(b.x - b.s * 0.45, b.y + b.s * 0.55, b.x, b.y);
    ctx.quadraticCurveTo(b.x + b.s * 0.45, b.y + b.s * 0.55, b.x + b.s, b.y + b.s * 0.35);
    ctx.stroke();
  }
  // The far sea under the horizon, with the sun's glitter path.
  const hz = 0.38;
  const sea = ctx.createLinearGradient(0, 0, 0, hz);
  sea.addColorStop(0, '#3f7f93');
  sea.addColorStop(1, '#c69aa2');
  ctx.fillStyle = sea;
  ctx.fillRect(x0, -0.05, x1 - x0, hz + 0.05);
  ctx.strokeStyle = 'rgba(255, 214, 150, 0.85)';
  ctx.lineCap = 'round';
  for (const d of feats.glitter) {
    ctx.lineWidth = d.w;
    ctx.beginPath();
    ctx.moveTo(d.x - d.l / 2, d.y);
    ctx.lineTo(d.x + d.l / 2, d.y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60, 50, 70, 0.35)';
  ctx.lineWidth = 0.005;
  ctx.beginPath();
  ctx.moveTo(x0, hz);
  ctx.lineTo(x1, hz);
  ctx.stroke();
  ctx.restore();
}

function drawSun(ctx) {
  const R = SUN.r;
  const g = ctx.createRadialGradient(-0.15 * R, 0.15 * R, 0.05, 0, 0, R);
  g.addColorStop(0, '#f9c08a');
  g.addColorStop(0.55, '#f39a6b');
  g.addColorStop(1, '#e8714f');
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * PI);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Layered-paper rings and the classic sunset stripes on its lower half.
  ctx.strokeStyle = 'rgba(255, 220, 180, 0.45)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.8, 0, 2 * PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 214, 170, 0.5)';
  for (let k = 0; k < 5; k++) {
    const y = -0.12 * R - k * 0.17 * R;
    ctx.fillRect(-R, y - 0.012 - k * 0.005, 2 * R, 0.018 + k * 0.008);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.92, PI * 0.58, PI * 0.92);
  ctx.strokeStyle = 'rgba(255, 244, 220, 0.7)';
  ctx.lineWidth = 0.016;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawCloud(ctx, w, h, rnd) {
  const n = Math.max(3, Math.round(w / 0.17));
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const x = -w / 2 + w * u;
    const bulge = Math.sin(PI * u);
    const r = h * (0.18 + 0.2 * bulge) * rnd.range(0.85, 1.15);
    puffs.push({ x, y: -h * 0.1 + r * 0.35, r });
  }
  const outline = () => {
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.18, w / 2, h * 0.3, 0, 0, 2 * PI);
    for (const p of puffs) {
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, 2 * PI);
    }
  };
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#d7aec4');
  g.addColorStop(0.45, '#f6dcd6');
  g.addColorStop(1, '#fff3e6');
  outline();
  ctx.fillStyle = g;
  ctx.fill('nonzero');
  ctx.save();
  outline();
  ctx.clip('nonzero');
  ctx.strokeStyle = 'rgba(170, 128, 160, 0.4)';
  ctx.lineWidth = 0.008;
  for (const p of puffs) {
    ctx.beginPath();
    ctx.arc(p.x, p.y - p.r * 0.12, p.r * 0.86, PI * 1.15, PI * 1.85);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 210, 150, 0.6)';
  ctx.fillRect(-w / 2, -h * 0.5, w, h * 0.12);
  ctx.restore();
}

/** The lighthouse card (x ∈ [−w/2, w/2], y ∈ [0, h], y up) — `glow` paints the emissive map. */
function drawLighthouse(ctx, glow) {
  const ink = 'rgba(43, 38, 34, 0.6)';
  const hw = (y) => 0.165 - ((y - 0.38) * 0.06) / 1.32;
  if (glow) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(-0.6, -0.1, 1.2, 2.6);
    const g = ctx.createRadialGradient(0, LH.lamp, 0.01, 0, LH.lamp, 0.13);
    g.addColorStop(0, '#fff4c8');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g;
    ctx.fillRect(-0.085, 1.75, 0.17, 0.22);
    ctx.fillStyle = '#ffc25c';
    ctx.fillRect(-0.3, 0.315, 0.06, 0.06);
    return;
  }
  const poly = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  // Rocky island: faceted rocks lit from the upper left.
  const rocks = [
    [[-0.46, 0], [-0.44, 0.13], [-0.36, 0.24], [-0.22, 0.29], [-0.12, 0.24], [-0.08, 0]],
    [[0.14, 0], [0.18, 0.2], [0.29, 0.31], [0.4, 0.24], [0.455, 0.09], [0.46, 0]],
    [[-0.2, 0], [-0.17, 0.27], [-0.05, 0.4], [0.1, 0.42], [0.2, 0.33], [0.24, 0]],
    [[-0.34, 0], [-0.31, 0.1], [-0.22, 0.155], [-0.13, 0.09], [-0.1, 0]],
    [[0.04, 0], [0.08, 0.11], [0.17, 0.14], [0.235, 0.05], [0.25, 0]],
  ];
  for (const r of rocks) {
    poly(r);
    ctx.fillStyle = '#6e6878';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const top = r.reduce((a, p) => (p[1] > a[1] ? p : a), r[0]);
    ctx.beginPath();
    ctx.moveTo(r[0][0], r[0][1]);
    for (const p of r) if (p[0] <= top[0]) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(top[0] + 0.02, top[1] * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#a99996';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    for (const p of r) if (p[0] > top[0]) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(top[0] + 0.03, 0);
    ctx.closePath();
    ctx.fillStyle = '#4f4a59';
    ctx.fill();
    ctx.restore();
    poly(r);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.006;
    ctx.stroke();
  }
  // Grass tufts.
  ctx.fillStyle = '#7f9d5c';
  for (const [x, y, s] of [[-0.3, 0.255, 0.05], [-0.2, 0.29, 0.04], [0.02, 0.41, 0.06], [0.14, 0.4, 0.05], [0.31, 0.3, 0.04]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.35, 0, 0, PI);
    ctx.fill();
  }
  // Keeper's cottage.
  ctx.fillStyle = '#f1e6d0';
  ctx.fillRect(-0.35, 0.27, 0.2, 0.15);
  ctx.fillStyle = 'rgba(80, 60, 70, 0.25)';
  ctx.fillRect(-0.21, 0.27, 0.06, 0.15);
  poly([[-0.38, 0.415], [-0.25, 0.53], [-0.12, 0.415]]);
  ctx.fillStyle = '#a8403a';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.005;
  ctx.stroke();
  ctx.fillStyle = '#7a3a33';
  ctx.fillRect(-0.2, 0.47, 0.03, 0.07);
  ctx.fillStyle = '#ffcf6b';
  ctx.fillRect(-0.3, 0.315, 0.06, 0.06);
  ctx.strokeStyle = ink;
  ctx.strokeRect(-0.3, 0.315, 0.06, 0.06);
  ctx.fillStyle = '#6f4c35';
  ctx.fillRect(-0.2, 0.27, 0.035, 0.09);
  ctx.strokeRect(-0.35, 0.27, 0.2, 0.15);
  // Tower: tapered, banded, cylindrically shaded.
  const towerPath = () => poly([[-hw(0.38), 0.38], [-hw(1.7), 1.7], [hw(1.7), 1.7], [hw(0.38), 0.38]]);
  towerPath();
  ctx.fillStyle = '#f6efe2';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#c7463c';
  for (const [y0, y1] of [[0.56, 0.76], [0.96, 1.16], [1.36, 1.56]]) {
    ctx.beginPath();
    ctx.moveTo(-0.2, y0 - 0.014);
    ctx.quadraticCurveTo(0, y0 - 0.03, 0.2, y0 - 0.014);
    ctx.lineTo(0.2, y1 - 0.014);
    ctx.quadraticCurveTo(0, y1 - 0.03, -0.2, y1 - 0.014);
    ctx.closePath();
    ctx.fill();
  }
  const sh = ctx.createLinearGradient(-0.17, 0, 0.17, 0);
  sh.addColorStop(0, 'rgba(255, 250, 238, 0.4)');
  sh.addColorStop(0.3, 'rgba(255, 255, 255, 0)');
  sh.addColorStop(0.62, 'rgba(50, 25, 40, 0.06)');
  sh.addColorStop(1, 'rgba(50, 25, 40, 0.38)');
  ctx.fillStyle = sh;
  ctx.fillRect(-0.2, 0.3, 0.4, 1.5);
  ctx.fillStyle = '#3b3340';
  for (const y of [0.84, 1.24, 1.46]) {
    ctx.beginPath();
    ctx.moveTo(-0.018, y);
    ctx.lineTo(-0.018, y + 0.045);
    ctx.arc(0, y + 0.045, 0.018, PI, 0, true);
    ctx.lineTo(0.018, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#6f4c35';
  ctx.beginPath();
  ctx.moveTo(-0.035, 0.38);
  ctx.lineTo(-0.035, 0.46);
  ctx.arc(0, 0.46, 0.035, PI, 0, true);
  ctx.lineTo(0.035, 0.38);
  ctx.fill();
  ctx.restore();
  towerPath();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.007;
  ctx.stroke();
  // Gallery, railing, lantern room, dome.
  ctx.fillStyle = '#3a3238';
  ctx.fillRect(-0.155, 1.69, 0.31, 0.05);
  ctx.strokeStyle = '#3a3238';
  ctx.lineWidth = 0.008;
  ctx.beginPath();
  ctx.moveTo(-0.145, 1.83);
  ctx.lineTo(0.145, 1.83);
  ctx.stroke();
  ctx.lineWidth = 0.005;
  for (let x = -0.14; x <= 0.141; x += 0.035) {
    ctx.beginPath();
    ctx.moveTo(x, 1.74);
    ctx.lineTo(x, 1.83);
    ctx.stroke();
  }
  const lg = ctx.createRadialGradient(0, LH.lamp, 0.01, 0, LH.lamp, 0.13);
  lg.addColorStop(0, '#fff6d4');
  lg.addColorStop(0.5, '#ffd36a');
  lg.addColorStop(1, '#f2a23c');
  ctx.fillStyle = lg;
  ctx.fillRect(-0.085, 1.75, 0.17, 0.22);
  ctx.strokeStyle = '#2f2830';
  ctx.lineWidth = 0.008;
  ctx.strokeRect(-0.085, 1.75, 0.17, 0.22);
  ctx.beginPath();
  ctx.moveTo(-0.028, 1.75);
  ctx.lineTo(-0.028, 1.97);
  ctx.moveTo(0.028, 1.75);
  ctx.lineTo(0.028, 1.97);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.115, 1.965);
  ctx.quadraticCurveTo(-0.11, 2.13, 0, 2.135);
  ctx.quadraticCurveTo(0.11, 2.13, 0.115, 1.965);
  ctx.closePath();
  ctx.fillStyle = '#b23a32';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.006;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-0.03, 2.07, 0.05, PI * 0.6, PI * 0.95);
  ctx.strokeStyle = 'rgba(255, 220, 200, 0.6)';
  ctx.lineWidth = 0.01;
  ctx.stroke();
  ctx.fillStyle = '#3a3238';
  ctx.beginPath();
  ctx.arc(0, 2.16, 0.025, 0, 2 * PI);
  ctx.fill();
  ctx.fillRect(-0.005, 2.16, 0.01, 0.12);
}

function drawBigWave(ctx, rnd) {
  const top = (x) => {
    const p = waveProfile(x);
    const u = 2 * frac(x / 0.11 + 0.3) - 1;
    return p > 0.02 ? p + 0.016 * Math.sqrt(Math.max(0, 1 - u * u)) * Math.min(1, p / 0.08) : p;
  };
  band(ctx, top, -0.97, 0.97, 0);
  const g = ctx.createLinearGradient(0, 0, 0, WAVE.peak);
  g.addColorStop(0, '#1a4d6c');
  g.addColorStop(0.6, '#2f7d96');
  g.addColorStop(1, '#5dafbf');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  mottle(ctx, rnd, -0.95, 0.95, 0, WAVE.peak, 14, 'rgba(255, 255, 255, 0.07)', 'rgba(10, 30, 50, 0.08)');
  for (let k = 1; k <= 5; k++) {
    const f = 1 - k * 0.15;
    ctx.setLineDash([rnd.range(0.2, 0.4), 0.04, rnd.range(0.05, 0.12), 0.04]);
    strokeLine(ctx, (x) => waveProfile(x / Math.sqrt(f)) * f - 0.02, -0.95, 0.95, 0.007,
      `rgba(196, 236, 236, ${(0.55 - k * 0.07).toFixed(2)})`);
  }
  ctx.setLineDash([]);
  ctx.restore();
  strokeLine(ctx, (x) => top(x) - 0.017, -0.92, 0.92, 0.007, '#d8f0ee');
  strokeLine(ctx, top, -0.95, 0.95, 0.016, '#fbf7ee');
  for (const s of [-1, 1]) {
    const x = s * 0.5;
    foamCurl(ctx, x + s * 0.03, waveProfile(x) * 0.62, 0.075, 0.02);
    foamCurl(ctx, x + s * 0.2, waveProfile(x + s * 0.2) * 0.5, 0.045, 0.014);
  }
  ctx.fillStyle = '#fbf7ee';
  for (let i = 0; i < 9; i++) {
    const x = rnd.range(-0.35, 0.35);
    ctx.beginPath();
    ctx.arc(x, top(x) + rnd.range(0.012, 0.04), rnd.range(0.004, 0.008), 0, 2 * PI);
    ctx.fill();
  }
}

function drawCarrier(ctx, rnd) {
  const top = (x) => (0.03 + 0.12 * Math.pow(Math.cos((PI * x) / 0.64), 1.3)) * endTaper(x, 0.29, 0.05);
  band(ctx, top, -0.3, 0.3, 0);
  const g = ctx.createLinearGradient(0, 0, 0, 0.2);
  g.addColorStop(0, '#1d5372');
  g.addColorStop(1, '#3f90a5');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.setLineDash([0.12, 0.04]);
  for (let k = 1; k <= 2; k++) strokeLine(ctx, (x) => top(x) * (1 - 0.3 * k), -0.28, 0.28, 0.006, 'rgba(190, 232, 236, 0.45)');
  ctx.setLineDash([]);
  ctx.restore();
  strokeLine(ctx, top, -0.29, 0.29, 0.013, '#fbf7ee');
  foamCurl(ctx, -0.17, 0.095, 0.035, 0.012);
  foamCurl(ctx, 0.2, 0.08, 0.03, 0.011);
  ctx.fillStyle = '#fbf7ee';
  for (let i = 0; i < 6; i++) {
    const x = rnd.range(-0.2, 0.2);
    ctx.beginPath();
    ctx.arc(x, top(x) - rnd.range(0.025, 0.06), rnd.range(0.003, 0.006), 0, 2 * PI);
    ctx.fill();
  }
}

function drawFish(ctx) {
  ctx.beginPath();
  ctx.moveTo(0.15, 0.0);
  ctx.quadraticCurveTo(0.08, 0.065, -0.05, 0.04);
  ctx.quadraticCurveTo(-0.09, 0.03, -0.11, 0.008);
  ctx.lineTo(-0.155, 0.05);
  ctx.lineTo(-0.14, 0.0);
  ctx.lineTo(-0.155, -0.05);
  ctx.lineTo(-0.11, -0.008);
  ctx.quadraticCurveTo(-0.09, -0.03, -0.05, -0.038);
  ctx.quadraticCurveTo(0.08, -0.06, 0.15, 0.0);
  const g = ctx.createLinearGradient(0, -0.05, 0, 0.06);
  g.addColorStop(0, '#e9eef0');
  g.addColorStop(0.5, '#9fc3d0');
  g.addColorStop(1, '#3e6f8c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 40, 55, 0.6)';
  ctx.lineWidth = 0.005;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0.04 - i * 0.035, 0.0, 0.025, -PI * 0.35, PI * 0.35);
    ctx.stroke();
  }
  ctx.fillStyle = '#ef8a6a';
  ctx.beginPath();
  ctx.moveTo(0.0, 0.045);
  ctx.lineTo(-0.04, 0.075);
  ctx.lineTo(-0.05, 0.04);
  ctx.fill();
  ctx.fillStyle = '#1f2a33';
  ctx.beginPath();
  ctx.arc(0.105, 0.012, 0.009, 0, 2 * PI);
  ctx.fill();
}

// --------------------------------------------------------------------------- page art

function fishIcon(ctx, x, z, len, ang) {
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(ang);
  ctx.scale(len, len);
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.quadraticCurveTo(0.2, -0.24, -0.25, -0.06);
  ctx.lineTo(-0.5, -0.2);
  ctx.lineTo(-0.42, 0);
  ctx.lineTo(-0.5, 0.2);
  ctx.lineTo(-0.25, 0.06);
  ctx.quadraticCurveTo(0.2, 0.24, 0.5, 0);
  ctx.fill();
  ctx.restore();
}

function palm(ctx, x, z, s) {
  ctx.strokeStyle = '#6f4c35';
  ctx.lineWidth = 0.02 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, z);
  ctx.quadraticCurveTo(x + 0.04 * s, z - 0.12 * s, x + 0.02 * s, z - 0.22 * s);
  ctx.stroke();
  ctx.strokeStyle = '#4f7d4b';
  ctx.lineWidth = 0.018 * s;
  const tx = x + 0.02 * s;
  const tz = z - 0.22 * s;
  for (let i = 0; i < 6; i++) {
    const a = -PI / 2 + (i - 2.5) * 0.55;
    ctx.beginPath();
    ctx.moveTo(tx, tz);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 0.1 * s, tz + Math.sin(a) * 0.1 * s - 0.03 * s,
      tx + Math.cos(a) * 0.15 * s, tz + Math.sin(a) * 0.15 * s + 0.03 * s);
    ctx.stroke();
  }
}

function compassRose(ctx, cx, cz, r, simple) {
  ctx.save();
  ctx.translate(cx, cz);
  ctx.lineWidth = 0.006;
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.75)';
  ctx.fillStyle = 'rgba(246, 236, 214, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * PI);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, 2 * PI);
  ctx.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * 2 * PI;
    const r0 = i % 4 === 0 ? r * 0.76 : r * 0.81;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.stroke();
  }
  const point = (a, len, wid, c1, c2) => {
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy * wid;
    const py = ux * wid;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ux * len, uy * len);
    ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fillStyle = c1;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ux * len, uy * len);
    ctx.lineTo(-px, -py);
    ctx.closePath();
    ctx.fillStyle = c2;
    ctx.fill();
    ctx.stroke();
  };
  if (!simple) for (let i = 0; i < 4; i++) point(PI / 4 + (i * PI) / 2, r * 0.62, r * 0.09, '#2f7d84', '#f3ead8');
  for (let i = 0; i < 4; i++) point(-PI / 2 + (i * PI) / 2, r * 0.95, r * 0.13, '#ef8a6a', '#fbf7ee');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.06, 0, 2 * PI);
  ctx.fillStyle = '#c7463c';
  ctx.fill();
  ctx.stroke();
  if (!simple) {
    ctx.scale(1 / 256, 1 / 256);
    ctx.fillStyle = 'rgba(43, 38, 34, 0.85)';
    ctx.font = 'italic 600 30px Georgia, "DejaVu Serif", serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -r * 256 * 1.04);
  }
  ctx.restore();
}

/** One page of the printed sea, drawn in spread coordinates (x, z); side −1 = left, +1 = right. */
function drawSeaPage(ctx, side, feats) {
  ctx.setTransform(256, 0, 0, 256, side < 0 ? 768 : 0, 512);
  const bg = ctx.createLinearGradient(0, -2, 0, 2);
  bg.addColorStop(0, '#62abad');
  bg.addColorStop(0.35, '#3f8c99');
  bg.addColorStop(0.7, '#286a82');
  bg.addColorStop(1, '#1d506b');
  ctx.fillStyle = bg;
  ctx.fillRect(-3.2, -2.2, 6.4, 4.4);
  // Seigaiha (overlapping wave scales), seamless across the gutter.
  const r = 0.16;
  ctx.lineWidth = 0.0055;
  for (let j = 0, z = -2.1; z < 2.25; j++, z += r * 0.5) {
    for (let x = -3.3 + (j % 2) * r; x < 3.4; x += 2 * r) {
      if (side < 0 ? x > r : x < -r) continue;
      ctx.beginPath();
      ctx.arc(x, z, r, 0, 2 * PI);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = `rgba(214, 240, 234, ${(0.1 + 0.05 * ((z + 2) / 4)).toFixed(3)})`;
      for (const k of [0.97, 0.7, 0.43]) {
        ctx.beginPath();
        ctx.arc(x, z, r * k, PI, 2 * PI);
        ctx.stroke();
      }
    }
  }
  // Sunset reflection from the far left, vignette toward the near corners.
  const warm = ctx.createRadialGradient(-1.25, -2.3, 0.1, -1.25, -2.3, 3.4);
  warm.addColorStop(0, 'rgba(252, 196, 150, 0.42)');
  warm.addColorStop(1, 'rgba(252, 196, 150, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(-3.2, -2.2, 6.4, 4.4);
  const vig = ctx.createRadialGradient(0, -0.5, 1.5, 0, -0.5, 4.2);
  vig.addColorStop(0, 'rgba(10, 30, 50, 0)');
  vig.addColorStop(1, 'rgba(10, 30, 50, 0.3)');
  ctx.fillStyle = vig;
  ctx.fillRect(-3.2, -2.2, 6.4, 4.4);
  // Rhumb lines from the two wind roses (portolan chart).
  ctx.lineWidth = 0.005;
  const rhumbColors = ['rgba(43, 38, 34, 0.2)', 'rgba(239, 138, 106, 0.32)', 'rgba(230, 246, 240, 0.22)'];
  for (const [cx, cz] of [[2.3, 1.42], [-2.45, 1.5]]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 2 * PI;
      ctx.strokeStyle = rhumbColors[i % 3];
      ctx.beginPath();
      ctx.moveTo(cx, cz);
      ctx.lineTo(cx + 8 * Math.cos(a), cz + 8 * Math.sin(a));
      ctx.stroke();
    }
  }
  // Sandy cove in the far-outer corner of the left page.
  if (side < 0) {
    const cove = () => {
      ctx.beginPath();
      ctx.moveTo(-3.2, -0.82);
      ctx.quadraticCurveTo(-2.62, -0.98, -2.42, -1.42);
      ctx.quadraticCurveTo(-2.24, -1.86, -1.7, -2.2);
      ctx.lineTo(-3.2, -2.2);
      ctx.closePath();
    };
    cove();
    ctx.strokeStyle = 'rgba(127, 205, 196, 0.75)';
    ctx.lineWidth = 0.26;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(251, 247, 238, 0.8)';
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.06, 0.035]);
    ctx.stroke();
    ctx.setLineDash([]);
    const sand = ctx.createLinearGradient(-2.4, -1.4, -3, -2);
    sand.addColorStop(0, '#d9bd88');
    sand.addColorStop(0.3, '#e5cd9b');
    sand.addColorStop(1, '#efdcb2');
    ctx.fillStyle = sand;
    ctx.fill();
    ctx.strokeStyle = '#c8a874';
    ctx.lineWidth = 0.025;
    ctx.stroke();
    ctx.fillStyle = 'rgba(150, 120, 90, 0.5)';
    for (const p of feats.pebbles) {
      ctx.beginPath();
      ctx.arc(p.x, p.z, p.r, 0, 2 * PI);
      ctx.fill();
    }
    palm(ctx, -2.85, -1.4, 1.2);
    palm(ctx, -2.62, -1.72, 1.0);
    palm(ctx, -2.95, -1.82, 0.9);
  }
  // The lighthouse island's shoal, under the island card.
  if (side > 0) {
    const sh = ctx.createRadialGradient(1.9, -0.6, 0.05, 1.9, -0.6, 0.62);
    sh.addColorStop(0, 'rgba(140, 214, 200, 0.9)');
    sh.addColorStop(1, 'rgba(140, 214, 200, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(1.9, -0.6, 0.66, 0.38, -0.23, 0, 2 * PI);
    ctx.fill();
    ctx.fillStyle = '#e5cd9b';
    ctx.beginPath();
    ctx.ellipse(1.9, -0.6, 0.5, 0.17, -0.23, 0, 2 * PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 247, 238, 0.8)';
    ctx.lineWidth = 0.02;
    ctx.setLineDash([0.05, 0.03]);
    ctx.beginPath();
    ctx.ellipse(1.9, -0.6, 0.56, 0.22, -0.23, 0, 2 * PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Printed whale and fish schools (dark sea-ink silhouettes).
  ctx.fillStyle = 'rgba(16, 40, 62, 0.5)';
  for (const f of feats.fish) fishIcon(ctx, f.x, f.z, f.len, f.ang);
  if (side < 0) {
    ctx.save();
    ctx.translate(-1.15, 1.58);
    ctx.rotate(-0.08);
    ctx.beginPath();
    ctx.moveTo(0.5, 0.02);
    ctx.bezierCurveTo(0.5, -0.2, 0.1, -0.24, -0.25, -0.12);
    ctx.quadraticCurveTo(-0.45, -0.05, -0.55, -0.12);
    ctx.lineTo(-0.66, -0.2);
    ctx.quadraticCurveTo(-0.62, -0.06, -0.58, -0.02);
    ctx.quadraticCurveTo(-0.62, 0.04, -0.68, 0.14);
    ctx.lineTo(-0.56, 0.06);
    ctx.quadraticCurveTo(-0.4, 0.04, -0.25, 0.1);
    ctx.bezierCurveTo(0.05, 0.2, 0.45, 0.2, 0.5, 0.02);
    ctx.fillStyle = 'rgba(16, 40, 62, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 240, 234, 0.35)';
    ctx.lineWidth = 0.008;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0.4 - i * 0.02, 0.06 + i * 0.022);
      ctx.quadraticCurveTo(0.05, 0.12 + i * 0.022, -0.2, 0.07 + i * 0.012);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230, 246, 240, 0.8)';
    ctx.beginPath();
    ctx.arc(0.33, -0.02, 0.018, 0, 2 * PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 246, 240, 0.6)';
    ctx.lineWidth = 0.01;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(0.16, -0.17);
      ctx.quadraticCurveTo(0.16 + a * 0.08, -0.3, 0.16 + a * 0.16, -0.34);
      ctx.stroke();
    }
    ctx.restore();
  }
  // The dotted route of the boat, and a branch to the lighthouse.
  ctx.lineCap = 'round';
  ctx.setLineDash([0.035, 0.045]);
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = 'rgba(250, 238, 214, 0.85)';
  ctx.beginPath();
  ctx.moveTo(-3.1, 0.66);
  for (const p of feats.route) ctx.lineTo(p.x, p.z);
  ctx.quadraticCurveTo(2.6, 0.98, 3.1, 1.08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.95, 0.4);
  ctx.quadraticCurveTo(1.45, 0.15, 1.72, -0.32);
  ctx.stroke();
  ctx.setLineDash([]);
  // Foam ticks.
  ctx.strokeStyle = 'rgba(240, 250, 246, 0.5)';
  ctx.lineWidth = 0.008;
  for (const f of feats.ticks) {
    ctx.beginPath();
    ctx.arc(f.x, f.z, f.r, PI * 1.15, PI * 1.85);
    ctx.stroke();
  }
  compassRose(ctx, 2.3, 1.42, 0.34, false);
  compassRose(ctx, -2.45, 1.5, 0.2, true);
  // Double-rule border.
  const x0 = side < 0 ? -2.9 : 0.12;
  const x1 = side < 0 ? -0.12 : 2.9;
  ctx.strokeStyle = 'rgba(246, 236, 214, 0.75)';
  ctx.lineWidth = 0.012;
  ctx.strokeRect(x0, -1.9, x1 - x0, 3.8);
  ctx.lineWidth = 0.004;
  ctx.strokeRect(x0 + 0.035, -1.865, x1 - x0 - 0.07, 3.73);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------------------- the spread

export default {
  id: 'sea',
  title: 'The Folded Sea',
  build({ THREE, paper, popup, rng }) {
    const group = new THREE.Group();
    group.name = 'spread-sea';
    const mechs = [];

    /** Paints art over x ∈ [x0, x1], y ∈ [y0, y1] (units, y up) into a die-cut canvas. */
    const art = (x0, x1, y0, y1, draw, { cut = 8, grain = 0.05, ppu = PX } = {}) => {
      const s = Math.min(ppu, 1024 / (x1 - x0), 1024 / (y1 - y0));
      const W = Math.round((x1 - x0) * s);
      const H = Math.round((y1 - y0) * s);
      const sx = W / (x1 - x0);
      const sy = H / (y1 - y0);
      const canvas = paper.paint(W, H, (ctx) => {
        ctx.setTransform(sx, 0, 0, -sy, -x0 * sx, y1 * sy);
        draw(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }, { dieCut: cut, grain, seed: rng.int(1, 1e6) });
      return { canvas, x0, y0, width: x1 - x0, height: y1 - y0 };
    };
    /** A card whose art-space origin coincides with the parent's origin. */
    const place = (a, parent) => {
      const c = paper.card({ canvas: a.canvas, width: a.width, height: a.height, anchor: 'bottom-left' });
      c.position.set(a.x0, a.y0, 0);
      parent.add(c);
      return c;
    };

    // ------------------------------------------------------------------ sky backdrop
    const sky = popup.vFold({ z0: SKY.z0, gamma: GAMMA, width: 2 * SKY.L, height: SKY.H + 0.03 });
    mechs.push(sky);
    const skyFeats = {
      rnd: rng,
      streaks: Array.from({ length: 11 }, () => ({
        x: rng.range(-2.3, 2.3), y: rng.range(0.62, 1.68), w: rng.range(0.5, 1.4), h: rng.range(0.035, 0.08),
      })),
      stars: Array.from({ length: 7 }, () => ({ x: rng.range(-2.2, 2.2), y: rng.range(1.5, 1.78), r: rng.range(0.008, 0.016) })),
      birds: Array.from({ length: 4 }, () => ({ x: rng.range(0.4, 1.7), y: rng.range(1.05, 1.5), s: rng.range(0.025, 0.04) })),
      glitter: Array.from({ length: 22 }, (_, i) => {
        const y = 0.36 - (i / 22) * 0.34;
        const spread = 0.06 + (0.36 - y) * 0.9;
        return { x: SUN.x + rng.range(-spread, spread), y, l: rng.range(0.05, 0.16) * (1 + (0.36 - y) * 2), w: 0.006 + (0.36 - y) * 0.02 };
      }),
    };
    const sp1 = rng.range(0, 6);
    const skyTop = (x) => {
      const arch = SKY.H - 0.1 - 0.16 * (x / SKY.L) * (x / SKY.L);
      const u = 2 * frac(x / 0.34 + sp1) - 1;
      return (arch + 0.07 * Math.sqrt(Math.max(0, 1 - u * u))) * endTaper(x, SKY.L - 0.03, 0.45);
    };
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -SKY.L : 0;
      const x1 = side < 0 ? 0 : SKY.L;
      const a = art(x0, x1, 0, SKY.H, (ctx) => drawSkyHalf(ctx, x0, x1, skyTop, skyFeats), { ppu: 400 });
      place(a, side < 0 ? sky.left : sky.right);
    }
    const sunPivot = new THREE.Group();
    sky.left.add(sunPivot);
    const R = SUN.r + 0.03;
    place(art(-R, R, -R, R, drawSun), sunPivot);
    const clouds = [
      { side: -1, x: -0.72, y: 1.22, w: 0.95, h: 0.36, z: 0.026, amp: 0.1, w0: 0.21, p: 0.5 },
      { side: -1, x: -1.98, y: 1.42, w: 0.66, h: 0.27, z: 0.02, amp: 0.08, w0: 0.17, p: 2.0 },
      { side: 1, x: 0.95, y: 1.47, w: 1.0, h: 0.38, z: 0.022, amp: 0.12, w0: 0.15, p: 4.1 },
    ].map((c) => {
      const pivot = new THREE.Group();
      (c.side < 0 ? sky.left : sky.right).add(pivot);
      place(art(-c.w / 2 - 0.03, c.w / 2 + 0.03, -c.h / 2 - 0.03, c.h / 2 + 0.03, (ctx) => drawCloud(ctx, c.w, c.h, rng)), pivot);
      return { ...c, pivot };
    });

    // ------------------------------------------------------------------ wave rows
    const rows = ROWS.map((row) => {
      const shape = rowShape(rng, row);
      const fold = popup.vFold({ z0: row.z0, gamma: GAMMA });
      mechs.push(fold);
      // Motion budget: the crest strip's straight lower edge (height cb) must stay above the page
      // (cb − rock·arm ≥ 0.004) and below the base (cb + bob + rock·arm ≤ min smooth top − 0.012),
      // and its hidden top line (smooth − CREST_DROP) below the base: bob + rock·arm ≤ CREST_DROP − 0.012.
      const arm = shape.crestEnd - 0.17;
      const reach = Math.min((shape.minSmooth - 0.016 - row.bob) / 2, CREST_DROP - 0.012 - row.bob);
      const rock = Math.max(0, Math.min(row.rock, reach / arm));
      const cb = 0.004 + rock * arm;
      const halves = [-1, 1].map((side) => {
        const mount = side < 0 ? fold.left : fold.right;
        const bx0 = side < 0 ? -row.L : 0;
        const bx1 = side < 0 ? 0 : row.L;
        place(art(bx0, bx1, 0, shape.maxBase + 0.035, (ctx) => drawRowBase(ctx, row, shape, bx0, bx1, rng)), mount);
        const cx0 = side < 0 ? -(shape.crestEnd + 0.03) : CREST_GAP;
        const cx1 = side < 0 ? -CREST_GAP : shape.crestEnd + 0.03;
        const pivot = new THREE.Group();
        const px = side * 0.2;
        const crestArt = art(cx0, cx1, cb, shape.maxCrest + 0.035, (ctx) => drawRowCrest(ctx, row, shape, cx0, cx1, cb, rng));
        place(crestArt, pivot).position.x -= px;
        mount.add(pivot);
        return { pivot, px, rf: side < 0 ? 0.83 : 1.09, rp: side < 0 ? 2.4 : 0.6 };
      });
      return { row, fold, halves, rock, sway: Math.min(row.sway, CREST_GAP - 0.012), omega: (2 * PI) / row.period };
    });

    // ------------------------------------------------------------------ lighthouse
    const lhRow = rows[LH.row];
    const lhPivot = new THREE.Group();
    lhPivot.position.set(LH.m, 0, 0);
    lhRow.fold.right.add(lhPivot);
    const lhArt = art(-LH.w / 2, LH.w / 2, 0, LH.h, (ctx) => drawLighthouse(ctx, false), { ppu: 420 });
    const lhCard = place(lhArt, lhPivot);
    {
      const { canvas, ctx } = paper.makeCanvas(lhArt.canvas.width, lhArt.canvas.height);
      const sx = canvas.width / LH.w;
      const sy = canvas.height / LH.h;
      ctx.setTransform(sx, 0, 0, -sy, (LH.w / 2) * sx, LH.h * sy);
      drawLighthouse(ctx, true);
      const front = lhCard.userData.front;
      front.material.emissive = new THREE.Color('#ffffff');
      front.material.emissiveMap = paper.texture(canvas);
      front.material.emissiveIntensity = 0;
    }
    const lhFront = lhCard.userData.front.material;
    const lamp = new THREE.Group();
    lamp.position.set(0, LH.lamp, 0.03);
    lhPivot.add(lamp);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffe2a8') }, uIntensity: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying float vFacing;
        void main() {
          vAlong = 1.0 - uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vFacing = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        varying float vAlong;
        varying float vFacing;
        void main() {
          float fall = pow(1.0 - vAlong, 2.5) * smoothstep(0.0, 0.06, vAlong);
          gl_FragColor = vec4(uColor * uIntensity * pow(vFacing, 2.2) * fall, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.3, 2.4, 24, 1, true);
    beamGeo.translate(0, -1.2, 0);
    beamGeo.rotateZ(PI / 2);
    beamGeo.rotateZ(-0.07); // aimed slightly down at the sea
    const beamPivot = new THREE.Group();
    lamp.add(beamPivot);
    for (const yaw of [0, PI]) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.y = yaw;
      beam.renderOrder = 10;
      beam.userData.light = true;
      beamPivot.add(beam);
    }
    const glowTex = (() => {
      const { canvas, ctx } = paper.makeCanvas(128, 128);
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.25, 'rgba(255, 255, 255, 0.45)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return paper.texture(canvas);
    })();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glow.scale.setScalar(0.5);
    glow.renderOrder = 11;
    glow.userData.light = true;
    lamp.add(glow);
    const lampLight = new THREE.PointLight('#ffc978', 0, 3.4, 2);
    lamp.add(lampLight);

    // ------------------------------------------------------------------ boat, carrier swell, big wave
    const boatRoot = new THREE.Group();
    const boatBody = new THREE.Group();
    boatBody.name = 'sea-boat';
    const boat = paper.boat({ scale: BOAT_SCALE });
    // The reader sees the boat's shaded flank; a faint self-lift keeps the white paper reading as white.
    boat.traverse((o) => {
      if (o.isMesh) {
        o.material.emissive = new THREE.Color('#fff1dc');
        o.material.emissiveIntensity = 0.16;
      }
    });
    boatBody.add(boat);
    boatRoot.add(boatBody);
    const lane = new THREE.Group();
    place(art(-0.3, 0.3, 0, 0.25, (ctx) => drawCarrier(ctx, rng)), lane).position.z = CARRIER_Z;
    const bigWave = new THREE.Group();
    const bigArt = art(-0.97, 0.97, 0, WAVE.peak + 0.06, (ctx) => drawBigWave(ctx, rng));
    place(bigArt, bigWave);
    bigWave.userData.slot = true; // rises out of a slot in the page: its hidden part is below the page
    lane.add(bigWave);
    // Props are posed in open-flat coordinates; on the left page they fold with it (about +Z by α − π).
    const boatFrame = new THREE.Group();
    boatFrame.add(boatRoot, lane);
    group.add(boatFrame);

    // ------------------------------------------------------------------ gulls
    const gullGeo = new THREE.BufferGeometry();
    gullGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0.028, 0, 0, -0.035, 0, 0, -0.02, 0.014, 0.05,
      0.028, 0, 0, -0.02, 0.014, 0.05, 0.022, 0.016, 0.05,
      0.022, 0.016, 0.05, -0.02, 0.014, 0.05, -0.04, -0.004, 0.11,
    ], 3));
    gullGeo.setAttribute('color', new THREE.Float32BufferAttribute([
      1, 1, 1, 0.92, 0.92, 0.92, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 0.25, 0.24, 0.26,
    ], 3));
    gullGeo.computeVertexNormals();
    const gullMat = new THREE.MeshStandardMaterial({ color: '#fbf7ee', vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    const lhAxis = { x: LH.m * SG, z: lhRow.row.z0 + LH.m * CG };
    const gulls = [
      { r: 0.62, y: 1.62, w: 0.52, p: 0.3 },
      { r: 0.78, y: 2.08, w: 0.41, p: 2.5 },
      { r: 0.85, y: 1.84, w: 0.46, p: 4.4 },
    ].map((g, i) => {
      const root = new THREE.Group();
      root.rotation.order = 'YXZ';
      root.userData.flier = true; // flies in the air, also beyond the page edges; gone before the fold
      const wings = [1, -1].map((s) => {
        const m = new THREE.Mesh(gullGeo, gullMat);
        m.scale.z = s;
        m.castShadow = true;
        root.add(m);
        return m;
      });
      group.add(root);
      return { ...g, i, root, wings, in: [2.4 + 0.4 * i, 2.0 + 0.3 * i, -1.2 + 0.5 * i], out: [1.6 - 0.5 * i, 2.6, -2.0 + 0.4 * i] };
    });
    const gp = { x: 0, y: 0, z: 0 };
    const gq = { x: 0, y: 0, z: 0 };
    /** Gull i's position at time t: circling the lighthouse, flying in 31–33.8 and out 47.6–49.2. */
    const gullAt = (g, t, out) => {
      const th = g.p + g.w * t;
      const arrive = 1 - smoothstep(31, 33.8, t);
      const leave = smoothstep(47.6, 49.2, t);
      out.x = lhAxis.x + g.r * Math.cos(th) + g.in[0] * arrive * arrive + g.out[0] * leave * leave;
      out.y = g.y + 0.06 * Math.sin(1.3 * t + g.i) + g.in[1] * arrive * arrive + g.out[1] * leave * leave;
      out.z = lhAxis.z + g.r * Math.sin(th) + g.in[2] * arrive * arrive + g.out[2] * leave * leave;
      return out;
    };

    // ------------------------------------------------------------------ leaping fish
    const fishRoot = new THREE.Group();
    const fishZ = 0.5 * (rows[1].row.z0 + rows[2].row.z0) + (Math.abs(FISH.x) / SG) * CG;
    fishRoot.position.set(FISH.x, 0, fishZ);
    fishRoot.rotation.y = -ROW_YAW;
    const fish = new THREE.Group();
    place(art(-0.18, 0.18, -0.09, 0.09, drawFish), fish);
    fishRoot.add(fish);
    const fishFrame = new THREE.Group();
    fishFrame.add(fishRoot);
    group.add(fishFrame);

    // ------------------------------------------------------------------ page art
    const pageFeats = {
      pebbles: Array.from({ length: 26 }, () => ({ x: rng.range(-3, -2.3), z: rng.range(-1.95, -1.1), r: rng.range(0.006, 0.014) })),
      fish: [
        ...Array.from({ length: 7 }, (_, i) => ({ x: 0.5 + (i % 4) * 0.13 + rng.range(-0.03, 0.03), z: 1.62 + Math.floor(i / 4) * 0.1 + (i % 2) * 0.04, len: 0.11, ang: -0.15 })),
        ...Array.from({ length: 5 }, (_, i) => ({ x: -2.3 + i * 0.12, z: -0.1 + (i % 2) * 0.07, len: 0.09, ang: 0.25 })),
        ...Array.from({ length: 5 }, (_, i) => ({ x: 1.1 + (i % 3) * 0.12, z: 1.9 - Math.floor(i / 3) * 0.08, len: 0.08, ang: 0.1 })),
      ],
      ticks: Array.from({ length: 70 }, () => ({ x: rng.range(-2.9, 2.9), z: rng.range(-1.9, 1.9), r: rng.range(0.025, 0.045) }))
        .filter((f) => !(f.x < -2.2 && f.z < -1.0)),
      route: Array.from({ length: 60 }, (_, i) => pathAt(PATH.t0 + ((PATH.t1 - PATH.t0) * i) / 59, { x: 0, z: 0 })),
    };
    const leftArt = paper.page((ctx) => drawSeaPage(ctx, -1, pageFeats), { seed: 2201 });
    const rightArt = paper.page((ctx) => drawSeaPage(ctx, 1, pageFeats), { seed: 2202 });

    const folds = popup.collection(mechs);
    group.add(folds.object);

    const P = { x: 0, z: 0 };
    const Pa = { x: 0, z: 0 };
    const Pb = { x: 0, z: 0 };

    return {
      group,
      leftArt,
      rightArt,
      update(alpha, t) {
        folds.update(alpha);
        const live = popup.rise(alpha, 0.8, 0.99); // theatre motion amplitude
        const lift = popup.rise(alpha, 0.3, 0.9); // layer stand-offs
        const lit = popup.rise(alpha, 0.92, 1);

        // Sky: sun sinks through the spread, clouds drift.
        sunPivot.position.set(SUN.x, SUN.y0 + (SUN.y1 - SUN.y0) * smoothstep(30, 49, t), 0.012 * lift);
        for (const c of clouds) c.pivot.position.set(c.x + c.amp * Math.sin(c.w0 * t + c.p), c.y, c.z * lift);

        // Wave machine: each row's crests bob and rock on their own phase.
        for (const r of rows) {
          const ph = r.omega * t + r.row.phase;
          const bob = r.row.bob * (0.5 + 0.5 * Math.sin(ph)) * live;
          const sway = r.sway * Math.cos(ph) * live;
          for (const h of r.halves) {
            h.pivot.position.set(h.px + sway, bob, -0.006 * lift);
            h.pivot.rotation.z = r.rock * Math.sin(ph * h.rf + h.rp) * live;
          }
        }

        // Lighthouse: stand-off, lantern, beam.
        lhPivot.position.z = LH.standoff * lift;
        const moment = smoothstep(36.3, 37.6, t) * (1 - smoothstep(41.6, 42.8, t));
        beamPivot.rotation.y = (2 * PI * t) / BEAM_PERIOD;
        const face = Math.abs(Math.cos(beamPivot.rotation.y + PI / 2 + ROW_YAW)); // a beam faces the reader
        const level = (0.55 + 0.45 * moment) * lit;
        beamMat.uniforms.uIntensity.value = 0.6 * level * (0.8 + 0.2 * face);
        glow.material.opacity = level * (0.65 + 0.35 * face * face);
        glow.scale.setScalar(0.42 + 0.22 * face * face * lit);
        lampLight.intensity = 1.6 * level * (0.8 + 0.2 * face);
        lhFront.emissiveIntensity = 0.9 * lit + 0.2 * moment;

        // Boat along the waypoints, on its carrier swell; the big wave rises under it 42–46.
        const s = popup.rise(alpha, 0.5, 0.97);
        const shown = s > 0.001;
        boatRoot.visible = shown;
        lane.visible = shown;
        pathAt(t, P);
        boatFrame.rotation.z = P.x < 0 ? alpha - PI : 0;
        const tc = clamp(t, PATH.t0, PATH.t1);
        pathAt(Math.max(PATH.t0, tc - 0.3), Pa);
        pathAt(Math.min(PATH.t1, tc + 0.3), Pb);
        const scale = Math.max(s, 0.001);
        boatRoot.position.set(P.x, 0, P.z);
        boatRoot.rotation.y = Math.atan2(-(Pb.z - Pa.z), Pb.x - Pa.x);
        boatRoot.scale.setScalar(scale);
        const laneYaw = ROW_YAW * Math.tanh(P.x / 0.35);
        lane.position.set(P.x, 0, P.z);
        lane.rotation.y = laneYaw;
        lane.scale.setScalar(scale);
        const A = waveAmount(t) * popup.rise(alpha, 0.85, 0.99);
        const wx = (WAVE.x - P.x) / Math.cos(laneYaw);
        const yOff = -WAVE.depth * (1 - A);
        bigWave.visible = A > 0.002;
        bigWave.position.set(wx, yOff, WAVE.z);
        const rest = BOAT_Y + 0.012 * Math.sin(1.9 * t + 0.4);
        const ride = waveProfile(-wx) + yOff - WAVE.sink;
        const onWave = smoothstep(-0.03, 0.04, ride - rest);
        boatBody.position.y = smax(rest, ride, 0.03);
        boatBody.rotation.z = Math.atan(waveSlope(-wx)) * onWave * 0.85 + 0.045 * Math.sin(1.3 * t + 1.1);
        boatBody.rotation.x = 0.075 * Math.sin(1.7 * t + 0.5) * (1 - 0.5 * onWave);

        // Gulls circle the lighthouse.
        const gullsOn = t > 31 && t < 49.2 && alpha > 0.9 * PI;
        for (const g of gulls) {
          g.root.visible = gullsOn;
          if (!gullsOn) continue;
          gullAt(g, t, gp);
          gullAt(g, t + 0.05, gq);
          g.root.position.set(gp.x, gp.y, gp.z);
          g.root.rotation.y = Math.atan2(-(gq.z - gp.z), gq.x - gp.x);
          g.root.rotation.x = 0.32 * (1 - smoothstep(47.6, 48.6, t)); // bank into the circle
          g.root.rotation.z = Math.atan2(gq.y - gp.y, Math.hypot(gq.x - gp.x, gq.z - gp.z)) * 0.6;
          const near = smoothstep(31, 33.8, t) * (1 - smoothstep(47.6, 49.2, t));
          g.root.scale.setScalar(Math.max(0.001, 1.25 * near));
          const f = 0.25 + 0.5 * Math.sin(t * (6.2 + g.i * 0.7) + g.p);
          g.wings[0].rotation.x = -f;
          g.wings[1].rotation.x = f;
        }

        // A fish leaps between rows 2 and 3 on the left page.
        const k = Math.floor((t - FISH.t0) / FISH.period);
        const u = (t - FISH.t0 - k * FISH.period) / FISH.dur;
        const leaping = k >= 0 && k < FISH.jumps && u >= 0 && u <= 1 && alpha > 0.97 * PI;
        fish.visible = leaping;
        fishFrame.rotation.z = alpha - PI;
        if (leaping) {
          fish.position.set(-0.42 + 0.84 * u, 0.2 + 0.46 * 4 * u * (1 - u), 0);
          fish.rotation.z = Math.atan2(0.46 * 4 * (1 - 2 * u), 0.84);
          fish.scale.setScalar(Math.max(0.001, smoothstep(0, 0.1, u) * (1 - smoothstep(0.9, 1, u))));
        }
      },
    };
  },
};
