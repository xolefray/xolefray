# Our Love Story: architecture (as built)

This document is how the film actually works: conventions, contracts and rules.
The JSDoc header at the top of each source file is the authority for that module.
This page connects those headers. For running the film, the voice-over script and the
MP4 export, see the [README](../README.md).

- [1. Shape of the program](#1-shape-of-the-program)
- [2. World conventions](#2-world-conventions)
- [3. The spread frame](#3-the-spread-frame)
- [4. Page-art orientation](#4-page-art-orientation)
- [5. Master schedule](#5-master-schedule)
- [6. Spread module contract](#6-spread-module-contract)
- [7. Characters, scene art, photos](#7-characters-scene-art-photos)
- [8. Folding rules](#8-folding-rules)
- [9. Camera cues](#9-camera-cues)
- [10. Lights and proxies](#10-lights-and-proxies)
- [11. Determinism and seekability](#11-determinism-and-seekability)
- [12. Privacy](#12-privacy)
- [13. Adding or changing a scene](#13-adding-or-changing-a-scene)
- [14. Verification](#14-verification)

## 1. Shape of the program

The film is a static site. `index.html` has an import map: `three` → `vendor/three.module.js`,
`three/addons/` → `vendor/addons/`. There is no build step. There is no tool in `tools/` that
bundles a single file. The loaders do honour in-page overrides for a host that inlines assets:
`window.__FONTS`, `__PHOTOS`, `__CHARACTERS`, `__ART` and `__NARRATION_URL`.

```
index.html ── #stage (WebGL canvas) · #overlay (titles) · #ui (controls) · #intro (Begin card)
   └─ src/main.js ─┬─ fonts.js, photos.js, characters.js, figures.js   (awaited before any canvas paint)
                   ├─ timeline.js     schedule, leafAngles(t, out), Player
                   ├─ environment.js  desk, room, lamp, dust                 ← update(t)
                   ├─ book.js         7 hinged leaves, cover, 6 anchors      ← setLeafAngles(φ), update(t)
                   │    └─ anchor k ─ spreads/<id>.js group                   ← update(α, t, local)
                   ├─ camera.js       rig from spread cues                    ← update(t)
                   ├─ titles.js       DOM captions                            ← update(t)
                   ├─ audio.js        WebAudio score + optional narration     ← sync(t, playing)
                   └─ ui.js           controls (the Player and callbacks only; never the scene)
```

**Boot**, while the intro card reads "gluing in the photos…":

1. Renderer: antialias, pixel ratio min(devicePixelRatio, 2), ACESFilmic, sRGB output,
   PCF-soft shadows. Camera: 35° perspective, near 0.05, far 200.
2. In parallel: `loadFonts()`, `loadPhotos()`, a defensive import of `figures.js` (gaps filled
   by `util/figures-fallback.js`), `loadCharacters()` for the private drawings, and one
   `loadCharacters({ base: './art/<id>/' })` per spread id. Scene art is loaded even when
   `chars=0`.
3. Environment, then `createBook({ photos, fonts: FONT })`.
4. Spreads in `SPREAD_MODULES` order. Spread k is built with `makeRng(1000 + k)` and the
   context in [§6](#6-spread-module-contract). Its group is parented to
   `book.getSpreadAnchor(k)`; `leftArt` / `rightArt` go to `setPageArt`. A `build()` that
   throws is logged and that spread is skipped.
5. Point lights inside spread groups are adopted ([§10](#10-lights-and-proxies)).
6. Cues are baked to world space at each spread's full-open pose (`collectCues`).
7. Titles, audio, camera. `free=1` then swaps in `OrbitControls` and the rig is not ticked.
8. A **warm-up** renders 14 moments at 320 × 180 behind the card: t = 0.5, the midpoint of
   every leaf turn, the midpoint from each turn's end to the next turn's start (or to
   `DURATION` after the last turn), and t = 152. Skipped for a still frame (`ui=0` plus `t`,
   without `play`).

**Each frame:**

```
t = player.time
leafAngles(t, φ)                        → book.setLeafAngles(φ)     (φ is one reused 7-element array)
for each spread:  α = φ[k−1] − φ[k]
                  group.visible = α > 0.002
                  if visible: spread.update(α, t, t − start)
syncSpreadLights()
camera.update(t) · environment.update(t) · book.update(t) · titles.update(t)
audio.sync(t, playing) · ui.update · render
```

The scene is re-posed only when `t` changes or something asks for a redraw (seek, resize,
orbit). While the film is paused and nothing is dirty, the loop skips the draw. Orbit
damping can still ask for one. Every module call is guarded. A failure is logged
once. A spread whose `update` throws is hidden for the rest of the session. Missing titles,
audio or camera become a no-op, silent audio, or a fixed camera at (0, 8.5, 11) looking at
(0, 0.4, 0).

**Intro states** (`#intro[data-state]`): `loading` → `poster` → `leaving` → `gone`, or
`error`. With no URL parameters the poster shows t = 22 behind the card. **Begin** (a user
gesture) starts audio, seeks to 0 and plays. Reveal, veil and fade are 900 ms, 550 ms and
1200 ms. `play=1` or `t=` skips the card. `ui=0` removes it immediately. With `ui=0` and neither
`t` nor `play`, the film sits paused at 22 s (the warm-up still runs; a still frame is
`ui=0` plus `t`, without `play`).

**Failure handling:**

- `error` on the card: no WebGL, or `boot()` threw. The `<script type="module">` `onerror`
  in `index.html` shows the same state when modules cannot load at all.
- `webglcontextlost`: pause behind a `.film-note`. On `webglcontextrestored`, redraw and
  resume if it had been playing.
- A hidden tab pauses the player and resumes on return.
- Full screen: `ui.js` hides the button where fullscreen is unavailable.

`window.__film` is `{ seek, play, pause, time, playing, duration, cues }`. `cues` is the
world-space list from boot. `window.__ready` becomes true after the intro has settled and
two frames have been drawn.

## 2. World conventions

- 1 unit ≈ 10 cm. +Y is up. The desk top is y = 0. The reader and the camera are on the +Z side.
- [`dims.js`](../src/dims.js) is the only place the page size is defined, so `book.js` and
  `popup.js` cannot disagree:

  | Constant | Value | Meaning |
  |---|---|---|
  | `PAGE_W` | 3.6 | gutter → outer edge, world X, per page |
  | `PAGE_D` | 3.0 | page depth, world Z. Page z is in [−1.5, +1.5] |
  | `LEAVES` | 7 | 0 = front cover, 1..5 inner boards, 6 = back cover |
  | `ART_W`, `ART_H` | 1024, 853 | page-art canvas, aspect `PAGE_W : PAGE_D` |

- `BOOK` in `book.js` re-exports `PAGE_W`, `PAGE_D`, `LEAVES`, and sets `BOARD_T = 0.022`.
  Cover boards are 0.05 thick (`COVER_T`). Inner cards are `BOARD_T`. Covers overhang the
  cards by 0.08 in X and 0.06 on each Z edge. `popup.PAGE` is `{ w: 3.6, d: 3.0, z: 0 }`.
- Leaf angle φ ∈ [0, π] is a rotation about +Z. At φ = 0 the leaf lies on the right
  (x ∈ [0, 3.6]). At φ = π it has turned over to the left. The closed book sits on the right.
  φ₆, the back cover, is always 0.
- Spread k (1..6) lies between leaf k−1 (its **left** page is that leaf's back face) and
  leaf k (its **right** page is that leaf's front face). Opening angle
  αₖ = φₖ₋₁ − φₖ ∈ [0, π]. 0 is closed, π is flat open.
- An open spread is flat, so the two piles cannot both sit on the desk. The thinner pile
  hovers by |2k − 7| · `BOARD_T`: 0.110, 0.066, 0.022 for spreads 1–3 (the turned-over front
  cover is the light side), and the same amounts for spreads 6, 5, 4 (the back cover is the
  light side). The printed-surface heights the camera uses, `PAGE_Y` in `camera.js`, are
  `[0, 0.16, 0.138, 0.116, 0.116, 0.138, 0.16]` for k = 0..6. Those match the hinge chain
  with covers of 0.05 and five boards of 0.022, the book resting on the thicker pile.
  Change a thickness and change `PAGE_Y` with it.

## 3. The spread frame

`book.getSpreadAnchor(k)` returns an `Object3D` that the book re-poses on every
`setLeafAngles`. Everything a spread builds lives in this frame and is driven by α and t.

```
  cross-section, looking along −Z (the reader is behind you):

                 +Y  (normal of the right page)
                  ▲      L(α) = (cos α, sin α, 0)
                  │     ╱
                  │    ╱  left page (back face of leaf k−1)
                  │   ╱
                  │  ╱ α
                  │ ╱  )
  ════════════════●══════════════════════▶ +X
               gutter        right page: y = 0, x ∈ [0, 3.6], z ∈ [−1.5, 1.5]
            (the Z axis,        (front face of leaf k; never moves in this frame)
          +Z toward the reader)
```

- The origin is on the gutter, at the middle of the page (z = 0), on the printed surface of
  the right page.
- +X runs along the right page, away from the gutter. +Y is the right page's normal. +Z runs
  along the gutter toward the reader.
- The left page is the half-plane through the Z axis in direction L(α). Its printed normal is
  N(α) = (sin α, −cos α, 0). At α = π it is x ∈ [−3.6, 0], y = 0, printed side up.
  "Open-flat" coordinates fold rigidly with the left page: they are rotated about +Z by α − π.
- The **bisector** is the plane through the gutter at angle α/2,
  u(α) = (cos α/2, sin α/2, 0). Rule R2 keeps each piece on its own side of it.
- Board thickness is ignored inside the frame. The hinge chain puts both printed surfaces on
  the same gutter line at every angle. Leaf i's back-face gutter edge sits on Q[i+1], and its
  front-face gutter edge is Q[i] = Q[i+1] + tᵢ · n(φᵢ), with n(φ) = (−sin φ, cos φ) and Q[7]
  the back cover's outer gutter edge. Anchor k sits on Q[k], rotated by φₖ. The whole chain
  is then lifted so its lowest corner touches y = 0.

`createBook({ photos, fonts, title, names })` returns
`{ group, setLeafAngles(φ[7]), getSpreadAnchor(k), setPageArt(k, {left, right}), update(t, lampLevel?) }`.
`update` with no `lampLevel` measures the spot and hemisphere light actually falling on the
book and drives the brass reflections from that. `main.js` calls it that way, so the brass
follows the environment schedule without a second copy of the times. Cover relief (frame,
eyelets, cord, bow) belongs to leaf 0. As the turned cover comes down toward the desk the
relief is pressed flat to the remaining clearance, and hidden once there is none.

## 4. Page-art orientation

Each spread supplies two 1024 × 853 canvases. Seen from above with the book open flat:

```
                         far edge  (z = −1.5)  = top of both canvases
          ┌─────────────────────────┬─────────────────────────┐
          │       leftArt           │        rightArt         │
          │  u = 0 ──────────▶ u = 1│ u = 0 ──────────▶ u = 1 │
          │  (outer edge)  (gutter) │ (gutter)   (outer edge) │
          │                         │                         │
          │  x = −3.6 … 0           │  x = 0 … 3.6            │
          └─────────────────────────┴─────────────────────────┘
                         near edge (z = +1.5)  = bottom of both canvases
                                     ▲ reader
```

Placed side by side, the two canvases are the spread as the reader sees it. `book.js` maps the art with
explicit UVs (front faces u = x/W, back faces u = 1 − x/W, v = 1 at the far edge) and the
page shader darkens a soft strip along the gutter. The paintings themselves carry no gutter
shade.

If `art.has('page-left')` and `art.has('page-right')`, the spread draws those canvases
(often adding hand-lettering on top). Otherwise it falls back to `paper.page(...)`, a
1024 × 853 procedural page, so a missing `art/` folder still builds.

## 5. Master schedule

[`timeline.js`](../src/timeline.js) is the source of structural time. `DURATION = 153`.
`COUPLE` is `{ him: 'Brian', her: 'Marlin', names: 'Brian & Marlin', weddingDate: 'February 6, 2027', officialDate: 'February 7, 2024' }`.
Each leaf turns φ from 0 to π with `ease.inOutCubic` over exactly 3 seconds.

| Film time | Leaf / spread | Light (`environment.js`, from these exports) | Text (`titles.js`) |
|---|---|---|---|
| 0–9.5 | closed book | lamp ignites 0.4–2.8 (amber → warm) | captions 2.5–4.9, 5.4–9.4. No page title on the cover |
| 9.5–12.5 | **leaf 0** turns; spread 1 rises | warm, level 1 | washi title "How we met" from 9.9 to 12.5 |
| 12.5–38 | spread 1 **walmart** open | warm | captions 12.0–37.2 (seven lines) |
| 38–41 | **leaf 1** | warm | "The “dates”" from 38.4 to 41 |
| 41–69.5 | spread 2 **dates** open | warm | captions 42.0–68.2 |
| 69.5–72.5 | **leaf 2** | warm | "February 7, 2024" from 69.9 to 72.5 |
| 72.5–84 | spread 3 **official** open | warm | captions 73.5–82.8 |
| 84–87 | **leaf 3** | warm | "A life together" from 84.4 to 87 |
| 87–104 | spread 4 **life** open | warm | captions 88.0–102.2 |
| 104–107 | **leaf 4** | eases toward the proposal look across this turn | "The question" from 104.4 to 107 |
| 107–120 | spread 5 **proposal** open | lamp 0.85, rosier, plus a swell of +0.18 at `BEATS.yes` (116) | captions 108.5–113.4, 116.0–117.6 |
| 120–123 | **leaf 5** | eases toward wedding gold across this turn | "February 6, 2027" from 120.4 to 123 |
| 123–145.5 | spread 6 **wedding** open; it never closes | lamp 1.15, bright gold | captions 124.5–144.4 |
| 145.5–153 | end card | room fades over 147.5–152.5 (`fadeStart − 3` to `end − 0.5`) | names + date fade in over 1.2 s; veil 150.5–153 |

`END_CARD = { start: 145.5, end: 153, fadeStart: 150.5 }`.

`CHAPTERS` is derived: `{ t: 0, label: 'Cover' }`, then one entry per spread at `s.start`
using `s.title`, then `{ t: 145.5, label: 'See you there' }`.

`BEATS` (film seconds), the names spreads, lights and the score animate to:

| Group | Names |
|---|---|
| Cover | `lampOn` 0.4, `coverReveal` 1.5 |
| Walmart | `walmartSign` 12.0, `coworkers` 17.5, `lunch` 19.8, `payArgument` 23.0, `heWins` 27.0, `foodUntouched` 29.3, `sparks` 33.8 |
| Dates | `strictParents` 44.3, `dogWalk` 45.5, `sisterTagsAlong` 49.8, `uberChaseStart` 56.5, `phoneRescued` 61.0, `sameSchool` 63.6 |
| Official | `calendar` 73.5, `official` 77.0, `alreadyDating` 79.8 |
| Life | `firstPlace` 91.4, `dogOfTheirOwn` 93.8, `home` 96.2, `japan` 99.6 |
| Proposal | `kneel` 108.5, `question` 112.0, `photoReveal` 114.3, `yes` 116.0 |
| Wedding and end | `weddingDate` 124.5, `notSunday` 134.4, `walmartToForever` 138.0, `celebrate` 141.6, `endCard` 145.5, `fadeOut` 150.5 |

`NARRATION` is 28 lines, `{ id, start, end, spread, text }`, spread 0 for the cover and 1..6
after that. The full text is in the README. Captions fade over 0.5 s and stay up until 0.6 s
after `end`, or until the next line's `start`, whichever is sooner. Page titles use
`LEAF_TURNS[i].start + 0.4` through that turn's `end`.

Also exported: `clamp`, `lerp`, `seg`, `smoothstep`, `ease` (`linear`, `inQuad`, `outQuad`,
`inOutQuad`, `inCubic`, `outCubic`, `inOutCubic`, `inOutSine`, `outBack`), `leafAngles(t, out?)`,
`spreadAlpha(k, phis)`, and `class Player`. The player reads `performance.now()`, clamps to
`[0, duration]`, and fires `onEnd` at the end. `play()` at the end seeks to 0 first.

`SPREADS` rows are `{ k, id, title, start, open, close, end }`. Spread 6 has
`close: null, end: null`.

The lamp, captions, score and camera turn-shots take their times from these exports. Moving
a turn in `timeline.js` moves them. It does not move cue coordinates inside a spread, the
musical arrangement choices in `audio.js`, or `PAGE_Y`.

## 6. Spread module contract

`src/spreads/index.js` exports `SPREAD_MODULES = [walmart, dates, official, life, proposal, wedding]`.
Index k−1 is spread k. Ids and titles match `SPREADS`. `src/spreads/_stub.js` is an old
placeholder. It is not imported. Its header still describes the earlier build context, which
did not include `characters`, `characterArt` or `art`.

```js
export default {
  id: 'walmart',
  title: 'How we met',
  build(ctx) {
    return { group, leftArt, rightArt, cues, update(alpha, t, local) };
  },
};
```

`main.js` calls `build` with:

| Field | What it is |
|---|---|
| `THREE` | the three.js module |
| `paper` | `src/paper.js` |
| `popup` | `src/popup.js` |
| `rng` | `makeRng(1000 + k)`, for build time only |
| `BOOK` | `{ PAGE_W, PAGE_D, BOARD_T, LEAVES }` |
| `photos` | `{ cover, proposal, dog }`, each a canvas or `null` |
| `figures` | `paintFigure`, `paintDog`, `FIGURE`, `figureCard` (real or stand-in) |
| `characters` | the loaded character set ([§7](#7-characters-scene-art-photos)), empty if the folder is missing or `chars=0` |
| `characterArt` | the `characters.js` helpers: `characterCard`, `characterFlip`, `actor` |
| `FONT` | `{ display, hand, serif }` |
| `timeline` | the timeline module, including `BEATS`, `NARRATION`, `SPREADS`, `COUPLE` |
| `art` | that spread's scene-art set, same methods as `characters`, or `null` |

`group` is in spread-frame coordinates. `main.js` calls `update` only while α > 0.002.
Several spreads declare `update(alpha, t)` and ignore `local` (`t − spread.start`); both are
passed. `update` must be a pure function of its inputs: no `Math.random()`, no allocation,
no accumulated velocity. Flip-book frame, squash, bob and slider `u` are computed from `t`.

`cues` is an array of:

```js
{ t, hold, at: [x, y, z], size, from }
```

`t` is when the camera should have **arrived**, in film seconds. `hold` is how long to rest.
`at` is a point in **this spread's frame**. `size` is the diameter that must stay in frame
(the establishing cue of every spread uses `size: 7.5`). `from` is
`'front' | 'left' | 'right' | 'high' | 'low'`. A malformed cue is dropped with one warning.
A spread with no cues contributes none; the rig still has its own wide shots.

Mount pieces with `paper.card` / `paper.splitCard` on `popup` mechanisms. Characters go
through `characterArt.actor(paper, characters, figures, id, fallback, opts)` or
`characterArt.characterFlip(...)`. `fallback` is `{ who, outfit, pose, ... }` for
`figureCard`. Pass `null` when a missing drawing should leave a hole (the dates spread does
this for the car). Give the hero cards an explicit `height` around 1.5–1.7. The sidecar
`units` value is only the default.

**Drawing ids the spreads request.** These are character-set ids, not scene-art ids. A cycle
name means `characters.cycle(name)` in manifest order.

| Spread | Ids and cycles |
|---|---|
| walmart | `him-vest`, `her-vest`, cycle `lunch` |
| dates | `parents-window`, cycles `walk-couple`, `walk-sister`, `run-couple`, `phone-cheer`, `car` (no doll fallback), `school-couple` |
| official | `official-hands`, `official-banter`, passed straight to `characterFlip` (not via `cycle()`) |
| life | `life-box`, `life-dogcuddle`, `dog-jump`, `life-keys`, `life-japan` |
| proposal | cycle `proposal`, `dog-sit`, `dog-jump` |
| wedding | cycle `wedding` (the code also names frames `wedding-0` and `wedding-1`), `dog-bowtie` |

`dog-bed` on the life spread is scene art (`art/life/`), not a character.

**V-fold γ actually used** (all of them mountains, γ > π/2 ≈ 1.571): walmart, life, proposal
and wedding share `GAMMA = 1.78` across every V-fold of that spread; dates uses `1.64`;
official's calendar uses `1.66`. One γ per spread keeps same-side halves parallel, which is
the allowed exception to R3 where closed footprints overlap.

**Own lights.** Each of the six spreads creates one `PointLight` and no shadow. `main.js`
proxies it. Other light types are not proxied.

`paper.js` still exports `boat()` and `crane()` from the earlier pop-up engine. This film's
spreads do not call them.

## 7. Characters, scene art, photos

### Manifest

`tools/build-character-manifest.mjs` writes:

```json
{ "version": 1, "items": { "<id>": { } }, "cycles": { "<name>": ["id0", "id1"] } }
```

Items are sorted by id. A cycle lists its ids sorted by `frame`. With no `--dir`, input is
`characters/poses/*.json` and the output is `characters/manifest.json`. File paths in those
sidecars are relative to `characters/` (typically `poses/<id>.png`). With
`--dir art/<scene>`, the sidecars are the JSON files directly in that folder and the output
is `art/<scene>/manifest.json`. Paths are relative to that folder (`boxes.webp`).

A sidecar must be an object with:

| Field | Rule |
|---|---|
| `id` | string, equal to the JSON file's stem |
| `file` | path to a PNG or WebP inside the same root. The tool reads the PNG IHDR or the WebP header. The error text still says "is not a PNG" when the bytes are neither |
| `w`, `h` | integers matching that header |
| `feet` | `[x, y]` in pixels, finite numbers, inside the bitmap (`x ≤ w−1`, `y ≤ h−1`). This is where the drawing meets the ground: the group's origin. Scene-art feet are often fractional |
| `who` | non-empty list from `him`, `her`, `dog`, `sister`, `familyDog`, `parents`, `prop`. Every committed scene piece is `["prop"]` |
| `scene` | `walmart`, `dates`, `official`, `life`, `proposal`, `wedding`, or `any` |
| `units` | suggested height in world units, `(0, 20]` |
| `cycle`, `frame` | both set, or both omitted. `frame` is an integer ≥ 0. One frame index per cycle |

An invalid sidecar prints errors and exits 1 without replacing a manifest. An empty folder
writes an empty manifest and exits 0.

The six committed sets, besides `page-left` and `page-right`:

| Folder | Set pieces |
|---|---|
| `art/walmart/` | boxes, carts, checkout, clock, shelves-left, shelves-right, store-front, vending |
| `art/dates/` | bush-row, fence, houses, park-bench, school, trees-a, trees-b |
| `art/official/` | bouquet, calendar, candle-table, confetti-cluster, envelope-pile, garland, heart-balloons, heart-stick, photo-booth-strip, posts |
| `art/life/` | apartment, dog-bed, fuji, house, paper-plane, sky-band, suitcase-stickers, torii |
| `art/proposal/` | backdrop, balloon-bunch, balloons-left, balloons-right, banner-yes, cake-table, gifts, party-hat, streamers |
| `art/wedding/` | arch, cake, chairs-left, chairs-right, desk-calendar, easel, flower-pots, lantern-string, trees-backdrop |

### Loader

`loadCharacters({ disabled, base = './characters/', override } = {})` returns a set:

```js
{
  ids,                          // decoded ids, manifest order
  has(id), canvas(id), info(id),
  cycle(name),                  // frame order, unknown name → []
}
```

The promise never rejects. A missing manifest is silent. A bad image is `console.info` and
that id is omitted. `disabled: true`, or `chars=0` when `disabled` is omitted, returns an
empty set and fetches nothing. `chars=0` does not apply to scene art: `main.js` passes
`disabled: false` and `base: './art/<id>/'`. For the default base, `window.__CHARACTERS`
supplies `{ manifest, images }` and the files are not read. Scene art takes the same shape
from `window.__ART[id]`.

`characterCard` die-cuts with a 10 px margin (override `border`), scales the canvas to
`height` world units (default `info.units`), and places the feet on the group origin.
`flip: true` mirrors the canvas through the feet; the mesh scale stays positive.
`characterFlip` stacks one card per id and scales every frame with the first frame's
pixels-per-unit, so they share a ground line when the drawings were made that way.
`show(index)` allocates nothing. `actor` returns the drawn card when `has(id)`, otherwise
`figures.figureCard(paper, fallback.who, fallback)`.

Images must match the sidecar's `w` and `h` or that id is skipped. Load timeout is 12 s.

### Photos

`loadPhotos({ disabled })` → `{ cover, proposal, dog }`, each a canvas (longest side ≤ 1600)
or `null`. Sources are `photos/cover.jpg`, `proposal.jpg`, `dog.jpg`, or `window.__PHOTOS`.
`photos=0` or `disabled: true` fetches nothing. `photoPrint(photo, opts)` paints a polaroid,
a deckled print, or an oval medallion. A null photo becomes a doodled heart on a blush card.
`PHOTO_ASPECT` is `{ cover: 0.8, proposal: 0.82, dog: 0.7 }` so a layout can size the piece
the same way whether or not the file is there. Details of the three files and
`tools/prep-photos.py` are in [`photos/README.md`](../photos/README.md).

### Fonts

`FONT.display` is Luckiest Guy (Apache 2.0, one file). `FONT.hand` is Caveat 400 and 700
(SIL OFL 1.1). `FONT.serif` is a system stack. `loadFonts()` resolves when the vendored
faces are usable in canvas, never rejects, and registers them with `FontFace` when the page
has no stylesheet. `window.__FONTS['<filename>']` overrides a file. Canvas text uses
`FONT.*`. Call `loadFonts()` before painting. `main.js` does.

## 8. Folding rules

Paper in `popup.js` has zero thickness. Poses are pure in α (a slider is pure in α and u).
`update` allocates nothing; the module keeps shared vectors.

| Rule | Statement | How it is met |
|---|---|---|
| **R1** Closed fit | At α = 0 every piece lies flat and its footprint is inside the page rectangle, x ∈ [0, 3.6], z ∈ [−1.5, 1.5] | `vFoldLimits`, `standUpLimits`. A floating layer needs `width/2 + height ≤ 3.6` and `\|z\| + depth/2 ≤ 1.5` |
| **R2** Own half | A piece that stays between its page and the bisector never meets the other page | automatic for a V-fold half, a floating layer (and pieces nested on it that obey R2 there), a slider and `onPage`. A stand-up needs `height ≤ x − width/2`. Up to twice that (`maxHeightLoose`) is the kinematic limit and is only safe where the facing page is bare |
| **R3** Disjoint footprints | The shadow of a mechanism on its own page, at any α, lies inside its closed footprint | keep closed footprints of different mechanisms on the same page from overlapping |

V-fold crease, closed form, regular for every α including 0:

c(α) = ( \|cos γ\| cos(α/2), \|cos γ\| sin(α/2), −sgn(cos γ) sin γ cos(α/2) ) / √(cos²γ + sin²γ cos²(α/2))

γ within 0.05 of 0, π/2 or π throws. Valley γ ∈ (0, π/2) falls back toward −Z as it closes.
Mountain γ ∈ (π/2, π) falls forward toward +Z. Stand-up angle is α/2: flat when closed,
vertical facing the reader when open. `rise(α, a0=0.15, a1=0.95)` is a smoothstep of α/π
for props that are not paper mechanisms.

Same-γ V-folds are the allowed overlap: halves on one side are parallel planes at every
angle, so they nest while closing even where the closed footprints overlap.

`dev/popup.html` checks 200 angles on load (crease perpendicular to the glue lines,
orthonormal mounts, every card corner in its own half and inside the page, flat when closed,
erect when open). Each `dev/spread-*.html?check=1` samples α from π down to 0 and the
spread's open window.

## 9. Camera cues

`createCameraRig(camera, { getCues })` → `{ update(t), aim }`. `getCues()` returns the list
`collectCues` built at boot:

```js
{ t, hold, at: Vector3 (world), size, from, spread }
```

Conversion: pose the book at that spread's `open` time (the left page lies flat, so a
negative spread-frame x is simply the left page), then multiply `at` by the anchor's world
matrix. Default `hold` is 0 if the cue omitted it. Default `size` is 7.5. Default `from`
is `'front'`.

The rig knows the book, the timeline and that list. It does not know which spread is which.
Its own shots:

- **Prologue.** A slow push in on the closed cover from t = 0 until 0.4 s before the first
  turn (`TURN_LEAD`).
- **Page turns.** A wide, slightly high, centred view, from 0.4 s before the leaf moves
  until the turn ends.
- **End card.** From `END_CARD.start` to `DURATION`, a pull back and up. Negative vertical
  bias sinks the book so the names sit above it.

Between those it travels cue to cue: arrive at `t`, rest for `hold` (a slow drift, never a
hard lock), then ease on. Cues closer than 1.2 s are blended through. Cues that fall inside
a turn, before the prologue has finished, or at the end card are dropped. A spread that
supplied no surviving cue gets one generated wide shot. Channels are cubic Hermite with
Fritsch–Butland tangents (C1, no overshoot). Empty cue list still produces a finite rig.
A non-finite sample is replaced with the camera at (0, 8.2, 10.4) looking at (0, 0.5, 0).
The (0, 8.5, 11) camera in [§1](#1-shape-of-the-program) is only the stand-in used when
`camera.js` fails to load.

`from` picks an azimuth and elevation: front (0°, 40°), left (−34°, 32°), right (34°, 32°),
high (0°, 58°), low (0°, 16°). A closer `size` uses a slightly longer lens: 31.5° when
`size` is below 4.4, 33.5° from 4.4 up to 6.8, and 35.5° at 6.8 and above. It actually
comes closer. The minimum distance is 3.4. Shots are composed for aspect 1.5. Below that,
down to a floor of 0.2, the
rig widens the fov (at most 62°) and dollies back, splitting the deficit more toward fov
when the aspect is under 1.4. Wider than 1.5, the vertical framing stays and you see more
desk.

Handheld drift (a few slow sines, a little more on wide shots, plus lens breathing) is off
while `prefers-reduced-motion: reduce` matches. The match is read live. A caption bias lifts
the subject off the bottom band; turn shots are biased the other way so the washi title
clears the rising page.

`dev/camera.html` draws a marker on the active cue and dashed guides at the top 10% and the
bottom 16%. `window.__cam.sample(t, aspect?)` returns
`[px, py, pz, tx, ty, tz, fov]`.

## 10. Lights and proxies

`environment.js` owns four lights, and only their intensities and colours change:

| Light | Role |
|---|---|
| SpotLight `desk-lamp` at (−5, 9, 4), aimed at (0.3, 0.4, −0.3) | the only shadow caster. Map 2048², PCF soft shadows, half-angle 0.82 rad, penumbra 0.75. Candela 400 at warm level 1 |
| HemisphereLight `room-fill` | sky / ground fill |
| DirectionalLight `front-fill` at (6, 7, 7) | warm bounce on faces turned toward the reader |
| DirectionalLight `side-fill` at (9, 3, 2.5) | intensity stays 0 for the whole film, so the light count never changes |

No night look. The schedule is in [§5](#5-master-schedule): ignition 0.4–2.8, level 1
through the first four spreads, proposal at 0.85 with a +0.18 swell around `yes`, wedding
at 1.15, fade 147.5–152.5. The desk is a 40 × 40 walnut plane at y = 0, fading into the
room colour between radii 6.2 and 13.2 (the open album is 7.2 wide). Fog and the backdrop
share that horizon colour. 320 dust motes, seeded with `makeRng(4242)`, drift in the vertex
shader from `t` and glow only inside the lamp cone.

A hidden spread would remove its point light and force three.js to rebuild shader programs.
`adoptLights` clones each spread `PointLight` into a proxy that stays in the scene, hides
the original, and `syncSpreadLights` copies world position, colour, intensity, distance and
decay every pose. The proxy's intensity is 0 while the spread (or the light's own parent
chain) is hidden. Six spreads, one point light each, so the rendered set is the four
environment lights plus six proxies, all the time.

`book.update(t)` measures spot and hemisphere irradiance on the cover to drive the brass.
It does not add a light.

## 11. Determinism and seekability

Every posed frame is a pure function of film time `t`. Scrubbing backward and forward
matches, and `tools/render-video.mjs` can seek frame to frame on one loaded page.

- **No runtime `Math.random()`.** Seeds: spread k uses `makeRng(1000 + k)`, the score uses
  `makeRng(20260206)`, dust uses `makeRng(4242)`. Painters in `book.js`, `paper.js`,
  `photos.js` and `figures.js` take their own mulberry32 seeds at build time.
- **No accumulated motion.** `spread.update`, `camera.update`, `environment.update`,
  `book.update` and `titles.update` recompute from `t` (and α, which is a function of `t`).
- **Titles** use no CSS transitions and no timers. Opacity and drift come from `t`. The DOM
  is written when a rounded value changes. `prefers-reduced-motion` zeros the drift.
- **Audio** is one sorted event list in film seconds. `sync(t, playing)` treats
  \|t − expected\| > 0.3 s as a seek, fades the session out over 60 ms, and starts a fresh
  session after playback has been steady for 80 ms. The narration buffer is started at
  offset = current film time. Duck breakpoints are the `NARRATION` line edges plus 0.25 s.
  Peak target for music plus foley, with no narration file, is at or under −3 dBFS.
  `dev/audio.html` checks that, including the 6 dB duck.
- **No per-frame allocation** on the hot path: shared vectors in `popup.js`, one reused
  angle array in `main.js`, cached figure canvases.
- Wall-clock code is `Player`, the UI idle timer (2.5 s), the tab-visibility pause, and
  the intro timers.

The live film and the MP4 do not duck the same way. In the browser, a file at
`audio/narration.mp3` (then `.m4a`, then `.wav`) ducks the music bus 6 dB only under each
narration line. `render-video.mjs --narration` renders the score with `renderOffline`
**without** that envelope, then ffmpeg applies `volume=-6dB` to the whole music bed for
the length of the clip and mixes the file on top.

## 12. Privacy

The repository is public. Two gitignores keep the photographs out:

- `love-story/.gitignore` ignores `photos/*` and then un-ignores `photos/README.md` and
  `photos/.gitignore`. It also ignores `characters/` as a whole, plus `node_modules/` and
  `.DS_Store`.
- `photos/.gitignore` ignores everything in that folder except `README.md` and itself.

What the film will load, and what a fresh clone shows:

| Path | Loaded by | When it is missing |
|---|---|---|
| `photos/cover.jpg`, `proposal.jpg`, `dog.jpg` | `photos.js` | `null`. Cover emblem is a cut-paper heart. Prints are the doodled placeholder. `?photos=0` skips the fetch |
| `characters/manifest.json` and the images it names | `characters.js` | empty set, silent. `actor()` uses paper dolls. `?chars=0` skips the fetch |
| `art/<id>/manifest.json` and its WebP pieces | the same loader, base `./art/<id>/` | empty set. Spreads paint `paper.page` backgrounds and skip set pieces. The committed tree has all six |
| `audio/narration.mp3` / `.m4a` / `.wav` | `audio.js` | no narration, no duck, no error |

Do not copy the photographs or the character drawings anywhere else in the tree. Do not
embed them in source. `window.__PHOTOS` and `window.__CHARACTERS` exist so a single-file
host can pass them in memory; nothing in `tools/` writes such a file.

**`snap.mjs` guard.** Screenshots can contain the photos. If `--out` is inside the git
work tree (the directory walked upward from `love-story/` until a `.git` is found, or
`love-story/` itself when there is none), the tool throws unless the query's last `photos`
value is `0`. Optional 404s, listed under `optionalMissing` and not counted as failure, are
exactly: `photos/<file>.{jpg,jpeg,png,webp}`, `audio/narration.<ext>`,
`characters/<path>.{json,png,webp}`, and `art/<lowercase-name>/manifest.json`. A 404 of a
scene-art WebP is a real failure. The default timeout is 120000 ms. The page is opened with
`ui=0` plus `t=<time>` when `--times` is set.

`render-video.mjs` has no equivalent guard. Pass `--query "photos=0"` yourself when the
MP4 will leave the machine. Its optional-asset regex covers photos and `audio/narration.*`
only, so a missing character file or a missing scene manifest fails that run.

## 13. Adding or changing a scene

**Change the scene that is already there** (same id, same place in the film):

1. Keep `id` and `title` in `src/spreads/<id>.js` equal to the row in `timeline.js`
   `SPREADS`. Read times from `timeline` (`BEATS`, `NARRATION`, `SPREADS`, `END_CARD`).
   Do not write a film-second literal in the spread.
2. Page art: 1024 × 853, orientation in [§4](#4-page-art-orientation). Prefer
   `art.canvas('page-left')` and `'page-right'`. If either is missing, paint with
   `paper.page` so the spread still builds.
3. Set pieces: a cut-out WebP plus a sidecar in `art/<id>/`, then
   `node tools/build-character-manifest.mjs --dir art/<id>`. Mount them with
   `characterArt.characterCard(paper, art, name, { height })` on a `popup` mechanism.
   One mountain γ for every V-fold in the spread. Size with `vFoldLimits` /
   `standUpLimits`. Obey R1–R3. Shrink anything thick with `popup.rise(alpha)` before the
   page can close on it.
4. Characters: `actor` or `characterFlip`, with a `figures` fallback for every person, so
   `chars=0` and a fresh clone still play the beat. Animate from `BEATS`: flip-book index,
   a squash on the beat, a small idle bob. All of that from `t`, allocated up front.
5. At most one `PointLight`, `castShadow = false`. `main.js` will proxy it. A second
   light, or a non-point light, changes the program set when the spread hides.
6. `cues` in spread-frame coordinates. First cue at `spread.open`, `size` 7.5, `from`
   `'front'`. Further cues on the beats worth a close look, `size` about 1.8–3.2, and
   not inside a page-turn window (turn start − 0.4 s through turn end). The rig drops
   cues that land there.
7. `update(alpha, t, local)` pure. The dev page `dev/spread-<id>.html?check=1` should
   print PASS. Views and the fold test are described in the README.

**Move a time** (a longer narration, a later "yes"):

1. Edit `NARRATION`, `BEATS`, `SPREADS`, `LEAF_TURNS`, and `DURATION` / `END_CARD` if the
   film grows. `CHAPTERS` follows `SPREADS` and `END_CARD`.
2. Leaf turns are what open and close spreads: spread k opens while leaf k−1 turns, and
   the row `SPREADS[k − 1]` (`start`, `open`, `close`, `end`) should stay consistent with
   `LEAF_TURNS`. The array is ordered by `k`, so index 0 is spread 1.
3. Re-read the spreads. Cue times that were derived from `BEATS` follow. A cue with a
   hand-tuned `hold` may now collide with the next turn; the rig will drop it if it falls
   inside the turn window.
4. Lights, captions, page titles and the score's event times follow the exports. Listen
   anyway: `audio.js` chooses *which* gesture happens on a beat (the Uber run, the koto,
   the joy theme). A beat that moves across a section boundary can land in the wrong
   arrangement. `dev/audio.html` checks peak, holes, turn foley, silence after
   `DURATION − 0.5`, and the duck.
5. `camera.js` `PAGE_Y` does not depend on time. It does depend on book thickness.

**Add a seventh spread** (an eighth leaf):

1. `dims.js`: `LEAVES` (page size too, if the album changes). `leafAngles` and `main.js`
   size their arrays from `LEAVES`, so those follow.
2. `book.js`: the cover / back-cover special cases (`THICK` is already derived from
   `LEAVES`), the float story, and anything that assumes six anchors. The hinge comment
   and the plinths assume leaf 0 and leaf `LEAVES−1` are the covers.
3. `camera.js`: `PAGE_Y` is a fixed 7-entry array. A new open height has to be written in,
   from the same thickness sum as [§2](#2-world-conventions).
4. `timeline.js`: one more `LEAF_TURNS` row, one more `SPREADS` row, narration, beats,
   `DURATION`, `END_CARD`. The previous last spread currently has `close: null`. Give it
   a close, and let the new last spread be the one that stays open if that is still the
   design. The end-card shot assumes spread 6's `PAGE_Y`.
5. `src/spreads/<id>.js`, register it in `SPREAD_MODULES` at index k−1, and add
   `dev/spread-<id>.html` by copying one of the six. Copy the fold check.
6. `art/<id>/` plus a manifest. `main.js` discovers art folders from `timeline.SPREADS`,
   so a new id is loaded once it is in that table.
7. `environment.js` mood blends are keyed off spreads k = 5 and k = 6 (`PROPOSAL`,
   `WEDDING`). A new ending needs a look of its own, or the wedding gold will not be the
   last look.
8. `audio.js`: a section function for the new id, called from `buildEvents`. Turn music
   already loops `LEAF_TURNS`, and it skips leaf 5 on purpose because the "yes" theme is
   already playing. A new last turn needs the same decision.
9. Warm-up times are derived from `LEAF_TURNS` and `DURATION`. They grow on their own.

Keep `characters/` and `photos/` out of the commit. Scene art is scenery. People go in
`characters/poses/` and through the manifest.

## 14. Verification

- **`tools/snap.mjs`** screenshots the film or any dev page and fails on console errors,
  page errors and failed requests, with the privacy guard and the optional-asset list in
  [§12](#12-privacy).
- **`tools/render-video.mjs`** seeks the running film per frame. That only works because of
  [§11](#11-determinism-and-seekability). It exits non-zero on failure, writes a one-line
  summary to stdout and progress to stderr. A score that cannot be rendered still leaves
  the silent picture, and says so.
- **Self-tests:**
  - `dev/popup.html` — 200-angle mechanism test, on load.
  - `dev/book.html?check=1` — ground contact, leaf overlap, gutter and anchor fit, float of
    the thinner pile. Result on `window.__check`.
  - `dev/spread-<id>.html?check=1` — fold test, `PASS` / `FAIL` on the HUD and the console.
  - `dev/audio.html` — offline score, peak ≤ −3 dBFS, chapter energy, turn foley, silence
    after `DURATION − 0.5`, 6 dB duck. `?quick=1` renders three windows only.
  - `dev/prints.html` — glyph coverage of the characters the film letters. A fallback glyph
    is `console.error`, so `snap.mjs` fails.
- **`dev/smoke.html`** sets `window.__ready` after two frames. It is the toolchain test,
  not a picture of the film.

Line counts of the source, the shell and the tools are in the README module map. They were
taken with `wc -l`.
