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
  assert.equal(medieval.length, 10);
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

// The great comets carry per-apparition light-curve M1/K1 (not JPL's whole-arc fits) precisely so
// these dates look like the historical record. Wide brackets: light curves are approximate.
test('famous apparitions reach their observed brightness', () => {
  const observer = makeObserver(40, -100);
  const magAt = (id, utc) => cometsAltAz(observer, makeTime(new Date(utc))).find((c) => c.id === id).mag;
  const haleBopp = magAt('C/1995 O1', '1997-04-01T20:00:00Z');
  assert.ok(haleBopp > -1.5 && haleBopp < 0.5, `Hale–Bopp Apr 1997 ~ obs -0.5: ${haleBopp}`);
  const neowise = magAt('C/2020 F3', '2020-07-12T08:00:00Z');
  assert.ok(neowise > 0.5 && neowise < 3, `NEOWISE Jul 2020 ~ obs 2: ${neowise}`);
  const a3 = magAt('C/2023 A3', '2024-10-15T02:00:00Z');
  assert.ok(a3 > 0.5 && a3 < 3, `Tsuchinshan–ATLAS Oct 2024 ~ obs 2: ${a3}`);
});

test('interstellar visitors: positioned during their flybys, never naked-eye', () => {
  const observer = makeObserver(40, -100);
  const at = (id, utc) => cometsAltAz(observer, makeTime(new Date(utc))).find((c) => c.id === id);
  const oumuamua = at('1I', '2017-10-25T06:00:00Z'); // discovery weeks
  assert.ok(oumuamua.altaz && oumuamua.rAu > 1 && oumuamua.rAu < 2, `'Oumuamua near 1.4 AU out: ${oumuamua.rAu}`);
  assert.ok(oumuamua.mag > 19, `'Oumuamua big-observatory faint: ${oumuamua.mag}`);
  const borisov = at('2I', '2019-12-08T12:00:00Z'); // perihelion day
  assert.ok(borisov.altaz && borisov.rAu > 1.9 && borisov.rAu < 2.1, `Borisov q ~ 2.0 AU: ${borisov.rAu}`);
  assert.ok(borisov.mag > 13 && borisov.mag < 18, `Borisov telescope-only: ${borisov.mag}`);
  const atlas = at('3I', '2025-10-30T00:00:00Z'); // perihelion era, e ~ 6.14 exercises deep-hyperbolic
  assert.ok(atlas.altaz && atlas.rAu > 1.3 && atlas.rAu < 1.5, `3I/ATLAS q ~ 1.36 AU: ${atlas.rAu}`);
  assert.ok(atlas.mag > 9, `3I/ATLAS below the marker threshold even at peak: ${atlas.mag}`);
});
