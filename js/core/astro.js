// The ONLY module that imports the astronomy-engine vendor file.
// Inputs/outputs are in DEGREES. RA stored in degrees; converted to hours where the library needs hours.
import * as Astronomy from '../vendor/astronomy.js';

// Re-export the body enum so the rest of the app never imports the vendor directly.
export const Body = Astronomy.Body;

export function makeObserver(lat, lng, heightMeters = 0) {
  return new Astronomy.Observer(lat, lng, heightMeters);
}

export function makeTime(date) {
  return Astronomy.MakeTime(date); // accepts a JS Date or an AstroTime
}

// Precess a J2000 equatorial position (degrees) into the equator-of-date frame.
// Returns { ra, dec } in DEGREES. Includes precession + nutation (EQJ -> EQD).
export function precessToDate(raDegJ2000, decDegJ2000, time) {
  const sphere = new Astronomy.Spherical(decDegJ2000, raDegJ2000, 1.0); // (lat=dec, lon=ra, dist)
  const vecEqj = Astronomy.VectorFromSphere(sphere, time);
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const vecEqd = Astronomy.RotateVector(rot, vecEqj);
  const eqd = Astronomy.EquatorFromVector(vecEqd); // { ra: HOURS, dec: deg, dist }
  return { ra: eqd.ra * 15, dec: eqd.dec };
}

// Alt/az (degrees) for a fixed star given its J2000 RA/Dec (degrees).
export function altAzOfStar(raDegJ2000, decDegJ2000, observer, time) {
  const ofDate = precessToDate(raDegJ2000, decDegJ2000, time);
  const hor = Astronomy.Horizon(time, observer, ofDate.ra / 15, ofDate.dec, 'normal'); // ra in HOURS
  return { alt: hor.altitude, az: hor.azimuth };
}

// Alt/az (degrees) for Sun/Moon/planets. Equator(ofdate=true) already yields equator-of-date coords.
export function altAzOfBody(body, observer, time) {
  const eq = Astronomy.Equator(body, time, observer, /*ofdate*/ true, /*aberration*/ true); // ra HOURS
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth };
}
