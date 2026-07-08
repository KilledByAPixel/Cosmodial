// Cosmodial production build → dist/
//
// Unlike a bundler, this mirrors the app into dist/ with the directory structure INTACT: each
// js/**/*.js is minified in place, so sw.js's PRECACHE paths (and tests/sw.test.js) stay valid.
// The big webp textures and JSON catalogues in data/ dominate the download, so they're copied
// verbatim — minifying the JS is the only transform worth doing.
//
// Steps: bump the service-worker cache version, run the test suite, verify PRECACHE is honest,
// then emit dist/. Upload dist/ to cosmodial.3d2k.com; that folder is the TWA's web content.

import {
  readFileSync, writeFileSync, existsSync, rmSync, mkdirSync,
  cpSync, statSync, readdirSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { minify } from 'terser';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const COPY_DIRS = ['css', 'data', 'images'];       // assets, copied verbatim
const COPY_FILES = ['index.html', 'manifest.webmanifest'];

function bumpCacheVersion() {
  const swPath = join(ROOT, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const m = sw.match(/const CACHE = 'cosmodial-v(\d+)';/);
  if (!m) {
    console.error("  ❌ Could not find `const CACHE = 'cosmodial-vN';` in sw.js");
    process.exit(1);
  }
  const from = Number(m[1]);
  const to = from + 1;
  writeFileSync(swPath, sw.replace(m[0], `const CACHE = 'cosmodial-v${to}';`));
  console.log(`🔼 Cache version: v${from} → v${to}\n`);
  return to;
}

function checkPrecache() {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!block) {
    console.error('  ❌ Could not parse PRECACHE list in sw.js');
    process.exit(1);
  }
  const paths = [...block[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const missing = paths.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length) {
    console.error('  ❌ PRECACHE lists files that are not on disk:\n     ' + missing.join('\n     '));
    process.exit(1);
  }
  console.log(`  ✓ PRECACHE honest (${paths.length} files exist on disk)`);
  return paths;
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

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

async function minifyFile(absSrc, relPath, { module }) {
  const src = readFileSync(absSrc, 'utf8');
  const { code } = await minify(src, { compress: { passes: 2 }, mangle: true, module });
  const dest = join(DIST, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);
  const before = (Buffer.byteLength(src) / 1024).toFixed(1);
  const after = (Buffer.byteLength(code) / 1024).toFixed(1);
  console.log(`  ✓ ${relPath} (${before} KB → ${after} KB)`);
}

function dirSize(dir) {
  return walk(dir).reduce((sum, f) => sum + statSync(f).size, 0);
}

(async () => {
  console.log('🔍 Pre-build checks...\n');
  const precache = checkPrecache();
  console.log('');
  bumpCacheVersion();
  runTests();

  if (existsSync(DIST)) rmSync(DIST, { recursive: true });
  mkdirSync(DIST);

  // Minify the ES-module tree, structure preserved.
  console.log('⚙️  Minifying JS...\n');
  for (const abs of walk(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))) {
    await minifyFile(abs, relative(ROOT, abs), { module: true });
  }
  // sw.js is a classic worker (no import/export) — minify without module semantics.
  await minifyFile(join(ROOT, 'sw.js'), 'sw.js', { module: false });

  // Copy assets + entry files verbatim.
  console.log('\n📦 Copying assets...\n');
  for (const d of COPY_DIRS) {
    cpSync(join(ROOT, d), join(DIST, d), { recursive: true });
    console.log(`  ✓ ${d}/ (${(dirSize(join(DIST, d)) / 1024).toFixed(1)} KB)`);
  }
  for (const f of COPY_FILES) {
    cpSync(join(ROOT, f), join(DIST, f));
    console.log(`  ✓ ${f}`);
  }

  // The `hip` (Hipparcos number) field is provenance only — read nowhere at runtime — so drop it
  // from the shipped catalogue (~1.1 MB raw). The committed data/stars.json keeps it; going forward
  // tools/build-stars.mjs no longer emits it, at which point this loop simply finds nothing to drop.
  {
    const starsPath = join(DIST, 'data', 'stars.json');
    const stars = JSON.parse(readFileSync(starsPath, 'utf8'));
    let dropped = 0;
    for (const s of stars) if ('hip' in s) { delete s.hip; dropped++; }
    writeFileSync(starsPath, JSON.stringify(stars));
    console.log(`  ✓ stars.json: stripped hip from ${dropped} records → ${(statSync(starsPath).size / 1024 / 1024).toFixed(2)} MB`);
  }

  // Post-build integrity: everything the SW promises to cache must be in dist/.
  const missing = precache.filter((p) => !existsSync(join(DIST, p)));
  if (missing.length) {
    console.error('\n❌ dist/ is missing PRECACHE files:\n   ' + missing.join('\n   '));
    process.exit(1);
  }

  console.log(`\n✅ Build complete → dist/ (${(dirSize(DIST) / 1024 / 1024).toFixed(2)} MB total)`);
})();
