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

// Screen scale (px per radian at the view CENTER) for a given fov (degrees) and canvas size
// (CSS px). fov spans the SHORTER screen dimension: zoomed out near the zenith the sky is a
// circle, and tying the scale to the shorter side keeps that circle fully inside the window at
// MAX_FOV whatever the aspect ratio (width-based, a wide window cropped the circle and a narrow
// one shrank it). Single source of truth — cameraBasis and the disc-radius helpers (sun/moon/
// DSO/planets) must agree, or discs drift in size relative to the projected sky.
export function focalPx(fov, width, height) {
  return (Math.min(width, height) / 2) / (2 * Math.tan(degToRad(fov) / 4));
}

// Camera basis (right/up/forward unit vectors) + focal length + screen center for a fixed camera.
// Shared by the CPU projector (createProjector below) and the WebGL starfield, so both project
// stars identically — guaranteeing taps land on the star the user sees. cam: { az, alt, fov, width, height }.
export function cameraBasis(cam) {
  const fwd = vec(cam.az, cam.alt);
  // Level frame derived directly from the heading: identical to norm(cross(fwd, zenith)) for
  // every |alt| < 90, and still heading-true AT the zenith/nadir where that cross degenerates
  // (there the frame's screen-up points toward azimuth az+180 — the continuous limit). This is
  // what lets MAX_ALT reach 90 with no orientation snap.
  const a = degToRad(cam.az);
  let right = [Math.cos(a), -Math.sin(a), 0];   // +x: world East when facing North
  let up = norm(cross(right, fwd));             // +y: toward the zenith (screen-up)
  // Optional camera roll (degrees) about the viewing axis, used by gyro/AR aim so the on-screen
  // image rotates with the phone. roll=0 (the default) leaves the basis level — identical to before.
  if (cam.roll) {
    const r = degToRad(cam.roll);
    const cr = Math.cos(r), sr = Math.sin(r);
    const rRight = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    const rUp = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    right = rRight; up = rUp;
  }
  // Stereographic screen scale: r_px = 2·focal·tan(θ/2), normalized so `fov` spans the SHORTER
  // screen dimension (a point fov/2 off-axis lands at that edge — see focalPx). The px-per-radian
  // at the view CENTER is still exactly `focal`, so small-angle radius helpers (sun/moon/DSO
  // discs) keep using focalPx directly.
  const focal = focalPx(cam.fov, cam.width, cam.height);
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

// Inverse of the stereographic projection: screen pixel (x, y) -> ENU unit direction for `cam`.
// Mirrors the per-pixel ray reconstruction in the sky-background fragment shader (the round-trip
// test pins them to each other through project()). Defined for every pixel — far-off-canvas
// coordinates legitimately map to directions behind the camera.
export function unproject(x, y, cam) {
  const { right, up, fwd, focal, cx, cy } = cameraBasis(cam);
  const dx = x - cx, dy = -(y - cy); // screen y grows downward; +dy = toward screen-up
  const r = Math.hypot(dx, dy);
  const theta = 2 * Math.atan(r / (2 * focal));
  const s = r > 1e-12 ? Math.sin(theta) / r : 0;
  const ct = Math.cos(theta);
  return [
    fwd[0] * ct + (right[0] * dx + up[0] * dy) * s,
    fwd[1] * ct + (right[1] * dx + up[1] * dy) * s,
    fwd[2] * ct + (right[2] * dx + up[2] * dy) * s,
  ];
}

// Solve for the LEVEL camera (roll 0) aim that projects ENU unit direction `d` to pixel (x, y):
// the heart of grab-the-sky dragging — the point grabbed at pointer-down stays pinned under the
// cursor. Closed form; returns { az, alt } in degrees. cam supplies fov/width/height plus the
// CURRENT az/alt, used only to pick between the two altitude roots (nearest wins) and as the
// fallback when pinning is infeasible (e.g. the zenith can never leave the screen's vertical
// centerline while the horizon stays level) or degenerate (grabbing the zenith itself).
export function grabAim(d, x, y, cam) {
  const { focal, cx, cy } = cameraBasis(cam);
  const dx = x - cx, dy = -(y - cy); // +dy = toward screen-up
  const r = Math.hypot(dx, dy);
  const theta = 2 * Math.atan(r / (2 * focal));
  const s = r > 1e-12 ? Math.sin(theta) / r : 0;
  const rx = dx * s, ry = dy * s, rz = Math.cos(theta); // pixel ray in (right, up, fwd) coords

  // Altitude: the level basis z-row is (0, cos alt, sin alt), so ry·cos(alt) + rz·sin(alt) = d_z.
  const A = Math.hypot(ry, rz);
  let altDeg = cam.alt;
  if (A > 1e-9) {
    const phi = Math.atan2(ry, rz);
    const base = Math.asin(Math.max(-1, Math.min(1, d[2] / A))); // clamp = infeasible fallback
    const wrap = (rad) => ((rad * 180 / Math.PI + 540) % 360) - 180;
    const cands = [wrap(base - phi), wrap(Math.PI - base - phi)];
    const inRange = cands.filter((c) => c >= -90 && c <= 90);
    const pool = inRange.length ? inRange : cands;
    let nearest = pool.reduce((best, c) => (Math.abs(c - cam.alt) < Math.abs(best - cam.alt) ? c : best));
    // No-flip rule: a root more than 90° of pitch away is the over-the-pole aim — dragging the
    // grab outside the sky circle at wide FOV makes "look straight down at it" the only in-range
    // solution, which would snap the view upside down in one event. Stay on the continuous branch
    // instead: the aim pegs at the pole and the grabbed point trades exact pinning for continuity
    // (the same bargain dampedGrabAz makes near the poles). If the other branch is over the pole
    // too (the infeasible asin clamp collapses both roots to the far pole once the cursor ray
    // tilts >90° off-axis), no root is safe — hold the current pitch.
    if (Math.abs(nearest - cam.alt) > 90) {
      nearest = cands.reduce((best, c) => (Math.abs(c - cam.alt) < Math.abs(best - cam.alt) ? c : best));
      if (Math.abs(nearest - cam.alt) > 90) nearest = cam.alt;
    }
    altDeg = Math.max(-90, Math.min(90, nearest));
  }

  // Azimuth: with alt fixed, the horizontal parts satisfy (d_E, d_N) = Rot(az)·(u, v).
  const altRad = degToRad(altDeg);
  const u = rx, v = rz * Math.cos(altRad) - ry * Math.sin(altRad);
  let azDeg = cam.az;
  if (Math.hypot(d[0], d[1]) > 1e-9 && Math.hypot(u, v) > 1e-9) {
    azDeg = (Math.atan2(d[0], d[1]) - Math.atan2(u, v)) * 180 / Math.PI;
    azDeg = ((azDeg % 360) + 360) % 360;
  }
  return { az: azDeg, alt: altDeg };
}
