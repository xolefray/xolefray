// STUB (T-scaffold) — the placeholder spread shared by the six stub spread modules.
// Each real spread replaces its own file (walmart.js, dates.js, …); delete this helper with the last
// stub. It is deliberately small, but it exercises everything a real spread uses, as a worked example:
//   • the build context  { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }
//   • page art in the album orientation (paper.page -> 1024 x 853; top = far edge; the gutter is the
//     RIGHT edge of leftArt and the LEFT edge of rightArt), lettered with FONT.display / FONT.hand
//   • a photo print (photos.js photoPrint — illustrated fallback when the photo is null)
//   • one V-fold card across the gutter, sized with popup.vFoldLimits
//   • the paper-doll figures on standUps (figures.figureCard, with a plain fallback)
//   • camera cues in SPREAD-FRAME coordinates, timed from timeline.js (never literal times)
//   • update(alpha, t, local): pure, no allocation
import { photoPrint, PHOTO_ASPECT } from '../photos.js';
import { L, narrationText, spreadTitle, tr } from '../i18n.js';

const GAMMA = 1.9; // one mountain angle for every V-fold of a spread: same-side halves stay parallel

/** Chunky cut-out letters: every glyph its own colour on a paper-white backing, slightly askew. */
function cutLetters(ctx, text, cx, cy, px, maxW, FONT, colors, rng, backing = '#fbf7ee') {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  let size = px;
  const gap = () => size * 0.05;
  const measure = () => {
    ctx.font = `${size}px ${FONT.display}`;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + gap();
    return w - gap();
  };
  let total = measure();
  if (total > maxW) {
    size *= maxW / total;
    total = measure();
  }
  let x = cx - total / 2;
  let i = 0;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    if (ch !== ' ') {
      const color = colors[i++ % colors.length];
      ctx.save();
      ctx.translate(x + w / 2, cy + (rng.next() - 0.5) * size * 0.1);
      ctx.rotate((rng.next() - 0.5) * 0.16);
      ctx.shadowColor = 'rgba(50, 30, 12, 0.3)';
      ctx.shadowBlur = size * 0.05;
      ctx.shadowOffsetY = size * 0.035;
      ctx.strokeStyle = backing;
      ctx.lineWidth = size * 0.2;
      ctx.strokeText(ch, -w / 2, 0);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = color;
      ctx.fillText(ch, -w / 2, 0);
      ctx.restore();
    }
    x += w + gap();
  }
  ctx.restore();
}

/** Handwriting, wrapped to maxW; returns the y below the last line. */
function handwrite(ctx, text, x, y, maxW, px, FONT, color) {
  ctx.save();
  ctx.font = `700 ${px}px ${FONT.hand}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let line = '';
  for (const word of text.split(' ')) {
    const probe = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(probe).width > maxW) {
      ctx.fillText(line, x, y);
      y += px * 1.05;
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += px * 1.05;
  }
  ctx.restore();
  return y;
}

function doodleHeart(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.5, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.4);
  ctx.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.5, -r * 0.2, 0, r * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A plain paper-doll silhouette, used only when figures.js is not available yet. */
function fallbackFigure(paper, who, heights, color) {
  const h = who === 'her' ? heights.herHeight : heights.himHeight;
  const canvas = paper.paint(256, 512, (ctx, w, hh) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w / 2, hh * 0.16, w * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w * 0.27, hh * 0.27, w * 0.46, hh * 0.68, w * 0.16);
    ctx.fill();
  }, { dieCut: 10, seed: who === 'her' ? 5 : 4 });
  return paper.card({ canvas, width: h / 2, height: h });
}

/**
 * @param ctx  the build context main.js passes to every spread
 * @param spec { id, k, tints:[left,right], outfit, poses:[him,her], photo: name|null, photoCaption }
 */
export function buildStubSpread(ctx, spec) {
  const { THREE, paper, popup, rng, photos, figures, FONT, timeline } = ctx;
  const info = timeline.SPREADS.find((s) => s.id === spec.id) || timeline.SPREADS[spec.k - 1];
  const k = info.k;
  const title = spreadTitle(info);
  const lines = timeline.NARRATION.filter((n) => n.spread === k);
  const C = paper.PALETTES.scrapbook;
  const letterColors = [C.tomato, C.mustard, C.teal, C.sky, C.leaf];
  const group = new THREE.Group();
  group.name = `spread-${info.id}-stub`;

  // ---- page art (reader's view: leftArt | rightArt side by side) ---------------------------------
  const leftArt = paper.page((g, w, h) => {
    // dashed "stitched" frame
    g.strokeStyle = 'rgba(90, 60, 30, 0.35)';
    g.lineWidth = 3;
    g.setLineDash([14, 10]);
    g.strokeRect(34, 34, w - 68, h - 68);
    g.setLineDash([]);
    const words = title.split(' ');
    const half = Math.ceil(words.length / 2);
    const rows = title.length > 11 && words.length > 1 ? [words.slice(0, half).join(' '), words.slice(half).join(' ')] : [title];
    rows.forEach((row, i) => cutLetters(g, row, w / 2, h * (rows.length > 1 ? 0.24 + i * 0.2 : 0.32), 132, w * 0.8, FONT, letterColors, rng));
    g.font = `700 54px ${FONT.hand}`;
    g.fillStyle = C.ink;
    g.textAlign = 'center';
    g.fillText(L(`page ${k} of ${timeline.SPREADS.length} — placeholder`, `página ${k} de ${timeline.SPREADS.length} — boceto`), w / 2, h * 0.68);
    g.font = `400 40px ${FONT.hand}`;
    g.fillText(L(`“${tr('stubPlaceholder')}” & then some…`, `«${tr('stubPlaceholder')}» y algo más…`), w / 2, h * 0.76);
    for (let i = 0; i < 7; i++) {
      doodleHeart(g, w * (0.12 + 0.76 * rng.next()), h * (0.84 + 0.08 * rng.next()), 10 + rng.next() * 12, letterColors[i % letterColors.length]);
    }
  }, { seed: 100 + k, tint: spec.tints[0] });

  const rightArt = paper.page((g, w, h) => {
    g.strokeStyle = 'rgba(90, 60, 30, 0.35)';
    g.lineWidth = 3;
    g.setLineDash([14, 10]);
    g.strokeRect(34, 34, w - 68, h - 68);
    g.setLineDash([]);
    // the narrator's lines for this spread, as a hand-written note (also proves the punctuation set)
    const textW = spec.photo ? w * 0.5 : w * 0.8;
    let y = h * 0.1;
    for (const n of lines) y = handwrite(g, narrationText(n), w * 0.09, y, textW, 36, FONT, C.ink) + 10;
    // a taped print, drawn INTO the page (so it asks photoPrint for its own soft shadow)
    if (spec.photo) {
      const print = photoPrint(photos?.[spec.photo] ?? null, {
        width: 300,
        style: k === 1 ? 'polaroid' : 'print',
        caption: spec.photoCaption,
        tilt: 0.07,
        seed: 40 + k,
        shadow: true,
        aspect: PHOTO_ASPECT[spec.photo],
        motif: spec.photo,
      });
      g.drawImage(print, w * 0.955 - print.width, h * 0.07);
    }
  }, { seed: 200 + k, tint: spec.tints[1] });

  // ---- one V-fold sign across the gutter ---------------------------------------------------------
  const fold = { z0: -0.55, gamma: GAMMA, width: 2.4, height: 1.05 };
  if (!popup.vFoldLimits(fold).fits) console.warn(`[stub spread ${k}] vFold does not fit the page`);
  const sign = popup.vFold(fold);
  const signArt = paper.paint(1024, 448, (g, w, h) => {
    g.fillStyle = spec.tints[1];
    g.beginPath();
    g.roundRect(24, 24, w - 48, h - 48, 40);
    g.fill();
    g.strokeStyle = C.kraftDeep;
    g.lineWidth = 6;
    g.setLineDash([18, 12]);
    g.beginPath();
    g.roundRect(48, 48, w - 96, h - 96, 26);
    g.stroke();
    g.setLineDash([]);
    // keep the letters off the centre fold: one word per half
    cutLetters(g, `No. ${k}`, w * 0.26, h * 0.52, 150, w * 0.38, FONT, letterColors, rng);
    cutLetters(g, info.id.toUpperCase(), w * 0.74, h * 0.52, 110, w * 0.4, FONT, letterColors.slice(2).concat(letterColors), rng);
  }, { dieCut: 12, seed: 300 + k });
  const halves = paper.splitCard({ canvas: signArt, width: fold.width, height: fold.height });
  sign.left.add(halves.left);
  sign.right.add(halves.right);

  // ---- the couple, one figure on each page (standUps, R2: height <= x - width/2) --------------------
  const heights = figures?.FIGURE ?? { himHeight: 1.0, herHeight: 0.9 };
  const makeFigure = (who, pose, facing) => {
    try {
      const card = figures.figureCard(paper, who, { outfit: spec.outfit, pose, facing, seed: 10 * k + (who === 'her' ? 2 : 1) });
      if (card && card.isObject3D) return card;
    } catch {
      // figures.js is not there yet (or this pose is not): fall through to the silhouette
    }
    return fallbackFigure(paper, who, heights, who === 'her' ? C.blush : C.sky);
  };
  const standHim = popup.standUp({ side: 'right', x: 1.9, z: 0.75, width: 0.8, height: heights.himHeight });
  const standHer = popup.standUp({ side: 'left', x: 1.9, z: 0.75, width: 0.8, height: heights.herHeight });
  const him = makeFigure('him', spec.poses[0], 'left');
  const her = makeFigure('her', spec.poses[1], 'right');
  standHim.mount.add(him);
  standHer.mount.add(her);

  const mechs = popup.collection([sign, standHim, standHer]);
  group.add(mechs.object);

  // ---- camera cues (spread frame; times from the schedule) ----------------------------------------
  const cues = [{ t: info.open, hold: 2, at: [0, 0.35, 0], size: 7.5, from: 'front' }];
  if (lines[1]) cues.push({ t: lines[1].start + 0.6, hold: 2, at: [-1.9, 0.5, 0.6], size: 3.2, from: 'left' });
  if (lines[2]) cues.push({ t: lines[2].start + 0.6, hold: 2, at: [0, 0.6, -0.4], size: 3.4, from: 'front' });
  if (lines[3]) cues.push({ t: lines[3].start + 0.6, hold: 2, at: [1.9, 0.5, 0.6], size: 3.2, from: 'right' });
  const last = lines[lines.length - 1];
  if (last && lines.length > 2) cues.push({ t: last.start + 0.8, hold: 1.5, at: [0, 0.35, 0], size: 7.5, from: 'high' });
  for (const c of cues) c.t = Math.round(c.t * 100) / 100;

  return {
    group,
    leftArt,
    rightArt,
    cues,
    update(alpha, t) {
      mechs.update(alpha);
      // a small paper-doll sway, pure in t; props that could be pinched fade with rise() in real spreads
      const sway = Math.sin(t * 1.7 + k) * 0.03 * popup.rise(alpha);
      him.rotation.z = sway;
      her.rotation.z = -sway;
    },
  };
}
