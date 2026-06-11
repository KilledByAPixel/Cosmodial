import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../js/core/cities.js';

test('CITIES: 100+ well-formed, unique, alphabetized entries with in-range coordinates', () => {
  assert.ok(CITIES.length >= 100, `${CITIES.length} cities`);
  const labels = new Set();
  for (const c of CITIES) {
    assert.ok(typeof c.label === 'string' && c.label.includes(','), `label "${c.label}" is "City, Region"`);
    assert.ok(Number.isFinite(c.lat) && c.lat >= -90 && c.lat <= 90, `${c.label} lat ${c.lat}`);
    assert.ok(Number.isFinite(c.lng) && c.lng >= -180 && c.lng <= 180, `${c.label} lng ${c.lng}`);
    assert.ok(!labels.has(c.label), `duplicate ${c.label}`);
    labels.add(c.label);
  }
  const sorted = [...CITIES].map((c) => c.label).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(CITIES.map((c) => c.label), sorted, 'alphabetical by label');
});

test('CITIES spans the globe', () => {
  assert.ok(CITIES.some((c) => c.lat < -30), 'deep southern hemisphere');
  assert.ok(CITIES.some((c) => c.lat > 60), 'far north');
  assert.ok(CITIES.some((c) => c.lng < -100), 'western Americas');
  assert.ok(CITIES.some((c) => c.lng > 100), 'east Asia / Oceania');
});
