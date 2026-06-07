import { clamp } from '../core/angles.js';

const BRIGHTEST_MAG = -1.5; // ~Sirius; the bright end of the magnitude normalization range
const REF_FOV = 60;         // baseline (naked-eye) FOV; star zoom-scale is 1 here
const MAX_ZOOM_SCALE = 4;   // cap so zoomed-in stars stay dots, not big blobs

// Apparent magnitude -> point radius in pixels. Brighter (smaller mag) -> larger.
export function magnitudeToRadius(mag, { maxMag = 7, minR = 0.6, maxR = 3.2 } = {}) {
  const t = clamp((maxMag - mag) / (maxMag - BRIGHTEST_MAG), 0, 1); // mag in [BRIGHTEST_MAG, maxMag] -> t in [1, 0]
  return minR + (maxR - minR) * Math.pow(t, 0.8);
}

// Apparent magnitude -> opacity (0..1). Stars are kept near max brightness on purpose: magnitude
// is conveyed by SIZE (magnitudeToRadius), not by dimming. The 0.9 floor means nearly every star
// renders at ~full brightness; a deep-red star still reads slightly dimmer because its blackbody
// RGB has lower green/blue channels.
export function magnitudeToOpacity(mag, { maxMag = 7 } = {}) {
  return clamp(1 - mag / (maxMag + 3), 0.9, 1);
}

// Star-size multiplier as you zoom in: 1 at the widest FOV, growing sub-linearly (sqrt of the
// zoom factor) so zooming feels like magnification, capped so stars never balloon.
export function zoomScale(fov, { refFov = REF_FOV, maxScale = MAX_ZOOM_SCALE } = {}) {
  return clamp(Math.sqrt(refFov / fov), 1, maxScale);
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
