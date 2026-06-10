import { degToRad, radToDeg, wrap360 } from './angles.js';
import { dot, cross, norm } from './projection.js';

// The two device-frame axes we need, expressed in Earth ENU coords (East, North, Up), from the W3C
// orientation matrix R = Rz(alpha)*Rx(beta)*Ry(gamma). `up` = device top edge (R[:,1]); `out` =
// device out-of-screen axis (R[:,2]). Angles in degrees.
function deviceColumns(alpha, beta, gamma) {
  const a = degToRad(alpha), b = degToRad(beta), g = degToRad(gamma);
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  const up = [-sa * cb, ca * cb, sb];
  const out = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
  return { up, out };
}

// Convert an absolute device orientation into our camera's aim direction + screen roll.
//   alpha/beta/gamma: W3C DeviceOrientation Euler angles (degrees). alpha must be north-referenced
//     (absolute) for the azimuth to be a true compass bearing; ui/gyro.js supplies that.
//   screen: screen.orientation.angle (degrees) — spins page content about the viewing axis only.
// Returns { az, alt, roll } in our ENU frame: az clockwise from North (matching vec()), alt in
// [-90,90], roll in [-180,180). Pure.
export function deviceToCamera({ alpha = 0, beta = 0, gamma = 0, screen = 0 } = {}) {
  const { up, out } = deviceColumns(alpha, beta, gamma);
  const aim = [-out[0], -out[1], -out[2]];                 // back-camera direction (device -Z)
  const alt = radToDeg(Math.asin(Math.max(-1, Math.min(1, aim[2]))));
  const az = wrap360(radToDeg(Math.atan2(aim[0], aim[1]))); // atan2(East, North)
  // No-roll reference basis for this aim — same az-derived construction as cameraBasis()
  // (the two MUST match or the gyro roll is measured against the wrong frame near the zenith).
  // +0 neutralises any -0 from aim negation so atan2(0,0)=0 (North) at the exact poles.
  const aRad = Math.atan2(aim[0] + 0, aim[1] + 0);
  const right0 = [Math.cos(aRad), -Math.sin(aRad), 0];
  const up0 = norm(cross(right0, aim));
  // The device's screen-up against the no-roll basis is the physical roll; subtract the page's
  // screen-orientation rotation (a pure spin about the viewing axis).
  let roll = radToDeg(Math.atan2(-dot(up, right0), dot(up, up0))) - screen;
  roll = ((roll + 540) % 360) - 180;                       // normalize to [-180, 180)
  return { az, alt, roll };
}
