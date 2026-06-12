import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framingFov, driftOffset } from '../js/ui/screensaver.js';

test('framingFov frames each target type appropriately', () => {
  assert.ok(Math.abs(framingFov({ type: 'body', angularRadiusDeg: 0.26 }) - 4.16) < 0.01,
    'Moon-sized disc -> ~8x its diameter');
  assert.equal(framingFov({ type: 'body', angularRadiusDeg: 0.001 }), 0.1,
    'tiny disc clamps to the deep-zoom floor');
  assert.equal(framingFov({ type: 'body', angularRadiusDeg: 5 }), 8,
    'huge disc clamps to the ceiling');
  assert.equal(framingFov({ type: 'dso', sizeArcmin: 180 }), 9, 'big DSO -> 3x its size');
  assert.equal(framingFov({ type: 'dso', sizeArcmin: 10 }), 4, 'small DSO hits the 4-deg floor');
  assert.equal(framingFov({ type: 'dso' }), 4, 'missing size falls back to a modest field');
  assert.equal(framingFov({ type: 'star' }), 30, 'stars stay wide-field');
  assert.equal(framingFov({ type: 'comet' }), 5, 'comets get a medium field');
  const c = framingFov({ type: 'constellation' }, () => 0.5);
  assert.equal(c, 60, 'constellations frame at 50-70 deg via the rng');
});

test('driftOffset is a slow bounded wander scaled to the fov', () => {
  const fov = 30;
  const z = driftOffset(0, fov);
  assert.equal(z.az, 0, 'azimuth drift starts at zero');
  for (const t of [0, 5000, 20000, 47000]) {
    const d = driftOffset(t, fov);
    assert.ok(Math.abs(d.az) <= fov * 0.06 + 1e-9 && Math.abs(d.alt) <= fov * 0.06 + 1e-9,
      `drift at ${t}ms stays within 6% of the fov`);
  }
  const a = driftOffset(10000, fov), b = driftOffset(20000, fov);
  assert.ok(Math.abs(a.az - b.az) > 1e-3, 'the offset actually moves over time');
  assert.ok(Math.abs(a.alt - b.alt) > 1e-3, 'the alt offset moves too');
});
