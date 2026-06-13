import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, planetRadius, planetChipFade } from '../js/render/planets.js';

test('PLANETS lists Mercury..Neptune (naked-eye five + the two ice giants) with body, name, color', () => {
  const names = PLANETS.map((p) => p.name);
  for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
  for (const p of PLANETS) {
    assert.ok(p.body, `${p.name} needs a body`);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(p.color), `${p.name} needs a hex color`);
  }
});

test('planetRadius: brighter (lower mag) planets are larger, within bounds', () => {
  assert.ok(planetRadius(-4) > planetRadius(1), 'Venus bigger than a dim planet');
  for (const m of [-4.5, -2, 0, 2, 5]) {
    const r = planetRadius(m);
    assert.ok(r >= 2.5 && r <= 6, `radius ${r} out of bounds for mag ${m}`);
  }
});

test('planetChipFade: full chip at/below the resolve threshold, gone once the disc is +50% larger', () => {
  assert.equal(planetChipFade(10, 10), 1, 'full chip exactly at the resolve threshold');
  assert.equal(planetChipFade(8, 10), 1, 'full chip below the threshold (chip-only zone)');
  assert.equal(planetChipFade(15, 10), 0, 'gone once the disc is +50% (growth 0.5)');
  assert.equal(planetChipFade(40, 10), 0, 'stays gone when well past resolved');
  const mid = planetChipFade(12.5, 10); // halfway through the fade zone
  assert.ok(mid > 0 && mid < 1, `mid-zone fade ${mid} is partial`);
});

test('planetChipFade falls monotonically across the fade zone', () => {
  let prev = 1.0001;
  for (let p = 10; p <= 15.0001; p += 0.5) {
    const cf = planetChipFade(p, 10);
    assert.ok(cf <= prev + 1e-9, `fade at ${p} (${cf}) should not exceed the previous ${prev}`);
    prev = cf;
  }
});
