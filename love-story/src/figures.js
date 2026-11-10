/**
 * figures.js — the recurring characters of "Our Love Story", painted as die-cut paper dolls:
 * him, her, her little sister, their chihuahua and the family dog. Everything is drawn with
 * Canvas2D from a small articulated rig (torso, head, hair, two-segment arms and legs as rounded
 * cut-paper shapes), so every outfit × pose stays on-model. Deterministic; canvases are cached by
 * option key, so asking for the same figure twice costs nothing (treat returned canvases as
 * read-only). Units: 1 = 10 cm of book, as everywhere else.
 *
 * paintFigure(who, { outfit='casual', pose='stand', facing='right', px=512, seed=1,
 *                    hold, expression, handY, backpack }) -> canvas (transparent, die-cut, grain)
 *   who      'him' | 'her' | 'sister'
 *   outfit   'vest'    royal-blue store vest (yellow badge strip, name tag, walkie-talkie) over a dark
 *                      top, khaki trousers            (sister has no vest: she gets 'casual')
 *            'casual'  him: pale-blue shirt + jeans · her: coral top + jeans · sister: mustard jacket
 *            'school'  casual + backpack
 *            'party'   him: dark-brown shirt, black trousers · her: brown spotted dress · sister: red dotty dress
 *            'wedding' him: navy suit, bow tie, boutonnière · her: long white dress + bouquet · sister: blush dress, flower crown
 *   pose     'stand' | 'walk' | 'run' | 'wave' | 'sit' | 'point' | 'holdHandsL' | 'holdHandsR'
 *            | 'kneel' (on one knee, offering an open ring box — meant for him)
 *            | 'surprised' (hands to the face, delighted — meant for her)
 *            'sit' is a chair-height sit seen from the side (put a bench/chair card behind; the seat
 *            is at meta.anchors.seat). holdHandsL / holdHandsR stretch the arm on the picture's
 *            LEFT / RIGHT (whatever `facing` is) out to a common height, so the left partner uses
 *            holdHandsR, the right partner holdHandsL, and joinHands() makes the hands meet.
 *   facing   'right' | 'left' — the way the figure looks and walks (a mirror image).
 *   px       canvas HEIGHT in pixels (the width follows the pose). 512 suits a full-height figure
 *            in a wide shot; use 768–1024 for close-ups.
 *   seed     paper grain / pattern seed.
 *   hold     'iceCream' | 'bouquet' | 'phone' | 'ringBox' | 'leash' | null — something in the free
 *            hand ('leash' just holds the fist forward at meta.anchors.hand for a dog's leash).
 *            Defaults: her wedding outfit carries the bouquet, 'kneel' offers the ring box.
 *   expression 'smile' (default) | 'laugh' | 'wow' ('surprised' defaults to 'wow')
 *   handY    holdHands only: height of the joined hands above the ground in world units at the
 *            figure's natural size (default 0.485, reachable by all three characters).
 *   backpack true/false — force the backpack on/off (default: only with 'school').
 *
 *     const brian = paintFigure('him', { outfit: 'vest', pose: 'wave' });
 *     const marlin = paintFigure('her', { outfit: 'party', pose: 'surprised', facing: 'left', px: 768 });
 *     const sis = paintFigure('sister', { pose: 'walk', hold: 'iceCream' });
 *
 *   The canvas carries `canvas.meta = { kind, width, height, unitsPerPx, baseline, anchors }` in WORLD
 *   units at the figure's natural size (FIGURE.*): width/height of the whole canvas, baseline = how
 *   far the soles sit above the canvas bottom (the die-cut border below the feet, ~0.02), and
 *   anchors = points relative to the card's bottom-centre origin, x to the picture's right, y up:
 *   head (centre), top, handL, handR (picture-left / picture-right hand), hand (the "active" hand:
 *   the outstretched / holding / waving one), feet [0, baseline], and seat for 'sit'.
 *
 * paintDog(kind, { pose='sit', accessory=null, facing='right', px=384, seed=1, leashTo }) -> canvas
 *   kind       'chihuahua' (their dog: fawn coat, big ears folded at the tips, white chest, light-blue
 *              collar) | 'familyDog' (a fluffy white-and-brown small dog with a red collar)
 *   pose       'sit' | 'walk' | 'run'
 *   accessory  null | 'bowtie' | 'leash' — the leash runs from the collar up and BACK to a hand loop
 *              at meta.anchors.leashEnd (default: [-0.40, 0.46] from the dog's feet for a dog facing
 *              right, i.e. a walker's hand behind it; override with leashTo: [x, y], world units)
 *   px         canvas height in pixels without a leash (a leash makes the canvas taller, same scale).
 *
 *     const coco = paintDog('chihuahua', { pose: 'sit', accessory: 'bowtie' });
 *     const fluffy = paintDog('familyDog', { pose: 'walk', accessory: 'leash', facing: 'left' });
 *
 * FIGURE — natural standing heights in world units (soles to the top of the hair / ear tips):
 *   { himHeight: 1.0, herHeight: 0.9, sisterHeight: 0.62, chihuahuaHeight: 0.26, familyDogHeight: 0.3 }
 *   Cards are a little taller than this (head-room for a raised hand + the paper border).
 *
 * figureCard(paper, who, opts) -> paper.card group standing on its bottom-centre (feet), art toward +Z
 *   who   'him' | 'her' | 'sister' | 'chihuahua' | 'familyDog';  opts = the paint options above plus
 *   scale=1 (multiplies the natural size) and back (colour of the card's back, default paper cream).
 *   group.userData = { front, back, texture (from paper.card), width, height, baseline, anchors,
 *                      canvas, who } with width/height/anchors already multiplied by `scale`.
 *
 *     const him = figureCard(paper, 'him', { outfit: 'wedding', pose: 'holdHandsR' });
 *     const her = figureCard(paper, 'her', { outfit: 'wedding', pose: 'holdHandsL', facing: 'left' });
 *     him.position.set(-0.2, 0, 0.5);  mount.add(him, her);
 *     joinHands(him, her);                               // puts her beside him so the hands touch
 *     const dog = figureCard(paper, 'chihuahua', { pose: 'sit', accessory: 'bowtie' });
 *     dog.position.set(0.1, 0, 0.75);
 *
 * joinHands(leftCard, rightCard, overlap=0.012) — moves rightCard (x, y and z; same parent assumed,
 *   no rotation between them) so that its outstretched hand meets leftCard's. Returns rightCard.
 *
 * FIGURE_OPTIONS — the valid option values (for tools and dev pages).
 */
import { makeCanvas, paint, PAPER } from './paper.js';
import { mulberry32 } from './util/rng.js';

export const FIGURE = { himHeight: 1.0, herHeight: 0.9, sisterHeight: 0.62, chihuahuaHeight: 0.26, familyDogHeight: 0.3 };

export const FIGURE_OPTIONS = {
  who: ['him', 'her', 'sister'],
  outfit: ['vest', 'casual', 'school', 'party', 'wedding'],
  pose: ['stand', 'walk', 'run', 'wave', 'sit', 'point', 'holdHandsL', 'holdHandsR', 'kneel', 'surprised'],
  hold: ['iceCream', 'bouquet', 'phone', 'ringBox', 'leash'],
  expression: ['smile', 'laugh', 'wow'],
  dog: ['chihuahua', 'familyDog'],
  dogPose: ['sit', 'walk', 'run'],
  accessory: ['bowtie', 'leash'],
};

// ----------------------------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const sind = (d) => Math.sin(d * D2R);
const cosd = (d) => Math.cos(d * D2R);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const dark = (c, t = 0.2) => mix(c, '#2a1812', t);
const light = (c, t = 0.2) => mix(c, '#fff7e8', t);

/** Tapered capsule (two circles and their outer tangents) as a closed sub-path. */
function capsule(c, x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(r0 - r1) + 1e-6) {
    const x = r0 >= r1 ? x0 : x1;
    const y = r0 >= r1 ? y0 : y1;
    const r = Math.max(r0, r1);
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, TAU);
    c.closePath();
    return;
  }
  const a = Math.atan2(dy, dx);
  const th = Math.acos((r0 - r1) / d);
  c.moveTo(x0 + r0 * Math.cos(a + th), y0 + r0 * Math.sin(a + th));
  c.arc(x0, y0, r0, a + th, a - th + TAU);
  c.arc(x1, y1, r1, a - th, a + th);
  c.closePath();
}

// Path makers: each returns (ctx) => adds one closed sub-path.
const cap = (x0, y0, r0, x1, y1, r1) => (c) => capsule(c, x0, y0, r0, x1, y1, r1);
const circ = (x, y, r) => (c) => {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, TAU);
  c.closePath();
};
const ell = (x, y, rx, ry, rot = 0) => (c) => {
  c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.closePath();
};
const poly = (...pts) => (c) => {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
};
const rrect = (x, y, w, h, r) => (c) => {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};
/** Smooth (Catmull-Rom) closed or open curve through points. */
const smooth = (pts, closed = true) => (c) => {
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  c.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    c.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  if (closed) c.closePath();
};
const line = (...pts) => (c) => {
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
};

/** One cut-paper piece: all sub-shapes outlined together (outline outside only), then filled. */
function blob(ctx, fill, outline, lw, ...paths) {
  if (outline && lw > 0) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw * 2;
    for (const p of paths) {
      ctx.beginPath();
      p(ctx);
      ctx.stroke();
    }
  }
  ctx.fillStyle = fill;
  for (const p of paths) {
    ctx.beginPath();
    p(ctx);
    ctx.fill();
  }
}
function fillPath(ctx, col, path) {
  ctx.fillStyle = col;
  ctx.beginPath();
  path(ctx);
  ctx.fill();
}
function strokePath(ctx, col, w, path) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  path(ctx);
  ctx.stroke();
}
/** Runs draw() clipped to each path in turn (use opaque colours: overlaps are painted twice). */
function inside(ctx, paths, draw) {
  for (const p of Array.isArray(paths) ? paths : [paths]) {
    ctx.save();
    ctx.beginPath();
    p(ctx);
    ctx.clip();
    draw();
    ctx.restore();
  }
}

/** Two-bone IK: joint position for root (rx, ry), target (tx, ty); bend = +1 / -1 picks the side. */
function ik2(rx, ry, tx, ty, a, b, bend) {
  let dx = tx - rx;
  let dy = ty - ry;
  let d = Math.hypot(dx, dy) || 1e-6;
  const lim = clamp(d, Math.abs(a - b) + 1e-4, (a + b) * 0.998);
  dx *= lim / d;
  dy *= lim / d;
  d = lim;
  const ang = Math.atan2(dy, dx) + bend * Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  return { jx: rx + a * Math.cos(ang), jy: ry + a * Math.sin(ang), ex: rx + dx, ey: ry + dy };
}

// ----------------------------------------------------------------------------------------------
// People: proportions, colours
// ----------------------------------------------------------------------------------------------
// Rig space: world units, x toward the way the figure faces (canonical: right), y DOWN, ground at 0.
// Limb angles are degrees from "hanging straight down", positive toward +x.
// Limb index 0 = the side nearer the viewer (picture-left shoulder / hip), 1 = the far side.

const SPEC = {
  him: {
    H: 1.0, footH: 0.034, footL: 0.112, shin: 0.236, thigh: 0.226, hipW: 0.05,
    torso: 0.292, chestW: 0.119, waistW: 0.098, hipsW: 0.096,
    neck: 0.118, neckR: 0.031, headRx: 0.079, headRy: 0.088,
    upArm: 0.152, foreArm: 0.142, armR: [0.034, 0.0285, 0.0235], handR: 0.0275,
    legR: [0.05, 0.039, 0.031],
  },
  her: {
    H: 0.9, footH: 0.03, footL: 0.094, shin: 0.208, thigh: 0.2, hipW: 0.05,
    torso: 0.262, chestW: 0.098, waistW: 0.082, hipsW: 0.101,
    neck: 0.106, neckR: 0.025, headRx: 0.075, headRy: 0.083,
    upArm: 0.136, foreArm: 0.126, armR: [0.029, 0.0245, 0.02], handR: 0.0245,
    legR: [0.052, 0.038, 0.027],
  },
  sister: {
    H: 0.62, footH: 0.024, footL: 0.072, shin: 0.127, thigh: 0.12, hipW: 0.034,
    torso: 0.172, chestW: 0.07, waistW: 0.062, hipsW: 0.066,
    neck: 0.088, neckR: 0.02, headRx: 0.07, headRy: 0.075,
    upArm: 0.092, foreArm: 0.086, armR: [0.0235, 0.02, 0.0165], handR: 0.02,
    legR: [0.034, 0.027, 0.021],
  },
};

const LW = 0.0032; // outline width (world units)
const FRAME = 1.1; // canvas head-room: usable canvas height = FRAME × standing height
const INK = '#3a2620';
const HAIR = '#2b201d';
const HAIR_HI = '#5a463d';
const SKIN = { him: '#cc9566', her: '#d6a174', sister: '#dcab82' };

const COL = {
  vest: '#2764c9', vestDark: '#1b4a9c', vestLight: '#5a8fe6', badge: '#f8c634', tag: '#fbf7ee',
  tee: '#2f3142', teeHer: '#3b3447', khaki: '#c9ab78',
  denim: '#48699a', denimHer: '#6388ba', shirtBlue: '#cfe0f0', coral: '#e8705c',
  brownShirt: '#5e4031', black: '#2a292e', dressBrown: '#9c6c48', spot: '#553420',
  navy: '#2a3454', white: '#fefcf6', whiteLine: '#cdbfab', whiteShade: '#ece2d2',
  mustard: '#eab43c', teal: '#2f9590', tomato: '#dd523f', blush: '#f5c6c2', leaf: '#6da55a',
  gold: '#f0bd3a', rose: '#e58aa0', cone: '#d9a45b', pink: '#f29bb0',
};

const SHOES = {
  white: { col: '#f6f1e7', sole: '#d6cdbd', line: '#b9ad9a' },
  brown: { col: '#5b4336', sole: '#2e2420' },
  black: { col: '#2c282a', sole: '#141213' },
  pink: { col: '#f08da2', sole: '#fbf7ee' },
  teal: { col: '#2f9590', sole: '#fbf7ee' },
  pump: { col: '#4a3026', sole: '#2e1e18', low: true },
  ivory: { col: '#f6efe2', sole: '#d8ccb8', line: '#b9ad9a', low: true },
};

function personColours(who) {
  const skin = SKIN[who];
  return {
    skin,
    skinFar: dark(skin, 0.09),
    skinShade: dark(skin, 0.12),
    skinLine: dark(skin, 0.4),
    lips: who === 'him' ? '#8d4b3d' : '#b7483f',
    blush: 'rgba(226, 98, 84, 0.36)',
  };
}

// ----------------------------------------------------------------------------------------------
// Poses
// ----------------------------------------------------------------------------------------------

const HOLD_X = { him: 0.19, her: 0.185, sister: 0.14 };
const HOLD_Y = 0.485;

const standLegs = () => [
  { a: [-5, -2], foot: 0, dir: -1, len: 0.62 },
  { a: [5, 3], foot: 0, dir: 1, len: 0.9 },
];
const hangArms = () => [{ a: [-9, -3] }, { a: [9, 15] }];

const POSES = {
  stand: () => ({ look: [0.55, 0], legs: standLegs(), arms: hangArms() }),
  walk: () => ({
    lean: 3, look: [0.9, 0], hipScale: 0.45, sway: 0.3,
    legs: [{ a: [25, 9], foot: -14 }, { a: [-21, -40], foot: 40 }],
    arms: [{ a: [-25, -8] }, { a: [24, 54], z: 'back' }],
  }),
  run: () => ({
    lean: 13, look: [1, 0], hipScale: 0.4, sway: 1, tilt: -5,
    legs: [{ a: [66, -6], foot: 12 }, { a: [-33, -82], foot: 58 }],
    arms: [{ a: [-62, 26] }, { a: [46, 134], z: 'back' }],
  }),
  wave: () => ({
    look: [0.7, 0], tilt: 3, holdArm: 0, active: 1,
    legs: standLegs(),
    arms: [{ a: [-9, -3] }, { a: [126, 172], hand: 'open', z: 'back' }],
  }),
  sit: (S) => ({
    pelvisH: S.shin + S.footH + 0.004, lean: 1, hipScale: 0.35, look: [0.9, 0],
    legs: [{ to: [S.thigh * 0.95, S.footH], foot: 0 }, { to: [S.thigh * 0.95 + 0.028, S.footH], foot: 0 }],
    arms: [{ a: [14, 72] }, { a: [28, 80], z: 'back' }],
  }),
  point: (S) => ({
    lean: 2, look: [1, 0], holdArm: 0, active: 1,
    legs: standLegs(),
    arms: [{ a: [-38, 50] }, { a: [84, 88], hand: 'point', z: 'back' }],
  }),
  holdHandsR: (S, o) => ({
    look: [0.75, 0], holdArm: 0, active: 1,
    legs: standLegs(),
    arms: [{ a: [-9, -3] }, { to: () => [HOLD_X[o.who], -o.handY], bend: 1 }],
  }),
  holdHandsL: (S, o) => ({
    look: [0.2, 0], holdArm: 1, active: 0,
    legs: standLegs(),
    arms: [{ to: () => [-HOLD_X[o.who], -o.handY], bend: -1 }, { a: [9, 15] }],
  }),
  kneel: (S) => ({
    pelvisH: S.thigh * cosd(8) + S.legR[1] * 0.95, lean: 5, hipScale: 0.35, look: [1, -0.8], tilt: -8, holdArm: 1, active: 1,
    legs: [{ to: [S.thigh * 0.95, S.footH], foot: 0 }, { a: [-8, -96], foot: 78 }],
    arms: [
      { to: (J) => [lerp(J.legs[0].hx, J.legs[0].kx, 0.6), lerp(J.legs[0].hy, J.legs[0].ky, 0.6) - S.legR[0] * 0.9], bend: 1 },
      { a: [68, 98], z: 'back', hold: 'ringBox' },
    ],
  }),
  surprised: () => ({
    lean: -2, look: [0.45, -0.2], tilt: -2, expr: 'wow', holdArm: -1, active: 1,
    legs: [{ a: [-3, 1], foot: 0, dir: -1, len: 0.62 }, { a: [4, -1], foot: 0, dir: 1, len: 0.9 }],
    arms: [
      { a: [-25, 155], len: [0.75, 1], z: 'top' },
      { a: [25, -155], len: [0.75, 1], z: 'top' },
    ],
  }),
};

/** Arm angles for carrying something (i = arm index). */
const HOLD_ARM = {
  iceCream: (i) => (i ? [16, 140] : [-16, -140]),
  phone: (i) => (i ? [18, 146] : [-18, -146]),
  ringBox: (i) => (i ? [22, 104] : [-22, -104]),
  bouquet: (i) => (i ? [12, -54] : [-12, 54]),
  leash: (i) => (i ? [20, 62] : [-4, 40]),
};

function buildPose(S, o) {
  const P = POSES[o.pose](S, o);
  P.arms = P.arms.map((a) => ({ ...a }));
  P.legs = P.legs.map((l) => ({ dir: 1, len: 1, foot: 0, ...l }));
  const builtIn = P.arms.findIndex((a) => a.hold);
  if (o.hold === null) {
    if (builtIn >= 0) P.arms[builtIn].hold = null;
  } else if (o.hold && builtIn < 0 && (P.holdArm ?? 1) >= 0) {
    const i = P.holdArm ?? 1;
    P.arms[i] = { a: HOLD_ARM[o.hold](i), z: 'front', hold: o.hold };
    if (P.active === undefined || o.hold === 'leash') P.active = i;
  } else if (o.hold && builtIn >= 0) {
    P.arms[builtIn].hold = o.hold;
  }
  if (P.active === undefined) P.active = 1;
  return P;
}

function solveRig(S, P) {
  const hipDX = S.hipW * (P.hipScale ?? 1);
  const soleLow = (L) => {
    // lowest point of the sole below the ankle for this foot rotation
    const r = L.foot * D2R;
    const back = S.legR[2] * 1.08;
    const fl = S.footL * L.len;
    return Math.max(-back * Math.sin(r) + S.footH * Math.cos(r), fl * 0.72 * Math.sin(r) + S.footH * Math.cos(r));
  };
  const legs = P.legs.map((L, i) => {
    const hx = (i === 0 ? -1 : 1) * hipDX;
    if (L.to) return { L, hx, ik: true };
    const kx = hx + S.thigh * sind(L.a[0]);
    const ky = S.thigh * cosd(L.a[0]);
    const ax = kx + S.shin * sind(L.a[1]);
    const ay = ky + S.shin * cosd(L.a[1]);
    return { L, hx, kx, ky, ax, ay, low: Math.max(ay + soleLow(L), ky + S.legR[1]) };
  });
  const pelvisH = P.pelvisH ?? Math.max(...legs.filter((l) => !l.ik).map((l) => l.low));
  const py = -pelvisH;
  for (const l of legs) {
    l.hy = py;
    if (l.ik) {
      const k = ik2(l.hx, py, l.hx + l.L.to[0], -l.L.to[1], S.thigh, S.shin, l.L.bend ?? -1);
      l.kx = k.jx;
      l.ky = k.jy;
      l.ax = k.ex;
      l.ay = k.ey;
    } else {
      l.ky += py;
      l.ay += py;
    }
  }
  const lean = (P.lean ?? 0) * D2R;
  const ux = Math.sin(lean);
  const uy = -Math.cos(lean);
  const sc = { x: ux * S.torso, y: py + uy * S.torso };
  const shW = S.chestW - S.armR[0] * 0.55;
  const drop = S.armR[0] * 0.95;
  const shoulders = [-1, 1].map((s) => ({
    x: sc.x + Math.cos(lean) * shW * s - ux * drop,
    y: sc.y + Math.sin(lean) * shW * s - uy * drop,
  }));
  const hl = lean * 0.8 + (P.headLean ?? 0) * D2R;
  const head = { x: sc.x + Math.sin(hl) * S.neck, y: sc.y - Math.cos(hl) * S.neck };
  const J = { pelvis: { x: 0, y: py }, lean, sc, head, tilt: (P.lean ?? 0) * 0.4 + (P.tilt ?? 0), legs, shoulders, hipDX };
  J.arms = P.arms.map((A, i) => {
    const s = shoulders[i];
    const ua = S.upArm * (A.len?.[0] ?? 1);
    const fa = S.foreArm * (A.len?.[1] ?? 1);
    let ex, ey, wx, wy;
    if (A.to) {
      const [tx, ty] = A.to(J, S);
      const k = ik2(s.x, s.y, tx, ty, ua, fa, A.bend ?? 1);
      ex = k.jx;
      ey = k.jy;
      wx = k.ex;
      wy = k.ey;
    } else {
      ex = s.x + ua * sind(A.a[0]);
      ey = s.y + ua * cosd(A.a[0]);
      wx = ex + fa * sind(A.a[1]);
      wy = ey + fa * cosd(A.a[1]);
    }
    const d = Math.hypot(wx - ex, wy - ey) || 1;
    const dx = (wx - ex) / d;
    const dy = (wy - ey) / d;
    return { A, sx: s.x, sy: s.y, ex, ey, wx, wy, dx, dy, hx: wx + dx * S.handR * 0.7, hy: wy + dy * S.handR * 0.7 };
  });
  return J;
}

// ----------------------------------------------------------------------------------------------
// People: body pieces
// ----------------------------------------------------------------------------------------------

/**
 * Torso silhouette in the torso frame (origin = pelvis, shoulders at y = -S.torso).
 * grow widens it, hem = y of the bottom edge, flare widens the hem, v > 0 cuts a V opening that deep
 * (vw = its half-width at the neck in neck radii), top > 0 starts the piece that fraction below the
 * shoulders with a soft sweetheart edge (strapless bodice).
 */
function torsoPath(c, S, { grow = 0, hem = 0.02, flare = 0, v = 0, vw = 1.25, top = 0 } = {}) {
  const T = S.torso;
  const ys = -T;
  const sh = S.chestW + grow;
  const wa = S.waistW + grow;
  const hi = S.hipsW + grow + flare;
  const nk = S.neckR * vw;
  const yt = ys + T * top;
  if (top > 0) {
    c.moveTo(-sh - 0.003, yt);
  } else {
    c.moveTo(-nk, ys - 0.016);
    c.bezierCurveTo(-sh * 0.55, ys - 0.016, -sh * 0.98, ys - 0.01, -sh - 0.004, ys + 0.03);
  }
  c.bezierCurveTo(-sh - 0.004, ys + T * 0.36, -wa, ys + T * 0.42, -wa, ys + T * 0.62);
  c.bezierCurveTo(-wa, ys + T * 0.8, -hi, ys + T * 0.84, -hi, hem);
  c.quadraticCurveTo(0, hem + 0.012, hi, hem);
  c.bezierCurveTo(hi, ys + T * 0.84, wa, ys + T * 0.8, wa, ys + T * 0.62);
  if (top > 0) {
    c.bezierCurveTo(wa, ys + T * 0.42, sh + 0.004, ys + T * 0.36, sh + 0.003, yt);
    c.quadraticCurveTo(sh * 0.5, yt - 0.016, 0, yt + 0.008);
    c.quadraticCurveTo(-sh * 0.5, yt - 0.016, -sh - 0.003, yt);
  } else {
    c.bezierCurveTo(wa, ys + T * 0.42, sh + 0.004, ys + T * 0.36, sh + 0.004, ys + 0.03);
    c.bezierCurveTo(sh * 0.98, ys - 0.01, sh * 0.55, ys - 0.016, nk, ys - 0.016);
    if (v > 0) c.lineTo(0, ys + v);
  }
  c.closePath();
}

function pelvisPath(c, S, hipDX) {
  const hi = S.hipsW;
  const r = S.legR[0];
  const out = Math.max(hi, hipDX + r);
  c.moveTo(-hi + 0.004, -0.09);
  c.lineTo(hi - 0.004, -0.09);
  c.bezierCurveTo(hi + 0.002, -0.05, out, -0.02, hipDX + r * 0.92, r * 0.5);
  c.lineTo(0, r * 0.8);
  c.lineTo(-hipDX - r * 0.92, r * 0.5);
  c.bezierCurveTo(-out, -0.02, -hi - 0.002, -0.05, -hi + 0.004, -0.09);
  c.closePath();
}

function drawShoe(g, l, far) {
  const { ctx, S, O, lw } = g;
  const L = l.L;
  const sh = O.shoes;
  const fl = S.footL * L.len;
  const h = S.footH;
  const r = S.legR[2] * 1.08;
  const topY = sh.low ? h * 0.3 : -h * 0.35;
  ctx.save();
  ctx.translate(l.ax, l.ay);
  ctx.scale(L.dir, 1);
  ctx.rotate(L.foot * D2R);
  const path = (c) => {
    c.moveTo(-r, topY);
    c.lineTo(-r * 1.08, h * 0.7);
    c.quadraticCurveTo(-r * 1.08, h, -r * 0.6, h);
    c.lineTo(fl * 0.64, h);
    c.bezierCurveTo(fl * 0.84, h, fl * 0.84, h * 0.22, fl * 0.6, h * 0.12);
    c.bezierCurveTo(fl * 0.42, h * 0.02, r * 1.25, sh.low ? h * 0.5 : -h * 0.05, r, topY);
    c.closePath();
  };
  const col = far ? dark(sh.col, 0.1) : sh.col;
  blob(ctx, col, sh.line ?? dark(sh.col, 0.45), lw, path);
  inside(ctx, path, () => {
    ctx.fillStyle = sh.sole;
    ctx.fillRect(-r * 1.4, h * 0.74, fl + r * 3, h);
  });
  ctx.restore();
}

function drawLeg(g, i) {
  const { ctx, S, C, O, J, lw } = g;
  const l = J.legs[i];
  const far = i === 1;
  const [r0, r1, r2] = S.legR;
  const thigh = cap(l.hx, l.hy, r0, l.kx, l.ky, r1);
  const shin = cap(l.kx, l.ky, r1, l.ax, l.ay, r2);
  if (O.legs.kind === 'trousers') {
    const col = far ? dark(O.legs.col, 0.13) : O.legs.col;
    blob(ctx, col, dark(O.legs.col, 0.42), lw, thigh, shin);
    drawShoe(g, l, far);
  } else {
    const base = O.legs.col ?? C.skin;
    blob(ctx, far ? dark(base, 0.09) : base, O.legs.col ? dark(base, 0.4) : C.skinLine, lw, thigh, shin);
    drawShoe(g, l, far);
  }
}

function drawHand(g, a, type, skin) {
  const { ctx, S, C, lw } = g;
  const r = S.handR;
  const { hx, hy, dx, dy } = a;
  const px = dy;
  const py = -dx;
  const parts = [circ(hx, hy, r)];
  if (type === 'open') {
    for (const k of [-33, -11, 11, 33]) {
      const fx = dx * cosd(k) - dy * sind(k);
      const fy = dx * sind(k) + dy * cosd(k);
      parts.push(cap(hx + fx * r * 0.5, hy + fy * r * 0.5, r * 0.32, hx + fx * r * 1.8, hy + fy * r * 1.8, r * 0.27));
    }
    parts.push(cap(hx - px * r * 0.5, hy - py * r * 0.5, r * 0.34, hx - px * r * 1.4 + dx * r * 0.35, hy - py * r * 1.4 + dy * r * 0.35, r * 0.28));
  } else if (type === 'point') {
    parts.push(cap(hx, hy, r * 0.45, hx + dx * r * 2.3, hy + dy * r * 2.3, r * 0.31));
    parts.push(circ(hx + px * r * 0.62 + dx * r * 0.2, hy + py * r * 0.62 + dy * r * 0.2, r * 0.42));
  } else {
    parts.push(circ(hx + px * r * 0.72 - dx * r * 0.15, hy + py * r * 0.72 - dy * r * 0.15, r * 0.42));
  }
  blob(ctx, skin, C.skinLine, lw, ...parts);
}

function drawArm(g, i) {
  const { ctx, S, C, O, J, lw } = g;
  const a = J.arms[i];
  const A = a.A;
  const far = i === 1;
  const [r0, r1, r2] = S.armR;
  const skin = far ? C.skinFar : C.skin;
  const e = 0.0045;
  if (O.sleeve !== 'long') blob(ctx, skin, C.skinLine, lw, cap(a.sx, a.sy, r0, a.ex, a.ey, r1), cap(a.ex, a.ey, r1, a.wx, a.wy, r2));
  if (A.hold && PROPS_UNDER[A.hold]) PROPS_UNDER[A.hold](g, a, i);
  drawHand(g, a, A.hand ?? 'mitt', skin);
  if (O.sleeve === 'long') {
    const col = far ? dark(O.sleeveCol, 0.12) : O.sleeveCol;
    const ox = dark(O.sleeveCol, 0.42);
    const cx = a.wx - a.dx * S.foreArm * 0.06;
    const cy = a.wy - a.dy * S.foreArm * 0.06;
    if (O.cuff) blob(ctx, O.cuff, dark(O.cuff, 0.3), lw, cap(cx, cy, r2 + e * 0.6, a.wx + a.dx * 0.008, a.wy + a.dy * 0.008, r2 + e * 0.4));
    blob(ctx, col, ox, lw, cap(a.sx, a.sy, r0 + e, a.ex, a.ey, r1 + e), cap(a.ex, a.ey, r1 + e, cx, cy, r2 + e));
    if (O.sleeveArt) O.sleeveArt(g, [cap(a.sx, a.sy, r0 + e, a.ex, a.ey, r1 + e), cap(a.ex, a.ey, r1 + e, cx, cy, r2 + e)], far);
  } else if (O.sleeve === 'short') {
    const t = 0.58;
    const col = far ? dark(O.sleeveCol, 0.12) : O.sleeveCol;
    blob(ctx, col, dark(O.sleeveCol, 0.42), lw, cap(a.sx, a.sy, r0 + e, lerp(a.sx, a.ex, t), lerp(a.sy, a.ey, t), lerp(r0, r1, t) + e * 1.7));
  }
  if (A.hold && PROPS[A.hold]) PROPS[A.hold](g, a, i);
}

// ----------------------------------------------------------------------------------------------
// Props (drawn at a hand)
// ----------------------------------------------------------------------------------------------

function sparkle(ctx, x, y, r, col) {
  fillPath(ctx, col, (c) => {
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r, y);
    c.quadraticCurveTo(x, y, x, y - r);
    c.closePath();
  });
}

function rose(ctx, x, y, r, col, lw) {
  blob(ctx, col, dark(col, 0.3), lw, circ(x, y, r));
  strokePath(ctx, dark(col, 0.22), lw * 0.9, (c) => {
    c.moveTo(x + r * 0.55, y);
    c.arc(x, y, r * 0.55, 0, Math.PI * 1.35);
    c.moveTo(x + r * 0.15, y - r * 0.1);
    c.arc(x, y - r * 0.05, r * 0.18, 0, TAU);
  });
}

/** Things that sit behind the fingers. */
const PROPS_UNDER = {
  iceCream(g, a) {
    const { ctx, S, lw } = g;
    const k = S.handR / 0.0245;
    const x = a.hx;
    const y = a.hy - 0.004 * k;
    const cone = poly([x - 0.021 * k, y - 0.03 * k], [x + 0.021 * k, y - 0.03 * k], [x + 0.002 * k, y + 0.04 * k]);
    blob(ctx, COL.cone, dark(COL.cone, 0.4), lw, cone);
    inside(ctx, cone, () => {
      ctx.strokeStyle = dark(COL.cone, 0.25);
      ctx.lineWidth = lw * 0.8;
      for (let n = -3; n <= 3; n++) {
        ctx.beginPath();
        ctx.moveTo(x + n * 0.011 * k - 0.03 * k, y - 0.04 * k);
        ctx.lineTo(x + n * 0.011 * k + 0.03 * k, y + 0.04 * k);
        ctx.moveTo(x + n * 0.011 * k + 0.03 * k, y - 0.04 * k);
        ctx.lineTo(x + n * 0.011 * k - 0.03 * k, y + 0.04 * k);
        ctx.stroke();
      }
    });
    const vanilla = '#fbe9c4';
    blob(ctx, vanilla, dark(vanilla, 0.3), lw, circ(x + 0.004 * k, y - 0.078 * k, 0.023 * k));
    blob(ctx, COL.pink, dark(COL.pink, 0.32), lw, circ(x, y - 0.046 * k, 0.029 * k), circ(x - 0.02 * k, y - 0.031 * k, 0.009 * k), circ(x + 0.019 * k, y - 0.03 * k, 0.01 * k), circ(x, y - 0.028 * k, 0.011 * k));
    fillPath(ctx, light(COL.pink, 0.45), ell(x - 0.011 * k, y - 0.056 * k, 0.008 * k, 0.005 * k, -0.6));
    blob(ctx, COL.tomato, dark(COL.tomato, 0.35), lw, circ(x + 0.008 * k, y - 0.103 * k, 0.0085 * k));
  },
  bouquet(g, a) {
    const { ctx, S, lw } = g;
    const k = S.handR / 0.0245;
    const x = a.hx;
    const y = a.hy;
    // stems + ribbon below the hand
    blob(ctx, COL.leaf, dark(COL.leaf, 0.4), lw, poly([x - 0.011 * k, y - 0.01 * k], [x + 0.011 * k, y - 0.01 * k], [x + 0.006 * k, y + 0.055 * k], [x - 0.008 * k, y + 0.052 * k]));
    // leaves
    for (const [lx, ly, rot] of [[-0.048, -0.02, -0.5], [0.048, -0.022, 0.5], [-0.03, -0.004, -1.0], [0.032, -0.006, 1.0]]) {
      blob(ctx, COL.leaf, dark(COL.leaf, 0.4), lw, ell(x + lx * k, y + ly * k, 0.022 * k, 0.011 * k, rot));
    }
    const fl = [
      [-0.03, -0.034, 0.017, COL.blush], [0.031, -0.036, 0.017, '#fdf3df'], [0, -0.03, 0.019, COL.tomato],
      [-0.016, -0.058, 0.018, '#fdf3df'], [0.017, -0.06, 0.018, COL.blush], [0.001, -0.08, 0.015, COL.rose],
    ];
    for (const [fx, fy, fr, col] of fl) rose(ctx, x + fx * k, y + fy * k, fr * k, col, lw);
  },
  phone(g, a) {
    const { ctx, S, lw } = g;
    const k = S.handR / 0.0245;
    ctx.save();
    ctx.translate(a.hx, a.hy - 0.022 * k);
    ctx.rotate(0.14);
    blob(ctx, '#34363f', '#17181c', lw, rrect(-0.019 * k, -0.034 * k, 0.038 * k, 0.068 * k, 0.006 * k));
    fillPath(ctx, '#9fd3e6', rrect(-0.0145 * k, -0.027 * k, 0.029 * k, 0.05 * k, 0.003 * k));
    fillPath(ctx, '#d7eef6', poly([-0.0145 * k, -0.027 * k], [0.004 * k, -0.027 * k], [-0.0145 * k, 0.004 * k]));
    ctx.restore();
  },
};

/** Things that sit on top of the hand. */
const PROPS = {
  ringBox(g, a) {
    const { ctx, S, lw } = g;
    const k = S.handR / 0.0275;
    const x = a.hx + 0.004 * k;
    const y = a.hy - S.handR * 0.62;
    const w = 0.056 * k;
    const h = 0.027 * k;
    const lid = dark(COL.rose, 0.12);
    // open lid standing behind the box
    blob(ctx, lid, dark(COL.rose, 0.5), lw, rrect(x - w / 2 + 0.002 * k, y - h - 0.037 * k, w - 0.004 * k, 0.04 * k, 0.006 * k));
    fillPath(ctx, '#fbe9ea', rrect(x - w / 2 + 0.008 * k, y - h - 0.031 * k, w - 0.016 * k, 0.027 * k, 0.004 * k));
    // ring
    strokePath(ctx, dark(COL.gold, 0.25), lw * 3.2, (c) => c.arc(x, y - h - 0.004 * k, 0.0085 * k, 0, TAU));
    strokePath(ctx, COL.gold, lw * 1.9, (c) => c.arc(x, y - h - 0.004 * k, 0.0085 * k, 0, TAU));
    blob(ctx, '#eafaff', '#7fb6c9', lw * 0.8, poly([x, y - h - 0.026 * k], [x + 0.008 * k, y - h - 0.016 * k], [x, y - h - 0.008 * k], [x - 0.008 * k, y - h - 0.016 * k]));
    // base
    blob(ctx, COL.rose, dark(COL.rose, 0.5), lw, rrect(x - w / 2, y - h, w, h, 0.005 * k));
    fillPath(ctx, light(COL.rose, 0.35), rrect(x - w / 2 + 0.004 * k, y - h + 0.003 * k, w - 0.008 * k, 0.005 * k, 0.002 * k));
    // sparkle
    sparkle(ctx, x + 0.022 * k, y - h - 0.058 * k, 0.017 * k, COL.gold);
    sparkle(ctx, x - 0.024 * k, y - h - 0.07 * k, 0.01 * k, COL.gold);
    // thumb over the front of the box
    blob(ctx, g.C.skinFar, g.C.skinLine, lw, ell(x - 0.012 * k, y - 0.006 * k, 0.012 * k, 0.009 * k, 0.2));
  },
  iceCream(g, a) {
    const { ctx, S, C, lw } = g;
    blob(ctx, C.skin, C.skinLine, lw, ell(a.hx + S.handR * 0.1, a.hy + S.handR * 0.25, S.handR * 0.85, S.handR * 0.5, 0.1));
  },
  bouquet(g, a) {
    const { ctx, S, C, lw } = g;
    blob(ctx, C.skin, C.skinLine, lw, ell(a.hx, a.hy + S.handR * 0.2, S.handR * 0.85, S.handR * 0.55, 0));
    const k = S.handR / 0.0245;
    strokePath(ctx, COL.blush, lw * 2.2, line([a.hx - 0.01 * k, a.hy + 0.03 * k], [a.hx + 0.009 * k, a.hy + 0.031 * k]));
  },
  phone(g, a) {
    const { ctx, S, C, lw } = g;
    blob(ctx, C.skin, C.skinLine, lw, ell(a.hx + S.handR * 0.1, a.hy + S.handR * 0.3, S.handR * 0.9, S.handR * 0.5, 0.1));
  },
};

// ----------------------------------------------------------------------------------------------
// Heads and hair
// ----------------------------------------------------------------------------------------------

function facePath(c, rx, ry, jaw) {
  c.moveTo(0, -ry);
  c.bezierCurveTo(rx * 0.62, -ry, rx, -ry * 0.62, rx, -ry * 0.08);
  c.bezierCurveTo(rx, ry * 0.45, rx * jaw, ry * 0.82, rx * 0.36, ry * 0.97);
  c.quadraticCurveTo(0, ry * 1.05, -rx * 0.36, ry * 0.97);
  c.bezierCurveTo(-rx * jaw, ry * 0.82, -rx, ry * 0.45, -rx, -ry * 0.08);
  c.bezierCurveTo(-rx, -ry * 0.62, -rx * 0.62, -ry, 0, -ry);
  c.closePath();
}

function drawFeatures(g, lx, ly, expr) {
  const { ctx, S, C, o, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const who = o.who;
  const ey = ry * 0.15 + ly;
  const ex = rx * 0.41;
  const er = rx * (who === 'sister' ? 0.118 : 0.108) * (expr === 'wow' ? 1.14 : 1);
  ctx.lineCap = 'round';
  // cheeks
  ctx.fillStyle = C.blush;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(lx * 0.8 + s * rx * 0.6, ry * 0.5 + ly, rx * 0.2, ry * 0.14, 0, 0, TAU);
    ctx.fill();
  }
  // eyes
  if (expr === 'laugh') {
    for (const s of [-1, 1]) {
      strokePath(ctx, INK, lw * 1.7, (c) => c.arc(lx + s * ex, ey + er * 1.0, er * 1.45, Math.PI * 1.17, Math.PI * 1.83));
    }
  } else {
    for (const s of [-1, 1]) {
      fillPath(ctx, INK, ell(lx + s * ex, ey, er * 0.92, er * 1.08));
      fillPath(ctx, '#fffaf0', circ(lx + s * ex - er * 0.3, ey - er * 0.38, er * (expr === 'wow' ? 0.36 : 0.3)));
    }
    if (who !== 'him') {
      // lashes
      for (const s of [-1, 1]) {
        strokePath(ctx, INK, lw * 1.05, line([lx + s * (ex + er * 0.7), ey - er * 0.55], [lx + s * (ex + er * 1.75), ey - er * 1.2]));
      }
    }
  }
  // brows
  const by = ey - er * (expr === 'wow' ? 3.1 : 2.45);
  for (const s of [-1, 1]) {
    if (who === 'him') {
      strokePath(ctx, HAIR, lw * 2.1, line([lx + s * (ex - rx * 0.15), by + rx * 0.01], [lx + s * (ex + rx * 0.17), by - rx * 0.015]));
    } else {
      strokePath(ctx, HAIR, lw * 1.25, (c) => {
        c.moveTo(lx + s * (ex - rx * 0.15), by + rx * 0.02);
        c.quadraticCurveTo(lx + s * ex, by - rx * 0.06, lx + s * (ex + rx * 0.2), by + rx * 0.02);
      });
    }
  }
  // nose
  strokePath(ctx, C.skinLine, lw * 1.05, (c) => {
    c.moveTo(lx * 1.25 + rx * 0.03, ry * 0.34 + ly);
    c.quadraticCurveTo(lx * 1.25 + rx * 0.11, ry * 0.45 + ly, lx * 1.25 - rx * 0.02, ry * 0.45 + ly);
  });
  // mouth
  const my = ry * 0.62 + ly;
  const mw = rx * (who === 'sister' ? 0.24 : 0.27);
  if (expr === 'smile') {
    strokePath(ctx, C.lips, lw * (who === 'him' ? 1.65 : 1.85), (c) => c.arc(lx, my - mw * 0.75, mw, Math.PI * 0.16, Math.PI * 0.84));
  } else {
    const open = expr === 'wow' ? 1.15 : 1.0;
    const mouth = (c) => {
      c.moveTo(lx - mw, my - mw * 0.15);
      c.quadraticCurveTo(lx, my + mw * 0.05, lx + mw, my - mw * 0.15);
      c.bezierCurveTo(lx + mw * 0.85, my + mw * 1.05 * open, lx - mw * 0.85, my + mw * 1.05 * open, lx - mw, my - mw * 0.15);
      c.closePath();
    };
    blob(ctx, '#6f2a28', dark(C.lips, 0.2), lw * 0.9, mouth);
    inside(ctx, mouth, () => {
      fillPath(ctx, '#fffaf0', rrect(lx - mw, my - mw * 0.3, mw * 2, mw * 0.42, 0));
      fillPath(ctx, '#e8857f', ell(lx, my + mw * 0.95 * open, mw * 0.6, mw * 0.42));
    });
  }
}

/** Hair that hangs: pushes a hair point back (and a little up) when the figure moves fast. */
const swayPt = (sway) => ([x, y]) => {
  const t = clamp(y / 0.25, 0, 1.4);
  return [x - sway * 0.115 * Math.pow(t, 1.5), y - sway * 0.04 * t * t];
};

function hairBackHer(g) {
  const { ctx, S, J, P, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const sw = swayPt(P.sway ?? 0);
  const pts = [
    [0, -ry * 1.2], [rx * 1.08, -ry * 0.85], [rx * 1.45, -ry * 0.05], [rx * 1.62, 0.085], [rx * 1.5, 0.15], [rx * 1.6, 0.215],
    [rx * 1.15, 0.258], [rx * 0.55, 0.238], [0, 0.262], [-rx * 0.55, 0.238], [-rx * 1.15, 0.258],
    [-rx * 1.6, 0.215], [-rx * 1.5, 0.15], [-rx * 1.62, 0.085], [-rx * 1.45, -ry * 0.05], [-rx * 1.08, -ry * 0.85],
  ].map(sw);
  ctx.save();
  ctx.translate(J.head.x, J.head.y);
  blob(ctx, dark(HAIR, 0.25), '#150f0d', lw, smooth(pts));
  ctx.restore();
}

function hairFrontHer(g) {
  const { ctx, S, P, O, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const sw = swayPt(P.sway ?? 0);
  const L = 0.228;
  const pts = [
    [-rx * 1.1, L], [-rx * 1.5, L - 0.062], [-rx * 1.36, L - 0.125], [-rx * 1.5, 0.045], [-rx * 1.36, -ry * 0.3], [-rx * 1.02, -ry * 0.98],
    [-rx * 0.3, -ry * 1.24], [rx * 0.42, -ry * 1.22], [rx * 1.05, -ry * 0.92], [rx * 1.33, -ry * 0.28],
    [rx * 1.47, 0.045], [rx * 1.34, L - 0.125], [rx * 1.48, L - 0.062], [rx * 1.06, L],
    // inner edge, right lock going up
    [rx * 0.7, L - 0.04], [rx * 0.82, L - 0.1], [rx * 0.7, 0.075], [rx * 0.9, ry * 0.42], [rx * 0.93, -ry * 0.16],
    // hairline with a side part
    [rx * 0.72, -ry * 0.52], [rx * 0.3, -ry * 0.7], [-rx * 0.28, -ry * 0.5], [-rx * 0.78, -ry * 0.12],
    [-rx * 0.92, ry * 0.42], [-rx * 0.72, 0.075], [-rx * 0.84, L - 0.1], [-rx * 0.72, L - 0.04],
  ].map(sw);
  blob(ctx, HAIR, '#150f0d', lw, smooth(pts));
  // a few strands of shine
  ctx.lineCap = 'round';
  const hi = [
    [[-rx * 1.18, -ry * 0.25], [-rx * 1.32, 0.03], [-rx * 1.16, 0.085], [-rx * 1.27, 0.14]],
    [[rx * 1.14, -ry * 0.3], [rx * 1.3, 0.03], [rx * 1.14, 0.085], [rx * 1.24, 0.14]],
    [[rx * 0.25, -ry * 1.02], [-rx * 0.35, -ry * 0.92], [-rx * 0.8, -ry * 0.6]],
  ];
  for (const h of hi) strokePath(ctx, HAIR_HI, lw * 1.5, smooth(h.map(sw), false));
  if (O.hairFlower) {
    const x = -rx * 0.98;
    const y = -ry * 0.42;
    blob(ctx, COL.leaf, dark(COL.leaf, 0.4), lw, ell(x - rx * 0.2, y + ry * 0.18, rx * 0.2, ry * 0.09, 0.9));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU - 0.3;
      blob(ctx, '#fffaf0', COL.whiteLine, lw, circ(x + Math.cos(a) * rx * 0.17, y + Math.sin(a) * rx * 0.17, rx * 0.12));
    }
    fillPath(ctx, COL.gold, circ(x, y, rx * 0.09));
  }
}

function hairHim(g) {
  const { ctx, S, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const hair = (c) => {
    c.moveTo(-rx * 1.03, ry * 0.16);
    c.bezierCurveTo(-rx * 1.17, -ry * 0.55, -rx * 0.9, -ry * 1.16, -rx * 0.12, -ry * 1.17);
    c.bezierCurveTo(rx * 0.5, -ry * 1.22, rx * 1.02, -ry * 1.08, rx * 1.07, -ry * 0.5);
    c.bezierCurveTo(rx * 1.09, -ry * 0.28, rx * 1.05, -ry * 0.05, rx * 1.01, ry * 0.12);
    c.lineTo(rx * 0.9, ry * 0.1);
    c.bezierCurveTo(rx * 0.9, -ry * 0.2, rx * 0.86, -ry * 0.42, rx * 0.66, -ry * 0.56);
    c.bezierCurveTo(rx * 0.3, -ry * 0.8, -rx * 0.3, -ry * 0.66, -rx * 0.6, -ry * 0.4);
    c.bezierCurveTo(-rx * 0.8, -ry * 0.25, -rx * 0.88, -ry * 0.05, -rx * 0.89, ry * 0.16);
    c.closePath();
  };
  blob(ctx, HAIR, '#150f0d', lw, hair);
  ctx.lineCap = 'round';
  strokePath(ctx, HAIR_HI, lw * 1.5, (c) => {
    c.moveTo(-rx * 0.62, -ry * 0.84);
    c.bezierCurveTo(-rx * 0.2, -ry * 1.04, rx * 0.35, -ry * 1.04, rx * 0.72, -ry * 0.86);
  });
  strokePath(ctx, HAIR_HI, lw * 1.2, (c) => {
    c.moveTo(-rx * 0.3, -ry * 0.82);
    c.quadraticCurveTo(rx * 0.2, -ry * 0.92, rx * 0.55, -ry * 0.74);
  });
}

function ponytail(g) {
  const { ctx, S, J, P, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const s = P.sway ?? 0;
  const sw = ([x, y]) => [x - s * rx * 0.55 * clamp((y + ry) / (ry * 2), 0, 1.2), y - s * ry * 0.5 * clamp((y + ry * 0.5) / (ry * 1.6), 0, 1.2)];
  const pts = [
    [-rx * 0.6, -ry * 0.98], [-rx * 1.3, -ry * 1.28], [-rx * 1.92, -ry * 0.8], [-rx * 2.02, ry * 0.1], [-rx * 1.72, ry * 0.95],
    [-rx * 1.48, ry * 0.35], [-rx * 1.36, -ry * 0.25], [-rx * 0.95, -ry * 0.6],
  ].map(sw);
  ctx.save();
  ctx.translate(J.head.x, J.head.y);
  ctx.rotate(J.tilt * D2R);
  blob(ctx, HAIR, '#150f0d', lw, smooth(pts));
  strokePath(ctx, HAIR_HI, lw * 1.4, smooth([[-rx * 1.35, -ry * 0.95], [-rx * 1.75, -ry * 0.45], [-rx * 1.78, ry * 0.25]].map(sw), false));
  ctx.restore();
}

function hairSister(g) {
  const { ctx, S, O, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const hair = (c) => {
    c.moveTo(-rx * 1.04, ry * 0.34);
    c.bezierCurveTo(-rx * 1.2, -ry * 0.6, -rx * 0.82, -ry * 1.2, 0, -ry * 1.19);
    c.bezierCurveTo(rx * 0.82, -ry * 1.2, rx * 1.2, -ry * 0.6, rx * 1.04, ry * 0.34);
    c.lineTo(rx * 0.88, ry * 0.3);
    c.bezierCurveTo(rx * 0.92, -ry * 0.1, rx * 0.84, -ry * 0.3, rx * 0.64, -ry * 0.4);
    c.quadraticCurveTo(rx * 0.38, -ry * 0.2, rx * 0.12, -ry * 0.42);
    c.quadraticCurveTo(-rx * 0.2, -ry * 0.2, -rx * 0.52, -ry * 0.42);
    c.bezierCurveTo(-rx * 0.82, -ry * 0.3, -rx * 0.92, -ry * 0.1, -rx * 0.88, ry * 0.3);
    c.closePath();
  };
  blob(ctx, HAIR, '#150f0d', lw, hair);
  ctx.lineCap = 'round';
  strokePath(ctx, HAIR_HI, lw * 1.5, (c) => {
    c.moveTo(-rx * 0.6, -ry * 0.86);
    c.bezierCurveTo(-rx * 0.2, -ry * 1.04, rx * 0.3, -ry * 1.04, rx * 0.66, -ry * 0.84);
  });
  // scrunchie
  const sc = O.scrunchie ?? COL.teal;
  blob(ctx, sc, dark(sc, 0.4), lw, ell(-rx * 0.8, -ry * 0.9, rx * 0.2, ry * 0.13, -0.75));
  if (O.flowerCrown) {
    const cols = [COL.blush, '#fffaf0', COL.rose, '#fffaf0', COL.blush];
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * (1.2 + 0.6 * (k / 4));
      const x = Math.cos(a) * rx * 0.98;
      const y = Math.sin(a) * ry * 0.98 - ry * 0.02;
      blob(ctx, cols[k], dark(cols[k], 0.3), lw, circ(x, y, rx * 0.15));
      fillPath(ctx, COL.gold, circ(x, y, rx * 0.05));
    }
  }
}

function drawHead(g) {
  const { ctx, S, C, J, P, o, lw } = g;
  const rx = S.headRx;
  const ry = S.headRy;
  const who = o.who;
  const look = P.look ?? [0.5, 0];
  const lx = look[0] * rx * 0.15;
  const ly = look[1] * ry * 0.1;
  ctx.save();
  ctx.translate(J.head.x, J.head.y);
  ctx.rotate(J.tilt * D2R);
  if (who !== 'her') {
    for (const s of [1, -1]) {
      const x = s * rx * (0.99 - s * look[0] * 0.05);
      blob(ctx, s > 0 ? C.skinFar : C.skin, C.skinLine, lw, ell(x, ry * 0.16, rx * 0.19, ry * 0.23));
      strokePath(ctx, C.skinLine, lw * 0.8, (c) => c.arc(x, ry * 0.16, rx * 0.08, s > 0 ? -1.2 : Math.PI - 1.2, s > 0 ? 1.2 : Math.PI + 1.2));
    }
  }
  const face = (c) => facePath(c, rx, ry, who === 'him' ? 0.9 : 0.82);
  blob(ctx, C.skin, C.skinLine, lw, face);
  drawFeatures(g, lx, ly, o.expression ?? P.expr ?? 'smile');
  if (who === 'him') hairHim(g);
  else if (who === 'her') hairFrontHer(g);
  else hairSister(g);
  ctx.restore();
}

function drawNeck(g) {
  const { ctx, S, C, J, lw } = g;
  const bx = J.sc.x;
  const by = J.sc.y + 0.014;
  blob(ctx, C.skinShade, C.skinLine, lw, cap(bx, by, S.neckR * 1.1, lerp(bx, J.head.x, 0.7), lerp(by, J.head.y, 0.7), S.neckR));
}

// ----------------------------------------------------------------------------------------------
// Outfits (torso painters run in the torso frame: origin = pelvis, shoulders at y = -S.torso)
// ----------------------------------------------------------------------------------------------

/** A plain top: body colour, far-side shade. */
function topBody(g, col, opt = {}) {
  const { ctx, S, lw } = g;
  const T = S.torso;
  const path = (c) => torsoPath(c, S, opt);
  blob(ctx, col, opt.outline ?? dark(col, 0.42), lw, path);
  inside(ctx, path, () => fillPath(ctx, opt.shade ?? dark(col, 0.13), ell(S.chestW * 1.22, -T * 0.45, S.chestW * 0.62, T * 0.9)));
  return path;
}

function scoopNeck(g, depth = 0.03) {
  const { ctx, S, C } = g;
  fillPath(ctx, C.skin, ell(0, -S.torso - 0.004, S.neckR * 1.9, depth));
}

function buttonShirt(g, col, { hem = 0.035, pocket = false } = {}) {
  const { ctx, S, C, lw } = g;
  const T = S.torso;
  const ys = -T;
  const nk = S.neckR * 1.25;
  fillPath(ctx, C.skin, poly([-nk * 0.95, ys - 0.014], [0, ys + 0.045], [nk * 0.95, ys - 0.014]));
  const wing = light(col, 0.3);
  for (const s of [-1, 1]) {
    blob(ctx, wing, dark(col, 0.42), lw, poly([s * nk * 1.12, ys - 0.026], [s * 0.004, ys + 0.036], [s * nk * 2.05, ys + 0.05]));
  }
  strokePath(ctx, dark(col, 0.3), lw, line([0, ys + 0.04], [0, hem + 0.004]));
  const btn = pocket ? dark(col, 0.45) : light(col, 0.45);
  for (let k = 0; k < 4; k++) fillPath(ctx, btn, circ(0.007, ys + 0.075 + k * (T - 0.07) * 0.27, 0.0042));
  if (pocket) {
    strokePath(ctx, dark(col, 0.3), lw, rrect(S.chestW * 0.3, ys + T * 0.3, S.chestW * 0.42, T * 0.16, 0.004));
  }
}

function drawVest(g) {
  const { ctx, S, lw } = g;
  const T = S.torso;
  const ys = -T;
  const cw = S.chestW;
  const V = T * 0.4;
  const panel = (c) => torsoPath(c, S, { grow: 0.005, hem: 0.032, v: V, vw: 1.55 });
  blob(ctx, COL.vest, dark(COL.vestDark, 0.25), lw, panel);
  inside(ctx, panel, () => {
    fillPath(ctx, COL.vestDark, ell(cw * 1.25, -T * 0.45, cw * 0.62, T * 0.9));
    // lighter binding along the neckline
    strokePath(ctx, COL.vestLight, lw * 2.6, line([-S.neckR * 1.55, ys - 0.016], [0, ys + V], [S.neckR * 1.55, ys - 0.016]));
    // hem band
    fillPath(ctx, COL.vestDark, rrect(-cw * 1.3, 0.012, cw * 2.6, 0.04, 0));
  });
  strokePath(ctx, dark(COL.vestDark, 0.25), lw * 1.2, line([0, ys + V], [0, 0.036]));
  // pockets
  for (const s of [-1, 1]) strokePath(ctx, COL.vestDark, lw * 1.2, line([s * cw * 0.3, ys + T * 0.78], [s * cw * 0.78, ys + T * 0.76]));
  // name tag + yellow badge strip (far chest)
  const bx = cw * 0.17;
  const bw = cw * 0.62;
  const by = ys + T * 0.27;
  blob(ctx, COL.tag, dark(COL.vestDark, 0.2), lw * 0.8, rrect(bx, by, bw, T * 0.1, 0.004));
  strokePath(ctx, '#5b6577', lw * 1.1, smooth([[bx + bw * 0.16, by + T * 0.055], [bx + bw * 0.34, by + T * 0.04], [bx + bw * 0.5, by + T * 0.06], [bx + bw * 0.68, by + T * 0.04], [bx + bw * 0.84, by + T * 0.055]], false));
  blob(ctx, COL.badge, dark(COL.badge, 0.4), lw * 0.8, rrect(bx - bw * 0.04, by + T * 0.125, bw * 1.08, T * 0.07, 0.003));
  // walkie-talkie clipped to the near chest
  const wx = -cw * 0.72;
  const wy = ys + T * 0.2;
  strokePath(ctx, '#17181c', lw * 2.2, line([wx + cw * 0.06, wy], [wx + cw * 0.04, wy - T * 0.2]));
  blob(ctx, '#34363f', '#17181c', lw, rrect(wx, wy, cw * 0.3, T * 0.25, 0.005));
  fillPath(ctx, '#9aa3ad', rrect(wx + cw * 0.06, wy + T * 0.04, cw * 0.18, T * 0.05, 0.002));
  for (let k = 0; k < 3; k++) fillPath(ctx, '#5d6570', rrect(wx + cw * 0.07, wy + T * (0.125 + k * 0.035), cw * 0.16, T * 0.014, 0.001));
}

function drawSuit(g) {
  const { ctx, S, lw } = g;
  const T = S.torso;
  const ys = -T;
  const cw = S.chestW;
  const nk = S.neckR * 1.25;
  const V = T * 0.5;
  // lapels
  const lap = light(COL.navy, 0.14);
  for (const s of [-1, 1]) {
    blob(ctx, lap, dark(COL.navy, 0.5), lw, poly([s * nk * 1.05, ys - 0.02], [s * cw * 0.66, ys + T * 0.2], [s * cw * 0.5, ys + T * 0.24], [s * 0.003, ys + V + 0.004]));
  }
  // front edge + buttons
  strokePath(ctx, dark(COL.navy, 0.5), lw * 1.1, (c) => {
    c.moveTo(0, ys + V);
    c.quadraticCurveTo(0.006, ys + T * 0.8, -0.012, 0.052);
  });
  for (const k of [0.62, 0.76]) fillPath(ctx, '#11141f', circ(0.012, ys + T * k, 0.0055));
  // shirt collar + bow tie
  for (const s of [-1, 1]) blob(ctx, COL.white, COL.whiteLine, lw, poly([s * nk * 1.05, ys - 0.026], [s * 0.003, ys + 0.016], [s * nk * 1.5, ys + 0.03]));
  const bt = '#1c1a22';
  const by = ys + 0.024;
  blob(ctx, bt, '#0c0b10', lw, poly([0, by], [-0.03, by - 0.016], [-0.03, by + 0.017]), poly([0, by], [0.03, by - 0.016], [0.03, by + 0.017]), circ(0, by, 0.0075));
  strokePath(ctx, '#4d4a5c', lw * 0.9, line([-0.023, by - 0.006], [-0.012, by - 0.002]));
  // pocket square (far chest)
  blob(ctx, COL.white, COL.whiteLine, lw * 0.8, poly([cw * 0.42, ys + T * 0.36], [cw * 0.56, ys + T * 0.3], [cw * 0.7, ys + T * 0.36]));
  // boutonnière (near lapel)
  const fx = -cw * 0.56;
  const fy = ys + T * 0.24;
  blob(ctx, COL.leaf, dark(COL.leaf, 0.4), lw, ell(fx - 0.012, fy + 0.014, 0.014, 0.007, 0.9), ell(fx + 0.013, fy + 0.012, 0.012, 0.006, -0.8));
  rose(ctx, fx, fy, 0.015, COL.blush, lw);
}

function drawJacket(g, col) {
  // open jacket over a tee (sister): two panels, ribbed hem, zip edges, pockets
  const { ctx, S, lw } = g;
  const T = S.torso;
  const ys = -T;
  const cw = S.chestW;
  const panel = (c) => torsoPath(c, S, { grow: 0.005, hem: 0.022, v: T + 0.03, vw: 1.5 });
  blob(ctx, col, dark(col, 0.45), lw, panel);
  inside(ctx, panel, () => {
    fillPath(ctx, dark(col, 0.13), ell(cw * 1.25, -T * 0.45, cw * 0.62, T * 0.9));
    fillPath(ctx, dark(col, 0.2), rrect(-cw * 1.4, 0.004, cw * 2.8, 0.04, 0));
    strokePath(ctx, light(col, 0.5), lw * 1.6, line([-S.neckR * 1.5, ys - 0.016], [0, ys + T + 0.03], [S.neckR * 1.5, ys - 0.016]));
  });
  for (const s of [-1, 1]) strokePath(ctx, dark(col, 0.3), lw * 1.2, line([s * cw * 0.42, ys + T * 0.7], [s * cw * 0.8, ys + T * 0.62]));
}

function packBody(g, col) {
  const { ctx, S, lw } = g;
  const T = S.torso;
  const w = S.chestW * 1.25;
  const x = -S.chestW * 1.55;
  blob(ctx, col, dark(col, 0.45), lw, rrect(x, -T * 0.97, w, T * 0.82, S.chestW * 0.35));
  blob(ctx, dark(col, 0.14), dark(col, 0.45), lw, rrect(x - S.chestW * 0.08, -T * 0.6, w * 0.6, T * 0.36, S.chestW * 0.16));
  blob(ctx, dark(col, 0.14), dark(col, 0.45), lw, rrect(x + w * 0.2, -T * 1.06, w * 0.5, T * 0.1, T * 0.04));
}

function packStraps(g, col) {
  const { ctx, S, lw } = g;
  const T = S.torso;
  const cw = S.chestW;
  ctx.lineCap = 'butt';
  for (const s of [-1, 1]) {
    const strap = (c) => {
      c.moveTo(s * cw * 0.58, -T - 0.014);
      c.quadraticCurveTo(s * cw * 0.98, -T * 0.72, s * cw * 0.9, -T * 0.42);
    };
    strokePath(ctx, dark(col, 0.5), S.chestW * 0.19 + LW * 2, strap);
    strokePath(ctx, s > 0 ? dark(col, 0.18) : dark(col, 0.06), S.chestW * 0.19, strap);
  }
  ctx.lineCap = 'round';
}

/** Skirt silhouette in rig space: an A-line hull over both legs, or wrapped tubes when the legs bend. */
function skirtPath(c, g, D) {
  const { S, J } = g;
  const len = D.len * (S.thigh + S.shin);
  const along = (l, d) => {
    if (d <= S.thigh) return [lerp(l.hx, l.kx, d / S.thigh), lerp(l.hy, l.ky, d / S.thigh)];
    const t = Math.min(1, (d - S.thigh) / S.shin);
    return [lerp(l.kx, l.ax, t), lerp(l.ky, l.ay, t)];
  };
  const bent = J.legs.some((l) => Math.abs(Math.atan2(l.kx - l.hx, l.ky - l.hy)) > 50 * D2R);
  const px = J.pelvis.x;
  const py = J.pelvis.y;
  if (bent) {
    const [r0, r1, r2] = S.legR;
    const f = (D.flare[0] + D.flare[1]) * 0.35;
    for (const l of J.legs) {
      const d1 = Math.min(len, S.thigh);
      const [x1, y1] = along(l, d1);
      capsule(c, l.hx - 0.01, l.hy - 0.02, r0 + 0.03, x1, y1, r1 + 0.014 + f * 0.4);
      if (len > S.thigh) {
        const [x2, y2] = along(l, len);
        const end = D.long ? -0.004 - (r2 + 0.03 + f) : y2;
        capsule(c, x1, y1, r1 + 0.014 + f * 0.4, x2, D.long ? end : y2, r2 + 0.03 + f);
      }
    }
    capsule(c, px, py - S.torso * 0.34, S.waistW, px, py, S.hipsW + 0.004);
    return;
  }
  const pts = J.legs.map((l) => along(l, len));
  const iL = pts[0][0] <= pts[1][0] ? 0 : 1;
  const rr = S.legR[1];
  const xl = pts[iL][0] - rr - D.flare[0];
  const xr = pts[1 - iL][0] + rr + D.flare[1];
  const yl = D.long ? -0.004 : pts[iL][1];
  const yr = D.long ? -0.004 : pts[1 - iL][1];
  const wy = py - S.torso * 0.36;
  const wx = px + Math.sin(J.lean) * S.torso * 0.36;
  const ww = S.waistW + 0.002;
  const hw = S.hipsW + 0.006;
  const hy = py - 0.012;
  c.moveTo(wx - ww, wy);
  c.bezierCurveTo(wx - ww - 0.002, wy + 0.03, px - hw, hy - 0.04, px - hw, hy);
  c.bezierCurveTo(px - hw, hy + (yl - hy) * 0.45, xl + (D.long ? 0.06 : 0), yl - (yl - hy) * 0.3, xl, yl);
  if (D.long) {
    const n = 5;
    for (let k = 1; k <= n; k++) {
      const x0 = lerp(xl, xr, (k - 1) / n);
      const x1 = lerp(xl, xr, k / n);
      c.quadraticCurveTo((x0 + x1) / 2, yl - 0.016, x1, yl);
    }
  } else {
    c.quadraticCurveTo((xl + xr) / 2, Math.max(yl, yr) + 0.014, xr, yr);
  }
  c.bezierCurveTo(xr - (D.long ? 0.035 : 0), yr - (yr - hy) * 0.3, px + hw, hy + (yr - hy) * 0.45, px + hw, hy);
  c.bezierCurveTo(px + hw, hy - 0.04, wx + ww + 0.002, wy + 0.03, wx + ww, wy);
  c.closePath();
}

function spots(ctx, rnd, x0, y0, x1, y1, step, col) {
  ctx.fillStyle = col;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.8;
      const py = y + (rnd() - 0.5) * step * 0.8;
      const r = step * (0.16 + rnd() * 0.1);
      const a = rnd() * TAU;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.25, r * 0.85, a, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a + 1.4) * r * 1.9, py + Math.sin(a + 1.4) * r * 1.9, r * 0.6, r * 0.45, a, 0, TAU);
      ctx.fill();
    }
  }
}

function drawDress(g) {
  const { ctx, S, C, O, J, o, lw } = g;
  const D = O.dress;
  const T = S.torso;
  if (D.straps) blob(ctx, C.skin, C.skinLine, lw, g.torsoW({ hem: 0 }));
  const bod = g.torsoW({ top: D.straps ? 0.22 : 0, hem: 0.004, grow: 0.002 });
  const sk = (c) => skirtPath(c, g, D);
  const outline = D.outline ?? dark(D.col, 0.42);
  blob(ctx, D.col, outline, lw, bod, sk);
  const shade = D.shade ?? dark(D.col, 0.13);
  const px = J.pelvis.x;
  const py = J.pelvis.y;
  inside(ctx, [bod, sk], () => {
    // far-side shade
    fillPath(ctx, shade, ell(px + S.chestW * 1.3 + Math.sin(J.lean) * T * 0.5, py - T * 0.3, S.chestW * 0.66, T * 1.6));
    if (D.long) {
      fillPath(ctx, shade, poly([px + S.hipsW * 0.5, py + 0.02], [px + S.hipsW * 2.6, 0.01], [px + S.hipsW * 1.2, 0.01]));
      fillPath(ctx, shade, poly([px - S.hipsW * 0.45, py + 0.03], [px - S.hipsW * 1.5, 0.01], [px - S.hipsW * 2.4, 0.01]));
    }
    if (D.pattern === 'spots') spots(ctx, mulberry32(o.seed * 131 + 7), px - 0.3, -S.H, px + 0.3, 0, 0.024, COL.spot);
    if (D.pattern === 'dots') {
      const rnd = mulberry32(o.seed * 131 + 9);
      ctx.fillStyle = '#fff6e6';
      for (let y = -S.H; y < 0; y += 0.026) {
        for (let x = px - 0.3; x < px + 0.3; x += 0.026) {
          ctx.beginPath();
          ctx.arc(x + ((Math.round(y / 0.026) & 1) ? 0.013 : 0) + (rnd() - 0.5) * 0.003, y, 0.0048, 0, TAU);
          ctx.fill();
        }
      }
    }
  });
  if (D.long) {
    // soft folds
    ctx.lineCap = 'round';
    for (const [fx, tx] of [[-0.45, -1.3], [0.1, 0.25], [0.6, 1.5]]) {
      strokePath(ctx, D.fold ?? shade, lw * 1.2, (c) => {
        c.moveTo(px + S.hipsW * fx, py + 0.03);
        c.quadraticCurveTo(px + S.hipsW * (fx + tx) * 0.5, py * 0.4, px + S.hipsW * tx, -0.03);
      });
    }
  }
  g.inTorso(() => {
    const ys = -T;
    if (D.straps) {
      for (const s of [-1, 1]) {
        strokePath(ctx, outline, 0.012 + lw * 2, line([s * S.chestW * 0.62, ys + T * 0.2], [s * S.neckR * 1.7, ys - 0.012]));
        strokePath(ctx, D.col, 0.012, line([s * S.chestW * 0.62, ys + T * 0.21], [s * S.neckR * 1.7, ys - 0.012]));
      }
    } else if (D.neck !== 'crew') {
      fillPath(ctx, C.skin, ell(0, ys - 0.004, S.neckR * 2.0, 0.036));
    }
    if (D.sash) {
      const band = rrect(-S.waistW - 0.01, ys + T * 0.6, S.waistW * 2 + 0.02, T * 0.11, 0.002);
      inside(ctx, bod, () => fillPath(ctx, D.sash, band));
      if (D.bow) {
        const bx = -S.waistW * 0.55;
        const by = ys + T * 0.655;
        blob(ctx, D.sash, dark(D.sash, 0.35), lw, poly([bx, by], [bx - 0.022, by - 0.013], [bx - 0.022, by + 0.014]), poly([bx, by], [bx + 0.022, by - 0.013], [bx + 0.022, by + 0.014]), circ(bx, by, 0.006));
      }
    }
  });
}

const trousers = (col) => ({ kind: 'trousers', col });

function makeOutfits() {
  const himCasual = {
    sleeve: 'short', sleeveCol: COL.shirtBlue, legs: trousers(COL.denim), shoes: SHOES.white,
    torso: (g) => topBody(g, COL.shirtBlue, { hem: 0.036 }),
    detail: (g) => buttonShirt(g, COL.shirtBlue, { pocket: true }),
  };
  const herCasual = {
    sleeve: 'short', sleeveCol: COL.coral, legs: trousers(COL.denimHer), shoes: SHOES.white,
    torso: (g) => topBody(g, COL.coral, { hem: 0.03, flare: 0.006 }),
    detail: (g) => {
      scoopNeck(g, 0.034);
      fillPath(g.ctx, COL.gold, circ(0, -g.S.torso + 0.036, 0.0048));
    },
  };
  const sisCasual = {
    sleeve: 'long', sleeveCol: COL.mustard, cuff: dark(COL.mustard, 0.2), legs: trousers(COL.teal), shoes: SHOES.pink,
    torso: (g) => {
      topBody(g, '#fbf6ea', { hem: 0.012, outline: COL.whiteLine, shade: COL.whiteShade });
      fillPath(g.ctx, COL.tomato, (c) => {
        // a little heart on the tee
        const y = -g.S.torso * 0.62;
        c.moveTo(0, y + 0.014);
        c.bezierCurveTo(-0.026, y - 0.004, -0.012, y - 0.022, 0, y - 0.008);
        c.bezierCurveTo(0.012, y - 0.022, 0.026, y - 0.004, 0, y + 0.014);
        c.closePath();
      });
    },
    detail: (g) => drawJacket(g, COL.mustard),
  };
  return {
    him: {
      vest: {
        sleeve: 'short', sleeveCol: COL.tee, legs: trousers(COL.khaki), shoes: SHOES.brown,
        torso: (g) => topBody(g, COL.tee, { hem: 0.02 }),
        detail: drawVest,
      },
      casual: himCasual,
      school: { ...himCasual, pack: COL.teal },
      party: {
        sleeve: 'long', sleeveCol: COL.brownShirt, legs: trousers(COL.black), shoes: SHOES.black,
        torso: (g) => topBody(g, COL.brownShirt, { hem: 0.04 }),
        detail: (g) => buttonShirt(g, COL.brownShirt, { hem: 0.04 }),
      },
      wedding: {
        sleeve: 'long', sleeveCol: COL.navy, cuff: COL.white, legs: trousers(COL.navy), shoes: SHOES.black,
        torso: (g) => {
          const T = g.S.torso;
          topBody(g, COL.white, { hem: 0.02, outline: COL.whiteLine, shade: COL.whiteShade });
          topBody(g, COL.navy, { hem: 0.055, grow: 0.005, v: T * 0.5, vw: 1.05 });
        },
        detail: drawSuit,
      },
    },
    her: {
      vest: {
        sleeve: 'long', sleeveCol: COL.teeHer, legs: trousers(COL.khaki), shoes: SHOES.white,
        torso: (g) => topBody(g, COL.teeHer, { hem: 0.02 }),
        detail: drawVest,
      },
      casual: herCasual,
      school: { ...herCasual, pack: COL.mustard },
      party: {
        sleeve: 'long', sleeveCol: mix(COL.dressBrown, SKIN.her, 0.3), legs: { kind: 'bare' }, shoes: SHOES.pump,
        dress: { col: COL.dressBrown, len: 0.42, flare: [0.006, 0.006], pattern: 'spots' },
        sleeveArt: (g, paths) => inside(g.ctx, paths, () => spots(g.ctx, mulberry32(g.o.seed * 77 + 3), -0.45, -g.S.H, 0.45, 0, 0.027, mix(COL.spot, COL.dressBrown, 0.25))),
      },
      wedding: {
        sleeve: 'none', legs: { kind: 'bare' }, shoes: SHOES.ivory, hold: 'bouquet', hairFlower: true,
        dress: { col: COL.white, outline: COL.whiteLine, shade: COL.whiteShade, fold: '#ddd0bd', len: 1, long: true, flare: [0.15, 0.07], straps: true, sash: '#f3e6d3' },
      },
    },
    sister: {
      casual: sisCasual,
      vest: sisCasual,
      school: { ...sisCasual, pack: COL.tomato },
      party: {
        sleeve: 'short', sleeveCol: COL.tomato, legs: { kind: 'bare' }, shoes: SHOES.teal, scrunchie: COL.mustard,
        dress: { col: COL.tomato, len: 0.5, flare: [0.034, 0.034], pattern: 'dots', neck: 'crew' },
      },
      wedding: {
        sleeve: 'short', sleeveCol: COL.blush, legs: { kind: 'bare' }, shoes: SHOES.ivory, scrunchie: COL.blush, flowerCrown: true,
        dress: { col: COL.blush, len: 0.56, flare: [0.04, 0.04], neck: 'crew', sash: COL.rose, bow: true },
      },
    },
  };
}
const OUTFITS = makeOutfits();

// ----------------------------------------------------------------------------------------------
// People: assembly
// ----------------------------------------------------------------------------------------------

function drawPerson(ctx, S, o) {
  const C = personColours(o.who);
  let O = OUTFITS[o.who][o.outfit];
  if (o.backpack !== undefined) O = { ...O, pack: o.backpack ? O.pack ?? OUTFITS[o.who].school.pack : null };
  const P = buildPose(S, o);
  const J = solveRig(S, P);
  const lw = LW;
  const g = { ctx, S, C, O, P, J, o, lw };
  g.inTorso = (fn) => {
    ctx.save();
    ctx.translate(J.pelvis.x, J.pelvis.y);
    ctx.rotate(J.lean);
    fn();
    ctx.restore();
  };
  g.torsoW = (opt) => (c) => {
    c.save();
    c.translate(J.pelvis.x, J.pelvis.y);
    c.rotate(J.lean);
    torsoPath(c, S, opt);
    c.restore();
  };
  const z = (i) => P.arms[i].z ?? 'front';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (o.who === 'her') hairBackHer(g);
  else if (o.who === 'sister') ponytail(g);
  if (O.pack) g.inTorso(() => packBody(g, O.pack));
  for (const i of [1, 0]) if (z(i) === 'back') drawArm(g, i);
  drawLeg(g, 1);
  drawLeg(g, 0);
  if (O.legs.kind === 'trousers') g.inTorso(() => fillPath(ctx, O.legs.col, (c) => pelvisPath(c, S, J.hipDX)));
  if (O.dress) drawDress(g);
  else g.inTorso(() => O.torso(g));
  drawNeck(g);
  if (O.detail) g.inTorso(() => O.detail(g));
  if (O.pack) g.inTorso(() => packStraps(g, O.pack));
  for (const i of [1, 0]) if (z(i) === 'front') drawArm(g, i);
  drawHead(g);
  for (const i of [1, 0]) if (z(i) === 'top') drawArm(g, i);

  const hand = (i) => [J.arms[i].hx, -J.arms[i].hy];
  const anchors = {
    head: [J.head.x, -J.head.y],
    top: [J.head.x, -J.head.y + S.headRy * 1.2],
    handL: hand(0),
    handR: hand(1),
    hand: hand(P.active),
  };
  if (o.pose === 'sit') anchors.seat = [J.pelvis.x - S.hipsW * 0.3, -J.pelvis.y - S.legR[0]];
  return anchors;
}

// ----------------------------------------------------------------------------------------------
// Dogs. Dog space: 1 = the dog's nominal height, x toward the nose, y down, ground at 0.
// ----------------------------------------------------------------------------------------------

const DOG_FRAME = 1.28;

const BREED = {
  chihuahua: {
    H: FIGURE.chihuahuaHeight, coat: '#dba465', cream: '#f8eedb', earIn: '#f1c9a4', collar: '#74c6ea', tag: '#d5dadd',
    R: 0.2, legU: 0.2, legL: 0.19, legR: [0.052, 0.04, 0.033], paw: [0.058, 0.035], body: 1,
  },
  familyDog: {
    H: FIGURE.familyDogHeight, coat: '#fdf9f0', cream: '#fdf9f0', patch: '#a9683c', collar: '#d94f43', tag: '#f0bd3a',
    R: 0.215, legU: 0.13, legL: 0.12, legR: [0.07, 0.064, 0.058], paw: [0.07, 0.04], body: 1.16, fluffy: true,
  },
};

const DOG_POSE = {
  walk: {
    body: [-0.27, -0.47, 0.15, 0.2, -0.5, 0.18], hip: [-0.29, -0.43], shoulder: [0.2, -0.42],
    legs: { nh: [16, -16], fh: [-30, -50], nf: [-16, -6], ff: [36, 8] },
    neck: [0.24, -0.58, 0.125, 0.4, -0.78, 0.1], head: [0.43, -0.86, 0],
    tail: [[-0.39, -0.53], [-0.6, -0.72], [-0.47, -0.98]], collar: [0.33, -0.69, 0.86, 0.5, 0.118],
  },
  run: {
    body: [-0.27, -0.45, 0.145, 0.22, -0.52, 0.175], hip: [-0.29, -0.42], shoulder: [0.22, -0.44],
    legs: { nh: [-36, -58], fh: [-20, -46], nf: [64, 52], ff: [80, 64] },
    neck: [0.26, -0.6, 0.12, 0.44, -0.76, 0.1], head: [0.49, -0.82, 6],
    tail: [[-0.39, -0.5], [-0.62, -0.62], [-0.78, -0.5]], collar: [0.36, -0.7, 0.8, 0.6, 0.115],
    earBack: 0.55, tongue: true,
  },
  sit: {
    body: [-0.06, -0.2, 0.2, 0.08, -0.5, 0.165], haunch: [-0.1, -0.17, 0.2, 0.168], hindPaw: [0.07, -0.036],
    fore: [[0.06, -0.42, 0.08, -0.05], [0.2, -0.42, 0.22, -0.05]],
    head: [0.1, -0.76, -3], tail: [[-0.24, -0.06], [-0.52, -0.02], [-0.56, -0.32]], collar: [0.1, -0.555, 1, 0, 0.128],
  },
};

/** Tapered tail along a quadratic curve (3 control points), as a closed outline. */
const taper = (p, w0, w1) => (c) => {
  const L = [];
  const R = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * p[0][0] + 2 * t * (1 - t) * p[1][0] + t * t * p[2][0];
    const y = (1 - t) * (1 - t) * p[0][1] + 2 * t * (1 - t) * p[1][1] + t * t * p[2][1];
    let tx = 2 * (1 - t) * (p[1][0] - p[0][0]) + 2 * t * (p[2][0] - p[1][0]);
    let ty = 2 * (1 - t) * (p[1][1] - p[0][1]) + 2 * t * (p[2][1] - p[1][1]);
    const d = Math.hypot(tx, ty) || 1;
    tx /= d;
    ty /= d;
    const w = lerp(w0, w1, t) / 2;
    L.push([x - ty * w, y + tx * w]);
    R.push([x + ty * w, y - tx * w]);
  }
  c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= n; i++) c.lineTo(L[i][0], L[i][1]);
  c.arc(p[2][0], p[2][1], w1 / 2, Math.atan2(L[n][1] - p[2][1], L[n][0] - p[2][0]), Math.atan2(R[n][1] - p[2][1], R[n][0] - p[2][0]), true);
  for (let i = n; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath();
};

/** Puffs (small circles) around a circle from angle a0 to a1: the fluffy dog's cloud-like edge. */
function puffs(rnd, x, y, r, n, pr, a0 = 0, a1 = TAU) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, (i + 0.5) / n) + (rnd() - 0.5) * 0.12;
    const q = pr * (0.85 + rnd() * 0.3);
    out.push(circ(x + Math.cos(a) * (r - q * 0.35), y + Math.sin(a) * (r - q * 0.35), q));
  }
  return out;
}

function chihuahuaHead(ctx, B, lw, { earBack = 0, tongue = false, look = 0.12 }) {
  const coat = B.coat;
  const ol = dark(coat, 0.5);
  const ink = '#2b1d19';
  for (const s of [1, -1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(-earBack * 0.8);
    const ear = (c) => {
      c.moveTo(0.26, -0.8);
      c.bezierCurveTo(0.34, -1.2, 0.5, -1.45, 0.66, -1.52);
      c.bezierCurveTo(0.95, -1.5, 1.3, -1.36, 1.44, -1.2);
      c.bezierCurveTo(1.3, -0.85, 1.1, -0.5, 0.92, -0.3);
      c.closePath();
    };
    blob(ctx, s > 0 ? dark(coat, 0.08) : coat, ol, lw, ear);
    fillPath(ctx, B.earIn, (c) => {
      c.moveTo(0.46, -0.84);
      c.bezierCurveTo(0.52, -1.1, 0.62, -1.3, 0.74, -1.36);
      c.bezierCurveTo(0.95, -1.34, 1.14, -1.24, 1.24, -1.14);
      c.bezierCurveTo(1.14, -0.9, 1.0, -0.66, 0.88, -0.52);
      c.closePath();
    });
    // folded tip
    const flap = (c) => {
      c.moveTo(0.64, -1.52);
      c.bezierCurveTo(0.95, -1.56, 1.32, -1.42, 1.46, -1.2);
      c.bezierCurveTo(1.62, -1.02, 1.62, -0.76, 1.5, -0.6);
      c.bezierCurveTo(1.3, -0.82, 0.95, -1.2, 0.64, -1.52);
      c.closePath();
    };
    blob(ctx, dark(coat, 0.14), ol, lw, flap);
    ctx.restore();
  }
  const skull = (c) => {
    c.moveTo(0, -1);
    c.bezierCurveTo(0.62, -1.02, 1.05, -0.6, 1.02, -0.1);
    c.bezierCurveTo(1.0, 0.3, 0.74, 0.5, 0.52, 0.7);
    c.bezierCurveTo(0.38, 0.97, -0.38, 0.97, -0.52, 0.7);
    c.bezierCurveTo(-0.74, 0.5, -1.0, 0.3, -1.02, -0.1);
    c.bezierCurveTo(-1.05, -0.6, -0.62, -1.02, 0, -1);
    c.closePath();
  };
  blob(ctx, coat, ol, lw, skull);
  const lx = look;
  inside(ctx, skull, () => {
    fillPath(ctx, dark(coat, 0.1), ell(1.2, 0.1, 0.5, 1.1));
    fillPath(ctx, B.cream, ell(lx, 0.5, 0.46, 0.44));
    fillPath(ctx, B.cream, poly([lx - 0.11, 0.2], [lx * 0.6, -0.62], [lx + 0.11, 0.2]));
  });
  if (tongue) blob(ctx, '#ef8f95', '#b9565f', lw, ell(lx + 0.03, 0.82, 0.12, 0.2));
  for (const s of [-1, 1]) {
    const ex = lx * 0.7 + s * 0.44;
    fillPath(ctx, light(coat, 0.45), ell(ex + s * 0.02, -0.35, 0.11, 0.06, s * -0.3));
    blob(ctx, ink, dark(coat, 0.55), lw * 0.9, circ(ex, -0.03, 0.17));
    fillPath(ctx, '#fffaf0', circ(ex - 0.055, -0.09, 0.055));
    fillPath(ctx, '#fffaf0', circ(ex + 0.06, 0.03, 0.025));
  }
  fillPath(ctx, ink, (c) => {
    c.moveTo(lx - 0.17, 0.26);
    c.quadraticCurveTo(lx, 0.18, lx + 0.17, 0.26);
    c.bezierCurveTo(lx + 0.17, 0.4, lx + 0.05, 0.46, lx, 0.46);
    c.bezierCurveTo(lx - 0.05, 0.46, lx - 0.17, 0.4, lx - 0.17, 0.26);
    c.closePath();
  });
  fillPath(ctx, '#6b5650', ell(lx - 0.05, 0.28, 0.05, 0.025));
  strokePath(ctx, ink, lw * 1.1, (c) => {
    c.moveTo(lx, 0.46);
    c.lineTo(lx, 0.55);
    c.moveTo(lx - 0.2, 0.56);
    c.quadraticCurveTo(lx - 0.1, 0.68, lx, 0.55);
    c.quadraticCurveTo(lx + 0.1, 0.68, lx + 0.2, 0.56);
  });
}

function fluffyHead(ctx, B, lw, rnd, { tongue = true, look = 0.1, earBack = 0 }) {
  const ol = '#c9b9a2';
  const ink = '#2b1d19';
  const patch = B.patch;
  for (const s of [1, -1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(-earBack * 0.9);
    blob(ctx, s > 0 ? dark(patch, 0.1) : patch, dark(patch, 0.45), lw, ell(0.95, 0.22, 0.4, 0.8, -0.2), ...puffs(rnd, 0.98, 0.5, 0.42, 6, 0.2, 0.1, Math.PI * 1.0));
    ctx.restore();
  }
  const head = [circ(0, 0, 0.96), ...puffs(rnd, 0, 0, 1.0, 13, 0.27)];
  blob(ctx, B.coat, ol, lw, ...head);
  inside(ctx, head, () => {
    fillPath(ctx, patch, ell(-0.5 + look * 0.7, -0.2, 0.42, 0.5, 0.25));
    fillPath(ctx, '#efe5d3', ell(1.25, 0.15, 0.5, 1.2));
  });
  // top tuft
  blob(ctx, B.coat, ol, lw, circ(look * 0.5 + 0.02, -0.92, 0.2), circ(look * 0.5 - 0.2, -0.86, 0.16), circ(look * 0.5 + 0.24, -0.84, 0.15));
  const lx = look;
  if (tongue) blob(ctx, '#ef8f95', '#b9565f', lw, ell(lx + 0.02, 0.74, 0.13, 0.2));
  blob(ctx, B.coat, ol, lw, circ(lx - 0.24, 0.42, 0.3), circ(lx + 0.24, 0.42, 0.3));
  for (const s of [-1, 1]) {
    const ex = lx * 0.7 + s * 0.42;
    fillPath(ctx, ink, circ(ex, -0.1, 0.14));
    fillPath(ctx, '#fffaf0', circ(ex - 0.045, -0.15, 0.048));
  }
  fillPath(ctx, ink, ell(lx, 0.22, 0.16, 0.12));
  fillPath(ctx, '#6b5650', ell(lx - 0.05, 0.18, 0.05, 0.025));
}

function bowtie(ctx, x, y, s, lw) {
  const col = '#1f1d27';
  blob(ctx, col, '#0c0b10', lw, poly([x, y], [x - s, y - s * 0.62], [x - s, y + s * 0.62]), poly([x, y], [x + s, y - s * 0.62], [x + s, y + s * 0.62]), circ(x, y, s * 0.27));
  strokePath(ctx, '#55526a', lw, line([x - s * 0.8, y - s * 0.25], [x - s * 0.42, y - s * 0.08]));
  strokePath(ctx, '#55526a', lw, line([x + s * 0.8, y - s * 0.25], [x + s * 0.42, y - s * 0.08]));
}

function drawDog(ctx, B, o) {
  const P = DOG_POSE[o.pose];
  const lw = 0.012;
  const rnd = mulberry32(o.seed * 613 + (o.pose === 'sit' ? 1 : o.pose === 'walk' ? 2 : 3));
  const coat = B.coat;
  const ol = B.fluffy ? '#c9b9a2' : dark(coat, 0.5);
  const coatFar = B.fluffy ? '#ece1cf' : dark(coat, 0.14);
  const bs = B.body;
  const [bx0, by0, br0, bx1, by1, br1] = P.body;
  const fluff = (x, y, r, n, a0, a1) => (B.fluffy ? puffs(rnd, x, y, r, n, r * 0.34, a0, a1) : []);
  let shift = 0;
  const anchors = {};
  const R = B.R;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const paw = (x, y, far) => blob(ctx, far ? dark(B.cream, 0.1) : B.cream, ol, lw, ell(x + B.paw[0] * 0.3, y, B.paw[0], B.paw[1]));
  const drawCollar = () => {
    const [cx, cy, dx, dy, half] = P.collar;
    const ax = cx - dx * half;
    const ay = cy - dy * half;
    const ex = cx + dx * half;
    const ey = cy + dy * half;
    const band = (c) => {
      c.moveTo(ax, ay);
      c.quadraticCurveTo(cx - dy * 0.05, cy + dx * 0.05, ex, ey);
    };
    ctx.lineCap = 'butt';
    strokePath(ctx, dark(B.collar, 0.5), 0.062 + lw * 2, band);
    strokePath(ctx, B.collar, 0.062, band);
    ctx.lineCap = 'round';
    const tx = lerp(cx, ex, 0.55) - dy * 0.03;
    const ty = lerp(cy, ey, 0.55) + dx * 0.03;
    if (o.accessory === 'bowtie') bowtie(ctx, tx, ty + 0.035, 0.125, lw);
    else blob(ctx, B.tag, dark(B.tag, 0.45), lw * 0.8, circ(tx, ty + 0.062, 0.034));
    anchors.collar = [ax, ay];
  };
  const drawHeadAt = () => {
    const [hx, hy, tilt] = P.head;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(tilt * D2R);
    ctx.scale(R, R);
    const opt = { earBack: P.earBack ?? 0, tongue: P.tongue ?? false };
    if (B.fluffy) fluffyHead(ctx, B, lw / R, rnd, { ...opt, tongue: true });
    else chihuahuaHead(ctx, B, lw / R, opt);
    ctx.restore();
    anchors.head = [hx, hy];
  };
  const tailPiece = () => {
    if (B.fluffy) {
      const [p0, p1, p2] = P.tail;
      const parts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const x = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0];
        const y = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1];
        parts.push(circ(x + (rnd() - 0.5) * 0.02, y, 0.075 + 0.04 * Math.sin(t * Math.PI) + t * 0.02));
      }
      blob(ctx, coat, ol, lw, ...parts);
      inside(ctx, parts, () => fillPath(ctx, B.patch, circ(P.tail[2][0], P.tail[2][1] - 0.02, 0.12)));
    } else {
      blob(ctx, coat, ol, lw, taper(P.tail, 0.085, 0.035));
    }
  };

  if (o.pose === 'sit') {
    tailPiece();
    // far fore leg
    const [nf, ff] = P.fore;
    const foreLeg = (f, far) => {
      const r0 = B.legR[0] * (B.fluffy ? 1.05 : 1);
      blob(ctx, far ? coatFar : coat, ol, lw, cap(f[0], f[1], r0, f[2], f[3], B.legR[2]), ...fluff(f[2], f[3] + 0.01, B.legR[2] * 1.15, 5, 0, Math.PI));
      paw(f[2], f[3] + 0.012, far);
    };
    foreLeg(ff, true);
    const body = [cap(bx0, by0, br0 * bs, bx1, by1, br1 * bs), ...fluff(bx0, by0, br0 * bs, 9, Math.PI * 0.3, Math.PI * 1.6), ...fluff(bx1, by1, br1 * bs, 6, Math.PI * 1.0, Math.PI * 2.1)];
    blob(ctx, coat, ol, lw, ...body);
    // chest bib
    inside(ctx, body, () => {
      if (B.fluffy) fillPath(ctx, B.patch, ell(bx0 - 0.12, by0 - 0.12, 0.2, 0.26, 0.3));
      else fillPath(ctx, B.cream, ell(0.15, -0.44, 0.1, 0.2, -0.1));
    });
    const [hx, hy, hrx, hry] = P.haunch;
    blob(ctx, coat, ol, lw, ell(hx, hy, hrx * bs, hry * bs), ...fluff(hx, hy, hrx * bs, 8, Math.PI * 0.2, Math.PI * 1.5));
    if (B.fluffy) inside(ctx, [ell(hx, hy, hrx * bs, hry * bs)], () => fillPath(ctx, B.patch, ell(hx - 0.14, hy - 0.1, 0.16, 0.2, 0.3)));
    blob(ctx, B.cream, ol, lw, ell(P.hindPaw[0], P.hindPaw[1], 0.105, 0.038));
    foreLeg(nf, false);
    drawCollar();
    drawHeadAt();
  } else {
    // four-legged poses: solve legs, then drop the dog until the lowest paw touches the ground
    const legAt = (root, a) => {
      const kx = root[0] + B.legU * sind(a[0]);
      const ky = root[1] + B.legU * cosd(a[0]);
      return { rx: root[0], ry: root[1], kx, ky, px: kx + B.legL * sind(a[1]), py: ky + B.legL * cosd(a[1]) };
    };
    const L = {
      nh: legAt(P.hip, P.legs.nh), fh: legAt([P.hip[0] + 0.05, P.hip[1]], P.legs.fh),
      nf: legAt(P.shoulder, P.legs.nf), ff: legAt([P.shoulder[0] + 0.05, P.shoulder[1]], P.legs.ff),
    };
    shift = -Math.max(...Object.values(L).map((l) => l.py + B.paw[1]));
    ctx.save();
    ctx.translate(0, shift);
    const leg = (l, far, hind) => {
      const r0 = B.legR[0] * (hind ? 1.25 : 1);
      blob(ctx, far ? coatFar : coat, ol, lw, cap(l.rx, l.ry, r0, l.kx, l.ky, B.legR[1]), cap(l.kx, l.ky, B.legR[1], l.px, l.py, B.legR[2]), ...fluff(l.px, l.py, B.legR[2] * 1.1, 5, 0, Math.PI));
      paw(l.px, l.py + 0.006, far);
    };
    tailPiece();
    leg(L.fh, true, true);
    leg(L.ff, true, false);
    const [n0x, n0y, n0r, n1x, n1y, n1r] = P.neck;
    const body = [
      cap(bx0, by0, br0 * bs, bx1, by1, br1 * bs), cap(n0x, n0y, n0r * bs, n1x, n1y, n1r * bs),
      ...fluff(bx0, by0, br0 * bs, 7, Math.PI * 0.4, Math.PI * 1.6), ...fluff(bx1, by1, br1 * bs, 6, -Math.PI * 0.2, Math.PI * 0.75),
      ...(B.fluffy ? puffs(rnd, (bx0 + bx1) / 2, (by0 + by1) / 2 - br0 * bs * 0.25, br0 * bs * 0.85, 4, 0.07, Math.PI * 1.15, Math.PI * 1.85) : []),
      ...(B.fluffy ? puffs(rnd, (bx0 + bx1) / 2, (by0 + by1) / 2 + br0 * bs * 0.3, br0 * bs * 0.85, 4, 0.07, Math.PI * 0.15, Math.PI * 0.85) : []),
    ];
    blob(ctx, coat, ol, lw, ...body);
    inside(ctx, body, () => {
      if (B.fluffy) {
        fillPath(ctx, B.patch, ell(bx0 + 0.16, by0 - 0.1, 0.2, 0.17, -0.1));
      } else {
        fillPath(ctx, dark(coat, 0.1), ell((bx0 + bx1) / 2, by0 + 0.2, 0.5, 0.12));
        fillPath(ctx, B.cream, ell(bx1 + 0.1, by1 + 0.02, 0.1, 0.17, -0.25));
      }
    });
    leg(L.nh, false, true);
    leg(L.nf, false, false);
    drawCollar();
    drawHeadAt();
    ctx.restore();
  }

  if (o.accessory === 'leash') {
    const [ax, ay] = anchors.collar;
    const sx = ax;
    const sy = ay + shift;
    const [ex, ey] = o.leashTo;
    const mx = lerp(sx, ex, 0.5);
    const my = lerp(sy, ey, 0.5) + Math.hypot(ex - sx, ey - sy) * 0.2;
    const strap = (c) => {
      c.moveTo(sx, sy);
      c.quadraticCurveTo(mx, my, ex, ey);
    };
    const col = dark(B.collar, 0.12);
    const loop = (c) => c.arc(ex - 0.02, ey - 0.055, 0.06, 0, TAU);
    strokePath(ctx, dark(col, 0.5), 0.036 + lw * 2, strap);
    strokePath(ctx, dark(col, 0.5), 0.032 + lw * 2, loop);
    strokePath(ctx, col, 0.036, strap);
    strokePath(ctx, col, 0.032, loop);
    blob(ctx, B.tag, dark(B.tag, 0.45), lw * 0.8, circ(sx, sy, 0.03));
    anchors.leashEnd = [ex - 0.02, ey - 0.055];
  }
  const out = { head: [anchors.head[0], -(anchors.head[1] + shift)] };
  if (anchors.collar) out.collar = [anchors.collar[0], -(anchors.collar[1] + shift)];
  if (anchors.leashEnd) out.leashEnd = [anchors.leashEnd[0], -anchors.leashEnd[1]];
  return out;
}

// ----------------------------------------------------------------------------------------------
// Rendering, caching, cards
// ----------------------------------------------------------------------------------------------

const cache = new Map();

function alphaBounds(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0, p = 3; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      if (d[p] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Draws on a roomy scratch canvas (origin = feet centre, K px per unit), then crops to a canvas that
 * is symmetric about the feet, at least `minH` px tall, mirrors it for facing 'left', die-cuts, grains.
 */
function finish({ scratchW, scratchH, minH, K, pad, margin, flip, seed, draw }) {
  const { canvas: scratch, ctx } = makeCanvas(scratchW, scratchH);
  const cx = Math.round(scratchW / 2);
  const gy = scratchH - pad;
  ctx.translate(cx, gy);
  ctx.scale(K, K);
  const anchors = draw(ctx);
  const b = alphaBounds(scratch);
  const half = Math.min(cx, Math.ceil(Math.max(cx - b.x0, b.x1 + 1 - cx)) + pad);
  const w = half * 2;
  const h = Math.min(scratchH, Math.max(minH, gy - b.y0 + pad * 2));
  const out = paint(w, h, (c) => {
    if (flip) {
      c.translate(w, 0);
      c.scale(-1, 1);
    }
    c.drawImage(scratch, half - cx, h - scratchH);
  }, { dieCut: margin, grain: 0.045, seed });
  return { out, anchors, w, h };
}

function mirrorAnchors(a) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = [-a[k][0], a[k][1]];
  if (out.handL && out.handR) [out.handL, out.handR] = [out.handR, out.handL];
  return out;
}

const SWAP = { holdHandsL: 'holdHandsR', holdHandsR: 'holdHandsL' };

export function paintFigure(who = 'him', opts = {}) {
  const S = SPEC[who];
  if (!S) throw new Error(`paintFigure: unknown who "${who}" (him | her | sister)`);
  const outfit = opts.outfit ?? 'casual';
  const pose = opts.pose ?? 'stand';
  if (!OUTFITS[who][outfit]) throw new Error(`paintFigure: unknown outfit "${outfit}" (${FIGURE_OPTIONS.outfit.join(' | ')})`);
  if (!POSES[pose]) throw new Error(`paintFigure: unknown pose "${pose}" (${FIGURE_OPTIONS.pose.join(' | ')})`);
  const facing = opts.facing === 'left' ? 'left' : 'right';
  const px = Math.max(96, Math.round(opts.px ?? 512));
  const seed = opts.seed ?? 1;
  let hold = opts.hold;
  if (hold === undefined) hold = pose === 'surprised' || pose === 'kneel' ? undefined : OUTFITS[who][outfit].hold;
  if (hold && !HOLD_ARM[hold]) throw new Error(`paintFigure: unknown hold "${hold}" (${FIGURE_OPTIONS.hold.join(' | ')})`);
  const handY = opts.handY ?? HOLD_Y;
  const key = ['fig', who, outfit, pose, facing, px, seed, hold, opts.expression, handY, opts.backpack].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const flip = facing === 'left';
  const o = { who, outfit, pose: flip ? SWAP[pose] ?? pose : pose, seed, hold, expression: opts.expression, handY, backpack: opts.backpack };
  const margin = Math.max(4, Math.round(px * 0.0156));
  const pad = margin + 2;
  const K = (px - 2 * pad) / (S.H * FRAME);
  const r = finish({ scratchW: Math.round(px * 2.4), scratchH: px, minH: px, K, pad, margin, flip, seed, draw: (ctx) => drawPerson(ctx, S, o) });
  const anchors = flip ? mirrorAnchors(r.anchors) : r.anchors;
  const base = pad / K;
  for (const k of Object.keys(anchors)) anchors[k] = [anchors[k][0], anchors[k][1] + base];
  anchors.feet = [0, base];
  r.out.meta = { kind: who, width: r.w / K, height: r.h / K, unitsPerPx: 1 / K, baseline: base, anchors };
  cache.set(key, r.out);
  return r.out;
}

export function paintDog(kind = 'chihuahua', opts = {}) {
  const B = BREED[kind];
  if (!B) throw new Error(`paintDog: unknown kind "${kind}" (chihuahua | familyDog)`);
  const pose = opts.pose ?? 'sit';
  if (!DOG_POSE[pose]) throw new Error(`paintDog: unknown pose "${pose}" (sit | walk | run)`);
  const accessory = opts.accessory ?? null;
  if (accessory && !FIGURE_OPTIONS.accessory.includes(accessory)) throw new Error(`paintDog: unknown accessory "${accessory}" (bowtie | leash)`);
  const facing = opts.facing === 'left' ? 'left' : 'right';
  const px = Math.max(64, Math.round(opts.px ?? 384));
  const seed = opts.seed ?? 1;
  const flip = facing === 'left';
  // leash target in world units for a dog facing right; mirrored requests are mirrored back
  const lt = opts.leashTo ?? [flip ? 0.4 : -0.4, 0.46];
  const leashTo = [(flip ? -lt[0] : lt[0]) / B.H, -lt[1] / B.H];
  const key = ['dog', kind, pose, accessory, facing, px, seed, accessory === 'leash' ? lt.join(',') : ''].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const margin = Math.max(4, Math.round(px * 0.0156));
  const pad = margin + 2;
  const K = (px - 2 * pad) / (B.H * DOG_FRAME);
  const leash = accessory === 'leash';
  const reachX = leash ? Math.abs(lt[0]) + 0.1 : 0;
  const reachY = leash ? lt[1] + 0.08 : 0;
  const r = finish({
    scratchW: Math.round(Math.max(px * 2.6, reachX * K * 2 + px)),
    scratchH: Math.round(Math.max(px, reachY * K + pad * 2)),
    minH: px, K: K * B.H, pad, margin, flip, seed,
    draw: (ctx) => drawDog(ctx, B, { pose, accessory, seed, leashTo }),
  });
  const base = pad / K;
  const anchors = {};
  for (const k of Object.keys(r.anchors)) anchors[k] = [r.anchors[k][0] * B.H * (flip ? -1 : 1), r.anchors[k][1] * B.H + base];
  anchors.feet = [0, base];
  r.out.meta = { kind, width: r.w / K, height: r.h / K, unitsPerPx: 1 / K, baseline: base, anchors };
  cache.set(key, r.out);
  return r.out;
}

export function figureCard(paper, who, opts = {}) {
  const { scale = 1, back = PAPER.cream, ...rest } = opts;
  const dog = who in BREED;
  const canvas = dog ? paintDog(who, rest) : paintFigure(who, rest);
  const m = canvas.meta;
  const width = m.width * scale;
  const height = m.height * scale;
  const group = paper.card({ canvas, width, height, back, anchor: 'bottom-center' });
  const anchors = {};
  for (const k of Object.keys(m.anchors)) anchors[k] = [m.anchors[k][0] * scale, m.anchors[k][1] * scale];
  Object.assign(group.userData, { width, height, baseline: m.baseline * scale, anchors, canvas, who });
  return group;
}

export function joinHands(left, right, overlap = 0.012) {
  const a = left.userData.anchors.hand;
  const b = right.userData.anchors.hand;
  right.position.x = left.position.x + a[0] - b[0] - overlap;
  right.position.y = left.position.y + a[1] - b[1];
  right.position.z = left.position.z - 0.004;
  return right;
}
