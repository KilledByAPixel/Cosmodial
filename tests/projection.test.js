import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../js/core/projection.js';

const VIEW = { width: 800, height: 600 };
const cx = 400, cy = 300;

test('the aim point projects to the canvas center', () => {
  const cam = { az: 180, alt: 45, fov: 60, ...VIEW };
  const p = project(180, 45, cam);
  assert.ok(p.visible);
  assert.ok(Math.abs(p.x - cx) < 1e-6 && Math.abs(p.y - cy) < 1e-6);
});

test('facing north, an object slightly east is on the right; higher is up', () => {
  const cam = { az: 0, alt: 0, fov: 60, ...VIEW };
  const right = project(5, 0, cam);   // 5 deg east of center
  const high = project(0, 5, cam);    // 5 deg above center
  assert.ok(right.visible && right.x > cx, 'east -> right of center');
  assert.ok(high.visible && high.y < cy, 'higher altitude -> higher on screen (smaller y)');
});

test('objects more than 90 deg from the aim are culled', () => {
  const cam = { az: 0, alt: 0, fov: 60, ...VIEW };
  const behind = project(180, 0, cam); // due south while facing north
  assert.equal(behind.visible, false);
});

test('a wider FOV places the same angle closer to center', () => {
  const wide = project(5, 0, { az: 0, alt: 0, fov: 60, ...VIEW });
  const narrow = project(5, 0, { az: 0, alt: 0, fov: 30, ...VIEW });
  assert.ok(Math.abs(wide.x - cx) < Math.abs(narrow.x - cx));
});

test('looking straight up does not divide by zero', () => {
  const p = project(90, 85, { az: 0, alt: 90, fov: 60, ...VIEW });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('looking straight down does not divide by zero', () => {
  const p = project(90, -85, { az: 0, alt: -90, fov: 60, ...VIEW });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('roll defaults to 0: an unset roll matches roll:0 and the no-roll projection', () => {
  const base = project(0, 5, { az: 0, alt: 0, fov: 60, ...VIEW });
  const explicit = project(0, 5, { az: 0, alt: 0, fov: 60, roll: 0, ...VIEW });
  assert.ok(Math.abs(base.x - explicit.x) < 1e-9 && Math.abs(base.y - explicit.y) < 1e-9);
});

test('roll=90 rotates the view: an object above center moves to the right edge-ward', () => {
  const cam = { az: 0, alt: 0, fov: 60, ...VIEW };
  const up = project(0, 5, cam); // 5 deg above center, no roll
  assert.ok(up.y < cy && Math.abs(up.x - cx) < 1e-6, 'no roll: straight up');
  const rolled = project(0, 5, { ...cam, roll: 90 });
  assert.ok(rolled.x > cx && Math.abs(rolled.y - cy) < 1e-6, 'roll 90: that object is now to the right');
});
