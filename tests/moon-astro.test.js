import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, makeTime, Body, moonPhaseAngleDeg, bodyEquatorialJ2000, northPoleJ2000, bodyHourAngleDeg } from '../js/core/astro.js';

const observer = makeObserver(40.0, -74.0);
const time = makeTime(new Date('2026-06-09T04:00:00Z'));

test('moonPhaseAngleDeg is within 0..180', () => {
  const p = moonPhaseAngleDeg(time);
  assert.ok(Number.isFinite(p) && p >= 0 && p <= 180, `phase angle ${p}`);
});

test('bodyEquatorialJ2000 returns plausible RA/Dec for the Moon', () => {
  const { raDeg, decDeg } = bodyEquatorialJ2000(Body.Moon, observer, time);
  assert.ok(raDeg >= 0 && raDeg < 360, `ra ${raDeg}`);
  assert.ok(decDeg >= -90 && decDeg <= 90, `dec ${decDeg}`);
  assert.ok(Math.abs(decDeg) <= 29, `moon dec in range ${decDeg}`);
});

test('northPoleJ2000 for the Moon is near the ecliptic pole region', () => {
  const { raDeg, decDeg } = northPoleJ2000(Body.Moon, time);
  assert.ok(raDeg >= 0 && raDeg < 360 && decDeg >= -90 && decDeg <= 90, `pole ${raDeg},${decDeg}`);
  assert.ok(decDeg > 60 && decDeg < 75, `moon pole dec ${decDeg}`);
});

test('bodyHourAngleDeg is within -180..180', () => {
  const h = bodyHourAngleDeg(Body.Moon, observer, time);
  assert.ok(Number.isFinite(h) && h >= -180 && h <= 180, `hour angle ${h}`);
});
