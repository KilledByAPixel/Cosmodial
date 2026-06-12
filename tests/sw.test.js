import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const swText = await readFile(new URL('../sw.js', import.meta.url), 'utf8');


function extractPrecache(src) {
  const m = src.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js declares const PRECACHE = [...]');
  return [...m[1].matchAll(/'(\.\/[^']+)'/g)].map((x) => x[1]);
}

async function runtimeFilesOnDisk() {
  const files = ['./index.html', './manifest.webmanifest'];
  for (const dir of ['js', 'css', 'data']) {
    const entries = await readdir(new URL(`../${dir}`, import.meta.url), { recursive: true, withFileTypes: true });
    const base = fileURLToPath(new URL(`../${dir}`, import.meta.url)).replaceAll('\\', '/');
    for (const e of entries) {
      if (!e.isFile()) continue;
      const rel = `${e.parentPath ?? e.path}/${e.name}`.replaceAll('\\', '/');
      files.push(`./${dir}${rel.slice(base.length)}`);
    }
  }
  // Icons are runtime too (home-screen / install UI); logo.png and the social card are not.
  files.push('./images/icon-192.png', './images/icon-512.png', './images/icon-maskable-512.png', './images/apple-touch-icon.png');
  return files;
}

test('sw.js has a bumpable versioned cache name', () => {
  assert.match(swText, /const CACHE = 'cosmodial-v\d+';/, "cache name looks like 'cosmodial-vN'");
});

test('every runtime file on disk is precached (the hand-kept list cannot rot)', async () => {
  const listed = new Set(extractPrecache(swText));
  const missing = (await runtimeFilesOnDisk()).filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `add these to PRECACHE in sw.js: ${missing.join(', ')}`);
  const arr = extractPrecache(swText);
  assert.equal(new Set(arr).size, arr.length, 'PRECACHE has no duplicate entries (addAll would reject)');
});

test('every precached path exists on disk (no typos, nothing stale)', async () => {
  for (const p of extractPrecache(swText)) {
    const exists = await readFile(new URL(`../${p}`, import.meta.url)).then(() => true, () => false);
    assert.ok(exists, `PRECACHE entry not found on disk: ${p}`);
  }
});

test('precache requests bypass the HTTP cache so version bumps fetch real bytes', () => {
  assert.match(swText, /new Request\(url, \{ cache: 'reload' \}\)/);
});
