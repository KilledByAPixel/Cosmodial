import { degToRad } from './angles.js';

// Unit vector [East, North, Up] for a direction given as (az, alt) in degrees.
function vec(az, alt) {
  const a = degToRad(az), e = degToRad(alt);
  const ca = Math.cos(e);
  return [ca * Math.sin(a), ca * Math.cos(a), Math.sin(e)];
}
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u, v) => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

// Gnomonic projection of a sky point (az, alt) onto the canvas.
// cam: { az, alt, fov, width, height }. Returns { x, y, visible }.
export function project(az, alt, cam) {
  const F = vec(cam.az, cam.alt);                 // forward (into screen)
  // Screen-up reference is the zenith, except when looking near-vertical.
  const upRef = Math.abs(cam.alt) > 89.5 ? [0, 1, 0] : [0, 0, 1];
  const right = norm(cross(F, upRef));            // +x: world East when facing horizon
  const up = norm(cross(right, F));               // +y: toward zenith
  const P = vec(az, alt);

  const z = dot(P, F);
  if (z <= 1e-6) return { x: NaN, y: NaN, visible: false }; // at/behind 90 deg from aim

  const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
  const x = (cam.width / 2) + focal * (dot(P, right) / z);
  const y = (cam.height / 2) - focal * (dot(P, up) / z); // screen y grows downward
  return { x, y, visible: true };
}
