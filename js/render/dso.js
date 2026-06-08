import { degToRad, clamp } from '../core/angles.js';

const MIN_GLOW_R = 2;        // px floor so tiny objects still show as a faint dot
const MAX_ALPHA = 0.6;       // even the brightest DSO is a faint glow, never a solid blob

// On-screen radius (px) from real angular size (arcmin), via the same focal projection as
// markerRadius — so a DSO grows as you zoom in (unlike a magnitude-sized star). Floored.
export function dsoScreenRadius(sizeArcmin, cam) {
  const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
  const radiusDeg = (sizeArcmin / 60) / 2; // arcmin diameter -> degree radius
  return Math.max(focal * Math.tan(degToRad(radiusDeg)), MIN_GLOW_R);
}

// Peak glow alpha from a surface-brightness proxy: sb = mag + 2.5*log10(area_arcmin2). Spreading the
// same total magnitude over more area raises sb (dimmer per pixel). Mapped sb≈[6..14] -> alpha[MAX..0].
export function dsoAlpha(mag, sizeArcmin) {
  const area = Math.PI * (sizeArcmin / 2) ** 2;
  const sb = mag + 2.5 * Math.log10(Math.max(area, 1));
  return clamp(((14 - sb) / 8) * MAX_ALPHA, 0, MAX_ALPHA);
}

const SYMBOLS = { galaxy: 'ellipse', nebula: 'box', 'open cluster': 'dashed-circle', 'globular cluster': 'cross-circle' };

// Cartographic outline shape for a DSO type (atlas convention). Unknown -> 'box'.
export function dsoSymbol(type) { return SYMBOLS[type] || 'box'; }
