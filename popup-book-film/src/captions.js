// STUB captions: owns all DOM film overlays (#fade, title card, captions, end card).
import { SPREADS, FILM_TITLE, FILM_SUBTITLE } from './timeline.js';
import { envelope } from './util.js';

export function createCaptions(ctx) {
  const fadeEl = ctx.overlay.querySelector('#fade');
  const root = ctx.overlay.querySelector('#captions');

  const title = document.createElement('div');
  title.className = 'card title-card';
  title.innerHTML = `<h1></h1><p></p>`;
  title.querySelector('h1').textContent = FILM_TITLE;
  title.querySelector('p').textContent = FILM_SUBTITLE;

  const caption = document.createElement('div');
  caption.className = 'caption';

  const end = document.createElement('div');
  end.className = 'card end-card';
  end.innerHTML = '<h1>The End</h1>';

  root.append(title, caption, end);

  let lastText = null;
  function update(state) {
    fadeEl.style.opacity = state.fade.toFixed(4);
    title.style.opacity = state.titleCard.toFixed(4);
    end.style.opacity = state.endCard.toFixed(4);

    let text = '', op = 0;
    const s = state.segment;
    if (s.name === 'spread') {
      text = SPREADS[s.index].caption;
      op = envelope(state.t, s.start + 0.6, s.start + 1.6, s.end - 0.9, s.end - 0.1);
    }
    if (text !== lastText) { caption.textContent = text; lastText = text; }
    caption.style.opacity = op.toFixed(4);
  }

  return { update };
}
