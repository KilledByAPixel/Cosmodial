// The ONLY module that imports the astronomy-engine vendor file.
// Inputs/outputs are in DEGREES. RA stored in degrees; converted to hours where the library needs hours.
import * as Astronomy from '../vendor/astronomy.js';
import { MOON_ELEMENTS, moonOffsetEqjAu } from './planet-moons.js';
import { COMETS, activeCometSet, cometHelioEqjAu, cometMagnitude, cometCoverage } from './comets.js';

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
const BODY_RADIUS_AU = {
  Sun: 0.00465047, Moon: 1.16138e-5,
  Mercury: 1.6310e-5, Venus: 4.0454e-5, Mars: 2.2654e-5,
  Jupiter: 4.7789e-4, Saturn: 4.0288e-4, Uranus: 1.7081e-4, Neptune: 1.6554e-4,
  Pluto: 7.943e-6,
};

// Earth's shadow at the Moon's distance, as the observer sees it: the umbra/penumbra centre (the
// anti-solar point, sampled at the Moon's distance and given the same topocentric parallax as the
// Moon) plus the shadow's angular radii by Danjon's rule (the 1.02 covers Earth's atmosphere).
// Drives the lunar-eclipse shading on the Moon's rendered disc.
const EARTH_RADIUS_AU = 4.26352e-5;
export function lunarShadow(observer, time) {
  const sv = Astronomy.GeoVector(Body.Sun, time, /*aberration*/ true);
  const mv = Astronomy.GeoVector(Body.Moon, time, /*aberration*/ true);
  const ov = Astronomy.ObserverVector(time, observer, /*ofdate*/ false);
  const dMoon = Math.hypot(mv.x, mv.y, mv.z);
  const dSun = Math.hypot(sv.x, sv.y, sv.z);
  const k = -dMoon / dSun; // anti-solar direction, scaled to the Moon's geocentric distance
  const tv = new Astronomy.Vector(sv.x * k - ov.x, sv.y * k - ov.y, sv.z * k - ov.z, time);
  const eq = Astronomy.EquatorFromVector(tv);
  const moonPar = Math.asin(EARTH_RADIUS_AU / dMoon); // horizontal parallaxes + solar semidiameter,
  const sunPar = Math.asin(EARTH_RADIUS_AU / dSun);   // the classical shadow-cone ingredients
  const sunSd = Math.asin(BODY_RADIUS_AU.Sun / dSun);
  const R2D = 180 / Math.PI;
  return {
    altaz: altAzOfStar(eq.ra * 15, eq.dec, observer, time),
    umbraDeg: 1.02 * (moonPar + sunPar - sunSd) * R2D,
    penumbraDeg: 1.02 * (moonPar + sunPar + sunSd) * R2D,
  };
}

// Sun-body-Earth phase angle in degrees (0 = full, 180 = new). Drives where the terminator sits.
export function bodyPhaseAngleDeg(body, time) {
  return Astronomy.Illumination(body, time).phase_angle;
}

// The Moon's libration: the selenographic lon/lat of the sub-Earth point (degrees). Feeding these into
// the texture mapping makes the visible FACE wobble authentically (~±8° lon, ±7° lat over the month) —
// limb features like Mare Crisium slide toward/away from the edge, matching photos taken that night.
export function moonLibrationDeg(time) {
  const li = Astronomy.Libration(time);
  return { lonDeg: li.elon, latDeg: li.elat };
}

// A body's north rotation-axis pole as J2000 RA/Dec (degrees), from the IAU rotation model.
export function northPoleJ2000(body, time) {
  const ax = Astronomy.RotationAxis(body, time); // ra HOURS, dec deg (J2000)
  return { raDeg: ax.ra * 15, decDeg: ax.dec };
}

// Apparent angular RADIUS (degrees) of a body from the observer (uses its current distance).
// Returns null for any body not in BODY_RADIUS_AU.
export function bodyAngularRadiusDeg(body, observer, time) {
  const r = BODY_RADIUS_AU[body];
  if (r == null) return null;
  const eq = Astronomy.Equator(body, time, observer, true, true);
  return (Math.asin(Math.min(1, r / eq.dist)) * 180) / Math.PI;
}

// Mean visual magnitudes of the Galilean moons (they vary by a few tenths; fine for dot sizing).
const GALILEAN_MAGS = { Io: 5.0, Europa: 5.3, Ganymede: 4.6, Callisto: 5.7 };
const GALILEAN_NAMES = ['Io', 'Europa', 'Ganymede', 'Callisto'];

// Every rendered moon as a static { planet, name } pair — the search index is built once at
// startup, before any live planetMoonsAltAz() pass has run.
export const PLANET_MOONS = [
  ...GALILEAN_NAMES.map((name) => ({ planet: 'Jupiter', name })),
  ...MOON_ELEMENTS.map((r) => ({ planet: r.planet, name: r.name })),
];

// All planetary moons as sky positions: [{ planet, name, altaz:{alt,az}, mag, behind }].
// Jupiter's four use the vendored L1.2 theory; the rest come from the Kepler element table in
// planet-moons.js. Each system is evaluated at its LIGHT-EMISSION time (displayed time minus the
// planet's light-travel time), so on-screen positions are apparent for the displayed clock.
// `behind` = occulted: farther than the planet AND within its physical radius of the line of sight.
export function planetMoonsAltAz(observer, time) {
  const out = [];
  // TOPOCENTRIC planet vector (observer -> planet), matching altAzOfBody's parallax: the planets are
  // placed topocentrically, so geocentric moons would be offset from their planet by its parallax —
  // invisible for Jupiter/Saturn (arcsec vs arcmin orbits) but most of Phobos' 6-arcsec orbit at Mars.
  const ov = Astronomy.ObserverVector(time, observer, /*ofdate*/ false);
  const system = (planetName, body, moons) => {
    const gv = Astronomy.GeoVector(body, time, /*aberration*/ true);
    const pv = { x: gv.x - ov.x, y: gv.y - ov.y, z: gv.z - ov.z };
    const plen = Math.hypot(pv.x, pv.y, pv.z);
    const los = [pv.x / plen, pv.y / plen, pv.z / plen];
    const emit = time.AddDays(-plen * (499.00478939 / 86400));
    for (const { name, mag, offset } of moons(emit)) {
      // Mixing frames slightly: pv is at observation time, offset at emission time — the error is
      // ~0.02 arcsec (planet drifts ~5 arcsec/day geocentrically), far below rendering scale.
      const g = new Astronomy.Vector(pv.x + offset[0], pv.y + offset[1], pv.z + offset[2], time);
      const eq = Astronomy.EquatorFromVector(g);
      const along = offset[0] * los[0] + offset[1] * los[1] + offset[2] * los[2];
      const perp = Math.hypot(offset[0] - along * los[0], offset[1] - along * los[1], offset[2] - along * los[2]);
      out.push({
        planet: planetName, name, mag,
        altaz: altAzOfStar(eq.ra * 15, eq.dec, observer, time),
        behind: along > 0 && perp < BODY_RADIUS_AU[planetName],
      });
    }
  };
  system('Jupiter', Body.Jupiter, (emit) => {
    const jm = Astronomy.JupiterMoons(emit);
    return GALILEAN_NAMES.map((name) => {
      const sv = jm[name.toLowerCase()];
      return { name, mag: GALILEAN_MAGS[name], offset: [sv.x, sv.y, sv.z] };
    });
  });
  for (const planetName of ['Mars', 'Saturn', 'Uranus', 'Neptune']) {
    const rows = MOON_ELEMENTS.filter((r) => r.planet === planetName);
    if (rows.length) system(planetName, Body[planetName], (emit) =>
      rows.map((r) => ({ name: r.name, mag: r.mag, offset: moonOffsetEqjAu(r, 2451545.0 + emit.tt) })));
  }
  return out;
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

// The NEXT sun event from refDate — sunset or sunrise, whichever comes first — for the panel's
// "what's coming up" readout. (nightWindow above answers a different question: it anchors at local
// noon to describe tonight.) Returns { kind: 'sunset'|'sunrise', date } or null when neither
// occurs within 2 days (polar day/night).
export function nextSunEvent(observer, refDate) {
  const t = Astronomy.MakeTime(refDate);
  const set = Astronomy.SearchRiseSet(Body.Sun, observer, -1, t, 2);
  const rise = Astronomy.SearchRiseSet(Body.Sun, observer, +1, t, 2);
  if (!set && !rise) return null;
  if (set && (!rise || set.date <= rise.date)) return { kind: 'sunset', date: set.date };
  return { kind: 'sunrise', date: rise.date };
}

// The next moment the Sun DESCENDS through altDeg (apparent, with refraction) after refDate
// (e.g. -6 = end of civil twilight) — the screensaver's skip-the-daytime search. Null when
// it doesn't happen within limitDays (polar summer).
export function nextSunBelowAlt(observer, refDate, altDeg, limitDays = 4) {
  const startTime = Astronomy.MakeTime(refDate);
  // altdiff > 0 while descending means we want the sign flip from positive to negative.
  // direction = -1 in Search finds where altdiff crosses zero going negative -> positive,
  // so we define altdiff such that it's positive above altDeg (apparent alt > altDeg).
  function altdiff(time) {
    const eq = Astronomy.Equator(Body.Sun, time, observer, /*ofdate*/ true, /*aberration*/ true);
    const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    return hor.altitude - altDeg;
  }
  // Step size: 10-minute intervals to bracket the crossing. Sun moves ~2.5°/hr in altitude
  // near the horizon so 10 min (~0.4°) is well within the Nyquist-safe limit.
  const STEP_DAYS = 10 / 1440;
  const limit = startTime.AddDays(limitDays);
  let t1 = startTime;
  let a1 = altdiff(t1);
  while (t1.date < limit.date) {
    const t2 = t1.AddDays(STEP_DAYS);
    const a2 = altdiff(t2);
    // Looking for a descent: a1 > 0 and a2 <= 0 (crossing from above to below).
    if (a1 > 0 && a2 <= 0) {
      const found = Astronomy.Search(altdiff, t1, t2, { dt_tolerance_seconds: 0.5, init_f1: a1, init_f2: a2 });
      return found ? found.date : null;
    }
    t1 = t2;
    a1 = a2;
  }
  return null;
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

// Normalize a vendor LocalSolarEclipseInfo into the lunar shape (Date contacts + totalityMinutes)
// plus two solar-only fields: `obscuration` (0..1 fraction of the Sun covered at peak) and
// `altDeg` (the Sun's altitude at the partial contacts and peak — the local search reports
// eclipses even when the Sun is below the horizon for part of them; solarVisibility reads these).
// For an annular eclipse, totalBegin/totalEnd/totalityMinutes describe the annular phase.
function normalizeSolarEclipse(info) {
  const at = (ev) => (ev ? ev.time.date : null); // EclipseEvent -> JS Date (or null when no phase)
  return {
    kind: info.kind, // 'partial' | 'annular' | 'total'
    obscuration: info.obscuration,
    peak: info.peak.time.date,
    contacts: {
      partialBegin: at(info.partial_begin),
      totalBegin: at(info.total_begin),
      peak: info.peak.time.date,
      totalEnd: at(info.total_end),
      partialEnd: at(info.partial_end),
    },
    altDeg: {
      partialBegin: info.partial_begin.altitude,
      peak: info.peak.altitude,
      partialEnd: info.partial_end.altitude,
    },
    totalityMinutes: info.total_begin && info.total_end
      ? (info.total_end.time.date - info.total_begin.time.date) / MIN_MS
      : null,
  };
}

// First solar eclipse at/after `afterDate` with any part of the Moon's shadow touching the
// observer's location (normalized). Observer-specific by nature — solar eclipses are local.
export function searchSolarEclipse(afterDate, observer) {
  return normalizeSolarEclipse(Astronomy.SearchLocalSolarEclipse(makeTime(afterDate), observer));
}

// The solar eclipse at this location after the one peaking at `afterPeakDate` (normalized).
export function nextSolarEclipse(afterPeakDate, observer) {
  return normalizeSolarEclipse(Astronomy.NextLocalSolarEclipse(makeTime(afterPeakDate), observer));
}

// Coverage strings are constant per comet — resolved once here, not per recompute (cometsAltAz
// runs on the frequent path, per frame in live mode).
const COMET_COVERAGE = new Map(COMETS.map((c) => [c.id, cometCoverage(c)]));

// All comets as sky objects at one instant: [{ id, name, color, blurb, coverage, altaz, mag,
// rAu (Sun distance), deltaAu (observer distance) }]. Position is two-body propagation from the
// element set whose epoch is nearest the viewed date; altaz/mag/distances are null outside every
// set's validity window (no position beats a wrong one — see comets.js). Topocentric like the
// planets; light-time and aberration are skipped (≲1 arcmin at comet distances, below marker scale).
export function cometsAltAz(observer, time) {
  const jdTT = 2451545.0 + time.tt;
  const ev = Astronomy.HelioVector(Body.Earth, time);
  const ov = Astronomy.ObserverVector(time, observer, /*ofdate*/ false);
  return COMETS.map((c) => {
    const base = { id: c.id, name: c.name, color: c.color, blurb: c.blurb, coverage: COMET_COVERAGE.get(c.id) };
    const set = activeCometSet(c, jdTT);
    if (!set) return { ...base, altaz: null, mag: null, rAu: null, deltaAu: null };
    const h = cometHelioEqjAu(set, jdTT);
    const g = [h[0] - ev.x - ov.x, h[1] - ev.y - ov.y, h[2] - ev.z - ov.z]; // observer -> comet (EQJ)
    const eq = Astronomy.EquatorFromVector(new Astronomy.Vector(g[0], g[1], g[2], time));
    const rAu = Math.hypot(h[0], h[1], h[2]);
    const deltaAu = Math.hypot(g[0], g[1], g[2]);
    return {
      ...base,
      altaz: altAzOfStar(eq.ra * 15, eq.dec, observer, time),
      mag: cometMagnitude(c.M1, c.K1, rAu, deltaAu), rAu, deltaAu,
    };
  });
}
