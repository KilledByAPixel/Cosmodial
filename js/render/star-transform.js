// Pure math for the GPU star transform — no GL, no vendor import. The star catalogue's J2000 unit
// vectors are uploaded to the GPU once; per frame, ONE rotation matrix (EQJ -> ENU, from the same
// vendor rotation the Milky Way background uses) plus the forward refraction below turn them into
// apparent sky directions in the vertex shader. transformStarJ2000() is the JS replica of that shader
// math; the oracle test pins it against makeStarAltAz (the trusted CPU path) so the GPU cannot drift.
import { degToRad, radToDeg } from '../core/angles.js';
import { enuToEqjMatrix } from './atmosphere.js';
import { bvToRGB, colorBrightness } from './starstyle.js';

// Saemundsson refraction constants, shared between the JS twin and the GLSL twin below so the
// shader and the tests cannot disagree. At and above -1 deg true altitude this matches Astronomy
// Engine's 'normal' refraction (and JPL Horizons) exactly; below -1 deg the app extrapolates its
// OWN way — see the taper note below.
const REFRACTION = Object.freeze({ K: 1.02, A: 10.3, B: 5.11 });

// Below -1 deg the Saemundsson formula leaves its valid domain (it is singular near -5.1 deg), and
// no "apparent position" is observable down there anyway — every model just extrapolates. JPL
// Horizons freezes the -1 deg value; Astronomy Engine ('normal') tapers it linearly to the nadir.
// Both are value-continuous but kink the SLOPE at -1 deg, so anything animating across the
// boundary takes a sudden course change — Saturn's moons all visibly snapped in unison at
// planet-rise. The app extrapolates C1 instead: R1 * exp(M1 * x * (1 + x/4)) with x = alt + 1,
// where R1/M1 are the formula's value and log-slope AT the boundary (derived, not retuned), so
// value AND slope match seamlessly. The curve keeps rising briefly (as the real formula does on
// its way to the singularity), peaks at -3 deg, then decays smoothly to ~0 long before the nadir.
const ARG1 = degToRad(-1 + REFRACTION.A / (-1 + REFRACTION.B));  // formula argument at -1 deg
const R1 = (REFRACTION.K / Math.tan(ARG1)) / 60;                 // refraction at -1 deg (~0.65 deg)
const M1 = -(REFRACTION.K / 60) * degToRad(1 - REFRACTION.A / (-1 + REFRACTION.B) ** 2)
  / Math.sin(ARG1) ** 2 / R1;                                    // d(ln r)/d(alt) at -1 deg

// Forward refraction (degrees) for a TRUE altitude: apparent = true + refractAltDeg(true).
// This is the app's single refraction curve — the CPU paths (altAzOfStar/altAzOfBody/makeStarAltAz
// in astro.js) and the GPU twins below all use it, so every object class refracts identically.
export function refractAltDeg(altDeg) {
  if (altDeg < -90 || altDeg > 90) return 0;
  if (altDeg < -1) {
    const x = altDeg + 1;
    return R1 * Math.exp(M1 * x * (1 + x / 4));
  }
  return (REFRACTION.K / Math.tan(degToRad(altDeg + REFRACTION.A / (altDeg + REFRACTION.B)))) / 60;
}

// GLSL twin of refractAltDeg, built from the SAME constants (interpolated below) so it cannot drift.
export const REFRACTION_GLSL = `
float refractionDeg(float altDeg) {
  if (altDeg < -90.0 || altDeg > 90.0) return 0.0;
  if (altDeg < -1.0) {
    float x = altDeg + 1.0;
    return float(${R1}) * exp(float(${M1}) * x * (1.0 + 0.25 * x));
  }
  return (${REFRACTION.K} / tan(radians(altDeg + ${REFRACTION.A} / (altDeg + ${REFRACTION.B})))) / 60.0;
}`;

// J2000 equatorial unit vector from catalogue RA/Dec (degrees): +x at RA 0/Dec 0, +z at the north pole.
export function j2000Vec(raDeg, decDeg) {
  const ra = degToRad(raDeg), dec = degToRad(decDeg);
  const c = Math.cos(dec);
  return [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
}

// EQJ -> ENU rotation as a column-major Float32Array(9) for gl.uniformMatrix3fv. The inverse of the
// (orthonormal) ENU -> EQJ rotation is its transpose — no new rotation math.
export function eqjToEnuMatrix(rotHorEqj) {
  const m = enuToEqjMatrix(rotHorEqj);
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

// JS replica of the vertex-shader transform: rotate a J2000 vector into ENU (true direction), then
// lift the true altitude to apparent with forward refraction. Used by the oracle test. The lift
// mirrors the shader exactly: a small-angle rotation by the refraction angle r built from the EXACT
// sin/cos of the true altitude (e2 and hypot(e0,e1)) — not sin(asin(z) + r), whose asin/sin round
// trip is a coarse polynomial on GPUs (~1e-4 rad, sign oscillating) and visibly displaced stars
// vertically vs the CPU ring/labels at deep zoom. asin only feeds refractAltDeg's argument, where
// that error is harmless (dr/dalt is tiny).
export function transformStarJ2000(v, m) {
  const e0 = m[0] * v[0] + m[3] * v[1] + m[6] * v[2];
  const e1 = m[1] * v[0] + m[4] * v[1] + m[7] * v[2];
  const e2 = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
  const h = Math.hypot(e0, e1);
  if (h < 1e-6) return [e0, e1, e2]; // at the zenith/nadir refraction is ~0 and azimuth is undefined
  const trueAlt = radToDeg(Math.asin(Math.max(-1, Math.min(1, e2))));
  const r = degToRad(refractAltDeg(trueAlt));
  const cr = 1 - 0.5 * r * r;                 // cos r to O(r^4); r <= ~0.009 rad
  const sinApp = e2 * cr + h * r;             // sin(trueAlt + r)
  const cosApp = Math.max(h * cr - e2 * r, 0); // cos(trueAlt + r)
  const k = cosApp / h;
  return [e0 * k, e1 * k, sinApp];
}

// Per-star GPU attributes from the RAW catalogue (ra/dec/mag/bv) — built ONCE at boot. Interleaved
// 8-float layout matching the star VAO in starfield-gl.js (FLOATS_PER_STAR there): dir 3 (the FIXED
// J2000 unit vector — the shader transforms it per frame), rgb 3, mag 1, alphaScale 1.
export function buildStarAttributesJ2000(rawStars) {
  const count = rawStars.length;
  const data = new Float32Array(count * 8); // 8 = FLOATS_PER_STAR in starfield-gl.js
  for (let i = 0; i < count; i++) {
    const s = rawStars[i];
    const d = j2000Vec(s.ra, s.dec);
    const c = bvToRGB(s.bv);
    const o = i * 8;
    data[o] = d[0]; data[o + 1] = d[1]; data[o + 2] = d[2];
    data[o + 3] = c.r / 255; data[o + 4] = c.g / 255; data[o + 5] = c.b / 255;
    data[o + 6] = s.mag;
    data[o + 7] = colorBrightness(c);
  }
  return { data, count };
}
