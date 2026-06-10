import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, createProjector } from '../js/core/projection.js';

const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };

test('createProjector matches project() for the same camera', () => {
  const p = createProjector(cam);
  for (const [az, alt] of [[180, 45], [170, 40], [200, 50], [180, 80], [0, 10]]) {
    const a = p(az, alt);
    const b = project(az, alt, cam);
    assert.equal(a.visible, b.visible, `visible mismatch at ${az},${alt}`);
    if (a.visible) {
      assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `xy mismatch at ${az},${alt}`);
    }
  }
});

test('the returned projector is reusable across many points', () => {
  const p = createProjector(cam);
  const center = p(180, 45);
  assert.ok(Math.abs(center.x - 400) < 1e-6 && Math.abs(center.y - 300) < 1e-6);
  const behind = p(0, -45); // the exact antipode of the aim
  assert.equal(behind.visible, false);
  assert.ok(Number.isNaN(behind.x) && Number.isNaN(behind.y), 'culled points return NaN coords');
});
