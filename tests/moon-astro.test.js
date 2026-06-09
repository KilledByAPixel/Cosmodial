import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTime, Body, moonPhaseAngleDeg, northPoleJ2000 } from '../js/core/astro.js';

const time = makeTime(new Date('2026-06-09T04:00:00Z'));

test('moonPhaseAngleDeg is within 0..180', () => {
  const p = moonPhaseAngleDeg(time);
  assert.ok(Number.isFinite(p) && p >= 0 && p <= 180, `phase angle ${p}`);
});

test('northPoleJ2000 for the Moon is near the ecliptic pole region', () => {
  const { raDeg, decDeg } = northPoleJ2000(Body.Moon, time);
  assert.ok(raDeg >= 0 && raDeg < 360 && decDeg >= -90 && decDeg <= 90, `pole ${raDeg},${decDeg}`);
  assert.ok(decDeg > 60 && decDeg < 75, `moon pole dec ${decDeg}`);
});
