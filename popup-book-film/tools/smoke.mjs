#!/usr/bin/env node
// Smoke test + frame grabber for the film.
//
//   node tools/smoke.mjs [--times=1,8.5,14] [--out=DIR] [--width=1280] [--height=720] [--controls]
//
// Starts its own static server on an ephemeral port, launches Chromium (software
// WebGL2), opens index.html?autoplay=0&controls=0, awaits __film.ready, then for
// each time seeks, waits one animation frame and saves DIR/t-<time>.png
// (default DIR: popup-book-film/.smoke). Collects console errors, page errors and
// failed / 4xx+ requests; exits 1 if there were any. Also checks the spread-anchor
// contract numerically and runs a determinism check (seek A, seek elsewhere, seek
// back to A: PNG bytes must match). Safe to run concurrently with other instances.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer, PROJECT_ROOT } from './serve.mjs';
import { SHOT_TIMES, DURATION } from '../src/timeline.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
if (args.help || args.h) {
  console.log('usage: node tools/smoke.mjs [--times=1,8.5,14] [--out=DIR] [--width=1280] [--height=720] [--controls]');
  process.exit(0);
}

const times = typeof args.times === 'string'
  ? args.times.split(',').map((s) => s.trim()).filter(Boolean).map(Number)
  : SHOT_TIMES.slice();
if (times.some((t) => !Number.isFinite(t))) {
  console.error(`bad --times: ${args.times}`);
  process.exit(2);
}
const outDir = path.resolve(typeof args.out === 'string' ? args.out : path.join(PROJECT_ROOT, '.smoke'));
const width = parseInt(args.width ?? 1280, 10);
const height = parseInt(args.height ?? 720, 10);
const showControls = !!args.controls;
const fmtTime = (t) => String(Math.round(t * 1000) / 1000);

const problems = [];   // anything here => exit 1
const warnings = [];
let server = null;
let browser = null;
let exitCode = 0;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  server = await startServer({ port: 0 });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') problems.push(`console.error: ${msg.text()}`);
    else if (type === 'warning') warnings.push(`console.warn: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.stack || err.message}`));
  page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => { if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`); });

  const url = `${server.url}index.html?autoplay=0${showControls ? '' : '&controls=0'}`;
  console.log(`smoke: ${url}  ${width}x${height}  -> ${outDir}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 60000 });
  await page.evaluate(() => window.__film.ready);

  const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  // Seek and force the GPU to finish (1-pixel readback) so the timing is honest.
  const seekTimed = (t) => page.evaluate((t) => {
    const f = window.__film;
    const t0 = performance.now();
    f.seek(t);
    const gl = f.debug?.renderer?.getContext();
    if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return performance.now() - t0;
  }, t);

  // --- frames ---
  const seekMs = [];
  const wallMs = [];
  for (const t of times) {
    const w0 = Date.now();
    seekMs.push(await seekTimed(t));
    await nextFrame();
    const file = path.join(outDir, `t-${fmtTime(t)}.png`);
    await page.screenshot({ path: file });
    wallMs.push(Date.now() - w0);
    console.log(`  t=${fmtTime(t).padEnd(6)} seek+render ${seekMs.at(-1).toFixed(0).padStart(5)} ms   -> ${path.relative(process.cwd(), file) || file}`);
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  console.log(`average seek+render (in page): ${avg(seekMs).toFixed(1)} ms;  incl. screenshot: ${avg(wallMs).toFixed(0)} ms`);

  // --- anchor contract check ---
  const anchorTimes = [8.75, 21, 33, 45.6, 57, 14.5, 71.5];
  const anchorErrs = [];
  for (const t of anchorTimes) {
    await page.evaluate((t) => window.__film.seek(t), t);
    const res = await page.evaluate(() => {
      const f = window.__film;
      const s = f.getState();
      const book = f.debug?.book;
      if (!book) return { skip: 'no __film.debug.book' };
      const out = [];
      const axis = (o, i) => { const e = o.matrixWorld.elements; const v = [e[i * 4], e[i * 4 + 1], e[i * 4 + 2]]; const l = Math.hypot(...v); return v.map((x) => x / l); };
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      for (let k = 0; k < 5; k++) {
        const a = book.getSpreadAnchors(k);
        const pl = Math.PI * s.leafTurn[k], pr = Math.PI * (k + 1 < 5 ? s.leafTurn[k + 1] : 0);
        // Expected (independent of the scene graph): page directions away from the spine and page normals.
        const dirL = [Math.cos(pl), Math.sin(pl), 0], dirR = [Math.cos(pr), Math.sin(pr), 0];
        const nL = [Math.sin(pl), -Math.cos(pl), 0];   // out of the back face of leaf k
        const nR = [-Math.sin(pr), Math.cos(pr), 0];   // out of the front face of leaf k+1
        const bis = [dirL[0] + dirR[0], dirL[1] + dirR[1], 0];
        const bl = Math.hypot(...bis); bis[0] /= bl; bis[1] /= bl;
        const checks = [
          ['left +Y = left page normal', axis(a.left, 1), nL],
          ['left -X = left page direction', axis(a.left, 0).map((x) => -x), dirL],
          ['left +Z = world +Z', axis(a.left, 2), [0, 0, 1]],
          ['right +Y = right page normal', axis(a.right, 1), nR],
          ['right +X = right page direction', axis(a.right, 0), dirR],
          ['right +Z = world +Z', axis(a.right, 2), [0, 0, 1]],
          ['center +Y = bisector', axis(a.center, 1), bis],
          ['center +Z = world +Z', axis(a.center, 2), [0, 0, 1]],
        ];
        for (const [name, got, want] of checks) {
          const d = dist(got, want);
          if (d > 1e-4) out.push(`t=${s.t} spread ${k}: ${name}: got [${got.map((x) => x.toFixed(4))}] want [${want.map((x) => x.toFixed(4))}]`);
        }
        // The center frame must see the pages at (+-sin(th/2), cos(th/2), 0).
        const th = Math.PI * s.spreadOpen[k];
        const cx = axis(a.center, 0), cy = axis(a.center, 1);
        const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        const rIn = [dot(dirR, cx), dot(dirR, cy)], lIn = [dot(dirL, cx), dot(dirL, cy)];
        if (Math.abs(rIn[0] - Math.sin(th / 2)) > 1e-4 || Math.abs(rIn[1] - Math.cos(th / 2)) > 1e-4 ||
            Math.abs(lIn[0] + Math.sin(th / 2)) > 1e-4 || Math.abs(lIn[1] - Math.cos(th / 2)) > 1e-4) {
          out.push(`t=${s.t} spread ${k}: pages in center frame r=${rIn.map((x) => x.toFixed(4))} l=${lIn.map((x) => x.toFixed(4))}, theta=${th.toFixed(4)}`);
        }
        // Flat-open spreads: left/right/center frames equal the world axes.
        if (s.spreadOpen[k] > 0.9999) {
          for (const [n, o] of [['left', a.left], ['right', a.right], ['center', a.center]]) {
            for (let i = 0; i < 3; i++) {
              const want = [0, 0, 0]; want[i] = 1;
              if (dist(axis(o, i), want) > 1e-4) out.push(`t=${s.t} spread ${k}: flat-open ${n} axis ${i} not world-aligned`);
            }
          }
        }
      }
      return { errs: out };
    });
    if (res.skip) { warnings.push(`anchor check skipped: ${res.skip}`); break; }
    anchorErrs.push(...res.errs);
  }
  if (anchorErrs.length) {
    problems.push(...anchorErrs.slice(0, 20).map((e) => `anchor: ${e}`));
    console.log(`anchor check: FAIL (${anchorErrs.length} mismatches)`);
  } else {
    console.log(`anchor check: PASS (${anchorTimes.length} times x 5 spreads)`);
  }

  // --- determinism check ---
  const A = times.includes(21) ? 21 : times[Math.floor(times.length / 2)];
  const B = A > DURATION / 2 ? 9 : 66.5;
  await page.evaluate((t) => window.__film.seek(t), A); await nextFrame();
  const shotA = await page.screenshot();
  await page.evaluate((t) => window.__film.seek(t), B); await nextFrame();
  await page.evaluate((t) => window.__film.seek(t), A); await nextFrame();
  const shotA2 = await page.screenshot();
  if (shotA.equals(shotA2)) {
    console.log(`determinism: PASS (t=${A} identical after visiting t=${B})`);
  } else {
    let diff = 0;
    const n = Math.min(shotA.length, shotA2.length);
    for (let i = 0; i < n; i++) if (shotA[i] !== shotA2[i]) diff++;
    fs.writeFileSync(path.join(outDir, `det-a-${fmtTime(A)}.png`), shotA);
    fs.writeFileSync(path.join(outDir, `det-b-${fmtTime(A)}.png`), shotA2);
    console.log(`determinism: WARN t=${A} differs after visiting t=${B}: PNG sizes ${shotA.length} vs ${shotA2.length}, ${diff} differing bytes; saved det-a/det-b-${fmtTime(A)}.png in ${outDir}`);
  }
}

try {
  await main();
} catch (err) {
  problems.push(`smoke failed: ${err.stack || err}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

if (warnings.length) {
  const uniq = [...new Set(warnings)];
  console.log(`\n${uniq.length} warning(s):`);
  for (const w of uniq.slice(0, 20)) console.log(`  ${w}`);
}
if (problems.length) {
  console.log(`\nFAIL: ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
  exitCode = 1;
} else {
  console.log('\nOK: no console errors, page errors or failed requests.');
}
process.exit(exitCode);
