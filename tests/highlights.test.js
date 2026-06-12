import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_WINDOW_DAYS, SUPERMOON_KM, OCCULT_SEP_DEG, withinDays, bestVisibleComet, isOccultation } from '../js/guide/highlights.js';

test('withinDays brackets the event date symmetrically, fractional days included', () => {
  const event = new Date('2026-06-15T00:00:00Z');
  assert.ok(withinDays(new Date('2026-06-13T00:00:00Z'), event, 3), '2 days before');
  assert.ok(withinDays(new Date('2026-06-18T00:00:00Z'), event, 3), '3 days after (inclusive)');
  assert.ok(!withinDays(new Date('2026-06-19T00:00:00Z'), event, 3), '4 days after');
  assert.ok(withinDays(new Date('2026-06-15T11:00:00Z'), event, 0.5), 'half-day window');
  assert.ok(!withinDays(new Date('2026-06-16T00:00:00Z'), event, 0.5), 'past the half-day window');
});

test('bestVisibleComet: brightest comet that is up, in coverage, and bright enough', () => {
  const comets = [
    { name: 'Set',     mag: 2.0, altaz: { alt: -5, az: 90 } },   // below horizon
    { name: 'NoData',  mag: 1.0, altaz: null },                  // outside element coverage
    { name: 'Faint',   mag: 9.5, altaz: { alt: 40, az: 180 } },  // telescope-only
    { name: 'Good',    mag: 4.2, altaz: { alt: 30, az: 200 } },
    { name: 'Better',  mag: 3.1, altaz: { alt: 10, az: 250 } },
  ];
  assert.equal(bestVisibleComet(comets).name, 'Better', 'picks the brightest qualifying comet');
  assert.equal(bestVisibleComet(comets, 3.0), null, 'stricter cut can leave nothing');
  assert.equal(bestVisibleComet([]), null, 'empty list');
  assert.equal(bestVisibleComet([{ name: 'NoMag', altaz: { alt: 30, az: 0 } }]), null, 'missing mag never qualifies');
});

test('isOccultation: only a tight pairing that includes the Moon', () => {
  const moon = { label: 'Moon' };
  const saturn = { label: 'Saturn' };
  const venus = { label: 'Venus' };
  assert.ok(isOccultation({ a: moon, b: saturn, sepDeg: 0.2 }), 'Moon grazing a planet');
  assert.ok(isOccultation({ a: saturn, b: moon, sepDeg: 0.1 }), 'order does not matter');
  assert.ok(!isOccultation({ a: moon, b: saturn, sepDeg: 0.8 }), 'a near miss is just a conjunction');
  assert.ok(!isOccultation({ a: venus, b: saturn, sepDeg: 0.1 }), 'two planets can appear to touch, not occult');
});

test('highlight tunables stay in sane ranges', () => {
  for (const [kind, days] of Object.entries(HIGHLIGHT_WINDOW_DAYS)) {
    assert.ok(days > 0 && days <= 7, `${kind} window ${days} out of range`);
  }
  assert.ok(SUPERMOON_KM > 350000 && SUPERMOON_KM < 370000, 'supermoon cut near the popular definition');
  assert.ok(OCCULT_SEP_DEG > 0.25 && OCCULT_SEP_DEG <= 0.6, 'occultation cut just past the lunar radius');
});
