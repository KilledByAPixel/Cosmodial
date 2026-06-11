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

// The atmosphere is in FRONT of a body, so its scattered light (skyVeil in atmosphere.js) adds
// over the disc's covered fraction — the daytime Moon's shadow shows sky-blue, not black.
test('body-sphere fragment shader adds the atmosphere veil over every output path', () => {
  const src = fragmentShaderSource();
  assert.ok(src.includes('uniform vec3 uVeil'), 'veil uniform declared');
  const veiledOutputs = (src.match(/uVeil \* /g) || []).length;
  const outputs = (src.match(/fragColor = /g) || []).length;
  assert.equal(veiledOutputs, outputs, `every output path adds the veil (${veiledOutputs}/${outputs})`);
});

// Lunar-eclipse shading: Earth's shadow darkens/reddens the disc per-pixel. The uniform packs the
// umbra centre in disc coordinates (xy), the umbra radius (z) and penumbra radius (w), with w <= 0
// meaning "no eclipse" so every non-eclipse frame skips the math.
test('body-sphere fragment shader carries the lunar-eclipse shadow uniform, gated on the penumbra', () => {
  const src = fragmentShaderSource();
  assert.ok(src.includes('uniform vec4 uLunarShadow'), 'shadow uniform declared');
  assert.ok(src.includes('uLunarShadow.w > 0.0'), 'shading skipped when the penumbra radius is <= 0');
});
