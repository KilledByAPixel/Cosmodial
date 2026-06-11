// Pure Moon-orientation math (no vendor import). Computes, IN SCREEN SPACE, which way the Moon's bright
// limb (toward the Sun) and its north pole point — by projecting those directions through the camera.
// Doing it per-frame in screen space makes it correct under any pan, roll, zoom and projection
// distortion, and it rotates as the camera moves (the old analytic celestial-frame angles could not).
// Consumed each frame by the GL Moon pass. Unit-tested in tests/moon.test.js.
import { radToDeg } from './angles.js';
import { cameraBasis, dot, norm, MIN_VIS_Z } from './projection.js';

// A unit ENU direction nudged a small step from `fromVec` toward `towardVec` (the on-sphere direction
// from `from` toward `to`). Lets us read which way the Sun / the Moon's pole lies *from the Moon*.
export function nudgedToward(fromVec, towardVec, eps = 0.02) {
  const d = dot(fromVec, towardVec);
  const raw = [towardVec[0] - d * fromVec[0], towardVec[1] - d * fromVec[1], towardVec[2] - d * fromVec[2]];
  if (raw[0] === 0 && raw[1] === 0 && raw[2] === 0) return fromVec.slice(); // same/antipodal: no preferred tangent
  const t = norm(raw);
  return norm([fromVec[0] + eps * t[0], fromVec[1] + eps * t[1], fromVec[2] + eps * t[2]]);
}

// Project an ENU unit vector to screen pixels {x,y} (y grows DOWN) for camera basis B, or null if
// culled near the antipode. Mirrors createProjector()/the star shader (stereographic).
function projectVec(B, p) {
  const z = dot(p, B.fwd);
  if (z <= MIN_VIS_Z) return null;
  const k = (2 * B.focal) / (1 + z);
  return { x: B.cx + k * dot(p, B.right), y: B.cy - k * dot(p, B.up) };
}

// Screen angle (degrees, clockwise from screen-up) of the direction from screen point `a` to `b`
// (projector coords, y down). Matches the Moon shader's dirFromUp(a) = (sin a, cos a) in +y-up space.
export function screenAngleCWFromUp(a, b) {
  return radToDeg(Math.atan2(b.x - a.x, -(b.y - a.y)));
}

// Great-circle separation (degrees) between two alt/az positions (degrees).
export function altazSepDeg(a, b) {
  const d2r = Math.PI / 180;
  const c = Math.sin(a.alt * d2r) * Math.sin(b.alt * d2r)
    + Math.cos(a.alt * d2r) * Math.cos(b.alt * d2r) * Math.cos((a.az - b.az) * d2r);
  return radToDeg(Math.acos(Math.max(-1, Math.min(1, c))));
}

// Fraction (0..1) of the Sun's disc covered by the Moon's, from their angular separation and radii
// (all degrees). Flat two-circle overlap — exact to ~1e-5 at the half-degree scales involved.
// Drives the live solar-eclipse look: Sun glow dimming, corona fade-in, sky darkening.
export function discObscuration(sepDeg, rSunDeg, rMoonDeg) {
  const d = sepDeg, R = rSunDeg, r = rMoonDeg;
  if (d >= R + r) return 0;                                  // discs don't touch
  if (d <= Math.abs(R - r)) return r >= R ? 1 : (r * r) / (R * R); // one disc inside the other
  const a1 = Math.acos((d * d + r * r - R * R) / (2 * d * r));     // partial overlap: lens area
  const a2 = Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const lens = r * r * a1 + R * R * a2
    - 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return lens / (Math.PI * R * R);
}

// A body's bright-limb and north-pole angles on screen (degrees, CW from screen-up) for a camera.
// dirs are unit ENU vectors: the body centre, a direction toward the Sun, and toward the body's north
// pole. Falls back to 0 if a point projects behind the camera (the Moon pass culls it anyway).
export function bodyScreenOrientation(cam, moonDir, sunDir, poleDir) {
  const B = cameraBasis(cam);
  const m = projectVec(B, moonDir);
  const s = projectVec(B, nudgedToward(moonDir, sunDir));
  const n = projectVec(B, nudgedToward(moonDir, poleDir));
  return {
    brightLimbAngle: (m && s) ? screenAngleCWFromUp(m, s) : 0,
    northAngle: (m && n) ? screenAngleCWFromUp(m, n) : 0,
  };
}

// FOV (deg) that frames a planet + its moon sepDeg apart: 4x the separation puts the pair
// comfortably in view, clamped so tight systems (Phobos) still resolve the planet's disc and
// wide ones (Iapetus) stay close. Tuned by eye.
export function frameFovDeg(sepDeg) {
  return Math.min(2, Math.max(0.15, sepDeg * 4));
}

// FOV (deg) at which a planet's disc outgrows its glow dot (the sphere-pass gate in main.js:
// disc pixels = angularRadiusDeg * (π/180) * focalPx(fov) * scale * span vs the dot's pixel
// radius), with a margin so the disc clears the gate comfortably rather than grazing it.
// focalPx spans the shorter screen dimension, so compute against that.
//
// Derived by inverting focalPx exactly:
//   focalPx(fov, w, h) = (minDim/2) / (2*tan(fov_rad/4))
// Gate: angularRadiusDeg*(π/180)*focalPx*scale*span = margin*dotRadiusPx
// => tan(fov_rad/4) = minDim * angularRadiusDeg*(π/180) * scale * span / (4 * margin * dotRadiusPx)
// => fov_deg = (720/π) * atan(...)
export function planetResolveFovDeg(angularRadiusDeg, dotRadiusPx, minDimPx, scale = 1, span = 1, margin = 2) {
  const tanHalfQuarter = (minDimPx * angularRadiusDeg * (Math.PI / 180) * scale * span) / (4 * margin * dotRadiusPx);
  return (720 / Math.PI) * Math.atan(tanHalfQuarter);
}
