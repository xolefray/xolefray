// STUB (T-scaffold) — replaced by the titles owner (T-titles-env).
//
// Plain but complete enough to watch the film: the narrator's lines as bottom-centre captions
// (timeline.NARRATION), a small page title during each page turn (SPREADS[k].title), the end card
// (COUPLE.names + COUPLE.weddingDate) and the final fade to black — all pure functions of film
// time t (no CSS transitions, no timers; the DOM is written only when a rounded value changes).
//
// API (contract): createTitles(container, { captions = <from the page> } = {}) -> { update(t) }
//   Captions are hidden with `?captions=0`: main.js sets  <html data-captions="0">  (and passes
//   { captions: false }); this module reads either. Only the narration captions are hidden — the
//   page titles, the end card and the fade stay.
//   The container must be a full-screen box above the canvas and below the player controls; set
//   `--tt-caption-bottom` on it to move the caption baseline (styles.css does, to clear the controls).
import { COUPLE, END_CARD, LEAF_TURNS, NARRATION, SPREADS, seg, smoothstep } from './timeline.js';
import { FONT } from './fonts.js';

const CAPTION_FADE = 0.45;

/** One small title per spread, riding the leaf turn that opens it (gone when the spread is open). */
const PAGE_TITLES = SPREADS.map((s) => {
  const turn = LEAF_TURNS.find((tr) => tr.leaf === s.k - 1);
  return { start: turn.start + 0.3, end: turn.end + 0.2, text: s.title };
});

const CSS = `
.tt-root {
  --tt-cream: #f6eedc;
  --tt-gold: #e6c27a;
  --tt-ink: 14, 9, 6;
  position: absolute; inset: 0; overflow: hidden; isolation: isolate; contain: layout paint style;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  font-family: ${FONT.serif}; font-weight: 400; color: var(--tt-cream);
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
}
.tt-root * { box-sizing: border-box; }
.tt-l { visibility: hidden; opacity: 0; }
.tt-veil { position: absolute; inset: 0; z-index: 1; background: #000; }
.tt-scrim {
  position: absolute; left: 0; right: 0; bottom: 0; height: 38%; z-index: 2;
  background: linear-gradient(to top, rgba(var(--tt-ink), .55), rgba(var(--tt-ink), .25) 45%, rgba(var(--tt-ink), 0));
}
.tt-page {
  position: absolute; left: 0; right: 0; z-index: 3; padding: 0 16px; text-align: center;
  top: calc(env(safe-area-inset-top, 0px) + clamp(16px, 5.5vh, 90px));
  font-family: ${FONT.hand}; font-weight: 700; font-size: clamp(1.5rem, .9rem + 1.9vw, 3.6rem); line-height: 1.1;
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .8), 0 0 .5em rgba(var(--tt-ink), .75), 0 0 1.2em rgba(var(--tt-ink), .5);
}
.tt-caps {
  position: absolute; left: 0; right: 0; z-index: 3; padding: 0 16px;
  bottom: var(--tt-caption-bottom, calc(env(safe-area-inset-bottom, 0px) + clamp(30px, 9vh, 150px)));
  display: grid; justify-items: center; align-items: end;
}
.tt-cap {
  grid-area: 1 / 1; max-width: min(34em, 100%); margin: 0;
  font-style: italic; font-size: clamp(1.05rem, .62rem + 1.12vw, 2.6rem); line-height: 1.4;
  text-align: center; text-wrap: balance; overflow-wrap: break-word;
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .8), 0 0 .5em rgba(var(--tt-ink), .75), 0 0 1.2em rgba(var(--tt-ink), .5);
}
.tt-end {
  position: absolute; inset: 0; z-index: 4; padding: 0 16px 4vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  background: radial-gradient(ellipse 50% 40% at 50% 48%, rgba(var(--tt-ink), .6), rgba(var(--tt-ink), .3) 55%, rgba(var(--tt-ink), 0));
}
.tt-end-names {
  text-transform: uppercase; font-family: ${FONT.display}; font-size: clamp(2.2rem, min(6.4vw, 12vh), 8rem); line-height: 1.08; letter-spacing: .02em;
  text-shadow: 0 .03em .08em rgba(var(--tt-ink), .8), 0 0 .5em rgba(var(--tt-ink), .5);
}
.tt-end-heart { width: clamp(22px, 2.4vw, 56px); margin: clamp(8px, 2vh, 32px) 0; fill: #e2574c; filter: drop-shadow(0 0 .3em rgba(var(--tt-ink), .7)); }
.tt-end-date {
  font-family: ${FONT.hand}; font-weight: 700; font-size: clamp(1.5rem, min(3.4vw, 7vh), 4.4rem); line-height: 1.1; color: var(--tt-gold);
  text-shadow: 0 1px 1px rgba(var(--tt-ink), .8), 0 0 .5em rgba(var(--tt-ink), .7);
}
`;

const HEART_SVG =
  '<svg class="tt-end-heart" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21C5 15.5 1 11.6 1 7.2 1 3.8 3.6 1.5 6.6 1.5c2 0 3.9 1 5.4 3 1.5-2 3.4-3 5.4-3 3 0 5.6 2.3 5.6 5.7 0 4.4-4 8.3-11 13.8z"/></svg>';

/** Fade envelope: 0 outside [start, end], smooth ramps of `fade` seconds inside. */
function envelope(t, start, end, fade) {
  if (t <= start || t >= end) return 0;
  return smoothstep(start, start + fade, t) * (1 - smoothstep(end - fade, end, t));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A DOM node whose opacity writes are cached: only changed values reach the DOM. */
class Layer {
  constructor(node) {
    this.node = node;
    this.opacity = -1;
  }

  set(opacity) {
    const o = Math.round(opacity * 1000) / 1000;
    if (o === this.opacity) return;
    this.opacity = o;
    this.node.style.visibility = o > 0 ? 'visible' : 'hidden';
    this.node.style.opacity = String(o);
  }
}

export function createTitles(container, { captions } = {}) {
  if (!document.getElementById('tt-style')) {
    const style = document.createElement('style');
    style.id = 'tt-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const showCaptions = captions ?? document.documentElement.dataset.captions !== '0';

  const root = el('div', 'tt-root');
  if (getComputedStyle(container).position === 'static') root.style.position = 'fixed';
  const veil = new Layer(el('div', 'tt-veil tt-l'));
  const scrim = new Layer(el('div', 'tt-scrim tt-l'));
  const pages = PAGE_TITLES.map((p) => ({ ...p, layer: new Layer(el('div', 'tt-page tt-l', p.text)) }));
  const caps = el('div', 'tt-caps');
  const lines = NARRATION.map((n) => {
    const layer = new Layer(el('p', 'tt-cap tt-l', n.text));
    caps.appendChild(layer.node);
    return { start: n.start, end: n.end, layer };
  });
  const endNode = el('div', 'tt-end tt-l');
  endNode.append(el('div', 'tt-end-names', COUPLE.names));
  endNode.insertAdjacentHTML('beforeend', HEART_SVG);
  endNode.append(el('div', 'tt-end-date', COUPLE.weddingDate));
  const end = new Layer(endNode);
  if (!showCaptions) caps.hidden = true;

  root.append(veil.node, scrim.node, ...pages.map((p) => p.layer.node), caps, endNode);
  container.appendChild(root);

  return {
    update(t) {
      veil.set(seg(t, END_CARD.fadeStart, END_CARD.end - 0.4));
      for (const p of pages) p.layer.set(envelope(t, p.start, p.end, 0.7));
      let dim = 0;
      for (const c of lines) {
        // lines are spoken back to back: hold each caption a little past its end, never into the next
        const o = envelope(t, c.start - 0.15, c.end + 0.3, CAPTION_FADE);
        c.layer.set(showCaptions ? o : 0);
        if (o > dim) dim = o;
      }
      scrim.set(showCaptions ? dim * (1 - smoothstep(END_CARD.start - 0.5, END_CARD.start + 0.5, t)) : 0);
      end.set(smoothstep(END_CARD.start, END_CARD.start + 1.6, t));
    },
  };
}
