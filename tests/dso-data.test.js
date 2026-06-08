import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const TYPES = new Set(['galaxy', 'nebula', 'open cluster', 'globular cluster']);

test('dso.json is a sane curated deep-sky catalog', async () => {
  const dsos = JSON.parse(await readFile(new URL('../data/dso.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(dsos), 'array');
  assert.ok(dsos.length >= 20 && dsos.length <= 50, `unexpected count ${dsos.length}`);
  for (const d of dsos) {
    assert.ok(typeof d.id === 'string' && d.id.length, `bad id ${d.id}`);
    assert.ok(typeof d.name === 'string' && d.name.length, `${d.id} needs a name`);
    assert.ok(Number.isFinite(d.ra) && d.ra >= 0 && d.ra < 360, `${d.id} bad ra ${d.ra}`);
    assert.ok(Number.isFinite(d.dec) && d.dec >= -90 && d.dec <= 90, `${d.id} bad dec ${d.dec}`);
    assert.ok(TYPES.has(d.type), `${d.id} bad type ${d.type}`);
    assert.ok(Number.isFinite(d.mag), `${d.id} bad mag`);
    assert.ok(Number.isFinite(d.sizeArcmin) && d.sizeArcmin > 0, `${d.id} bad sizeArcmin`);
    assert.ok(d.distLy === null || (Number.isFinite(d.distLy) && d.distLy > 0), `${d.id} bad distLy`);
    assert.ok(typeof d.blurb === 'string' && d.blurb.length, `${d.id} needs a blurb`);
    assert.ok(typeof d.seen === 'string' && d.seen.length, `${d.id} needs a 'seen' note`);
  }
  const names = new Set(dsos.map((d) => d.name));
  assert.ok([...names].some((n) => /Andromeda/.test(n)), 'Andromeda present');
  assert.ok([...names].some((n) => /Orion/.test(n)), 'Orion Nebula present');
});
