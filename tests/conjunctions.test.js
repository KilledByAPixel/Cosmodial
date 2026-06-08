import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angularSep, findConjunctions, midpointAltAz } from '../js/guide/conjunctions.js';

test('angularSep: 0 for identical, ~90 for orthogonal, = alt diff at equal azimuth', () => {
  assert.ok(Math.abs(angularSep({ alt: 30, az: 100 }, { alt: 30, az: 100 })) < 1e-9);
  assert.ok(Math.abs(angularSep({ alt: 0, az: 0 }, { alt: 0, az: 90 }) - 90) < 1e-9);
  assert.ok(Math.abs(angularSep({ alt: 10, az: 50 }, { alt: 40, az: 50 }) - 30) < 1e-9);
});

test('findConjunctions keeps close pairs, drops wide ones', () => {
  const bodies = [
    { label: 'Moon', altaz: { alt: 20, az: 100 }, mag: -12 },
    { label: 'Venus', altaz: { alt: 22, az: 101 }, mag: -4 }, // ~2.2 deg from Moon
    { label: 'Mars', altaz: { alt: 60, az: 250 }, mag: 1 },   // far away
  ];
  const c = findConjunctions(bodies, 5);
  assert.equal(c.length, 1);
  assert.equal(c[0].a.label, 'Moon');
  assert.equal(c[0].b.label, 'Venus');
  assert.ok(c[0].sepDeg < 5);
});

test('findConjunctions sorts multiple pairs closest-first', () => {
  const bodies = [
    { label: 'A', altaz: { alt: 20, az: 100 }, mag: 0 },
    { label: 'B', altaz: { alt: 24, az: 100 }, mag: 0 }, // 4 deg from A
    { label: 'C', altaz: { alt: 21, az: 100 }, mag: 0 }, // 1 deg from A
  ];
  const c = findConjunctions(bodies, 5);
  assert.ok(c[0].sepDeg < c[1].sepDeg, 'closest first');
  assert.equal(c[0].a.label, 'A');
  assert.equal(c[0].b.label, 'C');
});

test('midpointAltAz returns a point between the two', () => {
  const m = midpointAltAz({ alt: 20, az: 100 }, { alt: 30, az: 100 });
  assert.ok(Math.abs(m.alt - 25) < 0.5, `alt ~25, got ${m.alt}`);
  assert.ok(Math.abs(m.az - 100) < 0.5, `az ~100, got ${m.az}`);
});
