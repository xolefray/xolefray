/**
 * snap.mjs — headless screenshot + error check for the film and its dev pages.
 *
 * Usage:
 *   node love-story/tools/snap.mjs --out <dir> [--page index.html] [--times 0,8.5]
 *        [--query "k=v&k2=v"] [--size 1280x720] [--timeout 120000]
 *
 * Starts its own static server on a free port, opens `<page>?t=<time>&ui=0&<query>` for each
 * time (or `<page>?ui=0&<query>` once with no --times) in headless Chromium with SwiftShader
 * WebGL, waits for window.__ready, and writes <out>/<page>-t<time>.png (or <out>/<page>.png;
 * "/" in the page path becomes "-", ".html" is dropped). Prints a JSON summary and exits 1 on
 * any console error, page error, failed request (incl. HTTP >= 400) or __ready timeout.
 *
 * OPTIONAL assets — the couple's private photos (photos/*.jpg|jpeg|png|webp) and the recorded
 * narration (audio/narration.*) — may be absent: the film has fallbacks for them. A 404 for one of
 * those (and the browser's own "Failed to load resource" console line for it) is listed under
 * `optionalMissing` in the summary and does not fail the run. Add --query "photos=0" for
 * privacy-safe frames that never touch the photos.
 *
 * PRIVACY GUARD: screenshots can show the private photos, so --out inside the git repository is
 * refused unless the run has --query "photos=0". Write ordinary shots to a scratch folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, startServer } from './serve.mjs';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = ['playwright', '/usr/local/lib/node_modules_global/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {}
  }
  throw new Error('playwright not found (set NODE_PATH to the global node_modules)');
}

function parseArgs(argv) {
  const opts = { page: 'index.html', times: null, query: '', size: '1280x720', timeout: 120000, out: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const val = argv[++i];
    if (!(key in opts) || val === undefined) throw new Error(`bad argument: ${argv[i - 1]}`);
    opts[key] = val;
  }
  if (!opts.out) throw new Error('--out <dir> is required');
  opts.times = opts.times ? opts.times.split(',').map((s) => s.trim()).filter(Boolean) : null;
  opts.timeout = Number(opts.timeout);
  const [w, h] = opts.size.split('x').map(Number);
  opts.viewport = { width: w, height: h };
  opts.query = opts.query.replace(/^[?&]/, '');
  return opts;
}

const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Files the film can run without (see the header). */
const OPTIONAL = /\/(photos\/[^/?#]+\.(jpe?g|png|webp)|audio\/narration\.[a-z0-9]+|characters\/[^?#]+\.(json|png|webp)|art\/[a-z]+\/manifest\.json)([?#]|$)/i;
const isOptional = (url) => typeof url === 'string' && OPTIONAL.test(url);

/** The enclosing git work tree of the film folder (the folder itself if there is none). */
function repoRoot() {
  for (let dir = ROOT; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return ROOT;
  }
}

function isInside(dir, parent) {
  const rel = path.relative(parent, path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const photosOff = new URLSearchParams(opts.query).getAll('photos').at(-1) === '0';
  if (!photosOff && isInside(opts.out, repoRoot())) {
    throw new Error(`--out ${opts.out} is inside the repository: screenshots may show the couple's private photos. ` +
      'Use a folder outside the repository, or add --query "photos=0".');
  }
  fs.mkdirSync(opts.out, { recursive: true });
  const { chromium } = loadPlaywright();
  const { server, url: base } = await startServer(0);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });

  const summary = { ok: true, page: opts.page, shots: [], consoleErrors: [], pageErrors: [], failedRequests: [], warnings: [], optionalMissing: [] };
  const stem = opts.page.replace(/\.html?$/, '').replace(/[\\/]/g, '-');
  const runs = opts.times ?? [null];

  for (const time of runs) {
    const qs = [time !== null ? `t=${time}` : null, 'ui=0', opts.query || null].filter(Boolean).join('&');
    const url = `${base}${opts.page}?${qs}`;
    const tag = time !== null ? `t=${time}` : opts.page;
    const page = await context.newPage();
    page.on('console', (msg) => {
      const entry = { shot: tag, text: msg.text(), location: msg.location()?.url };
      if (msg.type() === 'error' && isOptional(entry.location) && /Failed to load resource/i.test(entry.text)) return;
      if (msg.type() === 'error') summary.consoleErrors.push(entry);
      else if (msg.type() === 'warning') summary.warnings.push(entry);
    });
    page.on('pageerror', (err) => summary.pageErrors.push({ shot: tag, text: String(err?.stack ?? err) }));
    page.on('requestfailed', (req) =>
      (isOptional(req.url()) ? summary.optionalMissing : summary.failedRequests).push({ shot: tag, url: req.url(), failure: req.failure()?.errorText }),
    );
    page.on('response', (res) => {
      if (res.status() < 400) return;
      const entry = { shot: tag, url: res.url(), failure: `HTTP ${res.status()}` };
      if (res.status() === 404 && isOptional(res.url())) summary.optionalMissing.push(entry);
      else summary.failedRequests.push(entry);
    });

    const started = Date.now();
    const file = path.join(opts.out, time !== null ? `${stem}-t${time}.png` : `${stem}.png`);
    const shot = { time, url, file, ready: false, ms: 0 };
    try {
      await page.goto(url, { waitUntil: 'load', timeout: opts.timeout });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: opts.timeout, polling: 100 });
      shot.ready = true;
    } catch (err) {
      summary.pageErrors.push({ shot: tag, text: `not ready: ${err.message.split('\n')[0]}` });
    }
    await page.screenshot({ path: file });
    shot.ms = Date.now() - started;
    summary.shots.push(shot);
    await page.close();
  }

  await browser.close();
  server.close();
  summary.ok = !summary.consoleErrors.length && !summary.pageErrors.length && !summary.failedRequests.length;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
