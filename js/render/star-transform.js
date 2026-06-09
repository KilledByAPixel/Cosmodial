// Pure math for the GPU star transform — no GL, no vendor import. The star catalogue's J2000 unit
// vectors are uploaded to the GPU once; per frame, ONE rotation matrix (EQJ -> ENU, from the same
// vendor rotation the Milky Way background uses) plus the forward refraction below turn them into
// apparent sky directions in the vertex shader. transformStarJ2000() is the JS replica of that shader
// math; the oracle test pins it against makeStarAltAz (the trusted CPU path) so the GPU cannot drift.
import { degToRad, radToDeg } from '../core/angles.js';
import { enuToEqjMatrix } from './atmosphere.js';
import { bvToRGB, colorBrightness } from './starstyle.js';

// Saemundsson refraction constants, shared between the JS twin and the GLSL twin below so the
// shader and the tests cannot disagree. Matches Astronomy Engine's 'normal' refraction exactly
// (clamped at -1 deg true altitude, linear taper to 0 at the nadir).
const REFRACTION = Object.freeze({ K: 1.02, A: 10.3, B: 5.11 });

// Forward refraction (degrees) for a TRUE altitude: apparent = true + refractAltDeg(true).
// This is the direction Horizon('normal') applies — a single evaluation, no iteration.
export function refractAltDeg(altDeg) {
  if (altDeg < -90 || altDeg > 90) return 0;
  const hd = Math.max(altDeg, -1.0);
  let r = (REFRACTION.K / Math.tan(degToRad(hd + REFRACTION.A / (hd + REFRACTION.B)))) / 60;
  if (altDeg < -1.0) r *= (altDeg + 90) / 89;
  return r;
}

// GLSL twin of refractAltDeg, built from the SAME constants (interpolated below) so it cannot drift.
export const REFRACTION_GLSL = `
float refractionDeg(float altDeg) {
  if (altDeg < -90.0 || altDeg > 90.0) return 0.0;
  float hd = max(altDeg, -1.0);
  float r = (${REFRACTION.K} / tan(radians(hd + ${REFRACTION.A} / (hd + ${REFRACTION.B})))) / 60.0;
  if (altDeg < -1.0) r *= (altDeg + 90.0) / 89.0;
  return r;
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
// lift the true altitude to apparent with forward refraction. Used by the oracle test.
export function transformStarJ2000(v, m) {
  const e0 = m[0] * v[0] + m[3] * v[1] + m[6] * v[2];
  const e1 = m[1] * v[0] + m[4] * v[1] + m[7] * v[2];
  const e2 = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
  const trueAlt = radToDeg(Math.asin(Math.max(-1, Math.min(1, e2))));
  const app = degToRad(trueAlt + refractAltDeg(trueAlt));
  const h = Math.hypot(e0, e1);
  if (h < 1e-6) return [e0, e1, e2]; // at the zenith/nadir refraction is ~0 and azimuth is undefined
  const k = Math.cos(app) / h;
  return [e0 * k, e1 * k, Math.sin(app)];
}

// Per-star GPU attributes from the RAW catalogue (ra/dec/mag/bv) — built ONCE at boot. Identical
// interleaved layout to buildStarAttributes in starfield-gl.js (dir 3, rgb 3, mag 1, alphaScale 1),
// except dir is the FIXED J2000 vector instead of a precomputed ENU direction.
export function buildStarAttributesJ2000(rawStars) {
  const count = rawStars.length;
  const data = new Float32Array(count * 8);
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
