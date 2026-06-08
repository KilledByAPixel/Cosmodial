import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, planetRadius } from '../js/render/planets.js';

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
