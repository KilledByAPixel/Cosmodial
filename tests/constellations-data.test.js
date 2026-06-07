import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('constellations.json is a sane set of RA/Dec polylines', async () => {
  const cons = JSON.parse(await readFile(new URL('../data/constellations.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(cons), 'should be an array');
  assert.ok(cons.length >= 30 && cons.length <= 100, `unexpected constellation count ${cons.length}`);
  const names = new Set();
  for (const c of cons) {
    assert.ok(typeof c.name === 'string' && c.name.length > 0, 'each has a name');
    names.add(c.name);
    assert.ok(Array.isArray(c.label) && c.label.length === 2, `${c.name} needs a [ra,dec] label`);
    assert.ok(c.label[0] >= 0 && c.label[0] < 360 && c.label[1] >= -90 && c.label[1] <= 90, `${c.name} label out of range`);
    assert.ok(Array.isArray(c.lines) && c.lines.length > 0, `${c.name} needs lines`);
    for (const poly of c.lines) {
      assert.ok(Array.isArray(poly) && poly.length >= 2, `${c.name} polyline needs >=2 points`);
      for (const [ra, dec] of poly) {
        assert.ok(ra >= 0 && ra < 360 && dec >= -90 && dec <= 90, `${c.name} vertex out of range: ${ra},${dec}`);
      }
    }
  }
  assert.ok(names.has('Orion'), 'Orion should be present');
  assert.ok(names.has('Ursa Major'), 'Ursa Major should be present');
});
