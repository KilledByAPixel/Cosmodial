import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawScene } from '../js/render/sky.js';

// Minimal Canvas 2D context stub: records draw calls, accepts the properties sky.js sets.
function stubCtx() {
  const calls = { arc: 0, fill: 0, fillRect: 0, fillText: 0, stroke: 0, moveTo: 0, lineTo: 0, beginPath: 0, texts: [] };
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
    fillText(text) { calls.fillText++; calls.texts.push(text); },
  };
}

test('drawScene renders stars/markers without throwing and draws them', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [
    { altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0, name: 'Sirius' },   // bright + named -> drawn + labeled
    { altaz: { alt: 50, az: 178 }, mag: 3.5, bv: 1.4, name: 'DimStar' },  // named but too dim -> drawn, NOT labeled
    { altaz: { alt: -10, az: 180 }, mag: 2.0, bv: -0.2 }, // below horizon -> skipped
    { altaz: { alt: 50, az: 0 }, mag: 2.0, bv: 0.5 },     // opposite azimuth -> projects off-screen
  ];
  const markers = [{ altaz: { alt: 40, az: 180 }, label: 'Moon', color: '#e8e8e8' }];

  assert.doesNotThrow(() => drawScene(ctx, { stars, markers, cam }));
  assert.ok(ctx.calls.fillRect >= 1, 'should clear the background');
  assert.ok(ctx.calls.arc >= 3, 'should draw the two visible stars plus the marker');
  assert.ok(ctx.calls.texts.includes('Sirius'), 'should label the bright named star');
  assert.ok(ctx.calls.texts.includes('Moon'), 'should label the Moon marker');
  assert.ok(!ctx.calls.texts.includes('DimStar'), 'should NOT label named stars dimmer than the threshold');
});

test('drawScene with labels:false suppresses all text', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [{ altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0, name: 'Sirius' }];
  const markers = [{ altaz: { alt: 40, az: 180 }, label: 'Moon', color: '#e8e8e8' }];
  drawScene(ctx, { stars, markers, cam, labels: false });
  assert.equal(ctx.calls.texts.length, 0, 'no labels drawn when labels:false');
  assert.ok(ctx.calls.arc >= 2, 'but stars/markers are still drawn');
});

test('sphere:true reveals objects below the horizon; default hides them', () => {
  const cam = { az: 180, alt: -20, fov: 60, width: 800, height: 600 }; // aimed below the horizon
  const stars = [{ altaz: { alt: -10, az: 180 }, mag: 1.0, bv: 0.0, name: 'UnderStar' }];
  const markers = [{ altaz: { alt: -10, az: 181 }, label: 'Mars', color: '#d66' }];

  const top = stubCtx();
  drawScene(top, { stars, markers, cam });
  assert.equal(top.calls.arc, 0, 'below-horizon star + planet hidden by default');

  const full = stubCtx();
  drawScene(full, { stars, markers, cam, sphere: true });
  assert.ok(full.calls.arc >= 2, 'below-horizon star + planet drawn in full-sphere mode');
});
