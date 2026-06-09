import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleToCamera } from '../js/ui/gyro.js';
import { deviceToCamera } from '../js/core/orientation.js';

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

// iOS reports webkitCompassHeading in the device's NATIVE (portrait) frame, so in landscape it trails
// the true aim heading by the screen-orientation angle. Regression for the real reports:
//   - landscape (screen 90), aiming WEST (270): raw compass read 180 (south) -> must correct to 270.
//   - landscape (screen 90), aiming SOUTH (180): raw compass read 90 (east) -> must correct to 180.
test('iOS landscape: the compass heading is corrected by the screen angle', () => {
  const west = sampleToCamera({ alpha: 0, beta: 0, gamma: 0, compass: 180, screen: 90 });
  assert.ok(near(west.az, 270), `az ${west.az} should be 270 (west), not the raw compass 180`);
  const south = sampleToCamera({ alpha: 0, beta: 0, gamma: 0, compass: 90, screen: 90 });
  assert.ok(near(south.az, 180), `az ${south.az} should be 180 (south), not the raw compass 90`);
});

test('iOS portrait: the compass heading is the azimuth unchanged (screen 0)', () => {
  const r = sampleToCamera({ alpha: 333, beta: 150, gamma: -3, compass: 118, screen: 0 });
  assert.ok(near(r.az, 118), `az ${r.az} should equal compass 118 in portrait`);
});

test('iOS: the screen-corrected compass wraps into [0,360)', () => {
  const r = sampleToCamera({ alpha: 0, beta: 90, gamma: 0, compass: 300, screen: 90 });
  assert.ok(near(r.az, 30), `az ${r.az} should wrap 300+90 -> 30`);
});

test('iOS: tilt does not flip the azimuth in landscape (aim up stays put)', () => {
  // Same heading (compass 200, screen 90 -> az 290) whether level or tilted ~45° up; alt follows tilt.
  const level = sampleToCamera({ alpha: 79, beta: -1, gamma: -88, compass: 200, screen: 90 });
  const up = sampleToCamera({ alpha: 247, beta: 178, gamma: 30, compass: 200, screen: 90 });
  assert.ok(near(level.az, 290) && near(up.az, 290), `az should stay 290 (level ${level.az}, up ${up.az})`);
  assert.ok(up.alt > 55 && up.alt < 65, `alt ${up.alt} should be ~60 when aimed up`);
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
