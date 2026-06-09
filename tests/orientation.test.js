import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceToCamera } from '../js/core/orientation.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('flat on the table (screen up) aims straight down', () => {
  const { alt, roll } = deviceToCamera({ alpha: 0, beta: 0, gamma: 0, screen: 0 });
  assert.ok(near(alt, -90, 1e-4), `alt ${alt} should be ~-90`);
  assert.ok(near(roll, 0, 1e-4), `roll ${roll} ~0 at the nadir`);
});

test('held vertical, alpha 0 -> facing north at the horizon, level', () => {
  const { az, alt, roll } = deviceToCamera({ alpha: 0, beta: 90, gamma: 0, screen: 0 });
  assert.ok(near(az, 0, 1e-4), `az ${az} ~0`);
  assert.ok(near(alt, 0, 1e-4), `alt ${alt} ~0`);
  assert.ok(near(roll, 0, 1e-4), `roll ${roll} ~0`);
});

test('held vertical, alpha 270 -> facing east', () => {
  const { az, alt } = deviceToCamera({ alpha: 270, beta: 90, gamma: 0, screen: 0 });
  assert.ok(near(az, 90, 1e-4), `az ${az} ~90 (east)`);
  assert.ok(near(alt, 0, 1e-4), `alt ${alt} ~0`);
});

test('tilted back past vertical aims upward', () => {
  const { az, alt } = deviceToCamera({ alpha: 0, beta: 135, gamma: 0, screen: 0 });
  assert.ok(near(az, 0, 1e-4), `az ${az} ~0`);
  assert.ok(near(alt, 45, 1e-4), `alt ${alt} ~45 (looking up)`);
});

test('screen orientation rotates roll but never the aim', () => {
  const { az, alt, roll } = deviceToCamera({ alpha: 0, beta: 90, gamma: 0, screen: 90 });
  assert.ok(near(az, 0, 1e-4), `az ${az} unchanged ~0`);
  assert.ok(near(alt, 0, 1e-4), `alt ${alt} unchanged ~0`);
  assert.ok(near(roll, -90, 1e-4), `roll ${roll} ~-90 (screen turned 90)`);
});

test('alpha 90, beta 90, gamma 90 -> faces south, level; az/roll stay normalized', () => {
  const { az, alt, roll } = deviceToCamera({ alpha: 90, beta: 90, gamma: 90, screen: 0 });
  assert.ok(near(az, 180, 1e-4), `az ${az} ~180 (south)`);
  assert.ok(near(alt, 0, 1e-4), `alt ${alt} ~0`);
  assert.ok(near(roll, 0, 1e-4), `roll ${roll} ~0`);
  assert.ok(az >= 0 && az < 360, `az ${az} normalized to [0,360)`);
  assert.ok(roll >= -180 && roll < 180, `roll ${roll} normalized to [-180,180)`);
});

test('at vertical, gamma rotates about the long (vertical) axis -> yaw to west, level', () => {
  const { az, alt, roll } = deviceToCamera({ alpha: 0, beta: 90, gamma: 90, screen: 0 });
  assert.ok(near(az, 270, 1e-4), `az ${az} ~270 (west)`);
  assert.ok(near(alt, 0, 1e-4), `alt ${alt} ~0`);
  assert.ok(near(roll, 0, 1e-4), `roll ${roll} ~0`);
});

test('tilted to face the zenith aims straight up', () => {
  const { alt } = deviceToCamera({ alpha: 0, beta: 180, gamma: 0, screen: 0 });
  assert.ok(near(alt, 90, 1e-4), `alt ${alt} should be ~90`);
});
