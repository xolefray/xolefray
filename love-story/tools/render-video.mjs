/**
 * render-video.mjs — deterministic MP4 export of the film.
 *
 * Usage:
 *   node love-story/tools/render-video.mjs [--out film-en.mp4] [--lang en|es]
 *        [--size 1920x1080] [--fps 30] [--from 0] [--to DURATION] [--jobs 3]
 *        [--query "k=v&k2=v"] [--crf 18] [--narration file.mp3] [--no-audio] [--keep-frames]
 *
 * `--lang` appends `lang=` to the page query. The default output name is film-<lang>.mp4
 * (language from --lang, else from an existing lang= in --query, else en). DURATION comes
 * from the timeline, so a longer film needs no change here.
 *
 * Each job opens index.html once (ui=0, mute=1, t=chunk start, plus --query), waits for
 * window.__ready, then seeks every frame and screenshots the page (DOM captions included).
 * Frames are piped as JPEG into a per-job ffmpeg (image2pipe / mjpeg → libx264 yuv420p);
 * the chunks are concatenated with the concat demuxer (-c copy). The score is rendered in a
 * separate page with renderOffline(0, DURATION, 44100), written to a WAV, and muxed as AAC
 * 192k. --narration is mixed on top with the music lowered 6 dB. --no-audio skips that.
 * If the score cannot be rendered, the video is still written and the failure is reported.
 *
 * Temp files live in the OS temp dir and are removed unless --keep-frames.
 * Progress goes to stderr. A one-line summary goes to stdout. Exits non-zero on failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';
import { DURATION } from '../src/timeline.js';

const require = createRequire(import.meta.url);

const FFMPEG = '/usr/bin/ffmpeg';
const READY_TIMEOUT_MS = 180000;
const AUDIO_RENDER_TIMEOUT_MS = 480000;
const JPEG_QUALITY = 92;
const AUDIO_RATE = 44100;
/** Float32 samples per base64 transfer. 4 bytes each → 4 MB raw, ~5.4 MB base64 (under 8 MB). */
const PCM_CHUNK = 1_048_576;
const CHROMIUM_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage',
];
const OPTIONAL_ASSET = /\/(photos\/[^/?#]+\.(jpe?g|png|webp)|audio\/narration(\.[a-z]{2})?\.[a-z0-9]+)([?#]|$)/i;

const USAGE = `usage: node love-story/tools/render-video.mjs [--out film-<lang>.mp4] [--lang en|es]
       [--size 1920x1080] [--fps 30] [--from 0] [--to DURATION] [--jobs 3] [--query "k=v"]
       [--crf 18] [--narration file.mp3] [--no-audio] [--keep-frames]`;

function loadPlaywright() {
  const candidates = ['playwright', '/usr/local/lib/node_modules_global/playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  throw new Error('playwright not found (set NODE_PATH to the global node_modules)');
}

function assertFfmpeg() {
  if (!fs.existsSync(FFMPEG)) {
    throw new Error(`ffmpeg is missing: ${FFMPEG} was not found. Install ffmpeg built with libx264 and aac.`);
  }
  const probe = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    const detail = (probe.stderr || probe.error?.message || 'could not run').toString().trim();
    throw new Error(`ffmpeg is missing or not runnable (${FFMPEG}): ${detail.slice(0, 400)}`);
  }
  const text = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  if (!/\blibx264\b/.test(text) || !/\baac\b/.test(text)) {
    throw new Error(`ffmpeg at ${FFMPEG} does not provide both libx264 and aac.`);
  }
}

function parseArgs(argv) {
  const raw = {
    out: null,
    size: '1920x1080',
    fps: '30',
    from: '0',
    to: null,
    jobs: '3',
    query: '',
    crf: '18',
    narration: null,
    lang: null,
  };
  let noAudio = false;
  let keepFrames = false;
  const valued = new Set(Object.keys(raw));
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}\n${USAGE}`);
    const key = arg.slice(2);
    if (key === 'no-audio') {
      noAudio = true;
      continue;
    }
    if (key === 'keep-frames') {
      keepFrames = true;
      continue;
    }
    if (!valued.has(key)) throw new Error(`unknown argument: ${arg}\n${USAGE}`);
    const val = argv[++i];
    if (val === undefined) throw new Error(`missing value for ${arg}\n${USAGE}`);
    raw[key] = val;
  }
  if (raw.lang != null && raw.lang !== 'en' && raw.lang !== 'es') {
    throw new Error(`bad --lang ${raw.lang} (expected en or es)\n${USAGE}`);
  }

  const size = /^(\d+)x(\d+)$/.exec(raw.size);
  if (!size) throw new Error(`bad --size ${raw.size} (expected WxH, for example 1920x1080)`);
  const width = Number(size[1]);
  const height = Number(size[2]);
  if (width < 2 || height < 2 || width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(`bad --size ${raw.size}: width and height must be even (yuv420p) and at least 2`);
  }

  const fps = Number(raw.fps);
  const from = Number(raw.from);
  const to = raw.to == null ? DURATION : Number(raw.to);
  const jobs = Number(raw.jobs);
  const crf = Number(raw.crf);
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`bad --fps ${raw.fps}`);
  if (!Number.isFinite(from) || from < 0) throw new Error(`bad --from ${raw.from}`);
  if (!Number.isFinite(to) || to <= from) throw new Error(`bad --to ${raw.to} (must be greater than --from ${from})`);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`bad --jobs ${raw.jobs} (integer >= 1)`);
  if (!Number.isFinite(crf) || crf < 0 || crf > 51) throw new Error(`bad --crf ${raw.crf} (0–51)`);

  let narration = null;
  if (raw.narration) {
    narration = path.resolve(raw.narration);
    if (!fs.existsSync(narration)) throw new Error(`narration file not found: ${raw.narration}`);
  }

  const totalFrames = frameCount(from, to, fps);
  if (totalFrames < 1) throw new Error(`range ${from}–${to} at ${fps} fps contains no frames`);

  let query = raw.query.replace(/^[?&]/, '');
  const fromQuery = new URLSearchParams(query).getAll('lang').at(-1);
  const detected = fromQuery === 'es' || fromQuery === 'en' ? fromQuery : null;
  const lang = raw.lang || detected || 'en';
  if (raw.lang) query = [query, `lang=${raw.lang}`].filter(Boolean).join('&');
  const out = raw.out || `film-${lang}.mp4`;

  return {
    out: path.resolve(out),
    width,
    height,
    fps,
    from,
    to,
    jobs,
    crf,
    query,
    lang,
    narration,
    noAudio,
    keepFrames,
    totalFrames,
  };
}

/** Frames i with time from + i/fps strictly inside [from, to). */
function frameCount(from, to, fps) {
  const n = (to - from) * fps;
  return Math.max(0, Math.floor(n + 1e-6));
}

function frameTime(from, fps, index) {
  return from + index / fps;
}

/** Contiguous [start, start+count) frame-index ranges, one per job. */
function splitFrames(total, jobs) {
  const n = Math.min(jobs, total);
  const base = Math.floor(total / n);
  let extra = total % n;
  const chunks = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const count = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    chunks.push({ index: i, start, count });
    start += count;
  }
  return chunks;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '?';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

function timescaleFor(fps) {
  if (Number.isInteger(fps) && fps > 0 && fps <= 60000) return String(fps * 1000);
  return '90000';
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    ff.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 16000) err = err.slice(-8000);
    });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-2000)}`));
    });
  });
}

/**
 * One libx264 encoder fed by concatenated JPEGs on stdin.
 * threads=1 and sliced-threads=0 keep the encode deterministic across runs.
 */
function startEncoder(outPath, fps, crf) {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-c:v', 'mjpeg',
    '-i', 'pipe:0',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-fps_mode', 'cfr',
    '-threads', '1',
    '-x264-params', 'sliced-threads=0',
    '-video_track_timescale', timescaleFor(fps),
    '-movflags', '+faststart',
    outPath,
  ];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let errText = '';
  ff.stderr.on('data', (d) => {
    errText += d.toString();
    if (errText.length > 16000) errText = errText.slice(-8000);
  });
  let settled = false;
  let fail = null;
  const done = new Promise((resolve, reject) => {
    ff.on('error', (err) => {
      if (settled) return;
      settled = true;
      fail = err;
      reject(err);
    });
    ff.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else {
        fail = new Error(`ffmpeg exited ${code} writing ${path.basename(outPath)}: ${errText.trim().slice(-2000)}`);
        reject(fail);
      }
    });
  });
  // The caller always awaits `done`. Swallow a late rejection if the process is killed early.
  done.catch(() => {});

  function write(buf) {
    return new Promise((resolve, reject) => {
      if (fail) {
        reject(fail);
        return;
      }
      let settledWrite = false;
      const finish = (err) => {
        if (settledWrite) return;
        settledWrite = true;
        ff.stdin.off('error', onError);
        if (err) reject(err);
        else resolve();
      };
      const onError = (err) => finish(err);
      ff.stdin.once('error', onError);
      let ok = false;
      try {
        ok = ff.stdin.write(buf);
      } catch (err) {
        finish(err);
        return;
      }
      if (ok) finish();
      else ff.stdin.once('drain', () => finish());
    });
  }

  function end() {
    return new Promise((resolve) => {
      if (fail || !ff.stdin.writable) {
        resolve();
        return;
      }
      ff.stdin.end(() => resolve());
    });
  }

  return { ff, done, write, end, error: () => fail };
}

function optionalRequest(url) {
  return typeof url === 'string' && OPTIONAL_ASSET.test(url);
}

async function renderChunk({ chunk, opts, base, tmp, progress, browsers }) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  browsers.push(browser);
  const t0 = frameTime(opts.from, opts.fps, chunk.start);
  const qs = [`ui=0`, `t=${t0}`, 'mute=1', opts.query || null].filter(Boolean).join('&');
  const url = `${base}index.html?${qs}`;
  const outPath = path.join(tmp, `chunk-${String(chunk.index).padStart(2, '0')}.mp4`);
  const encoder = startEncoder(outPath, opts.fps, opts.crf);
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(READY_TIMEOUT_MS);
  const pageErrors = [];
  page.on('pageerror', (err) => {
    const text = String(err?.stack || err).split('\n')[0];
    pageErrors.push(text);
    process.stderr.write(`[render] job ${chunk.index + 1} pageerror: ${text}\n`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location()?.url;
    if (optionalRequest(loc) && /Failed to load resource/i.test(msg.text())) return;
    process.stderr.write(`[render] job ${chunk.index + 1} console: ${msg.text()}\n`);
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: READY_TIMEOUT_MS });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: READY_TIMEOUT_MS, polling: 100 });
    if (pageErrors.length) throw new Error(pageErrors[0]);
    // The wait is two requestAnimationFrame turns, not a signal on window.__film.
    // The film's loop (already queued) paints the seek on the first; the second runs after that paint.
    await page.evaluate(() => {
      window.__captureSettle = (t) =>
        new Promise((resolve) => {
          window.__film.seek(t);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
    });
    process.stderr.write(`[render] job ${chunk.index + 1}/${progress.jobs} ready, ${chunk.count} frames from t=${t0.toFixed(3)}\n`);

    const frameDir = opts.keepFrames ? path.join(tmp, 'frames') : null;
    if (frameDir) await fs.promises.mkdir(frameDir, { recursive: true });

    for (let i = 0; i < chunk.count; i++) {
      if (progress.abort) throw new Error('aborted');
      const index = chunk.start + i;
      const t = frameTime(opts.from, opts.fps, index);
      await page.evaluate((time) => window.__captureSettle(time), t);
      const jpeg = await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY });
      if (i === 0) {
        const got = jpegSize(jpeg);
        if (!got || got.width !== opts.width || got.height !== opts.height) {
          throw new Error(`screenshot is ${got ? `${got.width}x${got.height}` : 'unreadable'}, expected ${opts.width}x${opts.height}`);
        }
      }
      if (frameDir) {
        await fs.promises.writeFile(path.join(frameDir, `${String(index).padStart(6, '0')}.jpg`), jpeg);
      }
      await encoder.write(jpeg);
      progress.done += 1;
      if (!progress.firstAt) progress.firstAt = Date.now();
      progress.lastAt = Date.now();
      reportProgress(progress);
    }
    await encoder.end();
    await encoder.done;
    return outPath;
  } catch (err) {
    try { encoder.ff.kill('SIGKILL'); } catch { /* already gone */ }
    throw err;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function reportProgress(progress) {
  const now = Date.now();
  const last = progress.done === progress.total;
  if (!last && now - progress.printed < 1000) return;
  progress.printed = now;
  const elapsed = (now - progress.t0) / 1000;
  const fps = elapsed > 0 ? progress.done / elapsed : 0;
  const eta = fps > 0 ? (progress.total - progress.done) / fps : Infinity;
  process.stderr.write(`[render] ${progress.done}/${progress.total} frames  ${fps.toFixed(2)} fps  ETA ${formatEta(eta)}\n`);
}

async function concatChunks(chunkPaths, outPath) {
  const list = chunkPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  const listPath = path.join(path.dirname(outPath), 'concat.txt');
  await fs.promises.writeFile(listPath, list);
  await runFfmpeg([
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outPath,
  ]);
}

function wavHeaderFloat(dataBytes, channels, sampleRate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 4, 28);
  h.writeUInt16LE(channels * 4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

function bufferToF32(raw) {
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  return new Float32Array(ab);
}

function interleaveFloat(channels) {
  const n = channels[0].length;
  const chs = channels.length;
  const out = Buffer.allocUnsafe(n * chs * 4);
  let o = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < chs; c++) {
      const s = channels[c][i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
      out.writeFloatLE(s, o);
      o += 4;
    }
  }
  return { buf: out, peak };
}

const AUDIO_PAGE_HTML = `<!doctype html><meta charset="utf-8"><script type="module">
import { renderOffline } from './src/audio.js';
import { DURATION } from './src/timeline.js';
window.__renderOffline = renderOffline;
window.__DURATION = DURATION;
// Float32 PCM as base64, one channel slice at a time, so each transfer stays small.
window.__pcmSlice = (channel, offset, count) => {
  const src = window.__pcm.getChannelData(channel);
  const n = Math.max(0, Math.min(count, src.length - offset));
  const copy = new Float32Array(n);
  copy.set(src.subarray(offset, offset + n));
  const bytes = new Uint8Array(copy.buffer);
  const step = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += step) {
    const sub = bytes.subarray(i, Math.min(i + step, bytes.length));
    const tmp = new Array(sub.length);
    for (let j = 0; j < sub.length; j++) tmp[j] = sub[j];
    binary += String.fromCharCode.apply(null, tmp);
  }
  return btoa(binary);
};
window.__audioReady = true;
</script>`;

async function openAudioPage(browser, base) {
  const context = await browser.newContext({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err?.stack || err).split('\n')[0]));
  await page.route('**/__render_audio__.html', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: AUDIO_PAGE_HTML,
    });
  });
  await page.goto(`${base}__render_audio__.html`, { waitUntil: 'load', timeout: 120000 });
  try {
    await page.waitForFunction(() => window.__audioReady === true, null, { timeout: 120000 });
  } catch (err) {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    throw new Error(`audio page did not load${errors.length ? `: ${errors[0]}` : ''}: ${err.message.split('\n')[0]}`);
  }
  return { page, context };
}

async function closeAudioPage(opened) {
  if (!opened) return;
  await opened.page.close().catch(() => {});
  await opened.context.close().catch(() => {});
}

async function pullChannel(page, channel, offset, count) {
  const data = await page.evaluate(
    ({ channel: ch, offset: off, count: n }) => window.__pcmSlice(ch, off, n),
    { channel, offset, count },
  );
  const raw = Buffer.from(data, 'base64');
  if (raw.byteLength !== count * 4) {
    throw new Error(`bad pcm transfer: ${raw.byteLength} bytes for ${count} samples`);
  }
  return bufferToF32(raw);
}

async function writeInterleavedRange(fh, page, channels, length) {
  let peak = 0;
  for (let offset = 0; offset < length; offset += PCM_CHUNK) {
    const count = Math.min(PCM_CHUNK, length - offset);
    const parts = [];
    for (let c = 0; c < channels; c++) parts.push(await pullChannel(page, c, offset, count));
    const mixed = interleaveFloat(parts);
    if (mixed.peak > peak) peak = mixed.peak;
    await fh.write(mixed.buf);
    const done = Math.min(length, offset + count);
    process.stderr.write(`[render] audio pcm ${done}/${length} samples\n`);
  }
  return peak;
}

async function renderScoreToPage(page, fromT, toT) {
  page.setDefaultTimeout(AUDIO_RENDER_TIMEOUT_MS);
  const info = await page.evaluate(async ({ fromT: a, toT: b, sampleRate }) => {
    const buf = await window.__renderOffline(a, b, sampleRate);
    if (!buf) return null;
    window.__pcm = buf;
    return { length: buf.length, channels: buf.numberOfChannels, sampleRate: buf.sampleRate };
  }, { fromT, toT, sampleRate: AUDIO_RATE });
  if (!info || !info.length) throw new Error(`renderOffline(${fromT}, ${toT}, ${AUDIO_RATE}) returned nothing`);
  return info;
}

/** Full-length score, then Float32 channel slices pulled under the transfer cap. */
async function writeScoreWav(browser, base, wavPath) {
  let opened = await openAudioPage(browser, base);
  try {
    process.stderr.write(`[render] rendering score 0–${DURATION}s at ${AUDIO_RATE} Hz\n`);
    let info;
    let chunked = false;
    try {
      const duration = await opened.page.evaluate(() => window.__DURATION);
      info = await renderScoreToPage(opened.page, 0, duration);
    } catch (err) {
      chunked = true;
      process.stderr.write(`[render] full-length renderOffline failed (${err.message.split('\n')[0]}); rendering in 15s chunks\n`);
      await closeAudioPage(opened);
      opened = await openAudioPage(browser, base);
    }
    const fh = await fs.promises.open(wavPath, 'w');
    try {
      if (!chunked) {
        await fh.write(wavHeaderFloat(info.length * info.channels * 4, info.channels, info.sampleRate));
        const peak = await writeInterleavedRange(fh, opened.page, info.channels, info.length);
        process.stderr.write(`[render] audio peak ${peak.toFixed(4)}  ${info.length} samples  ${info.channels} ch\n`);
        return;
      }
      await fh.write(Buffer.alloc(44));
      const duration = await opened.page.evaluate(() => window.__DURATION);
      const slice = 15;
      let frames = 0;
      let channels = 2;
      let sampleRate = AUDIO_RATE;
      let peak = 0;
      for (let t = 0; t < duration - 1e-9; t += slice) {
        const to = Math.min(duration, t + slice);
        process.stderr.write(`[render] audio chunk ${t.toFixed(1)}–${to.toFixed(1)}s\n`);
        const part = await renderScoreToPage(opened.page, t, to);
        channels = part.channels;
        sampleRate = part.sampleRate;
        const partPeak = await writeInterleavedRange(fh, opened.page, part.channels, part.length);
        if (partPeak > peak) peak = partPeak;
        frames += part.length;
        await opened.page.evaluate(() => { window.__pcm = null; });
      }
      const header = wavHeaderFloat(frames * channels * 4, channels, sampleRate);
      await fh.write(header, 0, 44, 0);
      process.stderr.write(`[render] audio peak ${peak.toFixed(4)}  ${frames} samples  ${channels} ch (chunked)\n`);
    } finally {
      await fh.close();
    }
  } finally {
    await closeAudioPage(opened);
  }
}

async function muxAudio({ video, wav, narration, from, seconds, out }) {
  const args = ['-i', video];
  if (narration) {
    args.push(
      '-ss', secondsFixed(from), '-t', secondsFixed(seconds), '-i', wav,
      '-ss', secondsFixed(from), '-t', secondsFixed(seconds), '-i', narration,
      '-filter_complex',
      '[1:a]aresample=44100,volume=-6dB[music];[2:a]aresample=44100[narr];[music][narr]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]',
      '-map', '0:v:0', '-map', '[aout]',
    );
  } else {
    args.push(
      '-ss', secondsFixed(from), '-t', secondsFixed(seconds), '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0',
    );
  }
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', out);
  await runFfmpeg(args);
}

function secondsFixed(n) {
  return n.toFixed(6);
}

async function placeFile(src, dest) {
  if (src === dest) return;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.promises.rename(src, dest);
  } catch {
    await fs.promises.copyFile(src, dest);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertFfmpeg();
  await fs.promises.mkdir(path.dirname(opts.out), { recursive: true });

  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'love-story-render-'));
  let server = null;
  const browsers = [];
  let audioWarning = null;
  try {
    const started = await startServer(0);
    server = started.server;
    const base = started.url;
    const chunks = splitFrames(opts.totalFrames, opts.jobs);
    const seconds = opts.totalFrames / opts.fps;
    process.stderr.write(
      `[render] ${opts.totalFrames} frames  ${opts.width}x${opts.height}  ${opts.fps} fps  ` +
      `${seconds.toFixed(3)}s  ${chunks.length} jobs  t ${opts.from}–${opts.to}` +
      `${opts.noAudio ? '  no-audio' : ''}\n`,
    );

    const progress = {
      done: 0,
      total: opts.totalFrames,
      jobs: chunks.length,
      t0: Date.now(),
      printed: 0,
      firstAt: 0,
      lastAt: 0,
    };
    const tasks = chunks.map((chunk) => renderChunk({
      chunk, opts, base, tmp, progress, browsers,
    }));
    let chunkPaths;
    try {
      chunkPaths = await Promise.all(tasks);
    } catch (err) {
      progress.abort = err;
      await Promise.all(browsers.map((b) => b.close().catch(() => {})));
      await Promise.allSettled(tasks);
      throw err;
    }
    chunkPaths.sort();
    const captureSec = progress.firstAt ? (progress.lastAt - progress.firstAt) / 1000 : 0;
    const wallSec = (Date.now() - progress.t0) / 1000;
    const steady = captureSec > 0 ? opts.totalFrames / captureSec : 0;
    process.stderr.write(
      `[render] captured ${opts.totalFrames} frames in ${wallSec.toFixed(1)}s wall ` +
      `(${(opts.totalFrames / wallSec).toFixed(2)} fps including startup, ` +
      `${steady.toFixed(2)} fps first-to-last) at ${opts.width}x${opts.height} with ${chunks.length} jobs\n`,
    );

    const silentPath = path.join(tmp, 'video.mp4');
    await concatChunks(chunkPaths, silentPath);

    let wroteAudio = false;
    if (!opts.noAudio) {
      const { chromium } = loadPlaywright();
      const audioBrowser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
      browsers.push(audioBrowser);
      const wavPath = path.join(tmp, 'score.wav');
      try {
        await writeScoreWav(audioBrowser, base, wavPath);
        await muxAudio({
          video: silentPath,
          wav: wavPath,
          narration: opts.narration,
          from: opts.from,
          seconds,
          out: opts.out,
        });
        wroteAudio = true;
      } catch (err) {
        audioWarning = err.message?.split('\n')[0] || String(err);
        process.stderr.write(`[render] audio rendering failed: ${audioWarning}\n`);
        process.stderr.write('[render] finishing the video without audio\n');
        await placeFile(silentPath, opts.out);
      } finally {
        await audioBrowser.close().catch(() => {});
      }
    } else {
      await placeFile(silentPath, opts.out);
    }

    const bytes = (await fs.promises.stat(opts.out)).size;
    const audioNote = opts.noAudio ? 'no-audio' : wroteAudio ? (opts.narration ? 'aac+narration' : 'aac') : 'NO AUDIO';
    console.log(`${opts.out}  ${seconds.toFixed(3)}s  ${opts.width}x${opts.height}  ${opts.totalFrames} frames  ${bytes} bytes  ${audioNote}`);
  } finally {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
    if (server) await new Promise((resolve) => server.close(resolve));
    if (opts.keepFrames) process.stderr.write(`[render] kept temp files in ${tmp}\n`);
    else await fs.promises.rm(tmp, { recursive: true, force: true });
  }
  if (audioWarning) {
    // The video exists; the failure was reported. Still non-zero so a caller can tell audio was dropped.
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
