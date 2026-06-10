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

// Visibility cull threshold: cos(150°). Stereographic projects the whole sphere except the antipode
// (no gnomonic-style mirror ghosts), so points behind the camera are legitimately on screen at wide
// FOV (MAX_FOV 235° -> 117.5° off-axis). Points out to 150° project finite but off-screen — keeping
// them lets line segments that straddle the screen edge draw correctly; beyond 150° the coordinates
// blow up toward the antipode singularity, so they are culled. Embedded as a GLSL literal in the
// star/marker/body-sphere shaders — tests guard against drift.
export const MIN_VIS_Z = Math.cos(degToRad(150));

// Camera basis (right/up/forward unit vectors) + focal length + screen center for a fixed camera.
// Shared by the CPU projector (createProjector below) and the WebGL starfield, so both project
// stars identically — guaranteeing taps land on the star the user sees. cam: { az, alt, fov, width, height }.
export function cameraBasis(cam) {
  const fwd = vec(cam.az, cam.alt);
  const upRef = Math.abs(cam.alt) > 89.5 ? [0, 1, 0] : [0, 0, 1];
  let right = norm(cross(fwd, upRef));          // +x: world East when facing the horizon
  let up = norm(cross(right, fwd));             // +y: toward the zenith
  // Optional camera roll (degrees) about the viewing axis, used by gyro/AR aim so the on-screen
  // image rotates with the phone. roll=0 (the default) leaves the basis level — identical to before.
  if (cam.roll) {
    const r = degToRad(cam.roll);
    const cr = Math.cos(r), sr = Math.sin(r);
    const rRight = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    const rUp = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    right = rRight; up = rUp;
  }
  // Stereographic screen scale: r_px = 2·focal·tan(θ/2), normalized so `fov` spans the screen width
  // (a point fov/2 off-axis lands at the screen edge). The px-per-radian at the view CENTER is still
  // exactly `focal`, so small-angle radius helpers (sun/moon/DSO discs) keep using focal directly.
  const focal = (cam.width / 2) / (2 * Math.tan(degToRad(cam.fov) / 4));
  return { right, up, fwd, focal, cx: cam.width / 2, cy: cam.height / 2 };
}

// Build a reusable stereographic projector for a fixed camera, precomputing the camera basis and
// focal length ONCE. Returns (az, alt) -> { x, y, visible }. Amortizes setup across many points
// (e.g. thousands of stars per frame). cam: { az, alt, fov, width, height }.
// NOTE: visible:true means the point is within 150° of the view axis (projectable — possibly far
// off-screen), NOT necessarily within the canvas bounds — callers must still bounds-check x/y.
// Culled points return { x: NaN, y: NaN } deliberately, so a forgotten visible-check renders a
// no-op rather than a spurious dot at a sentinel coordinate.
export function createProjector(cam) {
  const { right, up, fwd, focal, cx, cy } = cameraBasis(cam);
  return function projectPoint(az, alt) {
    const P = vec(az, alt);
    const z = dot(P, fwd);
    if (z <= MIN_VIS_Z) return { x: NaN, y: NaN, visible: false };
    const k = (2 * focal) / (1 + z); // stereographic: r = 2f·tan(θ/2) = 2f·sinθ/(1+cosθ)
    return {
      x: cx + k * dot(P, right),
      y: cy - k * dot(P, up), // screen y grows downward
      visible: true,
    };
  };
}

// Project a single sky point (az, alt) for a one-off use. Delegates to createProjector.
// NOTE: builds a fresh projector each call — use createProjector(cam) for batches (per-frame star loops).
export function project(az, alt, cam) {
  return createProjector(cam)(az, alt);
}
