import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawScene } from '../js/render/sky.js';

// Minimal Canvas 2D context stub: records draw calls, accepts the properties sky.js sets.
function stubCtx() {
  const calls = { arc: 0, fill: 0, fillRect: 0, fillText: 0, stroke: 0, moveTo: 0, lineTo: 0, beginPath: 0 };
  return {
    calls,
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set globalAlpha(_) {}, get globalAlpha() { return 1; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    fillRect() { calls.fillRect++; },
    beginPath() { calls.beginPath++; },
    arc() { calls.arc++; },
    fill() { calls.fill++; },
    moveTo() { calls.moveTo++; },
    lineTo() { calls.lineTo++; },
    stroke() { calls.stroke++; },
    fillText() { calls.fillText++; },
  };
}

test('drawScene renders stars/markers without throwing and draws them', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [
    { altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0 },   // in front -> drawn
    { altaz: { alt: 50, az: 178 }, mag: 3.5, bv: 1.4 },   // in front -> drawn
    { altaz: { alt: -10, az: 180 }, mag: 2.0, bv: -0.2 }, // below horizon -> skipped
    { altaz: { alt: 50, az: 0 }, mag: 2.0, bv: 0.5 },     // behind aim -> culled
  ];
  const markers = [{ altaz: { alt: 40, az: 180 }, label: 'Moon', color: '#e8e8e8' }];

  assert.doesNotThrow(() => drawScene(ctx, { stars, markers, cam }));
  assert.ok(ctx.calls.fillRect >= 1, 'should clear the background');
  assert.ok(ctx.calls.arc >= 2, 'should draw at least the two visible stars');
  assert.ok(ctx.calls.stroke >= 1, 'should draw the reticle');
});
