import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeToRadius, bvToRGB, zoomScale, colorBrightness } from '../js/render/starstyle.js';

test('brighter stars (smaller mag) are larger', () => {
  assert.ok(magnitudeToRadius(0) > magnitudeToRadius(5));
});

test('radius stays within sane bounds', () => {
  for (const m of [-1.5, 0, 3, 6, 7]) {
    const r = magnitudeToRadius(m);
    assert.ok(r >= 0.4 && r <= 4, `radius ${r} out of bounds for mag ${m}`);
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

test('zoomScale grows stars as FOV shrinks, capped at the max', () => {
  assert.ok(Math.abs(zoomScale(60) - 1) < 1e-9, 'baseline 1 at the widest FOV');
  assert.ok(zoomScale(15) > zoomScale(60), 'zooming in grows stars');
  assert.ok(zoomScale(15) > 1 && zoomScale(15) <= 4, 'within bounds');
  assert.equal(zoomScale(1), 4, 'capped at the max zoom scale');
});

test('colorBrightness: white stars are brightest, saturated stars a touch dimmer', () => {
  const white = colorBrightness({ r: 255, g: 255, b: 255 });
  const red = colorBrightness({ r: 255, g: 150, b: 100 });
  assert.ok(Math.abs(white - 0.9) < 1e-9, 'white (unsaturated) sits at the base brightness 0.9');
  assert.ok(red < white, 'a strongly-coloured star is dimmer than white');
  assert.ok(red >= 0.6 && red <= white, 'but still bright, not heavily dimmed');
});
