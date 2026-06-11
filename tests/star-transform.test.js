import { test } from 'node:test';
import assert from 'node:assert/strict';
import { j2000Vec, eqjToEnuMatrix, refractAltDeg, transformStarJ2000, buildStarAttributesJ2000, REFRACTION_GLSL } from '../js/render/star-transform.js';
import { bvToRGB, colorBrightness } from '../js/render/starstyle.js';
import { makeObserver, makeTime, makeStarAltAz, horToEqjRotation } from '../js/core/astro.js';
import { vec } from '../js/core/projection.js';

// Angle between two directions, scale-robust: the transform's output length inherits the float32
// rotation matrix's ~1e-8 length error (harmless — projection is scale-invariant), and a bare
// acos(dot) would misread that as ~0.008 deg of angle.
const sepDeg = (a, b) => {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

test('oracle: the GPU transform replica matches makeStarAltAz across the whole sphere', () => {
  const cases = [
    { lat: 40.0, lng: -74.0, date: new Date('2026-06-09T04:00:00Z') },
    { lat: -33.9, lng: 18.4, date: new Date('2026-12-21T22:00:00Z') },
  ];
  let n = 0;
  for (const c of cases) {
    const observer = makeObserver(c.lat, c.lng);
    const time = makeTime(c.date);
    const toAltAz = makeStarAltAz(observer, time);
    const m = eqjToEnuMatrix(horToEqjRotation(observer, time));
    for (let ra = 0; ra < 360; ra += 30) {
      for (let dec = -85; dec <= 85; dec += 17) {
        const aa = toAltAz(ra, dec);
        const gpu = transformStarJ2000(j2000Vec(ra, dec), m);
        const d = sepDeg(gpu, vec(aa.az, aa.alt));
        n++;
        assert.ok(d < 0.001, `ra ${ra} dec ${dec} lat ${c.lat}: separation ${d} deg`);
      }
    }
  }
  assert.ok(n >= 264, `covered ${n} grid points`);
});

test('eqjToEnuMatrix is orthonormal', () => {
  const m = eqjToEnuMatrix(horToEqjRotation(makeObserver(40, -74), makeTime(new Date('2026-06-09T04:00:00Z'))));
  const col = (c) => [m[c * 3], m[c * 3 + 1], m[c * 3 + 2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(dot(col(c), col(c)) - 1) < 1e-6, `col ${c} unit`);
  assert.ok(Math.abs(dot(col(0), col(1))) < 1e-6 && Math.abs(dot(col(0), col(2))) < 1e-6 && Math.abs(dot(col(1), col(2))) < 1e-6, 'orthogonal');
});

test('refractAltDeg: ~0.48 deg at the horizon, ~0 at the zenith, 0 at the nadir', () => {
  assert.ok(refractAltDeg(0) > 0.4 && refractAltDeg(0) < 0.6, `horizon ${refractAltDeg(0)}`);
  assert.ok(Math.abs(refractAltDeg(89)) < 0.001, `zenith ${refractAltDeg(89)}`);
  assert.ok(Math.abs(refractAltDeg(-90)) < 1e-12, `nadir ${refractAltDeg(-90)}`);
  assert.ok(refractAltDeg(-45) > 0 && refractAltDeg(-45) < refractAltDeg(-1), 'taper below the horizon');
});

test('REFRACTION_GLSL embeds the same constants as the JS twin', () => {
  for (const lit of ['1.02', '10.3', '5.11', '89.0']) assert.ok(REFRACTION_GLSL.includes(lit), `missing ${lit}`);
});

test('buildStarAttributesJ2000: layout parity (colour/mag/alpha) + J2000 direction', () => {
  const a = buildStarAttributesJ2000([{ ra: 0, dec: 0, mag: 2.5, bv: 0.65 }]);
  assert.equal(a.count, 1);
  const c = bvToRGB(0.65);
  assert.deepEqual(
    [...a.data.slice(3, 8)],
    [Math.fround(c.r / 255), Math.fround(c.g / 255), Math.fround(c.b / 255), Math.fround(2.5), Math.fround(colorBrightness(c))],
    'colour/mag/alphaScale matches expected values',
  );
  assert.ok(sepDeg([a.data[0], a.data[1], a.data[2]], [1, 0, 0]) < 1e-4, 'RA 0 / Dec 0 -> +x');
  const p = buildStarAttributesJ2000([{ ra: 123, dec: 90, mag: 1, bv: 0 }]);
  assert.ok(sepDeg([p.data[0], p.data[1], p.data[2]], [0, 0, 1]) < 1e-4, 'Dec 90 -> +z (north pole)');
});
