// Pure math for Saturn's rings — no GL. The body-sphere fragment shader replicates ringPointRadius()
// in GLSL (plane intersection in the screen-space disc frame); these twins are unit-tested so the
// geometry can't silently drift. Radii are in Saturn equatorial (globe) radii.
import { degToRad } from '../core/angles.js';

// C-ring inner edge to A-ring outer edge. Tuned against Stellarium (Cassini division placement);
// must match the radial crop of data/saturn-rings.webp (u = 0 at INNER, u = 1 at OUTER).
export const SATURN_RING = Object.freeze({ INNER: 1.24, OUTER: 2.27, TEX: 'saturn-rings' });

// sin(B): the ring opening as seen from Earth. bodyDir = ENU unit vector Earth->body; poleDir = ENU unit
// vector toward the body's north pole (effectively the pole AXIS — the pole point is at infinity).
// Positive = the north face of the rings is toward Earth; ~0 = edge-on (ring-plane crossing).
export function ringOpening(bodyDir, poleDir) {
  return -(bodyDir[0] * poleDir[0] + bodyDir[1] * poleDir[1] + bodyDir[2] * poleDir[2]);
}

// JS twin of the shader's ring lookup: for a screen point (x, y) in globe radii (+x right, +y up),
// the radial distance (in globe radii) of the ring-plane point under that pixel, for a pole at screen
// angle northAngleDeg (CW from up) and opening tilt = sin(B). Orthographic (planets are tiny on screen).
// Edge-on (tilt ~ 0) has no plane intersection off the ring line -> Infinity.
export function ringPointRadius(x, y, northAngleDeg, tilt) {
  const a = degToRad(northAngleDeg);
  const ct = Math.sqrt(Math.max(0, 1 - tilt * tilt));
  const p = [Math.sin(a) * ct, Math.cos(a) * ct, tilt];      // ring-plane normal in the disc frame
  if (Math.abs(p[2]) < 1e-4) return Infinity;
  const t = -(x * p[0] + y * p[1]) / p[2];                   // view ray (x, y, t) meets the plane
  return Math.hypot(x, y, t);
}
