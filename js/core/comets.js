// Keplerian ephemerides for famous comets. Same pattern as planet-moons.js (per-row mean elements,
// pure math, no vendor import) with two differences: elements are HELIOCENTRIC ecliptic-J2000
// (JPL's comet convention) parameterized by perihelion distance + time (works for both elliptic and
// hyperbolic orbits), and the Kepler solver is robust at the high eccentricities comets live at
// (Halley e≈0.967, C/2023 A3 slightly hyperbolic). Oracle-tested against JPL Horizons in
// tests/comets.test.js.
//
// Comets get one element set PER APPARITION: two-body propagation from a single fit degrades across
// perihelion passages (planetary tugs + outgassing thrust), so each set carries a validity window
// [validFromJd, validToJd] and activeCometSet() picks the nearest-epoch set covering the viewed
// date — or null, in which case the app shows no position rather than a wrong one. Windows never
// span a perihelion passage other than their own epoch's apparition (timing error explodes across
// passages the fit didn't cover); older apparitions mean adding more element sets, not wider windows.
//
// Sourcing (all JPL Horizons, fetched 2026-06-11 via scripts/fetch-comet-data.mjs):
// osculating elements at the listed epochs (EPHEM_TYPE=ELEMENTS, CENTER='500@10',
// REF_PLANE=ECLIPTIC, OUT_UNITS=AU-D); M1/K1 total-magnitude parameters from the same outputs.
import { degToRad } from './angles.js';

const K_GAUSS = 0.01720209894846; // Gaussian gravitational constant (rad/day at 1 AU)
const OBLIQ_RAD = degToRad(23.4392911); // J2000 mean obliquity: ecliptic -> equatorial tilt

// { id, name, aliases, color, blurb, M1, K1 (total magnitude: m = M1 + 5 log10(delta) + K1 log10(r)),
//   sets: [{ epochJd (TT), tpJd (perihelion, TT), q_au, e, i_deg, node_deg (Ω), peri_deg (ω),
//            validFromJd, validToJd }] }
export const COMETS = [
  {
    id: '1P', name: "Halley's Comet", aliases: ['1P/Halley', 'Halley'], color: '#bfe8d4',
    blurb: "The most famous comet of all — a 76-year visitor recorded since 240 BC. Last rounded the Sun in 1986; returns mid-2061.",
    M1: 5.5, K1: 8,
    sets: [
      { epochJd: 2446480.5, tpJd: 2446470.958933524787, q_au: 5.871033763076781E-01, e: 9.672763179559829E-01, i_deg: 1.622422049003670E+02, node_deg: 5.886003968826766E+01, peri_deg: 1.118655686627084E+02,
        validFromJd: 2429629.5, validToJd: 2459945.5 },  // 1940 -> 2023 (the 1910 apparition needs its own set)
      { epochJd: 2474060.5, tpJd: 2474034.220472256187, q_au: 5.927916209241441E-01, e: 9.665766582909432E-01, i_deg: 1.619642637219489E+02, node_deg: 5.939295491450621E+01, peri_deg: 1.120543666292265E+02,
        validFromJd: 2459945.5, validToJd: 2491721.5 },  // 2023 -> 2110
    ],
  },
  {
    id: '2P', name: 'Comet Encke', aliases: ['2P/Encke', 'Encke'], color: '#bfe8d4',
    blurb: 'The shortest-period comet known — it loops the Sun every 3.3 years. Its debris feeds the Taurid meteor showers.',
    M1: 15.6, K1: 4.5,
    sets: [
      { epochJd: 2450600.5, tpJd: 2450592.096815794706, q_au: 3.313955506196204E-01, e: 8.500132780687378E-01, i_deg: 1.192955112567405E+01, node_deg: 3.347216339436720E+02, peri_deg: 1.862719134309839E+02,
        validFromJd: 2447892.5, validToJd: 2455197.5 },  // 1990 -> 2010 (3.3-yr period: keep windows tight)
      { epochJd: 2460200.5, tpJd: 2460240.028188652825, q_au: 3.396006092129772E-01, e: 8.469375058584151E-01, i_deg: 1.133651206337530E+01, node_deg: 3.340195053119284E+02, peri_deg: 1.872866943744607E+02,
        validFromJd: 2455197.5, validToJd: 2466154.5 },  // 2010 -> 2040
    ],
  },
  {
    id: '55P', name: 'Comet Tempel–Tuttle', aliases: ['55P/Tempel-Tuttle', 'Tempel-Tuttle'], color: '#bfe8d4',
    blurb: 'Parent of the Leonid meteor shower and its famous storms. A 33-year orbit; next perihelion in 2031.',
    M1: 10, K1: 25,
    sets: [
      { epochJd: 2450870.5, tpJd: 2450872.596577623393, q_au: 9.765853282690689E-01, e: 9.054977278111023E-01, i_deg: 1.624861444106764E+02, node_deg: 2.352586260780161E+02, peri_deg: 1.724969591094720E+02,
        validFromJd: 2444239.5, validToJd: 2457023.5 },  // 1980 -> 2015
      { epochJd: 2462990.5, tpJd: 2463007.479908925481, q_au: 9.643700769280797E-01, e: 9.077726838035598E-01, i_deg: 1.625750090167434E+02, node_deg: 2.356106509506974E+02, peri_deg: 1.728678752664483E+02,
        validFromJd: 2457023.5, validToJd: 2469807.5 },  // 2015 -> 2050 (next perihelion ~2064 needs its own set)
    ],
  },
  {
    id: '109P', name: 'Comet Swift–Tuttle', aliases: ['109P/Swift-Tuttle', 'Swift-Tuttle'], color: '#bfe8d4',
    blurb: "Parent of the Perseid meteor shower — every August, Earth crosses the dust it left behind. Returns in 2126.",
    M1: 4.5, K1: 15,
    sets: [
      { epochJd: 2448980.5, tpJd: 2448969.178090571426, q_au: 9.582270997783995E-01, e: 9.635926096767403E-01, i_deg: 1.134262335504169E+02, node_deg: 1.394442758070270E+02, peri_deg: 1.530011637611632E+02,
        validFromJd: 2415020.5, validToJd: 2473459.5 },  // 1900 -> 2060
      { epochJd: 2497560.5, tpJd: 2497757.904330782127, q_au: 9.562819493077835E-01, e: 9.638816570001715E-01, i_deg: 1.134067730208237E+02, node_deg: 1.396058010165702E+02, peri_deg: 1.531155862587492E+02,
        validFromJd: 2473459.5, validToJd: 2524593.5 },  // 2060 -> 2200
    ],
  },
  {
    id: 'C/1995 O1', name: 'Comet Hale–Bopp', aliases: ['Hale-Bopp'], color: '#bfe8d4',
    blurb: 'The great comet of 1997 — naked-eye for a record 18 months, with twin blue-and-white tails.',
    M1: 4.8, K1: 4,
    sets: [
      { epochJd: 2450539.5, tpJd: 2450539.633099367842, q_au: 9.141695067003724E-01, e: 9.951314746156615E-01, i_deg: 8.943017155012492E+01, node_deg: 2.824706028668530E+02, peri_deg: 1.305872524854533E+02,
        validFromJd: 2433282.5, validToJd: 2488069.5 },  // 1950 -> 2100
    ],
  },
  {
    id: 'C/2020 F3', name: 'Comet NEOWISE', aliases: ['NEOWISE'], color: '#bfe8d4',
    blurb: 'The surprise comet of July 2020, hanging over dawn and dusk skies worldwide.',
    M1: 12.1, K1: 12.25,
    sets: [
      { epochJd: 2459036.5, tpJd: 2459034.178898043931, q_au: 2.946512493809076E-01, e: 9.991780262529000E-01, i_deg: 1.289375027594809E+02, node_deg: 6.101042818536988E+01, peri_deg: 3.727865844812243E+01,
        validFromJd: 2447892.5, validToJd: 2488069.5 },  // 1990 -> 2100
    ],
  },
  {
    id: 'C/2023 A3', name: 'Comet Tsuchinshan–ATLAS', aliases: ['Tsuchinshan-ATLAS'], color: '#bfe8d4',
    blurb: 'The bright comet of October 2024 — a once-in-80,000-years visitor that posed for photos worldwide.',
    M1: 8.9, K1: 5.5,
    sets: [
      { epochJd: 2460588.5, tpJd: 2460581.241736884229, q_au: 3.914206168828384E-01, e: 1.000040116532910E+00, i_deg: 1.391105312851733E+02, node_deg: 2.155947224467289E+01, peri_deg: 3.084891449925868E+02,
        validFromJd: 2451544.5, validToJd: 2488069.5 },  // 2000 -> 2100
    ],
  },
];

// Elliptic Kepler: E - e sinE = M. Newton with a sign-aware start at π for high e (the classic
// fixed start at M diverges near perihelion as e -> 1). M wrapped to (-π, π].
function keplerE(M, e) {
  M -= 2 * Math.PI * Math.round(M / (2 * Math.PI));
  let E = e < 0.8 ? M : Math.PI * (M < 0 ? -1 : 1);
  for (let k = 0; k < 80; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// Hyperbolic Kepler: e sinhH - H = M. Newton from asinh(M/e) (monotone, converges for all M).
function keplerH(M, e) {
  let H = Math.asinh(M / e);
  for (let k = 0; k < 80; k++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return H;
}

// Heliocentric comet position (AU, J2000-equatorial axes) at a TT Julian date, from one element set.
// Perifocal -> ecliptic-J2000 (same rotation as planet-moons), then one obliquity tilt -> equatorial.
export function cometHelioEqjAu(set, jdTT) {
  const dt = jdTT - set.tpJd;
  const e = set.e;
  let r, nu;
  if (e < 1) {
    const a = set.q_au / (1 - e);
    const E = keplerE(K_GAUSS * Math.pow(a, -1.5) * dt, e);
    r = a * (1 - e * Math.cos(E));
    nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  } else {
    const a = set.q_au / (1 - e); // negative for hyperbolic
    const H = keplerH(K_GAUSS * Math.pow(-a, -1.5) * dt, e);
    r = a * (1 - e * Math.cosh(H));
    nu = 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));
  }
  const u = nu + degToRad(set.peri_deg); // argument of latitude
  const cu = Math.cos(u), su = Math.sin(u);
  const ci = Math.cos(degToRad(set.i_deg)), si = Math.sin(degToRad(set.i_deg));
  const cO = Math.cos(degToRad(set.node_deg)), sO = Math.sin(degToRad(set.node_deg));
  const X = r * (cO * cu - sO * su * ci); // ecliptic J2000
  const Y = r * (sO * cu + cO * su * ci);
  const Z = r * (su * si);
  const ce = Math.cos(OBLIQ_RAD), se = Math.sin(OBLIQ_RAD);
  return [X, Y * ce - Z * se, Y * se + Z * ce];
}

// The element set covering jdTT whose epoch is nearest it, or null (no trustworthy position).
export function activeCometSet(comet, jdTT) {
  let best = null;
  for (const s of comet.sets) {
    if (jdTT < s.validFromJd || jdTT > s.validToJd) continue;
    if (!best || Math.abs(jdTT - s.epochJd) < Math.abs(jdTT - best.epochJd)) best = s;
  }
  return best;
}

// JPL total-magnitude model: M1 + distance dimming + activity brightening toward the Sun.
export function cometMagnitude(M1, K1, rAu, deltaAu) {
  return M1 + 5 * Math.log10(deltaAu) + K1 * Math.log10(rAu);
}

const jdToYear = (jd) => new Date((jd - 2440587.5) * 86400000).getUTCFullYear();

// "1900–2110" — the span of all validity windows, for the out-of-coverage card line.
export function cometCoverage(comet) {
  const from = Math.min(...comet.sets.map((s) => s.validFromJd));
  const to = Math.max(...comet.sets.map((s) => s.validToJd));
  return `${jdToYear(from)}–${jdToYear(to)}`;
}
