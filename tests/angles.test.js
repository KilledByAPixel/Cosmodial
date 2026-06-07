import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degToRad, radToDeg, wrap360, clamp, angularSep } from '../js/core/angles.js';

test('degToRad / radToDeg round-trip', () => {
  assert.ok(Math.abs(degToRad(180) - Math.PI) < 1e-12);
  assert.ok(Math.abs(radToDeg(Math.PI) - 180) < 1e-12);
});

test('wrap360 normalizes into [0, 360)', () => {
  assert.equal(wrap360(-90), 270);
  assert.equal(wrap360(450), 90);
  assert.equal(wrap360(0), 0);
  assert.equal(wrap360(360), 0);
});

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('angularSep is the shortest bearing distance', () => {
  assert.equal(angularSep(350, 10), 20);
  assert.equal(angularSep(10, 350), 20);
  assert.equal(angularSep(0, 180), 180);
});
