import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSegments, toggleEdge, pickNearest, circularCentroid, exportFigures } from '../js/edit/figures.js';

test('splitSegments turns polylines into 2-point edges', () => {
  const out = splitSegments([{ name: 'X', abbr: 'X', lines: [[[0, 0], [1, 1], [2, 2]]] }]);
  assert.equal(out[0].lines.length, 2);
  assert.deepEqual(out[0].lines[0], [[0, 0], [1, 1]]);
  assert.deepEqual(out[0].lines[1], [[1, 1], [2, 2]]);
  assert.equal(out[0].abbr, 'X');
});

test('toggleEdge adds an absent edge and removes a present one (either orientation)', () => {
  const a = [10, 20], b = [30, 40];
  let lines = [];
  lines = toggleEdge(lines, a, b);
  assert.equal(lines.length, 1);
  lines = toggleEdge(lines, b, a); // present in reverse orientation -> removed
  assert.equal(lines.length, 0);
});

test('pickNearest returns the nearest visible point within maxDist, else null', () => {
  const projected = [
    { x: 100, y: 100, visible: true, ref: 'A' },
    { x: 105, y: 102, visible: true, ref: 'B' },
    { x: 50, y: 50, visible: false, ref: 'C' },
  ];
  assert.equal(pickNearest(projected, 103, 101, 12), 'B');
  assert.equal(pickNearest(projected, 300, 300, 12), null);
  assert.equal(pickNearest(projected, 50, 50, 12), null); // C is not visible
});

test('circularCentroid handles the RA 0/360 wrap', () => {
  const [ra, dec] = circularCentroid([[359, 10], [1, 20]]);
  assert.ok(ra < 5 || ra > 355, `ra ${ra} should be near 0`);
  assert.ok(Math.abs(dec - 15) < 1e-6);
});

test('exportFigures drops empty figures and recomputes labels', () => {
  const out = exportFigures([
    { name: 'Orion', abbr: 'Ori', lines: [[[80, 0], [82, 2]]] },
    { name: 'Empty', abbr: 'Emp', lines: [] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Orion');
  assert.ok(Array.isArray(out[0].label) && out[0].label.length === 2);
  assert.deepEqual(out[0].lines, [[[80, 0], [82, 2]]]);
});
