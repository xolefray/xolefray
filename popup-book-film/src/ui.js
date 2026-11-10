// STUB player UI: play/pause button, range scrubber, time readout inside #ui.
export function createUI(ctx, film) {
  const root = ctx.overlay.querySelector('#ui');
  root.innerHTML = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ui-play';
  btn.addEventListener('click', () => film.toggle());

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'ui-scrub';
  range.min = '0';
  range.max = String(film.duration);
  range.step = '0.01';
  range.setAttribute('aria-label', 'Film position');
  let scrubbing = false;
  range.addEventListener('pointerdown', () => { scrubbing = true; });
  range.addEventListener('pointerup', () => { scrubbing = false; });
  range.addEventListener('input', () => film.seek(parseFloat(range.value)));

  const readout = document.createElement('span');
  readout.className = 'ui-time';

  root.append(btn, range, readout);

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  function update(state) {
    const label = film.playing ? 'Pause' : 'Play';
    if (btn.textContent !== label) btn.textContent = label;
    if (!scrubbing) range.value = state.t.toFixed(2);
    readout.textContent = `${fmt(state.t)} / ${fmt(state.duration)}`;
  }

  return { update };
}
