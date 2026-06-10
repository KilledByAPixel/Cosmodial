import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelToFov, pinchToFov, toggleKeyAction, dragAimEnabled, dampedGrabAz } from '../js/ui/input.js';

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

test('toggleKeyAction maps c/l/g/a/e keys to flags (case-insensitive), ignores others', () => {
  assert.equal(toggleKeyAction('c'), 'lines');
  assert.equal(toggleKeyAction('C'), 'lines');
  assert.equal(toggleKeyAction('l'), 'labels');
  assert.equal(toggleKeyAction('g'), 'grid');
  assert.equal(toggleKeyAction('G'), 'grid');
  assert.equal(toggleKeyAction('a'), 'atmo');
  assert.equal(toggleKeyAction('A'), 'atmo');
  assert.equal(toggleKeyAction('s'), null, 'full-sphere key retired');
  assert.equal(toggleKeyAction('e'), 'edit');
  assert.equal(toggleKeyAction('x'), null);
});

test('dragAimEnabled: drag steers the aim only when gyro mode is off', () => {
  assert.equal(dragAimEnabled({ gyro: false }), true);
  assert.equal(dragAimEnabled({ gyro: true }), false);
});

test('dampedGrabAz: full effect away from the pole, scaled inside the zone, frozen at the pole', () => {
  assert.equal(dampedGrabAz(100, 130, 0), 130, 'grab at the horizon: exact solve passes through');
  assert.equal(dampedGrabAz(100, 130, 70), 130, 'zone edge (20 deg from the pole): still exact');
  assert.ok(Math.abs(dampedGrabAz(100, 130, 88) - 103) < 1e-9, '2 deg from the pole: 10% of the delta');
  assert.equal(dampedGrabAz(100, 130, 90), 100, 'grabbed the pole itself: az frozen');
  assert.ok(Math.abs(dampedGrabAz(100, 130, -88) - 103) < 1e-9, 'nadir damps the same as the zenith');
});

test('dampedGrabAz wraps across north and takes the short way around', () => {
  assert.ok(Math.abs(dampedGrabAz(350, 10, 0) - 10) < 1e-9, 'full effect: +20 the short way, wrapped');
  assert.ok(Math.abs(dampedGrabAz(350, 10, 88) - 352) < 1e-9, 'damped: 10% of the +20 delta');
});
