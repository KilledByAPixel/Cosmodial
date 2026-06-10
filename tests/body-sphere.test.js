import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vertexShaderSource } from '../js/render/body-sphere.js';

// The body-sphere vertex shader embeds the same stereographic projection as the CPU projector and
// the star/marker shaders (see the matching drift guard in starfield-gl.test.js). If the formula
// or the cos(150°) cull constant drifts in any one site, taps stop landing on what's drawn.
test('body-sphere shader uses the stereographic projection and the shared antipode cull (drift guard)', () => {
  const src = vertexShaderSource();
  assert.ok(src.includes('2.0 * uFocal / (1.0 + z)'), 'stereographic forward formula');
  assert.ok(src.includes('-0.8660254'), 'cull at cos(150deg), matching MIN_VIS_Z');
  assert.ok(!src.includes('/ z'), 'gnomonic divide-by-z is gone');
});
