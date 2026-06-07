import { clamp } from '../core/angles.js';

const BRIGHTEST_MAG = -1.5; // ~Sirius; the bright end of the magnitude normalization range

// Apparent magnitude -> point radius in pixels. Brighter (smaller mag) -> larger.
export function magnitudeToRadius(mag, { maxMag = 6, minR = 0.5, maxR = 3.2 } = {}) {
  const t = clamp((maxMag - mag) / (maxMag - BRIGHTEST_MAG), 0, 1); // mag in [BRIGHTEST_MAG, maxMag] -> t in [1, 0]
  return minR + (maxR - minR) * Math.pow(t, 0.8);
}

// Apparent magnitude -> opacity (0..1).
export function magnitudeToOpacity(mag, { maxMag = 6 } = {}) {
  return clamp(1 - mag / (maxMag + 1), 0.25, 1);
}

// Color temperature (Kelvin) -> {r,g,b} 0..255 (Tanner Helland approximation).
function temperatureToRGB(kelvin) {
  const t = kelvin / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
  };
}

// B-V color index -> {r,g,b}. Uses Ballesteros (2012) B-V -> temperature, then blackbody RGB.
export function bvToRGB(bv) {
  if (bv == null || !Number.isFinite(bv)) bv = 0.0;
  bv = clamp(bv, -0.4, 2.0);
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  return temperatureToRGB(t);
}
