import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawScene, drawStarLabels } from '../js/render/sky.js';
import { createProjector } from '../js/core/projection.js';

// Minimal Canvas 2D context stub: records draw calls, accepts the properties sky.js sets.
function stubCtx() {
  const calls = { arc: 0, fill: 0, fillRect: 0, clearRect: 0, fillText: 0, stroke: 0, moveTo: 0, lineTo: 0, beginPath: 0, texts: [], alphas: [] };
  return {
    calls,
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set globalAlpha(v) { calls.alphas.push(v); }, get globalAlpha() { return 1; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set lineJoin(_) {}, get lineJoin() { return 'miter'; },
    set lineCap(_) {}, get lineCap() { return 'butt'; },
    set font(_) {}, get font() { return ''; },
    fillRect() { calls.fillRect++; },
    clearRect() { calls.clearRect++; },
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

test('belowFade reveals objects below the horizon; 0 (default) hides them', () => {
  const cam = { az: 180, alt: -20, fov: 60, width: 800, height: 600 }; // aimed below the horizon
  const stars = [{ altaz: { alt: -10, az: 180 }, mag: 1.0, bv: 0.0, name: 'UnderStar' }];
  const markers = [{ altaz: { alt: -10, az: 181 }, label: 'Mars', color: '#d66' }];

  const top = stubCtx();
  drawScene(top, { stars, markers, cam });
  assert.equal(top.calls.arc, 0, 'below-horizon star + planet hidden at fade 0');

  const full = stubCtx();
  drawScene(full, { stars, markers, cam, belowFade: 1 });
  assert.ok(full.calls.arc >= 2, 'below-horizon star + planet drawn at fade 1');

  const half = stubCtx();
  drawScene(half, { stars, markers, cam, belowFade: 0.5 });
  assert.ok(half.calls.arc >= 2, 'partially faded-in objects are drawn');
  assert.ok(half.calls.alphas.some((a) => a > 0 && a <= 0.5), 'below-horizon alpha is scaled by the fade');
});

test('faint stars past the cull limit are skipped wide out, drawn at deep zoom', () => {
  // Both stars hug the aim so they stay on-screen even at the telescopic FOV.
  const stars = [
    { id: 1, altaz: { alt: 45.2, az: 180 }, mag: 1.0, bv: 0.0 },
    { id: 2, altaz: { alt: 44.8, az: 180 }, mag: 9.4, bv: 0.5 }, // past the zoom-1 cull (~8.3)
  ];
  const wide = stubCtx();
  drawScene(wide, { stars, markers: [], cam: { az: 180, alt: 45, fov: 60, width: 800, height: 600 } });
  assert.equal(wide.calls.arc, 1, 'only the bright star draws at the widest FOV');

  const deep = stubCtx();
  drawScene(deep, { stars, markers: [], cam: { az: 180, alt: 45, fov: 2, width: 800, height: 600 } });
  assert.equal(deep.calls.arc, 2, 'deep zoom raises the limit and reveals the faint star');
});

test('a selected faint star draws even past the cull limit', () => {
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [
    { id: 1, altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0 },
    { id: 2, altaz: { alt: 50, az: 181 }, mag: 9.4, bv: 0.5 },
    { id: 3, altaz: { alt: 50, az: 182 }, mag: 9.5, bv: 0.5 },
  ];
  const sel = stubCtx();
  drawScene(sel, { stars, markers: [], cam, selectedStarId: 3 });
  assert.equal(sel.calls.arc, 2, 'the bright star plus the selected faint star (not the other faint one)');

  const none = stubCtx();
  drawScene(none, { stars, markers: [], cam, selectedStarId: null });
  assert.equal(none.calls.arc, 1, 'no selection: only the bright star');
});

test('drawStarPoints:false (WebGL mode) skips star discs + labels, clears transparent', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [{ altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0, name: 'Sirius' }];
  const markers = [{ altaz: { alt: 40, az: 180 }, label: 'Moon', color: '#e8e8e8' }];
  drawScene(ctx, { stars, markers, cam, drawStarPoints: false });
  assert.equal(ctx.calls.clearRect, 1, 'GL mode clears transparent (clearRect)');
  assert.equal(ctx.calls.fillRect, 0, 'GL mode paints no opaque background (would hide GL stars)');
  assert.equal(ctx.calls.arc, 1, 'star disc not drawn here; only the marker');
  assert.ok(!ctx.calls.texts.includes('Sirius'), 'drawScene draws no star labels in GL mode');
  assert.ok(ctx.calls.texts.includes('Moon'), 'marker label still drawn');
});

test('drawMarkerDiscs:false (WebGL mode) skips marker discs but keeps their labels', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [];
  const markers = [{ altaz: { alt: 40, az: 180 }, label: 'Moon', color: '#e8e8e8' }];
  drawScene(ctx, { stars, markers, cam, drawStarPoints: false, drawMarkerDiscs: false });
  assert.equal(ctx.calls.arc, 0, 'marker disc not drawn here (GL draws it)');
  assert.ok(ctx.calls.texts.includes('Moon'), 'marker label still drawn on the 2D overlay');
});

test('drawStarLabels labels the brightest named stars only', () => {
  const ctx = stubCtx();
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const stars = [
    { altaz: { alt: 50, az: 180 }, mag: 1.0, bv: 0.0, name: 'Sirius' },   // bright + named -> labeled
    { altaz: { alt: 50, az: 178 }, mag: 3.5, bv: 1.4, name: 'DimStar' },  // too dim -> not labeled
    { altaz: { alt: -10, az: 180 }, mag: 0.5, bv: 0.0, name: 'UnderStar' }, // below horizon -> hidden
  ];
  drawStarLabels(ctx, stars, createProjector(cam), cam, true, 0);
  assert.equal(ctx.calls.arc, 0, 'labels only, no discs');
  assert.ok(ctx.calls.texts.includes('Sirius'));
  assert.ok(!ctx.calls.texts.includes('DimStar'), 'dimmer than threshold -> not labeled');
  assert.ok(!ctx.calls.texts.includes('UnderStar'), 'below horizon hidden when belowFade=0');
});

test('drawStarLabels honors belowFade and labels:false', () => {
  const cam = { az: 180, alt: -20, fov: 60, width: 800, height: 600 };
  const stars = [{ altaz: { alt: -10, az: 180 }, mag: 1.0, bv: 0.0, name: 'UnderStar' }];

  const below = stubCtx();
  drawStarLabels(below, stars, createProjector(cam), cam, true, 1);
  assert.ok(below.calls.texts.includes('UnderStar'), 'belowFade=1 reveals below-horizon labels');

  const off = stubCtx();
  drawStarLabels(off, stars, createProjector(cam), cam, false, 1);
  assert.equal(off.calls.texts.length, 0, 'labels:false draws nothing');

  const dim = stubCtx();
  drawStarLabels(dim, stars, createProjector(cam), cam, true, 0.4);
  assert.ok(dim.calls.alphas.includes(0.4), 'below-horizon labels draw at the fade alpha');
});
