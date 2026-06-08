import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceStep, gridSpec, drawGrid } from '../js/render/grid.js';
import { createProjector } from '../js/core/projection.js';

test('niceStep snaps up to the next value on the ladder', () => {
  assert.equal(niceStep(15), 15);
  assert.equal(niceStep(12), 15);  // 12 -> next rung is 15
  assert.equal(niceStep(3), 5);    // 3  -> 5
  assert.equal(niceStep(0.2), 0.25); // very zoomed in
  assert.equal(niceStep(1000), 90); // clamps to the coarsest rung
});

test('gridSpec picks steps from FOV and only lists lines near the view', () => {
  const cam = { az: 180, alt: 45, fov: 60, width: 800, height: 600 };
  const spec = gridSpec(cam);
  // azimuth step from horizontal FOV (spoke target 8) widened by 1/cos(alt); altitude step from vertical FOV
  assert.equal(spec.azStep, niceStep(60 / (8 * Math.cos(Math.PI / 4))));
  assert.equal(spec.altStep, niceStep((60 * 600) / 800 / 4));
  // every listed line is a clean multiple of its step
  assert.ok(spec.azimuths.every((a) => Math.abs((a / spec.azStep) - Math.round(a / spec.azStep)) < 1e-9));
  assert.ok(spec.altitudes.every((h) => h > 0 && h < 90));
  // windowed: a subset of the lines, not the whole sphere (the full wheel here would be 360/azStep)
  assert.ok(spec.azimuths.length < Math.round(360 / spec.azStep), `azimuths windowed (${spec.azimuths.length})`);
  assert.ok(spec.altitudes.length <= 12, `altitudes windowed (${spec.altitudes.length})`);
  // the lines actually bracket the aim
  assert.ok(spec.azimuths.some((a) => Math.abs(((a - 180 + 540) % 360) - 180) <= spec.azStep));
});

test('looking up draws the full wheel but widens the step so spokes do not crowd the zenith', () => {
  const base = { fov: 30, width: 800, height: 600 };
  const overhead = gridSpec({ ...base, az: 180, alt: 88 });
  const horizon = gridSpec({ ...base, az: 180, alt: 5 });
  assert.ok(overhead.azStep > horizon.azStep, 'spoke spacing widens as you look up');
  // overhead shows the whole wheel, but the widened step keeps it to a handful of spokes
  assert.equal(overhead.azimuths.length, Math.round(360 / overhead.azStep), 'full wheel overhead');
  assert.ok(overhead.azimuths.length <= 8, `few spokes overhead (${overhead.azimuths.length})`);
});

test('the innermost ring caps the spokes when the zenith is in view', () => {
  const spec = gridSpec({ az: 180, alt: 89, fov: 60, width: 800, height: 600 });
  const top = Math.max(...spec.altitudes);
  assert.ok(top >= 90 - spec.altStep - 1e-9, 'a ring sits within one step of the pole to cap the spokes');
});

test('deep zoom uses a finer step and stays bounded', () => {
  const spec = gridSpec({ az: 10, alt: 30, fov: 2, width: 800, height: 600 });
  assert.ok(spec.azStep < 5, 'fine azimuth step when zoomed in');
  assert.ok(spec.azimuths.length <= 12 && spec.altitudes.length <= 12, 'still bounded when zoomed in');
});

test('drawGrid strokes lines and draws degree labels without throwing', () => {
  const calls = { stroke: 0, fillText: 0, texts: [] };
  const ctx = {
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { calls.stroke++; }, fillText(t) { calls.fillText++; calls.texts.push(t); },
  };
  const cam = { az: 180, alt: 30, fov: 60, width: 800, height: 600 };
  const projector = createProjector(cam);
  assert.doesNotThrow(() => drawGrid(ctx, projector, cam));
  assert.ok(calls.stroke >= 2, 'strokes altitude rings and azimuth lines');
  assert.ok(calls.texts.some((t) => /°$/.test(t)), 'labels carry a degree symbol');
});
