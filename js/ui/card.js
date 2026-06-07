import { NAMES } from '../core/constellation-names.js';

const PC_TO_LY = 3.26156;

// B-V color index -> a plain-language color.
export function colorWord(bv) {
  if (bv == null || !Number.isFinite(bv)) return 'white';
  if (bv < 0.0) return 'blue-white';
  if (bv < 0.3) return 'white';
  if (bv < 0.6) return 'yellow-white';
  if (bv < 1.0) return 'yellow';
  if (bv < 1.5) return 'orange';
  return 'red';
}

// Naked-eye / binoculars / telescope from apparent magnitude.
export function easeTag(mag) {
  if (!Number.isFinite(mag)) return 'telescope';
  if (mag <= 5.5) return 'naked eye';
  if (mag <= 9) return 'binoculars';
  return 'telescope';
}

// Parsecs -> light-years (null-safe).
export function distanceLy(distPc) {
  if (distPc == null || !Number.isFinite(distPc) || distPc <= 0) return null;
  return distPc * PC_TO_LY;
}

// "the light you're seeing left it around <year>" (AD) or "... around <n> BC".
export function lightLeftPhrase(distLy, currentYear) {
  if (distLy == null || !Number.isFinite(distLy)) return null;
  const y = Math.round(currentYear - distLy);
  if (y > 0) return `the light you're seeing left it around ${y}`;
  return `the light you're seeing left it around ${Math.abs(y) + 1} BC`; // no year 0
}

// IAU abbreviation -> full constellation name (falls through to the input if unknown).
export function constellationName(abbr) {
  return NAMES[abbr] || abbr || '';
}
