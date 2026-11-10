/**
 * titles.js — the printed-word layer of "The Little Paper Boat".
 *
 * DOM typography over the WebGL canvas, styled like a finely printed picture book: the opening
 * title card (line-drawn paper boat, display title, small-caps subtitle), a chapter label as each
 * spread finishes opening, the storybook captions, "The End" with a drawn flourish, and the final
 * fade-to-black veil. Old-style serif, cream ink, gold hairlines, soft dark halos so every line
 * stays legible over any frame.
 *
 * Every opacity, drift and line draw-in is a pure function of film time t — no CSS transitions,
 * no timers — so scrubbing is exact in both directions; the DOM is written only when a rounded
 * value changes. prefers-reduced-motion: fades only (no drift, no draw-in). pointer-events: none.
 *
 * Layering inside the root this module appends to `container`:
 *   veil (z 1) < caption scrim (z 2) < title card / chapter label / captions (z 3) < "The End" (z 4)
 * so "The End" stays readable on the black. The container itself must be a full-screen box that
 * sits ABOVE the canvas and BELOW the player controls. Set `--tt-caption-bottom` on the container
 * to move the caption baseline (e.g. to clear a control bar).
 */
import { LEAF_TURNS, SPREADS, ease, seg, smoothstep } from './timeline.js';

export const CAPTIONS = [
  { start: 1.2, end: 6.0, text: 'The Little Paper Boat', kind: 'title' },
  { start: 1.2, end: 6.0, text: 'a pop-up film in four pages', kind: 'subtitle' },
  { start: 11.0, end: 15.5, text: 'Once, in a forest folded from a single sheet of paper,', kind: 'caption' },
  { start: 16.0, end: 20.5, text: 'a little boat was made from a page that had nothing left to say.', kind: 'caption' },
  { start: 21.0, end: 26.5, text: 'It slipped into the stream — and the stream knew the way.', kind: 'caption' },
  { start: 32.0, end: 36.5, text: 'The stream became a river. The river became the sea.', kind: 'caption' },
  { start: 37.0, end: 41.5, text: 'A lighthouse kept watch, turning its paper light round and round.', kind: 'caption' },
  { start: 42.0, end: 47.5, text: 'The waves were tall, but paper is braver than it looks.', kind: 'caption' },
  { start: 53.0, end: 57.5, text: 'By night it drifted into a city of lanterns,', kind: 'caption' },
  { start: 58.0, end: 62.5, text: 'where every window held a story, still awake.', kind: 'caption' },
  { start: 63.0, end: 68.5, text: 'The boat listened, and kept the quietest one for itself.', kind: 'caption' },
  { start: 74.0, end: 78.5, text: 'At dawn, the boat unfolded… and folded again, into wings.', kind: 'caption' },
  { start: 79.0, end: 83.5, text: 'It rose above the page, past balloons and a paper sun,', kind: 'caption' },
  { start: 84.0, end: 88.5, text: 'until somewhere, a reader turned the page.', kind: 'caption' },
  { start: 89.5, end: 96.0, text: 'The End', kind: 'end' },
];

const FADE_TO_BLACK = [93.5, 96];
const CAPTION_FADE = 0.6;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** One label per spread: from (end of the leaf turn that opens it) − 0.5 s, for 3.5 s. */
const CHAPTER_LABELS = SPREADS.map((s) => {
  const start = LEAF_TURNS.find((turn) => turn.leaf === s.k - 1).end - 0.5;
  return { start, end: start + 3.5, number: `Chapter ${ROMAN[s.k - 1]}`, title: s.title };
});

const LINES = CAPTIONS.filter((c) => c.kind === 'caption');
const TITLE = CAPTIONS.find((c) => c.kind === 'title');
const SUBTITLE = CAPTIONS.find((c) => c.kind === 'subtitle');
const END = CAPTIONS.find((c) => c.kind === 'end');

/** Runs of captions with < 2 s between them: the bottom scrim breathes per run, not per line. */
const CAPTION_RUNS = LINES.reduce((runs, c) => {
  const last = runs[runs.length - 1];
  if (last && c.start - last.end < 2) last.end = c.end;
  else runs.push({ start: c.start, end: c.end });
  return runs;
}, []);

const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", P052, ' +
  '"TeX Gyre Pagella", Georgia, Caladea, "Liberation Serif", serif';

const CSS = `
.tt-root {
  --tt-cream: #f6eedc;
  --tt-gold: #dfbf80;
  --tt-ink: 14, 9, 6;
  position: absolute; inset: 0; overflow: hidden; isolation: isolate; contain: layout paint style;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  font-family: ${SERIF}; font-weight: 400; color: var(--tt-cream);
  font-kerning: normal; font-variant-ligatures: common-ligatures; text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
.tt-root * { box-sizing: border-box; }
.tt-l { visibility: hidden; opacity: 0; }

.tt-veil { position: absolute; inset: 0; z-index: 1; background: #000; }
.tt-scrim {
  position: absolute; left: 0; right: 0; bottom: 0; height: 42%; z-index: 2;
  background: linear-gradient(to top, rgba(var(--tt-ink), .5), rgba(var(--tt-ink), .24) 42%, rgba(var(--tt-ink), 0));
}
.tt-glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 48% 38% at 50% 47%, rgba(var(--tt-ink), .62), rgba(var(--tt-ink), .42) 40%, rgba(var(--tt-ink), .14) 72%, rgba(var(--tt-ink), 0));
}

.tt-card, .tt-end {
  position: absolute; inset: 0; z-index: 3; padding: 0 16px 6vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
}
.tt-end { z-index: 4; padding-bottom: 3vh; }

.tt-orn, .tt-flourish { display: block; overflow: visible; filter: drop-shadow(0 0 .35em rgba(var(--tt-ink), .7)); }
.tt-orn { width: clamp(76px, 7.4vw, 200px); margin-bottom: clamp(6px, 1.6vh, 34px); }
.tt-orn path, .tt-flourish path {
  fill: none; stroke: var(--tt-gold); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 1 1; stroke-dashoffset: calc(1 - var(--tt-draw, 1));
}
.tt-orn .tt-faint { stroke-width: .9; opacity: .7; }
.tt-orn .tt-wave { stroke-width: 1; opacity: .8; }

.tt-title {
  margin: 0; max-width: 12em; font-size: clamp(2.75rem, min(7vw, 13vh), 10rem);
  line-height: 1.02; letter-spacing: .008em; text-wrap: balance;
  text-shadow: 0 .02em .06em rgba(var(--tt-ink), .7), 0 0 .45em rgba(var(--tt-ink), .5);
}
.tt-subblock { display: flex; flex-direction: column; align-items: center; }
.tt-sep {
  display: flex; align-items: center; gap: .8em; width: clamp(150px, 17vw, 460px);
  margin: clamp(12px, 2.6vh, 48px) 0 clamp(8px, 1.8vh, 34px); font-size: clamp(9px, .8vw, 22px);
}
.tt-sep::before, .tt-sep::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(217, 184, 120, 0), var(--tt-gold)); }
.tt-sep::after { background: linear-gradient(270deg, rgba(217, 184, 120, 0), var(--tt-gold)); }
.tt-sep i { width: .62em; height: .62em; border: 1px solid var(--tt-gold); transform: rotate(45deg); }
.tt-sub, .tt-ch-line {
  font-variant-caps: all-small-caps; font-variant-numeric: oldstyle-nums;
  text-shadow: 0 0 .5em rgba(var(--tt-ink), .85), 0 1px 1px rgba(var(--tt-ink), .7);
}
.tt-sub {
  margin: 0 -.34em 0 0; font-size: clamp(1.05rem, .55rem + 1.15vw, 2.7rem);
  letter-spacing: .34em; line-height: 1.3; color: #eadcb8;
}

.tt-chapter {
  position: absolute; left: 0; right: 0; z-index: 3; padding: 0 16px;
  top: calc(env(safe-area-inset-top, 0px) + clamp(18px, 6vh, 96px));
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.tt-chapter::before {
  content: ''; position: absolute; z-index: -1; left: 50%; top: 50%; width: min(46em, 100%); height: 5.5em;
  transform: translate(-50%, -50%); font-size: clamp(1rem, .62rem + .85vw, 2.3rem);
  background: radial-gradient(closest-side, rgba(var(--tt-ink), .42), rgba(var(--tt-ink), 0));
}
.tt-ch-line {
  display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: .1em .9em;
  font-size: clamp(1rem, .62rem + .85vw, 2.3rem); line-height: 1.3; letter-spacing: .28em;
}
.tt-ch-num, .tt-ch-dot { color: var(--tt-gold); }
.tt-ch-num, .tt-ch-name { margin-right: -.28em; }
.tt-ch-dot { letter-spacing: 0; }
.tt-ch-rule {
  width: clamp(110px, 13vw, 380px); height: 1px; margin-top: clamp(6px, 1.2vh, 20px);
  background: linear-gradient(90deg, rgba(217, 184, 120, 0), var(--tt-gold) 28%, var(--tt-gold) 72%, rgba(217, 184, 120, 0));
  transform: scaleX(var(--tt-draw, 1));
}

.tt-caps {
  position: absolute; left: 0; right: 0; z-index: 3; padding: 0 16px;
  bottom: var(--tt-caption-bottom, calc(env(safe-area-inset-bottom, 0px) + clamp(30px, 9vh, 150px)));
  display: grid; justify-items: center; align-items: end;
}
.tt-cap {
  grid-area: 1 / 1; position: relative; isolation: isolate; max-width: min(34em, 100%); margin: 0;
  font-style: italic; font-size: clamp(1.05rem, .62rem + 1.12vw, 2.6rem); line-height: 1.42;
  letter-spacing: .005em; text-align: center; text-wrap: balance; overflow-wrap: break-word;
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .75), 0 0 .5em rgba(var(--tt-ink), .7), 0 0 1.2em rgba(var(--tt-ink), .45);
}
.tt-cap::before {
  content: ''; position: absolute; z-index: -1; inset: -1.3em -3.4em;
  background: radial-gradient(closest-side, rgba(var(--tt-ink), .46), rgba(var(--tt-ink), .36) 35%, rgba(var(--tt-ink), .15) 70%, rgba(var(--tt-ink), 0));
}

.tt-end-text {
  font-style: italic; font-size: clamp(3rem, min(6.6vw, 12.5vh), 9rem); line-height: 1.05;
  letter-spacing: .015em; text-shadow: 0 .02em .06em rgba(var(--tt-ink), .7), 0 0 .5em rgba(var(--tt-ink), .5);
}
.tt-flourish { width: clamp(170px, 20vw, 560px); margin-top: clamp(8px, 2vh, 40px); }

@media (max-width: 560px) {
  .tt-ch-line { flex-direction: column; align-items: center; }
  .tt-ch-dot { display: none; }
}
`;

/** Line-drawn paper boat (classic folded hat-boat) on two strokes of water. */
const BOAT_SVG = `
<svg class="tt-orn" viewBox="0 0 120 74" aria-hidden="true">
  <path pathLength="1" d="M60 6 L37 45 L83 45 Z"/>
  <path pathLength="1" class="tt-faint" d="M60 6 L60 45"/>
  <path pathLength="1" d="M14 45 L106 45 L90 61 L30 61 Z"/>
  <path pathLength="1" class="tt-faint" d="M30 61 L37 45 M90 61 L83 45"/>
  <path pathLength="1" class="tt-wave" d="M22 68 C30 64.5 38 64.5 46 68 S62 71.5 70 68"/>
  <path pathLength="1" class="tt-wave" d="M62 72 C70 68.5 78 68.5 86 72 S100 74.5 104 72.5"/>
</svg>`;

/** Wave-like swash drawn outward from a central lozenge. */
const FLOURISH_SVG = `
<svg class="tt-flourish" viewBox="0 0 240 24" aria-hidden="true">
  <path pathLength="1" d="M112 12 C102 12 98 16.5 88 16.5 C74 16.5 68 7 52 7 C36 7 26 13 8 13"/>
  <path pathLength="1" d="M128 12 C138 12 142 16.5 152 16.5 C166 16.5 172 7 188 7 C204 7 214 13 232 13"/>
  <path pathLength="1" d="M120 6.5 L125.5 12 L120 17.5 L114.5 12 Z"/>
</svg>`;

/** Fade envelope: 0 outside [start, end], smooth ramps of fadeIn / fadeOut seconds inside. */
function envelope(t, start, end, fadeIn, fadeOut = fadeIn) {
  if (t <= start || t >= end) return 0;
  return smoothstep(start, start + fadeIn, t) * (1 - smoothstep(end - fadeOut, end, t));
}

/** Upward drift in vh: settles from `rise` over `settle` s after `start`, lifts `lift` in the last s before `end`. */
function drift(t, start, end, rise, settle, lift) {
  return rise * (1 - ease.outCubic(seg(t, start, start + settle))) - lift * ease.inQuad(seg(t, end - 1, end));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A DOM node whose style writes are cached: only changed values reach the DOM. */
class Layer {
  constructor(node) {
    this.node = node;
    this.values = new Map();
  }

  /** Opacity + vertical offset in vh. Hidden (visibility) at 0. Returns whether it is visible. */
  set(opacity, offsetVh = 0) {
    const o = Math.round(opacity * 1000) / 1000;
    this.write('visibility', o > 0 ? 'visible' : 'hidden');
    if (o <= 0) return false;
    this.write('opacity', String(o));
    this.write('transform', Math.abs(offsetVh) < 5e-4 ? 'none' : `translate3d(0, ${offsetVh.toFixed(3)}vh, 0)`);
    return true;
  }

  write(name, value) {
    if (this.values.get(name) === value) return;
    this.values.set(name, value);
    if (name.startsWith('--')) this.node.style.setProperty(name, value);
    else this.node.style[name] = value;
  }

  /** Line draw-in progress 0..1 for descendant strokes / rules (CSS var --tt-draw). */
  draw(p) {
    this.write('--tt-draw', (Math.round(p * 1000) / 1000).toString());
  }
}

function injectStyle() {
  if (document.getElementById('tt-style')) return;
  const style = document.createElement('style');
  style.id = 'tt-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function createTitles(container) {
  injectStyle();
  const root = el('div', 'tt-root');
  if (getComputedStyle(container).position === 'static') root.style.position = 'fixed';

  const veil = el('div', 'tt-veil tt-l');
  const scrim = el('div', 'tt-scrim tt-l');

  const card = el('div', 'tt-card');
  const cardGlow = el('div', 'tt-glow tt-l');
  const ornament = el('div', 'tt-l');
  ornament.innerHTML = BOAT_SVG;
  const title = el('div', 'tt-title tt-l', TITLE.text);
  const subBlock = el('div', 'tt-subblock tt-l');
  const sep = el('div', 'tt-sep');
  sep.setAttribute('aria-hidden', 'true');
  sep.appendChild(el('i', ''));
  subBlock.append(sep, el('div', 'tt-sub', SUBTITLE.text));
  card.append(cardGlow, ornament, title, subBlock);

  const chapters = CHAPTER_LABELS.map((c) => {
    const node = el('div', 'tt-chapter tt-l');
    const line = el('div', 'tt-ch-line');
    line.append(el('span', 'tt-ch-num', c.number), el('span', 'tt-ch-dot', '·'), el('span', 'tt-ch-name', c.title));
    node.append(line, el('div', 'tt-ch-rule'));
    return { ...c, layer: new Layer(node) };
  });

  const caps = el('div', 'tt-caps');
  const lines = LINES.map((c) => {
    const node = el('p', 'tt-cap tt-l', c.text);
    caps.appendChild(node);
    return { ...c, layer: new Layer(node) };
  });

  const end = el('div', 'tt-end');
  const endGlow = el('div', 'tt-glow tt-l');
  const endText = el('div', 'tt-end-text tt-l', END.text);
  const flourish = el('div', 'tt-l');
  flourish.innerHTML = FLOURISH_SVG;
  end.append(endGlow, endText, flourish);

  root.append(veil, scrim, card, ...chapters.map((c) => c.layer.node), caps, end);
  container.appendChild(root);

  const L = {
    veil: new Layer(veil),
    scrim: new Layer(scrim),
    cardGlow: new Layer(cardGlow),
    ornament: new Layer(ornament),
    title: new Layer(title),
    subBlock: new Layer(subBlock),
    endGlow: new Layer(endGlow),
    endText: new Layer(endText),
    flourish: new Layer(flourish),
  };
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  return {
    update(t) {
      const m = reduced && reduced.matches ? 0 : 1; // motion multiplier: 0 = fades only

      L.veil.set(seg(t, FADE_TO_BLACK[0], FADE_TO_BLACK[1]));

      // Opening title card: ornament, then title, then subtitle; all float gently upward.
      const s = TITLE.start;
      const e = TITLE.end;
      L.cardGlow.set(envelope(t, s - 0.2, e, 1.4, 1.0));
      if (L.ornament.set(envelope(t, s, e - 0.15, 1.1, 0.9), m * drift(t, s, e - 0.15, 1.6, 2.6, 0.7))) {
        L.ornament.draw(m ? ease.inOutSine(seg(t, s, s + 2.0)) : 1);
      }
      L.title.set(envelope(t, s + 0.5, e, 1.5, 0.95), m * drift(t, s + 0.5, e, 1.6, 2.8, 0.7));
      L.subBlock.set(envelope(t, s + 1.3, e - 0.3, 1.3, 0.8), m * drift(t, s + 1.3, e - 0.3, 1.4, 2.6, 0.6));

      for (const c of chapters) {
        const visible = c.layer.set(envelope(t, c.start, c.end, 0.9, 1.0), m * drift(t, c.start, c.end, 0.9, 1.8, 0.3));
        if (visible) c.layer.draw(m ? ease.outCubic(seg(t, c.start + 0.1, c.start + 1.6)) : 1);
      }

      let scrimOpacity = 0;
      for (const r of CAPTION_RUNS) scrimOpacity = Math.max(scrimOpacity, envelope(t, r.start - 0.6, r.end + 0.6, 1.4));
      L.scrim.set(scrimOpacity);
      for (const c of lines) {
        c.layer.set(envelope(t, c.start, c.end, CAPTION_FADE), m * drift(t, c.start, c.end, 0.75, 1.3, 0.35));
      }

      // "The End" fades in and stays to the last frame, above the black veil.
      const es = END.start;
      L.endGlow.set(smoothstep(es, es + 1.5, t) * (1 - seg(t, FADE_TO_BLACK[0], FADE_TO_BLACK[1])));
      L.endText.set(smoothstep(es, es + 1.8, t), m * 1.2 * (1 - ease.outCubic(seg(t, es, es + 3))));
      if (L.flourish.set(smoothstep(es + 0.6, es + 2.0, t), m * 0.9 * (1 - ease.outCubic(seg(t, es + 0.6, es + 3.4))))) {
        L.flourish.draw(m ? ease.inOutSine(seg(t, es + 0.6, es + 2.9)) : 1);
      }
    },
  };
}
