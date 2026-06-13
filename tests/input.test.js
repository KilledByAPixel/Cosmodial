import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelToFov, pinchToFov, toggleKeyAction, timeLapseKeyAction, dragAimEnabled, dampedGrabAz, aimApproach, ghostPointerIds } from '../js/ui/input.js';

test('aimApproach eases toward the target: shortest-path azimuth, frame-rate independent', () => {
  // dt == tau -> factor 1 - 1/e ~= 0.632; az 350 -> 10 goes the short way THROUGH north
  const a = aimApproach({ az: 350, alt: 10 }, { az: 10, alt: 20 }, 0.05, 0.05);
  assert.ok(Math.abs(a.az - 2.64) < 0.05, `az crossed north: ${a.az}`);
  assert.ok(Math.abs(a.alt - 16.32) < 0.05, `alt eased: ${a.alt}`);
  // two half-steps land exactly where one full step does (exponential composition)
  const half = aimApproach(aimApproach({ az: 100, alt: 30 }, { az: 140, alt: 50 }, 0.025, 0.05),
    { az: 140, alt: 50 }, 0.025, 0.05);
  const full = aimApproach({ az: 100, alt: 30 }, { az: 140, alt: 50 }, 0.05, 0.05);
  assert.ok(Math.abs(half.az - full.az) < 1e-9 && Math.abs(half.alt - full.alt) < 1e-9, 'rate-independent');
  // converges: many steps land on the target
  let cur = { az: 0, alt: 0 };
  for (let i = 0; i < 60; i++) cur = aimApproach(cur, { az: 90, alt: 45 }, 0.016, 0.05);
  assert.ok(Math.abs(cur.az - 90) < 0.01 && Math.abs(cur.alt - 45) < 0.01, 'converges to the target');
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

test('toggleKeyAction maps c/l/g/a/e keys to flags (case-insensitive), ignores others', () => {
  assert.equal(toggleKeyAction('c'), 'lines');
  assert.equal(toggleKeyAction('C'), 'lines');
  assert.equal(toggleKeyAction('l'), 'labels');
  assert.equal(toggleKeyAction('g'), 'grid');
  assert.equal(toggleKeyAction('G'), 'grid');
  assert.equal(toggleKeyAction('q'), 'eqgrid');
  assert.equal(toggleKeyAction('Q'), 'eqgrid');
  assert.equal(toggleKeyAction('a'), 'atmo');
  assert.equal(toggleKeyAction('A'), 'atmo');
  assert.equal(toggleKeyAction('s'), null, 'full-sphere key retired');
  assert.equal(toggleKeyAction('e'), 'edit');
  assert.equal(toggleKeyAction('n'), 'night');
  assert.equal(toggleKeyAction('N'), 'night');
  assert.equal(toggleKeyAction('d'), 'deepsky');
  assert.equal(toggleKeyAction('D'), 'deepsky');
  assert.equal(toggleKeyAction('x'), null);
});

test('timeLapseKeyAction: t toggles, Escape stops, +/- (and their twins) change speed', () => {
  assert.equal(timeLapseKeyAction('t'), 'toggle');
  assert.equal(timeLapseKeyAction('T'), 'toggle');
  assert.equal(timeLapseKeyAction('Escape'), 'stop', 'Escape exits the lapse');
  assert.equal(timeLapseKeyAction('+'), 'faster');
  assert.equal(timeLapseKeyAction('='), 'faster', 'unshifted plus key');
  assert.equal(timeLapseKeyAction('-'), 'slower');
  assert.equal(timeLapseKeyAction('_'), 'slower', 'shifted minus key');
  assert.equal(timeLapseKeyAction('x'), null);
});

test('ghostPointerIds: a primary pointerdown evicts stale same-type pointers only', () => {
  const tracked = new Map([[7, { x: 1, y: 2, type: 'touch' }]]); // ghost: its pointerup was lost
  // A new primary touch proves no other touch exists -> the ghost is stale.
  assert.deepEqual(ghostPointerIds(tracked, { isPrimary: true, pointerType: 'touch' }), [7]);
  // A second real finger is NOT primary -> nothing evicted (normal pinch start).
  assert.deepEqual(ghostPointerIds(tracked, { isPrimary: false, pointerType: 'touch' }), []);
  // A primary pointer of another type says nothing about touches.
  assert.deepEqual(ghostPointerIds(tracked, { isPrimary: true, pointerType: 'mouse' }), []);
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
