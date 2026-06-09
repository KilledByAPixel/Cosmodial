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

// Raw 3x3 rotation matrix (the vendor's row-major `.rot`) taking a horizontal vector (x=North,
// y=West, z=Zenith) to J2000 equatorial (EQJ). Used to build the per-frame ENU->EQJ matrix that the
// sky-background shader uses to sample the all-sky Milky Way in the correct direction.
export function horToEqjRotation(observer, time) {
  return Astronomy.Rotation_HOR_EQJ(time, observer).rot;
}

// Raw 3x3 rotation matrix (the vendor's `.rot`) from J2000 equatorial (EQJ) to galactic (GAL, IAU
// 1958). A fixed rotation (no time/observer dependence). Composed with horToEqjRotation to sample the
// galactic-frame Milky Way texture in the right direction.
export function eqjToGalRotation() {
  return Astronomy.Rotation_EQJ_GAL().rot;
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

// Distance to a body (AU) at the given time (topocentric apparent).
export function bodyDistanceAu(body, observer, time) {
  return Astronomy.Equator(body, time, observer, true, true).dist;
}

// Pure: Moon phase name from the ecliptic phase angle (0=new, 90=first quarter, 180=full, 270=last).
export function moonPhaseName(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return 'New Moon';
  if (a < 67.5) return 'Waxing Crescent';
  if (a < 112.5) return 'First Quarter';
  if (a < 157.5) return 'Waxing Gibbous';
  if (a < 202.5) return 'Full Moon';
  if (a < 247.5) return 'Waning Gibbous';
  if (a < 292.5) return 'Last Quarter';
  return 'Waning Crescent';
}

// Moon phase summary: { illumPct (0..100), phaseName }.
export function moonPhaseInfo(time) {
  const illum = Astronomy.Illumination(Body.Moon, time);
  return { illumPct: Math.round(illum.phase_fraction * 100), phaseName: moonPhaseName(Astronomy.MoonPhase(time)) };
}

const MIN_MS = 60 * 1000;

// Normalize a vendor LunarEclipseInfo into our shape: JS Dates + per-phase contact times.
// Contacts are peak ± semiduration (minutes); a contact is null when that phase doesn't occur.
function normalizeLunarEclipse(info) {
  const peak = info.peak.date; // AstroTime -> JS Date
  const at = (sdMin, sign) => (sdMin > 0 ? new Date(peak.getTime() + sign * sdMin * MIN_MS) : null);
  return {
    kind: info.kind, // 'penumbral' | 'partial' | 'total'
    peak,
    contacts: {
      partialBegin: at(info.sd_partial, -1),
      totalBegin: at(info.sd_total, -1),
      peak,
      totalEnd: at(info.sd_total, +1),
      partialEnd: at(info.sd_partial, +1),
    },
    totalityMinutes: info.sd_total > 0 ? info.sd_total * 2 : null,
  };
}

// First lunar eclipse at/after `afterDate` (normalized). Penumbral/partial/total all returned;
// callers filter. Always returns a result (the engine searches forward across full moons).
export function searchLunarEclipse(afterDate) {
  return normalizeLunarEclipse(Astronomy.SearchLunarEclipse(makeTime(afterDate)));
}

// The lunar eclipse after the one peaking at `afterPeakDate` (normalized).
export function nextLunarEclipse(afterPeakDate) {
  return normalizeLunarEclipse(Astronomy.NextLunarEclipse(makeTime(afterPeakDate)));
}
