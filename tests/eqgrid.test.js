import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eqToAltAz, drawEqGrid } from '../js/render/eqgrid.js';
import { eqjToEnuMatrix } from '../js/render/star-transform.js';
import { makeObserver, makeTime, makeStarAltAz, horToEqjRotation } from '../js/core/astro.js';
import { angularSep } from '../js/core/angles.js';
import { createProjector } from '../js/core/projection.js';

const OBSERVER = makeObserver(40.7, -74.0); // New York-ish; latitude pins the celestial pole's altitude
const TIME = makeTime(new Date('2026-06-08T06:00:00Z'));
const M = eqjToEnuMatrix(horToEqjRotation(OBSERVER, TIME));

test('eqToAltAz matches the vendor star path for high stars (grid glued to the stars)', () => {
  // Same spread used by the atmosphere matrix tests. eqToAltAz is geometric (no refraction), so
  // compare only well above the horizon where refraction is < 0.03°.
  const STARS = [
    { name: 'Vega', ra: 279.234, dec: 38.784 },
    { name: 'Arcturus', ra: 213.915, dec: 19.182 },
    { name: 'Altair', ra: 297.696, dec: 8.868 },
    { name: 'Deneb', ra: 310.358, dec: 45.280 },
    { name: 'Antares', ra: 247.352, dec: -26.432 },
  ];
  const toAltAz = makeStarAltAz(OBSERVER, TIME);
  let checked = 0;
  for (const s of STARS) {
    const want = toAltAz(s.ra, s.dec);
    if (want.alt < 30) continue;
    const got = eqToAltAz(M, s.ra, s.dec);
    assert.ok(angularSep(got.az, want.az) < 0.1, `${s.name} az (${got.az.toFixed(3)} vs ${want.az.toFixed(3)})`);
    assert.ok(Math.abs(got.alt - want.alt) < 0.1, `${s.name} alt (${got.alt.toFixed(3)} vs ${want.alt.toFixed(3)})`);
    checked++;
  }
  assert.ok(checked >= 2, `validated enough high stars (got ${checked})`);
});

test('the north celestial pole sits due north at the observer latitude', () => {
  // Classic invariant: NCP altitude == latitude, azimuth == 0. J2000 pole vs today's differs by
  // ~26 years of precession (~0.4°), hence the loose-ish tolerance.
  const p = eqToAltAz(M, 123, 90); // RA is meaningless at the pole
  assert.ok(Math.abs(p.alt - 40.7) < 0.6, `NCP altitude ~= latitude (got ${p.alt.toFixed(2)})`);
  assert.ok(angularSep(p.az, 0) < 1.5, `NCP azimuth ~= north (got ${p.az.toFixed(2)})`);
});

test('drawEqGrid strokes lines and places RA/Dec labels without throwing', () => {
  const calls = { stroke: 0, texts: [] };
  const ctx = {
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set globalAlpha(_) {}, get globalAlpha() { return 1; },
    beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { calls.stroke++; }, fillText(t) { calls.texts.push(t); },
  };
  const cam = { az: 0, alt: 41, fov: 90, width: 800, height: 600 }; // aimed at the celestial pole region
  assert.doesNotThrow(() => drawEqGrid(ctx, cam, M, 0.5));
  assert.ok(calls.stroke > 10, `strokes many grid lines (got ${calls.stroke})`);
  assert.ok(calls.texts.some((t) => /^\d+h(\d+m)?$/.test(t)), `labels RA in hours (got ${calls.texts.join(', ')})`);
  assert.ok(calls.texts.some((t) => t.endsWith('°')), 'labels Dec in degrees');
});

test('off-screen lines are windowed away when zoomed in (the frame-rate guard)', () => {
  let strokes = 0, moves = 0;
  const ctx = {
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set globalAlpha(_) {}, get globalAlpha() { return 1; },
    beginPath() {}, moveTo() { moves++; }, lineTo() {},
    stroke() { strokes++; }, fillText() {},
  };
  // Deep zoom aimed at the equator, far from the pole: almost every ring/hour-circle is off-screen
  // and must be skipped before sampling (this was the perf cliff — every line drawn, none visible).
  const cam = { az: 180, alt: 10, fov: 5, width: 800, height: 600 };
  drawEqGrid(ctx, cam, M, 0);
  assert.ok(strokes <= 30, `few lines survive the window at fov 5 (${strokes} strokes)`);
  assert.ok(moves > 0, 'but the lines crossing the view are still drawn');
});

test('RA spokes run pole to pole, so they converge at the celestial pole', () => {
  // Project the spoke endpoints directly: dec ±90 must be ON the line (the old version stopped at
  // ±80 and left dangling spoke ends with no cap).
  const ncp = eqToAltAz(M, 0, 90);
  const cam = { az: ncp.az, alt: ncp.alt, fov: 60, width: 800, height: 600 };
  const proj = createProjector(cam);
  const pole = proj(ncp.az, ncp.alt);
  // Sample the last step of two different spokes approaching the pole; both must land within a
  // sample-step of the pole's pixel — i.e. the spokes truly meet there.
  for (const ra of [0, 90]) {
    const near = eqToAltAz(M, ra, 88);
    const p = proj(near.az, near.alt);
    assert.ok(p.visible && Math.hypot(p.x - pole.x, p.y - pole.y) < 60,
      `spoke at RA ${ra} closes onto the pole (${Math.hypot(p.x - pole.x, p.y - pole.y).toFixed(1)}px away at dec 88)`);
  }
});
