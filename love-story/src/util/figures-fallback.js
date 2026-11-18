/**
 * figures-fallback.js — plain stand-ins for src/figures.js (the paper-doll characters), so the film
 * still runs when that module is missing, fails to load or lacks part of its API.
 *
 * resolveFigures(mod, paper) -> { paintFigure, paintDog, FIGURE, figureCard }: every member the real
 * module provides is used as is; each missing one is replaced by the stand-in below (plain die-cut
 * silhouettes with the contract's signatures) and listed once in a console.warn. main.js passes the
 * result to the book and the spreads as `figures`.
 */

const FIGURE = { himHeight: 1.0, herHeight: 0.9, sisterHeight: 0.62, chihuahuaHeight: 0.26 };
const TONES = { him: '#5f8fc4', her: '#e58f8a', sister: '#e9b23e' };

export function fallbackFigures(paper) {
  function paintFigure(who = 'him', { facing = 'right', px = 512, seed = 1 } = {}) {
    return paper.paint(px / 2, px, (ctx, w, h) => {
      const dir = facing === 'left' ? -1 : 1;
      ctx.fillStyle = TONES[who] ?? TONES.him;
      ctx.beginPath();
      ctx.arc(w / 2 + dir * w * 0.02, h * 0.16, w * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(w * 0.27, h * 0.27, w * 0.46, h * 0.68, w * 0.16);
      ctx.fill();
    }, { dieCut: Math.max(4, px / 50), seed });
  }

  function paintDog(kind = 'chihuahua', { px = 384 } = {}) {
    return paper.paint(px, px * 0.8, (ctx, w, h) => {
      ctx.fillStyle = kind === 'familyDog' ? '#e9dcc6' : '#d9a566';
      ctx.beginPath();
      ctx.ellipse(w * 0.46, h * 0.62, w * 0.28, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.74, h * 0.4, w * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.26, h * 0.7, w * 0.07, h * 0.2);
      ctx.fillRect(w * 0.6, h * 0.7, w * 0.07, h * 0.2);
    }, { dieCut: Math.max(4, px / 40), seed: 9 });
  }

  function figureCard(paperLib, who = 'him', opts = {}) {
    const height = who === 'her' ? FIGURE.herHeight : who === 'sister' ? FIGURE.sisterHeight : FIGURE.himHeight;
    const canvas = paintFigure(who, opts);
    return (paperLib ?? paper).card({ canvas, width: (height * canvas.width) / canvas.height, height });
  }

  return { paintFigure, paintDog, FIGURE, figureCard };
}

const MEMBERS = { paintFigure: 'function', paintDog: 'function', figureCard: 'function', FIGURE: 'object' };

export function resolveFigures(mod, paper) {
  const fallback = fallbackFigures(paper);
  const out = {};
  const missing = [];
  for (const [name, type] of Object.entries(MEMBERS)) {
    const real = mod ? mod[name] : undefined;
    if (real != null && typeof real === type) out[name] = real;
    else {
      out[name] = fallback[name];
      missing.push(name);
    }
  }
  if (missing.length) {
    console.warn(`[film] figures.js ${mod ? `lacks ${missing.join(', ')}` : 'is not available'}; using plain stand-in figures for ${mod ? 'those' : 'all of them'}`);
  }
  return out;
}
