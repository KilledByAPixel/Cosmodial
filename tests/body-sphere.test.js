import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vertexShaderSource, fragmentShaderSource } from '../js/render/body-sphere.js';

// The body-sphere vertex shader embeds the same stereographic projection as the CPU projector and
// the star/marker shaders (see the matching drift guard in starfield-gl.test.js). If the formula
// or the cos(150°) cull constant drifts in any one site, taps stop landing on what's drawn.
test('body-sphere shader uses the stereographic projection and the shared antipode cull (drift guard)', () => {
  const src = vertexShaderSource();
  assert.ok(src.includes('2.0 * uFocal / (1.0 + z)'), 'stereographic forward formula');
  assert.ok(src.includes('-0.8660254'), 'cull at cos(150deg), matching MIN_VIS_Z');
  assert.ok(!src.includes('/ z'), 'gnomonic divide-by-z is gone');
});

// Below-horizon bodies must ride belowFade like the star/marker shaders — without uFade the
// Moon's sphere drew at full brightness under a hidden horizon.
test('body-sphere fragment shader applies the below-horizon fade to every output path', () => {
  const src = fragmentShaderSource();
  assert.ok(src.includes('uniform float uFade'), 'fade uniform declared');
  const fadedOutputs = (src.match(/\* uFade/g) || []).length;
  const outputs = (src.match(/fragColor = /g) || []).length;
  assert.equal(fadedOutputs, outputs, `every fragColor assignment is scaled by uFade (${fadedOutputs}/${outputs})`);
});
