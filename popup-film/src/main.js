/**
 * main.js — bootstrap and frame loop of "The Little Paper Boat".
 *
 * Boot (while the static intro card in index.html says "folding paper…"): renderer + camera,
 * environment, book, the four spreads (spread k is built with makeRng(1000 + k), its group is
 * mounted on book.getSpreadAnchor(k) and its art goes to book.setPageArt(k, …); a spread whose
 * build() throws is logged and skipped), titles, audio and camera rig. A warm-up pass then renders
 * the key moments of the film at a tiny size behind the card so every shader and texture is on
 * the GPU before the first page turn (skipped for clean still frames: ui=0 + t without play).
 *
 * Frame (contract §4): t = player.time; phis = leafAngles(t); book.setLeafAngles(phis); per
 * spread α = spreadAlpha(k, phis), visible when α > 0.002, update(α, t, t − start); camera rig;
 * environment; titles; audio.sync(t, playing); render. The scene is re-posed and re-rendered only
 * when t changes or something asks for a redraw (seek, resize, free-camera motion), so a paused
 * film costs nothing. Each module call is guarded: a failure is logged once and the film goes on.
 * Per-frame allocations: none here (timeline.leafAngles returns a fresh 5-element array).
 *
 * URL: t=<sec> seek there and pause · play=1 play (from t, else 0) · ui=0 no controls / intro
 * (clean frames; for any parameter the LAST occurrence wins, so a later ui=1 re-enables) ·
 * mute=1 · free=1 OrbitControls debug camera instead of the rig. No t / play: poster frame at
 * t = 20 behind the intro card, whose "Begin" (a user gesture) starts audio and plays from 0.
 * Hooks: window.__film = { seek(t), play(), pause(), time, playing, duration }; window.__ready.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CHAPTERS, DURATION, LEAF_TURNS, Player, SPREADS, clamp, leafAngles, spreadAlpha } from './timeline.js';
import { makeRng } from './util/rng.js';
import * as paper from './paper.js';
import * as popup from './popup.js';
import { BOOK, createBook } from './book.js';
import { createEnvironment } from './environment.js';
import { createTitles } from './titles.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';
import { MUTE_KEY, createUI } from './ui.js';
import { SPREAD_MODULES } from './spreads/index.js';

const POSTER_T = 20;
const VISIBLE_ALPHA = 0.002;
// Keep in sync with the .intro transitions in styles.css.
const REVEAL_MS = 900; // loading backdrop -> translucent poster
const VEIL_MS = 550; // poster -> black veil after Begin
const FADE_MS = 1200; // intro fades away
const WARM_SIZE = [320, 180];

// ---------------------------------------------------------------- URL parameters

const params = new URLSearchParams(location.search);
const param = (name) => params.getAll(name).at(-1) ?? null;
const tParam = Number.parseFloat(param('t'));
const hasT = Number.isFinite(tParam);
const autoplay = param('play') === '1';
const showUI = param('ui') !== '0';
const freeCam = param('free') === '1';
const posterMode = showUI && !hasT && !autoplay;
const stillFrame = !showUI && hasT && !autoplay;
const startT = hasT ? clamp(tParam, 0, DURATION) : autoplay ? 0 : POSTER_T;

// ---------------------------------------------------------------- state

const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const uiRoot = document.getElementById('ui');
const intro = document.getElementById('intro');
const statusText = intro.querySelector('.intro__status-text');
const beginBtn = intro.querySelector('.intro__begin');

const player = new Player(DURATION);
/** @type {{ k: number, id: string, start: number, group: THREE.Object3D, api: object, failed: boolean }[]} */
const spreads = [];
const reported = new Set();
let renderer = null;
let scene;
let camera;
let env;
let book;
let titles;
let audio;
let rig;
let controls = null;
let ui = null;
let audioStart = null;
let dirty = 0;
let lastT = NaN;
let framesRendered = 0;
let introSettled = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Resolves after the browser has had a chance to paint (falls back to a timeout in hidden tabs). */
const afterPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 150);
  });

function report(name, err) {
  if (reported.has(name)) return;
  reported.add(name);
  console.error(`[film] ${name} failed:`, err);
}

/** obj.update(t), with a failure logged once instead of stopping the film. */
function tick(name, obj, t) {
  try {
    obj.update(t);
  } catch (err) {
    report(name, err);
  }
}

/** Build an optional subsystem; on failure log it and use the fallback so the film still runs. */
function optional(name, create, fallback) {
  try {
    return create();
  } catch (err) {
    report(name, err);
    return fallback;
  }
}

function setLoadProgress(f) {
  intro.style.setProperty('--load', String(f));
}

// ---------------------------------------------------------------- public controls

function seek(t) {
  player.seek(clamp(Number(t) || 0, 0, DURATION));
  dirty = Math.max(dirty, 1);
}

/** audio.start() must run inside a user gesture; called synchronously from every gesture we see. */
function startAudio() {
  audioStart ??= (async () => {
    try {
      await audio.start();
    } catch (err) {
      console.warn('[film] audio could not start:', err);
      audioStart = null;
    }
  })();
  return audioStart;
}

window.__film = {
  seek,
  play: () => player.play(),
  pause: () => player.pause(),
  get time() {
    return player.time;
  },
  get playing() {
    return player.playing;
  },
  duration: DURATION,
};

// ---------------------------------------------------------------- scene construction

function createRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setSize(window.innerWidth, window.innerHeight);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.domElement.setAttribute('role', 'img');
  r.domElement.setAttribute('aria-label', 'A pop-up book on a desk, telling the story of a little paper boat');
  r.domElement.addEventListener('webglcontextrestored', () => {
    dirty = 2;
  });
  stage.appendChild(r.domElement);
  return r;
}

function buildSpread(mod, info) {
  const { k } = info;
  let api = null;
  try {
    api = mod.build({ THREE, paper, popup, rng: makeRng(1000 + k), BOOK });
    book.getSpreadAnchor(k).add(api.group);
    book.setPageArt(k, { left: api.leftArt, right: api.rightArt });
  } catch (err) {
    api?.group?.removeFromParent?.();
    console.error(`[film] spread ${k} (${mod?.id ?? info.id}) failed to build; skipping it:`, err);
    return;
  }
  api.group.visible = false;
  spreads.push({ k, id: info.id, start: info.start, group: api.group, api, failed: false });
}

function silentAudio() {
  let muted = false;
  return {
    async start() {},
    sync() {},
    setMuted(b) {
      muted = !!b;
    },
    get muted() {
      return muted;
    },
  };
}

function fallbackRig() {
  return {
    update() {
      camera.position.set(0, 7, 9);
      camera.lookAt(0, 0.4, 0);
    },
  };
}

function setupFreeCamera() {
  rig.update(startT);
  camera.fov = 35;
  camera.updateProjectionMatrix();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.update();
}

function initialMute() {
  if (param('mute') === '1') return true;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- per frame

function pose(t) {
  const phis = leafAngles(t);
  try {
    book.setLeafAngles(phis);
  } catch (err) {
    report('book', err);
  }
  for (const s of spreads) {
    if (s.failed) continue;
    const alpha = spreadAlpha(s.k, phis);
    s.group.visible = alpha > VISIBLE_ALPHA;
    if (!s.group.visible) continue;
    try {
      s.api.update(alpha, t, t - s.start);
    } catch (err) {
      s.failed = true;
      s.group.visible = false;
      console.error(`[film] spread ${s.k} (${s.id}) update failed; hiding it:`, err);
    }
  }
  if (!controls) tick('camera rig', rig, t);
  tick('environment', env, t);
  if (book.update) tick('book', book, t);
}

function frame() {
  const t = player.time;
  const playing = player.playing;
  let draw = false;
  if (t !== lastT || dirty > 0) {
    pose(t);
    tick('titles', titles, t);
    lastT = t;
    if (dirty > 0) dirty--;
    draw = true;
  }
  if (controls && controls.update()) draw = true;
  try {
    audio.sync(t, playing);
  } catch (err) {
    report('audio', err);
  }
  if (ui) ui.update(t, playing);
  if (draw) {
    renderer.render(scene, camera);
    framesRendered++;
  }
  if (introSettled && framesRendered >= 2 && !window.__ready) window.__ready = true;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = Math.max(dirty, 1);
}

/** Moments that between them show every spread / lighting combination of the film. */
function warmUpTimes() {
  const times = [0.5];
  LEAF_TURNS.forEach((turn, i) => {
    const next = LEAF_TURNS[i + 1];
    times.push((turn.start + turn.end) / 2, ((next ? next.start : DURATION) + turn.end) / 2);
  });
  times.push(DURATION - 1);
  return times;
}

/** Render each key moment once at a tiny size (canvas hidden by the intro) to compile + upload. */
async function warmUp() {
  renderer.setPixelRatio(1);
  renderer.setSize(WARM_SIZE[0], WARM_SIZE[1], false);
  try {
    for (const t of warmUpTimes()) {
      pose(t);
      renderer.render(scene, camera);
      await afterPaint();
    }
  } finally {
    resize();
  }
}

// ---------------------------------------------------------------- intro / start

function mountUI() {
  ui = createUI({
    root: uiRoot,
    surface: freeCam ? null : stage,
    player,
    audio,
    chapters: CHAPTERS,
    duration: DURATION,
    onSeek: seek,
    onGesture: startAudio,
    hidden: !showUI,
  });
}

function onIntroKey(e) {
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && e.target === document.body) {
    e.preventDefault();
    begin();
  }
}

async function begin() {
  if (intro.dataset.state !== 'poster') return;
  startAudio();
  window.removeEventListener('keydown', onIntroKey);
  intro.dataset.state = 'leaving';
  await wait(VEIL_MS);
  seek(0);
  player.play();
  document.body.classList.remove('is-poster');
  mountUI();
  ui.wake();
  intro.dataset.state = 'gone';
  await wait(FADE_MS);
  intro.remove();
}

function settle() {
  if (posterMode) {
    document.body.classList.add('is-poster');
    intro.dataset.state = 'poster';
    beginBtn.addEventListener('click', begin);
    window.addEventListener('keydown', onIntroKey);
    setTimeout(() => {
      introSettled = true;
    }, REVEAL_MS);
    return;
  }
  mountUI();
  if (autoplay) player.play();
  if (!showUI) {
    intro.remove();
    introSettled = true;
    return;
  }
  intro.dataset.state = 'gone';
  setTimeout(() => {
    intro.remove();
    introSettled = true;
  }, FADE_MS);
}

function fail(err) {
  console.error('[film] could not start:', err);
  intro.dataset.state = 'error';
  statusText.textContent = renderer
    ? 'The pages stuck together while folding. Please reload to try again.'
    : 'This film is drawn live with WebGL, which this browser could not provide.';
}

// ---------------------------------------------------------------- boot

async function boot() {
  renderer = createRenderer();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 200);
  setLoadProgress(0.08);
  await afterPaint();

  env = createEnvironment({ scene, renderer });
  book = createBook();
  scene.add(book.group);
  setLoadProgress(0.2);

  for (let i = 0; i < SPREAD_MODULES.length; i++) {
    await afterPaint();
    buildSpread(SPREAD_MODULES[i], SPREADS[i]);
    setLoadProgress(0.2 + (0.6 * (i + 1)) / SPREAD_MODULES.length);
  }

  titles = optional('titles', () => createTitles(overlay), { update() {} });
  audio = optional('audio', () => createAudio(), silentAudio());
  rig = optional('camera rig', () => createCameraRig(camera), fallbackRig());
  audio.setMuted(initialMute());
  if (freeCam) setupFreeCamera();

  if (!stillFrame) await warmUp();
  setLoadProgress(1);

  seek(startT);
  dirty = 2;
  framesRendered = 0;
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  renderer.setAnimationLoop(frame);
  settle();
}

/** Pause while the tab is hidden (the frame loop stops there) and carry on when it returns. */
let resumeOnShow = false;
function onVisibility() {
  if (document.hidden) {
    resumeOnShow = player.playing;
    player.pause();
  } else if (resumeOnShow) {
    resumeOnShow = false;
    player.play();
  }
}

boot().catch(fail);
