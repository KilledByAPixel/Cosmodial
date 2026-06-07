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
  const hor = Astronomy.Horizon(time, observer, ofDate.ra / 15, ofDate.dec, 'normal'); // precessToDate returns degrees; ÷15 converts RA back to hours for Horizon
  return { alt: hor.altitude, az: hor.azimuth };
}

// Alt/az (degrees) for Sun/Moon/planets. Equator(ofdate=true) already yields equator-of-date coords.
export function altAzOfBody(body, observer, time) {
  const eq = Astronomy.Equator(body, time, observer, /*ofdate*/ true, /*aberration*/ true); // ra HOURS
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth };
}

// Apparent visual magnitude (geocentric apparent) of a body astronomy-engine illuminates — used
// here for the naked-eye planets (Mercury-Saturn); also valid for the Moon.
export function bodyMagnitude(body, time) {
  return Astronomy.Illumination(body, time).mag;
}

// Physical radii in AU, used for the apparent angular size of the Sun and Moon.
const BODY_RADIUS_AU = { Sun: 0.00465047, Moon: 1.16138e-5 };

// Apparent angular RADIUS (degrees) of the Sun or Moon from the observer (uses current distance).
// Returns null for bodies we don't size this way (planets render as fixed disks).
export function bodyAngularRadiusDeg(body, observer, time) {
  const r = BODY_RADIUS_AU[body];
  if (r == null) return null;
  const eq = Astronomy.Equator(body, time, observer, true, true);
  return (Math.asin(Math.min(1, r / eq.dist)) * 180) / Math.PI;
}

// Build a reusable J2000->alt/az converter for a fixed (observer, time): the EQJ->EQD precession
// rotation is computed ONCE here instead of once per star (computeSky calls this on ~15.6k stars).
export function makeStarAltAz(observer, time) {
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  return (raDegJ2000, decDegJ2000) => {
    const sphere = new Astronomy.Spherical(decDegJ2000, raDegJ2000, 1.0); // (lat=dec, lon=ra, dist)
    const vecEqd = Astronomy.RotateVector(rot, Astronomy.VectorFromSphere(sphere, time));
    const eqd = Astronomy.EquatorFromVector(vecEqd);                       // ra HOURS, dec deg
    const hor = Astronomy.Horizon(time, observer, eqd.ra, eqd.dec, 'normal');
    return { alt: hor.altitude, az: hor.azimuth };
  };
}

// Tonight's sunset and the following sunrise (JS Dates) for the observer. Searches from local noon
// of refDate so the "tonight" window is stable regardless of the hour called. Either may be null at
// extreme latitudes where the Sun doesn't cross the horizon.
export function nightWindow(observer, refDate) {
  const noon = new Date(refDate);
  noon.setHours(12, 0, 0, 0);
  const t = Astronomy.MakeTime(noon);
  const set = Astronomy.SearchRiseSet(Body.Sun, observer, -1, t, 2);            // next sunset
  const rise = set ? Astronomy.SearchRiseSet(Body.Sun, observer, +1, set, 2) : null; // sunrise after it
  return { sunset: set ? set.date : null, sunrise: rise ? rise.date : null };
}
