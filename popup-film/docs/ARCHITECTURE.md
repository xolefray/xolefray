# The Little Paper Boat: architecture (as built)

This document describes how the film actually works: its conventions, contracts and rules.
The JSDoc header at the top of each source file is the authoritative reference for that module.
This page connects those headers into one picture. For an overview and instructions on running
the film, see the [README](../README.md).

- [1. Shape of the program](#1-shape-of-the-program)
- [2. World conventions](#2-world-conventions)
- [3. The spread frame](#3-the-spread-frame)
- [4. Page-art orientation](#4-page-art-orientation)
- [5. Master schedule](#5-master-schedule)
- [6. Module APIs](#6-module-apis)
- [7. Folding rules](#7-folding-rules)
- [8. The boat's journey](#8-the-boats-journey)
- [9. Determinism and seekability](#9-determinism-and-seekability)
- [10. Performance budget](#10-performance-budget)
- [11. Adding or replacing a spread](#11-adding-or-replacing-a-spread)
- [12. Verification](#12-verification)

## 1. Shape of the program

The film is a static site with ES modules and an import map (`three` → `vendor/three.module.js`,
`three/addons/` → `vendor/addons/`). It has no build step and makes no network requests beyond
its own files.

```
index.html ── #stage (WebGL canvas) · #overlay (titles) · #ui (controls) · #intro (title / poster card)
   └─ src/main.js ─┬─ timeline.js   schedule, easing, leafAngles(t), Player
                   ├─ environment.js desk, room, lamp + light schedule, dust      ← update(t)
                   ├─ book.js        hinged leaves, cover, page art, 4 anchors   ← setLeafAngles(φ), update(t)
                   │    └─ anchor k ─ spreads/<id>.js group (built with paper.js + popup.js) ← update(α, t, local)
                   ├─ camera.js      rig                                          ← update(t)
                   ├─ titles.js      DOM captions                                 ← update(t)
                   ├─ audio.js       WebAudio score                               ← sync(t, playing)
                   └─ ui.js          controls (acts on the Player, never on the scene)
```

**Boot** happens while the intro card reads "folding paper…". main.js creates the renderer
(antialias, pixel ratio min(dpr, 2), ACESFilmic, sRGB output, PCF-soft shadows) and a 35° camera.
It then builds the environment, the book and the four spreads. Spread *k* is built with
`makeRng(1000 + k)`, its group is mounted on `book.getSpreadAnchor(k)`, and its art goes to
`book.setPageArt(k, …)`. After that come titles, audio and the camera rig. A **warm-up pass**
renders ten key moments (0.5, the middle of every leaf turn and of every open spread, and 95 s)
at 320 × 180 behind the card, so every shader variant is compiled and every texture uploaded
before the first page turn. The pass is skipped for still frames (`ui=0` + `t` without `play`).

**Each frame** runs this sequence:

```
t      = player.time
φ[0..4] = leafAngles(t)                 → book.setLeafAngles(φ)
for k in 1..4:  α = φ[k−1] − φ[k];  group.visible = α > 0.002;  if visible: spread.update(α, t, t − start)
camera.update(t) · environment.update(t) · book.update(t) · titles.update(t) · audio.sync(t, playing) · render
```

The scene is re-posed and re-rendered only when `t` changes or something asks for a redraw
(seek, resize, orbit camera), so a paused film costs nothing. Every module call is guarded. A
module that throws is logged once and the film carries on: a spread that fails to build or
update is hidden, and a missing titles, audio or camera module is replaced by a no-op or a fixed
fallback.

**Intro states** (`#intro[data-state]`): `loading` → `poster` → `leaving` → `gone`, or `error`.
With no URL parameters the poster shows t = 20 s behind the card, and **Begin** (a user
gesture) starts the audio and plays from 0.

## 2. World conventions

- 1 unit ≈ 10 cm. +Y is up. The desk top is at y = 0. The reader and the camera are on the +Z side.
- Book (`BOOK` in book.js): `PAGE_W = 3` (gutter to outer edge, along X), `PAGE_D = 4` (along Z),
  `BOARD_T = 0.035`, `LEAVES = 5`. Leaf 0 is the front cover (0.045 thick), leaves 1–3 are printed
  boards, and leaf 4 is the back cover, which never moves.
- Leaf angle φ ∈ [0, π] is a rotation about +Z. At φ = 0 the leaf lies on the right
  (x ∈ [0, 3]); at φ = π it has turned over to the left. The closed book sits on x ∈ [0, 3].
- Spread *k* (1–4) lies between leaf *k−1* (its **left** page is that leaf's back face) and
  leaf *k* (its **right** page is that leaf's front face). Its opening angle is
  α<sub>k</sub> = φ<sub>k−1</sub> − φ<sub>k</sub> ∈ [0, π], where 0 is closed and π is flat open.
- When a spread is open, its frame sits at the height of the page stack under it: y ≈ 0.15 for
  the forest and the sky, and ≈ 0.115 for the sea and the city (camera.js `PAGE_Y`). The heights
  differ because the two piles have different thicknesses. The thinner pile floats slightly
  (≤ 3 · BOARD_T), and from spread 3 on the book rests on its left pile.

## 3. The spread frame

`book.getSpreadAnchor(k)` returns an `Object3D` that the book re-poses whenever the leaf angles
change. Everything a spread builds lives in this frame and is driven only by α and t.

```
  cross-section, looking along −Z (the reader is behind you):

                 +Y  (normal of the right page = the side pop-ups stand on)
                  ▲      L(α) = (cos α, sin α, 0)
                  │     ╱
                  │    ╱  left page (back face of leaf k−1)
                  │   ╱
                  │  ╱ α
                  │ ╱  )
  ════════════════●══════════════════════▶ +X
               gutter        right page: y = 0, x ∈ [0, 3], z ∈ [−2, 2]
            (the Z axis,        (front face of leaf k; never moves in this frame)
          +Z toward the reader)
```

- The origin is on the gutter, at the middle of the page (z = 0), on the printed surface of the
  right page.
- +X runs along the right page, away from the gutter. +Y is the right page's normal. +Z runs
  along the gutter toward the reader.
- The left page is the half-plane through the Z axis in direction L(α). Its printed normal is
  N(α) = (sin α, −cos α, 0). At α = π it is x ∈ [−3, 0], y = 0, printed side up. "Open-flat"
  coordinates fold rigidly with the left page: they are rotated about +Z by α − π.
- The **bisector** is the plane through the gutter at angle α/2, u(α) = (cos α/2, sin α/2, 0).
  Rule R2 keeps each piece on its own side of it.
- Board thickness is ignored inside the frame. The book's hinge chain guarantees that both
  printed surfaces leave the same gutter line at every angle, during turns too.

## 4. Page-art orientation

Each spread supplies two 768 × 1024 canvases (aspect 3 : 4 = PAGE_W : PAGE_D). Seen from above
by the reader with the book open flat:

```
                         far edge  (z = −2)   = top of both canvases
          ┌─────────────────────────┬─────────────────────────┐
          │       leftArt           │        rightArt         │
          │  u = 0 ──────────▶ u = 1│u = 0 ──────────▶ u = 1  │
          │  (outer edge)  (gutter) │(gutter)   (outer edge)  │
          │                         │                         │
          │  x = −3 … 0             │  x = 0 … 3              │
          └─────────────────────────┴─────────────────────────┘
                         near edge (z = +2)   = bottom of both canvases
                                     ▲ reader
```

If you place the two canvases side by side, you see the whole spread as the reader does. A
painter can draw one panorama and split it, as the city and the sky do. book.js maps the art
with explicit UVs (front faces u = x/W, back faces u = 1 − x/W, v = 1 at the far edge) and its
page shader darkens a soft strip along the gutter. The art itself carries no gutter shading.

## 5. Master schedule

[`timeline.js`](../src/timeline.js) is the source of the structural times: `DURATION = 96`,
`LEAF_TURNS`, `SPREADS` and `CHAPTERS`. Each leaf turns φ 0 → π over 3 s, eased with
`ease.inOutCubic`.

| Film time | Leaf turn / spread | Light (environment.js) | Text (titles.js) |
|---|---|---|---|
| 0 – 7 | closed book; the camera approaches | lamp ignites 0.3–2.8 (flash, dip, flutter, amber → warm) | title card 1.2–6.0 |
| 7 – 10 | **leaf 0** (cover) turns; spread 1 rises | day | chapter label I 9.5–13 |
| 10 – 28 | spread 1 **forest** open | day | captions 11–15.5, 16–20.5, 21–26.5 |
| 28 – 31 | **leaf 1** turns: forest folds, sea rises | day | chapter label II 30.5–34 |
| 31 – 49 | spread 2 **sea** open | day | captions 32–36.5, 37–41.5, 42–47.5 |
| 49 – 52 | **leaf 2** turns | → night: lamp 0.35, cone 0.82 → 0.45 rad, teal moonlight fill | chapter label III 51.5–55 |
| 52 – 70 | spread 3 **city** open | night | captions 53–57.5, 58–62.5, 63–68.5 |
| 70 – 73 | **leaf 3** turns | → dawn: lamp 1.1, warm-pink low light from the right | chapter label IV 72.5–76 |
| 73 – 89 | spread 4 **sky** open (never closes) | dawn | captions 74–78.5, 79–83.5, 84–88.5 |
| 89 – 96 | epilogue | lamp fades 89–95.5 | "The End" 89.5–96; fade to black 93.5–96 |

Chapter labels appear 0.5 s before the end of the turn that opens a spread and last 3.5 s.
Captions fade in and out over 0.6 s. The score follows the same grid: forest section from 10,
sea from 31, city from 52, sky from 71, a glissando at each turn, and silence by 95.5.

> The light, title and audio times are written as literals in their own modules
> (environment.js, book.js `lampLevel`, titles.js, audio.js, sky.js), not derived from
> timeline.js. If you move a turn, update them too (§11).

## 6. Module APIs

These are the APIs as implemented. Signatures are abridged; each file's header has the details.

**`src/util/rng.js`**: `mulberry32(seed) → () => [0,1)` and
`makeRng(seed) → { next, range(a,b), int(a,b), pick(arr), chance(p) }`.

**`src/timeline.js`**: `DURATION`, `LEAF_TURNS`, `SPREADS` (`{k, id, title, start, end}`),
`CHAPTERS` (`{t, label}`), `clamp`, `lerp`, `seg(t,a,b)`, `smoothstep(a,b,x)`, `ease.{linear,
inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic, inOutSine, outBack}`,
`leafAngles(t) → [φ0..φ4]`, `spreadAlpha(k, φ)`, and
`class Player { play, pause, toggle, seek, time, playing, rate, onEnd, duration }`. Player is a
wall-clock player clamped to [0, duration]; it pauses and fires `onEnd` at the end.

**`src/paper.js`**: the paper look. Everything here is deterministic and allocates nothing per
frame.
- `PAPER`, `PALETTES.{forest,sea,city,sky}` (hex colour strings).
- `makeCanvas(w,h)`, `addGrain(ctx,w,h,{amount,seed,mottle})`,
  `dieCut(canvas,{margin,color,edge}) → new canvas`.
- `paint(w,h,draw,{grain,dieCut,seed}) → canvas`: the usual pipeline (draw → die-cut → grain over
  art and border).
- `page(draw,{seed,tint}) → 768×1024 page canvas`.
- `texture(canvas)` (sRGB, anisotropy 8, mipmaps); `cutoutTexture(canvas)`, a snapshot whose
  transparent texels carry the nearest opaque colour, so cut edges show no dark fringe.
- `paperMaterial({color,map,roughness,…})`: a MeshStandardMaterial. It is shared per colour when
  it has no map, so clone it before mutating.
- `card({canvas,width,height,back,anchor,alphaTest}) → Group`: printed face toward +Z, a plain
  back with the same silhouette, `userData = {front, back, texture}`.
- `splitCard({canvas,width,height,back}) → {left, right}`, made for a vFold's two mounts.
- `boat({color,scale})`: origin at the waterline, bow +X, 0.6 long.
- `crane({color,scale})` with `userData.setFlap(v ∈ [−1,1])`.

**`src/popup.js`**: mechanisms in the spread frame. It creates no meshes. Every factory returns
`{ object, update(α), …mounts }`, poses are pure in α, and the shared temporaries mean nothing
allocates. Mount axes are +X = reader's right, +Y = up along the piece, +Z = the printed face.
- `vFold({z0, gamma, width, height, page}) → {object, left, right, update}`.
  Crease c(α) = normalize(d<sub>L</sub> × d<sub>R</sub>) in closed form:
  c = (|cos γ| cos(α/2), |cos γ| sin(α/2), −sgn(cos γ) sin γ cos(α/2)) / √(cos²γ + sin²γ cos²(α/2)).
  γ < π/2 is a valley (it falls back toward −Z when closing) and γ > π/2 is a mountain (it falls
  forward toward +Z). γ ≈ π/2 throws.
- `standUp({side, x, z, fold:'back'|'front', width, height, page}) → {object, mount, update}`.
  It is hinged perpendicular to the gutter and its stand angle is α/2.
- `onPage({side, x, z, lift})`: a surface mount that follows its page.
- `slider({side:'left'|'right'|'spread', path, lift, smooth, u}) → {…, setU(u), update(α, u?), length}`:
  a pull-tab on a centripetal Catmull-Rom path, parametrised by arc length.
- `floatingLayer({z, width, height, depth, page}) → {object, frame, left, right, supports, page, add(...mechs), update}`:
  a parallelogram-wall platform. Its `frame` is a nestable sub-spread.
- `vFoldLimits(…) → {maxHeight, maxHalfWidth, fits}` and
  `standUpLimits(…) → {maxHeight, maxHeightLoose, maxWidth}` are size budgets (R1/R2).
- `rise(α, a0=0.15, a1=0.95)` is a smoothstep of α/π. Use it to shrink or fade props before the
  pages close. `collection(mechs)` groups mechanisms.

**`src/book.js`**: `BOOK` and `createBook({title, coverColor}) → { group, setLeafAngles(φ[5]),
getSpreadAnchor(k), setPageArt(k, {left, right}), update(t) }`. `update(t)` follows the lamp
level with the foil's private reflections. Hinge chain: leaf *i*'s front gutter edge is
Q[i] = Q[i+1] + t<sub>i</sub>·n(φ<sub>i</sub>) with n(φ) = (−sin φ, cos φ), and Q[5] is the back
cover's outer gutter edge. Anchor *k* sits on Q[k], rotated by φ<sub>k</sub>. After that the
whole chain is lifted so its lowest corner touches y = 0.

**`src/environment.js`**: `createEnvironment({scene, renderer}) → { update(t), keyLight }`. It
holds a SpotLight lamp at (−5, 9, 1.5) aimed at (0.3, 0.4, −0.3), the only shadow caster
(2048², focus-fitted frustum); a hemisphere fill; a front-right directional fill; and a low
"dawn" directional. Lights are never added or removed, only re-levelled. The room shader,
the fog and the desk-edge fade share one horizon colour, so no horizon line ever shows.
Dust motes (320 points) drift in the vertex shader as a function of t.

**`src/camera.js`**: `createCameraRig(camera) → { update(t) }` and `subjectPosition(t, out)` (the
boat or crane's world position). `SHOTS` holds 36 keys of the form
`key(t, pos, tgt, {fov, shake, band, hold, on})`. Each of 9 channels is a cubic Hermite spline
with Fritsch–Butland tangents, so it is C1 and never overshoots. A key with `on: '<spread>'` is
an offset from the boat path, with the target aimed 0.45 s ahead. Between follow keys the camera
tracks the boat exactly, and transitions blend in and out with a smoothstep. Handheld drift and
lens breathing are deterministic sines. Below aspect 1.5 the rig widens the fov (up to 62°) and
dollies back, and `band` places the composition vertically.

**`src/titles.js`**: `CAPTIONS` (`{start, end, text, kind: 'title'|'subtitle'|'caption'|'end'}`)
and `createTitles(container) → { update(t) }`. It is DOM over the canvas, with its own CSS
(`tt-` classes). Layers, bottom to top: veil < caption scrim < title card / chapter label /
captions < "The End". Setting `--tt-caption-bottom` lifts the captions above a control bar.

**`src/audio.js`**: `createAudio() → { start() /* async, needs a gesture */, sync(t, playing),
setMuted(b), muted }` and `renderOffline(fromT, toT, sampleRate, {layers})` for tests. Graph:
voices → lanes (pan + reverb send) → session envelope → session out → master (mute) →
high-pass → compressor → trim → destination. Every method is a silent no-op without WebAudio.

**`src/ui.js`**: `MUTE_KEY`, `formatTime(t)`, and `createUI({root, surface, player, audio,
chapters, duration, onSeek, onGesture, hidden}) → { update(t, playing), wake() }`. It publishes
`--ui-safe-bottom` on `<html>`. With `hidden` it renders nothing but keeps the keyboard
shortcuts.

**`src/spreads/<id>.js`**:

```js
export default {
  id: 'sea', title: 'The Folded Sea',
  build({ THREE, paper, popup, rng, BOOK }) {
    return { group, leftArt, rightArt, update(alpha, t, local) };   // local = t − spread.start
  },
};
```

`group` is in spread-frame coordinates. main.js calls `update` only while α > 0.002. Spreads may
return extra fields; `sky` returns `focus`, which main.js ignores. `spreads/index.js` exports
`SPREAD_MODULES = [forest, sea, city, sky]`, where index k − 1 is spread k.

**Page hooks** (main.js): `window.__film = { seek(t), play(), pause(), time, playing, duration }`
and `window.__ready`.

## 7. Folding rules

Paper here has zero thickness. These three rules from popup.js guarantee that nothing ever
pierces a page or another piece, and that the book closes flat:

| Rule | Statement | How it is met |
|---|---|---|
| **R1** Closed fit | At α = 0 every piece lies flat and its closed footprint is inside the page rectangle. | `vFoldLimits`, `standUpLimits`, and for floating layers width/2 + height ≤ 3 and \|z\| + depth/2 ≤ 2 |
| **R2** Own half | A piece that stays between its page and the bisector plane never touches the other page or anything on it. | automatic for vFold halves, floatingLayer (and pieces nested on it that obey R2 there), slider and onPage; a standUp needs height ≤ x − width/2 |
| **R3** Disjoint footprints | The shadow of a mechanism on its own page, at any α, lies inside its closed footprint. | keep closed footprints of different mechanisms on the same page from overlapping |

Thick props (the boat, glows, the city's lanterns, gulls) are outside the guarantee. They shrink,
sink or fade with `popup.rise(α)` before the pages could reach them.

The spreads add one pattern of their own. All V-folds in a spread share **one mountain γ**
(forest 1.9, sea 1.8, city 1.95, sky 2.0). The crease direction and glue lines depend only on γ
and α, so same-side halves are parallel planes at every angle. They nest as the page closes even
where their closed footprints overlap, which is an allowed exception to R3. The forest, sea and
city dev pages run collision sweeps (see §12).

## 8. The boat's journey

These are shared waypoints in spread-frame coordinates (x, y, z), where y is the waterline above
the page. Each spread animates its boat through them (±0.15), and camera.js `JOURNEY` keeps its
own copy for the follow shots. Change both together.

| Spread | Waypoints (position @ film seconds) |
|---|---|
| Forest | Folds into existence from a flat square at (−1.9, 0, −1.2) during 15.5–18 and bobs 18–20.5, then sails (−1.9, 0, −1.2)@20.5 → (−1.0, 0, −0.6)@22 → (−0.2, 0, 0.1)@23.5 → (0.8, 0, 0.5)@25 → (1.7, 0, 1.0)@26.5 → (2.3, 0, 1.5)@27.5, and drifts to the corner and shrinks away by 28.6. |
| Sea | (−2.3, 0.15, 0.6)@31 → (−1.2, 0.15, 0.5)@35 → (0.0, 0.2, 0.7)@39 → (1.0, 0.5, 0.4)@44 (on the big wave, 42–46) → (2.1, 0.15, 0.8)@48.5 |
| City | (−2.4, 0, 1.1)@52 → (−1.3, 0, 0.8)@56 → (−0.6, 0, 0.4)@60; waits 60–65 while the light of the quiet window at (−1.0, 1.1, −0.5) floats down into it (63–66); → (0.6, 0, 0.2)@67 → under the bridge (1.3, 0, 0.15)@68.5 → (2.2, 0, 0.3)@70 |
| Sky | Rests on its cloud at (−1.7, 0.55, 0.7) 73–75.5, unfolds into a flat square (75.6–77), refolds into a crane (77–78.5), then flies (−1.7, 0.8, 0.7)@78.5 → (−0.6, 1.5, 0.2)@81 → (0.6, 2.2, −0.5)@83.5 → (1.4, 2.8, 0.2)@86 → (1.2, 3.4, 1.0)@89 → (0.6, 5.5, 2.2)@**93.4**, and keeps climbing out of frame. |

The curves are C1 Hermite/Catmull-Rom curves through the waypoints, with the heading along the
tangent plus a gentle bob and roll. `subjectPosition()` switches from one spread's path to the
next halfway through each turn (29.5, 50.5, 71.5).

## 9. Determinism and seekability

Every frame of the film is a **pure function of film time t**, so scrubbing works in both
directions and a seek renders exactly what playing up to that time would. Concretely:

- **No runtime randomness.** `Math.random()` is never used. Randomness comes from seeded
  generators at build time: spread *k* uses `makeRng(1000 + k)`, the audio event list uses
  `makeRng(20261110)`, the dust uses `makeRng(4242)`, and painters seed `mulberry32` themselves.
- **No accumulated state.** `spread.update(α, t, local)`, `camera.update(t)`,
  `environment.update(t)`, `book.update(t)` and `titles.update(t)` are pure. Time-driven
  sub-motions (the fox's head, the bobbing, the window lighting order, the crane's flaps) are
  computed from t, never integrated. Dust drifts in the vertex shader from a `t` uniform.
- **Titles** use no CSS transitions and no timers. Every opacity and drift is computed from t,
  and the DOM is written only when a rounded value changes.
- **Audio** is one precompiled, sorted event list in film seconds. The `sync(t, playing)`
  scheduler treats |t − expected| > 0.3 s as a seek. A seek, a pause or a hidden tab fades the
  current session out over 60 ms. Playback resumes with a fresh session at t once playback has
  been steady for 0.08 s: bells that began before t are skipped, and pads and beds restart
  midway.
- **No per-frame allocation** in the modules (shared temporaries, preallocated arrays). The one
  exception is the 5-element array that `leafAngles` returns.
- The only wall-clock code is `Player`, plus the UI's idle timer, the tab-visibility pause and
  the intro animation.

`tools/contact-sheet.mjs` depends on this: it loads the film once and calls `__film.seek(t)` for
each frame.

## 10. Performance budget

Budget per spread: about 70 meshes or fewer, textures ≤ 1024 px, at most 2 extra lights (never
shadow-casting), no per-frame allocation, and no `Math.random`. Measured from the as-built
spreads:

| Spread | Meshes | Other draw objects | Own lights | Texture maps |
|---|---|---|---|---|
| forest | 50 | 1 Points (fireflies) | 0 | 23 |
| sea | 61 | 1 sprite | 1 PointLight (lighthouse) | 29 |
| city | 30 (incl. 1 InstancedMesh of 16 lanterns) | 1 line set | 2 PointLights (garland, quiet light) | 18 |
| sky | 48 | 1 sprite, 3 line sets, 1 Points | 0 | 21 |

Scene-wide figures:

- One shadow-casting light (2048² PCF soft) and four environment lights that are always
  present. Only spreads with α > 0.002 are updated and drawn, which means at most two at once,
  during a turn.
- Measured WebGL draw calls per rendered frame, including the shadow pass (SwiftShader, 640 × 360):
  **51** at 0:03, **122** at 0:20, **168** at 0:40, **104** at 1:00, **139** at 1:25, **136** at 1:34.
- Pixel ratio is capped at 2. A paused film renders nothing.
- The spreads' point lights live inside groups whose visibility toggles, so the number of
  visible lights changes at page turns, and three.js compiles a new program variant for each
  light count. The warm-up pass (§1) renders every combination behind the intro card, so those
  compiles never stall playback.

## 11. Adding or replacing a spread

**Replacing a spread** (same four-page structure):

1. Write `src/spreads/<id>.js` with a default export `{ id, title, build }` as in §6. Paint the
   two pages with `paper.page()` in the orientation of §4. Build the pop-ups from `popup.js`
   mechanisms, size them with `vFoldLimits` / `standUpLimits`, and follow R1–R3. Give all your
   V-folds one γ. Hang art on the mounts with `paper.card` / `paper.splitCard`.
2. Keep `update(alpha, t, local)` pure, with no allocation and no `Math.random`. Use the `rng`
   you are given at build time. Shrink thick props with `popup.rise(alpha)`. Use at most 2 lights
   of your own, without shadows.
3. Put it in `SPREAD_MODULES` (src/spreads/index.js) at position k − 1. Update its `id` and
   `title` in timeline.js `SPREADS` and the label in `CHAPTERS`.
4. Keep the boat's journey in sync: your waypoints, camera.js `JOURNEY` (and `PAGE_Y`, and the
   camera `SHOTS` for that stretch), and the captions in titles.js `CAPTIONS`. The music section
   for that stretch lives in audio.js `SECTIONS`.
5. Copy one of the `dev/spread-*.html` harnesses. It shows the spread alone under the real
   environment with `alpha`, `t` and `view` parameters. Add a collision sweep like
   `spread-sea.html?check=1`.
6. Check it with `node tools/snap.mjs --out /tmp/shots --page dev/spread-<id>.html --query "alpha=0.3"`
   for α/π ∈ {0.1, 0.3, 0.6, 1}, then the film itself with `--times`.

**Adding a fifth spread** additionally needs a sixth leaf:

- book.js: `BOOK.LEAVES`, the `THICK` array, and the cover/back-cover special cases.
- timeline.js: the fixed 5-element array in `leafAngles`, `LEAF_TURNS`, `SPREADS`, `CHAPTERS`,
  and probably `DURATION`.
- Every literal time downstream: the light schedule in environment.js and book.js `lampLevel`,
  the captions and `FADE_TO_BLACK` in titles.js, the score and foley in audio.js (`SECTIONS`,
  `CUES`, `BEDS`, `RUSTLES`, the final fade), the camera's `SHOTS`, `JOURNEY` and
  `SUBJECT_SWITCH`, and the epilogue timing in sky.js.

The main.js warm-up times are derived from `LEAF_TURNS` and adapt on their own.

## 12. Verification

- **`tools/snap.mjs`** takes headless screenshots of the film or any dev page at given times. It
  fails on any console error, page error or failed request.
- **Self-tests in the harnesses:**
  - `dev/popup.html` runs a numeric test over 200 α samples: crease ⟂ glue lines, orthonormal
    mounts, every card corner inside its own half and inside the page, flat when closed, erect
    when open.
  - `dev/book.html?check=1` sweeps the whole film for ground contact, leaf overlap and gutter /
    anchor fit.
  - `dev/spread-forest.html` sweeps every V-fold half and standUp over 360 angles on load.
  - `dev/spread-sea.html?check=1` and `dev/spread-city.html?check=1` test every visible vertex
    against the book wedge through both turns.
  - `dev/audio.html` renders the score offline and checks peak ≤ −3 dBFS, no silent holes, turn
    foley present, and silence after 95.5 s.
- **`tools/contact-sheet.mjs`** regenerates `media/poster.jpg` and `media/contact-sheet.jpg`.
