import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body, nextMaxElongation, nextOpposition, nextVenusPeakMagnitude, nextFullMoon } from '../js/core/astro.js';

const DAY_MS = 86400000;
const daysOff = (date, iso) => Math.abs(date.getTime() - new Date(iso).getTime()) / DAY_MS;

// Published opposition dates (exact instants differ from almanac headlines by hours).
test('nextOpposition lands on known opposition dates', () => {
  assert.ok(daysOff(nextOpposition(Body.Mars, new Date('2024-12-01T00:00:00Z')), '2025-01-16T00:00:00Z') < 1.5,
    'Mars opposition mid-January 2025');
  assert.ok(daysOff(nextOpposition(Body.Saturn, new Date('2025-06-01T00:00:00Z')), '2025-09-21T00:00:00Z') < 1.5,
    'Saturn opposition late September 2025');
  assert.ok(daysOff(nextOpposition(Body.Jupiter, new Date('2025-06-01T00:00:00Z')), '2026-01-10T00:00:00Z') < 1.5,
    'Jupiter opposition early January 2026');
});

test('nextMaxElongation returns plausible Mercury/Venus elongations', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const m = nextMaxElongation(Body.Mercury, start);
  assert.ok(m.date > start && (m.date - start) / DAY_MS < 130, 'within one Mercury synodic period');
  assert.ok(m.elongationDeg >= 17 && m.elongationDeg <= 29, `Mercury elongation ${m.elongationDeg} out of range`);
  assert.ok(m.visibility === 'morning' || m.visibility === 'evening');
  const v = nextMaxElongation(Body.Venus, start);
  assert.ok(v.elongationDeg >= 45 && v.elongationDeg <= 48, `Venus elongation ${v.elongationDeg} out of range`);
});

test('nextVenusPeakMagnitude finds a genuinely brilliant Venus', () => {
  const start = new Date('2025-01-01T00:00:00Z');
  const p = nextVenusPeakMagnitude(start);
  assert.ok(p.date > start, 'in the future');
  assert.ok(p.mag < -4.3 && p.mag > -5.0, `peak mag ${p.mag} should be near -4.9`);
});

test('nextFullMoon lands on a known full moon and carries a sane distance', () => {
  const fm = nextFullMoon(new Date('2025-01-01T00:00:00Z'));
  assert.ok(daysOff(fm.date, '2025-01-13T22:27:00Z') < 0.25, 'January 2025 full moon');
  assert.ok(fm.distKm > 350000 && fm.distKm < 410000, `distance ${fm.distKm} outside the lunar range`);
});

test('supermoon vs micromoon distances split across the 360k km cut', () => {
  const superFm = nextFullMoon(new Date('2025-11-01T00:00:00Z')); // Nov 5 2025: the year's closest full moon
  assert.ok(superFm.distKm < 360000, `Nov 2025 supermoon at ${superFm.distKm} km`);
  const microFm = nextFullMoon(new Date('2025-04-05T00:00:00Z')); // Apr 13 2025: near-apogee full moon
  assert.ok(microFm.distKm > 395000, `Apr 2025 micromoon at ${microFm.distKm} km`);
});
