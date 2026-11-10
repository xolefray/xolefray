// Entry point: renderer, module wiring, playback clock and the window.__film
// controller. This is the ONLY module that reads real time.
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  film.debug = { THREE, renderer, scene, book, stage, scenes, cameraRig };

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

try {
  init();
} catch (err) {
  rejectReady(err);
  throw err; // must reach the console / pageerror
}
