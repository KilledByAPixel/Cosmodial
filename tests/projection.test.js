import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, cameraBasis, vec, focalPx } from '../js/core/projection.js';

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

test('points up to 150 deg from the aim still project; near-antipode is culled', () => {
  const cam = { az: 0, alt: 0, fov: 60, ...VIEW };
  const wide = project(100, 0, cam);  // 100 deg east of the aim: behind the camera but projectable
  assert.ok(wide.visible, '100 deg off-axis is visible (projectable)');
  assert.ok(Number.isFinite(wide.x) && wide.x > cx, 'east of aim -> right of center, finite');
  const far = project(160, 0, cam);   // 160 deg off-axis: inside the antipode cull zone
  assert.equal(far.visible, false);
  const behind = project(180, 0, cam); // exact antipode
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

test('a point fov/2 off-axis lands exactly at the screen edge of the SHORTER dimension', () => {
  // VIEW is 800x600 landscape: fov spans the 600px height, so 30° above the aim hits the top edge
  // (y=0) — and 30° east lands at x=700, inside the wider dimension, not at the 800px right edge.
  const up = project(0, 30, { az: 0, alt: 0, fov: 60, ...VIEW });
  assert.ok(up.visible && Math.abs(up.y - 0) < 1e-6 && Math.abs(up.x - cx) < 1e-6);
  const east = project(30, 0, { az: 0, alt: 0, fov: 60, ...VIEW });
  assert.ok(east.visible && Math.abs(east.x - 700) < 1e-6, 'horizontal: 30° lands 300px out, not at the 800px edge');
});

test('near the view center, stereographic matches the old gnomonic within 2%', () => {
  // Gnomonic reference computed inline: dx = f_g * tan(theta), f_g = (minDim/2)/tan(fov/2).
  // Use a narrow FOV (30°) so the two focal lengths are close — making this a valid invariant.
  // At fov=60° the focal lengths diverge ~7.5%; at fov=30° they diverge ~1.6% (within the 2% band).
  const fov = 30, theta = 5;
  const d2r = Math.PI / 180;
  const fg = 300 / Math.tan((fov / 2) * d2r);
  const gnomonicDx = fg * Math.tan(theta * d2r);
  const p = project(theta, 0, { az: 0, alt: 0, fov, ...VIEW });
  assert.ok(Math.abs((p.x - cx) - gnomonicDx) / gnomonicDx < 0.02);
});

test('project/inverse round-trip recovers the sky direction (mirrors the sky-background GLSL inverse)', () => {
  const cam = { az: 180, alt: 45, fov: 120, ...VIEW };
  const { right, up, fwd, focal, cx: bx, cy: by } = cameraBasis(cam);
  for (const [az, alt] of [[180, 45], [140, 10], [250, 70], [180, -20], [60, 30]]) {
    const p = project(az, alt, cam);
    assert.ok(p.visible, `${az},${alt} should be visible`);
    const dx = p.x - bx, dy = -(p.y - by); // flip to +y-up (GLSL convention)
    const r = Math.hypot(dx, dy);
    const theta = 2 * Math.atan(r / (2 * focal));
    const s = r > 1e-12 ? Math.sin(theta) / r : 0;
    const ray = [
      fwd[0] * Math.cos(theta) + (right[0] * dx + up[0] * dy) * s,
      fwd[1] * Math.cos(theta) + (right[1] * dx + up[1] * dy) * s,
      fwd[2] * Math.cos(theta) + (right[2] * dx + up[2] * dy) * s,
    ];
    const want = vec(az, alt);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(ray[k] - want[k]) < 1e-9, `ray[${k}] at ${az},${alt}`);
  }
});

test('focalPx is the px-per-radian at the view center and matches cameraBasis', () => {
  const f = focalPx(60, 800, 600);
  assert.ok(Math.abs(f - 300 / (2 * Math.tan(Math.PI / 12))) < 1e-9, 'scaled by the shorter dimension (600)');
  assert.ok(Math.abs(focalPx(60, 600, 800) - f) < 1e-9, 'orientation-independent: portrait matches landscape');
  assert.ok(Math.abs(cameraBasis({ az: 0, alt: 0, fov: 60, width: 800, height: 600 }).focal - f) < 1e-9);
  assert.ok(focalPx(235, 800, 600) > 0, 'stays positive past 180 deg fov (tan(fov/2) would go negative)');
});

test('camera basis is continuous through the old 89.5 threshold and exact at the pole', () => {
  const basisAt = (alt) => cameraBasis({ az: 120, alt, fov: 60, width: 800, height: 600 });
  const b1 = basisAt(89.4), b2 = basisAt(89.6);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(b1.right[k] - b2.right[k]) < 0.01, `right[${k}] continuous across 89.5`);
    assert.ok(Math.abs(b1.up[k] - b2.up[k]) < 0.01, `up[${k}] continuous across 89.5`);
  }
  const a = 120 * Math.PI / 180;
  const pole = basisAt(90);
  assert.ok(Math.abs(pole.right[0] - Math.cos(a)) < 1e-12 && Math.abs(pole.right[1] + Math.sin(a)) < 1e-12 && Math.abs(pole.right[2]) < 1e-12,
    'right = (cos az, -sin az, 0) at the zenith — heading preserved');
  assert.ok(Math.abs(pole.up[0] + Math.sin(a)) < 1e-12 && Math.abs(pole.up[1] + Math.cos(a)) < 1e-12 && Math.abs(pole.up[2]) < 1e-12,
    'up points toward azimuth az+180 at the zenith (the continuous limit)');
});
