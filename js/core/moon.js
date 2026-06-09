// Pure Moon-orientation math (degrees in, degrees out; no vendor import). The GL Moon pass consumes
// these to light and orient the textured sphere. Unit-tested in tests/moon.test.js.
import { degToRad, radToDeg } from './angles.js';

// Parallactic angle (degrees): the angle at the body between the directions to the zenith and to the
// celestial north pole. 0 on the meridian; positive west of it. H = hour angle, dec, lat (all degrees).
export function parallacticAngle(haDeg, decDeg, latDeg) {
  const H = degToRad(haDeg), d = degToRad(decDeg), phi = degToRad(latDeg);
  return radToDeg(Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(d) - Math.sin(d) * Math.cos(H)));
}

// Position angle (degrees, from celestial north toward east) of point 2 as seen from point 1.
export function positionAngle(raDeg, decDeg, ra2Deg, dec2Deg) {
  const da = degToRad(ra2Deg - raDeg);
  const d1 = degToRad(decDeg), d2 = degToRad(dec2Deg);
  return radToDeg(Math.atan2(
    Math.sin(da) * Math.cos(d2),
    Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(da),
  ));
}

// Screen-frame angles (degrees, from celestial-north PA minus the parallactic angle, i.e. relative to
// the zenith direction) for the Moon's bright limb (toward the Sun) and its north pole.
export function moonScreenAngles({ moonRaDeg, moonDecDeg, sunRaDeg, sunDecDeg, poleRaDeg, poleDecDeg, haDeg, latDeg }) {
  const q = parallacticAngle(haDeg, moonDecDeg, latDeg);
  return {
    brightLimbAngle: positionAngle(moonRaDeg, moonDecDeg, sunRaDeg, sunDecDeg) - q,
    northAngle: positionAngle(moonRaDeg, moonDecDeg, poleRaDeg, poleDecDeg) - q,
  };
}
