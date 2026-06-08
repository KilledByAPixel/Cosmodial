import { degToRad } from './angles.js';

// Unit vector [East, North, Up] for a direction given as (az, alt) in degrees.
export function vec(az, alt) {
  const a = degToRad(az), e = degToRad(alt);
  const ca = Math.cos(e);
  return [ca * Math.sin(a), ca * Math.cos(a), Math.sin(e)];
}
export const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
export const cross = (u, v) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
export function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

// Camera basis (right/up/forward unit vectors) + focal length + screen center for a fixed camera.
// Shared by the CPU projector (createProjector below) and the WebGL starfield, so both project
// stars identically — guaranteeing taps land on the star the user sees. cam: { az, alt, fov, width, height }.
export function cameraBasis(cam) {
  const fwd = vec(cam.az, cam.alt);
  const upRef = Math.abs(cam.alt) > 89.5 ? [0, 1, 0] : [0, 0, 1];
  const right = norm(cross(fwd, upRef));          // +x: world East when facing the horizon
  const up = norm(cross(right, fwd));             // +y: toward the zenith
  const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
  return { right, up, fwd, focal, cx: cam.width / 2, cy: cam.height / 2 };
}

// Build a reusable gnomonic projector for a fixed camera, precomputing the camera basis and
// focal length ONCE. Returns (az, alt) -> { x, y, visible }. Amortizes setup across many points
// (e.g. thousands of stars per frame). cam: { az, alt, fov, width, height }.
// NOTE: visible:true means the point is in the front hemisphere (in front of the camera),
// NOT necessarily within the canvas bounds — callers must still bounds-check x/y. Culled points
// return { x: NaN, y: NaN } deliberately, so a forgotten visible-check renders a no-op rather
// than a spurious dot at a sentinel coordinate.
export function createProjector(cam) {
  const { right, up, fwd, focal, cx, cy } = cameraBasis(cam);
  return function projectPoint(az, alt) {
    const P = vec(az, alt);
    const z = dot(P, fwd);
    if (z <= 1e-6) return { x: NaN, y: NaN, visible: false };
    return {
      x: cx + focal * (dot(P, right) / z),
      y: cy - focal * (dot(P, up) / z), // screen y grows downward
      visible: true,
    };
  };
}

// Project a single sky point (az, alt) for a one-off use. Delegates to createProjector.
// NOTE: builds a fresh projector each call — use createProjector(cam) for batches (per-frame star loops).
export function project(az, alt, cam) {
  return createProjector(cam)(az, alt);
}
