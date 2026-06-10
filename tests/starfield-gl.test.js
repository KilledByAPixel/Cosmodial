import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkerAttributes, hexToRgb01, vertexShaderSource, markerVertexShaderSource } from '../js/render/starfield-gl.js';
import { cameraBasis, vec, dot } from '../js/core/projection.js';
import { STAR_CONSTS } from '../js/render/starstyle.js';
import { EXT_K } from '../js/render/atmosphere.js';
import { degToRad } from '../js/core/angles.js';

test('cameraBasis is orthonormal with the expected focal length', () => {
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const { right, up, fwd, focal } = cameraBasis(cam);
  for (const v of [right, up, fwd]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, 'unit length');
  assert.ok(Math.abs(dot(right, up)) < 1e-9);
  assert.ok(Math.abs(dot(right, fwd)) < 1e-9);
  assert.ok(Math.abs(dot(up, fwd)) < 1e-9);
  assert.ok(Math.abs(focal - 400 / (2 * Math.tan(degToRad(15)))) < 1e-6, 'focal = (w/2)/(2*tan(fov/4))');
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

test('vertex shader embeds the extinction coefficients (drift guard)', () => {
  const src = vertexShaderSource();
  for (const key of ['r', 'g', 'b']) {
    const lit = String(EXT_K[key]);
    assert.ok(src.includes(lit), `shader should embed EXT_K.${key} = ${lit}`);
  }
});

test('shaders use the continuous below-horizon fade + extinction switch (not the old boolean)', () => {
  const star = vertexShaderSource();
  assert.ok(star.includes('uBelowFade'), 'star shader fades below-horizon stars');
  assert.ok(star.includes('uExtinction'), 'star shader can switch extinction off (space view)');
  assert.ok(!star.includes('uShowBelow'), 'old boolean uniform is gone from the star shader');
  const marker = markerVertexShaderSource();
  assert.ok(marker.includes('uBelowFade'), 'marker shader fades below-horizon markers');
  assert.ok(!marker.includes('uShowBelow'), 'old boolean uniform is gone from the marker shader');
});
