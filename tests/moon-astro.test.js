import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, makeTime, Body, bodyPhaseAngleDeg, northPoleJ2000, bodyAngularRadiusDeg, moonLibrationDeg, altAzOfBody, lunarShadow, searchLunarEclipse, nextLunarEclipse } from '../js/core/astro.js';
import { altazSepDeg } from '../js/core/moon.js';

const observer = makeObserver(40.0, -74.0);
const time = makeTime(new Date('2026-06-09T04:00:00Z'));

test('moonLibrationDeg stays within the physical wobble bounds across a month', () => {
  let maxLon = 0, maxLat = 0;
  const t0 = Date.parse('2026-06-01T00:00:00Z');
  for (let day = 0; day < 28; day++) {
    const { lonDeg, latDeg } = moonLibrationDeg(makeTime(new Date(t0 + day * 86400e3)));
    assert.ok(Math.abs(lonDeg) < 10 && Math.abs(latDeg) < 8, `day ${day}: lon ${lonDeg}, lat ${latDeg}`);
    maxLon = Math.max(maxLon, Math.abs(lonDeg)); maxLat = Math.max(maxLat, Math.abs(latDeg));
  }
  assert.ok(maxLon > 1 && maxLat > 1, `the wobble actually wobbles (max lon ${maxLon}, lat ${maxLat})`);
});

test('bodyPhaseAngleDeg is within 0..180 for the Moon and Venus', () => {
  for (const b of [Body.Moon, Body.Venus]) {
    const p = bodyPhaseAngleDeg(b, time);
    assert.ok(Number.isFinite(p) && p >= 0 && p <= 180, `${b} phase angle ${p}`);
  }
});

test('northPoleJ2000 for the Moon is near the ecliptic pole region', () => {
  const { raDeg, decDeg } = northPoleJ2000(Body.Moon, time);
  assert.ok(raDeg >= 0 && raDeg < 360 && decDeg >= -90 && decDeg <= 90, `pole ${raDeg},${decDeg}`);
  assert.ok(decDeg > 60 && decDeg < 75, `moon pole dec ${decDeg}`);
});

test('bodyAngularRadiusDeg gives plausible planet sizes (Jupiter > Mars, both tiny)', () => {
  const jup = bodyAngularRadiusDeg(Body.Jupiter, observer, time);
  const mars = bodyAngularRadiusDeg(Body.Mars, observer, time);
  assert.ok(jup > 0.002 && jup < 0.01, `jupiter ang radius deg ${jup}`);
  assert.ok(mars > 0.0003 && mars < 0.004, `mars ang radius deg ${mars}`);
  assert.ok(jup > mars, 'Jupiter is larger than Mars on the sky');
});

// The shadow function drives the lunar-eclipse shading on the rendered disc. Oracle: the vendor's
// own eclipse search. At a TOTAL eclipse's peak the Moon must sit fully inside the umbra; a week
// later the shadow must miss the disc entirely.
test('lunarShadow: the umbra swallows the Moon at a total eclipse peak and misses it a week later', () => {
  let e = searchLunarEclipse(new Date('2026-01-01T00:00:00Z'));
  while (e.kind !== 'total') e = nextLunarEclipse(e.peak);
  const tPeak = makeTime(e.peak);
  const sh = lunarShadow(observer, tPeak);
  assert.ok(sh.umbraDeg > 0.6 && sh.umbraDeg < 0.8, `umbra radius plausible (${sh.umbraDeg})`);
  assert.ok(sh.penumbraDeg > 1.1 && sh.penumbraDeg < 1.4, `penumbra radius plausible (${sh.penumbraDeg})`);
  const moon = altAzOfBody(Body.Moon, observer, tPeak);
  const moonRad = bodyAngularRadiusDeg(Body.Moon, observer, tPeak);
  const sep = altazSepDeg(sh.altaz, moon);
  assert.ok(sep < sh.umbraDeg - moonRad + 0.02, `fully inside the umbra at the total peak (sep ${sep})`);
  const tAway = makeTime(new Date(e.peak.getTime() + 7 * 86400e3));
  const sepAway = altazSepDeg(lunarShadow(observer, tAway).altaz, altAzOfBody(Body.Moon, observer, tAway));
  assert.ok(sepAway > sh.penumbraDeg + moonRad, `clear of the shadow a week later (sep ${sepAway})`);
});
