// Pure: the major annual meteor showers + which one is peaking on a given date. No astronomy import —
// the radiant is just RA/Dec (degrees, J2000); main.js converts it to alt/az.

export const SHOWERS = [
  { name: 'Quadrantids',     peakMonth: 1,  peakDay: 3,  zhr: 110, radiantRa: 230.0, radiantDec: 49.0, con: 'Boo' },
  { name: 'Lyrids',          peakMonth: 4,  peakDay: 22, zhr: 18,  radiantRa: 271.0, radiantDec: 34.0, con: 'Lyr' },
  { name: 'Eta Aquariids',   peakMonth: 5,  peakDay: 6,  zhr: 50,  radiantRa: 338.0, radiantDec: -1.0, con: 'Aqr' },
  { name: 'Delta Aquariids', peakMonth: 7,  peakDay: 30, zhr: 25,  radiantRa: 340.0, radiantDec: -16.0, con: 'Aqr' },
  { name: 'Perseids',        peakMonth: 8,  peakDay: 12, zhr: 100, radiantRa: 48.0,  radiantDec: 58.0, con: 'Per' },
  { name: 'Orionids',        peakMonth: 10, peakDay: 21, zhr: 20,  radiantRa: 95.0,  radiantDec: 16.0, con: 'Ori' },
  { name: 'Leonids',         peakMonth: 11, peakDay: 17, zhr: 15,  radiantRa: 152.0, radiantDec: 22.0, con: 'Leo' },
  { name: 'Geminids',        peakMonth: 12, peakDay: 14, zhr: 120, radiantRa: 112.0, radiantDec: 33.0, con: 'Gem' },
  { name: 'Ursids',          peakMonth: 12, peakDay: 22, zhr: 10,  radiantRa: 217.0, radiantDec: 76.0, con: 'UMi' },
];

const DAY_MS = 86400000;

// The shower peaking within ±windowDays (calendar days) of `date`, highest ZHR on a tie, else null.
// Checks the peak in date's year and the adjacent years so the Dec/Jan boundary resolves.
// `showers` is injectable for testing.
export function activeShower(date, { windowDays = 1, showers = SHOWERS } = {}) {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()); // local midnight of `date`
  let best = null;
  for (const s of showers) {
    for (const yr of [d0.getFullYear() - 1, d0.getFullYear(), d0.getFullYear() + 1]) {
      const peak = new Date(yr, s.peakMonth - 1, s.peakDay);
      const days = Math.round((d0.getTime() - peak.getTime()) / DAY_MS);
      if (Math.abs(days) <= windowDays) {
        if (!best || s.zhr > best.zhr) best = s;
        break; // this shower matched (in one of the 3 years) — stop checking its other years
      }
    }
  }
  return best;
}
