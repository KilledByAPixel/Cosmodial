// Pure selection/windowing rules for the Highlights panel's sky events. No astronomy import —
// main.js passes in objects and event dates it already computed.

// How many days either side of an event's exact moment it still earns a highlight row. Oppositions
// and elongations are gradual (the view is essentially as good all week); Venus's peak and the full
// moon are more of a "tonight" thing.
export const HIGHLIGHT_WINDOW_DAYS = { opposition: 3, elongation: 3, venusPeak: 2, fullMoon: 0.5 };

// A full moon closer than this (geocentric, km) is popularly a "supermoon" (~perigee syzygy).
export const SUPERMOON_KM = 360000;

// A Moon pairing tighter than this is an occultation, not a conjunction: the Moon's own disc is
// ~0.26° in radius, so at this separation the body sits on (or behind) the limb.
export const OCCULT_SEP_DEG = 0.3;

// Faintest comet worth announcing — about the binocular limit under a decent sky.
export const COMET_MAG_LIMIT = 6;

const DAY_MS = 86400000;

// Is `date` within `days` (fractional ok) of `now`? Both JS Dates.
export function withinDays(now, date, days) {
  return Math.abs(now.getTime() - date.getTime()) <= days * DAY_MS;
}

// Brightest comet worth a banner: inside its element-set coverage (altaz present), above the
// horizon, and at/above the magnitude cut. Null when nothing qualifies.
export function bestVisibleComet(comets, magLimit = COMET_MAG_LIMIT) {
  let best = null;
  for (const c of comets) {
    if (!c.altaz || c.altaz.alt < 0) continue;
    if (c.mag == null || !Number.isFinite(c.mag) || c.mag > magLimit) continue;
    if (!best || c.mag < best.mag) best = c;
  }
  return best;
}

// Does this conjunction pair (from findConjunctions) actually read as a lunar occultation?
export function isOccultation(pair) {
  return (pair.a.label === 'Moon' || pair.b.label === 'Moon') && pair.sepDeg < OCCULT_SEP_DEG;
}
