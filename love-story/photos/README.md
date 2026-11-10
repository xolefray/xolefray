# photos/ — private, never committed

The film uses three of the couple's own photographs. They are **private**: this repository is
public, so the image files are git-ignored (by `../.gitignore` and by the `.gitignore` in this
folder) and must never be committed, copied elsewhere in the repository, embedded in source files or
attached to issues. Only this README and the `.gitignore` are tracked.

The film runs without them: every place a photo appears has an illustrated fallback (a hand-drawn
placeholder print inside the book, an emblem on the cover).

## Expected files

| file           | used for                                   | made from                                             |
| -------------- | ------------------------------------------ | ----------------------------------------------------- |
| `cover.jpg`    | the print set into the scrapbook cover     | the framed beach portrait (print rectified, ~1200 px) |
| `proposal.jpg` | spread 5, "The question"                   | the proposal photo (≤ 1600 px)                        |
| `dog.jpg`      | spread 4, "A life together"                | the photo of their chihuahua (≤ 1600 px)              |

All three are plain sRGB JPEGs, upright (no EXIF rotation), with metadata stripped.
`src/photos.js` loads them at start-up; a missing file is simply `null` for the film.
A single-file build can supply them instead through `window.__PHOTOS = { cover, proposal, dog }`
(URLs or data URIs).

Add `?photos=0` to the film's URL (or to any dev page that calls `loadPhotos()`) to switch the
photos off: nothing is fetched and every print shows its illustrated fallback. Use it for any
screenshot or recording that leaves your machine (`tools/snap.mjs --query "photos=0"`).

## Regenerating

`tools/prep-photos.py` (Python 3 with `pillow`, `pillow-heif` and `numpy`) makes the three files
from the originals, which live outside the repository:

```sh
python3 tools/prep-photos.py \
  --cover    /path/to/IMG_6193.HEIC \
  --proposal /path/to/proposal.jpg \
  --dog      /path/to/dog.jpg
```

- **cover** — the original is a photo of a framed print taken at an angle. The script cuts out the
  print inside the frame, straightens it with a perspective transform (the four corners are
  constants in the script, overridable with `--cover-quad`), lifts the haze of the glass a little
  and saves it ~1200 px tall. Pass `--cover-flat` for an already flat scan.
- **proposal**, **dog** — auto-oriented, modestly cropped, at most 1600 px on the long side.

Only the inputs you pass are processed; outputs go to this folder (`--out` to change). After
running it, check `git status --short` shows no image files.
