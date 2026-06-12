// Satellite tracking (the ISS and Tiangong). The ONLY module that imports the satellite.js vendor
// (SGP4) — the same rule astro.js enforces for astronomy-engine. Inputs/outputs are in DEGREES.
//
// TLE data is strictly OPTIONAL: one runtime fetch of CelesTrak's stations group (CORS-enabled,
// no key) covers every catalog satellite, with wheretheiss.at as an ISS-only fallback, cached in
// localStorage between sessions. No network and no cache simply means no satellites this
// session — never an error, never a dependency.
import * as sat from '../vendor/satellite.js';

const DEG = Math.PI / 180;
const DAY_MS = 86400000;
const EARTH_RADIUS_KM = 6371;

// The catalog: the only two satellites a naked-eye stargazer reliably notices. Everything else in
// CelesTrak's stations group (modules, freighters, debris) stays out — anonymous moving dots read
// as noise, not realism. stdMag is the apparent magnitude at 1000 km range, half phase.
export const SATELLITES = [
  {
    id: 'ISS', noradId: 25544, label: 'ISS', title: 'ISS (Space Station)',
    aliases: ['International Space Station', 'Space Station'],
    blurb: "The International Space Station — humanity's outpost in orbit, around the Earth every 93 minutes.",
    stdMag: -1.8, // the classic ISS figure: rivals Venus overhead
  },
  {
    id: 'Tiangong', noradId: 48274, label: 'Tiangong', title: 'Tiangong (Space Station)',
    aliases: ['Chinese Space Station', 'CSS', 'Tianhe'],
    blurb: "Tiangong — China's space station, around the Earth every 92 minutes.",
    stdMag: -0.4, // smaller than the ISS: a magnitude and a half dimmer, still an easy naked-eye light
  },
];

// Hide a satellite when its TLE is staler than this relative to the VIEWED time: atmospheric drag
// and reboosts make older predictions drift visibly, and time-travel past the window would show
// pure fiction. Mirrors the comets' per-apparition coverage windows: out of range -> simply absent.
export const TLE_MAX_AGE_DAYS = 10;

// TLE lines -> satellite record, or null when the lines don't parse cleanly. The vendor happily
// returns a NaN-filled record (error still 0) for garbage input, so check the fields that matter.
export function parseTle(line1, line2) {
  try {
    const rec = sat.twoline2satrec(line1, line2);
    const sane = rec && rec.error === 0 && Number.isFinite(rec.jdsatepoch) && Number.isFinite(rec.no) && rec.no > 0;
    return sane ? rec : null;
  } catch {
    return null;
  }
}

// The TLE's epoch as a JS Date (satrec stores it as a Julian date).
export function tleEpoch(rec) {
  return new Date((rec.jdsatepoch - 2440587.5) * DAY_MS);
}

// Topocentric position at `date`: { alt, az, rangeKm, eciKm } (eciKm feeds the shadow test), or
// null when the viewed time is outside the TLE validity window or the propagation fails.
export function satAltAz(rec, latDeg, lngDeg, date) {
  if (Math.abs(date.getTime() - tleEpoch(rec).getTime()) > TLE_MAX_AGE_DAYS * DAY_MS) return null;
  let p;
  try { p = sat.propagate(rec, date); } catch { return null; }
  if (!p || !p.position) return null;
  const look = sat.ecfToLookAngles(
    { latitude: latDeg * DEG, longitude: lngDeg * DEG, height: 0 },
    sat.eciToEcf(p.position, sat.gstime(date)),
  );
  const az = ((look.azimuth / DEG) % 360 + 360) % 360;
  return { alt: look.elevation / DEG, az, rangeKm: look.rangeSat, eciKm: p.position };
}

// Cylindrical Earth-shadow test: the station is sunlit unless it sits on the anti-Sun side AND
// within one Earth radius of the shadow axis. sunDir is a geocentric unit vector toward the Sun
// (EQJ from astro.js is fine — the TEME/EQJ difference is arcminutes against a 6371 km cylinder).
export function isSunlit(eciKm, sunDir) {
  const d = eciKm.x * sunDir.x + eciKm.y * sunDir.y + eciKm.z * sunDir.z;
  if (d > 0) return true;
  return Math.hypot(eciKm.x - d * sunDir.x, eciKm.y - d * sunDir.y, eciKm.z - d * sunDir.z) > EARTH_RADIUS_KM;
}

// Rough apparent magnitude from range alone (stdMag at 1000 km, phase ignored): the ISS lands at
// -3.7-ish overhead and around 0 near the horizon. Plenty for marker glow sizing.
export function satMagnitude(rangeKm, stdMag = -1.8) {
  return stdMag + 5 * Math.log10(rangeKm / 1000);
}

// Next WATCHABLE pass after `from`: the satellite above minAltDeg while the sky is dark (Sun below
// -6) and the station is still in sunlight. Returns { start, end, peakDate, peakAlt, peakAz,
// startAz, endAz } bracketing the watchable portion (stations routinely fade into Earth's shadow
// mid-pass), or null when no pass qualifies within `days`. sunAltAt(date)/sunDirAt(date) are
// injected by the caller (astro.js owns the Sun) and only evaluated for above-horizon samples,
// keeping the scan to ~cheap SGP4 calls.
export function findNextVisiblePass(rec, latDeg, lngDeg, from, { sunAltAt, sunDirAt, days = 1.5, stepSec = 30, minAltDeg = 10 } = {}) {
  const done = (v) => ({ start: v.start, end: v.end, peakDate: v.peak.date, peakAlt: v.peak.alt, peakAz: v.peak.az, startAz: v.startAz, endAz: v.endAz });
  let visible = null; // the current pass's watchable samples so far
  for (let t = from.getTime(); t <= from.getTime() + days * DAY_MS; t += stepSec * 1000) {
    const date = new Date(t);
    const pos = satAltAz(rec, latDeg, lngDeg, date);
    const up = pos && pos.alt >= minAltDeg;
    if (up && sunAltAt(date) < -6 && isSunlit(pos.eciKm, sunDirAt(date))) {
      if (!visible) visible = { start: date, end: date, peak: { date, alt: pos.alt, az: pos.az }, startAz: pos.az, endAz: pos.az };
      else {
        visible.end = date;
        visible.endAz = pos.az;
        if (pos.alt > visible.peak.alt) visible.peak = { date, alt: pos.alt, az: pos.az };
      }
    } else if (!up && visible) {
      return done(visible); // dropped below the horizon: the pass is over
    }
    // Still up but shadowed/daylit: keep the window open — it may pop back out before setting.
  }
  return visible ? done(visible) : null;
}

// --- TLE acquisition (browser-only side effects, everything injectable for tests) ---

const TLE_CACHE_KEY = 'cosmodial.satTles';

// CelesTrak group text: name + two TLE lines per satellite; pick out the catalog's by NORAD id.
function parseGroupText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const tles = {};
  for (const s of SATELLITES) {
    const l1 = lines.find((l) => l.startsWith(`1 ${s.noradId}`));
    const l2 = lines.find((l) => l.startsWith(`2 ${s.noradId}`));
    if (l1 && l2) tles[s.id] = { line1: l1, line2: l2 };
  }
  return Object.keys(tles).length ? tles : null;
}

// wheretheiss.at JSON: { line1, line2, ... } — the ISS only, a partial-but-welcome fallback.
function parseWtiaJson(text) {
  try {
    const j = JSON.parse(text);
    return j && j.line1 && j.line2 ? { ISS: { line1: j.line1, line2: j.line2 } } : null;
  } catch {
    return null;
  }
}

const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE', parse: parseGroupText },
  { url: 'https://api.wheretheiss.at/v1/satellites/25544/tles', parse: parseWtiaJson },
];

// Best-effort TLE load: a fresh cache (< maxCacheAgeMs) wins outright; otherwise each source is
// tried in order and the result cached. Every failure falls back to the cache AT ANY AGE (the
// TLE_MAX_AGE_DAYS window downstream decides whether it's still usable against the viewed time).
// Resolves to { fetchedAt, tles: { [satId]: { line1, line2 } } } — possibly covering only some of
// the catalog (the fallback source is ISS-only) — or null. Never rejects.
export async function loadSatTles({ fetchImpl, storage, now = () => Date.now(), maxCacheAgeMs = DAY_MS } = {}) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? (u) => fetch(u) : null);
  const store = storage !== undefined ? storage : (typeof localStorage !== 'undefined' ? localStorage : null);
  let cached = null;
  try {
    const raw = store && store.getItem(TLE_CACHE_KEY);
    const j = raw ? JSON.parse(raw) : null;
    if (j && j.tles && typeof j.tles === 'object' && Number.isFinite(j.fetchedAt)) cached = j;
  } catch { /* unreadable cache = no cache */ }
  if (cached && now() - cached.fetchedAt < maxCacheAgeMs) return cached;
  if (f) {
    for (const src of TLE_SOURCES) {
      try {
        const res = await f(src.url);
        if (!res || !res.ok) continue;
        const parsed = src.parse(await res.text());
        if (!parsed) continue;
        const tles = {};
        for (const [id, t] of Object.entries(parsed)) if (parseTle(t.line1, t.line2)) tles[id] = t;
        if (!Object.keys(tles).length) continue;
        const rec = { fetchedAt: now(), tles };
        try { store && store.setItem(TLE_CACHE_KEY, JSON.stringify(rec)); } catch { /* full/blocked storage is fine */ }
        return rec;
      } catch { /* offline or blocked: try the next source */ }
    }
  }
  return cached; // possibly stale, possibly null: absence, not error
}
