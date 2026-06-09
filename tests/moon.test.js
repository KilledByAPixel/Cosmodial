import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parallacticAngle, positionAngle, moonScreenAngles } from '../js/core/moon.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('parallacticAngle is 0 on the meridian', () => {
  assert.ok(near(parallacticAngle(0, 20, 40), 0), `q=${parallacticAngle(0, 20, 40)}`);
});

test('parallacticAngle flips sign east vs west of the meridian', () => {
  const west = parallacticAngle(30, 10, 45);  // HA +30 (west)
  const east = parallacticAngle(-30, 10, 45);
  assert.ok(west > 0 && east < 0, `west=${west} east=${east}`);
  assert.ok(near(west, -east, 1e-9), 'symmetric about the meridian');
});

test('positionAngle: due north is 0, due east is +90', () => {
  assert.ok(near(positionAngle(100, 10, 100, 30), 0), `north PA=${positionAngle(100, 10, 100, 30)}`);
  assert.ok(near(positionAngle(100, 10, 100.01, 10), 90, 0.01), `east PA=${positionAngle(100, 10, 100.01, 10)}`);
});

test('moonScreenAngles composes PA minus parallactic for limb and pole', () => {
  const args = {
    moonRaDeg: 100, moonDecDeg: 10,
    sunRaDeg: 100, sunDecDeg: 30,   // Sun due celestial-north of the Moon -> limb PA 0
    poleRaDeg: 100.01, poleDecDeg: 10, // pole due east -> pole PA +90
    haDeg: 0, latDeg: 40,            // on meridian -> q = 0
  };
  const { brightLimbAngle, northAngle } = moonScreenAngles(args);
  assert.ok(near(brightLimbAngle, 0, 1e-6), `limb=${brightLimbAngle}`);
  assert.ok(near(northAngle, 90, 0.01), `north=${northAngle}`);
});
