# Our Love Story

*A 275-second pop-up scrapbook film, about 4 minutes 35 seconds. It renders live in the browser with three.js, in English or Spanish.*

A hand-made scrapbook lies on a walnut desk under a warm lamp. The cover opens, eight paper
worlds rise one after another, and the pages tell how Brian and Marlin met, built a life, and
got engaged, in their own voice ("we"). Hand-drawn cartoon cut-outs of them act out each
moment, storybook captions carry the narration, and a small score plays along. The whole film
is one timeline: scrub anywhere and the book, the camera, the words and the music are exactly
where that second says they should be.

Nothing is downloaded at runtime. Scene art is painted pictures loaded from `art/`. Pop-ups are
real folding geometry posed by the page's opening angle. The music is synthesized with
WebAudio. There is no build step and no runtime dependency other than a vendored copy of
three.js r170.

## What happens

The book's cover is the title: pebbled brown leather, a red cloth spine, a cord tied in a bow,
and **Our Love Story** in multicoloured cut-paper letters (**Nuestra historia de amor** in
Spanish, stacked as NUESTRA / HISTORIA / DE AMOR). The couple's cover photo sits in a brass
oval, or a cut-paper heart when that photo is absent. The lamp warms up from 0.4 s to 2.8 s.
Two lines play over the closed book, and then the leaves start to turn. Each leaf takes 3
seconds. While a leaf turns, the spread it opens shows its title on a strip of washi tape, in
the language you are watching.

| Time | Chapter | What happens |
|---|---|---|
| 0:00 | Cover | Closed book. Captions at 2.6–5.2 s and 5.9–8.9 s. The cover turns at 9.9–12.9 s. |
| 0:09.9 | Where it all began | Walmart, 9.9–49.1 s (open 12.9–46.1 s). Coworkers, then passing in the aisle, shy Marlin and kind Brian, then the two of them talking. |
| 0:46.1 | Lunch breaks | 46.1–75.6 s (open 49.1–72.6 s). One assigned lunch break turns into hours of talking and laughing, and becomes their thing. |
| 1:12.6 | Creative dates | 72.6–113.3 s (open 75.6–110.3 s). Strict parents, so they walk Oliver. Marlin's little sister tags along. Late nights, and a chase after an Uber to rescue a forgotten phone. |
| 1:50.3 | A little bit of fate | 110.3–151.8 s (open 113.3–148.8 s). A first movie date, one seat apart. Then the same college, which feels a little like fate. |
| 2:28.8 | February 7, 2024 | 148.8–176.4 s (open 151.8–173.4 s). They make it official. Brian still says they were already dating. School and work together, and a first kiss on Valentine's Day. |
| 2:53.4 | Building our life | 173.4–204.6 s (open 176.4–201.6 s). A first place, their chihuahua Cherry, a home with both their names, and Japan for the two-year anniversary. |
| 3:21.6 | On her birthday | 201.6–222.9 s (open 204.6–219.9 s). Brian kneels and asks. A photo of the moment. She says yes. |
| 3:39.9 | February 6, 2027 | From 219.9 s, fully open at 222.9 s, and it never closes. Three years together, "I do", the Sunday joke, then five milestones from coworkers to husband and wife. |
| 4:26.1 | See you there | The end card (266.1–275 s) shows Brian & Marlin, a small heart, and February 6, 2027 (6 de febrero de 2027 in Spanish). The picture fades to black from 271.6 s to 275 s. |

Spanish chapter names are Donde todo comenzó, La hora del almuerzo, Citas creativas, Un poquito
de destino, 7 de febrero de 2024, Construyendo nuestra vida, En su cumpleaños, 6 de febrero de
2027. The end card's chapter is Nos vemos ahí. The words of every line are in
[`docs/SCRIPT.md`](docs/SCRIPT.md).

## Watch it

From this folder:

```sh
node tools/serve.mjs          # serves love-story/ at http://127.0.0.1:8080/
node tools/serve.mjs 3000     # …or on another port
```

Open the printed URL and press **Begin** (**Empezar** in Spanish). The film is best with
sound. English is the default. For Spanish, open `http://127.0.0.1:8080/?lang=es`, or press
**ES** on the control bar (and **EN** to switch back). The switch reloads the page at the same
moment, and keeps playing if the film was playing. Any static file server works too
(`python3 -m http.server`, `npx serve`, …). The page must be served over `http://` because ES
modules and the import map do not load from `file://`. The bundled server only listens on
127.0.0.1. To watch on a phone, use a server that is reachable on your network. Below 520 px
the control bar tightens and hides the chapter name. On a narrow frame the camera widens its
lens and dollies back so the open book stays in view.

You need a browser with WebGL 2 (three.js r170). Sound starts on your first click or key press,
as browsers require.

If something goes wrong, the film says so instead of freezing. The message follows the language.

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
| **EN \| ES** | switches language and reloads, keeping the current time |
| Click on the film | play / pause |
| Double-click on the film | full screen (mouse) |
| Tap (touch) | shows hidden controls; a second tap plays or pauses |
| Scrubber | drag to seek (pauses while you drag, then resumes if it was playing); hover shows time + chapter |
| Control bar | play / pause / replay, time, current chapter, mute, full screen |
| **Read it again** | appears at the end; plays the film again from the start (**Leerla otra vez** in Spanish) |

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
| *(none)* | poster frame (t = 22 s) behind the intro card; **Begin** plays from 0. English |
| `lang=en` or `lang=es` | language for captions, titles, signs, the end card, and the control bar. Anything else is English. `window.__LANG`, if set before the modules load, wins over the URL |
| `t=<seconds>` | opens paused at that time, without the intro card |
| `play=1` | plays immediately, from `t` if it is given, otherwise from 0 |
| `ui=0` | no controls and no intro card, which gives clean frames (`?t=50&ui=0`). With no `t` and no `play`, this opens paused at 22 s |
| `mute=1` | starts muted (otherwise the saved mute preference is used) |
| `captions=0` | hides the narration captions. Page titles, the end card and the fade stay |
| `photos=0` | does not load the couple's photos. Every print shows its illustrated placeholder |
| `chars=0` | does not load the hand-drawn characters. The paper-doll figures stand in |
| `free=1` | replaces the camera rig with an orbit camera (drag to orbit; for debugging) |

For automation the page exposes
`window.__film = { seek(t), play(), pause(), time, playing, duration, lang, cues }` and sets
`window.__ready = true` once the intro has settled and the scene has rendered at least two
frames.

## Private pictures

The repository is public. Three kinds of files stay off it.

**Photographs** live in [`photos/`](photos/README.md). The film expects eight upright sRGB
JPEGs, metadata stripped. A missing file is `null`, and the page draws an illustrated
stand-in: a doodled heart for the cover, the proposal, and Cherry, and a small scene for each
of the other five.

| File | Where it appears |
|---|---|
| `photos/cover.jpg` | the oval set into the cover (the tool saves it about 1200 px tall; the print is 4:5) |
| `photos/walmart.jpg` | spread 1, the two of them at work, popping in once they are coworkers |
| `photos/lunch.jpg` | spread 2, their first lunch date, taped in when lunch becomes their thing |
| `photos/oliver.jpg` | spread 3, Oliver, taped on the page beside the dog walk |
| `photos/proposal.jpg` | spread 7, the real proposal, swinging up after he asks |
| `photos/dog.jpg` | spread 6, Cherry, when they welcome her |
| `photos/deed.jpg` | spread 6, signing the papers on their home |
| `photos/tokyo.jpg` | spread 6, a Tokyo selfie on the two-year trip |

`.gitignore` ignores `photos/*` and keeps only `photos/README.md` and `photos/.gitignore`.
`?photos=0` fetches nothing. Use it for any screenshot or recording that leaves your machine.
See [`photos/README.md`](photos/README.md) for `tools/prep-photos.py`, which builds
`cover.jpg`, `proposal.jpg`, and `dog.jpg` (`--cover`, `--proposal`, `--dog`, `--out`,
`--cover-quad`, `--cover-flat`). Oliver, the Walmart photo, the lunch photo, the deed, and
Tokyo are supplied already cropped; the script does not process them. A single-file host can
supply the same eight images as `window.__PHOTOS` (URLs or data URIs), keyed by those names.

**Hand-drawn characters** live in `characters/`, which `.gitignore` ignores entirely. The film
expects `characters/manifest.json` plus the images named by that manifest (drawings in
`characters/poses/`, each a PNG or WebP with a sidecar JSON). Without the folder, every scene
still runs: `actor()` uses the code-drawn paper dolls in `src/figures.js` (Brian, Marlin, her
little sister, Cherry, Oliver). `?chars=0` forces that path and fetches nothing. A single-file
host can set `window.__CHARACTERS = { manifest, images }`.

Rebuild the manifest after adding or changing pose sidecars. From this folder:

```sh
node tools/build-character-manifest.mjs
```

It reads `characters/poses/*.json`, checks each sidecar against its image header, and writes
`characters/manifest.json`. No poses yet writes an empty manifest and exits 0. An invalid
sidecar exits 1 and leaves an existing manifest in place. `who` may include `oliver`. The
tool's scene list is still `walmart`, `dates`, `official`, `life`, `proposal`, `wedding`, and
`any`. The lunch and fate scenery sidecars use `any` so that tool will accept them.

The scenery is different. `art/walmart/`, `art/lunch/`, `art/dates/`, `art/fate/`,
`art/official/`, `art/life/`, `art/proposal/`, and `art/wedding/` are committed. Each piece's
sidecar says `who: ["prop"]`: pages, furniture, stores, trees, banners, cakes. The people, and
the drawings of the dogs, are the private character drawings, or the paper dolls when those
drawings are absent.

**Voice recordings** live in `audio/`. Do not commit them. `.gitignore` does not name that
folder, so leave the files out of any commit by hand. The names the film looks for are below.

## Add a voice-over

Record one take per language, from the script in [`docs/SCRIPT.md`](docs/SCRIPT.md). Export
mp3, m4a, or wav, starting at film time 0:00, with silence until the first line at 2.6 s.

Drop the English take at `audio/narration.en.mp3` (or `.m4a`, or `.wav`) and the Spanish take
at `audio/narration.es.mp3`. The film looks for the take that matches the language you are
watching, trying mp3, then m4a, then wav. If that file is missing it tries the shared name
`audio/narration.mp3`, then `.m4a`, then `.wav`, and then `window.__NARRATION_URL`. The first
file it can decode is the one that plays. Sample 0 of the file is film time 0. Seeking and
pausing restart the file at the right offset.

While a line is up, the music ducks 6 dB, with 0.25 s ramps at each end of the line. Foley
does not duck. No file: no duck, no error.

To retime a recording that runs long, edit `NARRATION`, and the `BEATS`, `SPREADS`, and
`LEAF_TURNS` that the long line runs into, in [`src/timeline.js`](src/timeline.js). The
[script](docs/SCRIPT.md#retiming) says which numbers. Captions, page titles, the lamp, the
score, and the camera's turn shots read those exports.

## Export a video

`tools/render-video.mjs` renders the film frame by frame in headless Chromium with software
WebGL (SwiftShader), screenshots included, and encodes them with ffmpeg (`/usr/bin/ffmpeg`,
libx264 and aac). It needs a global Playwright with Chromium. No measured frames-per-second
figure is recorded in the tool: it is slow, and the time scales with resolution, frame count
and `--jobs` (default 3, one Chromium each). Render once per language. `--lang` chooses the
words on screen and the default file name.

```sh
node tools/render-video.mjs --lang en --narration audio/narration.en.mp3
node tools/render-video.mjs --lang es --narration audio/narration.es.mp3
node tools/render-video.mjs --out our-love-story-en.mp4 --lang en --size 1280x720 --query "photos=0"
node tools/render-video.mjs --out proposal.mp4 --lang en --from 201.6 --to 222.9 --narration take.wav
```

The first two write `film-en.mp4` and `film-es.mp4`. If you omit `--lang`, the language is
taken from an existing `lang=` in `--query`, or English.

| Option | Default | Meaning |
|---|---|---|
| `--out` | `film-<lang>.mp4` | MP4 path |
| `--lang` | `en`, or `lang=` in `--query` | `en` or `es`. Appended to the page query |
| `--size` | `1920x1080` | even width and height (yuv420p) |
| `--fps` | `30` | frames per film second. 275 s at 30 fps is 8250 frames |
| `--from` / `--to` | `0` / the film duration (275) | film-time range, `--to` exclusive. The duration is read from `timeline.js` |
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
`--query "photos=0"` when the MP4 will leave your machine and the photos are present. Pass the
matching `--narration` file for that `--lang`; the tool does not pick `audio/narration.en.*`
by itself.

## How it's made

### The book

[`book.js`](src/book.js) builds nine leaves: the front cover, seven scrapbook cards, and a
back cover that never turns. They are a **hinge chain**. Each leaf turns about its own gutter
edge, and that edge rides on its neighbour, so both printed surfaces of a spread leave the
same line at every angle, including mid-turn. The chain is then lifted until its lowest corner
rests on the desk. An open spread is flat, so the thinner pile hovers by `|2k − 9|` board
thicknesses; a dark plinth and a contact shadow hide the gap. Page size is the landscape album
in [`dims.js`](src/dims.js): 3.6 by 3.0 world units (1 unit ≈ 10 cm). The cover title follows
the language. The names under the photo stay Brian & Marlin.

### Pop-up mechanisms

[`popup.js`](src/popup.js) poses every mechanism from the spread's opening angle α
(0 = closed, π = flat open), in closed form:

- **V-fold.** A card creased down the middle, glued to both pages along lines at angle γ from
  the gutter. The crease is the cross product of the two glue directions. γ below π/2 is a
  valley (opens toward the reader). γ above π/2 is a mountain (the vertex points at the
  reader), which is what the tall back layers use. Every V-fold in a spread shares one γ, so
  the halves stay parallel and nest as the page closes. The fate spread is the exception: its
  cinema facade is a mountain, and the couple with their ribbon is a separate valley.
- **Stand-up.** A flat piece on one page, hinged perpendicular to the gutter, standing at α/2.
- **Slider.** A pull-tab on a path, moved by a parameter u. Walmart rides the aisle pass on
  sliders, the dates spread rides the walk and the Uber chase, and fate walks Marlin onto the
  campus.
- **Floating layer.** A platform on two parallelogram walls, parallel to the pages, with a
  frame you can nest other mechanisms on. The engine has it; these eight spreads do not use it.
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
take that spot. Oliver is the family dog they walked; Cherry is their own chihuahua. On the
wedding spread Cherry arrives as the flower girl, with a flower, when the celebration starts.

Each spread's scenery is a set of die-cut cards from `art/<scene>/`, plus page backgrounds
(`page-left.webp`, `page-right.webp`, 1024 × 853). Every word painted on a sign, banner,
bubble, or label goes through `L(english, spanish)` in [`i18n.js`](src/i18n.js), so Spanish
and English are the same picture with different lettering. The font shrinks to fit. It is
never clipped.

The camera is cue-driven. Each spread lists shots in its own frame (`t`, `hold`, where to
look, how wide, which side). The rig turns those into world-space moves, and it owns the
prologue, a wide view of every page turn, and the pull-back for the end card. A cue that
falls outside the spread it belongs to, or inside a page turn, is dropped, so a beat that
moved in this longer cut cannot drag the camera onto a closed page. Moves are cubic Hermite
splines that do not overshoot.

Captions come from the narration table in the active language (storybook italic, bottom
centre). Page titles ride the turns. The end card is Brian & Marlin in the display face, the
wedding date in handwriting, and a heart. A black veil finishes the film.

The score is one love theme in F, in 3/4, restated for each chapter: bells while the lamp
warms, a playful waltz in the store, a slower warmer lunch, a walk that turns to night and a
short chase, a cinema organ at the movies and at the school, a plain statement when they make
it official, a traveling tune and then koto plucks in Japan, a hush and then the fullest
statement on "yes", and a broad wedding that marks the five milestones and fades under the end
card. Paper foley marks the lamp, every page turn, a shutter when a photo print appears, the
official stamp, a pen on the deed, a clock through the long lunch, a projector, a school bell,
the "yes" pop, and a pop on each milestone. The event list is in film seconds, so a seek
restarts in the right place. With a narration file, the music ducks under each line.

All of that is driven by [`timeline.js`](src/timeline.js): duration, leaf turns, spreads,
beats, narration in both languages, and the end card. Which language is showing is chosen in
[`i18n.js`](src/i18n.js) when the page loads. The architecture — conventions, the spread
contract, the manifests, the rules — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Module map

| File | Responsibility | Lines |
|---|---|---|
| [`index.html`](index.html) · [`styles.css`](styles.css) | page shell, intro card, control-bar styling | 77 · 850 |
| [`src/main.js`](src/main.js) | boot, warm-up, frame loop, light proxies, URL parameters, test hooks | 622 |
| [`src/ui.js`](src/ui.js) | control bar, language switch, scrubber, keyboard and pointer input, auto-hide | 453 |
| [`src/timeline.js`](src/timeline.js) | master schedule, easing, leaf angles, wall-clock `Player` | 641 |
| [`src/i18n.js`](src/i18n.js) | `LANG`, `L`, narration and title pickers, shared UI strings | 154 |
| [`src/dims.js`](src/dims.js) | page size, leaf count, page-art pixel size | 14 |
| [`src/util/rng.js`](src/util/rng.js) | seeded random numbers (mulberry32) | 29 |
| [`src/util/figures-fallback.js`](src/util/figures-fallback.js) | plain stand-ins if `figures.js` cannot load | 69 |
| [`src/fonts.js`](src/fonts.js) | display, handwriting and serif stacks; canvas font loader | 94 |
| [`src/photos.js`](src/photos.js) | optional photo loading; polaroid, print and oval pieces | 757 |
| [`src/characters.js`](src/characters.js) | character and scene-art loader; die-cut cards, flip-books, `actor()` | 326 |
| [`src/figures.js`](src/figures.js) | code-drawn paper dolls and dogs | 1955 |
| [`src/paper.js`](src/paper.js) | grain, die-cut, cards, paper materials, page canvases | 789 |
| [`src/popup.js`](src/popup.js) | pop-up mechanisms and folding rules | 564 |
| [`src/book.js`](src/book.js) | hinged scrapbook, cover, page art, spread anchors | 2100 |
| [`src/environment.js`](src/environment.js) | desk, room, lamp schedule, dust motes | 607 |
| [`src/camera.js`](src/camera.js) | cue-driven camera rig | 605 |
| [`src/titles.js`](src/titles.js) | captions, washi page titles, end card, fade | 396 |
| [`src/audio.js`](src/audio.js) | procedural score, foley, per-language narration | 1795 |
| [`src/spreads/walmart.js`](src/spreads/walmart.js) | Where it all began | 892 |
| [`src/spreads/lunch.js`](src/spreads/lunch.js) | Lunch breaks | 924 |
| [`src/spreads/dates.js`](src/spreads/dates.js) | Creative dates | 951 |
| [`src/spreads/fate.js`](src/spreads/fate.js) | A little bit of fate | 972 |
| [`src/spreads/official.js`](src/spreads/official.js) | February 7, 2024 | 1063 |
| [`src/spreads/life.js`](src/spreads/life.js) | Building our life | 1244 |
| [`src/spreads/proposal.js`](src/spreads/proposal.js) | On her birthday | 1179 |
| [`src/spreads/wedding.js`](src/spreads/wedding.js) | February 6, 2027 | 1329 |
| [`src/spreads/index.js`](src/spreads/index.js) | the eight spreads in film order | 14 |
| [`src/spreads/_stub.js`](src/spreads/_stub.js) | unused placeholder spread (not mounted) | 245 |

That is 20,783 lines under `src/`, plus the page shell. The dev harnesses add 3,960 lines.

## Dev harness pages

Every module has a standalone page in [`dev/`](dev/). Serve the folder and open, for example,
`http://127.0.0.1:8080/dev/spread-proposal.html?view=yes&t=216&lang=es`.
Any page that loads `i18n.js` follows `?lang=`.

| Page | Shows | Parameters |
|---|---|---|
| `dev/book.html` | the scrapbook, test art, axes on the anchors | `t` (default 20), `cam=front\|top\|gutter\|low\|lowleft\|lowright\|spine\|cover\|hero\|bow\|medallion\|three`, `check=1`, `art=0`, `lamp=0..1.5`, `tex=1`, `photos=0` |
| `dev/popup.html` | every mechanism with test cards; numeric self-test over 200 angles | `alpha=0..1` (×π), `u=0..1`, `anim=1` |
| `dev/environment.html` | desk, room, lamp, dust, a stand-in album | `t` (default 20), `view=low\|wide\|close\|top`, `free=1`, `lamp=x,y,z` |
| `dev/figures.html` | the paper dolls | `view=sheet\|3d` (sheet default), `who=him\|her\|sister\|dogs\|extras`, `outfit`, `pose`, `facing=left`, `px`, and in 3d `cam=wide\|1\|2\|3\|4\|side`, `free=1` |
| `dev/characters.html` | loaded drawings as die-cut cards, cycles at 3 fps, one paper-doll fallback | `t`, `ui=0`, `cam=wide\|close\|side`, `free=1`, `chars=0`, `flip=1` |
| `dev/prints.html` | font specimens and `photoPrint` styles for cover, proposal, and Cherry, including the missing-photo placeholder. The status line lists every loaded photo | `photos=0` |
| `dev/titles.html` | captions, page titles and the end card over a gradient | `t`, `play=1`, `captions=0`, `lang`, `ui=0` hides the scrubber |
| `dev/audio.html` | offline render of the score, level plot, peak and duck checks | `quick=1` renders only the loud, quiet and tail windows |
| `dev/camera.html` | the film through the rig, with a cue marker and caption guides | `t` (default 20), `marker=0`, `guides=0`, `titles=0`, `captions=0`, `photos=0`, `chars=0` |
| `dev/spread-walmart.html` | spread 1 alone | `alpha` (×π, or `film`), `t`, `play=1`, `free=1`, `ui=0`, `check=1`, `view=front\|wide\|low\|top\|sign\|coworkers\|passing\|shy\|kind\|curious\|chat` |
| `dev/spread-lunch.html` | spread 2 alone | same, `view=front\|wide\|low\|top\|board\|table\|clock\|laugh\|photo\|sparks` |
| `dev/spread-dates.html` | spread 3 alone | same, `view=front\|wide\|low\|top\|list\|parents\|walk\|sister\|night\|chase\|rescue\|ribbon` |
| `dev/spread-fate.html` | spread 4 alone | same, `view=front\|wide\|low\|top\|cinema\|seats\|campus\|her\|steps\|ribbon` |
| `dev/spread-official.html` | spread 5 alone | same, `view=front\|wide\|low\|top\|calendar\|couple\|bubbles\|vignettes\|kiss` |
| `dev/spread-life.html` | spread 6 alone | same, `view=front\|wide\|low\|top\|building\|first\|cherry\|dog\|home\|japan\|next` |
| `dev/spread-proposal.html` | spread 7 alone | same, `view=front\|wide\|low\|top\|party\|couple\|ring\|photo\|yes` |
| `dev/spread-wedding.html` | spread 8 alone | same, `view=front\|wide\|low\|top\|couple\|calendar\|ribbon\|ribbonMid\|vows\|celebrate\|date` |
| `dev/smoke.html` | a spinning cube that proves the screenshot tool can open a page | none |

`?check=1` on a spread page samples the fold and prints `PASS` or `FAIL`. `dev/book.html?check=1`
sweeps the whole film for ground contact, leaf overlap and gutter fit.

## Tools

All of them run with Node and need no `npm install`. `snap.mjs` and `render-video.mjs` use a
global Playwright with Chromium.

- **`tools/serve.mjs [port=8080]`** — static server for this folder, bound to 127.0.0.1.
  Also exports `startServer(port)` (port 0 picks a free port) for the other tools.
- **`tools/snap.mjs --out <dir> [--page index.html] [--times 0,8.5] [--query "k=v"] [--lang en|es] [--size 1280x720] [--timeout 120000]`**
  — headless screenshot at the given times (`ui=0` is added for you). `--lang` appends
  `lang=`. It prints a JSON summary and exits 1 on any console error, page error or failed
  request. A 404 is treated as optional, and does not fail the run, only for one file directly
  under `photos/` ending in `.jpg`, `.jpeg`, `.png` or `.webp`, for `audio/narration.` with an
  optional `.en` or `.es` and then an extension, for any `characters/` path ending in `.json`,
  `.png` or `.webp`, and for `art/<lowercase-name>/manifest.json`. A missing scene-art image
  still fails. Screenshots can show the private photos, so `--out` inside the git repository
  is refused unless the query's last `photos` value is `0`.
- **`tools/render-video.mjs`** — MP4 export, described above. `--lang en|es` chooses the
  language and the default `film-<lang>.mp4` name.
- **`tools/build-character-manifest.mjs [--dir <folder>]`** — manifest for `characters/poses/`
  or, with `--dir`, for one scene's art folder (`art/walmart` and the rest).
- **`tools/prep-photos.py`** — builds three of the eight private JPEGs (`cover`, `proposal`,
  `dog`). Python 3 with `pillow`, `pillow-heif` and `numpy`. See
  [`photos/README.md`](photos/README.md).

## How this was built

An orchestrating agent planned the architecture, wrote the task briefs, and reviewed every
result by reading the code and looking at rendered frames. It edited no project files itself.

Worker agents wrote the code and drew the art, in parallel batches. Each worker had its own
files and worked in a sandboxed copy of the project. Version 2 lengthened the film to eight
spreads, put the narration in the couple's voice in English and Spanish, and added the five
extra photographs. The scene art, the spreads, the book, the camera, the score and these docs
were written that way and then read back against the running film.

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
