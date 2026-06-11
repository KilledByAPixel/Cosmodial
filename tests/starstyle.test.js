import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starSize, bvToRGB, zoomScale, colorBrightness, faintMagLimit } from '../js/render/starstyle.js';

test('brighter stars (smaller mag) are larger', () => {
  assert.ok(starSize(0, 1).radius > starSize(5, 1).radius);
});

test('starSize stays within sane bounds', () => {
  for (const m of [-1.5, 0, 3, 6, 7]) {
    const { radius, alpha } = starSize(m, 1);
    assert.ok(radius >= 0.5 && radius <= 5, `radius ${radius} out of bounds for mag ${m}`);
    assert.ok(alpha > 0 && alpha <= 1, `alpha ${alpha} out of bounds for mag ${m}`);
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

test('starSize: faint stars are clamped small and dimmed via alpha', () => {
  const bright = starSize(-1, 1);
  const mid = starSize(2, 1);
  const faint = starSize(7, 1);
  assert.ok(bright.radius > mid.radius, 'brighter -> bigger');
  assert.equal(bright.alpha, 1, 'bright stars at full magnitude-alpha');
  assert.ok(faint.radius <= mid.radius, 'faint stars are small');
  assert.ok(faint.alpha < 0.5, 'faint stars fade via alpha');
  assert.ok(faint.radius > 0, 'but never zero-size');
});

test('faintMagLimit is the exact inverse of the starSize alpha fade', () => {
  for (const zoom of [1, 2, 4]) {
    const lim = faintMagLimit(zoom);
    // At the limit the drawn alpha equals the cull floor; just past it, below.
    assert.ok(Math.abs(starSize(lim, zoom).alpha - 0.05) < 1e-9, `alpha at the limit is CULL_ALPHA (zoom ${zoom})`);
    assert.ok(starSize(lim + 0.1, zoom).alpha < 0.05, `fainter than the limit -> culled (zoom ${zoom})`);
    assert.ok(starSize(lim - 0.1, zoom).alpha > 0.05, `brighter than the limit -> drawn (zoom ${zoom})`);
  }
});

test('faintMagLimit: zooming in admits fainter stars; a stricter floor admits fewer', () => {
  assert.ok(faintMagLimit(4) > faintMagLimit(1), 'deep zoom keeps fainter stars');
  assert.ok(faintMagLimit(1) > 8, 'at base zoom the limit sits past naked-eye depth');
  assert.ok(faintMagLimit(1, 0.2) < faintMagLimit(1, 0.05), 'higher alpha floor culls more');
});

test('starSize: radius is capped, and zooming reveals faint stars', () => {
  assert.ok(starSize(-5, 1).radius <= 5, 'capped at base zoom');
  const z1 = starSize(3, 1);
  const z4 = starSize(3, 4);
  assert.ok(z4.radius > z1.radius || z4.alpha > z1.alpha, 'zoom magnifies/brightens a faint star');
});
