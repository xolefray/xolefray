/**
 * main.js — bootstrap and frame loop of "Our Love Story" (Brian & Marlin's wedding pop-up film).
 *
 * Boot (while the static intro card in index.html says "gluing in the photos…"): renderer + camera;
 * then the things every painter needs — the vendored fonts (fonts.js; nothing may paint a canvas
 * before them), the couple's photos (photos.js; each may be null → illustrated fallbacks) and the
 * paper-doll figures module (imported defensively: if figures.js is missing or incomplete it is
 * logged once and plain stand-ins are passed instead); then environment, the scrapbook
 * (createBook({ photos, fonts })) and the six spreads. Spread k is built with makeRng(1000 + k) and
 * the context { THREE, paper, popup, rng, BOOK, photos, figures, FONT, timeline }; its group is
 * mounted on book.getSpreadAnchor(k) and its art goes to book.setPageArt(k, …); a spread whose
 * build() throws is logged and skipped. The spreads' camera cues (spread-frame points) are then
 * converted to WORLD space through each spread anchor at its full-open pose and handed to the camera
 * rig as getCues(). Finally titles, audio, camera rig, and a warm-up pass that renders the key
 * moments of the film at a tiny size behind the card so every shader and texture is on the GPU
 * before the first page turn (skipped for clean still frames: ui=0 + t without play).
 *
 * Frame: t = player.time; phis = leafAngles(t) (7 leaves); book.setLeafAngles(phis); per spread
 * α = spreadAlpha(k, phis), visible when α > 0.002, update(α, t, t − start); camera rig;
 * environment; titles; audio.sync(t, playing); render. The scene is re-posed and re-rendered only
 * when t changes or something asks for a redraw (seek, resize, free-camera motion), so a paused
 * film costs nothing. Each module call is guarded: a failure is logged once and the film goes on.
 * Spread point lights are mirrored by always-visible proxies (adoptLights), so the scene's light
 * count — and with it every shader program — never changes at a page turn. A lost WebGL context
 * pauses the film behind a short notice until the browser restores it.
 * Per-frame allocations: none here (timeline.leafAngles fills a reused array).
 *
 * URL: t=<sec> seek there and pause · play=1 play (from t, else 0) · ui=0 no controls / intro
 * (clean frames; for any parameter the LAST occurrence wins, so a later ui=1 re-enables) ·
 * mute=1 · captions=0 hide the narration captions (sets <html data-captions="0">, which titles.js
 * reads) · photos=0 never load the couple's photos: every print shows its illustrated fallback
 * (privacy-safe frames) · free=1 OrbitControls debug camera instead of the rig. No t / play:
 * poster frame at t = 22 behind the intro card, whose "Begin" (a user gesture) starts audio and
 * plays from 0.
 * Hooks: window.__film = { seek(t), play(), pause(), time, playing, duration, cues }; window.__ready.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as timeline from './timeline.js';
import { CHAPTERS, DURATION, LEAF_TURNS, Player, SPREADS, clamp, leafAngles, spreadAlpha } from './timeline.js';
import { LEAVES } from './dims.js';
import { makeRng } from './util/rng.js';
import { resolveFigures } from './util/figures-fallback.js';
import { FONT, loadFonts } from './fonts.js';
import { loadPhotos } from './photos.js';
import * as paper from './paper.js';
import * as popup from './popup.js';
import { BOOK, createBook } from './book.js';
import { createEnvironment } from './environment.js';
import { createTitles } from './titles.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';
import { MUTE_KEY, createUI } from './ui.js';
import { SPREAD_MODULES } from './spreads/index.js';

const POSTER_T = 22;
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
const showCaptions = param('captions') !== '0';
const usePhotos = param('photos') !== '0';
const posterMode = showUI && !hasT && !autoplay;
const stillFrame = !showUI && hasT && !autoplay;
const startT = hasT ? clamp(tParam, 0, DURATION) : autoplay ? 0 : POSTER_T;

// ---------------------------------------------------------------- state

// titles.js reads this (captions=0 hides the narration captions; page titles and end card stay).
document.documentElement.dataset.captions = showCaptions ? '1' : '0';

const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const uiRoot = document.getElementById('ui');
const intro = document.getElementById('intro');
const statusText = intro.querySelector('.intro__status-text');
const beginBtn = intro.querySelector('.intro__begin');

const player = new Player(DURATION);
/** @type {{ k: number, id: string, start: number, group: THREE.Object3D, api: object, failed: boolean }[]} */
const spreads = [];
/** Always-visible stand-ins for the spreads' point lights: { src, proxy, group } (see adoptLights). */
const spreadLights = [];
/** Camera cues of all spreads in WORLD space, sorted by t (see collectCues); what getCues() returns. */
let worldCues = [];
const reported = new Set();
const phis = new Array(LEAVES).fill(0); // leaf angles, refilled every pose (no per-frame allocation)
let photos = { cover: null, proposal: null, dog: null };
let figures = null;
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
let audioWarned = false;
let dirty = 0;
let lastT = NaN;
let framesRendered = 0;
let introSettled = false;
let resumeOnRestore = false;
let lostNote = null;

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

/**
 * audio.start() (async, idempotent) needs a user gesture, so it is called synchronously from
 * every gesture the page handles: Begin, play/pause, shortcuts, scrubbing, replay, film clicks.
 */
function startAudio() {
  Promise.resolve(audio.start()).catch((err) => {
    if (!audioWarned) console.warn('[film] audio could not start:', err);
    audioWarned = true;
  });
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
  /** The merged world-space camera cues (read-only; for dev tools). */
  get cues() {
    return worldCues;
  },
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
  r.domElement.setAttribute('aria-label', 'A hand-made pop-up scrapbook on a desk, telling how Brian and Marlin met and got engaged');
  r.domElement.addEventListener('webglcontextlost', onContextLost);
  r.domElement.addEventListener('webglcontextrestored', onContextRestored);
  stage.appendChild(r.domElement);
  return r;
}

/**
 * The GPU dropped the WebGL context (driver reset, too many contexts, a backgrounded phone…):
 * three.js keeps it restorable, so pause and say so instead of leaving a frozen frame.
 */
function onContextLost() {
  resumeOnRestore ||= player.playing;
  player.pause();
  if (lostNote) return;
  lostNote = document.createElement('p');
  lostNote.className = 'film-note';
  lostNote.setAttribute('role', 'status');
  lostNote.textContent = 'The picture was interrupted by the graphics driver. Folding it back together… (reload the page if it does not return)';
  document.body.appendChild(lostNote);
}

function onContextRestored() {
  lostNote?.remove();
  lostNote = null;
  dirty = 2;
  if (resumeOnRestore) player.play();
  resumeOnRestore = false;
}

/**
 * A hidden spread group takes its lights out of the render, so the scene's light count would
 * change at every page turn and every lit material would switch (or compile) shader programs.
 * Instead each spread point light is mirrored by a proxy that always stays in the scene: the
 * spread keeps driving its own (now never rendered) light, and syncSpreadLights() copies its
 * world position, colour and falloff to the proxy every pose — intensity 0 while it is hidden.
 */
function adoptLights(group) {
  group.traverse((src) => {
    if (!src.isPointLight) return;
    const proxy = src.clone(false);
    proxy.intensity = 0;
    src.visible = false;
    scene.add(proxy);
    spreadLights.push({ src, proxy, group });
  });
}

function syncSpreadLights() {
  for (const { src, proxy, group } of spreadLights) {
    let o = src.parent;
    while (o && o !== group.parent && o.visible) o = o.parent;
    if (o !== group.parent) {
      proxy.intensity = 0; // the spread (or the light's own branch) is hidden
      continue;
    }
    src.updateWorldMatrix(true, false);
    proxy.position.setFromMatrixPosition(src.matrixWorld);
    proxy.color.copy(src.color);
    proxy.intensity = src.intensity;
    proxy.distance = src.distance;
    proxy.decay = src.decay;
  }
}

function buildSpread(mod, info) {
  const { k } = info;
  let api = null;
  try {
    api = mod.build({ THREE, paper, popup, rng: makeRng(1000 + k), BOOK, photos, figures, FONT, timeline });
    book.getSpreadAnchor(k).add(api.group);
    book.setPageArt(k, { left: api.leftArt, right: api.rightArt });
  } catch (err) {
    api?.group?.removeFromParent?.();
    console.error(`[film] spread ${k} (${mod?.id ?? info.id}) failed to build; skipping it:`, err);
    return;
  }
  api.group.visible = false;
  adoptLights(api.group);
  spreads.push({ k, id: info.id, start: info.start, open: info.open, group: api.group, api, failed: false });
}

/**
 * The spreads give their camera cues in SPREAD-FRAME coordinates. The rig wants world points, so
 * each spread's cues go through its anchor's world matrix with the book posed at that spread's
 * full-open moment (`open`: the left page lies flat, so spread-frame x < 0 is simply the left page).
 * Result: [{ t, hold, at: THREE.Vector3 (world), size, from, spread }] sorted by t. A malformed cue
 * is dropped with one warning; a spread without cues contributes none (the rig has its own wides).
 */
function collectCues() {
  const out = [];
  for (const s of spreads) {
    const list = Array.isArray(s.api.cues) ? s.api.cues : [];
    if (list.length === 0) continue;
    try {
      leafAngles(s.open ?? s.start + 3, phis);
      book.setLeafAngles(phis);
      book.group.updateMatrixWorld(true);
      const anchor = book.getSpreadAnchor(s.k);
      anchor.updateWorldMatrix(true, false);
      for (const c of list) {
        const at = c?.at;
        if (!c || !Number.isFinite(c.t) || !at || ![at[0], at[1], at[2]].every(Number.isFinite)) {
          report(`a camera cue of spread ${s.k} (${s.id})`, new Error(`malformed cue ${JSON.stringify(c)}`));
          continue;
        }
        out.push({
          t: c.t,
          hold: Number.isFinite(c.hold) ? c.hold : 0,
          at: new THREE.Vector3(at[0], at[1], at[2]).applyMatrix4(anchor.matrixWorld),
          size: Number.isFinite(c.size) && c.size > 0 ? c.size : 7.5,
          from: c.from ?? 'front',
          spread: s.k,
        });
      }
    } catch (err) {
      report(`camera cues of spread ${s.k} (${s.id})`, err);
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** figures.js belongs to another part of the film: load it defensively and patch any gaps. */
async function loadFigures() {
  let mod = null;
  try {
    mod = await import('./figures.js');
  } catch (err) {
    console.warn('[film] figures.js could not be loaded:', err);
  }
  return resolveFigures(mod, paper);
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
      camera.position.set(0, 8.5, 11);
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
  leafAngles(t, phis);
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
  syncSpreadLights();
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
  setLoadProgress(0.05);
  await afterPaint();

  // Fonts first: nothing may paint a canvas before they are usable. Neither loader ever rejects.
  const [, loadedPhotos, loadedFigures] = await Promise.all([loadFonts(), loadPhotos({ disabled: !usePhotos }), loadFigures()]);
  photos = loadedPhotos;
  figures = loadedFigures;
  setLoadProgress(0.12);
  await afterPaint();

  env = createEnvironment({ scene, renderer });
  book = createBook({ photos, fonts: FONT });
  scene.add(book.group);
  setLoadProgress(0.2);

  for (let i = 0; i < SPREAD_MODULES.length; i++) {
    await afterPaint();
    buildSpread(SPREAD_MODULES[i], SPREADS[i]);
    setLoadProgress(0.2 + (0.6 * (i + 1)) / SPREAD_MODULES.length);
  }

  worldCues = collectCues();

  titles = optional('titles', () => createTitles(overlay, { captions: showCaptions }), { update() {} });
  audio = optional('audio', () => createAudio(), silentAudio());
  rig = optional('camera rig', () => createCameraRig(camera, { getCues: () => worldCues }), fallbackRig());
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
