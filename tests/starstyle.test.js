import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeToRadius, magnitudeToOpacity, bvToRGB } from '../js/render/starstyle.js';

test('brighter stars (smaller mag) are larger and more opaque', () => {
  assert.ok(magnitudeToRadius(0) > magnitudeToRadius(5));
  assert.ok(magnitudeToOpacity(0) > magnitudeToOpacity(5));
});

test('radius and opacity stay within sane bounds', () => {
  for (const m of [-1.5, 0, 3, 6]) {
    const r = magnitudeToRadius(m);
    const o = magnitudeToOpacity(m);
    assert.ok(r >= 0.4 && r <= 4, `radius ${r} out of bounds for mag ${m}`);
    assert.ok(o > 0 && o <= 1, `opacity ${o} out of bounds for mag ${m}`);
  }
});

test('B-V color index maps to believable tints', () => {
  const blue = bvToRGB(-0.3); // hot star
  const red = bvToRGB(1.6);   // cool star
  assert.ok(blue.b >= blue.r, 'negative B-V should be blue-ish (b >= r)');
  assert.ok(red.r > red.b, 'high B-V should be red-ish (r > b)');
});

test('missing B-V does not crash', () => {
  const c = bvToRGB(null);
  assert.ok(Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b));
});
