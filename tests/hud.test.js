import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compassMarks, azToCompass, drawHud } from '../js/render/hud.js';
import { LINE_STYLES } from '../js/render/line-styles.js';

test('azToCompass maps azimuth to 8-point names', () => {
  assert.equal(azToCompass(0), 'N');
  assert.equal(azToCompass(90), 'E');
  assert.equal(azToCompass(180), 'S');
  assert.equal(azToCompass(270), 'W');
  assert.equal(azToCompass(45), 'NE');
  assert.equal(azToCompass(359), 'N'); // wraps
});

test('compassMarks centers the facing direction; the default 90° span shows only nearby cardinals', () => {
  const marks = compassMarks(180, 240); // default span is now 90°
  const by = Object.fromEntries(marks.map((m) => [m.label, m.x]));
  assert.ok('S' in by && 'SE' in by && 'SW' in by, 'SE/S/SW visible facing south');
  assert.ok(Math.abs(by.S - 120) < 1e-6, 'facing direction is centered');
  assert.ok(by.SE < by.S && by.S < by.SW, 'south-east left of south, south-west right of south');
  assert.ok(!('E' in by), 'east (90° away) is outside the 90° pill');
  // an explicit wide span still works (the parameter is unchanged)
  const wide = compassMarks(180, 800, 180);
  assert.ok('E' in Object.fromEntries(wide.map((m) => [m.label, m.x])), 'explicit 180° span shows east');
});

test('drawHud runs over a stubbed canvas without throwing', () => {
  const calls = { fillText: 0, stroke: 0, fill: 0 };
  const ctx = {
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set textAlign(_) {}, get textAlign() { return 'left'; },
    set textBaseline(_) {}, get textBaseline() { return 'alphabetic'; },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    arc() {}, fill() { calls.fill++; }, stroke() { calls.stroke++; },
    fillText() { calls.fillText++; }, save() {}, restore() {}, clip() {},
  };
  const cam = { az: 180, alt: 10, fov: 60, width: 800, height: 600 }; // low alt -> horizon in view
  assert.doesNotThrow(() => drawHud(ctx, cam));
  assert.ok(calls.fillText >= 1, 'draws compass labels');
  assert.ok(calls.fill >= 1, 'fills the compass pill backdrop');
});

test('horizon:false hides the line and its cardinal letters but keeps the compass pill', () => {
  const makeCtx = () => {
    const calls = { lineTo: 0, fillText: 0, texts: [] };
    return {
      calls,
      set fillStyle(_) {}, get fillStyle() { return ''; },
      set strokeStyle(_) {}, get strokeStyle() { return ''; },
      set lineWidth(_) {}, get lineWidth() { return 1; },
      set font(_) {}, get font() { return ''; },
      set textAlign(_) {}, get textAlign() { return 'left'; },
      set textBaseline(_) {}, get textBaseline() { return 'alphabetic'; },
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() { calls.lineTo++; }, closePath() {},
      arc() {}, fill() {}, stroke() {}, save() {}, restore() {}, clip() {},
      fillText(t, x, y) { calls.fillText++; calls.texts.push({ t, y }); },
    };
  };
  const cam = { az: 180, alt: 10, fov: 60, width: 800, height: 600 }; // horizon well within view
  const on = makeCtx(); drawHud(on, cam);
  const off = makeCtx(); drawHud(off, cam, { horizon: false });
  // The compass pill draws a handful of lineTo calls of its own; the horizon polyline is dozens.
  assert.ok(on.calls.lineTo - off.calls.lineTo > 50, 'the horizon polyline is gone');
  assert.ok(off.calls.fillText >= 1, 'compass pill labels still draw');
  // The pill sits in the bottom strip; the on-sky cardinal letters near mid-screen are gone.
  assert.ok(off.calls.texts.every(({ y }) => y > 500), 'no cardinal letters out on the sky');
});

// The alt-az grid omits its own alt=0 ring and leans on the HUD for it, so with the Horizon toggle
// off the line still draws — but as an ordinary grid ring, not the bright labelled reference line.
test('plain:true strokes the horizon in grid styling with no cardinal letters', () => {
  const makeCtx = () => {
    const calls = { lineTo: 0, texts: [], strokes: [] };
    let strokeStyle = '', lineWidth = 1;
    return {
      calls,
      set fillStyle(_) {}, get fillStyle() { return ''; },
      set strokeStyle(v) { strokeStyle = v; }, get strokeStyle() { return strokeStyle; },
      set lineWidth(v) { lineWidth = v; }, get lineWidth() { return lineWidth; },
      set font(_) {}, get font() { return ''; },
      set textAlign(_) {}, get textAlign() { return 'left'; },
      set textBaseline(_) {}, get textBaseline() { return 'alphabetic'; },
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() { calls.lineTo++; }, closePath() {},
      arc() {}, fill() {}, save() {}, restore() {}, clip() {},
      stroke() { calls.strokes.push({ color: strokeStyle, width: lineWidth }); },
      fillText(t, x, y) { calls.texts.push({ t, y }); },
    };
  };
  const cam = { az: 180, alt: 10, fov: 60, width: 800, height: 600 };
  const full = makeCtx(); drawHud(full, cam, { horizon: true });
  const plain = makeCtx(); drawHud(plain, cam, { horizon: true, plain: true });
  const bare = makeCtx(); drawHud(bare, cam, { horizon: false });

  // The line itself is still there — same polyline as the full treatment, not the horizon-less HUD.
  assert.equal(plain.calls.lineTo, full.calls.lineTo, 'plain draws the same horizon polyline');
  assert.ok(plain.calls.lineTo - bare.calls.lineTo > 50, 'and it is genuinely drawn, not skipped');
  // Styled as a grid ring rather than the bright reference line.
  assert.deepEqual(plain.calls.strokes[0], { color: LINE_STYLES.grid.color, width: LINE_STYLES.grid.width });
  assert.deepEqual(full.calls.strokes[0], { color: LINE_STYLES.horizon.color, width: LINE_STYLES.horizon.width });
  // No N/E/S/W out on the sky; only the compass pill's own labels down in the bottom strip.
  assert.ok(plain.calls.texts.every(({ y }) => y > 500), 'no cardinal letters in plain mode');
  assert.ok(full.calls.texts.some(({ y }) => y <= 500), 'the full treatment does label the horizon');
});

test('the horizon reads as more prominent than any grid line', () => {
  const alpha = (c) => Number(c.match(/([\d.]+)\)$/)[1]);
  assert.ok(LINE_STYLES.horizon.width > LINE_STYLES.grid.width, 'thicker than the alt-az grid');
  assert.ok(LINE_STYLES.horizon.width > LINE_STYLES.eqGrid.width, 'thicker than the equatorial grid');
  assert.ok(alpha(LINE_STYLES.horizon.color) > alpha(LINE_STYLES.grid.color), 'and brighter');
});

test('looking nearly straight up fully zoomed out, the horizon draws as a closed ring', () => {
  const calls = { lineTo: 0 };
  const ctx = {
    set fillStyle(_) {}, get fillStyle() { return ''; },
    set strokeStyle(_) {}, get strokeStyle() { return ''; },
    set lineWidth(_) {}, get lineWidth() { return 1; },
    set font(_) {}, get font() { return ''; },
    set textAlign(_) {}, get textAlign() { return 'left'; },
    set textBaseline(_) {}, get textBaseline() { return 'alphabetic'; },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() { calls.lineTo++; }, closePath() {},
    arc() {}, fill() {}, stroke() {}, fillText() {}, save() {}, restore() {}, clip() {},
  };
  // Aim at the zenith at MAX_FOV: every horizon azimuth is 89° off-axis -> all projectable.
  // The full ±180° sweep (181 samples) yields 180 horizon lineTo calls; the old ±90° half-sweep
  // gave only 90 — assert well above that so a regression to half-horizon sampling fails here.
  drawHud(ctx, { az: 0, alt: 89, fov: 235, width: 800, height: 600 });
  assert.ok(calls.lineTo > 150, `expected a closed horizon ring, got ${calls.lineTo} lineTo calls`);
});
