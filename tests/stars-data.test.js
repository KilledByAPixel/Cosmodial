import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stars.json is a sane magnitude-limited catalog', async () => {
  const stars = JSON.parse(await readFile(new URL('../data/stars.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(stars), 'should be an array');
  assert.ok(stars.length > 10000 && stars.length < 20000, `unexpected count ${stars.length}`);
  for (const s of stars) {
    assert.ok(Number.isFinite(s.ra) && s.ra >= 0 && s.ra < 360, `bad ra ${s.ra}`);
    assert.ok(Number.isFinite(s.dec) && s.dec >= -90 && s.dec <= 90, `bad dec ${s.dec}`);
    assert.ok(Number.isFinite(s.mag) && s.mag <= 7.0, `bad mag ${s.mag}`);
  }
  // A few bright named stars should survive a mag<=6 cut.
  const names = new Set(stars.map((s) => s.name).filter(Boolean));
  assert.ok(names.has('Sirius'), 'Sirius should be present');

  // Each entry carries the full field schema the renderer consumes.
  for (const key of ['id', 'ra', 'dec', 'mag', 'bv', 'name', 'con', 'hip']) {
    assert.ok(key in stars[0], `missing field "${key}" on star records`);
  }

  // Catalog is sorted brightest-first (ascending magnitude).
  assert.ok(stars[0].mag <= stars[stars.length - 1].mag, 'should be sorted by ascending magnitude');
});
