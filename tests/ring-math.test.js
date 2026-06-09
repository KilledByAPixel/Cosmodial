import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SATURN_RING, ringOpening, ringPointRadius } from '../js/render/ring-math.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('SATURN_RING spans a sane annulus in globe radii', () => {
  assert.ok(SATURN_RING.INNER > 1.0 && SATURN_RING.INNER < SATURN_RING.OUTER && SATURN_RING.OUTER < 3.0);
  assert.equal(typeof SATURN_RING.TEX, 'string');
});

test('ringOpening: pole toward the viewer opens the rings; orthogonal pole is edge-on', () => {
  const toSaturn = [0, 1, 0];
  assert.ok(near(ringOpening(toSaturn, [0, -1, 0]), 1), 'pole pointing back at Earth -> fully open (+1)');
  assert.ok(near(ringOpening(toSaturn, [0, 1, 0]), -1), 'pole pointing away -> fully open south face (-1)');
  assert.ok(near(ringOpening(toSaturn, [0, 0, 1]), 0), 'pole perpendicular -> edge-on (0)');
});

test('ringPointRadius: face-on tilt gives a circle', () => {
  assert.ok(near(ringPointRadius(0.6, 0.8, 37, 1), 1));     // any north angle: rr = hypot(x, y)
  assert.ok(near(ringPointRadius(2, 0, 123, -1), 2), 'south face-on too');
});

test('ringPointRadius: along the projected pole the ring is foreshortened by |tilt|', () => {
  // North angle 0 -> pole projects screen-up. A screen point (0, s) lies at ring radius s / |tilt|,
  // i.e. the ellipse semi-minor axis of radius R is R * |tilt| on screen.
  const tilt = 0.4, s = 0.5;
  assert.ok(near(ringPointRadius(0, s, 0, tilt), s / Math.abs(tilt), 1e-9));
  assert.ok(near(ringPointRadius(s, 0, 90, tilt), s / Math.abs(tilt), 1e-9), 'north angle 90 -> pole projects screen-right');
  assert.ok(near(ringPointRadius(0, -s, 0, -tilt), s / Math.abs(tilt), 1e-9), 'negative tilt: symmetric foreshortening on the opposite arm');
});

test('ringPointRadius: perpendicular to the pole the radius is unforeshortened', () => {
  assert.ok(near(ringPointRadius(0.7, 0, 0, 0.3), 0.7), 'x-axis when pole is up: major axis');
});

test('ringPointRadius: edge-on returns Infinity off the ring plane', () => {
  assert.equal(ringPointRadius(0.3, 0.4, 0, 0), Infinity);
});
