import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStarAttributes, buildMarkerAttributes, hexToRgb01, vertexShaderSource } from '../js/render/starfield-gl.js';
import { cameraBasis, project, vec, dot } from '../js/core/projection.js';
import { bvToRGB, colorBrightness, STAR_CONSTS } from '../js/render/starstyle.js';
import { degToRad } from '../js/core/angles.js';

test('buildStarAttributes encodes dir/color/mag/alphaScale per star', () => {
  const sky = [
    { altaz: { az: 90, alt: 0 }, mag: 1.0, bv: 0.0, name: 'A' },
    { altaz: { az: 0, alt: 90 }, mag: 5.0, bv: 1.5, name: null },
  ];
  const { data, count } = buildStarAttributes(sky);
  assert.equal(count, 2);
  assert.equal(data.length, 2 * 8);

  // star 0: az=90, alt=0 -> dir = [cos0*sin90, cos0*cos90, sin0] = [1, 0, 0]
  assert.ok(Math.abs(data[0] - 1) < 1e-6);
  assert.ok(Math.abs(data[1] - 0) < 1e-6);
  assert.ok(Math.abs(data[2] - 0) < 1e-6);
  // dir is a unit vector and matches vec(az, alt)
  const v0 = vec(90, 0);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(data[k] - v0[k]) < 1e-9, 'dir matches vec()');
  assert.ok(Math.abs(Math.hypot(data[0], data[1], data[2]) - 1) < 1e-9, 'dir is unit length');
  // color = bvToRGB / 255
  const c0 = bvToRGB(0.0);
  assert.ok(Math.abs(data[3] - c0.r / 255) < 1e-6);
  assert.ok(Math.abs(data[4] - c0.g / 255) < 1e-6);
  assert.ok(Math.abs(data[5] - c0.b / 255) < 1e-6);
  // mag passes through; alphaScale = colorBrightness(color)
  assert.equal(data[6], 1.0);
  assert.ok(Math.abs(data[7] - colorBrightness(c0)) < 1e-6);

  // star 1: alt=90 -> dir.z === sin(90) === 1 (used for the below-horizon cull)
  assert.ok(Math.abs(data[8 + 2] - Math.sin(degToRad(90))) < 1e-9);
});

test('buildStarAttributes produces no NaN for null/NaN bv', () => {
  const { data } = buildStarAttributes([
    { altaz: { az: 10, alt: 20 }, mag: 3, bv: null },
    { altaz: { az: 50, alt: 5 }, mag: 4, bv: NaN },
  ]);
  for (const v of data) assert.ok(Number.isFinite(v), 'attribute data has no NaN/Inf');
});

test('cameraBasis is orthonormal with the expected focal length', () => {
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const { right, up, fwd, focal } = cameraBasis(cam);
  for (const v of [right, up, fwd]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, 'unit length');
  assert.ok(Math.abs(dot(right, up)) < 1e-9);
  assert.ok(Math.abs(dot(right, fwd)) < 1e-9);
  assert.ok(Math.abs(dot(up, fwd)) < 1e-9);
  assert.ok(Math.abs(focal - 400 / Math.tan(degToRad(30))) < 1e-6, 'focal = (w/2)/tan(fov/2)');
});

test('the shader projection algebra reproduces project() (GPU/CPU parity)', () => {
  const cam = { az: 30, alt: 10, fov: 50, width: 1024, height: 768 };
  const { right, up, fwd, focal, cx, cy } = cameraBasis(cam);
  const az = 33, alt = 12;
  // P is exactly the dir attribute the GPU receives.
  const { data } = buildStarAttributes([{ altaz: { az, alt }, mag: 1, bv: 0 }]);
  const P = [data[0], data[1], data[2]];
  const z = dot(P, fwd);
  const gpuX = cx + focal * dot(P, right) / z;   // shader maps +y up; screen y is cy - sy
  const gpuY = cy - focal * dot(P, up) / z;
  const cpu = project(az, alt, cam);
  // Sub-pixel tolerance: GLSL groups `focal*dot/z` left-to-right as `(focal*dot)/z` while
  // projectPoint groups it `focal*(dot/z)`, so they differ only by float reassociation (~1e-6 px).
  // A real algebra bug would be off by whole pixels.
  assert.ok(Math.abs(gpuX - cpu.x) < 1e-3, 'x parity');
  assert.ok(Math.abs(gpuY - cpu.y) < 1e-3, 'y parity');
});

test('hexToRgb01 parses #rrggbb and #rgb, and is safe on bad input', () => {
  assert.deepEqual(hexToRgb01('#ffffff'), [1, 1, 1]);
  assert.deepEqual(hexToRgb01('#000000'), [0, 0, 0]);
  const mars = hexToRgb01('#ff6a4d');
  assert.ok(Math.abs(mars[0] - 1) < 1e-9 && Math.abs(mars[1] - 0x6a / 255) < 1e-9 && Math.abs(mars[2] - 0x4d / 255) < 1e-9);
  assert.deepEqual(hexToRgb01('#fff'), [1, 1, 1]); // 3-digit shorthand
  assert.deepEqual(hexToRgb01('not a color'), [1, 1, 1]); // fallback to white
  assert.deepEqual(hexToRgb01(null), [1, 1, 1]);
});

test('buildMarkerAttributes encodes dir/color/radius/alpha per marker', () => {
  const markers = [
    { az: 90, alt: 0, color: '#ff6a4d', radiusPx: 6, alpha: 0.8 }, // Mars-like
    { az: 0, alt: 90, color: '#e8e8e8', radiusPx: 12, alpha: 1.0 }, // Moon-like at zenith
  ];
  const { data, count } = buildMarkerAttributes(markers);
  assert.equal(count, 2);
  assert.equal(data.length, 2 * 8);
  // marker 0: dir matches vec(90,0) = [1,0,0]
  const v0 = vec(90, 0);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(data[k] - v0[k]) < 1e-9);
  // colour = hexToRgb01 (stored as float32, so compare with a float32-sized tolerance)
  const c0 = hexToRgb01('#ff6a4d');
  assert.ok(Math.abs(data[3] - c0[0]) < 1e-6 && Math.abs(data[4] - c0[1]) < 1e-6 && Math.abs(data[5] - c0[2]) < 1e-6);
  assert.ok(Math.abs(data[6] - 6) < 1e-6);    // radiusPx
  assert.ok(Math.abs(data[7] - 0.8) < 1e-6);  // alpha
  // marker 1: dir.z === sin(90) === 1 (horizon cull uses this)
  assert.ok(Math.abs(data[8 + 2] - 1) < 1e-6);
  assert.ok(Math.abs(data[8 + 6] - 12) < 1e-6);
});

test('vertex shader embeds the starstyle size constants (drift guard)', () => {
  const src = vertexShaderSource();
  for (const key of ['STAR_BASE_R', 'STAR_MAG_SHRINK', 'STAR_MAX_R', 'STAR_MIN_R', 'STAR_DIM_EXP']) {
    const v = STAR_CONSTS[key];
    const lit = Number.isInteger(v) ? v.toFixed(1) : String(v);
    assert.ok(src.includes(lit), `shader should embed ${key} = ${lit}`);
  }
});
