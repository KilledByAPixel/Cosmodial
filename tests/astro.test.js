import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, altAzOfStar, altAzOfBody, precessToDate, makeTime, Body, bodyMagnitude, bodyAngularRadiusDeg, makeStarAltAz, nightWindow, bodyDistanceAu, moonPhaseName, moonPhaseInfo, searchLunarEclipse, nextLunarEclipse, nextSunEvent, PLANET_MOONS, nextSunBelowAlt } from '../js/core/astro.js';

// Angular separation (deg) between two equatorial points given in degrees.
function sepDeg(ra1, dec1, ra2, dec2) {
  const d2r = Math.PI / 180;
  const a = Math.sin(dec1 * d2r) * Math.sin(dec2 * d2r) +
            Math.cos(dec1 * d2r) * Math.cos(dec2 * d2r) * Math.cos((ra1 - ra2) * d2r);
  return Math.acos(Math.min(1, Math.max(-1, a))) / d2r;
}

// Polaris (J2000): RA 2h31m49s ~= 37.954 deg, Dec +89.264 deg.
const POLARIS = { ra: 37.9543, dec: 89.2641 };

test('Polaris altitude ~= observer latitude (canonical correctness check)', () => {
  const obs = makeObserver(40.0, -105.0);          // Boulder-ish, northern mid-latitude
  const t = makeTime(new Date('2025-06-06T06:00:00Z'));
  const { alt } = altAzOfStar(POLARIS.ra, POLARIS.dec, obs, t);
  assert.ok(Math.abs(alt - 40.0) < 1.2, `Polaris alt ${alt} should be ~40`);
});

test('Sun is below horizon at local midnight and above at local noon', () => {
  const obs = makeObserver(40.0, 0.0);             // lng 0 => local solar time ~ UTC
  const midnight = altAzOfBody(Body.Sun, obs, makeTime(new Date('2025-03-20T00:00:00Z')));
  const noon = altAzOfBody(Body.Sun, obs, makeTime(new Date('2025-03-20T12:00:00Z')));
  assert.ok(midnight.alt < -10, `midnight Sun alt ${midnight.alt} should be well below 0`);
  assert.ok(noon.alt > 10, `noon Sun alt ${noon.alt} should be well above 0`);
});

test('azimuth is a valid bearing', () => {
  const obs = makeObserver(40.0, 0.0);
  const noon = altAzOfBody(Body.Sun, obs, makeTime(new Date('2025-03-20T12:00:00Z')));
  assert.ok(noon.az >= 0 && noon.az < 360, `az ${noon.az} out of range`);
  assert.ok(noon.az > 90 && noon.az < 270, `at solar noon (N. hemisphere) Sun should be roughly south`);
});

test('precession is identity at J2000 and ~1.4 deg per century', () => {
  const atEpoch = precessToDate(0, 0, makeTime(new Date('2000-01-01T12:00:00Z')));
  assert.ok(sepDeg(0, 0, atEpoch.ra, atEpoch.dec) < 0.02, 'should be ~identity at J2000');

  const after100y = precessToDate(0, 0, makeTime(new Date('2100-01-01T12:00:00Z')));
  const shift = sepDeg(0, 0, after100y.ra, after100y.dec);
  assert.ok(shift > 1.0 && shift < 2.0, `100y precession shift ${shift} deg should be ~1.4`);
});

test('southern-hemisphere sign convention: near-south-pole star altitude ~= |latitude|', () => {
  const obs = makeObserver(-40.0, 150.0); // southern mid-latitude (e.g. SE Australia)
  const t = makeTime(new Date('2025-06-06T12:00:00Z'));
  // A synthetic star ~0.7 deg from the south celestial pole (mirror of Polaris).
  const { alt } = altAzOfStar(100.0, -89.26, obs, t);
  assert.ok(Math.abs(alt - 40.0) < 1.2, `south-pole-region star alt ${alt} should be ~40`);
});

test('bodyMagnitude returns a sane apparent magnitude for a planet', () => {
  const t = makeTime(new Date('2025-06-06T06:00:00Z'));
  const mag = bodyMagnitude(Body.Jupiter, t);
  assert.ok(Number.isFinite(mag) && mag > -4 && mag < 1, `Jupiter mag ${mag} should be ~ -2..-1`);
});

test('bodyAngularRadiusDeg ~0.25 deg for Sun/Moon, plausible for planets', () => {
  const obs = makeObserver(40, -105);
  const t = makeTime(new Date('2025-06-06T06:00:00Z'));
  const sun = bodyAngularRadiusDeg(Body.Sun, obs, t);
  const moon = bodyAngularRadiusDeg(Body.Moon, obs, t);
  assert.ok(sun > 0.2 && sun < 0.3, `sun angular radius ${sun} should be ~0.27`);
  assert.ok(moon > 0.2 && moon < 0.32, `moon angular radius ${moon} should be ~0.25`);
  const jup = bodyAngularRadiusDeg(Body.Jupiter, obs, t);
  assert.ok(jup > 0.002 && jup < 0.01, `jupiter angular radius ${jup} should be tiny`);
});

test('makeStarAltAz matches altAzOfStar (precession computed once, reused)', () => {
  const obs = makeObserver(40, -105);
  const t = makeTime(new Date('2026-06-07T06:00:00Z'));
  const conv = makeStarAltAz(obs, t);
  const a = conv(101.287, -16.716);                      // Sirius (J2000)
  const b = altAzOfStar(101.287, -16.716, obs, t);
  assert.ok(Math.abs(a.alt - b.alt) < 1e-9, `alt ${a.alt} vs ${b.alt}`);
  assert.ok(Math.abs(a.az - b.az) < 1e-9, `az ${a.az} vs ${b.az}`);
});

test('nightWindow returns a sunset and the following sunrise', () => {
  const obs = makeObserver(30.27, -97.74); // Austin
  const { sunset, sunrise } = nightWindow(obs, new Date('2026-06-07T18:00:00Z'));
  assert.ok(sunset instanceof Date && sunrise instanceof Date, 'both are Dates');
  assert.ok(sunrise.getTime() > sunset.getTime(), 'sunrise is after sunset');
  const hrs = (sunrise.getTime() - sunset.getTime()) / 3.6e6;
  assert.ok(hrs > 6 && hrs < 14, `night length ${hrs}h is plausible`);
});

test('moonPhaseName maps ecliptic phase angle to the 8 phases', () => {
  assert.equal(moonPhaseName(0), 'New Moon');
  assert.equal(moonPhaseName(90), 'First Quarter');
  assert.equal(moonPhaseName(180), 'Full Moon');
  assert.equal(moonPhaseName(270), 'Last Quarter');
  assert.equal(moonPhaseName(45), 'Waxing Crescent');
  assert.equal(moonPhaseName(359), 'New Moon');
});

test('moonPhaseInfo returns illumPct 0..100 and a phase name; bodyDistanceAu is sane', () => {
  const obs = makeObserver(40, -105);
  const t = makeTime(new Date('2026-06-07T06:00:00Z'));
  const m = moonPhaseInfo(t);
  assert.ok(m.illumPct >= 0 && m.illumPct <= 100, `illumPct ${m.illumPct}`);
  assert.equal(typeof m.phaseName, 'string');
  const moonAu = bodyDistanceAu(Body.Moon, obs, t);
  assert.ok(moonAu > 0.002 && moonAu < 0.003, `Moon distance ${moonAu} AU (~0.00257)`);
  const marsAu = bodyDistanceAu(Body.Mars, obs, t);
  assert.ok(marsAu > 0.3 && marsAu < 3, `Mars distance ${marsAu} AU plausible`);
});

test('searchLunarEclipse finds the Mar 2025 total lunar eclipse with ordered contacts', () => {
  const e = searchLunarEclipse(new Date('2025-03-01T00:00:00Z'));
  assert.equal(e.kind, 'total');
  assert.equal(e.peak.getUTCFullYear(), 2025);
  assert.equal(e.peak.getUTCMonth(), 2); // March (0-based)
  const c = e.contacts;
  assert.ok(c.partialBegin < c.totalBegin, 'partial begins before totality');
  assert.ok(c.totalBegin < c.peak, 'totality begins before peak');
  assert.ok(c.peak.getTime() === e.peak.getTime(), 'contacts.peak === peak');
  assert.ok(c.peak < c.totalEnd, 'peak before totality ends');
  assert.ok(c.totalEnd < c.partialEnd, 'totality ends before partial ends');
  assert.ok(e.totalityMinutes > 30 && e.totalityMinutes < 120, `totality ${e.totalityMinutes} min plausible`);
});

test('nextLunarEclipse returns the following eclipse (later peak)', () => {
  const first = searchLunarEclipse(new Date('2025-03-01T00:00:00Z'));
  const second = nextLunarEclipse(first.peak);
  assert.ok(second.peak.getTime() > first.peak.getTime(), 'next eclipse is later');
});

test('nextSunEvent returns whichever of sunset/sunrise comes first', () => {
  const obs = makeObserver(30.27, -97.74); // Austin (UTC-5 in June)
  const at1am = new Date('2026-06-08T06:00:00Z');  // 1 AM local: sunrise comes next
  const at3pm = new Date('2026-06-08T20:00:00Z');  // 3 PM local: sunset comes next
  const night = nextSunEvent(obs, at1am);
  const afternoon = nextSunEvent(obs, at3pm);
  assert.equal(night.kind, 'sunrise');
  assert.equal(afternoon.kind, 'sunset');
  assert.ok(night.date instanceof Date && afternoon.date instanceof Date, 'both carry Dates');
  assert.ok(night.date.getTime() > at1am.getTime(), 'sunrise is strictly after the reference time');
  assert.ok(afternoon.date.getTime() > at3pm.getTime(), 'sunset is strictly after the reference time');
});

test('PLANET_MOONS lists all 16 rendered moons with unique names', () => {
  assert.equal(PLANET_MOONS.length, 16);
  assert.equal(new Set(PLANET_MOONS.map((m) => m.name)).size, 16, 'names are unique');
  assert.deepEqual(PLANET_MOONS.find((m) => m.name === 'Io'), { planet: 'Jupiter', name: 'Io' });
  assert.deepEqual(PLANET_MOONS.find((m) => m.name === 'Titan'), { planet: 'Saturn', name: 'Titan' });
});

test('nextSunBelowAlt finds the Sun descending through -6° within a day', () => {
  const obs = makeObserver(29.76, -95.37);              // Houston
  const from = new Date('2026-06-11T18:00:00Z');        // ~local noon (UTC-5)
  const when = nextSunBelowAlt(obs, from, -6);
  assert.ok(when instanceof Date && when > from, 'returns a future Date');
  assert.ok(when - from < 24 * 3.6e6, 'within a day');
  // altAzOfBody applies refraction but SearchAltitude is geometric — allow that gap.
  const alt = altAzOfBody(Body.Sun, obs, makeTime(when)).alt;
  assert.ok(Math.abs(alt + 6) < 0.7, `sun alt ${alt} should be ~-6`);
});
