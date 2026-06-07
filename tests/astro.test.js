import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, altAzOfStar, altAzOfBody, precessToDate, makeTime, Body, bodyMagnitude } from '../js/core/astro.js';

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
