/**
 * build-character-manifest.mjs — turn the private pose sidecars into characters/manifest.json.
 *
 *   node love-story/tools/build-character-manifest.mjs
 *
 * Reads love-story/characters/poses/*.json. Each sidecar must match its PNG (the file exists,
 * and `w`/`h` equal the IHDR width and height — the header is read here, no image library).
 * On success writes love-story/characters/manifest.json:
 *   { "version": 1, "items": { "<id>": { …sidecar… } }, "cycles": { "<cycle>": ["id0","id1",…] } }
 * Cycle lists are ordered by `frame`. Prints a summary. Exits 1 if any sidecar is invalid
 * and does not replace an existing manifest in that case. No poses yet (a fresh tree) writes
 * an empty manifest and exits 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `--dir <folder>` builds <folder>/manifest.json from the sidecars lying directly in that folder
// (scene art: love-story/art/<scene>/, files named relative to the folder). Without it: characters/.
const dirFlag = process.argv.indexOf('--dir');
const ART_DIR = dirFlag > 0 && process.argv[dirFlag + 1] ? path.resolve(process.argv[dirFlag + 1]) : null;
const CHARACTERS = ART_DIR || path.join(ROOT, 'characters');
const POSES = ART_DIR || path.join(CHARACTERS, 'poses');
const OUT = path.join(CHARACTERS, 'manifest.json');

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WHO = new Set(['him', 'her', 'dog', 'sister', 'familyDog', 'parents', 'prop', 'oliver']);
const SCENES = new Set(['walmart', 'dates', 'official', 'life', 'proposal', 'wedding', 'any']);

/** Width and height of a WebP (VP8X, VP8L or VP8 chunk), or null. */
function readWebpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

/** Width and height from a PNG IHDR (or a WebP header), or null when the bytes are neither. */
function readPngSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(32);
    const n = fs.readSync(fd, buf, 0, 32, 0);
    if (n >= 30 && buf.toString('ascii', 0, 4) === 'RIFF') return readWebpSize(buf);
    if (n < 29 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w < 1 || h < 1) return null;
    return { w, h };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function insideCharacters(abs) {
  const rel = path.relative(CHARACTERS, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function validate(file, errors) {
  const base = path.basename(file);
  const fail = (msg) => {
    errors.push(`${base}: ${msg}`);
    return null;
  };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fail(`invalid JSON (${err.message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('sidecar must be an object');

  const stem = base.replace(/\.json$/i, '');
  if (typeof data.id !== 'string' || data.id !== stem) return fail(`id must be "${stem}"`);
  if (typeof data.file !== 'string' || data.file.length === 0) return fail('file is missing');

  const abs = path.resolve(CHARACTERS, data.file);
  if (!insideCharacters(abs)) return fail('file points outside characters/');
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return fail(`${data.file} is missing`);
  const size = readPngSize(abs);
  if (!size) return fail(`${data.file} is not a PNG`);
  if (!Number.isInteger(data.w) || !Number.isInteger(data.h) || data.w !== size.w || data.h !== size.h) {
    return fail(`w/h ${data.w}×${data.h} does not match PNG ${size.w}×${size.h}`);
  }

  const feet = data.feet;
  if (!Array.isArray(feet) || feet.length !== 2 || !feet.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return fail('feet must be [x, y]');
  }
  if (feet[0] < 0 || feet[0] > data.w - 1 || feet[1] < 0 || feet[1] > data.h - 1) {
    return fail(`feet [${feet[0]}, ${feet[1]}] is outside the image`);
  }

  if (!Array.isArray(data.who) || data.who.length === 0 || data.who.some((w) => typeof w !== 'string' || !WHO.has(w))) {
    return fail(`who must be a non-empty list of ${[...WHO].join(', ')}`);
  }
  if (typeof data.scene !== 'string' || !SCENES.has(data.scene)) {
    return fail(`scene must be one of ${[...SCENES].join(', ')}`);
  }
  if (typeof data.units !== 'number' || !Number.isFinite(data.units) || data.units <= 0 || data.units > 20) {
    return fail('units must be a positive number (world height)');
  }

  const hasCycle = data.cycle !== undefined;
  const hasFrame = data.frame !== undefined;
  if (hasCycle !== hasFrame) return fail('cycle and frame must be set together');
  if (hasCycle) {
    if (typeof data.cycle !== 'string' || data.cycle.length === 0) return fail('cycle must be a name');
    if (!Number.isInteger(data.frame) || data.frame < 0) return fail('frame must be an integer ≥ 0');
  }
  return data;
}

function main() {
  const errors = [];
  const names = fs.existsSync(POSES)
    ? fs.readdirSync(POSES).filter((n) => n.endsWith('.json') && n !== 'manifest.json').sort()
    : [];
  const items = {};
  const frameSlot = new Map();
  for (const name of names) {
    const data = validate(path.join(POSES, name), errors);
    if (!data) continue;
    if (items[data.id]) {
      errors.push(`${name}: duplicate id "${data.id}"`);
      continue;
    }
    if (data.cycle !== undefined) {
      const key = `${data.cycle}\0${data.frame}`;
      if (frameSlot.has(key)) {
        errors.push(`${name}: ${data.cycle} already has frame ${data.frame} (${frameSlot.get(key)})`);
        continue;
      }
      frameSlot.set(key, data.id);
    }
    items[data.id] = data;
  }

  if (errors.length) {
    for (const line of errors) console.error(line);
    console.error(`${errors.length} invalid sidecar${errors.length === 1 ? '' : 's'} — manifest not written`);
    process.exit(1);
  }

  const cycles = {};
  for (const item of Object.values(items)) {
    if (item.cycle === undefined) continue;
    (cycles[item.cycle] ??= []).push(item.id);
  }
  for (const name of Object.keys(cycles)) {
    cycles[name].sort((a, b) => items[a].frame - items[b].frame || (a < b ? -1 : a > b ? 1 : 0));
  }
  const cycleNames = Object.keys(cycles).sort();
  const orderedCycles = {};
  for (const name of cycleNames) orderedCycles[name] = cycles[name];

  const ids = Object.keys(items).sort();
  const orderedItems = {};
  for (const id of ids) orderedItems[id] = items[id];

  fs.mkdirSync(CHARACTERS, { recursive: true });
  const manifest = { version: 1, items: orderedItems, cycles: orderedCycles };
  fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`${ids.length} drawing${ids.length === 1 ? '' : 's'}, ${cycleNames.length} cycle${cycleNames.length === 1 ? '' : 's'} → ${path.relative(process.cwd(), OUT)}`);
  for (const id of ids) {
    const it = items[id];
    const cyc = it.cycle !== undefined ? `  ${it.cycle}#${it.frame}` : '';
    console.log(`  ${id}  ${it.w}×${it.h}  ${it.who.join('+')}${cyc}`);
  }
  for (const name of cycleNames) console.log(`  cycle ${name}: ${orderedCycles[name].join(' ')}`);
}

main();
