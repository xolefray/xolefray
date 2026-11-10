#!/usr/bin/env node
// Single-file build: dist/the-fox-and-the-paper-moon.html
//
//   npm run build            (= node tools/build.mjs [--out=FILE] [--no-minify])
//
// Bundles src/main.js plus the vendored three.js (the bare specifier `three` is
// aliased to vendor/three/three.module.js) into one minified ES module with
// esbuild, then takes the real index.html and transforms it: the import map is
// dropped, styles.css is inlined into a <style>, the bundle is inlined into a
// <script type="module">, and a charset, description and inline SVG favicon are
// ensured. The result makes no network requests at all: it plays from file://,
// as an e-mail attachment, or as one static file on any host.
//
// Exits non-zero on any bundling error or if index.html no longer has the shape
// this transform expects (so the two can never silently drift apart).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PROJECT_ROOT } from './serve.mjs';

const require = createRequire(import.meta.url);

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = path.resolve(typeof args.out === 'string' ? args.out : path.join(PROJECT_ROOT, 'dist', 'the-fox-and-the-paper-moon.html'));
const minify = !args['no-minify'];

const DESCRIPTION = 'The Fox and the Paper Moon: an 80-second pop-up-book film made of cut paper, ' +
  'played in the browser. A small fox carries a sliver of moonlight home.';
// A little paper moon: cream crescent on a teal round.
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="30" fill="#1f4a4f"/>' +
  '<path d="M40 12a21 21 0 1 0 0 40a17 17 0 1 1 0-40z" fill="#f3ead2"/></svg>';

function fail(msg) {
  console.error(`build: FAILED: ${msg}`);
  process.exit(1);
}

let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  fail('esbuild is not installed. Run `npm install` in popup-book-film/ first.');
}

// --- 1. bundle -------------------------------------------------------------
let bundle;
try {
  const result = await esbuild.build({
    entryPoints: [path.join(PROJECT_ROOT, 'src', 'main.js')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: ['es2022', 'chrome100', 'firefox100', 'safari15'],
    minify,
    alias: { three: path.join(PROJECT_ROOT, 'vendor', 'three', 'three.module.js') },
    legalComments: 'none',   // the three.js notice is added once, below
    charset: 'utf8',
    logLevel: 'silent',
  });
  if (result.warnings.length) {
    const msgs = await esbuild.formatMessages(result.warnings, { kind: 'warning' });
    console.warn(msgs.join('\n'));
  }
  bundle = result.outputFiles[0].text;
} catch (err) {
  if (err.errors) {
    const msgs = await esbuild.formatMessages(err.errors, { kind: 'error' });
    console.error(msgs.join('\n'));
  }
  fail(`bundling src/main.js failed${err.errors ? '' : `: ${err.message}`}`);
}

const threeLicense = fs.readFileSync(path.join(PROJECT_ROOT, 'vendor', 'three', 'LICENSE'), 'utf8').trim();
const threeRevision = (fs.readFileSync(path.join(PROJECT_ROOT, 'vendor', 'three', 'three.core.js'), 'utf8')
  .match(/const REVISION = '(\d+)'/) || [])[1] || '?';
const header = `/*!\n * The Fox and the Paper Moon - single-file build.\n *\n` +
  ` * Includes three.js r${threeRevision} (https://threejs.org), used under the MIT License:\n *\n` +
  threeLicense.split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n') + '\n */\n';

// Make the script text safe inside an inline <script>: the HTML tokenizer ends
// the element at `</script` and enters an "escaped" state at `<!--` (which can
// then swallow a later `</script>`). Replace `<` in those sequences with the
// JS escape \x3C. Minified output only contains them inside string/template
// literals or regexes, where `\x3C` means exactly `<`.
function scriptSafe(js) {
  return js.replace(/<(\/script|!--|script)/gi, '\\x3C$1');
}
const js = scriptSafe(header + bundle.trimEnd());
if (/<\/script|<!--/i.test(js)) fail('bundle still contains </script or <!-- after escaping');

const css = fs.readFileSync(path.join(PROJECT_ROOT, 'styles.css'), 'utf8')
  .replace(/<\/style/gi, '<\\/style').trim();

// --- 2. transform index.html ------------------------------------------------
let html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
const replaceOnce = (re, by, what) => {
  const n = (html.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
  if (n !== 1) fail(`index.html: expected exactly one ${what}, found ${n} (did index.html change shape?)`);
  html = html.replace(re, () => by);
};

replaceOnce(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\s*\n/i, '', 'import map');
replaceOnce(/<link rel="stylesheet" href="\.\/styles\.css">/i, `<style>\n${css}\n</style>`, 'styles.css <link>');
replaceOnce(/<script type="module" src="\.\/src\/main\.js"><\/script>/i,
  `<script type="module">\n${js}\n</script>`, 'main.js <script>');

if (!/<meta charset=/i.test(html)) html = html.replace(/<head>/i, '<head>\n  <meta charset="utf-8">');
if (/<meta name="description"[^>]*>/i.test(html)) {
  html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${DESCRIPTION}">`);
} else {
  html = html.replace(/<\/title>/i, `</title>\n  <meta name="description" content="${DESCRIPTION}">`);
}
if (!/rel="icon"/i.test(html)) {
  const href = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
  html = html.replace(/<\/title>/i, `</title>\n  <link rel="icon" href="${href}">`);
}
// Nothing in the output may point at another file.
const external = html.replace(/<script type="module">[\s\S]*?<\/script>/i, '')
  .match(/\s(?:src|href)="(?!data:|#)[^"]*"/gi);
if (external) fail(`output still references external files: ${external.join(', ')}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const bytes = fs.statSync(OUT).size;
console.log(`build: ${path.relative(process.cwd(), OUT) || OUT}  ${(bytes / 1024).toFixed(1)} KiB (${bytes} bytes)` +
  `${minify ? '' : ' (not minified)'}`);
