import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, MIN_FOV, MAX_FOV } from '../js/core/state.js';

test('subscribers are notified on change and can unsubscribe', () => {
  const s = createState();
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.setAim(10, 20);
  assert.equal(calls, 1);
  off();
  s.setAim(30, 40);
  assert.equal(calls, 1, 'no notification after unsubscribe');
});

test('setAim wraps azimuth and clamps altitude', () => {
  const s = createState();
  s.setAim(370, 100);
  assert.equal(s.getState().aim.az, 10);
  assert.equal(s.getState().aim.alt, 90);
  s.setAim(-10, -200);
  assert.equal(s.getState().aim.az, 350);
  assert.equal(s.getState().aim.alt, -90);
});

test('setFov clamps to [MIN_FOV, MAX_FOV]', () => {
  const s = createState();
  s.setFov(1000);
  assert.equal(s.getState().fov, MAX_FOV);
  s.setFov(0.1);
  assert.equal(s.getState().fov, MIN_FOV);
});

test('setLocation updates state without requiring localStorage', () => {
  const s = createState();
  s.setLocation(30.27, -97.74, 'Austin, TX');
  const loc = s.getState().location;
  assert.equal(loc.lat, 30.27);
  assert.equal(loc.label, 'Austin, TX');
});
