# Our Love Story: architecture (as built)

This document is how the film actually works: conventions, contracts and rules.
The JSDoc header at the top of each source file is the authority for that module.
This page connects those headers. For running the film, see the [README](../README.md).
The spoken words, copied from `NARRATION`, are in [SCRIPT.md](SCRIPT.md).

- [1. Shape of the program](#1-shape-of-the-program)
- [2. World conventions](#2-world-conventions)
- [3. The spread frame](#3-the-spread-frame)
- [4. Page-art orientation](#4-page-art-orientation)
- [5. Master schedule](#5-master-schedule)
- [6. Language](#6-language)
- [7. Spread module contract](#7-spread-module-contract)
- [8. Characters, scene art, photos](#8-characters-scene-art-photos)
- [9. Folding rules](#9-folding-rules)
- [10. Camera cues](#10-camera-cues)
- [11. Lights and proxies](#11-lights-and-proxies)
- [12. Determinism and seekability](#12-determinism-and-seekability)
- [13. Privacy](#13-privacy)
- [14. Adding or changing a scene](#14-adding-or-changing-a-scene)
- [15. Verification](#15-verification)

## 1. Shape of the program

The film is a static site. `index.html` has an import map: `three` → `vendor/three.module.js`,
`three/addons/` → `vendor/addons/`. There is no build step. There is no tool in `tools/` that
bundles a single file. The loaders honour in-page overrides for a host that inlines assets:
`window.__FONTS`, `__PHOTOS`, `__CHARACTERS`, `__ART`, `__NARRATION_URL`, and `__LANG`.

```
index.html ── #stage (WebGL canvas) · #overlay (titles) · #ui (controls) · #intro (Begin card)
   └─ src/main.js ─┬─ fonts.js, photos.js, characters.js, figures.js   (awaited before any canvas paint)
                   ├─ i18n.js         LANG, L(), titles, chrome          (fixed at module load)
                   ├─ timeline.js     schedule, leafAngles(t, out), Player
                   ├─ environment.js  desk, room, lamp, dust                 ← update(t)
                   ├─ book.js         9 hinged leaves, cover, 8 anchors      ← setLeafAngles(φ), update(t)
                   │    └─ anchor k ─ spreads/<id>.js group                   ← update(α, t, local)
                   ├─ camera.js       rig from spread cues                    ← update(t)
                   ├─ titles.js       DOM captions                            ← update(t)
                   ├─ audio.js        WebAudio score + optional narration     ← sync(t, playing)
                   └─ ui.js           controls, including EN | ES             (the Player and callbacks only)
```

**Boot**, while the intro card reads "gluing in the photos…" (or "pegando las fotos…"):

1. Renderer: antialias, pixel ratio min(devicePixelRatio, 2), ACESFilmic, sRGB output,
   PCF-soft shadows. Camera: 35° perspective, near 0.05, far 200.
2. In parallel: `loadFonts()`, `loadPhotos()`, a defensive import of `figures.js` (gaps filled
   by `util/figures-fallback.js`), `loadCharacters()` for the private drawings, and one
   `loadCharacters({ base: './art/<id>/' })` per spread id in `SPREADS`. Scene art is loaded
   even when `chars=0`. The override for scene art is `window.__ART[id]`.
3. Environment, then `createBook({ photos, fonts: FONT, title: tr('coverTitle') })`. The
   cover title follows the language. The names under the medallion stay `COUPLE.names`
   (`Brian & Marlin`) unless a caller passes `names`.
4. Spreads in `SPREAD_MODULES` order. Spread k is built with `makeRng(1000 + k)` and the
   context in [§7](#7-spread-module-contract). Its group is parented to
   `book.getSpreadAnchor(k)`; `leftArt` / `rightArt` go to `setPageArt`. A `build()` that
   throws is logged and that spread is skipped.
5. Every `PointLight` inside a spread group is adopted ([§11](#11-lights-and-proxies)).
6. Cues are baked to world space at each spread's full-open pose (`collectCues`).
7. Titles, audio, camera. `free=1` then swaps in `OrbitControls` and the rig is not ticked.
8. A **warm-up** renders 18 moments at 320 × 180 behind the card: t = 0.5, the midpoint of
   each of the eight leaf turns, the midpoint from each turn's end to the next turn's start
   (or to `DURATION` after the last turn), and t = `DURATION − 1` (274). Skipped for a still
   frame (`ui=0` plus `t`, without `play`).

**Each frame:**

```
t = player.time
leafAngles(t, φ)                        → book.setLeafAngles(φ)     (φ is one reused 9-element array)
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

`window.__film` is `{ seek, play, pause, time, playing, duration, lang, cues }`. `lang` is
`LANG` from [§6](#6-language). `cues` is the world-space list from boot. `window.__ready`
becomes true after the intro has settled and two frames have been drawn.

## 2. World conventions

- 1 unit ≈ 10 cm. +Y is up. The desk top is y = 0. The reader and the camera are on the +Z side.
- [`dims.js`](../src/dims.js) is the only place the page size is defined, so `book.js` and
  `popup.js` cannot disagree:

  | Constant | Value | Meaning |
  |---|---|---|
  | `PAGE_W` | 3.6 | gutter → outer edge, world X, per page |
  | `PAGE_D` | 3.0 | page depth, world Z. Page z is in [−1.5, +1.5] |
  | `LEAVES` | 9 | 0 = front cover, 1..7 inner boards, 8 = back cover (never turns) |
  | `ART_W`, `ART_H` | 1024, 853 | page-art canvas, aspect `PAGE_W : PAGE_D` |

  Nine leaves give eight spreads, k = 1..8.

- `BOOK` in `book.js` re-exports `PAGE_W`, `PAGE_D`, `LEAVES`, and sets `BOARD_T = 0.022`.
  Cover boards are 0.05 thick (`COVER_T`). Inner cards are `BOARD_T`. Covers overhang the
  cards by 0.08 in X and 0.06 on each Z edge. `popup.PAGE` is `{ w: 3.6, d: 3.0, z: 0 }`.
- Leaf angle φ ∈ [0, π] is a rotation about +Z. At φ = 0 the leaf lies on the right
  (x ∈ [0, 3.6]). At φ = π it has turned over to the left. The closed book sits on the right.
  φ₈, the back cover, is always 0.
- Spread k (1..8) lies between leaf k−1 (its **left** page is that leaf's back face) and
  leaf k (its **right** page is that leaf's front face). Opening angle
  αₖ = φₖ₋₁ − φₖ ∈ [0, π]. 0 is closed, π is flat open.
- An open spread is flat, so the two piles cannot both sit on the desk. The thinner pile
  hovers by |2k − 9| · `BOARD_T`: 0.154, 0.110, 0.066, 0.022 for spreads 1–4, and the same
  amounts again for spreads 8, 7, 6, 5. Cover boards do not count in that gap; only the
  inner cards do. The hinge chain then lifts the book so its lowest corner sits on y = 0.
- The printed-surface height of an open spread is `openPageY(k)` in `camera.js`:

  `COVER_T + max(k − 1, LEAVES − 1 − k) · BOARD_T`

  For k = 1..8 that is 0.204, 0.182, 0.160, 0.138, 0.138, 0.160, 0.182, 0.204. The closed
  cover's outer face is `COVER_TOP = 2·COVER_T + (LEAVES − 2)·BOARD_T` = 0.254. There is no
  `PAGE_Y` table. Change a thickness and both formulas follow, because they read `BOOK`.

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
  front-face gutter edge is Q[i] = Q[i+1] + tᵢ · n(φᵢ), with n(φ) = (−sin φ, cos φ) and
  Q[9] the back cover's outer gutter edge. Anchor k sits on Q[k], rotated by φₖ. The whole
  chain is then lifted so its lowest corner touches y = 0.

`createBook({ photos, fonts, title, names })` returns
`{ group, setLeafAngles(φ[9]), getSpreadAnchor(k), setPageArt(k, {left, right}), update(t, lampLevel?) }`.
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

[`timeline.js`](../src/timeline.js) is the source of structural time. `DURATION = 275`
(4:35). `COUPLE` is Brian and Marlin, with `names`, `weddingDate` / `weddingDateEs`
(February 6, 2027 / 6 de febrero de 2027) and `officialDate` / `officialDateEs`
(February 7, 2024 / 7 de febrero de 2024). Each leaf turns φ from 0 to π with
`ease.inOutCubic` over exactly 3 seconds. Leaf 8 never turns.

| Film time | Leaf / spread | Light (`environment.js`) | Text (`titles.js`) |
|---|---|---|---|
| 0–9.9 | closed book | lamp ignites 0.4–2.8 (amber → warm) | captions `c1` 2.6–5.2, `c2` 5.9–8.9. No page title |
| 9.9–12.9 | **leaf 0**; spread 1 rises | warm, level 1 | washi title from 10.3 to 12.9 |
| 12.9–46.1 | spread 1 **walmart** open | warm | five captions, `w1`–`w5` |
| 46.1–49.1 | **leaf 1** | warm | "Lunch breaks" from 46.5 |
| 49.1–72.6 | spread 2 **lunch** open | warm | `l1`–`l3` |
| 72.6–75.6 | **leaf 2** | warm | "Creative dates" from 73.0 |
| 75.6–110.3 | spread 3 **dates** open | warm; the spread's own cool fill rises with the night | `d1`–`d4` |
| 110.3–113.3 | **leaf 3** | warm | "A little bit of fate" from 110.7 |
| 113.3–148.8 | spread 4 **fate** open | warm | `f1`–`f5` |
| 148.8–151.8 | **leaf 4** | warm | "February 7, 2024" from 149.2 |
| 151.8–173.4 | spread 5 **official** open | warm | `o1`–`o4` |
| 173.4–176.4 | **leaf 5** | warm | "Building our life" from 173.8 |
| 176.4–201.6 | spread 6 **life** open | warm | `h1`–`h4` |
| 201.6–204.6 | **leaf 6** | eases toward the proposal look across this turn | "On her birthday" from 202.0 |
| 204.6–219.9 | spread 7 **proposal** open | lamp 0.85, rosier, keyed by spread id `proposal`, plus +0.18 at `BEATS.yes` (216.1) | `p1`, `p2` |
| 219.9–222.9 | **leaf 7** | eases toward wedding gold across this turn | "February 6, 2027" from 220.3 |
| 222.9–266.1 | spread 8 **wedding** open; it never closes | lamp 1.15, bright gold, keyed by id `wedding` | `x1`–`x6` |
| 266.1–275 | end card | room fades 268.6–274.5 (`fadeStart − 3` to `end − 0.5`) | names + date fade in over 1.2 s; veil 271.6–275 |

Washi titles use `spreadTitle` ([§6](#6-language)), so the Spanish column above is the
English title. The Spanish titles are on `SPREADS[].titleEs`. Page titles run from
`LEAF_TURNS[i].start + 0.4` through that turn's `end`. There are eight tapes.

`END_CARD = { start: 266.1, end: 275, fadeStart: 271.6 }`.

`CHAPTERS` is derived at import: `{ t: 0, label: tr('chapterCover') }` (Cover / Portada),
then one entry per spread at `s.start` using `L(s.title, s.titleEs)`, then
`{ t: 266.1, label: tr('chapterEnd') }` (See you there / Nos vemos ahí).

`BEATS` (film seconds). Spreads, lights, foley and the score animate to these names.
`photoReveal` and `yes` are proposal times; the object in the source lists those two keys
after `celebrate`.

| Group | Names |
|---|---|
| Cover | `lampOn` 0.4, `coverReveal` 1.5 |
| Walmart | `walmartSign` 12.5, `coworkers` 15.2, `passingBy` 23.1, `shy` 28.6, `kind` 32.3, `curious` 36.6, `somethingMore` 40.9 |
| Lunch | `lunch` 50.1, `quickBreak` 56.8, `hoursTalking` 59.4, `ourThing` 63.4, `sparks` 68 |
| Dates | `creativeDates` 76.6, `strictParents` 82.9, `dogWalk` 85.6, `sisterTagsAlong` 91, `lateNights` 100.2, `uberChaseStart` 101.9, `phoneRescued` 105.4, `memories` 106.8 |
| Fate | `movies` 114.3, `apartSeats` 119.4, `itsAStart` 122.2, `crossPaths` 125.1, `college` 131.7, `leavingWalmart` 134.9, `sameSchool` 137.8, `fate` 142.3 |
| Official | `calendar` 152.8, `official` 155.3, `alreadyDating` 158.5, `schoolTogether` 163.7, `workTogether` 165.6, `firstKiss` 168.6 |
| Life | `buildingLife` 177.4, `firstPlace` 182.3, `cherry` 185.2, `home` 188.9, `japan` 195.1, `nextChapter` 197.9 |
| Proposal | `birthday` 205.6, `kneel` 207.5, `question` 210.1, `photoReveal` 214.2, `yes` 216.1 |
| Wedding and end | `threeYears` 223.9, `weddingDate` 231.5, `iDo` 233.5, `anniversaryWish` 235.9, `notSunday` 239.5, `coworkersMilestone` 245.4, `classmatesMilestone` 246.9, `dogParentsMilestone` 248.2, `homeownersMilestone` 249.3, `husbandAndWife` 250.5, `fullOfFate` 252.5, `celebrate` 259.3, `endCard` 266.1, `fadeOut` 271.6 |

Four version-1 names are still assigned, so older imports keep working:
`payArgument` and `heWins` are `hoursTalking`, `foodUntouched` is `ourThing`,
`dogOfTheirOwn` is `cherry`, `walmartToForever` is `coworkersMilestone`.

`NARRATION` is 35 lines, `{ id, start, end, spread, text, es }`. `text` is English, `es` is
Spanish. `spread` is 0 on the cover and 1..8 after that. Both strings are copied exactly
into [SCRIPT.md](SCRIPT.md), including the typographic apostrophes, the ellipsis, and the
« » quotes on "Sí, acepto". Captions fade over 0.5 s and stay up until 0.6 s after `end`,
or until the next line's `start`, whichever is sooner. The words come from `narrationText`,
so a Spanish viewing shows `es`.

`SPREADS` rows are `{ k, id, title, titleEs, start, open, close, end }`. Spread 8 has
`close: null, end: null`. `start` equals the leaf turn that opens the spread; `open` equals
that turn's end; `close` / `end` equal the next turn, or null when the spread stays open.

Also exported: `clamp`, `lerp`, `seg`, `smoothstep`, `ease` (`linear`, `inQuad`, `outQuad`,
`inOutQuad`, `inCubic`, `outCubic`, `inOutCubic`, `inOutSine`, `outBack`), `leafAngles(t, out?)`,
`spreadAlpha(k, phis)`, and `class Player`. The player reads `performance.now()`, clamps to
`[0, duration]`, and fires `onEnd` at the end. `play()` at the end seeks to 0 first.

The lamp, captions, score and camera turn-shots take their times from these exports. Moving
a turn in `timeline.js` moves them. It does not move a cue whose `t` was written as a
literal, the musical arrangement choices in `audio.js`, or the thickness formulas in
[§2](#2-world-conventions).

## 6. Language

[`i18n.js`](../src/i18n.js) does not import the timeline. `timeline.js`, `titles.js`,
`book.js`, `ui.js` and `main.js` import it. `LANG` is fixed when the module loads and never
changes without a reload:

1. `window.__LANG`, if it is set to a non-empty value. An unknown code stays English and
   does not fall through to the URL.
2. Otherwise the last `lang` query parameter.
3. Otherwise English.

`LANG` is `'en'` or `'es'`. `LANGS` is `['en', 'es']`.

| Export | Behaviour |
|---|---|
| `L(en, es)` | Spanish when `LANG === 'es'` and `es` is a non-empty string; otherwise English |
| `narrationText(line)` | `L(line.text, line.es)` |
| `spreadTitle(spread)` | `L(spread.title, spread.titleEs)` |
| `tr(key)` | `L` on `STRINGS[key]`; an unknown key is returned as itself |
| `coverLines()` | three cover lines. Four words become three by joining the last two with a nbsp, so Spanish is NUESTRA / HISTORIA / DE AMOR |
| `applyChrome()` | `<html lang>`, `document.title`, the meta description, and the static intro card |

`STRINGS` holds the shell: page title, cover title, end-card names (`BRIAN & MARLIN` in both
languages) and date, chapter labels, control names, intro copy, and the two error sentences.
Spread titles live on `SPREADS`, not in `STRINGS`. The intro hint says "about four and a
half minutes" / "unos cuatro minutos y medio". The film is exactly 275 s.

The EN | ES control in `ui.js` reloads the page. It keeps `t` to three decimals and sets
`play=1` when the film was playing. Other query parameters stay.

## 7. Spread module contract

`src/spreads/index.js` exports

`SPREAD_MODULES = [walmart, lunch, dates, fate, official, life, proposal, wedding]`.

Index k−1 is spread k. Ids match `SPREADS`. `src/spreads/_stub.js` is not imported.

```js
export default {
  id: 'walmart',
  title: 'Where it all began',
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
| `BOOK` | `{ PAGE_W, PAGE_D, BOARD_T, COVER_T, LEAVES }` |
| `photos` | eight canvases or null: `cover`, `proposal`, `dog`, `oliver`, `walmart`, `lunch`, `deed`, `tokyo` |
| `figures` | `paintFigure`, `paintDog`, `FIGURE`, `figureCard` (real or stand-in) |
| `characters` | the loaded character set ([§8](#8-characters-scene-art-photos)), empty if the folder is missing or `chars=0` |
| `characterArt` | `characterCard`, `characterFlip`, `actor`, and the loader |
| `FONT` | `{ display, hand, serif }` |
| `timeline` | the timeline module, including `BEATS`, `NARRATION`, `SPREADS`, `COUPLE` |
| `art` | that spread's scene-art set, same methods as `characters`, or `null` |

The file header of `main.js` omits `art` from the context list. The call passes
`art: sceneArt[id]`.

`group` is in spread-frame coordinates. `main.js` calls `update` only while α > 0.002.
Several spreads declare `update(alpha, t)` and ignore `local` (`t − spread.start`); both are
passed. `update` must be a pure function of its inputs: no `Math.random()`, no allocation,
no accumulated velocity. Flip-book frame, squash, bob and slider `u` are computed from `t`.

`cues` is an array of `{ t, hold, at: [x, y, z], size, from }`. `t` is when the camera
should have **arrived**, in film seconds. `hold` is how long to rest. `at` is a point in
**this spread's frame**. `size` is the diameter that must stay in frame (the establishing
cue of a spread uses `size: 7.5`). `from` is `'front' | 'left' | 'right' | 'high' | 'low'`.
A malformed cue is dropped with one warning. A spread with no cues contributes none; the
rig still has its own wide shots.

Mount pieces with `paper.card` / `paper.splitCard` on `popup` mechanisms. Characters go
through `characterArt.actor(...)` or `characterArt.characterFlip(...)`. `fallback` is
`{ who, outfit, pose, ... }` for `figureCard`. Pass `null` when a missing drawing should
leave a hole (the dates spread does this for the car). Give the hero cards an explicit
`height` around 1.5–1.7. The sidecar `units` value is only the default.

On-screen words go through `L()`. A spread does not read `LANG` itself.

### What each spread pops up

**Walmart** (k = 1). The whole floor is the shop. Two mountain V-folds at γ = 1.78 (store,
shelves). Drawings: `him-vest`, `her-vest`, `him-cart`, `her-walkby`, `her-shy`, `him-kind`,
`vest-chat`. Two aisle sliders (`side: 'spread'`). At `coworkers` the vests come in, and the
Walmart print eases in from `coworkers + 0.65` with the caption "Walmart days" / "Los días
de Walmart". At `passingBy` they cross and glance, with "hi" / "hola". At `shy` her tag is
"a little shy". At `kind` his bubble is "Hi! Need a hand?" and his tag is "easy to talk to".
At `curious` question marks between them turn into hearts and the two lean in. At
`somethingMore` the vest-chat card and the "ha ha!" / "¡ja ja!" bubbles are up, and the
warm point light fades in. Lunch, the receipt, the clock and the vending machine are on the
lunch spread.

**Lunch** (k = 2). The staff room, one wall V-fold at γ = π/2 + 0.09. The couple is a
`characterFlip` of `lunch-0`, then `lunch-laugh` from `hoursTalking`, then `lunch-lean` from
`ourThing`. At `lunch` the notice-board schedule writes itself, a circle draws, and a
"same break!" note pops. At `quickBreak` the clock hands move toward 12:30 with a "30 min"
tag. At `hoursTalking` the clock spins on through about three more hours, a "…3 hours later"
tag lands, the window goes day → sunset → night, and speech bubbles come up. At `ourThing`
the MON–FRI tear-off flips and the lunch print appears ("our first lunch date"). At `sparks`
hearts, a ribbon ("our thing") and the warm point light.

**Dates** (k = 3). γ = 1.64. A list card crosses off dinner, then movies, then ticks
"walk the dog" after `creativeDates`. The parents' window twitches at `strictParents`. At
`dogWalk` the `walk-couple` slider moves and Oliver's print is on the page (caption
"Oliver", aspect `PHOTO_ASPECT.oliver`). At `sisterTagsAlong` the `walk-sister` slider
carries "third wheel ★" / "chaperona ★"; she is hidden again before the chase. At
`lateNights` the moon, a dusk wash, and both point lights: warm `#ffc48a` and cool
`#b7c6ee`. At `uberChaseStart` the car (actor id `car`, fallback `null`, so a hole if the
drawing is missing) and the `run-couple` slider. At `phoneRescued` a `phone-cheer` card and
"got it!" / "¡lo tenemos!". At `memories` the ribbon "memories of our own". The same-school
moment is on the fate spread.

**Fate** (k = 4). The cinema facade is a mountain at γ = 1.66. The couple and the ribbon
are a separate pair of valleys at γ = 1.12, so those two stay parallel with each other and
are not mountains. At `movies` the screen, seats, concession and projector pop, the marquee
reads "NOW SHOWING: FIRST DATE" / "HOY: PRIMERA CITA", and the `movies` cycle shows frame 0
(frame 1 at `itsAStart`). At `apartSeats` a note says "one whole seat apart" and popcorn
kernels scatter. At `itsAStart` the note is "…it was a start!". At `crossPaths` the college
hall rises with dotted footprints. At `college` `her-campus` walks in on a slider with
"college?". At `leavingWalmart` the bubble is "leave Walmart?". At `sameSchool` `him-campus`
says "You go here too?!", under a "WELCOME, STUDENTS" banner, and a heart lands on the path.
At `fate` the valley couple and the ribbon "a little bit of fate" are up, and the campus
pair fades. One warm point light.

**Official** (k = 5). The calendar is one mountain at γ = 1.66. At `official` a heart is
drawn around the 7 and OFFICIAL / OFICIAL is stamped, with dust. The couple is
`official-hands` until `alreadyDating`, then `official-banter` (a `characterFlip`, not
`cycle()`). His bubble is "I thought we were already dating!"; hers ("…sure." / "…ajá.")
follows at `alreadyDating + 1.15`, and both fade before school. At `schoolTogether` a
`school-couple` vignette; at `workTogether` a `vest-chat` vignette. At `firstKiss` the
`first-kiss` card, the heart-arch and the garland come up and the calendar sheets lift.
Hearts and confetti run from `official`. One warm point light.

**Life** (k = 6). One couple card at a time, under a sky V-fold at γ = 1.78. Open /
`buildingLife`: moving boxes and the ribbon "building our life". At `firstPlace`: the
apartment, a swinging key, `life-box`, and the tag "our first place". At `cherry`: the
dog-bed, `dog-jump`, then `life-dogcuddle` at `cherry + 0.4·(home − cherry)`, and the print
"Cherry, our girl" / "Cherry, nuestra niña". At `home`: the house, a SOLD / VENDIDA sign,
`life-deed` then `life-keys` (the handoff is the midpoint from `home` to the travel beat),
and the print "signing the deed". The paper plane leaves at narration line `h4`'s `start`.
At `japan`: torii, temple-gate, `japan-selfie`, Fuji on the sky band, and the print
"Tokyo · 2 years" / "Tokio · 2 años". At `nextChapter` that tag replaces the anniversary
tag. One warm point light. `dog-bed` is scene art, not a character.

**Proposal** (k = 7). The party backdrop is the only V-fold, a mountain at γ = 1.78, with
HAPPY BIRTHDAY / FELIZ CUMPLEAÑOS on the right half. Cycle `proposal`: frame 0 until
`kneel`, frame 1 (the kneel, with the ring sparkle) until `yes`, frame 2 (the hug) from
`yes`. The question bubble is "Will you marry me?" / "¿Te casas conmigo?". At `photoReveal`
the `photos.proposal` print swings in, caption "she said yes!" / "¡dijo que sí!". At `yes`
the YES! / ¡SÍ! banner unfurls. `dog-sit` and `dog-jump` watch. Cake, gifts, streamers and
confetti dress the page. Cherry is a girl; there is no bow tie. One warm point light.

**Wedding** (k = 8). The spread never closes. Shared mountain γ = 1.78: trees, arch, the
couple (`wedding` cycle; frame 1 from `iDo`), a garland "3 YEARS" / "3 AÑOS" with numbered
hearts, a ribbon of five milestone portraits (`vest-chat`, `school-couple`,
`life-dogcuddle`, `life-keys`, `wedding-0`), and a "See you there!" banner. The easel
letters the date from `weddingDate`. The desk calendar is up at `anniversaryWish`: Sunday
is crossed out at `notSunday`, Saturday gets the heart, and the notes are "…a Sunday?!" and
"Saturday it is!". At `celebrate`, petals and confetti, and Cherry as `cherry-flower` with
the tag "flower girl: Cherry" / "niña de las flores: Cherry". If that drawing is missing the
fallback is `{ who: 'her', outfit: 'casual' }`, a person, not a dog. Both "I do" bubbles
say "I do!" / "¡Sí, acepto!". Gentle motion continues under the end card. One warm point
light.

`paper.js` still exports `boat()` and `crane()`. None of these eight spreads call them.
`popup.floatingLayer` is exported and unused here.

## 8. Characters, scene art, photos

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
| `who` | non-empty list from `him`, `her`, `dog`, `sister`, `familyDog`, `parents`, `prop`, `oliver`. Every committed scene piece is `["prop"]` |
| `scene` | `walmart`, `dates`, `official`, `life`, `proposal`, `wedding`, or `any`. `lunch` and `fate` are not in this set. The committed sidecars in `art/lunch/` and `art/fate/` use `"any"` |
| `units` | suggested height in world units, `(0, 20]` |
| `cycle`, `frame` | both set, or both omitted. `frame` is an integer ≥ 0. One frame index per cycle |

An invalid sidecar prints errors and exits 1 without replacing a manifest. An empty folder
writes an empty manifest and exits 0.

The eight committed sets, besides `page-left` and `page-right`:

| Folder | Set pieces |
|---|---|
| `art/walmart/` | boxes, carts, checkout, clock, end-cap, shelves-left, shelves-right, shirt-rack, store-front, vending, wet-floor |
| `art/lunch/` | back-wall, clock, counter, fridge, lockers, notice-board, plant, table-small, vending, water-cooler |
| `art/dates/` | bush-row, fence, houses, moon-stars, park-bench, school, street-lamp, trees-a, trees-b |
| `art/fate/` | banner, bike-rack, college, concession, marquee, projector, screen, seats-front, seats-mid, signpost, trees |
| `art/official/` | bouquet, calendar, candle-table, confetti-cluster, envelope-pile, garland, heart-arch, heart-balloons, heart-stick, photo-booth-strip, posts, valentine-cards |
| `art/life/` | apartment, dog-bed, fuji, house, moving-boxes, paper-plane, sky-band, suitcase-stickers, temple-gate, torii |
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
`figures.figureCard(paper, fallback.who, fallback)`. A `null` fallback leaves a hole.

Images must match the sidecar's `w` and `h` or that id is skipped. Load timeout is 12 s.

### Photos

`loadPhotos({ disabled })` returns eight canvases or null, keyed by `cover`, `proposal`,
`dog`, `oliver`, `walmart`, `lunch`, `deed`, `tokyo`. Each canvas has its longest side
≤ 1600. Sources are `photos/<name>.jpg`, or `window.__PHOTOS[name]`. A name missing from
`__PHOTOS` is null; the files are not consulted for that name. `photos=0` or
`disabled: true` fetches nothing and returns eight nulls. The header comment in `photos.js`
says "all three are null" in one sentence; the return value is the eight-key object.

`photoPrint(photo, opts)` paints a polaroid, a deckled print, or an oval medallion. A null
photo with no matching motif is a doodled heart on a blush card. That heart is what the
original three (`cover`, `proposal`, `dog`) show when the file is missing. The other five
names are in `MOTIF_NAMES`. An explicit `motif` selects that stand-in. Otherwise an
`aspect` within 1e-4 of `PHOTO_ASPECT[name]` selects it. The default aspect 0.8 does not
select `cover`.

`PHOTO_ASPECT` is `{ cover: 0.8, proposal: 0.82, dog: 0.7, oliver: 1.333, walmart: 0.779, lunch: 0.75, deed: 1.181, tokyo: 0.893 }`.

Where the files are used: `cover` in the brass medallion; `walmart` on the Walmart spread;
`lunch` on the lunch spread; `oliver` on the dates spread; `dog`, `deed` and `tokyo` on the
life spread; `proposal` on the proposal spread. `tools/prep-photos.py` builds only
`cover.jpg`, `proposal.jpg` and `dog.jpg`. The other five are supplied already cropped.
Details are in [`photos/README.md`](../photos/README.md).

### Fonts

`FONT.display` is Luckiest Guy (Apache 2.0, one file). `FONT.hand` is Caveat 400 and 700
(SIL OFL 1.1). `FONT.serif` is a system stack. `loadFonts()` resolves when the vendored
faces are usable in canvas, never rejects, and registers them with `FontFace` when the page
has no stylesheet. `window.__FONTS['<filename>']` overrides a file. Canvas text uses
`FONT.*`. Call `loadFonts()` before painting. `main.js` does.

## 9. Folding rules

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
angle, so they nest while closing even where the closed footprints overlap. A valley and a
mountain in the same spread are not that exception. Fate is the spread that uses both: the
facade is a mountain (1.66) and the couple plus the ribbon are valleys (1.12), sharing one
valley γ so those two stay parallel.

Sliders in the film: the Walmart aisle (two, `side: 'spread'`), the dates walk, sister, car
and run, and the fate campus walk. Each scales with `popup.rise` so it lies flat while the
page is turning.

`dev/popup.html` checks 200 angles on load (crease perpendicular to the glue lines,
orthonormal mounts, every card corner in its own half and inside the page, flat when closed,
erect when open). Each `dev/spread-*.html?check=1` samples α from π down to 0 and the
spread's open window. There is one harness per spread, including `spread-lunch.html` and
`spread-fate.html`.

## 10. Camera cues

`createCameraRig(camera, { getCues })` → `{ update(t), aim }`. `getCues()` returns the list
`collectCues` built at boot:

```js
{ t, hold, at: Vector3 (world), size, from, spread }
```

Conversion: pose the book at that spread's `open` time (the left page lies flat, so a
negative spread-frame x is simply the left page), then multiply `at` by the anchor's world
matrix. `collectCues` fills a missing `hold` with 0, a missing or non-positive `size` with
7.5, and a missing `from` with `'front'`. The rig, if it is handed a non-finite `hold`,
uses 1.4, then clamps a finite hold to [0, 14]. A spread that omits `hold` therefore rests
0 s, not 1.4 s.

The rig knows the book, the timeline and that list. It does not know which spread is which.
Its own shots:

- **Prologue.** A slow push in on the closed cover from t = 0 until 0.4 s before the first
  turn (`TURN_LEAD`). The cover's top is `COVER_TOP`.
- **Page turns.** A wide, slightly high, centred view, from 0.4 s before the leaf moves
  until the turn ends. All eight turns get one.
- **End card.** From `END_CARD.start` to `DURATION`, a pull back and up. The look-at height
  is `openPageY(SPREADS.length)`, the open wedding spread. Negative vertical bias sinks the
  book so the names sit above it.

Between those it travels cue to cue: arrive at `t`, rest for `hold` (a slow drift, never a
hard lock), then ease on. Cues closer than 1.2 s are blended through. A cue is dropped when:

- `cueOnOpenSpread` says the spread is not open: before `open − 0.2`, or after
  `close − 0.02` when the spread has a close. The wedding never closes, so a late cue there
  stays. This is what stops a beat that has moved past a page turn from aiming at a closed
  page.
- `insideTurn`: from `turn.start − 0.4 + 0.02` through `turn.end + 0.15`.
- at or after `END_CARD.start − 0.08`.
- before the first turn's `start − 0.4 − 0.05`.

A spread that supplied no surviving cue gets one generated wide shot at `openPageY(k)`.
Channels are cubic Hermite with Fritsch–Butland tangents (C1, no overshoot). An empty cue
list still produces a finite rig. A non-finite sample is replaced with the camera at
(0, 8.2, 10.4) looking at (0, 0.5, 0). The (0, 8.5, 11) camera in
[§1](#1-shape-of-the-program) is only the stand-in used when `camera.js` fails to load.

`from` picks an azimuth and elevation: front (0°, 40°), left (−34°, 32°), right (34°, 32°),
high (0°, 58°), low (0°, 16°). A closer `size` uses a slightly longer lens: 31.5° when
`size` is below 4.4, 33.5° from 4.4 up to 6.8, and 35.5° at 6.8 and above. It actually
comes closer. The minimum distance is 3.4. Close cues (`size` < 5.2) use a fit margin of
1.46; wider cues use 1.2, and the vertical subject is taller for a close cue. Front and low
views then multiply that distance by 1.4, because the view runs along the page depth.
Shots are composed for aspect 1.5. Below that, down to a floor of 0.2, the rig widens the
fov (at most 62°) and dollies back, splitting the deficit more toward fov when the aspect
is under 1.4. Wider than 1.5, the vertical framing stays and you see more desk.

Handheld drift (a few slow sines, a little more on wide shots, plus lens breathing) is off
while `prefers-reduced-motion: reduce` matches. The match is read live. A caption bias lifts
the subject off the bottom band; turn shots are biased the other way so the washi title
clears the rising page.

`dev/camera.html` draws a marker on the active cue and dashed guides at the top 10% and the
bottom 16%. `window.__cam.sample(t, aspect?)` returns `[px, py, pz, tx, ty, tz, fov]`.

## 11. Lights and proxies

`environment.js` owns four lights, and only their intensities and colours change:

| Light | Role |
|---|---|
| SpotLight `desk-lamp` at (−5, 9, 4), aimed at (0.3, 0.4, −0.3) | the only shadow caster. Map 2048², PCF soft shadows, half-angle 0.82 rad, penumbra 0.75. Candela 400 at warm level 1 |
| HemisphereLight `room-fill` | sky / ground fill |
| DirectionalLight `front-fill` at (6, 7, 7) | warm bounce on faces turned toward the reader |
| DirectionalLight `side-fill` at (9, 3, 2.5) | intensity stays 0 for the whole film, so the light count never changes |

The schedule is in [§5](#5-master-schedule): ignition `lampOn` to `lampOn + 2.4` (0.4–2.8),
level 1 until the proposal spread, proposal at 0.85 with a +0.18 swell around `yes`,
wedding at 1.15, fade across `[fadeStart − 3, end − 0.5]` which is 268.6–274.5. Mood is
chosen by spread id (`proposal`, `wedding`), not by a hard-coded k. The comment in
`environment.js` that names 147.5–152.5 is the old window; the numbers in `FADE_OUT` are
computed from `END_CARD`. The desk is a 40 × 40 walnut plane at y = 0, fading into the
room colour between radii 6.2 and 13.2 (the open album is 7.2 wide). Fog and the backdrop
share that horizon colour. 320 dust motes, seeded with `makeRng(4242)`, drift in the vertex
shader from `t` and glow only inside the lamp cone.

A hidden spread would remove its point light and force three.js to rebuild shader programs.
`adoptLights` clones each spread `PointLight` into a proxy that stays in the scene, hides
the original, and `syncSpreadLights` copies world position, colour, intensity, distance and
decay every pose. The proxy's intensity is 0 while the spread (or the light's own parent
chain) is hidden. Other light types are not proxied. Seven spreads contribute one point
light. Dates contributes two (warm and cool). The rendered set is the four environment
lights plus nine proxies, all the time.

`book.update(t)` measures spot and hemisphere irradiance on the cover to drive the brass.
It does not add a light.

## 12. Determinism and seekability

Every posed frame is a pure function of film time `t`. Scrubbing backward and forward
matches, and `tools/render-video.mjs` can seek frame to frame on one loaded page.

- **No runtime `Math.random()`.** Seeds: spread k uses `makeRng(1000 + k)`, the score uses
  `makeRng(20260206)`, dust uses `makeRng(4242)`. Painters in `book.js`, `paper.js`,
  `photos.js` and `figures.js` take their own mulberry32 seeds at build time.
- **No accumulated motion.** `spread.update`, `camera.update`, `environment.update`,
  `book.update` and `titles.update` recompute from `t` (and α, which is a function of `t`).
- **Titles** use no CSS transitions and no timers. Opacity and drift come from `t`. The DOM
  is written when a rounded value changes. `prefers-reduced-motion` zeros the drift.
  `titles.js` reads `narrationText` and `spreadTitle`. Its header still says the tape shows
  `SPREADS[k].title`; the tape shows `spreadTitle(spread)`.
- **Audio** is one sorted event list in film seconds. `sync(t, playing)` treats
  \|t − expected\| > 0.3 s as a seek, fades the session out over 60 ms, and starts a fresh
  session after playback has been steady for 80 ms. The narration buffer is started at
  offset = current film time. Duck breakpoints are the `NARRATION` line edges plus 0.25 s.
  Peak target for music plus foley, with no narration file, is at or under −3 dBFS.
  `dev/audio.html` checks that, including the 6 dB duck. Its HTML comment still says
  "0–153 s"; the check imports `DURATION` (275) and measures silence after `DURATION − 0.5`.
- **No per-frame allocation** on the hot path: shared vectors in `popup.js`, one reused
  angle array of length `LEAVES` in `main.js`, cached figure canvases.
- Wall-clock code is `Player`, the UI idle timer (2.5 s), the tab-visibility pause, and
  the intro timers.

**Narration lookup**, in order, for `mp3`, then `m4a`, then `wav`:

1. `audio/narration.${LANG}.*`
2. `audio/narration.*` (no language suffix)
3. `window.__NARRATION_URL`

The first file that fetches is decoded and locked to film time. No file: no duck, no error.
In the browser the music bus ducks 6 dB (`DUCK_DB = 6`, ramps of `DUCK_RAMP = 0.25` s)
under each `NARRATION` line. Foley does not duck. `render-video.mjs --narration` renders
the score with `renderOffline` without that envelope, then ffmpeg applies `volume=-6dB` to
the whole music bed for the length of the clip and mixes the file on top. `--narration`
does not choose `narration.en.*` by itself; pass the file.

The score is one 4-bar love theme in F, 3/4, an unmetered overture on the cover, then one
section per spread. Walmart is playful (124, 118, 110, then 102 BPM). Lunch slows (100, 82,
66). Dates walks, turns to night, then a short chase. Fate opens on a cinema organ. Official
states the waltz and then a solo around the kiss. Life travels, and a koto takes the Japan
passage. The proposal hushes and blooms on yes. The wedding states the theme, rings a pop
on each of the five milestones, cadences, and fades under the end card.

Foley: lamp click, and on every leaf turn (there is no skipped leaf) a rustle, a whoosh for
the whole turn, and a flap, plus a creak and a thump on the cover turn. A shutter on the
prints named `coworkers`, `ourThing`, `dogWalk`, `cherry`, `home`, `japan`, `photoReveal`.
A stamp at `official`. Pen scratches at `home`. A clock that speeds up from `hoursTalking`
to `ourThing`. A projector whirr from `movies` to `apartSeats`. A school bell at
`sameSchool`. A pop at `yes` and at each of the five milestone beats.

## 13. Privacy

The repository is public. Two gitignores keep the photographs and the character drawings out:

- `love-story/.gitignore` ignores `photos/*` and then un-ignores `photos/README.md` and
  `photos/.gitignore`. It also ignores `characters/` as a whole, plus `node_modules/` and
  `.DS_Store`. It does not name `audio/`.
- `photos/.gitignore` ignores everything in that folder except `README.md` and itself.

Recordings (`audio/narration.en.*`, `audio/narration.es.*`, and the unsuffixed fallback)
must not be committed. The ignore files do not enforce that; leave them out of the commit
by hand.

What the film will load, and what a fresh clone shows:

| Path | Loaded by | When it is missing |
|---|---|---|
| `photos/<name>.jpg` for the eight names in [§8](#8-characters-scene-art-photos) | `photos.js` | `null`. Cover emblem is a cut-paper heart. The original three prints are the doodled heart. The five added names draw their motif when the aspect matches. `?photos=0` skips the fetch |
| `characters/manifest.json` and the images it names | `characters.js` | empty set, silent. `actor()` uses paper dolls, or a hole when the fallback is `null`. `?chars=0` skips the fetch |
| `art/<id>/manifest.json` and its WebP pieces, eight folders | the same loader, base `./art/<id>/` | empty set. Spreads paint `paper.page` backgrounds and skip set pieces. The committed tree has all eight |
| `audio/narration.<lang>.(mp3\|m4a\|wav)`, then `audio/narration.(mp3\|m4a\|wav)` | `audio.js` | no narration, no duck, no error |

Do not copy the photographs, the character drawings, or the recordings anywhere else in the
tree. Do not embed them in source. `window.__PHOTOS` and `window.__CHARACTERS` exist so a
single-file host can pass them in memory; nothing in `tools/` writes such a file.

**`snap.mjs` guard.** Screenshots can contain the photos. If `--out` is inside the git
work tree (the directory walked upward from `love-story/` until a `.git` is found, or
`love-story/` itself when there is none), the tool throws unless the query's last `photos`
value is `0`. Optional 404s, listed under `optionalMissing` and not counted as failure, are
exactly: `photos/<file>.{jpg,jpeg,png,webp}`, `audio/narration` with an optional `.en` or
`.es` before the extension, `characters/<path>.{json,png,webp}`, and
`art/<lowercase-name>/manifest.json`. A 404 of a scene-art WebP is a real failure. The
default timeout is 120000 ms. `--lang en|es` appends `lang=` (the last occurrence wins).
The page is opened with `ui=0` plus `t=<time>` when `--times` is set.

`render-video.mjs` has no equivalent guard. Pass `--query "photos=0"` yourself when the
MP4 will leave the machine. Its optional-asset regex covers photos and `audio/narration`
(optional language suffix) only, so a missing character file or a missing scene manifest
fails that run. `--lang en|es` appends `lang=`. The default output name is `film-<lang>.mp4`
(from `--lang`, else from an existing `lang=` in `--query`, else `en`). `--to` defaults to
`DURATION` imported from `timeline.js`. At 30 fps that is 8250 frames.

## 14. Adding or changing a scene

**Change the scene that is already there** (same id, same place in the film):

1. Keep `id` equal to the row in `timeline.js` `SPREADS`. The module's `title` is the
   English title; Spanish lives on `titleEs` and is chosen by `spreadTitle`. Read times
   from `timeline` (`BEATS`, `NARRATION`, `SPREADS`, `END_CARD`). Do not write a
   film-second literal in the spread. Letter every on-screen string with `L(en, es)`.
2. Page art: 1024 × 853, orientation in [§4](#4-page-art-orientation). Prefer
   `art.canvas('page-left')` and `'page-right'`. If either is missing, paint with
   `paper.page` so the spread still builds.
3. Set pieces: a cut-out WebP plus a sidecar in `art/<id>/`, then
   `node tools/build-character-manifest.mjs --dir art/<id>`. Mount them with
   `characterArt.characterCard(paper, art, name, { height })` on a `popup` mechanism.
   One γ per family of V-folds that must nest. Fate is the pattern for a valley beside a
   mountain: give the valley pieces one shared γ below π/2. Size with `vFoldLimits` /
   `standUpLimits`. Obey R1–R3. Shrink anything thick with `popup.rise(alpha)` before the
   page can close on it. A new scene id has to be added to the manifest's `SCENES` set, or
   the sidecar must say `"scene": "any"` the way lunch and fate do today.
4. Characters: `actor` or `characterFlip`, with a `figures` fallback for every person, so
   `chars=0` and a fresh clone still play the beat. Pass `null` only when a hole is the
   intended missing-drawing look. Animate from `BEATS`: flip-book index, a squash on the
   beat, a small idle bob. All of that from `t`, allocated up front.
5. Point lights only, `castShadow = false`. `main.js` proxies every `PointLight`. A
   non-point light is not proxied and will change the program set when the spread hides.
   Dates already has two point lights; that is the pattern for a second one.
6. `cues` in spread-frame coordinates. First cue at `spread.open`, `size` 7.5, `from`
   `'front'`. Further cues on the beats worth a close look, `size` about 1.8–3.2. The rig
   drops a cue that falls outside the open window ([§10](#10-camera-cues)) or inside a
   turn.
7. `update(alpha, t, local)` pure. The dev page `dev/spread-<id>.html?check=1` should
   print PASS. Views and the fold test are described in the README.

**Move a time** (a longer narration, a later "yes"):

1. Edit `NARRATION`, `BEATS`, `SPREADS`, `LEAF_TURNS`, and `DURATION` / `END_CARD` if the
   film grows. `CHAPTERS` follows `SPREADS` and `END_CARD`. Keep `text` and `es` as the
   recorded words; [SCRIPT.md](SCRIPT.md) is generated from them and has to be updated with
   them.
2. Leaf turns are what open and close spreads: spread k opens while leaf k−1 turns, and
   the row `SPREADS[k − 1]` (`start`, `open`, `close`, `end`) should stay consistent with
   `LEAF_TURNS`. The array is ordered by `k`, so index 0 is spread 1. The last spread stays
   open (`close: null`) for as long as the end card is shot on it.
3. Re-read the spreads. Cue times that were derived from `BEATS` follow. A cue with a
   hand-tuned `hold` may now sit past `close − 0.02` or inside a turn; the rig will drop it.
4. Lights, captions, page titles and the score's event times follow the exports. Listen
   anyway: `audio.js` chooses *which* gesture happens on a beat (the Uber run, the koto,
   the joy theme). A beat that moves across a section boundary can land in the wrong
   arrangement. `dev/audio.html` checks peak, holes, turn foley, silence after
   `DURATION − 0.5`, and the duck. The open-page height does not depend on time. It does
   depend on `LEAVES` and the two thicknesses.

**Add another spread** (one more leaf):

1. `dims.js`: `LEAVES` (page size too, if the album changes). `leafAngles`, the φ array in
   `main.js`, and the hinge scratch in `book.js` are sized from `LEAVES`.
2. `book.js`: cover and back cover are leaf 0 and leaf `LEAVES − 1`. The hover gap and
   `openPageY` are formulas, so a new count updates them. Anything that still assumes eight
   anchors has to be read.
3. `camera.js`: the end-card shot uses `openPageY(SPREADS.length)`. A new last spread
   becomes that height on its own.
4. `timeline.js`: one more `LEAF_TURNS` row, one more `SPREADS` row (with `titleEs`),
   narration in both languages, beats, `DURATION`, `END_CARD`. The previous last spread
   currently has `close: null`. Give it a close, and let the new last spread be the one
   that stays open if that is still the design.
5. `src/spreads/<id>.js`, register it in `SPREAD_MODULES` at index k−1, and add
   `dev/spread-<id>.html` by copying one of the eight. Copy the fold check. Add a washi
   colour if the eight tapes are not enough; the list already wraps with `%`.
6. `art/<id>/` plus a manifest. `main.js` discovers art folders from `timeline.SPREADS`,
   so a new id is loaded once it is in that table. Add the id to `SCENES` in
   `build-character-manifest.mjs`, or mark the sidecars `any`.
7. `environment.js` mood blends look up the spreads whose ids are `proposal` and
   `wedding`. A new ending needs a look of its own, or the wedding gold will not be the
   last look.
8. `audio.js`: a section function for the new id, called from `buildEvents`. Turn music
   and turn foley already loop every `LEAF_TURNS` row. There is no skipped leaf.
9. Warm-up times are derived from `LEAF_TURNS` and `DURATION`. They grow on their own.
   Today that list has 18 moments.

Keep `characters/` and `photos/` out of the commit, and keep narration files out as well
([§13](#13-privacy)). Scene art is scenery. People go in `characters/poses/` and through
the manifest.

## 15. Verification

- **`tools/snap.mjs`** screenshots the film or any dev page and fails on console errors,
  page errors and failed requests, with the privacy guard, `--lang`, and the optional-asset
  list in [§13](#13-privacy).
- **`tools/render-video.mjs`** seeks the running film per frame. That only works because of
  [§12](#12-determinism-and-seekability). `--lang` selects the language and the default
  output name. It exits non-zero on failure, writes a one-line summary to stdout and
  progress to stderr. A score that cannot be rendered still leaves the silent picture, and
  says so.
- **Self-tests:**
  - `dev/popup.html` — 200-angle mechanism test, on load.
  - `dev/book.html?check=1` — ground contact, leaf overlap, gutter and anchor fit, float of
    the thinner pile. Result on `window.__check`.
  - `dev/spread-<id>.html?check=1` — fold test, `PASS` / `FAIL` on the HUD and the console.
    One page per spread id.
  - `dev/audio.html` — offline score, peak ≤ −3 dBFS, chapter energy, turn foley, silence
    after `DURATION − 0.5`, 6 dB duck. `?quick=1` renders three windows only. The comment
    at the top of the file still says the film is 0–153 s.
  - `dev/prints.html` — glyph coverage of the characters the film letters. A fallback glyph
    is `console.error`, so `snap.mjs` fails. The specimen grid still paints `cover`,
    `proposal` and `dog` only, and the page comment still says "three photos".
    `loadPhotos()` itself returns all eight.
- **`dev/smoke.html`** sets `window.__ready` after two frames. It is the toolchain test,
  not a picture of the film.

Line counts of the source, the shell and the tools are in the README module map. They were
taken with `wc -l`.
