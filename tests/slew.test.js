import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slewFrame, animateSlew } from '../js/ui/slew.js';

test('slewFrame eases from->to and takes the shortest azimuth path', () => {
  const from = { az: 350, alt: 10, fov: 60 };
  const to = { az: 10, alt: 40, fov: 20 };
  const a = slewFrame(from, to, 0);
  assert.ok(Math.abs(a.az - 350) < 1e-6 && a.alt === 10 && a.fov === 60, 't=0 is the start');
  const b = slewFrame(from, to, 1);
  assert.ok(Math.abs(b.az - 10) < 1e-6 && Math.abs(b.alt - 40) < 1e-6 && Math.abs(b.fov - 20) < 1e-6, 't=1 is the target');
  const mid = slewFrame(from, to, 0.5);
  assert.ok(mid.az > 358 || mid.az < 2, `mid az ${mid.az} should pass through ~0, not ~180`);
});

test('animateSlew drives the store to the target then calls onDone', () => {
  const frames = [];
  const raf = (cb) => frames.push(cb);
  let clock = 1000;
  const now = () => clock;
  let aim = { az: 0, alt: 0 }, fov = 60, done = false;
  const store = { getState: () => ({ aim, fov }), setAim: (az, alt) => { aim = { az, alt }; }, setFov: (f) => { fov = f; } };
  animateSlew(store, { az: 90, alt: 45, fov: 20 }, { durationMs: 100, raf, now, onDone: () => { done = true; } });
  clock = 1000; frames.shift()();   // t=0
  clock = 1050; frames.shift()();   // t=0.5
  clock = 1100; frames.shift()();   // t=1 -> onDone
  assert.ok(done, 'onDone called at the end');
  assert.ok(Math.abs(aim.az - 90) < 1e-6 && Math.abs(aim.alt - 45) < 1e-6 && Math.abs(fov - 20) < 1e-6, 'reached target');
});
