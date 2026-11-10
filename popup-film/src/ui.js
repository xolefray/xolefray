/**
 * ui.js — player controls of "The Little Paper Boat".
 *
 * createUI() builds, inside `root`, a glass control bar — scrubber (chapter-segmented track,
 * time + chapter tooltip on hover/drag, role="slider"), play/pause/replay, current time and
 * duration, current chapter, mute and fullscreen — plus a "Read it again" button for the end.
 * It also owns the keyboard shortcuts (Space play/pause, ←/→ ±5 s, Home restart, M mute,
 * F fullscreen; ↑/↓, PageUp/PageDown and End on the focused scrubber), click/tap on the film
 * surface, and auto-hiding of controls + cursor after 2.5 s without input while playing.
 *
 * The UI never touches the scene. main.js calls update(t, playing) every frame (DOM writes only
 * happen when a displayed value changes); the UI acts through `player`, `audio` and callbacks.
 * It publishes --ui-safe-bottom on <html>: the height the visible bar occupies, else 0px.
 */

const IDLE_MS = 2500;
const SKIP = 5;
const PAGE_SKIP = 15;
const PROGRESS_STEPS = 2000;
const CHAPTER_GAP_PX = 3;

/** localStorage key holding the viewer's mute preference ('1' / '0'). */
export const MUTE_KEY = 'little-paper-boat:muted';

const svg = (body, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${body}</svg>`;
const ICONS = {
  play: svg('<path d="M8 5.6v12.8c0 .8.9 1.3 1.6.8l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z"/>'),
  pause: svg('<rect x="6.3" y="5" width="4" height="14" rx="1.2"/><rect x="13.7" y="5" width="4" height="14" rx="1.2"/>'),
  replay: svg('<path class="pb-stroke" d="M4.6 12.4a7.5 7.5 0 1 0 2.3-6.1"/><path class="pb-stroke" d="M4.4 4.3v4.3h4.3"/>'),
  sound: svg(
    '<path d="M3.8 9.4h3.4l4.3-3.6c.4-.3 1-.1 1 .5v11.4c0 .6-.6.8-1 .5l-4.3-3.6H3.8a.8.8 0 0 1-.8-.8V10.2c0-.4.4-.8.8-.8z"/>' +
      '<path class="pb-stroke" d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.7 7.7 0 0 1 0 10.8"/>',
  ),
  muted: svg(
    '<path d="M3.8 9.4h3.4l4.3-3.6c.4-.3 1-.1 1 .5v11.4c0 .6-.6.8-1 .5l-4.3-3.6H3.8a.8.8 0 0 1-.8-.8V10.2c0-.4.4-.8.8-.8z"/>' +
      '<path class="pb-stroke" d="M15.8 9.6l4.8 4.8M20.6 9.6l-4.8 4.8"/>',
  ),
  fsEnter: svg('<path class="pb-stroke" d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>'),
  fsExit: svg('<path class="pb-stroke" d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5"/>'),
};

const iconSet = (names) => names.map((n) => ICONS[n].replace('<svg ', `<svg data-icon="${n}" `)).join('');

const TEMPLATE = `
  <div class="pb-bar" role="group" aria-label="Film controls">
    <div class="pb-scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-orientation="horizontal">
      <div class="pb-scrub__track"><div class="pb-scrub__fill"></div></div>
      <div class="pb-scrub__head"><div class="pb-scrub__thumb"></div></div>
      <div class="pb-tip" aria-hidden="true"><span class="pb-tip__time"></span><span class="pb-tip__chapter"></span></div>
    </div>
    <div class="pb-row">
      <button class="pb-btn" type="button" data-action="play" aria-keyshortcuts="Space">${iconSet(['play', 'pause', 'replay'])}</button>
      <div class="pb-time"><span class="pb-time__cur">0:00</span> / <span class="pb-time__dur"></span></div>
      <div class="pb-chapter"></div>
      <button class="pb-btn" type="button" data-action="mute" aria-keyshortcuts="M">${iconSet(['sound', 'muted'])}</button>
      <button class="pb-btn" type="button" data-action="fullscreen" aria-keyshortcuts="F">${iconSet(['fsEnter', 'fsExit'])}</button>
    </div>
  </div>
  <button class="pb-replay" type="button" hidden>${ICONS.replay}Read it again</button>`;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** "m:ss" for a time in seconds (floored to the whole second). */
export function formatTime(t) {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const sec = s % 60;
  return `${Math.floor(s / 60)}:${sec < 10 ? '0' : ''}${sec}`;
}

/** CSS mask that cuts the scrubber track into one segment per chapter. */
function chapterMask(chapters, duration) {
  const half = CHAPTER_GAP_PX / 2;
  const stops = [];
  let from = '0%';
  for (const { t } of chapters) {
    if (t <= 0 || t >= duration) continue;
    const pct = ((t / duration) * 100).toFixed(3);
    stops.push(`#000 ${from}`, `#000 calc(${pct}% - ${half}px)`, `transparent calc(${pct}% - ${half}px)`, `transparent calc(${pct}% + ${half}px)`);
    from = `calc(${pct}% + ${half}px)`;
  }
  stops.push(`#000 ${from}`, '#000 100%');
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * Build the controls.
 * @param {object} o
 * @param {HTMLElement} o.root            full-viewport container (pointer-events: none) the UI is built into
 * @param {HTMLElement|null} [o.surface]  the film surface: mouse click toggles play, double-click toggles
 *                                        fullscreen, a touch tap reveals the controls (null: no handling)
 * @param {{ time: number, playing: boolean, play(): void, pause(): void }} o.player  timeline Player
 * @param {{ muted: boolean, setMuted(b: boolean): void }} o.audio
 * @param {{ t: number, label: string }[]} o.chapters  sorted by t, first at 0 (timeline CHAPTERS)
 * @param {number} o.duration              film length in seconds
 * @param {(t: number) => void} o.onSeek   seek request, t already clamped to [0, duration]
 * @param {() => void} [o.onGesture]       called synchronously inside every user gesture the UI handles
 *                                        (clicks, taps, shortcuts) so main can unlock audio
 * @param {boolean} [o.hidden=false]       render nothing (ui=0) but keep the keyboard shortcuts
 * @returns {{ update(t: number, playing: boolean): void, wake(): void }}
 */
export function createUI({ root, surface = null, player, audio, chapters, duration, onSeek, onGesture = () => {}, hidden = false }) {
  root.innerHTML = TEMPLATE;
  root.hidden = hidden;
  const $ = (sel) => root.querySelector(sel);
  const bar = $('.pb-bar');
  const scrub = $('.pb-scrub');
  const tip = $('.pb-tip');
  const tipTime = $('.pb-tip__time');
  const tipChapter = $('.pb-tip__chapter');
  const curEl = $('.pb-time__cur');
  const chapterEl = $('.pb-chapter');
  const playBtn = $('[data-action="play"]');
  const muteBtn = $('[data-action="mute"]');
  const fsBtn = $('[data-action="fullscreen"]');
  const replayBtn = $('.pb-replay');
  const durText = formatTime(duration);

  $('.pb-time__dur').textContent = durText;
  scrub.setAttribute('aria-valuemax', String(duration));
  const track = $('.pb-scrub__track');
  track.style.webkitMaskImage = track.style.maskImage = chapterMask(chapters, duration);

  const doc = document;
  const canFullscreen = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  fsBtn.hidden = !canFullscreen;

  // Displayed state; DOM is written only when one of these changes.
  let shownState = '';
  let shownSec = -1;
  let shownQ = -1;
  let shownChapter = -1;
  let idle = false;
  let lastInput = performance.now();
  let hovering = false;
  let keyboardFocus = false;
  let dragging = false;
  let resumeAfterDrag = false;
  let tapRevealed = false;
  let lastPointerType = 'mouse';

  function chapterIndex(t) {
    let i = 0;
    while (i + 1 < chapters.length && chapters[i + 1].t <= t + 1e-6) i++;
    return i;
  }

  function showIcon(button, name) {
    for (const icon of button.querySelectorAll('[data-icon]')) icon.toggleAttribute('hidden', icon.dataset.icon !== name);
  }

  function setLabel(button, label, shortcut) {
    button.setAttribute('aria-label', label);
    button.title = `${label} (${shortcut})`;
  }

  // ---- actions

  function play() {
    onGesture();
    if (player.time >= duration - 0.01) onSeek(0);
    player.play();
  }

  function togglePlay() {
    if (player.playing) player.pause();
    else play();
  }

  function seekBy(dt) {
    onSeek(clamp(player.time + dt, 0, duration));
  }

  function restart() {
    onSeek(0);
    play();
  }

  function syncMute() {
    const muted = !!audio.muted;
    showIcon(muteBtn, muted ? 'muted' : 'sound');
    setLabel(muteBtn, muted ? 'Unmute' : 'Mute', 'M');
    muteBtn.setAttribute('aria-pressed', String(muted));
  }

  function toggleMute() {
    audio.setMuted(!audio.muted);
    try {
      localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0');
    } catch {
      /* storage unavailable: the preference just isn't remembered */
    }
    syncMute();
  }

  const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

  function toggleFullscreen() {
    if (!canFullscreen) return;
    const el = doc.documentElement;
    const request = isFullscreen()
      ? (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc)
      : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    request?.catch?.(() => {});
  }

  function syncFullscreen() {
    const on = isFullscreen();
    showIcon(fsBtn, on ? 'fsExit' : 'fsEnter');
    setLabel(fsBtn, on ? 'Exit full screen' : 'Full screen', 'F');
  }

  // ---- visibility (auto-hide while playing)

  function syncSafeArea() {
    const px = hidden || idle ? 0 : Math.max(0, root.clientHeight - bar.offsetTop);
    doc.documentElement.style.setProperty('--ui-safe-bottom', `${px}px`);
  }

  function setIdle(value) {
    if (value === idle) return;
    idle = value;
    root.classList.toggle('is-idle', idle);
    doc.body.classList.toggle('pb-idle', idle);
    syncSafeArea();
  }

  function wake() {
    lastInput = performance.now();
    setIdle(false);
  }

  // ---- scrubber

  function timeAtClientX(clientX) {
    const r = scrub.getBoundingClientRect();
    return r.width > 0 ? clamp((clientX - r.left) / r.width, 0, 1) * duration : 0;
  }

  function showTip(clientX) {
    const r = scrub.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const t = r.width > 0 ? (x / r.width) * duration : 0;
    tipTime.textContent = formatTime(t);
    tipChapter.textContent = chapters[chapterIndex(t)].label;
    const w = tip.offsetWidth;
    tip.style.transform = `translateX(${clamp(x - w / 2, -6, r.width - w + 6)}px)`;
    scrub.classList.add('is-tip');
  }

  function hideTip() {
    scrub.classList.remove('is-tip');
  }

  scrub.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onGesture();
    dragging = true;
    resumeAfterDrag = player.playing;
    if (resumeAfterDrag) player.pause();
    scrub.setPointerCapture(e.pointerId);
    scrub.classList.add('is-dragging');
    onSeek(timeAtClientX(e.clientX));
    showTip(e.clientX);
  });

  scrub.addEventListener('pointermove', (e) => {
    if (dragging) onSeek(timeAtClientX(e.clientX));
    if (dragging || e.pointerType === 'mouse') showTip(e.clientX);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    scrub.classList.remove('is-dragging');
    if (!hovering) hideTip();
    if (resumeAfterDrag && player.time < duration - 0.01) player.play();
    wake();
  }

  scrub.addEventListener('pointerup', endDrag);
  scrub.addEventListener('pointercancel', endDrag);
  scrub.addEventListener('lostpointercapture', endDrag);
  scrub.addEventListener('pointerleave', () => {
    if (!dragging) hideTip();
  });

  bar.addEventListener('pointerenter', () => {
    hovering = true;
  });
  bar.addEventListener('pointerleave', () => {
    hovering = false;
  });
  bar.addEventListener('focusin', (e) => {
    keyboardFocus = e.target.matches(':focus-visible');
  });
  bar.addEventListener('focusout', () => {
    keyboardFocus = false;
  });

  // ---- buttons

  bar.addEventListener('click', onGesture);
  playBtn.addEventListener('click', togglePlay);
  muteBtn.addEventListener('click', toggleMute);
  fsBtn.addEventListener('click', toggleFullscreen);
  replayBtn.addEventListener('click', restart);
  doc.addEventListener('fullscreenchange', syncFullscreen);
  doc.addEventListener('webkitfullscreenchange', syncFullscreen);

  // ---- film surface

  if (surface) {
    surface.addEventListener('pointerdown', (e) => {
      lastPointerType = e.pointerType || 'mouse';
      tapRevealed = idle;
    });
    surface.addEventListener('click', () => {
      onGesture();
      if (lastPointerType !== 'mouse' && tapRevealed) return;
      togglePlay();
    });
    surface.addEventListener('dblclick', () => {
      if (lastPointerType === 'mouse') toggleFullscreen();
    });
  }

  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('resize', syncSafeArea);

  // ---- keyboard

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const onButton = e.target instanceof HTMLButtonElement;
    const onScrub = e.target === scrub;
    switch (e.key) {
      case ' ':
      case 'Spacebar':
        if (onButton) return; // the focused button handles Space itself
        if (!e.repeat) togglePlay();
        break;
      case 'ArrowLeft':
        seekBy(-SKIP);
        break;
      case 'ArrowRight':
        seekBy(SKIP);
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        if (!onScrub) return;
        seekBy(e.key === 'ArrowUp' ? SKIP : -SKIP);
        break;
      case 'PageDown':
      case 'PageUp':
        if (!onScrub) return;
        seekBy(e.key === 'PageUp' ? PAGE_SKIP : -PAGE_SKIP);
        break;
      case 'End':
        if (!onScrub) return;
        onSeek(duration);
        break;
      case 'Home':
        restart();
        break;
      case 'm':
      case 'M':
        if (!e.repeat) toggleMute();
        break;
      case 'f':
      case 'F':
        if (!e.repeat) toggleFullscreen();
        break;
      default:
        return;
    }
    e.preventDefault();
    onGesture();
    wake();
  });

  // ---- per-frame sync

  function update(t, playing) {
    const ended = !playing && t >= duration - 0.01;
    const state = ended ? 'ended' : playing ? 'playing' : 'paused';
    if (state !== shownState) {
      shownState = state;
      showIcon(playBtn, ended ? 'replay' : playing ? 'pause' : 'play');
      setLabel(playBtn, ended ? 'Replay' : playing ? 'Pause' : 'Play', 'Space');
      replayBtn.hidden = !ended;
      if (!playing) wake();
    }

    const sec = Math.floor(t + 1e-6);
    const ci = chapterIndex(t);
    if (sec !== shownSec || ci !== shownChapter) {
      shownSec = sec;
      if (ci !== shownChapter) {
        shownChapter = ci;
        chapterEl.textContent = chapters[ci].label;
      }
      const now = formatTime(t);
      curEl.textContent = now;
      scrub.setAttribute('aria-valuenow', String(sec));
      scrub.setAttribute('aria-valuetext', `${now} of ${durText}, ${chapters[ci].label}`);
    }

    const q = Math.round((t / duration) * PROGRESS_STEPS);
    if (q !== shownQ) {
      shownQ = q;
      scrub.style.setProperty('--p', String(q / PROGRESS_STEPS));
    }

    if (playing && !idle && !hovering && !dragging && !keyboardFocus && performance.now() - lastInput > IDLE_MS) setIdle(true);
  }

  syncMute();
  syncFullscreen();
  syncSafeArea();
  return { update, wake };
}
