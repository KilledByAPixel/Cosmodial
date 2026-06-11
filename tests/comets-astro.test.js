import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, makeTime, cometsAltAz } from '../js/core/astro.js';

// JPL Horizons topocentric az/el — fetched via scripts/fetch-comet-data.mjs (QUANTITIES=4,
// APPARENT=AIRLESS), fetched 2026-06-11. Rows chosen with elevation > 25 deg. Tolerance 0.35 deg
// absorbs the refraction-model difference (Horizons AIRLESS vs our 'normal'), the skipped
// light-time/aberration, and two-body drift weeks from the element epoch.
const FIXTURES = [
  { id: '1P', lat: -30.24, lng: -70.74, utc: '1986-03-15T09:00:00Z', az: 98.424343, alt: 33.948307 },
  { id: 'C/1995 O1', lat: 51.48, lng: 0, utc: '1997-04-01T20:00:00Z', az: 307.873432, alt: 27.176685 },
];

test('oracle: cometsAltAz matches JPL Horizons topocentric az/el', () => {
  for (const f of FIXTURES) {
    const list = cometsAltAz(makeObserver(f.lat, f.lng), makeTime(new Date(f.utc)));
    const c = list.find((x) => x.id === f.id);
    assert.ok(c && c.altaz, `${f.id} has a position at ${f.utc}`);
    assert.ok(Math.abs(c.altaz.alt - f.alt) < 0.35, `${f.id} alt: ${c.altaz.alt} vs ${f.alt}`);
    const dAz = Math.abs(((c.altaz.az - f.az + 540) % 360) - 180);
    assert.ok(dAz < 0.35 / Math.cos((f.alt * Math.PI) / 180), `${f.id} az: ${c.altaz.az} vs ${f.az}`);
  }
});

test('cometsAltAz returns every comet, with null positions outside coverage', () => {
  const observer = makeObserver(40, -100);
  const medieval = cometsAltAz(observer, makeTime(new Date('1500-01-01T00:00:00Z')));
  assert.equal(medieval.length, 7);
  for (const c of medieval) {
    assert.equal(c.altaz, null, `${c.id} altaz in 1500`);
    assert.equal(c.mag, null, `${c.id} mag in 1500`);
    assert.equal(c.rAu, null, `${c.id} rAu in 1500`);
    assert.equal(c.deltaAu, null, `${c.id} deltaAu in 1500`);
    assert.match(c.coverage, /\d{4}–\d{4}/, `${c.id} coverage string`);
  }
  const now = cometsAltAz(observer, makeTime(new Date('2026-06-11T00:00:00Z')));
  const halley = now.find((c) => c.id === '1P');
  assert.ok(halley, 'Halley present in the result');
  assert.ok(halley.altaz && Number.isFinite(halley.mag), 'Halley has a position today');
  assert.ok(halley.rAu > 25 && halley.rAu < 40, `Halley is out past Neptune-ish today: ${halley.rAu}`);
  assert.ok(halley.mag > 20, `and far too faint to see: ${halley.mag}`);
});
