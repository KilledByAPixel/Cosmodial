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

test('planetRadius: brighter planets are larger (down to the bright cap), monotonic and floored', () => {
  assert.ok(planetRadius(-4) > planetRadius(6), 'the brightest planets out-size the faint ones');
  const cap = planetRadius(-10); // saturated bright end — every brighter mag clamps here
  let prev = Infinity;
  for (const m of [-4.5, -2, 0, 2, 4, 6, 14]) {
    const r = planetRadius(m);
    assert.ok(r > 0 && r <= cap, `radius ${r} out of bounds for mag ${m}`);
    assert.ok(r <= prev, `radius not monotonic at mag ${m}`);
    prev = r;
  }
  assert.ok(planetRadius(14) > 0 && planetRadius(14) < planetRadius(0), 'faint planets are small but visible');
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
