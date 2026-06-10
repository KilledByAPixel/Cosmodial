import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dsoScreenRadius, dsoAlpha, dsoSymbol } from '../js/render/dso.js';

test('dsoScreenRadius scales with angular size and grows as FOV shrinks', () => {
  const wide = { width: 1000, height: 800, fov: 60 };
  const narrow = { width: 1000, height: 800, fov: 15 };
  assert.ok(dsoScreenRadius(60, wide) > dsoScreenRadius(20, wide), 'bigger object -> bigger radius');
  assert.ok(dsoScreenRadius(60, narrow) > dsoScreenRadius(60, wide), 'zoom in -> bigger');
});

test('dsoScreenRadius respects a minimum floor', () => {
  assert.ok(dsoScreenRadius(0.5, { width: 1000, height: 800, fov: 60 }) >= 2, 'tiny object floored');
});

test('dsoAlpha: compact bright reads brighter than large dim, clamped to [0,1]', () => {
  const compact = dsoAlpha(4, 10);
  const sprawled = dsoAlpha(4, 180);
  assert.ok(compact > sprawled, 'same mag over more area -> dimmer per pixel');
  for (const a of [compact, sprawled, dsoAlpha(12, 5), dsoAlpha(0, 5)]) {
    assert.ok(a >= 0 && a <= 1, `alpha in range: ${a}`);
  }
});

test('dsoAlpha uses the minor axis so elongated objects are not over-dimmed', () => {
  const asCircle = dsoAlpha(3.4, 178);        // Andromeda-like, treated as a big circle
  const asEllipse = dsoAlpha(3.4, 178, 70);   // with its real minor axis
  assert.ok(asEllipse > asCircle, 'a flatter ellipse is brighter per pixel than the same-major circle');
  assert.ok(asEllipse > 0, 'a bright large galaxy still shows some glow');
});

test('dsoSymbol maps each type to a shape', () => {
  assert.equal(dsoSymbol('galaxy'), 'ellipse');
  assert.equal(dsoSymbol('nebula'), 'box');
  assert.equal(dsoSymbol('open cluster'), 'dashed-circle');
  assert.equal(dsoSymbol('globular cluster'), 'cross-circle');
});
