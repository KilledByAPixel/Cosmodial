import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nudgedToward, screenAngleCWFromUp, bodyScreenOrientation } from '../js/core/moon.js';
import { vec } from '../js/core/projection.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('nudgedToward returns a unit vector leaning toward the target', () => {
  const from = vec(180, 30), to = vec(180, 60);
  const n = nudgedToward(from, to, 0.05);
  assert.ok(near(Math.hypot(n[0], n[1], n[2]), 1), 'unit length');
  assert.ok(d3(n, to) > d3(from, to), 'leans toward the target');
});

test('nudgedToward: same/antipodal direction returns a unit vector (degenerate, no crash)', () => {
  const v = vec(180, 30);
  const same = nudgedToward(v, v);                 // no preferred tangent
  const anti = nudgedToward(v, [-v[0], -v[1], -v[2]]);
  assert.ok(near(Math.hypot(...same), 1), 'same: unit length');
  assert.ok(near(Math.hypot(...anti), 1), 'antipodal: unit length');
});

test('screenAngleCWFromUp: up=0, right=+90, down=180 (y grows down)', () => {
  const o = { x: 100, y: 100 };
  assert.ok(near(screenAngleCWFromUp(o, { x: 100, y: 90 }), 0), 'up');       // smaller y = up
  assert.ok(near(screenAngleCWFromUp(o, { x: 110, y: 100 }), 90), 'right');
  assert.ok(near(Math.abs(screenAngleCWFromUp(o, { x: 100, y: 110 })), 180), 'down');
});

test('bodyScreenOrientation: bright limb points up/down as the Sun is higher/lower than the Moon', () => {
  const cam = { az: 180, alt: 30, fov: 60, width: 800, height: 600, roll: 0 };
  const moonDir = vec(180, 30), poleDir = vec(0, 40);
  const up = bodyScreenOrientation(cam, moonDir, vec(180, 55), poleDir);   // Sun above the Moon
  const down = bodyScreenOrientation(cam, moonDir, vec(180, 5), poleDir);  // Sun below the Moon
  assert.ok(Math.abs(up.brightLimbAngle) < 5, `Sun above -> limb points up (${up.brightLimbAngle})`);
  assert.ok(Math.abs(Math.abs(down.brightLimbAngle) - 180) < 5, `Sun below -> limb points down (${down.brightLimbAngle})`);
});
