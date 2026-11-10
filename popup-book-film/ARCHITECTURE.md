# The Fox and the Paper Moon — architecture and contracts

An 80-second, self-running 3D pop-up-book film for the browser. three.js, plain
ES modules, no build step. A book lies on a desk, the cover opens, five spreads
of paper pop-up scenery unfold as rigid card pages turn, the camera moves like a
film camera, captions tell a tiny story, the book closes.

This file is the contract every module codes against. If you need to change a
contract, say so in your report — do not silently change it.

---

## DETERMINISM RULE (read this first)

**Every visual is a pure function of film time.** `film.seek(t)` must produce the
identical frame no matter what was shown before. So, in every module:

- **No `Math.random()` at update time.** Use the seeded `rng(seed)` from
  `src/util.js` at construction time (or `hash01(n)` for per-item constants).
- **No accumulating `dt` integrators** (no `x += v * dt`, no physics stepping, no
  "last frame" state that changes what you draw). Compute positions in closed form
  from `state.t`, `state.segT`, `state.spreadTime[k]`, `spread.time`, etc.
- **No `Date.now()` / `performance.now()` / `clock.getDelta()`.** Only
  `main.js`'s playback clock touches real time.
- Caching derived values is fine as long as the output depends only on the input
  state.

`tools/smoke.mjs` checks this (seek A, seek elsewhere, seek back to A, compare PNG
bytes). A WARN there is a bug.

---

## Running

```
cd popup-book-film
npm run serve            # = node tools/serve.mjs --port=8080   -> http://127.0.0.1:8080/
node tools/serve.mjs --port=0           # ephemeral port, prints the URL
npm run smoke            # = node tools/smoke.mjs
node tools/smoke.mjs --times=1,8.5,14 --out=/tmp/my-frames --width=1280 --height=720 [--controls]
```

URL parameters of `index.html`: `t=<seconds>` start time, `autoplay=0|1`
(default 1), `controls=0` hides `#ui` (for frame capture), `loop=1`.

**smoke.mjs** starts its own static server on an ephemeral port, launches
Chromium (software WebGL2 via SwiftShader — slow but works), opens
`index.html?autoplay=0&controls=0` (unless `--controls`), awaits
`__film.ready`, and for each time (default `SHOT_TIMES`) calls
`__film.seek(t)`, waits one animation frame and saves `DIR/t-<time>.png`
(default DIR `popup-book-film/.smoke/`, git-ignored). It:

- collects `console.error`, page errors and failed / HTTP ≥ 400 requests, prints
  them and **exits 1** if there were any (console warnings are printed, not fatal);
- prints the average ms per seek+render (GPU work forced to finish);
- checks the spread-anchor contract numerically at several mid-turn and
  flat-open times (uses `__film.debug.book`); mismatches are failures;
- runs the determinism check and prints PASS or WARN with details (on WARN it
  saves `det-a-*.png` / `det-b-*.png` into DIR).

It is safe to run several instances concurrently: give each its own `--out`.
Playwright is preinstalled and resolved through NODE_PATH (CommonJS only), so
`.mjs` tools load it with `createRequire(import.meta.url)('playwright')`. Never
`npm install` playwright or run `playwright install`.

**Look at your frames.** Open the PNGs after every change.

### Vendored three.js

`vendor/three/` holds **three r187 (npm `three@0.187.0`)**: `three.module.js`,
its sibling `three.core.js` (imported by it), and `LICENSE` (MIT). r187 ships no
minified ES-module build on npm, so the unminified files are vendored. The import
map in `index.html` maps the bare specifier `three` to
`./vendor/three/three.module.js`; always `import * as THREE from 'three'`.
Addons (`examples/jsm`) are **not** vendored; if you need one, copy the single
file in from the same npm version and import it relatively.
Public CDNs are blocked in this environment; everything must be local.

Note: r187 removed `PCFSoftShadowMap` (it warns and falls back), so `main.js`
uses `THREE.PCFShadowMap`, which is soft-filtered in this version.

---

## Files and ownership

```
index.html            canvas#film + #overlay(#fade, #captions, #ui), import map
styles.css            page + overlay layout
src/constants.js      world/book geometry constants (pure)
src/util.js           clamp/lerp/easing/envelope/seeded rng (pure, no three)
src/timeline.js       segments, SPREADS text, getFilmState(t) (pure, no three)
src/main.js           renderer, wiring, playback clock, window.__film
src/book.js           the book: six rigid leaves + spread anchors
src/stage.js          desk, backdrop, ALL lights, scene.background/fog
src/camera.js         camera rig (shots)
src/captions.js       ALL DOM film overlays: #fade, title card, captions, end card
src/ui.js             player controls inside #ui
src/audio.js          sound (silent until a user gesture)
src/scenes/index.js   registry: sceneFactories in spread order
src/scenes/{forest,village,sea,mountain,night}.js   one pop-up scene per spread
src/paper.js          (another task) shared cut-paper materials/builders
src/characters.js     (another task) shared fox builder
tools/serve.mjs       static server (importable: startServer({port}))
tools/smoke.mjs       smoke test / frame grabber
```

`src/timeline.js`, `src/util.js` and `src/constants.js` must never import
three.js: Node tools import them directly.

---

## World and book geometry (`src/constants.js`)

- Desk top is the plane **y = 0**. The book **spine lies along world Z at x = 0**,
  centred on z = 0. The viewer/camera is on the **+Z** side looking toward −Z and
  down. Units are arbitrary (1 unit ≈ 7 cm).
- `PAGE_W = 3.0` (x extent of one page), `PAGE_H = 4.0` (z extent),
  `LEAF_T = 0.06` (inner card leaf thickness), `COVER_T = 0.09`,
  `COVER_OVERHANG = 0.1`, `NUM_SPREADS = 5`, `NUM_LEAVES = 6`.
- Leaves are **rigid thick card**: leaf 0 = front cover board, leaves 1–4 = inner
  leaves, leaf 5 = back cover board, which never moves and lies on the desk at
  x ∈ [0, PAGE_W]. Cover boards are `PAGE_W + COVER_OVERHANG` wide and
  `PAGE_H + 2·COVER_OVERHANG` deep.
- `leafTurn[j]` ∈ [0,1] for j = 0..4: 0 = lying on the right stack, 1 = turned
  over onto the left stack. A leaf rotates about the spine (world Z axis) by
  **+π·leafTurn[j]**, i.e. counter-clockwise seen from +Z: it lifts from +x, goes
  up, and lands on −x. `leafTurn[5] ≡ 0`.
- Closed book = all turns 0: the book occupies x ∈ [0, PAGE_W] with the front
  cover on top.
- **Spread k** (k = 0..4): its LEFT page is the **back face of leaf k**, its RIGHT
  page is the **front face of leaf k+1**.
  `spreadOpen[k] = clamp01(leafTurn[k] − leafTurn[k+1])`; the dihedral angle
  between the two pages is **θ = π·spreadOpen[k]**.
- Stacking at rest (no interpenetration): back cover slab y ∈ [0, COVER_T];
  unturned inner leaf j has its bottom at `COVER_T + (4−j)·LEAF_T`; the closed
  front cover sits on top of them (bottom at 0.33); the turned front cover lies at
  y ∈ [0, COVER_T] on the left; turned inner leaf j has its bottom at
  `COVER_T + (j−1)·LEAF_T`.
- **How the pivot height is interpolated:** all leaves rotate about one fixed
  hinge line (x = 0, y = `HINGE_Y` = 0.21, parallel to Z). Each leaf's slab sits
  at a fixed offset `leafOffset(j)` from the hinge along the leaf's own local +Y
  (0.12, 0.06, 0, −0.06, −0.12, −0.21 for j = 0..5). That one rigid hinge
  reproduces both rest stackings exactly, so the leaf's bottom/spine edge moves
  smoothly from (0, bottomUnturned) to (0, bottomTurned + T) as it turns, and the
  whole stack swings like a bound book (no leaves passing through each other, even
  during bookClose when all five turn together). Mid-turn, a leaf's spine edge is
  up to 0.12 off x = 0; at rest it is exactly on it.
- Helpers in `constants.js`: `leafThickness(j)`, `leafWidth(j)`, `leafDepth(j)`,
  `leafBottomUnturned(j)`, `leafBottomTurned(j)`, `HINGE_Y`, `leafOffset(j)`.
- Resulting page-surface heights when a spread lies flat open: the left page
  surface and the right page surface differ in height by the leaf stacks (e.g.
  spread 0: left 0.09, right 0.33). Scenery is attached to anchors, so this never
  matters to scenes.

## Spread anchors (the most important contract)

`book.getSpreadAnchors(k)` returns `{ left, right, center }`, three
`THREE.Object3D`s that pop-up scenery gets parented to. All three use the
**spread frame**:

- origin on the spine line at the middle of the page height, on the page surface;
- **+X to the right** (right page spans x ∈ [0, PAGE_W], left page x ∈ [−PAGE_W, 0]);
- **+Y out of the page** (up when the spread lies flat open);
- **+Z toward the viewer** (page spans z ∈ [−PAGE_H/2, PAGE_H/2]; the **top of the
  page is −Z**).

Details:

- `left` is rigidly attached to the left page (it rides leaf k when that leaf
  rotates). When the spread lies flat open its world orientation equals the world
  axes.
- `right` is rigidly attached to the right page (leaf k+1), same rule.
- `center` sits on the spine and is oriented along the bisector of the two pages:
  its +Y bisects the dihedral angle, its +Z runs along the spine toward the
  viewer. **In the center frame the right page extends from the spine along
  `(sin(θ/2), cos(θ/2), 0)` and the left page along `(−sin(θ/2), cos(θ/2), 0)`.**
  Its origin is midway between the two page surfaces at the spine. Use it for
  V-folds, parallel folds and anything that must follow both pages (compute the
  fold geometry from `spread.theta`).
- When a spread is closed (θ = 0), left and right pages face each other; anything
  standing on them must have folded flat by then (drive the fold from
  `spread.open`/`spread.theta`). `main.js` hides a scene's groups entirely when
  `open ≤ 0.001`.

`smoke.mjs` verifies these numerically every run.

---

## Film state (`src/timeline.js`, pure, no three)

Exports `FPS = 30`, `DURATION = 80`, `FILM_TITLE = 'The Fox and the Paper Moon'`,
`FILM_SUBTITLE = 'a pop-up film'`, `SPREADS`, `SEGMENTS`, `SHOT_TIMES`,
`segmentAt(t)`, `getFilmState(t)`.

Segments (seconds; one editable table `SEGMENT_TABLE` of durations at the top of
the file — starts accumulate):

| segment | time |
|---|---|
| `intro` | 0 – 7 |
| `coverOpen` | 7 – 10.5 |
| `spread` 0 | 10.5 – 19.5 |
| `turn` 0→1 | 19.5 – 22.5 |
| `spread` 1 | 22.5 – 31.5 |
| `turn` 1→2 | 31.5 – 34.5 |
| `spread` 2 | 34.5 – 43.5 |
| `turn` 2→3 | 43.5 – 46.5 |
| `spread` 3 | 46.5 – 55.5 |
| `turn` 3→4 | 55.5 – 58.5 |
| `spread` 4 | 58.5 – 69.5 |
| `bookClose` | 69.5 – 73.5 |
| `outro` | 73.5 – 80 |

`SEGMENTS` entries: `{ name, index, to?, start, end, order }` (frozen).

`getFilmState(t)` returns (t clamped to [0, DURATION]):

```
{ t, duration,
  segment: { name, index, start, end, to? },
        // index = spread index for 'spread'; for 'turn' the FROM spread (and `to`);
        // -1 for intro / coverOpen / bookClose / outro
  segT,                 // linear 0..1 progress through the segment
  leafTurn: number[5],  // eased (easeInOutCubic over the segment). coverOpen turns leaf 0;
                        // turn k->k+1 turns leaf k+1; bookClose moves ALL five leaves 1->0 together
  spreadOpen: number[5],// clamp01(leafTurn[k] - leafTurn[k+1]), leafTurn[5] = 0
  activeSpread,         // spread with the largest open (> 0.001; ties -> lower index), -1 while shut
  spreadTime: number[5],// seconds since spread k first started opening (0 before); keeps growing.
                        // spread 0 starts opening at 7 (coverOpen), spread k at the start of turn k-1->k
  fade,                 // black overlay opacity: 1->0 over t 0-2, 0->1 over t 77-80
  titleCard,            // opening title opacity: in 1-2, hold, out 5-6
  endCard,              // "The End" opacity: in 74-75.5, hold to the end
  night,                // 0 until the turn into spread 4, ramps 0->1 over 55.5-58.5, stays 1
  glow }                // lantern lit: 0 until 61.5, ramps 0->1 over 61.5-64, stays 1
```

`fade`, `titleCard`, `endCard`, `night` and `glow` ramps use smoothstep edges.
`SPREADS[k] = { id, title, caption }`:

| k | id | title | caption |
|---|---|---|---|
| 0 | `forest` | The Paper Forest | Deep in a paper forest, a small fox found a lantern with no light. |
| 1 | `village` | The Sleeping Village | She asked the sleeping village. Nobody had a spark to spare. |
| 2 | `sea` | The Folded Sea | So she folded a boat, and sailed to where the lighthouse blinked. |
| 3 | `mountain` | The Last Mountain | Up the last cold mountain, the moon hung close enough to touch. |
| 4 | `night` | Home | She carried a sliver of moonlight home, and the whole forest glowed. |

`SHOT_TIMES` (16 representative times, every segment incl. mid-turns):
1, 4, 8.75, 14.5, 21, 26.5, 32.4, 38.5, 45.6, 50.5, 57, 60.5, 66.5, 71.5, 75.5, 79.5.

`src/util.js` (pure): `clamp, clamp01, lerp, ramp(x,a,b), smoothstep(a,b,x),
easeInOutCubic, easeOutCubic, easeInCubic, envelope(x, inStart, inEnd, outStart?,
outEnd?), rng(seed) -> () => [0,1), hash01(n|string), wobble(t, freq, phase)`.

---

## Module APIs

three is imported via the import map as `'three'`.

```
ctx = { renderer, scene, canvas, overlay /* #overlay element */, params /* URLSearchParams */ }

stage.js     export function createStage(ctx)        -> { group, update(state) }
             // desk, backdrop, ALL lights; may set scene.background / fog
book.js      export function createBook(ctx)         -> { group, update(state), getSpreadAnchors(k) }
camera.js    export function createCameraRig(ctx)    -> { camera /* PerspectiveCamera */, update(state), resize(aspect) }
captions.js  export function createCaptions(ctx)     -> { update(state) }
             // owns ALL DOM film overlays: #fade, title card, captions, end card
ui.js        export function createUI(ctx, film)     -> { update(state) }   // player controls inside #ui
audio.js     export function createAudio(ctx, film)  -> { update(state), setMuted(bool), get muted }
             // must do nothing audible until a user gesture
scenes/*.js  export function createScene(ctx)        -> { left, right, center /* THREE.Group each */, update(state, spread) }
             // spread = { index, open /* 0..1 */, theta /* π·open */, time /* state.spreadTime[index] */ }
scenes/index.js  export const sceneFactories = [forest, village, sea, mountain, night]  // createScene fns, in order
```

`main.js` parents each scene's `left/right/center` groups to the matching
anchors, and every frame sets the three groups' `visible = open > 0.001` and only
calls `scene.update` when visible.

### main.js

- Renderer: antialias, shadow maps on (`PCFShadowMap`, see the r187 note), sRGB
  output, ACES filmic tone mapping, pixel ratio `min(devicePixelRatio, 2)`,
  resize handling → `cameraRig.resize(aspect)`.
- Frame update order: `state = getFilmState(t)` → stage → book → scenes →
  cameraRig → captions → ui → audio → `renderer.render(scene, cameraRig.camera)`.
- Film controller on `window.__film`: `ready` (Promise, resolves after the first
  rendered frame), `duration`, `fps`, `time` (getter), `playing` (getter),
  `play()`, `pause()`, `toggle()`, `seek(t)` (sets time, updates every module and
  renders synchronously), `getState()`, `on(event, fn)` / `off(event, fn)` for
  `'play' | 'pause' | 'seek' | 'end'`.
  Also `__film.debug = { THREE, renderer, scene, book, stage, scenes, cameraRig }`
  for tools and debugging (not for film code).
- Playback: requestAnimationFrame; time advances by real dt (clamped to 0.1 s)
  while playing, stops at DURATION and emits `end` (then `pause`). `loop=1` wraps
  to 0 instead. While paused nothing re-renders except on seek/resize.
- Module errors are not swallowed: they reach the console (and fail the smoke
  test).

### index.html

Full-viewport `<canvas id="film">`, then `<div id="overlay">` containing
`<div id="fade">`, `<div id="captions">`, `<div id="ui">`. `#overlay` has
`pointer-events: none`; `#ui` re-enables them. Dark page background, no
scrollbars, works at phone widths (the camera backs off for narrow aspects).

---

## Story and art direction

> **Story and art direction.** A small paper fox finds an unlit lantern and travels through five spreads to fetch a sliver of moonlight. Everything is made of cut paper: flat coloured card cut-outs with visible off-white cut edges and a little thickness, standing on cream card pages, layered in depth, casting soft shadows on each other. No glossy or realistic materials. Warm key light from the upper left, cool soft fill. Palette is limited and harmonised per spread: forest = deep greens and teal with the orange fox; village = dusty blues, terracotta, mustard windows; sea = teals, navy, white foam, a red-and-white lighthouse; mountain = lavender, slate, snow white, a pale moon; night = indigo, gold stars, warm lantern glow (stage lights dim with `state.night`, lantern lights with `state.glow`). The fox appears in every spread and must look the same each time (shared builder in `src/characters.js`). Shots are slow and deliberate: push-ins and gentle arcs, wider during page turns so the fold and unfold of the pop-ups reads clearly.

---

## Practical notes for scene authors

- Build everything in `createScene`; in `update` only set transforms, opacities
  and light intensities from `state` / `spread`.
- Pop-ups on a single page: hinge them at their base and stand them up with
  `spread.open` (lying flat toward the page top, −Z, or along ±X when closed).
  Pieces spanning the gutter: put them in `center` and derive their fold from
  `spread.theta` so they collapse flat as the spread closes.
- Keep scenery inside the page rectangle (|z| ≤ 2, |x| ≤ 3) and low enough that
  a closing spread does not push it through the facing page.
- Enable `castShadow` / `receiveShadow` on card meshes; the stage's key light
  casts shadows over roughly x, z ∈ [−6, 6].
- Lights in scenes (e.g. the lantern) are fine; drive their intensity from
  `state.glow` / `state.night`. All other lights belong to `stage.js`.
