#!/usr/bin/env node
// Offline, frame-accurate video export of the film.
//
//   npm run render -- [--width=1280] [--height=720] [--fps=30] [--from=0] [--to=80]
//                     [--workers=N] [--out=out/the-fox-and-the-paper-moon.mp4]
//                     [--page=FILE|URL] [--crf=18] [--preset=medium] [--png] [--keep-frames]
//                     [--no-audio] [--init-script=FILE]
//
// Frame i is the film at time from + i/fps, rendered with __film.seek() (never by
// real-time playback) in a page opened with ?autoplay=0&controls=0 and captured
// with page.screenshot (so the DOM overlays - fade, title card, captions - are in
// it). The frame range is shared between N workers, each its own headless
// Chromium (separate browsers, so the software WebGL of each runs in parallel),
// pulling frame numbers from one queue. Frames are JPEG quality 95 (or PNG with
// --png) in a frames directory named after the settings, next to the output.
// ffmpeg then encodes H.264 yuv420p with +faststart.
//
// Resumable: frames already in the frames directory are skipped, so an
// interrupted run (or one with --keep-frames) continues where it stopped. The
// directory is deleted after a successful encode unless --keep-frames.
// Robust: a frame that fails (page crash, timeout) is re-queued and its worker
// gets a fresh browser; a frame is tried 3 times and a worker restarted at most
// 3 times before the render gives up. Browsers and the server are always closed.
//
// Audio: if the page has __film.audio.renderWav() (-> ArrayBuffer, 16-bit PCM WAV
// of the whole film) it is called once, copied out as base64 in chunks, cached in
// the frames directory, trimmed to [from, to] and muxed as AAC 192k. If it is
// missing or fails, the video is silent (with a warning). --no-audio skips it.
//
// --page: a file path (e.g. the single-file build) is opened via file://, an
// http(s) URL as is; default is the dev index.html on a private server.
// --init-script: a JS file added to every page before it loads (a testing aid,
// e.g. to inject a fake renderWav).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { startServer, PROJECT_ROOT } from './serve.mjs';
import { DURATION, FPS } from '../src/timeline.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
if (args.help || args.h) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const num = (k, d) => {
  if (args[k] === undefined) return d;
  const v = Number(args[k]);
  if (!Number.isFinite(v)) { console.error(`bad --${k}: ${args[k]}`); process.exit(2); }
  return v;
};
const width = Math.round(num('width', 1280));
const height = Math.round(num('height', 720));
const fps = num('fps', FPS);
const from = num('from', 0);
const to = num('to', DURATION);
const workersWanted = Math.max(1, Math.round(num('workers', Math.min(4, os.cpus().length))));
const crf = Math.round(num('crf', 18));
const preset = typeof args.preset === 'string' ? args.preset : 'medium';
const usePng = !!args.png;
const keepFrames = !!args['keep-frames'];
const wantAudio = !args['no-audio'];
const OUT = path.resolve(typeof args.out === 'string' ? args.out : path.join(PROJECT_ROOT, 'out', 'the-fox-and-the-paper-moon.mp4'));
const pageArg = typeof args.page === 'string' ? args.page : null;
const pageIsUrl = !!pageArg && /^https?:\/\//i.test(pageArg);
const pageFile = pageArg && !pageIsUrl ? path.resolve(pageArg) : null;
const initScript = typeof args['init-script'] === 'string' ? fs.readFileSync(path.resolve(args['init-script']), 'utf8') : null;

if (width % 2 || height % 2 || width < 16 || height < 16) bail(`--width and --height must be even and >= 16 (H.264 yuv420p), got ${width}x${height}`);
if (!(fps > 0)) bail(`--fps must be > 0`);
if (!(from >= 0 && to <= DURATION && to > from)) bail(`need 0 <= --from < --to <= ${DURATION}, got ${from}..${to}`);
if (pageFile && !fs.existsSync(pageFile)) bail(`--page: no such file: ${pageFile}`);
for (const tool of ['ffmpeg']) {
  if (spawnSync(tool, ['-version'], { stdio: 'ignore' }).status !== 0) bail(`${tool} not found on PATH`);
}

const frameCount = Math.max(1, Math.round((to - from) * fps));
const timeOf = (i) => from + i / fps;
const ext = usePng ? 'png' : 'jpg';
const settingsKey = crypto.createHash('sha1')
  .update(JSON.stringify({ width, height, fps, from, to, ext, page: pageFile || pageArg || 'dev', init: initScript }))
  .digest('hex').slice(0, 10);
const FRAMES = path.join(path.dirname(OUT), `.frames-${path.basename(OUT, path.extname(OUT))}-${settingsKey}`);
const frameFile = (i) => path.join(FRAMES, `f${String(i).padStart(6, '0')}.${ext}`);

function bail(msg) {
  console.error(`render: ${msg}`);
  process.exit(2);
}

// --- shared state / cleanup --------------------------------------------------
let server = null;
const browsers = new Set();
let aborted = false;
async function cleanup() {
  await Promise.all([...browsers].map((b) => b.close().catch(() => {})));
  browsers.clear();
  if (server) { await server.close().catch(() => {}); server = null; }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (aborted) process.exit(130);
    aborted = true;
    console.error(`\nrender: ${sig}, closing browsers (frames so far are kept in ${FRAMES})`);
    await cleanup();
    process.exit(130);
  });
}

function pageUrl() {
  const query = new URLSearchParams({ autoplay: '0', controls: '0' });
  if (!pageArg) return `${server.url}index.html?${query}`;
  const u = new URL(pageFile ? pathToFileURL(pageFile).href : pageArg);
  for (const [k, v] of query) u.searchParams.set(k, v);
  return u.href;
}

const withTimeout = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms).unref()),
]);

const CAPTURE_CSS = '#captions .caption, #captions .card-inner { will-change: auto !important; }';

/** A fresh browser + page with the film ready. */
async function openFilm(label) {
  const browser = await chromium.launch();
  browsers.add(browser);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (initScript) await page.addInitScript(initScript);
  await withTimeout((async () => {
    await page.goto(pageUrl(), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__film && window.__film.ready, null, { timeout: 0 });
    await page.evaluate(() => window.__film.ready);
  })(), 120000, `${label}: loading the film`);
  // styles.css gives the caption and the title/end cards `will-change: transform`,
  // which makes Chromium raster their text once and then only move that raster:
  // the text's sub-pixel rendering then depends on which frame a page showed
  // first, so frames from different workers would differ by a few levels on the
  // glyph edges. Re-rastering every frame makes each frame a pure function of t.
  await page.addStyleTag({ content: CAPTURE_CSS });
  if (errors.length) console.warn(`render: ${label}: page reported errors: ${errors.slice(0, 3).join(' | ')}`);
  const close = async () => { browsers.delete(browser); await browser.close().catch(() => {}); };
  return { page, close };
}

// --- audio -------------------------------------------------------------------
const WAV_CACHE = path.join(FRAMES, 'soundtrack.wav');
// Runs in worker 1's page (already loaded) before it starts on frames.
async function fetchSoundtrack(page) {
  if (fs.existsSync(WAV_CACHE)) return WAV_CACHE;
  try {
    const has = await page.evaluate(() => typeof window.__film.audio?.renderWav === 'function');
    if (!has) { console.warn('render: WARNING: __film.audio.renderWav() is not available; the video will be silent.'); return null; }
    const t0 = Date.now();
    const size = await withTimeout(page.evaluate(async () => {
      const buf = await window.__film.audio.renderWav();
      window.__renderWav = new Uint8Array(buf);
      return window.__renderWav.length;
    }), 600000, 'renderWav()');
    const CHUNK = 1 << 20;
    const parts = [];
    for (let off = 0; off < size; off += CHUNK) {
      const b64 = await page.evaluate(({ off, CHUNK }) => {
        const a = window.__renderWav.subarray(off, off + CHUNK);
        let s = '';
        for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
        return btoa(s);
      }, { off, CHUNK });
      parts.push(Buffer.from(b64, 'base64'));
    }
    const wav = Buffer.concat(parts);
    if (wav.length !== size || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error(`renderWav() did not return a WAV file (${wav.length} bytes)`);
    }
    fs.writeFileSync(WAV_CACHE + '.tmp', wav);
    fs.renameSync(WAV_CACHE + '.tmp', WAV_CACHE);
    console.log(`render: soundtrack ${(size / 1048576).toFixed(1)} MiB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return WAV_CACHE;
  } catch (err) {
    console.warn(`render: WARNING: soundtrack failed (${String(err.message || err).split('\n')[0]}); the video will be silent.`);
    return null;
  }
}
let soundtrack = null;     // promise, set by worker 1

// --- frames ------------------------------------------------------------------
const queue = [];
for (let i = 0; i < frameCount; i++) if (!fs.existsSync(frameFile(i))) queue.push(i);
const skipped = frameCount - queue.length;
const attempts = new Map();
const MAX_FRAME_ATTEMPTS = 3;
const MAX_RESTARTS = 3;
let done = 0;
let fatal = null;
const tStart = Date.now();
let tFirst = 0;            // when the first frame finished (rate excludes browser start-up)

const fmtDur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
  : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s) % 60).padStart(2, '0')}s` : `${Math.round(s)}s`);
let lastPrint = 0;
function progress(force = false) {
  const now = Date.now();
  if (!force && now - lastPrint < (process.stdout.isTTY ? 250 : 10000)) return;
  lastPrint = now;
  const el = (now - tStart) / 1000;
  const rate = done > 1 ? (done - 1) / Math.max((now - tFirst) / 1000, 1e-3) : 0;
  const left = queue.length + inFlight;
  const eta = rate > 0 ? left / rate : NaN;
  const line = `frames ${skipped + done}/${frameCount}  ${rate.toFixed(2)} fps  ` +
    `${rate > 0 ? (1 / rate).toFixed(2) : '-'} s/frame  elapsed ${fmtDur(el)}  ETA ${Number.isFinite(eta) ? fmtDur(eta) : '-'}`;
  if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(100)}`);
  else console.log(line);
}
let inFlight = 0;

async function worker(id) {
  let restarts = 0;
  let film = null;
  while (queue.length && !fatal && !aborted) {
    if (!film) {
      try {
        film = await openFilm(`worker ${id}`);
        if (id === 1 && wantAudio && !soundtrack) soundtrack = fetchSoundtrack(film.page);
        if (soundtrack && id === 1) await soundtrack;
      } catch (err) {
        if (++restarts > MAX_RESTARTS) { fatal = `worker ${id} could not open the film: ${err.message}`; return; }
        console.warn(`\nrender: worker ${id}: ${String(err.message).split('\n')[0]}; retrying`);
        continue;
      }
    }
    const i = queue.shift();
    if (i === undefined) break;
    inFlight++;
    try {
      const t = timeOf(i);
      await withTimeout(film.page.evaluate(async (t) => {
        window.__film.seek(t);
        await new Promise((r) => requestAnimationFrame(() => r()));
      }, t), 120000, `frame ${i} (t=${t.toFixed(3)})`);
      const buf = await withTimeout(film.page.screenshot(usePng ? { type: 'png' } : { type: 'jpeg', quality: 95 }),
        120000, `screenshot of frame ${i}`);
      const tmp = `${frameFile(i)}.tmp${id}`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, frameFile(i));   // atomic: a frame file on disk is always complete
      if (++done === 1) tFirst = Date.now();
      progress();
    } catch (err) {
      if (aborted) return;
      const n = (attempts.get(i) || 0) + 1;
      attempts.set(i, n);
      console.warn(`\nrender: worker ${id}: frame ${i} failed (${String(err.message || err).split('\n')[0]}), attempt ${n}/${MAX_FRAME_ATTEMPTS}`);
      if (n >= MAX_FRAME_ATTEMPTS) { fatal = `frame ${i} failed ${n} times`; }
      else queue.unshift(i);
      await film.close();
      film = null;
      if (++restarts > MAX_RESTARTS) { fatal = fatal || `worker ${id} restarted ${MAX_RESTARTS} times`; }
    } finally {
      inFlight--;
    }
  }
  if (film) await film.close();
}

function ffmpeg(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}:\n${err.split('\n').slice(-15).join('\n')}`))));
  });
}

// --- main --------------------------------------------------------------------
let exitCode = 0;
try {
  fs.mkdirSync(FRAMES, { recursive: true });
  if (!pageArg) server = await startServer({ port: 0 });
  const nWorkers = Math.min(workersWanted, Math.max(1, queue.length));
  console.log(`render: ${pageArg ? pageUrl() : 'dev index.html'}  ${width}x${height} @ ${fps} fps  ` +
    `t=${from}..${to} (${frameCount} frames, ${ext.toUpperCase()}${usePng ? '' : ' q95'})  ${nWorkers} worker(s)`);
  console.log(`render: frames in ${FRAMES}${skipped ? ` (${skipped} already there, skipped)` : ''}`);

  if (wantAudio && fs.existsSync(WAV_CACHE)) soundtrack = Promise.resolve(WAV_CACHE);
  if (queue.length) {
    await Promise.all(Array.from({ length: nWorkers }, (_, k) => worker(k + 1)));
    progress(true);
    if (process.stdout.isTTY) process.stdout.write('\n');
  }
  if (aborted) throw new Error('aborted');
  if (fatal) throw new Error(`${fatal}; ${frameCount - skipped - done} frame(s) missing. Re-run the same command to resume.`);
  for (let i = 0; i < frameCount; i++) if (!fs.existsSync(frameFile(i))) throw new Error(`frame ${i} is missing`);
  if (wantAudio && !soundtrack) {
    // Every frame was already on disk: open one page just for the soundtrack.
    const film = await openFilm('audio');
    try { soundtrack = fetchSoundtrack(film.page); await soundtrack; } finally { await film.close(); }
  }
  const wav = soundtrack ? await soundtrack : null;
  await cleanup();   // free the CPU for the encoder

  const elapsed = (Date.now() - tStart) / 1000;
  if (done > 1) {
    const steady = (Date.now() - tFirst) / 1000 / (done - 1);
    console.log(`render: ${done} frames in ${fmtDur(elapsed)} incl. browser start-up; steady state ${steady.toFixed(3)} s/frame wall ` +
      `with ${nWorkers} worker(s) = ${(steady * nWorkers).toFixed(2)} s/frame per worker`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const dur = frameCount / fps;
  const argv = ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(fps), '-start_number', '0', '-i', path.join(FRAMES, `f%06d.${ext}`)];
  if (wav) argv.push('-ss', String(from), '-t', String(dur), '-i', wav);
  argv.push('-map', '0:v:0');
  if (wav) argv.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-af', `apad=whole_dur=${dur}`);
  argv.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-t', String(dur), '-movflags', '+faststart', OUT + '.tmp.mp4');
  const e0 = Date.now();
  await ffmpeg(argv);
  fs.renameSync(OUT + '.tmp.mp4', OUT);
  const mb = fs.statSync(OUT).size / 1048576;
  console.log(`render: encoded in ${fmtDur((Date.now() - e0) / 1000)} -> ${OUT}  ${mb.toFixed(1)} MiB, ` +
    `${dur.toFixed(2)} s, ${wav ? 'AAC audio' : 'no audio'}`);
  if (keepFrames) console.log(`render: frames kept in ${FRAMES}`);
  else fs.rmSync(FRAMES, { recursive: true, force: true });
} catch (err) {
  console.error(`\nrender: FAILED: ${err.message || err}`);
  if (fs.existsSync(FRAMES)) console.error(`render: frames so far are in ${FRAMES}; the same command resumes.`);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
