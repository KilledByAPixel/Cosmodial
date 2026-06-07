import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragToAimDelta } from '../js/ui/input.js';

test('grab-the-sky: dragging right moves the sky right (azimuth decreases)', () => {
  const { dAz, dAlt } = dragToAimDelta(10, 0, 60, 600); // 60deg FOV over 600px -> 0.1 deg/px
  assert.ok(Math.abs(dAz - (-1)) < 1e-9, `dAz ${dAz} should be -1`);
  assert.equal(dAlt, 0);
});

test('grab-the-sky: dragging down tilts the view up (altitude increases)', () => {
  const { dAz, dAlt } = dragToAimDelta(0, 10, 60, 600);
  assert.equal(dAz, 0);
  assert.ok(Math.abs(dAlt - 1) < 1e-9, `dAlt ${dAlt} should be +1`);
});

test('delta scales with FOV (zoomed in = finer control)', () => {
  const wide = dragToAimDelta(10, 0, 60, 600);
  const narrow = dragToAimDelta(10, 0, 6, 600);
  assert.ok(Math.abs(narrow.dAz) < Math.abs(wide.dAz), 'smaller FOV -> smaller angular delta per pixel');
});
