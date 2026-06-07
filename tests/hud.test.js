import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compassMarks, azToCompass, drawHud } from '../js/render/hud.js';

test('azToCompass maps azimuth to 8-point names', () => {
  assert.equal(azToCompass(0), 'N');
  assert.equal(azToCompass(90), 'E');
  assert.equal(azToCompass(180), 'S');
  assert.equal(azToCompass(270), 'W');
  assert.equal(azToCompass(45), 'NE');
  assert.equal(azToCompass(359), 'N'); // wraps
});

test('compassMarks centers the facing direction and orders E<S<W when facing south', () => {
  const marks = compassMarks(180, 800); // 180-deg ribbon across 800px
  const by = Object.fromEntries(marks.map((m) => [m.label, m.x]));
  assert.ok('S' in by && 'E' in by && 'W' in by, 'E/S/W visible facing south');
  assert.ok(Math.abs(by.S - 400) < 1e-6, 'facing direction is centered');
  assert.ok(by.E < by.S && by.S < by.W, 'east left of south, west right of south');
  assert.ok(!('N' in by), 'north (180 deg away) is off the ribbon');
});

test('drawHud runs over a stubbed canvas without throwing', () => {
  const calls = { fillText: 0, stroke: 0, fillRect: 0 };
  const ctx = {
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set textAlign(_) {}, get textAlign() { return 'left'; },
    fillRect() { calls.fillRect++; }, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { calls.stroke++; }, fillText() { calls.fillText++; }, arc() {}, fill() {},
  };
  const cam = { az: 180, alt: 10, fov: 60, width: 800, height: 600 }; // low alt -> horizon in view
  assert.doesNotThrow(() => drawHud(ctx, cam));
  assert.ok(calls.fillText >= 2, 'draws compass labels + readout');
  assert.ok(calls.fillRect >= 1, 'draws the compass ribbon background');
});
