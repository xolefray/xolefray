// Entry point: renderer, module wiring, playback clock and the window.__film
// controller. This is the ONLY module that reads real time: for the playback
// clock and for the resolution governor (which changes only the renderer's
// pixel ratio, never what the film shows).
import * as THREE from 'three';
import { getFilmState, DURATION, FPS } from './timeline.js';
import { clamp } from './util.js';
import { createStage } from './stage.js';
import { createBook } from './book.js';
import { createCameraRig } from './camera.js';
import { createCaptions } from './captions.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { sceneFactories } from './scenes/index.js';

const params = new URLSearchParams(location.search);
const listeners = { play: new Set(), pause: new Set(), seek: new Set(), end: new Set() };
const emit = (ev, arg) => { for (const fn of [...listeners[ev]]) fn(arg); };

let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

let time = 0;
let playing = false;
let loop = params.get('loop') === '1';
let lastState = null;
let renderFrame = () => {};
let lastTick = null; // rAF timestamp of the previous playing frame

const film = {
  ready,
  duration: DURATION,
  fps: FPS,
  get time() { return time; },
  get playing() { return playing; },
  play() {
    if (playing) return;
    if (time >= DURATION) time = 0;
    playing = true;
    lastTick = null;
    emit('play');
  },
  pause() {
    if (!playing) return;
    playing = false;
    renderFrame(); // refresh UI state
    emit('pause');
  },
  toggle() { playing ? film.pause() : film.play(); },
  seek(t) {
    time = clamp(Number(t) || 0, 0, DURATION);
    lastTick = null;
    renderFrame();
    emit('seek', time);
  },
  getState() { return lastState ?? getFilmState(time); },
  on(ev, fn) { listeners[ev]?.add(fn); return film; },
  off(ev, fn) { listeners[ev]?.delete(fn); return film; },
};
window.__film = film;
ready.catch(() => {}); // init errors are rethrown below and reach the console there

function init() {
  const canvas = document.getElementById('film');
  const overlay = document.getElementById('overlay');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // `res=<number>` pins the pixel ratio (and turns the governor off).
  const resPin = parseFloat(params.get('res'));
  const pinned = Number.isFinite(resPin) && resPin > 0;
  const basePixelRatio = pinned ? Math.min(resPin, 4) : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(basePixelRatio);
  renderer.shadowMap.enabled = true;
  // The contract asked for PCFSoftShadowMap, but three r187 removed it (it logs a
  // warning and falls back); PCFShadowMap is the soft-filtered PCF in this version.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const ctx = { renderer, scene, canvas, overlay, params };

  if (params.get('controls') === '0') overlay.querySelector('#ui').style.display = 'none';

  const stage = createStage(ctx);
  scene.add(stage.group);

  const book = createBook(ctx);
  scene.add(book.group);

  const scenes = sceneFactories.map((factory, k) => {
    const s = factory(ctx);
    const a = book.getSpreadAnchors(k);
    a.left.add(s.left);
    a.right.add(s.right);
    a.center.add(s.center);
    return s;
  });

  const cameraRig = createCameraRig(ctx);
  const captions = createCaptions(ctx);
  const audio = createAudio(ctx, film);
  film.audio = audio; // the player UI calls film.audio.setMuted()
  const ui = createUI(ctx, film);

  const governor = createGovernor(renderer, basePixelRatio, !pinned && params.get('controls') !== '0');

  film.debug = { THREE, renderer, scene, book, stage, scenes, cameraRig, governor };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    cameraRig.resize(w / Math.max(1, h));
  }
  window.addEventListener('resize', () => { resize(); renderFrame(); });
  resize();

  renderFrame = function () {
    const state = getFilmState(time);
    lastState = state;
    stage.update(state);
    book.update(state);
    for (let k = 0; k < scenes.length; k++) {
      const s = scenes[k];
      const open = state.spreadOpen[k];
      const visible = open > 0.001;
      s.left.visible = s.right.visible = s.center.visible = visible;
      if (visible) s.update(state, { index: k, open, theta: Math.PI * open, time: state.spreadTime[k] });
    }
    cameraRig.update(state);
    captions.update(state);
    ui.update(state);
    audio.update(state);
    renderer.render(scene, cameraRig.camera);
  };

  function tick(now) {
    requestAnimationFrame(tick);
    if (!playing) { lastTick = null; return; }
    if (lastTick !== null) {
      governor.sample(now - lastTick);
      time += clamp((now - lastTick) / 1000, 0, 0.1);
      if (time >= DURATION) {
        if (loop) {
          time = 0;
        } else {
          time = DURATION;
          playing = false;
          renderFrame();
          emit('end');
          emit('pause');
          return;
        }
      }
    }
    lastTick = now;
    renderFrame();
  }

  const t0 = parseFloat(params.get('t'));
  time = Number.isFinite(t0) ? clamp(t0, 0, DURATION) : 0;
  renderFrame();
  requestAnimationFrame(() => {
    resolveReady(film);
    if (params.get('autoplay') !== '0') film.play();
    requestAnimationFrame(tick);
  });
}

/**
 * Adaptive resolution. The film is fragment-shader bound, so on a slow device
 * the cheapest fix is fewer pixels. While playing, `sample(ms)` gets each real
 * frame interval; an exponential moving average above SLOW_MS for SLOW_FOR ms
 * steps the pixel ratio down (x STEP, never below MIN_PR), below FAST_MS for
 * FAST_FOR ms steps it back up (never above the starting ratio). Different
 * thresholds and dwell times plus a settle pause after every change keep it from
 * oscillating. Only playback calls sample(): paused, seek() and capture
 * (controls=0) never change the resolution, and neither does `res=` (pinned).
 */
function createGovernor(renderer, maxPR, enabled) {
  const SLOW_MS = 40, FAST_MS = 24, SLOW_FOR = 1000, FAST_FOR = 4000, SETTLE = 1500;
  const STEP = 0.85, MIN_PR = Math.min(maxPR, 0.6), ALPHA = 0.1;
  let avg = 0, slow = 0, fast = 0, settle = 0, pr = maxPR;
  function set(next) {
    next = clamp(next, MIN_PR, maxPR);
    if (Math.abs(next - pr) < 1e-3) return;
    pr = next;
    renderer.setPixelRatio(pr); // keeps the CSS size; resizes the drawing buffer
    slow = fast = 0;
    settle = SETTLE;
    avg = 0;
  }
  return {
    get enabled() { return enabled; },
    get pixelRatio() { return renderer.getPixelRatio(); },
    get average() { return avg; },
    sample(ms) {
      if (!enabled || !(ms > 0) || ms > 1000) return;  // ignore stalls (tab hidden, debugger)
      ms = Math.min(ms, 200);                           // one hitch must not dominate the average
      avg = avg ? avg + ALPHA * (ms - avg) : ms;
      if (settle > 0) { settle -= ms; return; }
      slow = avg > SLOW_MS && ms > SLOW_MS ? slow + ms : 0;  // the newest frame must agree with the
      fast = avg < FAST_MS && ms < FAST_MS ? fast + ms : 0;  // (lagging) average, both ways
      if (slow >= SLOW_FOR && pr > MIN_PR) set(pr * STEP);
      else if (fast >= FAST_FOR && pr < maxPR) set(pr / STEP);
    },
  };
}

try {
  init();
} catch (err) {
  rejectReady(err);
  throw err; // must reach the console / pageerror
}
