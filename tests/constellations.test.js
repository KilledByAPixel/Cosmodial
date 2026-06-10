import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjector } from '../js/core/projection.js';
import { drawConstellations } from '../js/render/constellations.js';

function stubCtx() {
  const calls = { moveTo: 0, lineTo: 0, stroke: 0, fillText: 0, beginPath: 0, alphas: [] };
  return {
    calls,
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set globalAlpha(v) { calls.alphas.push(v); }, get globalAlpha() { return 1; },
    beginPath() { calls.beginPath++; }, moveTo() { calls.moveTo++; }, lineTo() { calls.lineTo++; },
    stroke() { calls.stroke++; }, fillText() { calls.fillText++; },
  };
}

test('drawConstellations draws visible line segments and labels without throwing', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const projector = createProjector(cam);
  const constellations = [
    { name: 'TestUp', label: { alt: 45, az: 180 },
      lines: [[{ alt: 50, az: 178 }, { alt: 50, az: 182 }, { alt: 40, az: 182 }]] },
    { name: 'TestBehind', label: { alt: 45, az: 0 },
      lines: [[{ alt: 45, az: 0 }, { alt: 40, az: 5 }]] },
  ];
  assert.doesNotThrow(() => drawConstellations(ctx, projector, constellations, cam));
  assert.ok(ctx.calls.lineTo >= 2, 'draws the visible polyline segments');
  assert.ok(ctx.calls.fillText >= 1, 'labels the visible constellation');
});

test('below-horizon vertices are skipped', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const projector = createProjector(cam);
  const constellations = [
    { name: 'Down', label: { alt: -10, az: 180 }, lines: [[{ alt: -5, az: 180 }, { alt: -10, az: 182 }]] },
  ];
  assert.doesNotThrow(() => drawConstellations(ctx, projector, constellations, cam));
  assert.equal(ctx.calls.lineTo, 0, 'no segments drawn for a below-horizon figure');
});

test('belowFade > 0 reveals below-horizon segments at the fade alpha', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: -20, fov: 60, width: 800, height: 600 };
  const projector = createProjector(cam);
  const constellations = [
    { name: 'Down', label: { alt: -10, az: 180 }, lines: [[{ alt: -5, az: 180 }, { alt: -10, az: 182 }]] },
  ];
  drawConstellations(ctx, projector, constellations, cam, false, true, 0.5);
  assert.ok(ctx.calls.lineTo >= 1, 'below-horizon segment drawn while fading in');
  assert.ok(ctx.calls.alphas.includes(0.5), 'drawn at the fade alpha');
});
