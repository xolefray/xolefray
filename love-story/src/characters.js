/**
 * characters.js — hand-drawn cut-out characters (love-story/characters/, private, git-ignored).
 *
 * The pose artists drop RGBA drawings in characters/poses/<id>.png with a sidecar <id>.json.
 * tools/build-character-manifest.mjs folds the sidecars into characters/manifest.json. A fresh
 * clone has neither, and every scene still has to run: loadCharacters() never throws and never
 * logs an error when the folder is missing, and actor() falls back to the paper-doll figures.
 *
 * loadCharacters({ disabled, base = './characters/' } = {}) -> Promise<set>
 *   Fetches <base>manifest.json and decodes every image into a canvas. `base` is a page URL
 *   (default './characters/', which is right for index.html; dev/characters.html passes
 *   '../characters/'). `disabled: true`, or — when `disabled` is not given — `chars=0` in the
 *   page URL, returns an empty set and fetches nothing.
 *   window.__CHARACTERS = { manifest, images: { <id>: url | dataURI } } supplies both for a
 *   single-file build; the files are not consulted. A name missing from `images` is skipped.
 *   The promise never rejects. A missing manifest is silent (that is the normal fresh clone).
 *   A manifest that loads but names a bad image is noted with console.info and that id is
 *   left out.
 *   set = {
 *     ids: string[]                         // successfully decoded, manifest order
 *     has(id) -> boolean
 *     canvas(id) -> HTMLCanvasElement|null  // the raw cut-out (not yet die-cut)
 *     info(id) -> sidecar|null              // read-only; feet, units, who, cycle, …
 *     cycle(name) -> string[]               // frame order; [] when unknown
 *   }
 *
 * characterCard(paper, chars, id, { height, border = 10, flip = false, back } = {})
 *   -> THREE.Group | null
 *   paper.dieCut draws the white paper border (`border` px; the art needs at least that much
 *   transparent padding), then paper.card prints it. The canvas is scaled so it is `height`
 *   world units tall (default: the sidecar's `units`). The group's origin is the drawing's
 *   feet point, in its local XY plane, front toward +Z. `flip` mirrors the drawing through
 *   the feet (the canvas is mirrored; the mesh scale stays positive so the lit face and the
 *   shadow keep their winding). userData = { id, width, height } with width/height the
 *   canvas size in world units.
 *
 * characterFlip(paper, chars, ids, opts) -> { group, show(index), count } | null
 *   One characterCard per id, stacked on the same origin. Every frame is scaled with the
 *   first frame's pixels-per-unit (cycles share a ground line and a pixel scale by
 *   construction), so swapping them does not slide the feet. show(i) reveals exactly one
 *   frame and allocates nothing. Null when none of the ids loaded.
 *
 * actor(paper, chars, figures, id, fallback, opts) -> THREE.Group | null
 *   characterCard when the drawing loaded, otherwise figures.figureCard(paper, fallback.who,
 *   fallback). `opts` applies only to the drawn card. A scene can ask for an actor and
 *   always get a piece of paper.
 */
import * as THREE from 'three';
import { makeCanvas } from './paper.js';

const LOAD_TIMEOUT_MS = 12000;

const cache = new Map();

function emptySet() {
  return {
    ids: Object.freeze([]),
    has() {
      return false;
    },
    canvas() {
      return null;
    },
    info() {
      return null;
    },
    cycle() {
      return [];
    },
  };
}

/** True when the page URL carries `chars=0` (the last occurrence wins, as for the film's other parameters). */
export function charsDisabled() {
  try {
    return new URLSearchParams(location.search).getAll('chars').at(-1) === '0';
  } catch {
    return false;
  }
}

function joinUrl(base, rel) {
  const root = base.endsWith('/') ? base : `${base}/`;
  return new URL(rel, new URL(root, document.baseURI)).href;
}

function withTimeout(ms, run) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), ms);
    run(finish);
  });
}

function decodeImage(src) {
  if (!src || typeof document === 'undefined') return Promise.resolve(null);
  return withTimeout(LOAD_TIMEOUT_MS, (finish) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!(w > 0 && h > 0)) return finish(null);
        const { canvas, ctx } = makeCanvas(w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        ctx.getImageData(0, 0, 1, 1);
        finish(canvas);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = src;
  });
}

async function fetchManifest(base) {
  if (typeof document === 'undefined') return null;
  const url = joinUrl(base, 'manifest.json');
  try {
    const res = await withTimeout(LOAD_TIMEOUT_MS, (finish) => {
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
      fetch(url, { signal: ctrl.signal }).then(
        (r) => {
          clearTimeout(killer);
          finish(r);
        },
        () => {
          clearTimeout(killer);
          finish(null);
        },
      );
    });
    if (!res || !res.ok) return null; // missing folder: say nothing
    try {
      return await res.json();
    } catch {
      console.info('[characters] manifest could not be read; using paper dolls');
      return null;
    }
  } catch {
    return null;
  }
}

function note(id, why) {
  console.info(`[characters] "${id}" ${why}; that drawing is skipped`);
}

/** A left-right mirror. Negative group scale would flip the card's facing and its shadow. */
function mirrored(canvas) {
  const { canvas: out, ctx } = makeCanvas(canvas.width, canvas.height);
  ctx.translate(out.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

async function loadInner(base, override) {
  let manifest;
  let srcFor;
  if (override) {
    manifest = override.manifest && typeof override.manifest === 'object' ? override.manifest : null;
    const images = override.images && typeof override.images === 'object' ? override.images : {};
    srcFor = (id) => (typeof images[id] === 'string' && images[id] ? images[id] : null);
  } else {
    manifest = await fetchManifest(base);
    srcFor = (id, info) => joinUrl(base, (info && typeof info.file === 'string' && info.file) || `poses/${id}.png`);
  }
  if (!manifest || typeof manifest.items !== 'object' || manifest.items === null) return emptySet();

  const entries = Object.entries(manifest.items).filter(([, info]) => info && typeof info === 'object');
  const decoded = await Promise.all(
    entries.map(async ([id, info]) => {
      const src = srcFor(id, info);
      if (!src) {
        note(id, 'has no image');
        return null;
      }
      const canvas = await decodeImage(src);
      if (!canvas) {
        note(id, 'could not be decoded');
        return null;
      }
      if (info.w !== canvas.width || info.h !== canvas.height) {
        note(id, `is ${canvas.width}×${canvas.height}, sidecar says ${info.w}×${info.h}`);
        return null;
      }
      return { id, info, canvas };
    }),
  );

  const canvases = new Map();
  const infos = new Map();
  const ids = [];
  for (const row of decoded) {
    if (!row) continue;
    canvases.set(row.id, row.canvas);
    infos.set(row.id, row.info);
    ids.push(row.id);
  }

  const cycles = {};
  const raw = manifest.cycles && typeof manifest.cycles === 'object' ? manifest.cycles : {};
  for (const name of Object.keys(raw)) {
    if (!Array.isArray(raw[name])) continue;
    cycles[name] = Object.freeze(raw[name].filter((id) => typeof id === 'string' && canvases.has(id)));
  }

  const frozenIds = Object.freeze(ids);
  return {
    ids: frozenIds,
    has(id) {
      return canvases.has(id);
    },
    canvas(id) {
      return canvases.get(id) ?? null;
    },
    info(id) {
      return infos.get(id) ?? null;
    },
    cycle(name) {
      return cycles[name] ?? [];
    },
  };
}

export function loadCharacters({ disabled, base = './characters/', override: given } = {}) {
  if (disabled ?? charsDisabled()) return Promise.resolve(emptySet());
  // `override` ({ manifest, images }) replaces the files for this base; without one, the default
  // base falls back to window.__CHARACTERS (single-file build).
  const global = typeof window !== 'undefined' && base === './characters/' && window.__CHARACTERS ? window.__CHARACTERS : null;
  const override = given || global;
  const key = override ? `__override:${base}` : base;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = loadInner(base, override).catch(() => emptySet());
  cache.set(key, pending);
  return pending;
}

export function characterCard(paper, chars, id, opts = {}) {
  const canvas = chars?.canvas?.(id);
  const info = chars?.info?.(id);
  if (!canvas || !info) return null;
  const w = info.w;
  const h = info.h;
  const feet = info.feet;
  if (!(w > 0 && h > 0) || !Array.isArray(feet) || feet.length < 2) return null;
  const height = opts.height ?? info.units;
  if (!(height > 0)) return null;
  const border = Math.max(0, opts.border ?? 10);
  let src = canvas;
  let fx = feet[0];
  if (opts.flip) {
    src = mirrored(src);
    fx = w - fx;
  }
  const cut = paper.dieCut(src, { margin: border });
  const s = height / h;
  const width = w * s;
  const cardOpts = { canvas: cut, width, height, anchor: 'bottom-center' };
  if (opts.back !== undefined) cardOpts.back = opts.back;
  const card = paper.card(cardOpts);
  // paper.card's origin is the canvas bottom-centre. Slide it so the feet pixel lands on 0,0.
  card.position.set(((w / 2) - fx) * s, (feet[1] - h) * s, 0);
  const group = new THREE.Group();
  group.add(card);
  group.userData = { id, width, height };
  return group;
}

export function characterFlip(paper, chars, ids, opts = {}) {
  if (!chars || !ids || !ids.length) return null;
  const frames = [];
  for (let i = 0; i < ids.length; i++) {
    if (chars.has(ids[i])) frames.push(ids[i]);
  }
  if (!frames.length) return null;
  const ref = chars.info(frames[0]);
  if (!ref || !(ref.h > 0)) return null;
  const target = opts.height ?? ref.units;
  if (!(target > 0)) return null;
  const scale = target / ref.h; // world units per pixel, shared by the whole cycle
  const group = new THREE.Group();
  const cards = [];
  for (let i = 0; i < frames.length; i++) {
    const info = chars.info(frames[i]);
    if (!info || !(info.h > 0)) continue;
    const card = characterCard(paper, chars, frames[i], { ...opts, height: info.h * scale });
    if (!card) continue;
    card.visible = cards.length === 0;
    group.add(card);
    cards.push(card);
  }
  if (!cards.length) return null;
  const count = cards.length;
  let shown = 0;
  return {
    group,
    count,
    show(index) {
      let i = Math.floor(index) % count;
      if (i < 0) i += count;
      if (i === shown) return;
      cards[shown].visible = false;
      cards[i].visible = true;
      shown = i;
    },
  };
}

export function actor(paper, chars, figures, id, fallback, opts) {
  if (chars && typeof chars.has === 'function' && chars.has(id)) return characterCard(paper, chars, id, opts);
  if (!fallback || !figures || typeof figures.figureCard !== 'function') return null;
  return figures.figureCard(paper, fallback.who, fallback);
}
