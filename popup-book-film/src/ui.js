// Player controls inside #ui: play/pause, a scrubber with chapter ticks,
// elapsed/total time, sound on/off, fullscreen and a replay affordance.
//
// This is player chrome, not film content: it may use timers and CSS
// transitions (auto-hide). It never changes what a film frame looks like.
import { SEGMENTS, SPREADS, FILM_TITLE } from './timeline.js';
import { clamp } from './util.js';

const IDLE_MS = 2800;   // hide the bar this long after the last activity while playing
const SEEK_STEP = 5;

const ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  replay: '<path d="M12 5V2.5L7.5 6 12 9.5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>',
  soundOn: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.8 6a8.4 8.4 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  soundOff: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  fsEnter: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  fsExit: '<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="currentColor">${ICONS[name]}</svg>`;

const fmt = (t) => {
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const spoken = (t) => {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} minute${m > 1 ? 's' : ''} ${r} second${r === 1 ? '' : 's'}` : `${r} second${r === 1 ? '' : 's'}`;
};

/** Chapter name for a film time. */
function chapterAt(t) {
  let seg = SEGMENTS[SEGMENTS.length - 1];
  for (const s of SEGMENTS) if (t < s.end) { seg = s; break; }
  switch (seg.name) {
    case 'intro':
    case 'coverOpen': return FILM_TITLE;
    case 'spread': return SPREADS[seg.index].title;
    case 'turn': return SPREADS[seg.to].title;
    default: return 'The End';
  }
}

function button(cls, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `ui-btn ${cls}`;
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

export function createUI(ctx, film) {
  const root = ctx.overlay.querySelector('#ui');
  root.innerHTML = '';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Player controls');
  const D = film.duration;

  // --- elements -------------------------------------------------------------
  const replayBig = button('ui-replay', 'Watch again');
  replayBig.innerHTML = `${svg('replay')}<span>Watch again</span>`;

  const bar = document.createElement('div');
  bar.className = 'ui-bar';

  const scrub = document.createElement('div');
  scrub.className = 'ui-scrub';
  scrub.tabIndex = 0;
  scrub.setAttribute('role', 'slider');
  scrub.setAttribute('aria-label', 'Seek');
  scrub.setAttribute('aria-valuemin', '0');
  scrub.setAttribute('aria-valuemax', String(D));
  const track = document.createElement('div');
  track.className = 'ui-track';
  const fill = document.createElement('div');
  fill.className = 'ui-fill';
  const ticks = document.createElement('div');
  ticks.className = 'ui-ticks';
  for (const s of SEGMENTS) {
    if (s.start <= 0) continue;
    const tick = document.createElement('span');
    tick.className = `ui-tick${s.name === 'spread' ? ' is-chapter' : ''}`;
    tick.style.left = `${(s.start / D) * 100}%`;
    ticks.append(tick);
  }
  const thumb = document.createElement('div');
  thumb.className = 'ui-thumb';
  const tip = document.createElement('div');
  tip.className = 'ui-tip';
  tip.setAttribute('aria-hidden', 'true');
  track.append(fill, ticks);
  scrub.append(track, thumb, tip);

  const row = document.createElement('div');
  row.className = 'ui-row';
  const playBtn = button('ui-play', 'Play');
  const time = document.createElement('span');
  time.className = 'ui-time';
  const chapter = document.createElement('span');
  chapter.className = 'ui-chapter';
  const muteBtn = button('ui-mute', 'Mute');
  const fsBtn = button('ui-fs', 'Full screen');
  const fsTarget = document.documentElement;
  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!fsSupported) fsBtn.hidden = true;
  row.append(playBtn, time, chapter, muteBtn, fsBtn);

  bar.append(scrub, row);
  root.append(replayBig, bar);

  // --- actions --------------------------------------------------------------
  const audio = () => film.audio;
  const seekBy = (dt) => film.seek(clamp(film.time + dt, 0, D));
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFullscreen() {
    if (!fsSupported) return;
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    else {
      const p = (fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen)?.call(fsTarget);
      if (p && p.catch) p.catch(() => {});
    }
  }
  function toggleMute() {
    const a = audio();
    if (a) a.setMuted(!a.muted);
    refresh();
  }
  function replay() {
    film.seek(0);
    film.play();
  }

  playBtn.addEventListener('click', () => film.toggle());
  replayBig.addEventListener('click', replay);
  muteBtn.addEventListener('click', toggleMute);
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => refresh());
  document.addEventListener('webkitfullscreenchange', () => refresh());

  // Scrubber: drag seeks live (pausing while dragging, resuming after).
  let dragging = false;
  let resumeAfterDrag = false;
  const timeAtX = (clientX) => {
    const r = track.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * D;
  };
  function showTip(clientX) {
    const t = timeAtX(clientX);
    const r = track.getBoundingClientRect();
    tip.textContent = `${fmt(t)} · ${chapterAt(t)}`;
    const half = tip.offsetWidth / 2;
    const x = clamp(clientX, half + 8, window.innerWidth - half - 8) - r.left;
    tip.style.left = `${x}px`;
    scrub.classList.add('show-tip');
  }
  scrub.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    scrub.classList.add('is-dragging');
    try { scrub.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    resumeAfterDrag = film.playing;
    if (film.playing) film.pause();
    film.seek(timeAtX(e.clientX));
    showTip(e.clientX);
  });
  scrub.addEventListener('pointermove', (e) => {
    if (dragging) film.seek(timeAtX(e.clientX));
    if (dragging || e.pointerType === 'mouse') showTip(e.clientX);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    scrub.classList.remove('is-dragging', 'show-tip');
    if (resumeAfterDrag && film.time < D) film.play();
    resumeAfterDrag = false;
  };
  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('lostpointercapture', endDrag);
  scrub.addEventListener('pointerleave', () => { if (!dragging) scrub.classList.remove('show-tip'); });

  // Clicking the picture with a mouse toggles playback; a tap just reveals the bar.
  let lastPointerType = 'mouse';
  window.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType; }, true);
  ctx.canvas.addEventListener('click', () => {
    if (lastPointerType === 'mouse') film.toggle();
  });
  ctx.canvas.addEventListener('dblclick', toggleFullscreen);

  // Keyboard.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const onButton = tag === 'BUTTON';
    let handled = true;
    switch (e.key) {
      case ' ':
      case 'Spacebar':
        if (onButton) { handled = false; break; } // the focused button activates itself
        film.toggle();
        break;
      case 'k': case 'K': film.toggle(); break;
      case 'ArrowLeft': seekBy(-SEEK_STEP); break;
      case 'ArrowRight': seekBy(SEEK_STEP); break;
      case 'Home': film.seek(0); break;
      case 'End': film.seek(D); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'm': case 'M': toggleMute(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
    poke();
  });

  // --- auto-hide --------------------------------------------------------------
  let idle = false;
  let idleTimer = 0;
  let hovering = false;
  function applyVisibility() {
    const hide = idle && film.playing && !hovering && !dragging;
    root.classList.toggle('is-hidden', hide);
    document.body.classList.toggle('ui-idle', hide);
  }
  function poke() {
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { idle = true; applyVisibility(); }, IDLE_MS);
    applyVisibility();
  }
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, poke, { passive: true });
  }
  bar.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; applyVisibility(); } });
  bar.addEventListener('pointerleave', () => { hovering = false; applyVisibility(); });
  document.addEventListener('mouseleave', () => {
    idle = true;
    hovering = false;
    clearTimeout(idleTimer);
    applyVisibility();
  });
  root.addEventListener('focusin', poke);

  film.on('play', () => { refresh(); poke(); });
  film.on('pause', () => { refresh(); applyVisibility(); });
  film.on('end', () => { refresh(); poke(); });
  film.on('seek', () => refresh());

  // --- state -> DOM ------------------------------------------------------------
  const cache = {};
  const put = (key, value, apply) => {
    if (cache[key] !== value) { cache[key] = value; apply(value); }
  };

  function refresh(state) {
    const t = state ? state.t : film.time;
    const playing = film.playing;
    const ended = !playing && t >= D - 1e-3;
    const p = t / D;

    put('mode', playing ? 'pause' : ended ? 'replay' : 'play', (m) => {
      playBtn.innerHTML = svg(m);
      const label = m === 'pause' ? 'Pause' : m === 'replay' ? 'Replay' : 'Play';
      playBtn.setAttribute('aria-label', label);
      playBtn.title = `${label} (k)`;
    });
    put('ended', ended, (v) => root.classList.toggle('is-ended', v));
    put('fill', p.toFixed(4), (v) => {
      fill.style.transform = `scaleX(${v})`;
      thumb.style.left = `${(v * 100).toFixed(2)}%`;
    });
    const sec = Math.floor(t + 1e-6);
    put('sec', sec, () => {
      time.textContent = `${fmt(t)} / ${fmt(D)}`;
      scrub.setAttribute('aria-valuenow', String(sec));
      scrub.setAttribute('aria-valuetext', `${spoken(t)} of ${spoken(D)}, ${chapterAt(t)}`);
    });
    put('chapter', chapterAt(t), (v) => { chapter.textContent = v; });
    const a = audio();
    put('muted', a ? !!a.muted : false, (m) => {
      muteBtn.innerHTML = svg(m ? 'soundOff' : 'soundOn');
      muteBtn.setAttribute('aria-label', 'Mute');
      muteBtn.setAttribute('aria-pressed', String(m));
      muteBtn.title = m ? 'Sound on (m)' : 'Mute (m)';
    });
    put('fs', isFullscreen(), (f) => {
      fsBtn.innerHTML = svg(f ? 'fsExit' : 'fsEnter');
      const label = f ? 'Exit full screen' : 'Full screen';
      fsBtn.setAttribute('aria-label', label);
      fsBtn.title = `${label} (f)`;
    });
    put('playing', playing, () => applyVisibility());
  }

  poke();
  refresh();

  return { update: refresh };
}
