// STUB (T0) — replaced by T-main
/**
 * main.js — film bootstrap (minimal working version).
 * Builds renderer, scene, environment, book and spreads; drives everything from the Player's
 * film time each frame. URL params: t=<sec> (seek + pause), play=1, ui=0. Exposes window.__film
 * and sets window.__ready once two frames have rendered at the requested time.
 */
import * as THREE from 'three';
import { DURATION, SPREADS, Player, leafAngles, spreadAlpha } from './timeline.js';
import { makeRng } from './util/rng.js';
import * as paper from './paper.js';
import * as popup from './popup.js';
import { BOOK, createBook } from './book.js';
import { createEnvironment } from './environment.js';
import { createTitles } from './titles.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';
import { createUI } from './ui.js';
import { SPREAD_MODULES } from './spreads/index.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);

const env = createEnvironment({ scene, renderer });
const book = createBook();
scene.add(book.group);

const spreads = SPREAD_MODULES.map((mod, i) => {
  const info = SPREADS[i];
  const built = mod.build({ THREE, paper, popup, rng: makeRng(1000 + info.k), BOOK });
  book.getSpreadAnchor(info.k).add(built.group);
  book.setPageArt(info.k, { left: built.leftArt, right: built.rightArt });
  return { ...built, info };
});

const titles = createTitles(document.getElementById('overlay'));
const audio = createAudio();
const rig = createCameraRig(camera);
const player = new Player(DURATION);
createUI();

player.seek(parseFloat(params.get('t') ?? '0') || 0);
if (params.get('play') === '1') player.play();
if (!params.has('t') && !params.has('play') && params.get('ui') !== '0') {
  const begin = document.createElement('button');
  begin.className = 'begin';
  begin.textContent = 'Begin';
  begin.addEventListener('click', async () => {
    begin.remove();
    await audio.start();
    player.play();
  });
  document.body.appendChild(begin);
}

window.__film = {
  seek: (t) => player.seek(t),
  play: () => player.play(),
  pause: () => player.pause(),
  get time() {
    return player.time;
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let frames = 0;
function frame() {
  const t = player.time;
  const phis = leafAngles(t);
  book.setLeafAngles(phis);
  for (const s of spreads) {
    const alpha = spreadAlpha(s.info.k, phis);
    s.group.visible = alpha > 0.002;
    if (s.group.visible) s.update(alpha, t, t - s.info.start);
  }
  rig.update(t);
  env.update(t);
  book.update(t);
  titles.update(t);
  audio.sync(t, player.playing);
  renderer.render(scene, camera);
  if (++frames >= 2) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
