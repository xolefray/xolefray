/**
 * photos.js — the couple's photographs: loading them (when present) and printing them as scrapbook
 * pieces (polaroid, deckle-edged print, oval medallion) with hand-written captions and washi tape.
 *
 * PRIVACY: the image files live in ../photos/ and are git-ignored (see photos/README.md); the film
 * must run without them. loadPhotos() therefore never throws and returns null for a missing file,
 * and photoPrint(null, …) paints a finished-looking illustrated placeholder (a doodled heart), so
 * every caller gets a usable canvas either way.
 *
 * loadPhotos({ disabled } = {}) -> Promise of eight canvases (or null): cover, proposal, dog,
 * oliver, walmart, lunch, deed, tokyo. Each is an HTMLCanvasElement (the decoded photo, longest
 * side <= 1600 px) or null. Sources: ../photos/<name>.jpg — or, when
 * `window.__PHOTOS = { cover: <url | data URI>, … }` exists, those instead
 * (single-file builds; a name missing from __PHOTOS is simply null, the files are not consulted).
 * Memoised.
 *     const photos = await loadPhotos();
 *     const book = createBook({ photos, fonts: FONT });
 * PHOTOS OFF: with `disabled: true`, or — when `disabled` is not given — with `photos=0` in the
 * page URL (photosDisabled()), nothing is fetched or read and all three are null, so every consumer
 * shows its illustrated fallback (a heart for the original three; a small scene for each of the
 * five added names). Use it for screenshots that leave the machine. Every page that
 * calls loadPhotos() honours `?photos=0` without doing anything.
 *
 * photoPrint(photo, { width=512, style='polaroid', caption='', tilt=0, tape=true,
 *                     aspect, focus=[0.5,0.4], seed=1, tapeColor, shadow=false }) -> canvas
 *   style   'polaroid'  white card, big bottom margin (caption goes there)
 *           'print'     photo-lab print with a thin white border and a deckled (wavy-cut) edge
 *           'oval'      oval medallion with a cream mat and a fine keyline (ignores `tape`)
 *   width   width of the printed piece itself in px, before tilt. The returned canvas is a little
 *           larger (room for the tilt, the tape and, with `shadow`, a soft drop shadow), transparent
 *           around the piece: size a card by the canvas aspect, e.g.
 *               const c = photoPrint(photos.dog, { caption: 'our girl' });
 *               paper.card({ canvas: c, width: 1.1, height: 1.1 * c.height / c.width });
 *   caption hand-written in FONT.hand (call after loadFonts()); shrinks to fit one line.
 *   tilt    radians, positive = clockwise.      tape  a strip of washi tape over the top edge.
 *   aspect  width / height of the picture window (default: the photo's own, within sane limits —
 *           0.8 when the photo is null; pass PHOTO_ASPECT.<name> for a layout that does not depend
 *           on the file being there). The photo is cover-fitted around `focus` (fractions of the
 *           photo; default slightly above the middle, where faces are).
 *   shadow  true paints a soft drop shadow under the piece (for pieces drawn INTO flat page art;
 *           leave false for 3D cards, which cast real shadows).
 *   The canvas carries its piece's geometry in `canvas.print = { x, y, w, h, tilt }` (the untilted
 *   piece rectangle centred at x, y) for painters who want to draw on top of it.
 *
 * washiTape(length=220, { height, color, seed }) -> canvas: one strip of patterned tape with torn
 * zig-zag ends (semi-opaque), for taping anything else onto a page.
 *
 * Everything is deterministic (seeded) and allocates only when called (build time, never per frame).
 */
import { FONT } from './fonts.js';
import { PAPER, addGrain, makeCanvas } from './paper.js';
import { mulberry32 } from './util/rng.js';

const NAMES = ['cover', 'proposal', 'dog', 'oliver', 'walmart', 'lunch', 'deed', 'tokyo'];
/**
 * Width / height of the eight photos. Pass `aspect: PHOTO_ASPECT.dog` (or the matching name) to
 * photoPrint to get the same-sized piece whether or not the file is present. The five added
 * aspects also select that photo's illustrated stand-in when the file is missing.
 */
export const PHOTO_ASPECT = Object.freeze({
  cover: 0.8,
  proposal: 0.82,
  dog: 0.7,
  oliver: 1.333,
  walmart: 0.779,
  lunch: 0.75,
  deed: 1.181,
  tokyo: 0.893,
});
const MOTIF_NAMES = ['oliver', 'walmart', 'lunch', 'deed', 'tokyo'];

function emptyPhotos() {
  return Object.fromEntries(NAMES.map((name) => [name, null]));
}

/** Which illustrated stand-in to draw. An explicit motif wins; otherwise a matching aspect. The default 0.8 is not "cover". */
function resolveMotif(options) {
  if (options.motif && MOTIF_NAMES.includes(options.motif)) return options.motif;
  const aspect = options.aspect;
  if (typeof aspect !== 'number' || !Number.isFinite(aspect)) return null;
  for (const name of MOTIF_NAMES) {
    if (Math.abs(PHOTO_ASPECT[name] - aspect) <= 1e-4) return name;
  }
  return null;
}
const MAX_SIDE = 1600;
const LOAD_TIMEOUT_MS = 12000;
const PHOTO_DIR = new URL('../photos/', import.meta.url);

/** Washi-tape colours: the cheerful scrapbook palette (tomato, mustard, teal, sky, leaf, blush). */
const TAPE_COLORS = ['#e2574c', '#e9b23e', '#3f9c95', '#78b7dd', '#7fb069', '#f0a3a0'];
const INK = '#3a2f2a';

let pending = null;

// ------------------------------------------------------------------------------------------ loading

function loadOne(name) {
  const override = typeof window !== 'undefined' ? window.__PHOTOS : null;
  const src = override ? override[name] : new URL(`${name}.jpg`, PHOTO_DIR).href;
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const miss = (why) => {
      console.info(`[photos] "${name}" ${why}; using the illustrated fallback`);
      finish(null);
    };
    const timer = setTimeout(() => miss('took too long to load'), LOAD_TIMEOUT_MS);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w0 = img.naturalWidth;
        const h0 = img.naturalHeight;
        if (!(w0 > 0 && h0 > 0)) return miss('is empty');
        const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
        const { canvas, ctx } = makeCanvas(w0 * k, h0 * k);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.getImageData(0, 0, 1, 1); // throws if the canvas got tainted: then it is unusable as a texture
        finish(canvas);
      } catch (err) {
        miss(`could not be used (${err && err.message ? err.message : err})`);
      }
    };
    img.onerror = () => miss('is not available');
    img.src = src;
  });
}

/** True when the page URL carries `photos=0` (the last occurrence wins, as for the film's other parameters). */
export function photosDisabled() {
  try {
    return new URLSearchParams(location.search).getAll('photos').at(-1) === '0';
  } catch {
    return false;
  }
}

export function loadPhotos({ disabled } = {}) {
  if (disabled ?? photosDisabled()) return Promise.resolve(emptyPhotos());
  if (pending) return pending;
  const out = emptyPhotos();
  if (typeof document === 'undefined') {
    pending = Promise.resolve(out);
    return pending;
  }
  pending = Promise.all(
    NAMES.map((name) =>
      loadOne(name).then(
        (canvas) => {
          out[name] = canvas;
        },
        () => {},
      ),
    ),
  ).then(() => out);
  return pending;
}

// ------------------------------------------------------------------------------------------ helpers

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** drawImage with "object-fit: cover" around a focus point (fractions of the source). */
function drawCover(ctx, src, x, y, w, h, focus) {
  const sw = src.width;
  const sh = src.height;
  const k = Math.max(w / sw, h / sh);
  const cw = w / k;
  const ch = h / k;
  const cx = clamp(focus[0] * sw - cw / 2, 0, sw - cw);
  const cy = clamp(focus[1] * sh - ch / 2, 0, sh - ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, cx, cy, cw, ch, x, y, w, h);
}

/** A closed heart outline through (cx, cy) of half-width r, wobbled by `rnd` so it reads hand-drawn. */
function heartPath(ctx, cx, cy, r, rnd, wobble = 0.03) {
  const pts = [];
  const N = 44;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // classic heart curve, y up -> flip for canvas
    const hx = 16 * Math.pow(Math.sin(a), 3);
    const hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    const j = 1 + (rnd() - 0.5) * wobble;
    pts.push([cx + (hx / 17) * r * j, cy - ((hy + 2.5) / 17) * r * j]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

/** The stand-in for a missing photo: a blush card with a doodled heart. Finished-looking on purpose. */
function drawPlaceholder(ctx, x, y, w, h, rnd) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, '#f8ddd2');
  g.addColorStop(1, '#f4e4c6');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // faint polka dots
  const step = Math.max(14, w / 11);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let j = 0, yy = y + step * 0.5; yy < y + h; yy += step * 0.86, j++) {
    for (let xx = x + (j % 2 ? step : step * 0.5); xx < x + w; xx += step) {
      ctx.beginPath();
      ctx.arc(xx, yy, step * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const r = Math.min(w, h) * 0.3;
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // soft fill, a little off-register like a marker, then two loose outlines
  ctx.save();
  ctx.translate(r * 0.05, r * 0.04);
  heartPath(ctx, cx, cy, r * 0.96, rnd, 0.02);
  ctx.fillStyle = 'rgba(226, 87, 76, 0.88)';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#8f2f2a';
  ctx.lineWidth = Math.max(2, r * 0.045);
  heartPath(ctx, cx, cy, r, rnd, 0.035);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.2, r * 0.022);
  heartPath(ctx, cx + r * 0.02, cy - r * 0.015, r * 1.03, rnd, 0.05);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // highlight tick on the heart
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.beginPath();
  ctx.arc(cx - r * 0.42, cy - r * 0.3, r * 0.22, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  // little hearts and sparkles around it
  const minis = [
    [-0.36, -0.3, 0.2, '#e9b23e'],
    [0.37, -0.26, 0.15, '#3f9c95'],
    [0.33, 0.3, 0.18, '#e2574c'],
    [-0.34, 0.28, 0.13, '#78b7dd'],
  ];
  for (const [dx, dy, s, color] of minis) {
    const mx = cx + dx * w;
    const my = cy + dy * h;
    if (rnd() < 0.5) {
      heartPath(ctx, mx, my, r * s, rnd, 0.04);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      sparkle(ctx, mx, my, r * s * 0.8);
    }
  }
  ctx.restore();
}

function fillRound(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** A small standing figure. `vest` paints a blue vest over the torso. */
function doodlePerson(ctx, x, y, h, { vest = false, laugh = false, ink = '#3a2a24' } = {}) {
  const head = h * 0.22;
  ctx.fillStyle = '#f3d2b5';
  ctx.beginPath();
  ctx.arc(x, y - h + head * 0.85, head * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.stroke();
  if (laugh) {
    ctx.beginPath();
    ctx.arc(x, y - h + head * 0.95, head * 0.18, 0.15, Math.PI - 0.15);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - h + head, head * 0.12, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x - head * 0.16, y - h + head * 0.72);
  ctx.lineTo(x - head * 0.16, y - h + head * 0.78);
  ctx.moveTo(x + head * 0.16, y - h + head * 0.72);
  ctx.lineTo(x + head * 0.16, y - h + head * 0.78);
  ctx.stroke();
  const bodyTop = y - h + head * 1.45;
  fillRound(ctx, x - h * 0.16, bodyTop, h * 0.32, h * 0.38, h * 0.08, vest ? '#2f6fbe' : '#7a4a3a');
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.2, h * 0.035);
  ctx.beginPath();
  ctx.moveTo(x - h * 0.08, y - h * 0.22);
  ctx.lineTo(x - h * 0.12, y);
  ctx.moveTo(x + h * 0.08, y - h * 0.22);
  ctx.lineTo(x + h * 0.12, y);
  ctx.stroke();
}

/** Illustrated stand-ins for the five photos added in version 2. */
function drawMotif(ctx, x, y, w, h, rnd, motif) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  if (motif === 'oliver') {
    sky.addColorStop(0, '#9fd0ea');
    sky.addColorStop(0.55, '#d7eef6');
    sky.addColorStop(1, '#6ea84a');
  } else if (motif === 'tokyo') {
    sky.addColorStop(0, '#f7d7c4');
    sky.addColorStop(0.62, '#f3b9a4');
    sky.addColorStop(1, '#e7d3b0');
  } else {
    sky.addColorStop(0, '#f6efe2');
    sky.addColorStop(1, '#e7d3b4');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  if (motif === 'oliver') {
    const ground = y + h * 0.62;
    ctx.fillStyle = '#7fb069';
    ctx.fillRect(x, ground, w, h - (ground - y));
    ctx.fillStyle = '#6a9a52';
    for (let i = 0; i < 9; i++) {
      const gx = x + ((i * 0.13 + rnd() * 0.04) % 1) * w;
      ctx.fillRect(gx, ground + h * 0.08 + rnd() * h * 0.2, w * 0.012, h * 0.08);
    }
    const cx = x + w * 0.5;
    const cy = y + h * 0.58;
    const s = Math.min(w, h);
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d5d0c6';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.08, cy - s * 0.02, s * 0.1, s * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7f4ee';
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.16, cy - s * 0.1, s * 0.13, s * 0.1, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, cy - s * 0.16);
    ctx.lineTo(cx + s * 0.12, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.18, cy - s * 0.14);
    ctx.lineTo(cx + s * 0.28, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.3, cy - s * 0.1);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.24, cy - s * 0.1, s * 0.035, s * 0.02, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6aa0c8';
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy - s * 0.12, s * 0.018, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.27, cy - s * 0.11, s * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a4038';
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.22, cy);
    ctx.quadraticCurveTo(cx - s * 0.4, cy - s * 0.05, cx - s * 0.34, cy + s * 0.08);
    ctx.stroke();
  } else if (motif === 'walmart') {
    fillRound(ctx, x + w * 0.08, y + h * 0.55, w * 0.84, h * 0.28, 6, '#c4a574');
    fillRound(ctx, x + w * 0.62, y + h * 0.38, w * 0.22, h * 0.2, 4, '#5c6570');
    ctx.fillStyle = '#b7e0f2';
    ctx.fillRect(x + w * 0.66, y + h * 0.42, w * 0.14, h * 0.09);
    doodlePerson(ctx, x + w * 0.32, y + h * 0.78, h * 0.42, { vest: true });
    doodlePerson(ctx, x + w * 0.52, y + h * 0.78, h * 0.4, { vest: true });
  } else if (motif === 'lunch') {
    fillRound(ctx, x + w * 0.1, y + h * 0.58, w * 0.8, h * 0.12, 8, '#a87848');
    ctx.fillStyle = '#f7f1e4';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.34, y + h * 0.58, w * 0.1, h * 0.035, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.62, y + h * 0.58, w * 0.1, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2574c';
    ctx.beginPath();
    ctx.arc(x + w * 0.34, y + h * 0.55, w * 0.035, 0, Math.PI * 2);
    ctx.fill();
    doodlePerson(ctx, x + w * 0.48, y + h * 0.7, h * 0.46, { laugh: true });
  } else if (motif === 'deed') {
    fillRound(ctx, x + w * 0.12, y + h * 0.52, w * 0.76, h * 0.16, 6, '#8d6a45');
    ctx.fillStyle = '#fbf7ee';
    ctx.fillRect(x + w * 0.38, y + h * 0.42, w * 0.24, h * 0.14);
    ctx.strokeStyle = '#3a2f2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + h * 0.48);
    ctx.lineTo(x + w * 0.58, y + h * 0.5);
    ctx.moveTo(x + w * 0.42, y + h * 0.52);
    ctx.lineTo(x + w * 0.55, y + h * 0.53);
    ctx.stroke();
    doodlePerson(ctx, x + w * 0.28, y + h * 0.74, h * 0.4, {});
    doodlePerson(ctx, x + w * 0.72, y + h * 0.74, h * 0.4, {});
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, h * 0.012);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.34, y + h * 0.48);
    ctx.lineTo(x + w * 0.46, y + h * 0.5);
    ctx.moveTo(x + w * 0.66, y + h * 0.48);
    ctx.lineTo(x + w * 0.54, y + h * 0.51);
    ctx.stroke();
  } else if (motif === 'tokyo') {
    const gate = '#c0392b';
    const left = x + w * 0.22;
    const right = x + w * 0.78;
    const top = y + h * 0.16;
    const foot = y + h * 0.82;
    ctx.fillStyle = gate;
    ctx.fillRect(left, top + h * 0.08, w * 0.06, foot - (top + h * 0.08));
    ctx.fillRect(right - w * 0.06, top + h * 0.08, w * 0.06, foot - (top + h * 0.08));
    ctx.beginPath();
    ctx.moveTo(x + w * 0.12, top + h * 0.1);
    ctx.quadraticCurveTo(x + w * 0.5, top - h * 0.04, x + w * 0.88, top + h * 0.1);
    ctx.lineTo(x + w * 0.84, top + h * 0.18);
    ctx.quadraticCurveTo(x + w * 0.5, top + h * 0.06, x + w * 0.16, top + h * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + w * 0.16, top + h * 0.2, w * 0.68, h * 0.045);
    doodlePerson(ctx, x + w * 0.42, foot, h * 0.28, {});
    doodlePerson(ctx, x + w * 0.58, foot, h * 0.26, {});
  }
  ctx.restore();
}

function drawPicture(ctx, photo, x, y, w, h, focus, rnd, motif) {
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawCover(ctx, photo, x, y, w, h, focus);
    ctx.restore();
  } else if (motif) {
    drawMotif(ctx, x, y, w, h, rnd, motif);
  } else {
    drawPlaceholder(ctx, x, y, w, h, rnd);
  }
}

/** One line of handwriting centred on (cx, cy), shrunk to fit `maxW`. */
function writeCaption(ctx, text, cx, cy, maxW, size, rnd, color = INK) {
  if (!text) return;
  ctx.save();
  let px = size;
  ctx.font = `700 ${px}px ${FONT.hand}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    px = Math.max(8, (px * maxW) / w);
    ctx.font = `700 ${px}px ${FONT.hand}`;
  }
  ctx.translate(cx, cy);
  ctx.rotate((rnd() - 0.5) * 0.05);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------ washi tape

function paintTape(ctx, len, h, color, rnd) {
  const tooth = h * 0.16;
  const zig = (x, dir) => {
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const yy = dir > 0 ? (h * i) / n : h - (h * i) / n;
      const mid = dir > 0 ? yy - h / n / 2 : yy + h / n / 2;
      ctx.lineTo(x + dir * tooth * (0.6 + rnd() * 0.5), mid);
      ctx.lineTo(x, yy);
    }
  };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tooth, 0);
  ctx.lineTo(len - tooth, 0);
  zig(len - tooth, 1);
  ctx.lineTo(tooth, h);
  zig(tooth, -1);
  ctx.closePath();
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();
  // pattern: diagonal stripes or dots, lighter than the tape
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  if (rnd() < 0.5) {
    ctx.lineWidth = h * 0.14;
    for (let x = -h; x < len + h; x += h * 0.42) {
      ctx.beginPath();
      ctx.moveTo(x, h * 1.1);
      ctx.lineTo(x + h * 0.7, -h * 0.1);
      ctx.stroke();
    }
  } else {
    const s = h * 0.34;
    for (let j = 0, y = s * 0.55; y < h; y += s * 0.95, j++) {
      for (let x = j % 2 ? s : s * 0.5; x < len; x += s) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // translucent sheen along the upper half, like the tape catching the light
  ctx.globalAlpha = 0.12;
  ctx.fillRect(0, 0, len, h * 0.4);
  ctx.restore();
}

export function washiTape(length = 220, { height, color, seed = 1 } = {}) {
  const rnd = mulberry32((seed * 0x9e3779b1) ^ 0x7a9e);
  const h = Math.round(height ?? length * 0.24);
  const { canvas, ctx } = makeCanvas(length, h);
  paintTape(ctx, canvas.width, h, color ?? TAPE_COLORS[Math.floor(rnd() * TAPE_COLORS.length)], rnd);
  return canvas;
}

// ------------------------------------------------------------------------------------------ prints

function paintPolaroid(photo, W, { caption, aspect, focus, motif }, rnd) {
  const b = W * 0.06;
  const a = clamp(aspect ?? (photo ? photo.width / photo.height : 0.8), 0.68, 1.4);
  const ww = W - 2 * b;
  const wh = ww / a;
  const bottom = W * 0.2;
  const H = Math.round(b + wh + bottom);
  const { canvas, ctx } = makeCanvas(W, H);
  const r = W * 0.012;
  ctx.fillStyle = PAPER.white;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, W - 1, H - 1, r);
  ctx.fill();
  // card edge: a hair of shading so white-on-cream still reads as a separate sheet
  ctx.strokeStyle = 'rgba(90, 70, 50, 0.22)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.stroke();
  drawPicture(ctx, photo, b, b, ww, wh, focus, rnd, motif);
  ctx.strokeStyle = 'rgba(40, 30, 20, 0.22)';
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.strokeRect(b, b, ww, wh);
  writeCaption(ctx, caption, W / 2, b + wh + bottom * 0.5, ww * 0.94, W * 0.115, rnd);
  return canvas;
}

function paintPrint(photo, W, { caption, aspect, focus, motif }, rnd) {
  const b = W * 0.04;
  const a = clamp(aspect ?? (photo ? photo.width / photo.height : 0.8), 0.6, 1.8);
  const ww = W - 2 * b;
  const wh = ww / a;
  const bottom = caption ? W * 0.16 : b;
  const H = Math.round(b + wh + bottom);
  const { canvas, ctx } = makeCanvas(W, H);
  // deckled edge: small scallops all the way round
  const amp = W * 0.006;
  const step = W * 0.022;
  const inset = amp + 0.5;
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const tm = (i - 0.5) / n;
      const bulge = amp * (0.5 + rnd());
      ctx.quadraticCurveTo(
        x0 + (x1 - x0) * tm + nx * bulge,
        y0 + (y1 - y0) * tm + ny * bulge,
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
      );
    }
  };
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  edge(inset, inset, W - inset, inset, 0, -1);
  edge(W - inset, inset, W - inset, H - inset, 1, 0);
  edge(W - inset, H - inset, inset, H - inset, 0, 1);
  edge(inset, H - inset, inset, inset, -1, 0);
  ctx.closePath();
  ctx.fillStyle = PAPER.white;
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 70, 50, 0.2)';
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.stroke();
  drawPicture(ctx, photo, b, b, ww, wh, focus, rnd, motif);
  ctx.strokeStyle = 'rgba(40, 30, 20, 0.2)';
  ctx.lineWidth = Math.max(1, W * 0.003);
  ctx.strokeRect(b, b, ww, wh);
  writeCaption(ctx, caption, W / 2, b + wh + bottom * 0.5, ww * 0.94, W * 0.1, rnd);
  return canvas;
}

function paintOval(photo, W, { caption, aspect, focus, motif }, rnd) {
  const a = clamp(aspect ?? 0.8, 0.6, 1.5);
  const OH = W / a;
  const banner = caption ? W * 0.2 : 0;
  const H = Math.round(OH + banner * 0.72);
  const { canvas, ctx } = makeCanvas(W, H);
  const cx = W / 2;
  const cy = OH / 2;
  const mat = W * 0.07;
  // cream mat
  ctx.beginPath();
  ctx.ellipse(cx, cy, W / 2 - 1, OH / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fillStyle = PAPER.cream;
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 70, 50, 0.28)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.stroke();
  // picture
  const rx = W / 2 - mat;
  const ry = OH / 2 - mat;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  if (photo) drawCover(ctx, photo, cx - rx, cy - ry, rx * 2, ry * 2, focus);
  else if (motif) drawMotif(ctx, cx - rx, cy - ry, rx * 2, ry * 2, rnd, motif);
  else drawPlaceholder(ctx, cx - rx, cy - ry, rx * 2, ry * 2, rnd);
  // soft inner vignette so the picture sits IN the mat
  const g = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.72, cx, cy, Math.max(rx, ry) * 1.02);
  g.addColorStop(0, 'rgba(40, 24, 10, 0)');
  g.addColorStop(1, 'rgba(40, 24, 10, 0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();
  // keylines: a dark hairline at the picture edge and a gold line in the mat
  ctx.strokeStyle = 'rgba(60, 40, 20, 0.45)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#b8924a';
  ctx.lineWidth = Math.max(1.2, W * 0.007);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + mat * 0.45, ry + mat * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (caption) {
    // a small paper label overlapping the bottom of the medallion
    const bw = W * 0.78;
    const bh = banner * 0.78;
    const by = H - bh - 1;
    ctx.save();
    ctx.translate(cx, by + bh / 2);
    ctx.rotate((rnd() - 0.5) * 0.04);
    ctx.fillStyle = PAPER.white;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh * 0.16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 70, 50, 0.3)';
    ctx.lineWidth = Math.max(1, W * 0.004);
    ctx.stroke();
    ctx.restore();
    writeCaption(ctx, caption, cx, by + bh / 2, bw * 0.9, bh * 0.78, rnd);
  }
  return canvas;
}

const PAINTERS = { polaroid: paintPolaroid, print: paintPrint, oval: paintOval };

export function photoPrint(photo, options = {}) {
  const {
    width = 512,
    style = 'polaroid',
    caption = '',
    tilt = 0,
    tape = true,
    aspect,
    focus = [0.5, 0.4],
    seed = 1,
    tapeColor,
    shadow = false,
    motif,
  } = options;
  const painter = PAINTERS[style];
  if (!painter) throw new Error(`photoPrint: unknown style "${style}"`);
  const W = Math.max(48, Math.round(width));
  const rnd = mulberry32((seed * 0x9e3779b1) ^ 0x51f15e ^ (style.length << 8));
  const piece = painter(photo ?? null, W, { caption: String(caption ?? ''), aspect, focus, motif: resolveMotif({ motif, aspect }) }, rnd);
  // paper tooth over the whole piece (light: it is a photo print, not rough stock)
  addGrain(piece.getContext('2d', { willReadFrequently: true }), piece.width, piece.height, { amount: 0.022, seed: seed + 3, mottle: 0.5 });

  const pw = piece.width;
  const ph = piece.height;
  const withTape = tape && style !== 'oval';
  const tapeLen = W * 0.36;
  const tapeH = W * 0.095;
  const pad = Math.ceil((withTape ? tapeH * 0.75 : 0) + (shadow ? W * 0.07 : 0) + 3);
  const c = Math.abs(Math.cos(tilt));
  const s = Math.abs(Math.sin(tilt));
  const cw = Math.ceil(pw * c + ph * s) + pad * 2;
  const ch = Math.ceil(pw * s + ph * c) + pad * 2;
  const { canvas, ctx } = makeCanvas(cw, ch);
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(tilt);
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(45, 28, 12, 0.34)';
    ctx.shadowBlur = W * 0.035;
    ctx.shadowOffsetX = W * 0.006;
    ctx.shadowOffsetY = W * 0.016;
    ctx.drawImage(piece, -pw / 2, -ph / 2);
    ctx.restore();
  }
  ctx.drawImage(piece, -pw / 2, -ph / 2);
  if (withTape) {
    const color = tapeColor ?? TAPE_COLORS[Math.floor(rnd() * TAPE_COLORS.length)];
    ctx.save();
    ctx.translate((rnd() - 0.5) * W * 0.12, -ph / 2 + tapeH * 0.12);
    ctx.rotate((rnd() - 0.5) * 0.22);
    ctx.translate(-tapeLen / 2, -tapeH / 2);
    paintTape(ctx, tapeLen, tapeH, color, rnd);
    ctx.restore();
  }
  canvas.print = { x: cw / 2, y: ch / 2, w: pw, h: ph, tilt };
  return canvas;
}
