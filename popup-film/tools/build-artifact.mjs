/**
 * build-artifact.mjs — packs the film into ONE HTML fragment for a hosted page viewer.
 *
 * Usage:
 *   node popup-film/tools/build-artifact.mjs --out <dir> [--three-cdn] [--target es2022] [--cache <dir>]
 *
 * Writes <dir>/index.html: a page FRAGMENT, not a document. The host wraps it in its own
 * `<!doctype html><html><head>…</head><body>` skeleton (charset, viewport-fit=cover, a small
 * reset that pads :root by the safe-area insets), so the fragment carries no doctype / html /
 * head / body tags. It runs in a sandboxed, possibly opaque-origin iframe, so nothing of the
 * film's own is fetched; everything is inline, in this order:
 *
 *   <title> · <meta name="description"> · <style> (styles.css verbatim + a short host-compat
 *   block) · the body markup of index.html (minus script / link / import-map tags) · one
 *   <script type="module"> holding src/main.js and everything it imports.
 *
 * Default: three.js is bundled in too and the script is minified, so the page makes ZERO network
 * requests. --three-cdn: 'three' and 'three/addons/*' stay external imports, resolved by an inline
 * <script type="importmap"> (before the module script) to jsDelivr's copy of the npm release the
 * vendored files are (three@0.170.0: build/three.module.js, examples/jsm/…), each pinned by a
 * sha384 `integrity` entry computed from the vendored bytes; the film bundle is NOT minified, so
 * it stays readable. Those CDN fetches are its only requests; if they fail, a small inline script
 * shows the intro card's error state (index.html's own module-script onerror handler).
 *
 * Bundling uses esbuild 0.24.0 (pinned), installed on first use into a cache dir outside the
 * repo (default ~/.cache/popup-film-build/esbuild-0.24.0, override with --cache or
 * $POPUP_FILM_ESBUILD_CACHE; needs the npm registry once). By default 'three' and 'three/addons/*'
 * resolve to the vendored copies, so the bundle holds exactly one three.js. The script is checked
 * for `</script` and `<!--` (escaped, then re-parsed), the markup and CSS for any URL that would
 * be fetched, and the output against the 16 MB page limit. Prints a summary; exits 1 on failure.
 *
 * Query strings never reach the hosted page, so viewers get the default path: the poster frame
 * behind the title card, and Begin plays from 0.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD_VERSION = '0.24.0';
const MAX_BYTES = 16 * 1024 * 1024;
const ENTRY = path.join(ROOT, 'src', 'main.js');
const THREE_MAIN = path.join(ROOT, 'vendor', 'three.module.js');
const THREE_ADDONS = path.join(ROOT, 'vendor', 'addons');

// --three-cdn: the npm release the vendored files were copied from (byte-identical: r170).
const THREE_VERSION = '0.170.0';
const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/`;
const CDN_IMPORTS = { three: `${THREE_CDN}build/three.module.js`, 'three/addons/': `${THREE_CDN}examples/jsm/` };

/* The host's reset sets `body { margin: 0; font: 14px system-ui }`, a light colour scheme and
   pads :root by the safe-area insets. Every film layer is position: fixed; inset: 0 (and keeps
   clear of the insets itself via env()), so the padding cannot shrink the picture; restore the
   shell's own type metrics, and the dark scheme, which the film's :root rule already sets. */
const COMPAT_CSS = `
/* ---------------------------------------------------------------- single-page build (tools/build-artifact.mjs) */

body {
  font-size: medium;
  line-height: normal;
}
`;

// ---------------------------------------------------------------- arguments

const USAGE = 'usage: node popup-film/tools/build-artifact.mjs --out <dir> [--three-cdn] [--target es2022] [--cache <dir>]';

function parseArgs(argv) {
  const opts = {
    out: null,
    target: 'es2022',
    cache:
      process.env.POPUP_FILM_ESBUILD_CACHE ||
      path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'popup-film-build', `esbuild-${ESBUILD_VERSION}`),
    threeCdn: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (argv[i] === '--three-cdn') {
      opts.threeCdn = true;
      continue;
    }
    const key = argv[i].replace(/^--/, '');
    const val = argv[++i];
    if (!(key in opts) || key === 'threeCdn' || val === undefined) throw new Error(`bad argument: ${argv[i - 1]}\n${USAGE}`);
    opts[key] = val;
  }
  if (!opts.out) throw new Error(`--out <dir> is required\n${USAGE}`);
  if (!/^es20(2\d)$|^esnext$/.test(opts.target)) throw new Error(`--target must be es2020 or later, got ${opts.target}`);
  opts.out = path.resolve(opts.out);
  opts.cache = path.resolve(opts.cache);
  return opts;
}

// ---------------------------------------------------------------- esbuild (pinned, cached outside the repo)

function loadEsbuild(cacheDir) {
  const req = createRequire(path.join(cacheDir, 'package.json'));
  const tryLoad = () => {
    try {
      const esbuild = req('esbuild');
      return esbuild.version === ESBUILD_VERSION ? esbuild : null;
    } catch {
      return null;
    }
  };
  let esbuild = tryLoad();
  if (esbuild) return esbuild;

  const rel = path.relative(ROOT, cacheDir);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error(`esbuild cache dir must be outside the project: ${cacheDir}`);
  console.error(`[build-artifact] installing esbuild@${ESBUILD_VERSION} into ${cacheDir} …`);
  fs.mkdirSync(cacheDir, { recursive: true });
  const pkg = path.join(cacheDir, 'package.json');
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: 'popup-film-build-cache', private: true }, null, 2) + '\n');
  execFileSync(
    'npm',
    ['install', '--prefix', cacheDir, '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error', `esbuild@${ESBUILD_VERSION}`],
    { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' },
  );
  esbuild = tryLoad();
  if (!esbuild) throw new Error(`esbuild@${ESBUILD_VERSION} could not be loaded from ${cacheDir}`);
  return esbuild;
}

/** The vendored file behind a 'three' / 'three/addons/…' specifier (the import map's rules), or null. */
function vendoredFile(spec) {
  if (spec === 'three') return THREE_MAIN;
  const file = path.join(THREE_ADDONS, spec.slice('three/addons/'.length));
  return file.startsWith(THREE_ADDONS + path.sep) && fs.existsSync(file) ? file : null;
}

/** The CDN URL a 'three' / 'three/addons/…' specifier resolves to under CDN_IMPORTS. */
const cdnURL = (spec) => (spec === 'three' ? CDN_IMPORTS.three : CDN_IMPORTS['three/addons/'] + spec.slice('three/addons/'.length));

/**
 * 'three' and 'three/addons/*' resolve to the vendored files, or (external) stay bare imports for
 * the import map. Either way an add-on must exist in vendor/addons (the mirror of examples/jsm).
 */
function threeResolver(external) {
  return {
    name: external ? 'three-external' : 'vendored-three',
    setup(build) {
      build.onResolve({ filter: /^three(\/addons\/.*)?$/ }, (args) => {
        const file = vendoredFile(args.path);
        if (!file) return { errors: [{ text: `no vendored three.js file for "${args.path}"` }] };
        return external ? { path: args.path, external: true } : { path: file };
      });
      // Anything else bare would have needed a network fetch (or a node_modules the film doesn't have).
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.kind === 'entry-point' || path.isAbsolute(args.path)) return undefined;
        return { errors: [{ text: `bare import "${args.path}" has no vendored file` }] };
      });
    },
  };
}

async function bundle(esbuild, { target, threeCdn }) {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    absWorkingDir: ROOT,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target,
    minify: !threeCdn, // the CDN build keeps the film code readable
    charset: 'utf8',
    legalComments: 'eof', // keeps three.js's MIT notice when it is bundled
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [threeResolver(threeCdn)],
  });
  for (const w of result.warnings) console.error(`[build-artifact] esbuild warning: ${w.text}${w.location ? ` (${w.location.file}:${w.location.line})` : ''}`);
  const [output] = result.outputFiles;
  const [meta] = Object.values(result.metafile.outputs);
  const externals = [...new Set(meta.imports.map((i) => i.path))];
  const unexpected = meta.imports.filter((i) => !threeCdn || !i.external || i.kind !== 'import-statement' || !vendoredFile(i.path));
  if (unexpected.length) throw new Error(`bundle still imports: ${unexpected.map((i) => `${i.path} (${i.kind})`).join(', ')}`);
  return { code: output.text, metafile: result.metafile, meta, externals };
}

// ---------------------------------------------------------------- --three-cdn: import map

/** The import map for the CDN build, with a sha384 integrity entry per module the bundle imports. */
function cdnImportMap(externals) {
  const revision = fs.readFileSync(THREE_MAIN, 'utf8').match(/\bREVISION\s*=\s*'(\d+)'/)?.[1];
  if (revision !== THREE_VERSION.split('.')[1]) {
    throw new Error(`vendor/three.module.js is r${revision}, but the CDN build pins three@${THREE_VERSION}`);
  }
  const integrity = {};
  for (const spec of externals.sort()) {
    integrity[cdnURL(spec)] = `sha384-${crypto.createHash('sha384').update(fs.readFileSync(vendoredFile(spec))).digest('base64')}`;
  }
  const json = JSON.stringify({ imports: CDN_IMPORTS, integrity }, null, 2);
  if (/<\/script|<!--/i.test(json)) throw new Error('import map is not safe to inline');
  return { json, urls: Object.keys(integrity) };
}

/** index.html's own module-script onerror handler, attached to the inline module script instead. */
function cdnErrorScript(handler) {
  if (!handler) return '';
  const body = handler
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  if (/<\/script|<!--/i.test(body)) throw new Error('index.html module onerror handler is not safe to inline');
  return [
    '<script>',
    '/* three.js comes from the CDN: if it cannot be fetched, show the intro card\'s error state. */',
    "document.currentScript.previousElementSibling.addEventListener('error', function () {",
    `  ${body};`,
    '});',
    '</script>',
  ].join('\n');
}

// ---------------------------------------------------------------- inline-safety

/**
 * Inside <script>, `</script` ends the element and `<!--` can switch the HTML tokenizer into its
 * escaped states (after which a later `<script` keeps our closing tag from closing anything).
 * esbuild already escapes these in strings; anything left is escaped here ( `<\/script`, `\x3C!--`
 * are the same characters in strings, templates and regexes) and the result is re-parsed.
 */
async function inlineSafeScript(esbuild, code) {
  let fixes = 0;
  const safe = code
    .replace(/<\/(script)/gi, (m, word) => {
      fixes++;
      return `<\\/${word}`;
    })
    .replace(/<!--/g, () => {
      fixes++;
      return '\\x3C!--';
    });
  if (fixes) {
    try {
      await esbuild.transform(safe, { loader: 'js', format: 'esm', target: 'esnext' });
    } catch (err) {
      throw new Error(`escaping ${fixes} </script / <!-- sequence(s) broke the bundle: ${err.message.split('\n')[0]}`);
    }
  }
  return { safe, fixes };
}

/** Fails on anything in CSS that the browser would fetch; escapes `</style`. */
function inlineSafeCss(css) {
  if (/@import\b/i.test(css)) throw new Error('styles.css uses @import (would be fetched)');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")\s]*)/gi)) {
    if (!/^(data:|#)/i.test(m[2])) throw new Error(`styles.css references url(${m[2]}) (would be fetched)`);
  }
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

// ---------------------------------------------------------------- page parts

function readPage() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim();
  if (!title) throw new Error('index.html has no <title>');
  const descTag = html.match(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i)?.[0];
  const description = descTag?.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? descTag?.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
  if (description == null) throw new Error('index.html has no <meta name="description">');
  const moduleTag = html.match(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i)?.[0];
  const moduleOnError = moduleTag?.match(/\bonerror\s*=\s*"([^"]*)"/i)?.[1] ?? null;
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error('index.html has no <body>');
  if (/^<body\s+[^\s>]/i.test(bodyMatch[0])) {
    throw new Error('index.html <body> has attributes, which the fragment cannot carry (the host owns <body>)');
  }

  let body = bodyMatch[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '') // module entry, import map, any inline script
    .replace(/<link\b[^>]*>/gi, '') // stylesheets, modulepreload, favicon
    .replace(/<base\b[^>]*>/gi, '');
  // Dedent by the common indentation and drop blank runs.
  const lines = body.split('\n').map((l) => l.replace(/\s+$/, ''));
  const indent = Math.min(...lines.filter(Boolean).map((l) => l.match(/^ */)[0].length));
  body = lines
    .map((l) => l.slice(indent))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const fetching = body.match(/\s(?:src|href|srcset|poster|action|formaction|background)\s*=\s*["']?(?!data:|#|javascript:void)[^"'\s>]+/i);
  if (fetching) throw new Error(`index.html body references a resource: ${fetching[0].trim()}`);
  if (/url\(\s*['"]?(?!data:|#)/i.test(body)) throw new Error('index.html body has an inline-style url()');
  return { title, description, body, moduleOnError };
}

// ---------------------------------------------------------------- main

const fmt = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const esbuild = loadEsbuild(opts.cache);

  const page = readPage();
  const css = inlineSafeCss(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').trim());
  const { code, metafile, meta, externals } = await bundle(esbuild, opts);
  const { safe: script, fixes } = await inlineSafeScript(esbuild, code.trim());
  const cdn = opts.threeCdn ? cdnImportMap(externals) : null;

  const origin = cdn
    ? `three.js r170 from cdn.jsdelivr.net via the import map, sha384-pinned). Its only external resources are those three.js modules.`
    : `three.js r170 inline). No external resources.`;
  const head = [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}">`,
    `<!-- ${page.title}: single-page build of popup-film/ (tools/build-artifact.mjs; esbuild ${esbuild.version}, ${opts.target}, ${origin} -->`,
  ].join('\n');
  const scripts = cdn
    ? `<script type="importmap">\n${cdn.json}\n</script>\n<script type="module">\n${script}\n</script>\n${cdnErrorScript(page.moduleOnError)}\n`
    : `<script type="module">\n${script}\n</script>\n`;
  const doc = `${head}\n<style>\n${css}\n${COMPAT_CSS}</style>\n${page.body}\n${scripts}`;

  // The host supplies the document skeleton: none of ours may leak in (the bundle is opaque text).
  const markup = doc.slice(0, doc.indexOf('<script'));
  const stray = markup.match(/<!doctype|<\/?html[\s>]|<\/?head[\s>]|<\/?body[\s>]/i);
  if (stray) throw new Error(`fragment contains a document-level tag: ${stray[0]}`);
  if (/<\/script/i.test(script) || script.includes('<!--')) throw new Error('bundle is not safe to inline');
  if (cdn && !page.moduleOnError) console.error('[build-artifact] warning: index.html has no module onerror handler; a failed CDN fetch will leave the loading card up');

  const bytes = Buffer.byteLength(doc);
  if (bytes > MAX_BYTES) throw new Error(`output is ${fmt(bytes)}, over the ${fmt(MAX_BYTES)} limit`);

  fs.mkdirSync(opts.out, { recursive: true });
  const file = path.join(opts.out, 'index.html');
  fs.writeFileSync(file, doc);

  // ---- summary
  const inputs = Object.entries(meta.inputs)
    .map(([p, v]) => ({ p, n: v.bytesInOutput }))
    .sort((a, b) => b.n - a.n);
  const threeCopies = Object.keys(metafile.inputs).filter((p) => p.endsWith('three.module.js')).length;
  const sum = (re) => inputs.filter((i) => re.test(i.p)).reduce((s, i) => s + i.n, 0);
  const scriptBytes = Buffer.byteLength(script);
  const cssBytes = Buffer.byteLength(css) + Buffer.byteLength(COMPAT_CSS);
  const style = cdn ? 'NOT minified (readable)' : 'minified';
  console.log(`[build-artifact] wrote ${file}`);
  console.log(`  total      ${fmt(bytes)} (${bytes.toLocaleString('en-US')} bytes; limit ${fmt(MAX_BYTES)})`);
  console.log(`  script     ${fmt(scriptBytes)} — ${inputs.length} modules, esm, ${style}, ${opts.target}, esbuild ${esbuild.version}`);
  if (cdn) {
    console.log(`               three.js not inlined: import map → jsDelivr three@${THREE_VERSION}, sha384 integrity per module:`);
    for (const url of cdn.urls) console.log(`                 ${url}`);
    console.log(`               film code ${fmt(sum(/^src\//))}`);
  } else {
    console.log(`               three.js ${fmt(sum(/vendor\//))} (${threeCopies} copy) · film code ${fmt(sum(/^src\//))}`);
  }
  console.log(`               largest: ${inputs.slice(0, 5).map((i) => `${i.p.replace(/^.*?(src|vendor)\//, '$1/')} ${fmt(i.n)}`).join(', ')}`);
  console.log(`  style      ${fmt(cssBytes)} (styles.css verbatim + host-compat block)`);
  console.log(`  markup     ${fmt(Buffer.byteLength(page.body))} (index.html body, no script/link/import-map tags)`);
  const imports = cdn ? `${externals.length} external imports, all three.js via the import map` : '0 external imports';
  console.log(`  inline-safety  ${fixes ? `${fixes} sequence(s) escaped and re-parsed` : 'no </script or <!-- in the bundle'} · ${imports}`);
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(`[build-artifact] ${err.message}`);
  process.exit(1);
});
