// Cosmodial production build → dist/
//
// The SOURCE tree stays directly runnable (index.html → js/main.js as ES modules, sw.js precaches
// every source file), so the repo still serves as-is — e.g. on GitHub Pages — with no build step.
//
// This build produces the BUNDLED artifact for cosmodial.3d2k.com: esbuild rolls the whole js/
// module graph (app + vendored libs) into one minified js/app.js, and the dist copies of index.html
// and sw.js are rewritten to reference that single bundle instead of the 55 source files. The big
// webp textures + JSON catalogues in data/ dominate the download and are copied verbatim.
//
// Steps: bump the service-worker cache version, run the test suite, then emit dist/.
// Upload the CONTENTS of dist/ to the site root over HTTPS.

import {
  readFileSync, writeFileSync, existsSync, rmSync, mkdirSync,
  cpSync, statSync, readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SW = join(ROOT, 'sw.js');

const COPY_DIRS = ['css', 'data', 'images'];       // assets, copied verbatim

function parsePrecache(swText) {
  const block = swText.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!block) {
    console.error('  ❌ Could not parse PRECACHE list in sw.js');
    process.exit(1);
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function bumpCacheVersion() {
  const sw = readFileSync(SW, 'utf8');
  const m = sw.match(/const CACHE = 'cosmodial-v(\d+)';/);
  if (!m) {
    console.error("  ❌ Could not find `const CACHE = 'cosmodial-vN';` in sw.js");
    process.exit(1);
  }
  const to = Number(m[1]) + 1;
  writeFileSync(SW, sw.replace(m[0], `const CACHE = 'cosmodial-v${to}';`));
  console.log(`🔼 Cache version: v${m[1]} → v${to}\n`);
}

function checkPrecache() {
  const paths = parsePrecache(readFileSync(SW, 'utf8'));
  const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length) {
    console.error('  ❌ PRECACHE lists files not on disk:\n     ' + missing.join('\n     '));
    process.exit(1);
  }
  console.log(`  ✓ PRECACHE honest (${paths.length} source files exist on disk)`);
}

function runTests() {
  console.log('🧪 Running tests...\n');
  try {
    execSync('node --test', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\n❌ Tests failed — fix before building.\n');
    process.exit(1);
  }
  console.log('');
}

function dirSize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, d) => {
    const p = join(dir, d.name);
    return sum + (d.isDirectory() ? dirSize(p) : statSync(p).size);
  }, 0);
}

const kb = (bytes) => (bytes / 1024).toFixed(1) + ' KB';

(async () => {
  console.log('🔍 Pre-build checks...\n');
  checkPrecache();
  console.log('');
  bumpCacheVersion();
  runTests();

  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  mkdirSync(DIST);

  // 1. Bundle the whole ES-module graph (app + vendored libs) into one minified file.
  console.log('⚙️  Bundling js/main.js → js/app.js ...\n');
  const appOut = join(DIST, 'js', 'app.js');
  await esbuild.build({
    entryPoints: [join(ROOT, 'js', 'main.js')],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'none',
    outfile: appOut,
  });
  console.log(`  ✓ js/app.js (${kb(statSync(appOut).size)})`);

  // 2. sw.js → dist: regenerate PRECACHE with the single bundle in place of the js/ files, minify.
  const sourcePrecache = parsePrecache(readFileSync(SW, 'utf8'));
  const distPrecache = [
    ...sourcePrecache.filter((p) => !p.startsWith('./js/')),
    './js/app.js',
  ];
  const swLiteral = 'const PRECACHE = [\n' + distPrecache.map((p) => `  '${p}',`).join('\n') + '\n];';
  const swRewritten = readFileSync(SW, 'utf8').replace(/const PRECACHE = \[[\s\S]*?\];/, swLiteral);
  const swMin = await esbuild.transform(swRewritten, { minify: true, loader: 'js' });
  writeFileSync(join(DIST, 'sw.js'), swMin.code);
  console.log(`  ✓ sw.js (PRECACHE: ${sourcePrecache.length} → ${distPrecache.length} entries, minified)`);

  // 3. index.html → dist: point the module script at the bundle.
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace('./js/main.js', './js/app.js');
  writeFileSync(join(DIST, 'index.html'), html);
  cpSync(join(ROOT, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'));
  cpSync(join(ROOT, 'privacy.html'), join(DIST, 'privacy.html'));
  console.log('  ✓ index.html (→ js/app.js) + manifest.webmanifest + privacy.html');

  // 4. Copy assets verbatim.
  console.log('\n📦 Copying assets...\n');
  for (const d of COPY_DIRS) {
    cpSync(join(ROOT, d), join(DIST, d), { recursive: true });
    console.log(`  ✓ ${d}/ (${kb(dirSize(join(DIST, d)))})`);
  }

  // 5. The `hip` (Hipparcos number) field is provenance only — read nowhere at runtime — so drop it
  // from the shipped catalogue (~1.1 MB raw). Source data/stars.json keeps it; tools/build-stars.mjs
  // no longer emits it going forward, at which point this simply finds nothing to drop.
  const starsPath = join(DIST, 'data', 'stars.json');
  const stars = JSON.parse(readFileSync(starsPath, 'utf8'));
  let dropped = 0;
  for (const s of stars) if ('hip' in s) { delete s.hip; dropped++; }
  writeFileSync(starsPath, JSON.stringify(stars));
  console.log(`  ✓ stars.json: stripped hip from ${dropped} records → ${(statSync(starsPath).size / 1024 / 1024).toFixed(2)} MB`);

  // 6. Integrity: everything the (dist) SW promises to cache must actually be in dist/.
  const missing = distPrecache.filter((p) => !existsSync(join(DIST, p)));
  if (missing.length) {
    console.error('\n❌ dist/ is missing PRECACHE files:\n   ' + missing.join('\n   '));
    process.exit(1);
  }

  console.log(`\n✅ Build complete → dist/ (${(dirSize(DIST) / 1024 / 1024).toFixed(2)} MB total)`);
})();
