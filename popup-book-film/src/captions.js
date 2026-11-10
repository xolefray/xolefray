// All DOM film overlays inside #overlay: the vignette, the black #fade layer, the
// opening title card, one caption per spread and the end card.
//
// Film visuals here are pure functions of `state`: every style is set directly
// on each update (no CSS transitions or animations), so seeking and
// frame-accurate capture always show the right thing.
import { SPREADS, SEGMENTS, FILM_TITLE, FILM_SUBTITLE } from './timeline.js';
import { envelope, smoothstep, clamp01 } from './util.js';

const CAPTION_IN = 1.2;     // seconds after a hold begins that its caption starts to appear
const CAPTION_RISE = 1.0;   // fade-in length
const CAPTION_OUT = 1.1;    // starts fading this long before the hold ends ...
const CAPTION_GONE = 0.25;  // ... and is gone this long before the turn starts

const HOLDS = SEGMENTS.filter((s) => s.name === 'spread');

/** Caption opacity of spread k at time t (pure). */
export function captionOpacity(k, t) {
  const s = HOLDS[k];
  return envelope(t, s.start + CAPTION_IN, s.start + CAPTION_IN + CAPTION_RISE, s.end - CAPTION_OUT, s.end - CAPTION_GONE);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ornament() {
  const o = el('div', 'ornament');
  o.setAttribute('aria-hidden', 'true');
  o.append(el('span', 'rule'), el('span', 'diamond'), el('span', 'rule'));
  return o;
}

const fmt = (x) => x.toFixed(4);

export function createCaptions(ctx) {
  const overlay = ctx.overlay;
  const fadeEl = overlay.querySelector('#fade');
  const root = overlay.querySelector('#captions');

  let vignette = overlay.querySelector('#vignette');
  if (!vignette) {
    vignette = el('div');
    vignette.id = 'vignette';
    overlay.insertBefore(vignette, fadeEl);
  }

  // Opening title card.
  const title = el('div', 'card title-card');
  const titleInner = el('div', 'card-inner');
  const h1 = el('h1', 'card-title', FILM_TITLE);
  const sub = el('p', 'card-sub', FILM_SUBTITLE);
  titleInner.append(h1, ornament(), sub);
  title.append(titleInner);

  // Caption (one element; text follows the spread being held).
  const scrim = el('div', 'caption-scrim');
  scrim.setAttribute('aria-hidden', 'true');
  const caption = el('p', 'caption');

  // End card.
  const end = el('div', 'card end-card');
  const endInner = el('div', 'card-inner');
  endInner.append(ornament(), el('h2', 'card-title', 'The End'), ornament());
  end.append(endInner);

  root.append(scrim, caption, title, end);

  let lastText = null;
  const last = new WeakMap(); // node -> { prop: value } (skip redundant style writes)
  const set = (node, prop, value) => {
    let m = last.get(node);
    if (!m) last.set(node, (m = {}));
    if (m[prop] !== value) { node.style[prop] = value; m[prop] = value; }
  };
  const show = (node, op) => {
    set(node, 'opacity', fmt(op));
    set(node, 'visibility', op > 0.0005 ? 'visible' : 'hidden');
  };

  function update(state) {
    const t = state.t;
    show(fadeEl, state.fade);

    // Title: a slow settle (drifts up a few pixels and tightens) while it shows.
    show(title, state.titleCard);
    const tu = clamp01((t - 1) / 5);
    set(titleInner, 'transform', `translate3d(0, ${fmt((1 - tu) * 0.6)}vh, 0)`);
    set(h1, 'letterSpacing', `${fmt(0.07 - 0.03 * smoothstep(0, 1, tu))}em`);

    // End card: rises gently into place.
    show(end, state.endCard);
    set(endInner, 'transform', `translate3d(0, ${fmt((1 - state.endCard) * 0.8)}vh, 0)`);

    // Caption.
    let text = '', op = 0;
    const s = state.segment;
    if (s.name === 'spread') {
      text = SPREADS[s.index].caption;
      op = captionOpacity(s.index, t);
    }
    if (text !== lastText) {
      caption.textContent = text;
      lastText = text;
    }
    show(caption, op);
    show(scrim, op);
    set(caption, 'transform', `translate3d(0, ${fmt((1 - op) * 0.5)}em, 0)`);
  }

  return { update };
}
