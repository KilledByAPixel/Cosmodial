import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleToCamera } from '../js/ui/gyro.js';
import { deviceToCamera } from '../js/core/orientation.js';

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

// Regression for the landscape "aim up flips 180°" bug: on iOS the tilt-compensated compass heading
// must be used DIRECTLY as the azimuth, not substituted into the Euler alpha. These angles are the
// real device readings captured when the bug reproduced (landscape, ~45° up).
test('iOS: webkitCompassHeading is the azimuth directly (no landscape flip)', () => {
  const r = sampleToCamera({ alpha: 247, beta: 178, gamma: 30, compass: 200, screen: 90 });
  assert.ok(near(r.az, 200), `az ${r.az} should equal the compass heading 200, not a flipped value`);
  assert.ok(r.alt > 55 && r.alt < 65, `alt ${r.alt} should be ~60 from the device tilt`);
});

test('iOS: azimuth equals the compass in portrait too', () => {
  const r = sampleToCamera({ alpha: 333, beta: 150, gamma: -3, compass: 118, screen: 0 });
  assert.ok(near(r.az, 118), `az ${r.az} should equal compass 118`);
});

test('iOS: a compass heading is wrapped into [0,360)', () => {
  const r = sampleToCamera({ alpha: 0, beta: 90, gamma: 0, compass: 365, screen: 0 });
  assert.ok(near(r.az, 5), `az ${r.az} should wrap 365 -> 5`);
});

test('Android (no compass): azimuth comes from the north-referenced matrix', () => {
  const r = sampleToCamera({ alpha: 90, beta: 90, gamma: 0, screen: 0 }); // no compass field
  const expected = deviceToCamera({ alpha: 90, beta: 90, gamma: 0, screen: 0 });
  assert.ok(near(r.az, expected.az), `az ${r.az} should match the matrix az ${expected.az}`);
  assert.ok(near(r.alt, expected.alt), 'alt should match the matrix alt');
});

test('alt and roll do not depend on the azimuth source', () => {
  const withCompass = sampleToCamera({ alpha: 333, beta: 150, gamma: -3, compass: 118, screen: 0 });
  const without = sampleToCamera({ alpha: 333, beta: 150, gamma: -3, screen: 0 });
  assert.ok(near(withCompass.alt, without.alt), 'alt identical regardless of the compass override');
  assert.ok(near(withCompass.roll, without.roll), 'roll identical regardless of the compass override');
});
