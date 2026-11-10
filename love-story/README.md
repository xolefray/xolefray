# Our Love Story

*A 153-second pop-up scrapbook film. It renders live in the browser with three.js.*

A hand-made scrapbook lies on a walnut desk under a warm lamp. The cover opens, six paper
worlds rise one after another, and the pages tell how Brian and Marlin met and got engaged.
Hand-drawn cartoon cut-outs of them act out each moment, storybook captions carry the
narration, and a small score plays along. The whole film is one timeline: scrub anywhere and
the book, the camera, the words and the music are exactly where that second says they should be.

Nothing is downloaded at runtime. Scene art is painted pictures loaded from `art/`. Pop-ups are
real folding geometry posed by the page's opening angle. The music is synthesized with
WebAudio. There is no build step and no runtime dependency other than a vendored copy of
three.js r170.

## What happens

The book's cover is the title: pebbled brown leather, a red cloth spine, a cord tied in a bow,
and **Our Love Story** in multicoloured cut-paper letters. The couple's cover photo sits in a
brass oval, or a cut-paper heart when that photo is absent. The lamp warms up from 0.4 s to
2.8 s. Two lines play over the closed book, and then the leaves start to turn. Each leaf takes
3 seconds. While a leaf turns, the spread it opens shows its title on a strip of washi tape.

| Time | Chapter | What happens |
|---|---|---|
| 0:00 | Cover | Closed book. Captions at 2.5–4.9 s and 5.4–9.4 s. The cover turns at 9.5–12.5 s. |
| 0:09.5 | How we met | Walmart, 9.5–41 s (open 12.5–38 s). Coworkers on the shop floor, then the lunch-break table: talking, laughing, arguing over who pays. He always wins. The food sits untouched. |
| 0:38 | The “dates” | 38–72.5 s (open 41–69.5 s). Strict parents, so a walk with the dog is a date. Her little sister comes along. They chase down an Uber to rescue a lost phone. Then they end up at the same school. |
| 1:09.5 | February 7, 2024 | 69.5–87 s (open 72.5–84 s). They make it official. He still swears they were already dating. |
| 1:24 | A life together | 84–107 s (open 87–104 s). A first place, a dog of their own, a home with both their names, and a trip to Japan. |
| 1:44 | The question | 104–123 s (open 107–120 s). On her birthday he kneels and asks. A photo of the moment. She says yes. |
| 2:00 | February 6, 2027 | From 120 s, fully open at 123 s, and it never closes. The wedding date is one day before their anniversary. They love that date, just not on a Sunday. From Walmart coworkers to forever. |
| 2:25.5 | See you there | The end card (145.5–153 s) shows Brian & Marlin, a small heart, and February 6, 2027. The picture fades to black from 150.5 s to 153 s. |

The film is 153 seconds, two minutes and thirty-three seconds. The page calls that about two
and a half minutes.

## Watch it

From this folder:

```sh
node tools/serve.mjs          # serves love-story/ at http://127.0.0.1:8080/
node tools/serve.mjs 3000     # …or on another port
```

Open the printed URL and press **Begin**. The film is best with sound. Any static file server
works too (`python3 -m http.server`, `npx serve`, …). The page must be served over `http://`
because ES modules and the import map do not load from `file://`. The bundled server only
listens on 127.0.0.1. To watch on a phone, use a server that is reachable on your network.
Below 520 px the control bar tightens and hides the chapter name. On a narrow frame the camera
widens its lens and dollies back so the open book stays in view.

You need a browser with WebGL 2 (three.js r170). Sound starts on your first click or key press,
as browsers require.

If something goes wrong, the film says so instead of freezing:

- **No WebGL, or the film fails to load:** the intro card shows a short message. The same
  message appears when the module script cannot load at all, for example in a sandboxed frame.
- **The graphics driver drops the picture** (WebGL context lost): the film pauses behind a
  short notice and resumes when the browser restores it.
- **No full screen available:** the full-screen button is hidden, and a refused request is ignored.
- **Reduced motion:** with `prefers-reduced-motion`, the camera's handheld drift and lens
  breathing are off, and the captions and page titles fade without drifting. The washi labels
  keep their tilt.

## Controls

| Input | What it does |
|---|---|
| **Begin** (or Enter / Space on the intro card) | starts the sound and plays from the beginning |
| Click on the film | play / pause |
| Double-click on the film | full screen (mouse) |
| Tap (touch) | shows hidden controls; a second tap plays or pauses |
| Scrubber | drag to seek (pauses while you drag, then resumes if it was playing); hover shows time + chapter |
| Control bar | play / pause / replay, time, current chapter, mute, full screen |
| **Read it again** | appears at the end; plays the film again from the start |

The controls and cursor hide after 2.5 s without input while the film plays. Your mute choice
is remembered in `localStorage` under `our-love-story:muted`.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | play / pause |
| ← / → | back / forward 5 s |
| Home | restart from the beginning (and play) |
| M | mute / unmute |
| F | full screen |
| ↑ / ↓ *(scrubber focused)* | forward / back 5 s |
| PageUp / PageDown *(scrubber focused)* | forward / back 15 s |
| End *(scrubber focused)* | jump to the end |

Space, the arrow keys, Home, M and F also work with `ui=0`. The scrubber keys need the
scrubber focused, so they need the control bar on screen.

### URL parameters

If a parameter appears more than once, the last occurrence wins.

| Parameter | Effect |
|---|---|
| *(none)* | poster frame (t = 22 s) behind the intro card; **Begin** plays from 0 |
| `t=<seconds>` | opens paused at that time, without the intro card |
| `play=1` | plays immediately, from `t` if it is given, otherwise from 0 |
| `ui=0` | no controls and no intro card, which gives clean frames (`?t=38&ui=0`). With no `t` and no `play`, this opens paused at 22 s |
| `mute=1` | starts muted (otherwise the saved mute preference is used) |
| `captions=0` | hides the narration captions. Page titles, the end card and the fade stay |
| `photos=0` | does not load the couple's photos. Every print shows its illustrated placeholder |
| `chars=0` | does not load the hand-drawn characters. The paper-doll figures stand in |
| `free=1` | replaces the camera rig with an orbit camera (drag to orbit; for debugging) |

For automation the page exposes
`window.__film = { seek(t), play(), pause(), time, playing, duration, cues }` and sets
`window.__ready = true` once the intro has settled and the scene has rendered at least two
frames.

## Private pictures

The repository is public. Two kinds of pictures stay off it.

**Photographs** live in [`photos/`](photos/README.md). The film expects three upright sRGB
JPEGs, metadata stripped:

| File | Where it appears |
|---|---|
| `photos/cover.jpg` | the oval set into the cover (the tool saves it at 1200 px on the long side; the print is 4:5, so that is the height) |
| `photos/proposal.jpg` | spread 5, "The question" (at most 1600 px on the long side) |
| `photos/dog.jpg` | spread 4, "A life together" (at most 1600 px on the long side) |

`.gitignore` ignores `photos/*` and keeps only `photos/README.md` and `photos/.gitignore`.
A missing file is `null`. `photoPrint` then paints a blush card with a doodled heart, and the
cover paints a cut-paper heart in the brass frame. `?photos=0` fetches nothing. Use it for any
screenshot or recording that leaves your machine. See [`photos/README.md`](photos/README.md)
for `tools/prep-photos.py` (`--cover`, `--proposal`, `--dog`, `--out`, `--cover-quad`,
`--cover-flat`, `--no-cleanup`). A single-file host can supply the same three images as
`window.__PHOTOS = { cover, proposal, dog }` (URLs or data URIs).

**Hand-drawn characters** live in `characters/`, which `.gitignore` ignores entirely. The film
expects `characters/manifest.json` plus the images named by that manifest (drawings in
`characters/poses/`, each a PNG or WebP with a sidecar JSON). Without the folder, every scene
still runs: `actor()` uses the code-drawn paper dolls in `src/figures.js` (Brian, Marlin, her
little sister, their chihuahua, the family dog). `?chars=0` forces that path and fetches
nothing. A single-file host can set `window.__CHARACTERS = { manifest, images }`.

Rebuild the manifest after adding or changing pose sidecars. From this folder:

```sh
node tools/build-character-manifest.mjs
```

It reads `characters/poses/*.json`, checks each sidecar against its image header, and writes
`characters/manifest.json`. No poses yet writes an empty manifest and exits 0. An invalid
sidecar exits 1 and leaves an existing manifest in place.

The scenery is different. `art/walmart/`, `art/dates/`, `art/official/`, `art/life/`,
`art/proposal/` and `art/wedding/` are committed. Each piece's sidecar says `who: ["prop"]`:
pages, furniture, stores, trees, banners, cakes. The people are the private character
drawings, or the paper dolls when those drawings are absent.

## Add a voice-over

Drop one recording at `audio/narration.mp3`, or `.m4a`, or `.wav`. The film tries those
extensions in that order and plays the first file it can decode. Sample 0 of the file is film
time 0, so leave silence until the first line at 2.5 s and let each line land on the clock
below. Seeking and pausing restart the file at the right offset. While a line is up, the
music ducks 6 dB (0.25 s ramps). Foley does not duck. No file: no duck, no error.

`window.__NARRATION_URL` replaces that search (a single-file host uses it).

The script is `NARRATION` in [`src/timeline.js`](src/timeline.js). He and she, never their
names. Record against these times:

| Start–end (s) | Text |
|---|---|
| 2.5–4.9 | Every love story starts somewhere. |
| 5.4–9.4 | A ballroom. A beach. A café in Paris. |
| 12.0–14.2 | Theirs started at Walmart. |
| 15.0–16.3 | Yes, really. |
| 17.5–19.3 | They were coworkers first. |
| 19.8–26.5 | Then came the lunch breaks, full of talking, laughing, and arguing over who was going to pay. |
| 27.0–28.4 | He always won. |
| 29.3–33.2 | They talked so much they could never finish their food. |
| 33.8–37.2 | That's when they knew this was something different. |
| 42.0–43.8 | It wasn't exactly simple. |
| 44.3–49.2 | There were strict parents, so a walk with the dog became a date. |
| 49.8–55.6 | Her little sister came along on just about every outing, their most dedicated chaperone. |
| 56.5–62.6 | Once, they chased down an Uber to rescue a lost phone, and called it an adventure. |
| 63.6–68.2 | Then fate stepped in again, and sent them to the same school. |
| 73.5–78.6 | On February 7th, 2024, they finally made it official. |
| 79.8–82.8 | He still swears they were already dating. |
| 88.0–90.6 | After that, the pages filled up fast. |
| 91.4–93.0 | A first place together. |
| 93.8–95.4 | A dog of their own. |
| 96.2–98.8 | A home with both their names on it. |
| 99.6–102.2 | And a trip all the way to Japan. |
| 108.5–113.4 | Then, on her birthday, he asked the one question he'd been saving. |
| 116.0–117.6 | She said yes. |
| 124.5–131.6 | Now they're getting married on February 6th, 2027, one day before their anniversary. |
| 132.4–133.9 | They love that date. |
| 134.4–136.0 | Just not on a Sunday. |
| 138.0–140.8 | From Walmart coworkers to forever. |
| 141.6–144.4 | We can't wait to celebrate with you. |

To retime a recording, edit `NARRATION`, `BEATS`, `SPREADS` and `LEAF_TURNS` in
`src/timeline.js`. Captions, page titles, the lamp, the score and the camera's turn shots
read those exports.

## Export a video

`tools/render-video.mjs` renders the film frame by frame in headless Chromium with software
WebGL (SwiftShader), screenshots included, and encodes them with ffmpeg (`/usr/bin/ffmpeg`,
libx264 and aac). It needs a global Playwright with Chromium. No measured frames-per-second
figure is recorded in the tool: it is slow, and the time scales with resolution, frame count
and `--jobs` (default 3, one Chromium each).

```sh
node tools/render-video.mjs --out our-love-story.mp4
node tools/render-video.mjs --out our-love-story.mp4 --size 1280x720 --query "photos=0" --jobs 3
node tools/render-video.mjs --out proposal.mp4 --from 104 --to 123 --narration take.wav
```

| Option | Default | Meaning |
|---|---|---|
| `--out` | required | MP4 path |
| `--size` | `1920x1080` | even width and height (yuv420p) |
| `--fps` | `30` | frames per film second. 153 s at 30 fps is 4590 frames |
| `--from` / `--to` | `0` / `153` | film-time range, `--to` exclusive |
| `--jobs` | `3` | parallel Chromium jobs (integer ≥ 1) |
| `--query` | empty | extra URL parameters (`photos=0`, `chars=0`, `captions=0`, …) |
| `--crf` | `18` | libx264 quality, 0–51 |
| `--narration` | none | mix this audio file on top |
| `--no-audio` | off | picture only |
| `--keep-frames` | off | keep the temporary JPEGs |

The picture is opened with `ui=0` and `mute=1`, then seeked per frame, so the DOM captions
are in the image and the browser's own audio is not the soundtrack. The score is rendered
separately with `renderOffline` at 44100 Hz, written to a WAV, and muxed as AAC at 192 kbps.
`--narration` seeks that file to `--from` and lowers the **entire** music bed by 6 dB for the
whole clip. In the browser, the same 6 dB applies only under each spoken line. Pass
`--query "photos=0"` when the MP4 will leave your machine and the photos are present.

## How it's made

### The book

[`book.js`](src/book.js) builds seven leaves: the front cover, five scrapbook cards, and a back
cover that never turns. They are a **hinge chain**. Each leaf turns about its own gutter edge,
and that edge rides on its neighbour, so both printed surfaces of a spread leave the same line
at every angle, including mid-turn. The chain is then lifted until its lowest corner rests on
the desk. An open spread is flat, so the thinner pile hovers by a few board-thicknesses; a
dark plinth and a contact shadow hide the gap. Page size is the landscape album in
[`dims.js`](src/dims.js): 3.6 by 3.0 world units (1 unit ≈ 10 cm).

### Pop-up mechanisms

[`popup.js`](src/popup.js) poses every mechanism from the spread's opening angle α
(0 = closed, π = flat open), in closed form:

- **V-fold.** A card creased down the middle, glued to both pages along lines at angle γ from
  the gutter. The crease is the cross product of the two glue directions. γ below π/2 is a
  valley (opens toward the reader). γ above π/2 is a mountain (the vertex points at the
  reader), which is what the tall back layers use. Every V-fold in a spread shares one γ, so
  the halves stay parallel and nest as the page closes.
- **Stand-up.** A flat piece on one page, hinged perpendicular to the gutter, standing at α/2.
- **Slider.** A pull-tab on a path, moved by a parameter u. The dates spread rides the walk
  and the Uber chase on sliders.
- **Floating layer.** A platform on two parallelogram walls, parallel to the pages, with a
  frame you can nest other mechanisms on. The engine has it; these six spreads do not use it.
- **onPage.** Flat on a page, for notes, confetti and small scatter.

Three **folding rules** keep the book able to close. **R1:** at α = 0 every footprint lies
inside its page. **R2:** each piece stays between its page and the bisector plane (a stand-up
needs its height ≤ its distance from the gutter, minus half its width; up to twice that is
tolerated where the facing page is bare). **R3:** footprints on the same page do not overlap,
so pieces never meet. Thick or free-floating extras shrink or hide with `popup.rise(α)` before
the pages can reach them.

### Characters, scene art, camera, words, music

Hand-drawn characters are die-cut cards: a white paper margin, feet planted on the mount,
front toward the reader. A cycle is a flip-book. `characterFlip` stacks the frames and
`show(i)` reveals one, scaled so the feet stay put. When a drawing is missing, the paper dolls
take that spot.

Each spread's scenery is a set of die-cut cards from `art/<scene>/`, plus page backgrounds
(`page-left.webp`, `page-right.webp`, 1024 × 853). Lettering on signs and banners is painted
in code with the two vendored fonts.

The camera is cue-driven. Each spread lists shots in its own frame (`t`, `hold`, where to
look, how wide, which side). The rig turns those into world-space moves, and it owns the
prologue, a wide view of every page turn, and the pull-back for the end card. Moves are
cubic Hermite splines that do not overshoot.

Captions come from the narration table (storybook italic, bottom centre). Page titles ride
the turns. The end card is Brian & Marlin in the display face, the wedding date in
handwriting, and a heart. A black veil finishes the film.

The score is one 4-bar love theme in F, in 3/4, restated for each chapter: sparse bells on
the cover, pizzicato at 116 BPM in the store, a stroll at 80 BPM on the dates, a plain
statement when they make it official, layers through their life (bells at 76 BPM, a bass from
the house, koto plucks in Japan), a hush and then the fullest statement on "yes", and a broad
wedding. Paper foley marks the lamp, every page turn, the official stamp, the proposal
shutter and the "yes" pop. The event list is in film seconds, so a seek restarts in the right
place. With a narration file, the music ducks under each line.

All of that is driven by [`timeline.js`](src/timeline.js): duration, leaf turns, spreads,
beats, narration, and the end card. The architecture — conventions, the spread contract, the
manifests, the rules — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Module map

| File | Responsibility | Lines |
|---|---|---|
| [`index.html`](index.html) · [`styles.css`](styles.css) | page shell, intro card, control-bar styling | 77 · 815 |
| [`src/main.js`](src/main.js) | boot, warm-up, frame loop, light proxies, URL parameters, test hooks | 621 |
| [`src/ui.js`](src/ui.js) | control bar, scrubber, keyboard and pointer input, auto-hide | 427 |
| [`src/timeline.js`](src/timeline.js) | master schedule, easing, leaf angles, wall-clock `Player` | 237 |
| [`src/dims.js`](src/dims.js) | page size, leaf count, page-art pixel size | 13 |
| [`src/util/rng.js`](src/util/rng.js) | seeded random numbers (mulberry32) | 29 |
| [`src/util/figures-fallback.js`](src/util/figures-fallback.js) | plain stand-ins if `figures.js` cannot load | 69 |
| [`src/fonts.js`](src/fonts.js) | display, handwriting and serif stacks; canvas font loader | 93 |
| [`src/photos.js`](src/photos.js) | optional photo loading; polaroid, print and oval pieces | 544 |
| [`src/characters.js`](src/characters.js) | character and scene-art loader; die-cut cards, flip-books, `actor()` | 326 |
| [`src/figures.js`](src/figures.js) | code-drawn paper dolls and dogs | 1955 |
| [`src/paper.js`](src/paper.js) | grain, die-cut, cards, paper materials, page canvases | 789 |
| [`src/popup.js`](src/popup.js) | pop-up mechanisms and folding rules | 564 |
| [`src/book.js`](src/book.js) | hinged scrapbook, cover, page art, spread anchors | 2061 |
| [`src/environment.js`](src/environment.js) | desk, room, lamp schedule, dust motes | 607 |
| [`src/camera.js`](src/camera.js) | cue-driven camera rig | 581 |
| [`src/titles.js`](src/titles.js) | captions, washi page titles, end card, fade | 295 |
| [`src/audio.js`](src/audio.js) | procedural score, foley, optional narration | 1491 |
| [`src/spreads/walmart.js`](src/spreads/walmart.js) | How we met | 739 |
| [`src/spreads/dates.js`](src/spreads/dates.js) | The “dates” | 605 |
| [`src/spreads/official.js`](src/spreads/official.js) | February 7, 2024 | 922 |
| [`src/spreads/life.js`](src/spreads/life.js) | A life together | 934 |
| [`src/spreads/proposal.js`](src/spreads/proposal.js) | The question | 790 |
| [`src/spreads/wedding.js`](src/spreads/wedding.js) | February 6, 2027 | 1098 |
| [`src/spreads/index.js`](src/spreads/index.js) | the six spreads in film order | 12 |
| [`src/spreads/_stub.js`](src/spreads/_stub.js) | unused placeholder spread (not mounted) | 236 |

That is 16,038 lines under `src/`, plus the page shell. The dev harnesses add 3,464 lines.

## Dev harness pages

Every module has a standalone page in [`dev/`](dev/). Serve the folder and open, for example,
`http://127.0.0.1:8080/dev/spread-proposal.html?view=yes&t=116`.

| Page | Shows | Parameters |
|---|---|---|
| `dev/book.html` | the scrapbook, test art, axes on the anchors | `t` (default 20), `cam=front\|top\|gutter\|low\|lowleft\|lowright\|spine\|cover\|hero\|bow\|medallion\|three`, `check=1`, `art=0`, `lamp=0..1.5`, `tex=1`, `photos=0` |
| `dev/popup.html` | every mechanism with test cards; numeric self-test over 200 angles | `alpha=0..1` (×π), `u=0..1`, `anim=1` |
| `dev/environment.html` | desk, room, lamp, dust, a stand-in album | `t` (default 20), `view=low\|wide\|close\|top`, `free=1`, `lamp=x,y,z` |
| `dev/figures.html` | the paper dolls | `view=sheet\|3d` (sheet default), `who=him\|her\|sister\|dogs\|extras`, `outfit`, `pose`, `facing=left`, `px`, and in 3d `cam=wide\|1\|2\|3\|4\|side`, `free=1` |
| `dev/characters.html` | loaded drawings as die-cut cards, cycles at 3 fps, one paper-doll fallback | `t`, `ui=0`, `cam=wide\|close\|side`, `free=1`, `chars=0`, `flip=1` |
| `dev/prints.html` | font specimens and `photoPrint` styles, including the missing-photo placeholder | `photos=0` |
| `dev/titles.html` | captions, page titles and the end card over a gradient | `t`, `play=1`, `captions=0`, `ui=0` hides the scrubber |
| `dev/audio.html` | offline render of the score, level plot, peak and duck checks | `quick=1` renders only the loud, quiet and tail windows |
| `dev/camera.html` | the film through the rig, with a cue marker and caption guides | `t` (default 20), `marker=0`, `guides=0`, `titles=0`, `captions=0`, `photos=0`, `chars=0` |
| `dev/spread-walmart.html` | spread 1 alone | `alpha` (×π, or `film`), `t`, `play=1`, `free=1`, `ui=0`, `check=1`, `view=front\|wide\|low\|top\|sign\|vests\|lunch\|sparks` |
| `dev/spread-dates.html` | spread 2 alone | same, `view=front\|wide\|low\|top\|parents\|walk\|chase\|rescue\|school` |
| `dev/spread-official.html` | spread 3 alone | same, `view=front\|wide\|low\|top\|calendar\|couple\|bubbles` |
| `dev/spread-life.html` | spread 4 alone | same, `view=front\|wide\|low\|top\|first\|dog\|home\|japan` |
| `dev/spread-proposal.html` | spread 5 alone | same, `view=front\|wide\|low\|top\|couple\|ring\|photo\|yes` |
| `dev/spread-wedding.html` | spread 6 alone | same, `view=front\|wide\|low\|top\|couple\|calendar\|ribbon\|celebrate\|date` |
| `dev/smoke.html` | a spinning cube that proves the screenshot tool can open a page | none |

`?check=1` on a spread page samples the fold and prints `PASS` or `FAIL`. `dev/book.html?check=1`
sweeps the whole film for ground contact, leaf overlap and gutter fit.

## Tools

All of them run with Node and need no `npm install`. `snap.mjs` and `render-video.mjs` use a
global Playwright with Chromium.

- **`tools/serve.mjs [port=8080]`** — static server for this folder, bound to 127.0.0.1.
  Also exports `startServer(port)` (port 0 picks a free port) for the other tools.
- **`tools/snap.mjs --out <dir> [--page index.html] [--times 0,8.5] [--query "k=v"] [--size 1280x720] [--timeout 120000]`**
  — headless screenshot at the given times (`ui=0` is added for you). It prints a JSON
  summary and exits 1 on any console error, page error or failed request. A 404 is treated as
  optional, and does not fail the run, only for one file directly under `photos/` ending in
  `.jpg`, `.jpeg`, `.png` or `.webp`, for `audio/narration.` plus letters or digits, for any
  `characters/` path ending in `.json`, `.png` or `.webp`, and for
  `art/<lowercase-name>/manifest.json`. A missing scene-art image still fails. Screenshots
  can show the private photos, so `--out`
  inside the git repository is refused unless the query's last `photos` value is `0`.
- **`tools/render-video.mjs`** — MP4 export, described above.
- **`tools/build-character-manifest.mjs [--dir <folder>]`** — manifest for `characters/poses/`
  or, with `--dir`, for one scene's art folder (`art/walmart` and the rest).
- **`tools/prep-photos.py`** — builds the three private JPEGs. Python 3 with `pillow`,
  `pillow-heif` and `numpy`. See [`photos/README.md`](photos/README.md).

## How this was built

An orchestrating agent planned the architecture, wrote the task briefs, and reviewed every
result by reading the code and looking at rendered frames. It edited no project files itself.

Worker agents wrote the code and drew the art, in parallel batches. Each worker had its own
files and worked in a sandboxed copy of the project. The scene art, the spreads, the book,
the camera, the score and these docs were written that way and then read back against the
running film.

## Credits

- [three.js](https://threejs.org/) r170 by the three.js authors, MIT licensed. See
  [`vendor/LICENSE`](vendor/LICENSE). The film uses its `OrbitControls` and
  `RoundedBoxGeometry` addons. The smoke page also loads `ImprovedNoise` and
  `BufferGeometryUtils`.
- **Luckiest Guy**, the chunky display face (`FONT.display`), Apache License 2.0. See
  [`fonts/LICENSE-luckiest-guy.txt`](fonts/LICENSE-luckiest-guy.txt). One weight, latin subset.
- **Caveat**, the handwriting face (`FONT.hand`, weights 400 and 700), SIL Open Font
  License 1.1. See [`fonts/LICENSE-caveat.txt`](fonts/LICENSE-caveat.txt).
- Captions use a system serif stack (`FONT.serif` in `src/fonts.js`). No font file.
