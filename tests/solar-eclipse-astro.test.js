import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, searchSolarEclipse, nextSolarEclipse } from '../js/core/astro.js';
import { solarVisibility } from '../js/guide/eclipses.js';

// Oracle: the 2024-04-08 Great American Eclipse from Dallas, TX — totality 18:40-18:44 UT,
// peak 18:42 UT at ~65 deg altitude, ~3.8 minutes long (NASA published circumstances).
test('oracle: the 2024-04-08 total eclipse from Dallas', () => {
  const dallas = makeObserver(32.78, -96.80);
  const e = searchSolarEclipse(new Date('2024-04-01T00:00:00Z'), dallas);
  assert.equal(e.kind, 'total');
  assert.equal(e.obscuration, 1, 'total eclipse fully obscures');
  assert.equal(e.peak.toISOString().slice(0, 10), '2024-04-08');
  const peakUtcMin = e.peak.getUTCHours() * 60 + e.peak.getUTCMinutes();
  assert.ok(Math.abs(peakUtcMin - (18 * 60 + 42)) <= 5, `peak ~18:42 UT: ${e.peak.toISOString()}`);
  assert.ok(e.totalityMinutes > 3 && e.totalityMinutes < 4.5, `totality ~3.8 min: ${e.totalityMinutes}`);
  assert.ok(e.contacts.totalBegin && e.contacts.totalEnd, 'total phase contacts present');
  assert.ok(e.contacts.partialBegin < e.contacts.totalBegin && e.contacts.totalEnd < e.contacts.partialEnd, 'contacts ordered');
  assert.ok(e.altDeg.peak > 55 && e.altDeg.peak < 75, `Sun high at peak: ${e.altDeg.peak}`);
  assert.equal(solarVisibility(e), 'full');
});

test('nextSolarEclipse advances past a given peak', () => {
  const dallas = makeObserver(32.78, -96.80);
  const first = searchSolarEclipse(new Date('2024-04-01T00:00:00Z'), dallas);
  const after = nextSolarEclipse(first.peak, dallas);
  assert.ok(after.peak > first.peak, 'strictly later');
  assert.ok(['partial', 'annular', 'total'].includes(after.kind));
  assert.ok(after.obscuration > 0 && after.obscuration <= 1);
  assert.equal(after.contacts.totalBegin === null, after.totalityMinutes === null,
    'total-phase fields are consistent');
});
