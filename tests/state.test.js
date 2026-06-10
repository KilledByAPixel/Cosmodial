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

test('setAim wraps azimuth and clamps altitude to ±MAX_ALT (below-horizon aiming always allowed)', () => {
  const s = createState();
  s.setAim(370, 100);
  assert.equal(s.getState().aim.az, 10);
  assert.equal(s.getState().aim.alt, MAX_ALT);
  s.setAim(-10, -200);
  assert.equal(s.getState().aim.az, 350);
  assert.equal(s.getState().aim.alt, -MAX_ALT, 'can aim below the horizon');
});

test('the sphere flag is gone (below-horizon visibility is aim-driven now)', () => {
  const s = createState();
  assert.throws(() => s.setFlag('sphere', true), /Unknown flag/);
});

test('atmo flag defaults ON and toggles', () => {
  const s = createState();
  assert.equal(s.getState().flags.atmo, true, 'atmosphere on by default');
  s.setFlag('atmo', false);
  assert.equal(s.getState().flags.atmo, false, 'space view');
});

test('setFov clamps to [MIN_FOV, MAX_FOV]', () => {
  assert.equal(MAX_FOV, 200); // hemisphere + margin at max zoom-out — full horizon circle fits when looking up
  const s = createState();
  s.setFov(1000);
  assert.equal(s.getState().fov, MAX_FOV);
  s.setFov(MIN_FOV / 2); // below the floor clamps up to it
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
  s.setFlag('eqgrid', true);
  assert.equal(s.getState().flags.eqgrid, true, 'equatorial grid is a known (and persisted) view flag');
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

test('altitude is clamped at the zenith (cameraBasis handles the pole)', () => {
  assert.equal(MAX_ALT, 90); // pole-safe basis: the camera may aim all the way to the zenith/nadir
  const s = createState();
  s.setAim(0, 91);
  assert.equal(s.getState().aim.alt, MAX_ALT, 'aim reaches but never exceeds straight up');
});

test('setOrientation sets aim azimuth/altitude and roll together', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(123, 30, 45);
  assert.equal(s.getState().aim.az, 123);
  assert.equal(s.getState().aim.alt, 30);
  assert.equal(s.getState().roll, 45);
});

test('gyro mode allows aiming below the horizon', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(0, -40, 0);
  assert.equal(s.getState().aim.alt, -40, 'can aim below the horizon while gyro is on');
});

test('leaving gyro mode levels the roll and keeps the aim', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(0, -40, 90);
  assert.equal(s.getState().roll, 90);
  s.setFlag('gyro', false);
  assert.equal(s.getState().roll, 0, 'roll levels on exit');
  assert.equal(s.getState().aim.alt, -40, 'aim stays where the device left it');
});

test('roll defaults to 0 on a fresh state', () => {
  assert.equal(createState().getState().roll, 0);
});

test('setOrientation is a no-op when gyro mode is off', () => {
  const s = createState();
  const before = s.getState();
  s.setOrientation(99, -50, 30);
  assert.equal(s.getState().aim.az, before.aim.az, 'aim az unchanged');
  assert.equal(s.getState().aim.alt, before.aim.alt, 'aim alt unchanged');
  assert.equal(s.getState().roll, 0, 'roll unchanged');
});

test('setOrientation ignores a non-finite sensor reading', () => {
  const s = createState();
  s.setFlag('gyro', true);
  s.setOrientation(120, 35, 10);        // a good reading
  s.setOrientation(NaN, NaN, NaN);      // a bad reading must be ignored, not corrupt the aim
  assert.equal(s.getState().aim.az, 120, 'az unchanged by the bad reading');
  assert.equal(s.getState().aim.alt, 35, 'alt unchanged by the bad reading');
  assert.equal(s.getState().roll, 10, 'roll unchanged by the bad reading');
});
