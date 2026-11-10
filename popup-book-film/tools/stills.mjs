#!/usr/bin/env node
// Contact sheet: eight moments of the film tiled 4x2 into docs/contact-sheet.jpg.
//
//   npm run stills  (= node tools/stills.mjs [--out=docs/contact-sheet.jpg] [--page=FILE|URL]
//                                            [--width=960] [--height=540] [--max-kb=600] [--keep])
//
// Each still is the film at an exact time (__film.seek, ?autoplay=0&controls=0),
// so the sheet is reproducible. --keep also leaves the single PNG stills in a
// folder next to the sheet. The JPEG quality is lowered step by step until the
// sheet fits in --max-kb.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { startServer, PROJECT_ROOT } from './serve.mjs';

// THE list of moments (seconds), in reading order: left to right, top to bottom.
const MOMENTS = [
  [4.0,  'the closed book and the title'],
  [8.75, 'the cover opening'],
  [15.5, 'The Paper Forest'],
  [27.5, 'The Sleeping Village'],
  [39.5, 'The Folded Sea'],
  [45.0, 'a page turning (sea to mountain)'],
  [51.5, 'The Last Mountain'],
  [66.5, 'Home'],
];
const COLS = 4, ROWS = 2;
const GUTTER = 10;           // px between and around the stills
const BACKGROUND = '0x16110e';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const width = parseInt(args.width ?? 960, 10), height = parseInt(args.height ?? 540, 10);
const OUT = path.resolve(typeof args.out === 'string' ? args.out : path.join(PROJECT_ROOT, 'docs', 'contact-sheet.jpg'));
const maxBytes = Number(args['max-kb'] ?? 600) * 1024;
const pageArg = typeof args.page === 'string' ? args.page : null;
const pageFile = pageArg && !/^https?:\/\//i.test(pageArg) ? path.resolve(pageArg) : null;
// See render.mjs: re-raster the overlay text every frame so stills are a pure function of t.
const CAPTURE_CSS = '#captions .caption, #captions .card-inner { will-change: auto !important; }';
if (MOMENTS.length !== COLS * ROWS) throw new Error(`MOMENTS needs ${COLS * ROWS} entries`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-stills-'));
const problems = [];
let server = null, browser = null;
try {
  if (!pageArg) server = await startServer({ port: 0 });
  const base = pageArg ? (pageFile ? pathToFileURL(pageFile).href : pageArg) : `${server.url}index.html`;
  const url = new URL(base);
  url.searchParams.set('autoplay', '0');
  url.searchParams.set('controls', '0');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__film.ready);
  await page.addStyleTag({ content: CAPTURE_CSS });
  for (let i = 0; i < MOMENTS.length; i++) {
    const [t, label] = MOMENTS[i];
    await page.evaluate(async (t) => {
      window.__film.seek(t);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }, t);
    await page.screenshot({ path: path.join(tmp, `s${i}.png`) });
    console.log(`  ${String(i + 1)}. t=${String(t).padEnd(5)} ${label}`);
  }
  await browser.close(); browser = null;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let q = 3, size = Infinity;
  for (; q <= 12; q++) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 's%d.png'),
      '-vf', `tile=${COLS}x${ROWS}:margin=${GUTTER}:padding=${GUTTER}:color=${BACKGROUND}`,
      '-frames:v', '1', '-q:v', String(q), OUT], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`);
    size = fs.statSync(OUT).size;
    if (size <= maxBytes) break;
  }
  if (args.keep) {
    const keepDir = path.join(path.dirname(OUT), 'stills');
    fs.mkdirSync(keepDir, { recursive: true });
    MOMENTS.forEach(([t], i) => fs.copyFileSync(path.join(tmp, `s${i}.png`), path.join(keepDir, `t-${t}.png`)));
    console.log(`stills: single frames in ${keepDir}`);
  }
  const W = COLS * width + (COLS + 1) * GUTTER, H = ROWS * height + (ROWS + 1) * GUTTER;
  console.log(`stills: ${path.relative(process.cwd(), OUT) || OUT}  ${W}x${H}  ${(size / 1024).toFixed(0)} KiB (JPEG q:v ${q})` +
    (size > maxBytes ? `  WARNING: over ${maxBytes / 1024} KiB` : ''));
} catch (err) {
  problems.push(`stills failed: ${err.stack || err}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (problems.length) {
  console.error(`\nFAIL:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
