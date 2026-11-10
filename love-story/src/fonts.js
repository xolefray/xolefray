// fonts.js — the film's typefaces and the loader that makes them usable in 2D canvases.
//
// Two vendored open-licence faces live in ../fonts/ (latin subset: basic Latin + Latin-1 incl. é,
// curly quotes “ ” ‘ ’, dashes, &); their @font-face rules are in styles.css:
//
//   FONT.display  "Luckiest Guy" 400  — chunky, friendly, hand-cut-looking CAPITALS (lowercase letters
//                 are drawn as the same capitals). Headline / cut-out letters. Apache License 2.0
//                 (fonts/LICENSE-luckiest-guy.txt).
//   FONT.hand     "Caveat" 400 + 700  — legible handwriting for captions and notes. SIL OFL 1.1
//                 (fonts/LICENSE-caveat.txt).
//   FONT.serif    system storybook serif stack (no file).
//
// Use them in canvas text as  ctx.font = `${px}px ${FONT.display}`  /  `700 ${px}px ${FONT.hand}`
// — the constants already carry quotes and fallbacks, never write bare family names.
//
// A canvas does NOT trigger a font download by itself and silently draws the fallback, so nothing may
// paint a canvas before `await loadFonts()`. Pages that do not link styles.css (dev pages) are covered
// too: loadFonts() registers the faces itself (FontFace API) when no stylesheet provides them.

export const FONT = {
  display: '"Luckiest Guy","Arial Rounded MT Bold","Trebuchet MS",Impact,sans-serif',
  hand: '"Caveat","Segoe Print","Bradley Hand","Comic Sans MS",cursive',
  serif: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
};

// [family, weight, file]. Everything loadFonts() guarantees.
const FACES = [
  ['Luckiest Guy', 400, 'luckiest-guy-latin-400-normal.woff2'],
  ['Caveat', 400, 'caveat-latin-400-normal.woff2'],
  ['Caveat', 700, 'caveat-latin-700-normal.woff2'],
];

// Characters the film letters with; asking document.fonts for them makes sure the right file is in.
const SAMPLE = 'Our Love Story & é “ ” ’ 0123456789';

const FONT_DIR = new URL('../fonts/', import.meta.url);

let pending = null;

function hasFace(family, weight) {
  let found = false;
  try {
    document.fonts.forEach((f) => {
      const fam = String(f.family).replace(/^["']|["']$/g, '');
      const w = String(f.weight);
      if (fam === family && (w === String(weight) || (weight === 400 && w === 'normal') || (weight === 700 && w === 'bold'))) found = true;
    });
  } catch { /* FontFaceSet not iterable here: fall through and register our own */ }
  return found;
}

async function loadFace([family, weight, file]) {
  // Single-file builds may inline the faces: window.__FONTS = { '<file name>': <data URI | url> }.
  const override = typeof window !== 'undefined' && window.__FONTS && window.__FONTS[file];
  if ((override || !hasFace(family, weight)) && typeof FontFace === 'function') {
    const src = override || new URL(file, FONT_DIR).href;
    const face = new FontFace(family, `url("${src}") format("woff2")`, { weight: String(weight), style: 'normal', display: 'block' });
    document.fonts.add(face);
    await face.load();
  }
  const spec = `${weight} 48px "${family}"`;
  const got = await document.fonts.load(spec, SAMPLE);
  if ((!got || got.length === 0) && !document.fonts.check(spec, SAMPLE)) throw new Error('face not available after load');
}

/**
 * Resolves when the vendored faces are usable in canvas. Never rejects: a face that cannot be
 * loaded is reported once with console.warn and the film falls back to the next family in FONT.*.
 * Idempotent (one shared promise).
 */
export function loadFonts() {
  if (pending) return pending;
  if (typeof document === 'undefined' || !document.fonts) {
    pending = Promise.resolve({ ok: false, failed: FACES.map((f) => `${f[0]} ${f[1]}`) });
    return pending;
  }
  pending = Promise.all(FACES.map((face) => {
    const label = `${face[0]} ${face[1]}`;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 8000));
    return Promise.race([loadFace(face), timeout]).then(
      () => null,
      (err) => {
        console.warn(`[fonts] could not load "${label}" (${err && err.message ? err.message : err}); using a fallback face`);
        return label;
      },
    );
  })).then((res) => {
    const failed = res.filter(Boolean);
    return { ok: failed.length === 0, failed };
  });
  return pending;
}
