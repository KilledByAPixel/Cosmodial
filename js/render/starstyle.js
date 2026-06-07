import { clamp } from '../core/angles.js';

const REF_FOV = 60;           // baseline (naked-eye) FOV; zoom scale is 1 here
const MAX_ZOOM_SCALE = 4;     // cap so zoomed-in stars don't balloon

// --- Star size/brightness tunables (tweak to taste against a real sky chart) ---
const STAR_BASE_R = 2.4;      // radius (px) of a magnitude-0 star at the widest FOV
const STAR_MAG_SHRINK = 0.58; // radius multiplier per +1 magnitude (each fainter mag is smaller)
const STAR_MAX_R = 5;         // cap radius (px, at base zoom) so the brightest stars pop, not bloat
const STAR_MIN_R = 0.7;       // below this, stop shrinking and fade via alpha instead
const STAR_DIM_EXP = 1.5;     // how steeply sub-pixel (faint) stars fade out

// Zoom multiplier: 1 at the widest FOV, growing sub-linearly so zooming magnifies, capped.
export function zoomScale(fov, { refFov = REF_FOV, maxScale = MAX_ZOOM_SCALE } = {}) {
  return clamp(Math.sqrt(refFov / fov), 1, maxScale);
}

// A star's rendered { radius, alpha } from magnitude. Brightness is conveyed mostly by SIZE: bright
// stars are large and pop; each fainter magnitude is exponentially smaller. Once a star would be
// smaller than STAR_MIN_R it stops shrinking and instead fades via alpha — so faint stars are tiny
// dim specks (not over-large, not abruptly gone). `zoom` (from zoomScale) magnifies the size, so
// zooming in reveals faint stars as larger, brighter dots.
export function starSize(mag, zoom = 1) {
  let radius = STAR_BASE_R * Math.pow(STAR_MAG_SHRINK, mag) * zoom;
  radius = Math.min(radius, STAR_MAX_R * zoom);
  let alpha = 1;
  if (radius < STAR_MIN_R) {
    alpha = clamp(Math.pow(radius / STAR_MIN_R, STAR_DIM_EXP), 0, 1);
    radius = STAR_MIN_R;
  }
  return { radius, alpha };
}

// Opacity multiplier from a star's RGB colour: white stars brightest, saturated stars a touch
// dimmer (a saturated dot otherwise reads as harshly bright). Multiplies the magnitude alpha.
export function colorBrightness({ r, g, b }, { base = 0.9, colorPenalty = 0.3 } = {}) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max > 0 ? (max - min) / max : 0;
  return clamp(base - sat * colorPenalty, 0, 1);
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
