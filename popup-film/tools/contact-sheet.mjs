/**
 * contact-sheet.mjs — renders the README media of "The Little Paper Boat": a hero poster frame
 * and a labelled contact sheet of the whole film.
 *
 * Usage (from anywhere; paths are relative to popup-film/):
 *   node popup-film/tools/contact-sheet.mjs [--out media] [--only poster|sheet]
 *        [--poster 38] [--poster-size 1600x900] [--times 4,8.6,…] [--cols 5]
 *        [--thumb 416x234] [--quality 0.85] [--frames <dir>] [--timeout 300000]
 *
 *   --out          output folder (default media/): writes poster.jpg and contact-sheet.jpg
 *   --only         render just one of the two
 *   --poster       film time of the hero frame (rendered with the caption overlay hidden)
 *   --times        frames of the sheet (default: 15 story beats across the 96 s)
 *   --thumb        size of one frame on the sheet; frames render at twice that and are scaled down
 *   --quality      JPEG quality, 0..1
 *   --frames       also write every sheet frame as a full-size PNG there (handy for picking times)
 *
 * Starts the static server of serve.mjs on a free port and opens index.html?t=<t>&ui=0 in
 * headless Chromium with SwiftShader WebGL (like snap.mjs), waiting for window.__ready. The poster
 * is one page load. The sheet is one page load at its first time and then window.__film.seek(t)
 * for every next time: the film is a pure function of t, so a seek renders exactly what a fresh
 * load would (and saves ~20 s of scene building per frame). Each frame is labelled "m:ss · chapter"
 * from src/timeline.js CHAPTERS (imported in the page). Prints a JSON summary (files, bytes,
 * errors) and exits 1 on any console error, page error, failed request or __ready timeout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, startServer } from './serve.mjs';

const require = createRequire(import.meta.url);

/** Story beats: title card, cover, forest, the boat's birth, the stream, a page turn, lighthouse,
 *  big wave, lantern city, the quiet light in the boat, the bridge, boat → crane, flight, finale, The End. */
const DEFAULT_TIMES = [4, 8.6, 12.5, 16.8, 23.5, 29.5, 38, 44.5, 58.5, 66, 68.5, 77.3, 82, 87, 92];
const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SIZE_BUDGET = 700 * 1024;

function loadPlaywright() {
  const candidates = ['playwright', '/usr/local/lib/node_modules_global/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error('playwright not found (set NODE_PATH to the global node_modules)');
}

const parseSize = (s) => {
  const [width, height] = s.split('x').map(Number);
  if (!(width > 0 && height > 0)) throw new Error(`bad size: ${s}`);
  return { width, height };
};

function parseArgs(argv) {
  const opts = {
    out: 'media',
    only: null,
    poster: '38',
    'poster-size': '1600x900',
    times: DEFAULT_TIMES.join(','),
    cols: '5',
    thumb: '416x234',
    quality: '0.85',
    frames: null,
    timeout: '300000',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const val = argv[++i];
    if (!(key in opts) || val === undefined) throw new Error(`bad argument: ${argv[i - 1]}`);
    opts[key] = val;
  }
  if (opts.only && !['poster', 'sheet'].includes(opts.only)) throw new Error('--only takes poster or sheet');
  return {
    out: path.resolve(ROOT, opts.out),
    poster: opts.only !== 'sheet' ? Number(opts.poster) : null,
    posterSize: parseSize(opts['poster-size']),
    times: opts.only !== 'poster' ? opts.times.split(',').map(Number).filter(Number.isFinite) : [],
    cols: Math.max(1, Number(opts.cols) | 0),
    thumb: parseSize(opts.thumb),
    quality: Math.round(Math.min(1, Math.max(0.1, Number(opts.quality))) * 100),
    frames: opts.frames ? path.resolve(ROOT, opts.frames) : null,
    timeout: Number(opts.timeout),
  };
}

/** "m:ss" with one decimal when the time is not a whole second. */
function formatTime(t) {
  const whole = Math.abs(t - Math.round(t)) < 1e-6;
  const s = whole ? Math.round(t) : t;
  const sec = s % 60;
  const secText = whole ? String(sec).padStart(2, '0') : sec.toFixed(1).padStart(4, '0');
  return `${Math.floor(s / 60)}:${secText}`;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Opens a page that records errors into `summary`. */
async function openPage(context, summary, tag) {
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') summary.consoleErrors.push({ shot: tag, text: msg.text(), location: msg.location()?.url });
  });
  page.on('pageerror', (err) => summary.pageErrors.push({ shot: tag, text: String(err?.stack ?? err) }));
  page.on('requestfailed', (req) => summary.failedRequests.push({ shot: tag, url: req.url(), failure: req.failure()?.errorText }));
  page.on('response', (res) => {
    if (res.status() >= 400) summary.failedRequests.push({ shot: tag, url: res.url(), failure: `HTTP ${res.status()}` });
  });
  return page;
}

/** Loads the film paused at t with no UI and waits until it has rendered there. */
async function loadFilm(page, base, t, timeout) {
  await page.goto(`${base}index.html?t=${t}&ui=0`, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout, polling: 100 });
}

/** Seeks the loaded film to t and resolves once a frame at t has been rendered. */
async function seekFilm(page, t) {
  return page.evaluate(async (time) => {
    window.__film.seek(time);
    for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    return window.__film.time;
  }, t);
}

async function renderPoster(browser, base, opts, summary) {
  const context = await browser.newContext({ viewport: opts.posterSize, deviceScaleFactor: 1 });
  const page = await openPage(context, summary, `poster t=${opts.poster}`);
  const file = path.join(opts.out, 'poster.jpg');
  try {
    await loadFilm(page, base, opts.poster, opts.timeout);
    await page.addStyleTag({ content: '#overlay { display: none !important; }' });
    await seekFilm(page, opts.poster);
    await page.screenshot({ path: file, type: 'jpeg', quality: opts.quality });
    summary.files.push({ file, time: opts.poster, ...opts.posterSize, bytes: fs.statSync(file).size });
  } catch (err) {
    summary.pageErrors.push({ shot: 'poster', text: `poster failed: ${err.message.split('\n')[0]}` });
  }
  await context.close();
}

function sheetHtml(cells, opts, duration) {
  const { width, height } = opts.thumb;
  const gap = Math.round(width * 0.045);
  const items = cells
    .map(
      (c) => `<figure><img src="data:image/png;base64,${c.png}" width="${width}" height="${height}" alt="">
        <figcaption><b>${formatTime(c.time)}</b><span>${escapeHtml(c.chapter)}</span></figcaption></figure>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { --bg: #0c0a09; --cream: #f3ead8; --muted: rgba(243, 234, 216, 0.6); --gold: #d9b56c;
      --serif: "Palatino Linotype", Palatino, "TeX Gyre Pagella", Georgia, Caladea, "Liberation Serif", serif; }
    * { margin: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--cream); font-family: var(--serif); padding: ${gap * 1.4}px ${gap}px ${gap}px;
      width: ${opts.cols * width + (opts.cols + 1) * gap}px; }
    header { display: flex; align-items: baseline; justify-content: space-between; padding: 0 2px ${gap}px;
      border-bottom: 1px solid rgba(217, 181, 108, 0.35); margin-bottom: ${gap}px; }
    h1 { font-weight: 400; font-size: ${Math.round(width * 0.075)}px; letter-spacing: 0.01em; }
    header p { color: var(--gold); font-size: ${Math.round(width * 0.04)}px; font-style: italic; }
    main { display: grid; grid-template-columns: repeat(${opts.cols}, ${width}px); gap: ${gap}px; }
    img { display: block; width: ${width}px; height: ${height}px; border-radius: 3px;
      box-shadow: 0 0 0 1px rgba(243, 234, 216, 0.12); }
    figcaption { display: flex; gap: 0.55em; align-items: baseline; padding: 0.5em 2px 0; font-size: ${Math.round(width * 0.04)}px; }
    figcaption b { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--gold); }
    figcaption span { color: var(--muted); font-style: italic; }
  </style></head><body>
    <header><h1>The Little Paper Boat</h1><p>a pop-up film in four pages · ${formatTime(duration)} · ${cells.length} frames</p></header>
    <main>${items}</main>
  </body></html>`;
}

async function renderSheet(browser, base, opts, summary) {
  const { width, height } = opts.thumb;
  const context = await browser.newContext({ viewport: { width: width * 2, height: height * 2 }, deviceScaleFactor: 1 });
  const page = await openPage(context, summary, 'sheet');
  const cells = [];
  try {
    await loadFilm(page, base, opts.times[0], opts.timeout);
    const { CHAPTERS, DURATION } = await page.evaluate(async () => {
      const timeline = await import('/src/timeline.js');
      return { CHAPTERS: timeline.CHAPTERS, DURATION: timeline.DURATION };
    });
    for (const t of opts.times) {
      const shown = await seekFilm(page, t);
      if (Math.abs(shown - t) > 1e-3) throw new Error(`seek to ${t} landed at ${shown}`);
      const png = await page.screenshot({ type: 'png' });
      if (opts.frames) fs.writeFileSync(path.join(opts.frames, `frame-t${t}.png`), png);
      const chapter = CHAPTERS.filter((c) => c.t <= t + 1e-6).at(-1).label;
      cells.push({ time: t, chapter, png: png.toString('base64') });
    }
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 800, height: 600 });
    await sheet.setContent(sheetHtml(cells, opts, DURATION), { waitUntil: 'load' });
    const size = await sheet.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
    await sheet.setViewportSize(size);
    const file = path.join(opts.out, 'contact-sheet.jpg');
    await sheet.screenshot({ path: file, type: 'jpeg', quality: opts.quality, fullPage: true });
    summary.files.push({ file, times: opts.times, ...size, bytes: fs.statSync(file).size });
  } catch (err) {
    summary.pageErrors.push({ shot: 'sheet', text: `sheet failed: ${err.message.split('\n')[0]}` });
  }
  await context.close();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });
  if (opts.frames) fs.mkdirSync(opts.frames, { recursive: true });
  const { chromium } = loadPlaywright();
  const { server, url: base } = await startServer(0);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const summary = { ok: true, files: [], consoleErrors: [], pageErrors: [], failedRequests: [], warnings: [] };

  if (opts.poster !== null) await renderPoster(browser, base, opts, summary);
  if (opts.times.length) await renderSheet(browser, base, opts, summary);

  await browser.close();
  server.close();
  for (const f of summary.files) if (f.bytes > SIZE_BUDGET) summary.warnings.push(`${path.basename(f.file)} is ${Math.round(f.bytes / 1024)} KB (budget ${SIZE_BUDGET / 1024} KB): lower --quality or --thumb`);
  summary.ok = !summary.consoleErrors.length && !summary.pageErrors.length && !summary.failedRequests.length;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
