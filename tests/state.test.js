import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, MIN_FOV, MAX_FOV, MAX_ALT } from '../js/core/state.js';

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

test('setAim wraps azimuth and clamps altitude (horizon lock without full-sphere)', () => {
  const s = createState();
  s.setAim(370, 100);
  assert.equal(s.getState().aim.az, 10);
  assert.equal(s.getState().aim.alt, MAX_ALT);
  s.setAim(-10, -200);
  assert.equal(s.getState().aim.az, 350);
  assert.equal(s.getState().aim.alt, 0, 'cannot aim below the horizon when full-sphere is off');
});

test('full-sphere unlocks aiming below the horizon, down to -MAX_ALT', () => {
  const s = createState();
  s.setFlag('sphere', true);
  s.setAim(0, -200);
  assert.equal(s.getState().aim.alt, -MAX_ALT);
});

test('turning full-sphere off snaps a below-horizon aim back up to 0', () => {
  const s = createState();
  s.setFlag('sphere', true);
  s.setAim(0, -45);
  assert.equal(s.getState().aim.alt, -45);
  s.setFlag('sphere', false);
  assert.equal(s.getState().aim.alt, 0, 'pitch is pulled back to the horizon when the lower sky is hidden');
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

test('subscribers receive the updated state object', () => {
  const s = createState();
  let received = null;
  s.subscribe((st) => { received = st; });
  s.setFov(20);
  assert.equal(received.fov, 20);
});

test('setFlag updates known flags and rejects unknown ones', () => {
  const s = createState();
  s.setFlag('night', true);
  assert.equal(s.getState().flags.night, true);
  s.setFlag('lines', false);
  assert.equal(s.getState().flags.lines, false);
  assert.throws(() => s.setFlag('nightMode', true), /Unknown flag/);
});

test('setTime sets the instant and live flag', () => {
  const s = createState();
  s.setTime(1234567890, false);
  assert.equal(s.getState().time.instant, 1234567890);
  assert.equal(s.getState().time.live, false);
  s.setTime(null, true);
  assert.equal(s.getState().time.live, true);
});

test('setLocation ignores non-finite coordinates', () => {
  const s = createState();
  s.setLocation(40, -100, 'Valid');
  s.setLocation(NaN, NaN, 'Bad');
  assert.equal(s.getState().location.label, 'Valid'); // unchanged by the bad call
});

test('altitude is clamped just below vertical to avoid the zenith singularity', () => {
  assert.equal(MAX_ALT, 89);
  const s = createState();
  s.setAim(0, 89.9);
  assert.ok(s.getState().aim.alt <= 89, 'cannot aim into the gimbal-lock zone');
});

test('setOrientation sets aim azimuth/altitude and roll together', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(123, 30, 45);
  assert.equal(s.getState().aim.az, 123);
  assert.equal(s.getState().aim.alt, 30);
  assert.equal(s.getState().roll, 45);
});

test('gyro mode unlocks aiming below the horizon (like full-sphere)', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(0, -40, 0);
  assert.equal(s.getState().aim.alt, -40, 'can aim below the horizon while gyro is on');
});

test('leaving gyro mode levels the roll and re-clamps a below-horizon aim', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(0, -40, 90);
  assert.equal(s.getState().roll, 90);
  s.setFlag('gyro', false);
  assert.equal(s.getState().roll, 0, 'roll levels on exit');
  assert.equal(s.getState().aim.alt, 0, 'below-horizon aim snaps back above the horizon');
});

test('roll defaults to 0 on a fresh state', () => {
  assert.equal(createState().getState().roll, 0);
});
