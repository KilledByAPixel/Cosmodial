import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airmass, extinction, skyParams, milkyWayZoomFade, enuToEqjMatrix, enuToGalMatrix, belowHorizonFade, spaceSkyParams, skyVeil } from '../js/render/atmosphere.js';
import { makeObserver, makeTime, makeStarAltAz, horToEqjRotation, eqjToGalRotation } from '../js/core/astro.js';
import * as Astronomy from '../js/vendor/astronomy.js';
import { vec } from '../js/core/projection.js';
import { angularSep } from '../js/core/angles.js';

// Apply a column-major mat3 (Float32Array(9), index = col*3 + row) to a 3-vector.
function applyMat3(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

test('airmass is ~1 at the zenith and grows toward the horizon', () => {
  assert.ok(Math.abs(airmass(90) - 1) < 0.01, 'zenith airmass ~= 1');
  assert.ok(airmass(30) > airmass(60), 'lower altitude => more air mass');
  assert.ok(airmass(10) > airmass(30));
  // Kasten-Young gives ~38 at the true horizon; just assert it's large and finite.
  const h = airmass(0);
  assert.ok(Number.isFinite(h) && h > 30 && h < 45, `horizon airmass in range, got ${h}`);
});

test('airmass clamps below the horizon (no negative/NaN)', () => {
  const below = airmass(-5);
  assert.ok(Number.isFinite(below) && below > 0, 'below-horizon airmass stays finite & positive');
  assert.equal(below, airmass(0), 'clamps to the horizon value');
});

test('extinction is no-op at the zenith', () => {
  const [r, g, b] = extinction(90);
  assert.ok(Math.abs(r - 1) < 1e-3 && Math.abs(g - 1) < 1e-3 && Math.abs(b - 1) < 1e-3,
    'zenith stars are unattenuated');
});

test('extinction dims and reddens toward the horizon', () => {
  const zen = extinction(90);
  const low = extinction(8);
  // Overall dimming: every channel transmits less than at the zenith.
  for (let i = 0; i < 3; i++) assert.ok(low[i] < zen[i], `channel ${i} dims at low altitude`);
  // Reddening: blue is extinguished more than green more than red, so red transmits most.
  assert.ok(low[0] > low[1] && low[1] > low[2], 'transmission r > g > b (i.e. light reddens)');
  // All transmissions stay in [0,1].
  for (const t of low) assert.ok(t >= 0 && t <= 1, 'transmission within [0,1]');
});

test('extinction is monotonic in altitude', () => {
  // Green-channel transmission should rise monotonically from horizon to zenith.
  let prev = -1;
  for (const alt of [5, 15, 30, 50, 70, 90]) {
    const g = extinction(alt)[1];
    assert.ok(g > prev, `transmission increases with altitude (alt=${alt})`);
    prev = g;
  }
});

test('skyParams: daytime sky is blue with no Milky Way and faded stars', () => {
  const p = skyParams(30);
  assert.ok(p.zenithColor[2] > p.zenithColor[0], 'day zenith is blue (b > r)');
  assert.ok(p.mwVisibility < 0.02, 'no Milky Way in daylight');
  assert.ok(p.starDayFade < 0.02, 'stars faded out in daylight');
});

test('skyParams: deep night is near-black with full Milky Way and full stars', () => {
  const p = skyParams(-30);
  for (const c of p.zenithColor) assert.ok(c < 0.02, 'night zenith near-black');
  assert.ok(p.mwVisibility > 0.98, 'Milky Way fully visible when dark');
  assert.ok(p.starDayFade > 0.98, 'stars fully visible at night');
});

test('skyParams: civil twilight is warm at the horizon with a sun glow', () => {
  const p = skyParams(-6);
  assert.ok(p.horizonColor[0] > p.horizonColor[2], 'twilight horizon is warm (r > b)');
  assert.ok(p.sunGlowStrength > 0, 'a sun glow is present at twilight');
});

test('skyParams: outputs are finite and in range across the day', () => {
  for (let sunAlt = -40; sunAlt <= 40; sunAlt += 2) {
    const p = skyParams(sunAlt);
    for (const key of ['zenithColor', 'horizonColor', 'sunGlowColor', 'belowZenithColor', 'belowHorizonColor']) {
      for (const c of p[key]) assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, `${key} in [0,1] at sunAlt=${sunAlt}`);
    }
    for (const key of ['sunGlowStrength', 'mwVisibility', 'horizonAirglow', 'starDayFade', 'belowAirglow']) {
      assert.ok(Number.isFinite(p[key]) && p[key] >= 0 && p[key] <= 1, `${key} in [0,1] at sunAlt=${sunAlt}`);
    }
  }
});

test('skyParams: the below-horizon look is pinned at full night, whatever the Sun is doing', () => {
  // The lower hemisphere always renders as astronomical night — the below palette must not vary
  // with sun altitude, and at actual full night it must equal the live palette (so there is no
  // visible seam at the horizon once it IS night).
  const night = skyParams(-30); // astronomically dark
  for (const sunAlt of [30, 5, -6, -12, -30]) {
    const p = skyParams(sunAlt);
    assert.deepEqual(p.belowZenithColor, night.belowZenithColor, `belowZenithColor constant at sunAlt=${sunAlt}`);
    assert.deepEqual(p.belowHorizonColor, night.belowHorizonColor, `belowHorizonColor constant at sunAlt=${sunAlt}`);
    assert.equal(p.belowAirglow, night.belowAirglow, `belowAirglow constant at sunAlt=${sunAlt}`);
  }
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(night.zenithColor[k] - night.belowZenithColor[k]) < 1e-9, 'night zenith == below zenith');
    assert.ok(Math.abs(night.horizonColor[k] - night.belowHorizonColor[k]) < 1e-9, 'night horizon == below horizon');
  }
  assert.ok(Math.abs(night.horizonAirglow - night.belowAirglow) < 1e-9, 'night airglow == below airglow');
});

test('skyParams: Milky Way and stars fade in monotonically as the Sun sets', () => {
  let prevMw = -1, prevStar = -1;
  for (const sunAlt of [20, 5, 0, -6, -12, -18, -30]) {
    const p = skyParams(sunAlt);
    assert.ok(p.mwVisibility >= prevMw, `mwVisibility non-decreasing as sun sets (sunAlt=${sunAlt})`);
    assert.ok(p.starDayFade >= prevStar, `starDayFade non-decreasing as sun sets (sunAlt=${sunAlt})`);
    prevMw = p.mwVisibility;
    prevStar = p.starDayFade;
  }
});

// A spread of bright stars (J2000 RA/Dec, degrees) across the whole sky, so whatever the date/time
// several are guaranteed above 30 deg for a mid-northern observer.
const BRIGHT_STARS = [
  { name: 'Sirius', ra: 101.287, dec: -16.716 },
  { name: 'Vega', ra: 279.234, dec: 38.784 },
  { name: 'Arcturus', ra: 213.915, dec: 19.182 },
  { name: 'Capella', ra: 79.172, dec: 45.998 },
  { name: 'Aldebaran', ra: 68.980, dec: 16.509 },
  { name: 'Spica', ra: 201.298, dec: -11.161 },
  { name: 'Altair', ra: 297.696, dec: 8.868 },
  { name: 'Deneb', ra: 310.358, dec: 45.280 },
  { name: 'Pollux', ra: 116.329, dec: 28.026 },
  { name: 'Regulus', ra: 152.093, dec: 11.967 },
  { name: 'Betelgeuse', ra: 88.793, dec: 7.407 },
  { name: 'Antares', ra: 247.352, dec: -26.432 },
];

test('enuToEqjMatrix inverts the forward star transform (J2000 round-trip)', () => {
  // Real app forward path: J2000 RA/Dec -> alt/az (with refraction). The matrix is the geometric
  // inverse, so for stars well above the horizon (refraction << tolerance) it recovers the input.
  const observer = makeObserver(40.7, -74.0);
  const time = makeTime(new Date('2026-06-08T06:00:00Z'));
  const toAltAz = makeStarAltAz(observer, time);
  const M = enuToEqjMatrix(horToEqjRotation(observer, time));

  let checked = 0;
  for (const s of BRIGHT_STARS) {
    const { az, alt } = toAltAz(s.ra, s.dec);
    if (alt < 30) continue; // refraction grows near the horizon; only test high stars
    const eqj = applyMat3(M, vec(az, alt));
    let ra = (Math.atan2(eqj[1], eqj[0]) * 180) / Math.PI;
    if (ra < 0) ra += 360;
    const dec = (Math.atan2(eqj[2], Math.hypot(eqj[0], eqj[1])) * 180) / Math.PI;
    assert.ok(angularSep(ra, s.ra) < 0.1, `${s.name} RA round-trips (${ra.toFixed(3)} vs ${s.ra})`);
    assert.ok(Math.abs(dec - s.dec) < 0.1, `${s.name} Dec round-trips (${dec.toFixed(3)} vs ${s.dec})`);
    checked++;
  }
  assert.ok(checked >= 3, `validated enough high-altitude stars (got ${checked})`);
});

test('enuToEqjMatrix is orthonormal (a pure rotation)', () => {
  const observer = makeObserver(-33.9, 151.2); // southern hemisphere, to exercise the other sign
  const time = makeTime(new Date('2026-01-15T12:00:00Z'));
  const M = enuToEqjMatrix(horToEqjRotation(observer, time));
  const col = (c) => [M[c * 3], M[c * 3 + 1], M[c * 3 + 2]];
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(d(col(c), col(c)) - 1) < 1e-6, `column ${c} is unit length`);
  assert.ok(Math.abs(d(col(0), col(1))) < 1e-6, 'columns 0,1 orthogonal');
  assert.ok(Math.abs(d(col(0), col(2))) < 1e-6, 'columns 0,2 orthogonal');
  assert.ok(Math.abs(d(col(1), col(2))) < 1e-6, 'columns 1,2 orthogonal');
});

test('enuToGalMatrix sends known sky directions to their galactic coordinates', () => {
  // Geometry only (no horizon/refraction): map a J2000 RA/Dec to a geometric ENU ray via the vendor,
  // then through our matrix to galactic l/b, and check famous landmarks land where they belong.
  const observer = makeObserver(19.8, -155.5); // any observer works — this is a fixed-frame rotation
  const time = makeTime(new Date('2026-06-08T06:00:00Z'));
  const M = enuToGalMatrix(horToEqjRotation(observer, time), eqjToGalRotation());
  const D2R = Math.PI / 180;
  const galOf = (raDeg, decDeg) => {
    const ra = raDeg * D2R, dec = decDeg * D2R;
    const eqj = { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec), t: time };
    const hor = Astronomy.RotateVector(Astronomy.Rotation_EQJ_HOR(time, observer), eqj); // [N,W,Z]
    const g = applyMat3(M, [-hor.y, hor.x, hor.z]); // ENU = [E=-W, N, U]
    return {
      l: ((Math.atan2(g[1], g[0]) / D2R) + 360) % 360,
      b: Math.asin(Math.max(-1, Math.min(1, g[2]))) / D2R,
    };
  };
  const gc = galOf(266.405, -28.936); // galactic centre -> l=0, b=0
  assert.ok(angularSep(gc.l, 0) < 0.2, `galactic centre longitude ~0 (got ${gc.l.toFixed(2)})`);
  assert.ok(Math.abs(gc.b) < 0.2, `galactic centre latitude ~0 (got ${gc.b.toFixed(2)})`);
  const ngp = galOf(192.8595, 27.1283); // north galactic pole -> b=+90
  assert.ok(Math.abs(ngp.b - 90) < 0.2, `north galactic pole latitude ~90 (got ${ngp.b.toFixed(2)})`);
  const anti = galOf(86.405, 28.936); // galactic anticentre -> l=180
  assert.ok(angularSep(anti.l, 180) < 0.3, `galactic anticentre longitude ~180 (got ${anti.l.toFixed(2)})`);
});

test('belowHorizonFade: 0 at/above the horizon, 1 by 10° below, eased between', () => {
  assert.equal(belowHorizonFade(45), 0, 'aiming up — lower hemisphere hidden');
  assert.equal(belowHorizonFade(0), 0, 'exactly at the horizon — still hidden');
  assert.equal(belowHorizonFade(-10), 1, 'fully faded in 10° below');
  assert.equal(belowHorizonFade(-89), 1, 'stays fully on below that');
  const mid = belowHorizonFade(-5);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, 'smoothstep midpoint is exactly 0.5');
  let prev = 0;
  for (let alt = 0; alt >= -12; alt -= 0.5) {
    const f = belowHorizonFade(alt);
    assert.ok(f >= prev, `fade never decreases while tilting down (alt ${alt})`);
    prev = f;
  }
});

test('spaceSkyParams: black sky, full stars/Milky Way, extinction off', () => {
  const p = spaceSkyParams();
  assert.deepEqual(p.zenithColor, [0, 0, 0]);
  assert.deepEqual(p.horizonColor, [0, 0, 0]);
  assert.equal(p.sunGlowStrength, 0);
  assert.equal(p.horizonAirglow, 0);
  assert.equal(p.mwVisibility, 1, 'Milky Way always visible in space view');
  assert.equal(p.starDayFade, 1, 'no daytime star wash-out in space view');
  assert.equal(p.extinction, 0, 'no horizon dimming/reddening in space view');
  assert.deepEqual(p.belowZenithColor, [0, 0, 0], 'space view is black below the horizon too');
  assert.deepEqual(p.belowHorizonColor, [0, 0, 0]);
  assert.equal(p.belowAirglow, 0, 'no airglow anywhere in space view');
});

test('skyParams always applies extinction (space view is the only exception)', () => {
  assert.equal(skyParams(-30).extinction, 1);
  assert.equal(skyParams(20).extinction, 1);
});

test('skyVeil: sky-blue by day, near-black at night, exactly zero in space view', () => {
  const dir = vec(0, 45);                       // looking north, 45 deg up — away from the sun below
  const day = skyVeil(dir, vec(180, 30), skyParams(30));
  assert.ok(day[2] > day[0] && day[2] > 0.2, 'daytime veil is blue and substantial (washes the Moon shadow sky-blue)');
  const night = skyVeil(dir, vec(180, -30), skyParams(-30));
  for (const c of night) assert.ok(c < 0.06, `night veil near-black (got ${c})`);
  assert.deepEqual(skyVeil(dir, vec(180, -30), spaceSkyParams()), [0, 0, 0], 'no atmosphere -> no veil');
  for (const v of [day, night]) for (const c of v) assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, 'veil in [0,1]');
});

test('skyVeil: below the horizon the veil is the pinned night look even at midday', () => {
  const v = skyVeil(vec(0, -30), vec(180, 30), skyParams(30));
  for (const c of v) assert.ok(c < 0.06, `below-horizon veil stays night-dark at midday (got ${c})`);
});

test('milkyWayZoomFade: full at wide FOV, gone when zoomed in', () => {
  assert.equal(milkyWayZoomFade(60), 1, 'full strength at wide FOV');
  assert.equal(milkyWayZoomFade(10), 0, 'gone when zoomed in');
  const mid = milkyWayZoomFade(38);
  assert.ok(mid > 0 && mid < 1, 'partial in between');
  // Monotonic non-decreasing with FOV.
  let prev = -1;
  for (const fov of [5, 15, 25, 35, 45, 60, 90]) {
    const f = milkyWayZoomFade(fov);
    assert.ok(f >= prev, `non-decreasing with FOV (fov=${fov})`);
    prev = f;
  }
});
