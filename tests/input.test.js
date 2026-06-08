import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragToAimDelta, wheelToFov, pinchToFov, toggleKeyAction } from '../js/ui/input.js';

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

test('wheel up zooms in (FOV shrinks); wheel down zooms out', () => {
  assert.ok(wheelToFov(60, -100) < 60, 'scroll up -> smaller FOV');
  assert.ok(wheelToFov(30, 100) > 30, 'scroll down -> larger FOV');
  assert.equal(wheelToFov(42, 0), 42, 'no scroll -> unchanged');
});

test('pinch: spreading fingers zooms in, pinching zooms out', () => {
  assert.ok(Math.abs(pinchToFov(60, 100, 200) - 30) < 1e-9, 'spread 2x -> half FOV');
  assert.ok(Math.abs(pinchToFov(60, 200, 100) - 120) < 1e-9, 'pinch 0.5x -> double FOV');
  assert.equal(pinchToFov(60, 100, 0), 60, 'degenerate distance -> unchanged');
});

test('toggleKeyAction maps c/l/g/e keys to flags (case-insensitive), ignores others', () => {
  assert.equal(toggleKeyAction('c'), 'lines');
  assert.equal(toggleKeyAction('C'), 'lines');
  assert.equal(toggleKeyAction('l'), 'labels');
  assert.equal(toggleKeyAction('g'), 'grid');
  assert.equal(toggleKeyAction('G'), 'grid');
  assert.equal(toggleKeyAction('e'), 'edit');
  assert.equal(toggleKeyAction('x'), null);
});
