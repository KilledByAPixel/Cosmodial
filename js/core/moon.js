// Pure Moon-orientation math (no vendor import). Computes, IN SCREEN SPACE, which way the Moon's bright
// limb (toward the Sun) and its north pole point — by projecting those directions through the camera.
// Doing it per-frame in screen space makes it correct under any pan, roll, zoom and projection
// distortion, and it rotates as the camera moves (the old analytic celestial-frame angles could not).
// Consumed each frame by the GL Moon pass. Unit-tested in tests/moon.test.js.
import { radToDeg } from './angles.js';
import { cameraBasis, dot, norm } from './projection.js';

// A unit ENU direction nudged a small step from `fromVec` toward `towardVec` (the on-sphere direction
// from `from` toward `to`). Lets us read which way the Sun / the Moon's pole lies *from the Moon*.
export function nudgedToward(fromVec, towardVec, eps = 0.02) {
  const d = dot(fromVec, towardVec);
  const t = norm([towardVec[0] - d * fromVec[0], towardVec[1] - d * fromVec[1], towardVec[2] - d * fromVec[2]]);
  return norm([fromVec[0] + eps * t[0], fromVec[1] + eps * t[1], fromVec[2] + eps * t[2]]);
}

// Project an ENU unit vector to screen pixels {x,y} (y grows DOWN) for camera basis B, or null if behind
// the camera. Mirrors createProjector()/the star shader.
function projectVec(B, p) {
  const z = dot(p, B.fwd);
  if (z <= 1e-6) return null;
  return { x: B.cx + B.focal * (dot(p, B.right) / z), y: B.cy - B.focal * (dot(p, B.up) / z) };
}

// Screen angle (degrees, clockwise from screen-up) of the direction from screen point `a` to `b`
// (projector coords, y down). Matches the Moon shader's dirFromUp(a) = (sin a, cos a) in +y-up space.
export function screenAngleCWFromUp(a, b) {
  return radToDeg(Math.atan2(b.x - a.x, -(b.y - a.y)));
}

// The Moon's bright-limb and north-pole angles on screen (degrees, CW from screen-up) for a camera.
// dirs are unit ENU vectors: the Moon centre, a direction toward the Sun, and toward the Moon's north
// pole. Falls back to 0 if a point projects behind the camera (the Moon pass culls it anyway).
export function moonScreenOrientation(cam, moonDir, sunDir, poleDir) {
  const B = cameraBasis(cam);
  const m = projectVec(B, moonDir);
  const s = projectVec(B, nudgedToward(moonDir, sunDir));
  const n = projectVec(B, nudgedToward(moonDir, poleDir));
  return {
    brightLimbAngle: (m && s) ? screenAngleCWFromUp(m, s) : 0,
    northAngle: (m && n) ? screenAngleCWFromUp(m, n) : 0,
  };
}
