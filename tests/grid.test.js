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

// alt=30 keeps the zenith (60° off the aim) clear of the view. At alt=45 it sits 45° off — inside
// the 48.1° corner reach — so every spoke's closest approach qualifies and the full wheel is drawn.
test('gridSpec picks steps from FOV and only lists lines near the view', () => {
  const cam = { az: 180, alt: 30, fov: 60, width: 800, height: 600 };
  const spec = gridSpec(cam);
  // azimuth step from horizontal FOV (spoke target 8) widened by 1/cos(alt); altitude step from vertical FOV
  assert.equal(spec.azStep, niceStep(60 / (8 * Math.cos(Math.PI / 6))));
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

// Regression: windowing must never cut a line that still touches the canvas. The old half-diagonal
// normalized by WIDTH while `fov` spans the SHORTER side, so on a landscape window it under-reported
// the corner by ~18° and left blank margins where spokes/rings should have run to the screen edge.
test('no gridline that touches the canvas is culled (landscape windows especially)', () => {
  const cams = [
    { az: 180, alt: 0, fov: 60, width: 1600, height: 900 },   // wide desktop, looking level
    { az: 42, alt: 15, fov: 45, width: 1920, height: 1080 },
    { az: 300, alt: 35, fov: 90, width: 1440, height: 900 },
    { az: 0, alt: 5, fov: 30, width: 900, height: 1600 },      // portrait phone
    { az: 120, alt: 60, fov: 20, width: 800, height: 600 },
  ];
  const touchesCanvas = (proj, cam, pts) => pts.some(([az, alt]) => {
    const p = proj(az, alt);
    return p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height;
  });

  for (const cam of cams) {
    const spec = gridSpec(cam);
    const proj = createProjector(cam);
    const label = `fov=${cam.fov} ${cam.width}x${cam.height} alt=${cam.alt}`;

    // Every spoke on the azStep lattice that reaches the canvas must be listed.
    for (let k = 0; k < Math.round(360 / spec.azStep); k++) {
      const az = Number((k * spec.azStep).toFixed(6));
      const pts = [];
      for (let h = 0; h <= 90; h += 1) pts.push([az, h]);
      if (touchesCanvas(proj, cam, pts)) {
        assert.ok(spec.azimuths.includes(az), `${label}: spoke ${az}° is on screen but was culled`);
      }
    }
    // Same for altitude rings.
    for (let alt = spec.altStep; alt < 90; alt += spec.altStep) {
      const v = Number(alt.toFixed(6));
      const pts = [];
      for (let a = 0; a < 360; a += 1) pts.push([a, v]);
      if (touchesCanvas(proj, cam, pts)) {
        assert.ok(spec.altitudes.includes(v), `${label}: ring ${v}° is on screen but was culled`);
      }
    }
  }
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

test('aiming straight up or down keeps at least 8 spokes (the wheel never thins to 4)', () => {
  for (const [alt, below] of [[90, false], [-90, true]]) {
    for (const fov of [30, 60, 200]) {
      const spec = gridSpec({ az: 180, alt, fov, width: 800, height: 600 }, { below });
      assert.ok(spec.azStep <= 45, `azStep capped at 45 (alt=${alt}, fov=${fov}, got ${spec.azStep})`);
      assert.ok(spec.azimuths.length >= 8, `>= 8 spokes at the pole (alt=${alt}, fov=${fov}, got ${spec.azimuths.length})`);
    }
  }
});

test('the innermost ring caps the spokes when the zenith is in view', () => {
  const spec = gridSpec({ az: 180, alt: 89, fov: 60, width: 800, height: 600 });
  const top = Math.max(...spec.altitudes);
  assert.ok(top >= 90 - spec.altStep - 1e-9, 'a ring sits within one step of the pole to cap the spokes');
});

test('full-sphere mode extends rings below the horizon; default stays above', () => {
  const cam = { az: 180, alt: -45, fov: 60, width: 800, height: 600 }; // looking down
  const top = gridSpec(cam);                   // upper hemisphere only
  const full = gridSpec(cam, { below: true }); // entire sphere
  assert.ok(top.altitudes.every((h) => h > 0), 'no rings below the horizon by default');
  assert.ok(full.altitudes.some((h) => h < 0), 'rings appear below the horizon in full-sphere mode');
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
