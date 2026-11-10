#!/usr/bin/env node
// Screenshots + numeric checks for the paper toolkit bench (dev/paper.html).
//
//   node tools/paper-shots.mjs [--opens=0.05,0.3,0.6,1] [--cams=front,low] [--spread=0]
//                              [--night] [--glow=1] [--out=DIR] [--width=1280] [--height=720] [--no-check]
//
// Saves DIR/paper-<cam>-<open>[-night].png (default DIR popup-book-film/.smoke/paper),
// runs the V-fold check (window.__paper.check()) and prints its numbers. Exits 1
// on console errors, page errors, failed requests or a failed check. Console
// warnings (e.g. paper.stand footprint warnings) are printed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer, PROJECT_ROOT } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const list = (v, d) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);
const opens = list(args.opens, ['0.05', '0.3', '0.6', '1']).map(Number);
const cams = list(args.cams, ['front', 'low']);
const outDir = path.resolve(typeof args.out === 'string' ? args.out : path.join(PROJECT_ROOT, '.smoke', 'paper'));
const width = parseInt(args.width ?? 1280, 10), height = parseInt(args.height ?? 720, 10);
const night = args.night ? 1 : 0;
const spread = parseInt(args.spread ?? 0, 10);
const glow = args.glow !== undefined ? Number(args.glow) : 1;

const problems = [], warnings = [];
let server, browser, code = 0;
try {
  fs.mkdirSync(outDir, { recursive: true });
  server = await startServer({ port: 0 });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
    else if (m.type() === 'warning' && !/GPU stall/.test(m.text())) warnings.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.stack || e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  const url = `${server.url}dev/paper.html?ui=0&spread=${spread}&night=${night}&glow=${glow}&open=1`;
  console.log(`paper-shots: ${url} -> ${outDir}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__paper, null, { timeout: 60000 });
  await page.evaluate(() => window.__paper.ready);
  for (const cam of cams) {
    for (const open of opens) {
      const ms = await page.evaluate(({ cam, open }) => {
        const t0 = performance.now();
        window.__paper.set({ cam, open });
        const gl = window.__paper.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        return performance.now() - t0;
      }, { cam, open });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      const file = path.join(outDir, `paper-${cam}-${open}${night ? '-night' : ''}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${cam.padEnd(8)} open=${String(open).padEnd(5)} ${ms.toFixed(0).padStart(5)} ms -> ${file}`);
    }
  }
  if (!args['no-check']) {
    const r = await page.evaluate(() => window.__paper.check());
    const f = (x) => (Math.abs(x) < 1e-3 ? x.toExponential(2) : x.toFixed(4));
    console.log(`vfold check (${r.samples} theta samples, 2 V-folds): crease gap max ${f(r.crease)}, hinge off ideal page plane max ${f(r.hinge)}, ` +
      `min distance to the other page ${f(r.inside)}, frame orthonormality err ${f(r.ortho)}, ` +
      `hinge vs real page surface max ${f(r.actual)} (allowed ${r.maxAllowedActual}) -> ${r.pass ? 'PASS' : 'FAIL'}`);
    if (!r.pass) problems.push('vfold check failed');
  }
} catch (err) {
  problems.push(`paper-shots failed: ${err.stack || err}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of [...new Set(warnings)]) console.log(`  ${w}`);
}
if (problems.length) {
  console.log(`\nFAIL:`);
  for (const p of problems) console.log(`  ${p}`);
  code = 1;
} else console.log('\nOK');
process.exit(code);
