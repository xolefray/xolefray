/**
 * titles.js — narration captions, scrapbook page titles, and the end card.
 *
 * DOM type over the WebGL canvas. There is no opening title card: the book's cover is the title.
 * Captions come from timeline.NARRATION (bottom-centre, storybook italic). A line fades in and out
 * over 0.5 s and stays up until 0.6 s after it ends, or until the next line starts, whichever is
 * sooner. During each page turn, from LEAF_TURNS[i].start + 0.4 s to the turn's end, the spread
 * that turn opens shows SPREADS[k].title as a hand-lettered label on a strip of washi tape. Nothing
 * else is titled during the cover. From END_CARD.start the names, a small heart and the wedding
 * date fade in over 1.2 s and stay through DURATION; a black veil fades from END_CARD.fadeStart to
 * END_CARD.end underneath them.
 *
 * Every opacity and drift is a pure function of film time t — no CSS transitions, no timers — so
 * scrubbing matches in both directions. The DOM is written only when a rounded value changes.
 * prefers-reduced-motion: fades only (the tape keeps its fixed tilt). pointer-events: none.
 *
 * `?captions=0` hides the narration captions only. main.js passes `{ captions: false }` and sets
 * <html data-captions="0">; either is honoured. Page titles, the end card and the veil stay.
 * The container must be a full-screen box above the canvas and below the player controls. Set
 * `--tt-caption-bottom` on it to move the caption baseline (styles.css does, to clear the controls).
 */
import { COUPLE, END_CARD, LEAF_TURNS, NARRATION, SPREADS, ease, seg, smoothstep } from './timeline.js';
import { FONT } from './fonts.js';
import { L, narrationText, spreadTitle, tr } from './i18n.js';

const CAPTION_FADE = 0.5;
const CAPTION_HOLD = 0.6;
const PAGE_FADE = 0.42;
const END_FADE = 1.2;

/** One washi strip per spread, in scrapbook order. Tilt is fixed (not animated). */
const TAPES = [
  { tilt: '-2.4deg', color: '#a33d38' },
  { tilt: '1.75deg', color: '#7a5322' },
  { tilt: '-1.55deg', color: '#1e6a66' },
  { tilt: '2.15deg', color: '#2c5476' },
  { tilt: '-1.9deg', color: '#3d663c' },
  { tilt: '1.4deg', color: '#7a3b50' },
  { tilt: '-2.6deg', color: '#8a5a2b' },
  { tilt: '1.15deg', color: '#5a3d78' },
];

/** Spread k's label rides the leaf turn that opens it: turn start + 0.4 s → turn end. */
const PAGE_TITLES = SPREADS.map((s, i) => {
  const turn = LEAF_TURNS.find((tr) => tr.leaf === s.k - 1);
  const tape = TAPES[i % TAPES.length];
  return { start: turn.start + 0.4, end: turn.end, text: spreadTitle(s), tilt: tape.tilt, color: tape.color };
});

/** Hold each spoken line 0.6 s past its end, but never into the next line. */
const LINES = NARRATION.map((n, i) => {
  const next = NARRATION[i + 1];
  const showEnd = Math.min(n.end + CAPTION_HOLD, next ? next.start : n.end + CAPTION_HOLD);
  return { text: narrationText(n), start: n.start, showEnd };
});

const CSS = `
.tt-root {
  --tt-cream: #f6eedc;
  --tt-gold: #f0d7a6;
  --tt-ink: 14, 9, 6;
  position: absolute; inset: 0; overflow: hidden; isolation: isolate; contain: layout paint style;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  font-family: ${FONT.serif}; font-weight: 400; color: var(--tt-cream);
  font-kerning: normal; text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
.tt-root * { box-sizing: border-box; }
.tt-l { visibility: hidden; opacity: 0; }

.tt-veil { position: absolute; inset: 0; z-index: 5; background: #000; }
.tt-scrim {
  position: absolute; left: 0; right: 0; bottom: 0; height: 40%; z-index: 2;
  background: linear-gradient(to top,
    rgba(var(--tt-ink), .84) 0%,
    rgba(var(--tt-ink), .62) 22%,
    rgba(var(--tt-ink), .32) 48%,
    rgba(var(--tt-ink), .08) 74%,
    rgba(var(--tt-ink), 0) 100%);
}

.tt-page {
  position: absolute; left: 0; right: 0; z-index: 4;
  top: calc(env(safe-area-inset-top, 0px) + clamp(14px, 4.6vh, 80px));
  display: flex; justify-content: center; padding: 0 14px;
}
.tt-tag {
  display: inline-block; max-width: min(14em, calc(100vw - 28px));
  padding: 0.14em 0.82em 0.18em; text-align: center;
  font-family: ${FONT.hand}; font-weight: 700; font-style: normal;
  font-size: clamp(1.15rem, 0.48rem + 1.35vw, 3.6rem); line-height: 1.08;
  letter-spacing: 0.005em; color: var(--tt-cream);
  overflow-wrap: break-word; text-wrap: balance; transform: rotate(var(--tt-tilt, -2deg));
  background-color: var(--tt-tape, #8a4038);
  background-image:
    linear-gradient(180deg, rgba(255,255,255,.3), rgba(255,255,255,0) 40%, rgba(0,0,0,.16)),
    repeating-linear-gradient(90deg, rgba(255,255,255,.09) 0 1px, transparent 1px 4px);
  border-radius: 2px;
  box-shadow:
    0 1px 0 rgba(255,255,255,.38) inset,
    0 -1px 0 rgba(0,0,0,.22) inset,
    0 0.4em 0.85em rgba(var(--tt-ink), .34);
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .55), 0 0 0.4em rgba(var(--tt-ink), .28);
}

.tt-caps {
  position: absolute; left: 0; right: 0; z-index: 3;
  padding: 0 clamp(14px, 4vw, 72px);
  bottom: var(--tt-caption-bottom, calc(env(safe-area-inset-bottom, 0px) + clamp(28px, 8vh, 140px)));
  display: grid; justify-items: center; align-items: end;
}
.tt-cap {
  grid-area: 1 / 1; position: relative; isolation: isolate;
  max-width: min(38em, 100%); margin: 0; padding: 0.16em 0.55em 0.2em;
  font-style: italic; font-size: var(--tt-cap-size, clamp(1.67rem, 0.79rem + 1.99vw, 5.56rem)); line-height: 1.28;
  letter-spacing: 0.004em; text-align: center; text-wrap: wrap; white-space: pre-line; overflow-wrap: break-word;
  text-shadow:
    0 1px 2px rgba(var(--tt-ink), .95),
    0 0 0.4em rgba(var(--tt-ink), .92),
    0 0 1.15em rgba(var(--tt-ink), .78),
    0 2px 12px rgba(var(--tt-ink), .7);
}
.tt-cap::before {
  content: ""; position: absolute; z-index: -1; left: -0.35em; right: -0.35em; top: -0.28em; bottom: -0.42em;
  border-radius: 0.85em;
  background:
    linear-gradient(to top,
      rgba(var(--tt-ink), .78) 0%,
      rgba(var(--tt-ink), .58) 42%,
      rgba(var(--tt-ink), .28) 74%,
      rgba(var(--tt-ink), 0) 100%);
}

.tt-end {
  position: absolute; inset: 0; z-index: 6; padding: 0 4vw 3vh;
  display: flex; align-items: center; justify-content: center; text-align: center;
}
.tt-end-glow {
  position: absolute; inset: 0; z-index: -1;
  background: radial-gradient(ellipse 46% 38% at 50% 46%, rgba(var(--tt-ink), .62), rgba(var(--tt-ink), .3) 46%, rgba(var(--tt-ink), 0) 74%);
}
.tt-end-stack { display: flex; flex-direction: column; align-items: center; gap: clamp(8px, 1.7vh, 30px); max-width: 100%; }
.tt-end-names {
  margin: 0; max-width: 100%;
  font-family: ${FONT.display}; font-weight: 400; font-style: normal;
  font-size: clamp(1.55rem, min(7.2vw, 12vh), 10rem); line-height: 1.02; letter-spacing: 0.005em;
  text-wrap: balance; overflow-wrap: break-word;
  text-shadow: 0 0.035em 0.1em rgba(var(--tt-ink), .55), 0 0 0.4em rgba(var(--tt-ink), .32);
}
.tt-heart {
  width: clamp(18px, min(2.6vw, 3.6vh), 58px); height: auto; display: block;
  fill: #e15a4e; filter: drop-shadow(0 0.12em 0.2em rgba(var(--tt-ink), .45));
}
.tt-end-date {
  margin: 0; max-width: 100%;
  font-family: ${FONT.hand}; font-weight: 700; font-style: normal; color: var(--tt-gold);
  font-size: clamp(1.35rem, min(3.6vw, 6vh), 4rem); line-height: 1.15;
  text-wrap: balance; overflow-wrap: break-word;
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .6), 0 0 0.45em rgba(var(--tt-ink), .35);
}
`;

const HEART_SVG =
  '<svg class="tt-heart" viewBox="0 0 32 30" aria-hidden="true"><path d="M16 27.6C7.4 20.6 2.2 15.8 2.2 10 2.2 5.8 5.4 2.8 9.1 2.8c2.5 0 4.6 1.2 6.9 3.7 2.3-2.5 4.4-3.7 6.9-3.7 3.7 0 6.9 3 6.9 7.2 0 5.8-5.2 10.6-13.8 17.6z"/></svg>';

/** 0 outside [start, end]; smooth ramps inside, shortened if the window is brief. */
function envelope(t, start, end, fadeIn, fadeOut = fadeIn) {
  if (t <= start || t >= end) return 0;
  const span = end - start;
  const fin = fadeIn < span * 0.5 ? fadeIn : span * 0.5;
  const fout = fadeOut < span * 0.5 ? fadeOut : span * 0.5;
  return smoothstep(start, start + fin, t) * (1 - smoothstep(end - fout, end, t));
}

/** vh offset: settles upward from `rise`, then lifts `lift` across the last 0.5 s. */
function drift(t, start, end, rise, lift) {
  const settle = Math.min(1.15, (end - start) * 0.5);
  const up = rise * (1 - ease.outCubic(seg(t, start, start + settle)));
  const out = lift * ease.inQuad(seg(t, Math.max(start, end - 0.5), end));
  return up - out;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Caches style writes so an unchanged frame does not touch the DOM. */
class Layer {
  constructor(node) {
    this.node = node;
    this.opacity = -1;
    this.y = Number.NaN;
    this.vis = '';
  }

  /** Opacity plus a vertical offset in vh. Hidden at 0. Returns whether it is visible. */
  set(opacity, offsetVh = 0) {
    const o = Math.round(opacity * 1000) / 1000;
    const vis = o > 0 ? 'visible' : 'hidden';
    if (vis !== this.vis) {
      this.vis = vis;
      this.node.style.visibility = vis;
    }
    if (o <= 0) return false;
    if (o !== this.opacity) {
      this.opacity = o;
      this.node.style.opacity = String(o);
    }
    const y = Math.round(offsetVh * 1000) / 1000;
    if (y !== this.y) {
      this.y = y;
      this.node.style.transform = Math.abs(y) < 5e-4 ? 'none' : `translate3d(0,${y.toFixed(3)}vh,0)`;
    }
    return true;
  }
}

/**
 * Break a caption into at most three balanced lines and shrink the type until every line fits
 * the frame. Layout depends on the viewport, never on film time, so a seek does not reflow it.
 */
function fitCaptions(nodes) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;
  const fluid = 0.79 * rem + 0.0199 * vw;
  const preferred = Math.min(5.56 * rem, Math.max(1.67 * rem, fluid));
  const pad = Math.min(72, Math.max(14, 0.04 * vw));
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-style:italic;font-weight:400;letter-spacing:0.004em;font-family:${FONT.serif};`;
  document.body.appendChild(probe);
  const measure = (text, px) => {
    probe.style.fontSize = `${px}px`;
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  };
  const layout = (text, px, maxW) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [text];
    const space = measure(' ', px);
    const widths = words.map((w) => measure(w, px));
    const span = (i, j) => {
      let w = 0;
      for (let k = i; k < j; k++) w += widths[k] + (k > i ? space : 0);
      return w;
    };
    if (span(0, words.length) <= maxW) return [text];
    const join = (i, j) => words.slice(i, j).join(' ');
    const pick = (count) => {
      let best = null;
      const breaksOf = (cuts) => {
        const edges = [0, ...cuts, words.length];
        const measured = [];
        for (let e = 0; e < edges.length - 1; e++) measured.push(span(edges[e], edges[e + 1]));
        const lines = [];
        for (let e = 0; e < edges.length - 1; e++) lines.push(join(edges[e], edges[e + 1]));
        const widest = Math.max(...measured);
        const uneven = widest - Math.min(...measured);
        if (!best || widest < best.widest - 0.5 || (Math.abs(widest - best.widest) <= 0.5 && uneven < best.uneven)) {
          best = { lines, widest, uneven };
        }
      };
      if (count === 2) {
        for (let i = 1; i < words.length; i++) breaksOf([i]);
      } else {
        for (let i = 1; i < words.length - 1; i++) {
          for (let j = i + 1; j < words.length; j++) breaksOf([i, j]);
        }
      }
      return best;
    };
    const two = words.length >= 2 ? pick(2) : null;
    if (two && two.widest <= maxW) return two.lines;
    const three = words.length >= 3 ? pick(3) : null;
    if (three) return three.lines;
    return two ? two.lines : [text];
  };
  for (const node of nodes) {
    const text = node.dataset.raw || node.textContent;
    node.dataset.raw = text;
    const clean = text.replace(/\s+/g, ' ').trim();
    let lo = 12;
    let hi = preferred;
    let chosen = lo;
    let lines = [clean];
    let fitted = false;
    for (let n = 0; n < 14; n++) {
      const mid = (lo + hi) / 2;
      const maxW = Math.max(80, vw - pad * 2 - 8) - mid * 1.1;
      const maxBlock = vh * 0.3;
      const laid = layout(clean, mid, maxW);
      const widest = Math.max(...laid.map((ln) => measure(ln, mid)));
      const block = laid.length * mid * 1.28 + mid * 0.4;
      if (laid.length <= 3 && widest <= maxW && block <= maxBlock) {
        chosen = mid;
        lines = laid;
        fitted = true;
        lo = mid;
      } else hi = mid;
    }
    if (!fitted) {
      const maxW = Math.max(80, vw - pad * 2 - 8) - 12 * 1.1;
      lines = layout(clean, 12, maxW);
    }
    node.style.setProperty('--tt-cap-size', `${chosen.toFixed(2)}px`);
    node.textContent = lines.join('\n');
  }
  probe.remove();
}

function injectStyle() {
  if (document.getElementById('tt-style')) return;
  const style = document.createElement('style');
  style.id = 'tt-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function createTitles(container, { captions } = {}) {
  injectStyle();
  const showCaptions = captions ?? document.documentElement.dataset.captions !== '0';

  const root = el('div', 'tt-root');
  if (getComputedStyle(container).position === 'static') root.style.position = 'fixed';

  const veil = new Layer(el('div', 'tt-veil tt-l'));
  const scrim = new Layer(el('div', 'tt-scrim tt-l'));
  const pages = PAGE_TITLES.map((p) => {
    const tag = el('span', 'tt-tag', p.text);
    tag.style.setProperty('--tt-tilt', p.tilt);
    tag.style.setProperty('--tt-tape', p.color);
    const node = el('div', 'tt-page tt-l');
    node.appendChild(tag);
    return { start: p.start, end: p.end, layer: new Layer(node) };
  });

  const caps = el('div', 'tt-caps');
  const lines = LINES.map((c) => {
    const node = el('p', 'tt-cap tt-l', c.text);
    node.dataset.raw = c.text;
    const layer = new Layer(node);
    caps.appendChild(layer.node);
    return { start: c.start, showEnd: c.showEnd, layer };
  });
  if (!showCaptions) caps.hidden = true;
  const refit = () => fitCaptions(lines.map((c) => c.layer.node));
  refit();
  window.addEventListener('resize', refit);

  const endNode = el('div', 'tt-end tt-l');
  const glow = el('div', 'tt-end-glow');
  const stack = el('div', 'tt-end-stack');
  stack.append(el('div', 'tt-end-names', tr('endNames')));
  stack.insertAdjacentHTML('beforeend', HEART_SVG);
  stack.append(el('div', 'tt-end-date', L(COUPLE.weddingDate, COUPLE.weddingDateEs)));
  endNode.append(glow, stack);
  const end = new Layer(endNode);

  root.append(veil.node, scrim.node, ...pages.map((p) => p.layer.node), caps, endNode);
  container.appendChild(root);

  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  return {
    update(t) {
      const motion = motionQuery && motionQuery.matches ? 0 : 1;

      veil.set(smoothstep(END_CARD.fadeStart, END_CARD.end, t));

      for (const p of pages) {
        const o = envelope(t, p.start, p.end, PAGE_FADE);
        p.layer.set(o, motion ? drift(t, p.start, p.end, 0.4, 0.18) : 0);
      }

      if (showCaptions) {
        let dim = 0;
        for (const c of lines) {
          const o = envelope(t, c.start, c.showEnd, CAPTION_FADE);
          c.layer.set(o, motion ? drift(t, c.start, c.showEnd, 0.55, 0.26) : 0);
          if (o > dim) dim = o;
        }
        const endIn = smoothstep(END_CARD.start, END_CARD.start + END_FADE, t);
        scrim.set(dim * (1 - endIn));
      }

      const es = END_CARD.start;
      end.set(
        smoothstep(es, es + END_FADE, t),
        motion ? 1.05 * (1 - ease.outCubic(seg(t, es, es + 1.7))) : 0,
      );
    },
  };
}
