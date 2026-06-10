// Keplerian ephemerides for planetary moons (everything EXCEPT Jupiter's Galileans, which use the
// vendored L1.2 theory in astro.js). Pure math, no vendor import. Each row is a JPL mean-element set
// referred to the moon's local Laplace plane (pole in ICRF; angles from the plane's ascending node on
// the ICRF equator — JPL's published convention). moonOffsetEqjAu() propagates a row to a planet-centred
// offset in J2000-equatorial (ICRF) axes. Oracle-tested against JPL Horizons in tests/planet-moons.test.js.
import { degToRad } from './angles.js';

const AU_KM = 149597870.7;

// { planet, name, mag, a_km, e, i_deg, node_deg (Ω), peri_deg (ω), M0_deg (M at epoch),
//   n_degPerDay, epochJd (TT), poleRa_deg, poleDec_deg,
//   periDot_degPerDay?, nodeDot_degPerDay? (secular apsidal/nodal precession; 0 if omitted) }
// Provenance commented per row.
// Sourcing (all JPL, fetched 2026-06-09):
// - Laplace-plane poles: ssd.jpl.nasa.gov/sats/elem (MAR099 / SAT441 / NEP097 solutions).
// - Epoch elements: osculating elements at JD 2461041.5 TDB computed from JPL Horizons
//   planet-centred ICRF state vectors (EPHEM_TYPE=VECTORS, REF_PLANE=FRAME, VEC_TABLE=2)
//   rotated into each moon's Laplace frame, with Horizons GM (Mars 42828.375662,
//   Saturn 37931206.234, Neptune 6835099.97 km^3/s^2).
// - Secular rates (n, periDot, nodeDot): differenced Horizons elements over pre-epoch
//   baselines (10 d -> 365 d -> 3650 d bootstrap unwrap, all instants <= epoch, so the
//   oracle's second instant is a genuine 159-day extrapolation). For near-circular moons
//   the peri/M split is noisy, but n is derived with the SAME measured apsis rate used in
//   periDot, so the noise cancels in the argument of latitude (residual effect < 2e of a).
//   The published periods cross-check: e.g. Phobos thetaDot 1128.8449 deg/day == the
//   sidereal mean motion, and periDot +0.8713 / nodeDot -0.4363 match oblateness theory.
// - Uranus rows: Horizons osculating elements at JD 2461041.5 (REF_PLANE=FRAME -> ICRF
//   axes, identity pole); n = 360/P from ssd.jpl.nasa.gov/sats/elem (URA182). Their
//   precession periods (apsis 580/159 yr, node 1645/193 yr) are negligible -> no rates.
export const MOON_ELEMENTS = [
  // Mars
  { planet: 'Mars', name: 'Phobos', mag: 11.4, a_km: 9378.361, e: 0.0154878, i_deg: 1.10068,
    node_deg: 349.70687, peri_deg: 209.34494, M0_deg: 11.20346, n_degPerDay: 1128.4099528,
    periDot_degPerDay: 0.8712836, nodeDot_degPerDay: -0.4363340,
    epochJd: 2461041.5, poleRa_deg: 317.7, poleDec_deg: 52.9 },
  { planet: 'Mars', name: 'Deimos', mag: 12.5, a_km: 23458.847, e: 0.0003461, i_deg: 1.77247,
    node_deg: 241.71811, peri_deg: 186.51846, M0_deg: 311.16339, n_degPerDay: 285.1379574,
    periDot_degPerDay: 0.0421182, nodeDot_degPerDay: -0.0182393,
    epochJd: 2461041.5, poleRa_deg: 316.6, poleDec_deg: 53.5 },
  // Saturn
  { planet: 'Saturn', name: 'Enceladus', mag: 11.7, a_km: 238411.454, e: 0.0050434, i_deg: 0.03318,
    node_deg: 189.50965, peri_deg: 292.95630, M0_deg: 293.06970, n_degPerDay: 264.3760536,
    periDot_degPerDay: -1.6484587, nodeDot_degPerDay: 0.0043107,
    epochJd: 2461041.5, poleRa_deg: 40.6, poleDec_deg: 83.5 },
  { planet: 'Saturn', name: 'Tethys', mag: 10.2, a_km: 294975.377, e: 0.0011180, i_deg: 1.12936,
    node_deg: 181.09824, peri_deg: 176.83036, M0_deg: 355.23521, n_degPerDay: 180.4905374,
    periDot_degPerDay: 10.4053771, nodeDot_degPerDay: -0.1978330,
    epochJd: 2461041.5, poleRa_deg: 40.6, poleDec_deg: 83.5 },
  { planet: 'Saturn', name: 'Dione', mag: 10.4, a_km: 377654.223, e: 0.0016381, i_deg: 0.06155,
    node_deg: 197.22475, peri_deg: 99.66467, M0_deg: 161.49898, n_degPerDay: 129.4717989,
    periDot_degPerDay: 2.0577451, nodeDot_degPerDay: 0.0053871,
    epochJd: 2461041.5, poleRa_deg: 40.6, poleDec_deg: 83.5 },
  { planet: 'Saturn', name: 'Rhea', mag: 9.7, a_km: 527215.792, e: 0.0008830, i_deg: 0.30777,
    node_deg: 98.55675, peri_deg: 98.89548, M0_deg: 271.23456, n_degPerDay: 81.6592932,
    periDot_degPerDay: -1.9432700, nodeDot_degPerDay: -0.0259756,
    epochJd: 2461041.5, poleRa_deg: 40.6, poleDec_deg: 83.5 },
  { planet: 'Saturn', name: 'Titan', mag: 8.4, a_km: 1222247.604, e: 0.0290532, i_deg: 0.35421,
    node_deg: 13.28700, peri_deg: 208.32113, M0_deg: 352.37670, n_degPerDay: 22.5756612,
    periDot_degPerDay: 0.0018477, nodeDot_degPerDay: -0.0005284,
    epochJd: 2461041.5, poleRa_deg: 36.4, poleDec_deg: 84.0 },
  { planet: 'Saturn', name: 'Iapetus', mag: 11.0, a_km: 3558946.483, e: 0.0290530, i_deg: 7.54038,
    node_deg: 72.05678, peri_deg: 280.74979, M0_deg: 102.08098, n_degPerDay: 4.5383113,
    periDot_degPerDay: -0.0001860, nodeDot_degPerDay: -0.0001521,
    epochJd: 2461041.5, poleRa_deg: 288.7, poleDec_deg: 78.9 },
  // Uranus
  { planet: 'Uranus', name: 'Titania', mag: 13.9, a_km: 436267.49, e: 0.0024592,
    i_deg: 74.86673, node_deg: 167.31026, peri_deg: 266.95084, M0_deg: 308.30426,
    n_degPerDay: 360 / 8.705869, epochJd: 2461041.5, poleRa_deg: 0, poleDec_deg: 90 },
  { planet: 'Uranus', name: 'Oberon', mag: 14.1, a_km: 583607.38, e: 0.0021005,
    i_deg: 75.00259, node_deg: 167.39221, peri_deg: 161.64510, M0_deg: 322.38555,
    n_degPerDay: 360 / 13.463237, epochJd: 2461041.5, poleRa_deg: 0, poleDec_deg: 90 },
  // Neptune
  { planet: 'Neptune', name: 'Triton', mag: 13.5, a_km: 354840.391, e: 0.0002201, i_deg: 157.23097,
    node_deg: 190.59655, peri_deg: 38.82882, M0_deg: 2.35203, n_degPerDay: 72.9860776,
    periDot_degPerDay: -11.7273547, nodeDot_degPerDay: 0.0014576,
    epochJd: 2461041.5, poleRa_deg: 299.8, poleDec_deg: 43.1 },
];

// Orthonormal basis of a reference plane from its pole (ICRF RA/Dec): z = pole, x = the plane's
// ascending node on the ICRF equator (ẑ × z), y completes. Degenerates to identity at the ICRF pole
// itself (the fallback frame for Horizons-sourced elements).
function planeBasis(raDeg, decDeg) {
  const ra = degToRad(raDeg), dec = degToRad(decDeg);
  const z = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const m = Math.hypot(-z[1], z[0]);
  const x = m < 1e-9 ? [1, 0, 0] : [-z[1] / m, z[0] / m, 0];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { x, y, z };
}

// Planet-centred moon offset (AU, J2000-equatorial axes) at a TT Julian date.
export function moonOffsetEqjAu(row, jdTT) {
  const dt = jdTT - row.epochJd;
  const M = degToRad(row.M0_deg + row.n_degPerDay * dt);
  const e = row.e;
  let E = M;                                            // Kepler: E - e sinE = M (Newton iteration)
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const r = row.a_km * (1 - e * Math.cos(E));
  const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  const peri = row.peri_deg + (row.periDot_degPerDay || 0) * dt;
  const node = row.node_deg + (row.nodeDot_degPerDay || 0) * dt;
  const u = nu + degToRad(peri);                        // argument of latitude
  const cu = Math.cos(u), su = Math.sin(u);
  const ci = Math.cos(degToRad(row.i_deg)), si = Math.sin(degToRad(row.i_deg));
  const cO = Math.cos(degToRad(node)), sO = Math.sin(degToRad(node));
  const X = r * (cO * cu - sO * su * ci);               // in the reference (Laplace) plane
  const Y = r * (sO * cu + cO * su * ci);
  const Z = r * (su * si);
  const B = planeBasis(row.poleRa_deg, row.poleDec_deg); // -> ICRF axes
  return [
    (B.x[0] * X + B.y[0] * Y + B.z[0] * Z) / AU_KM,
    (B.x[1] * X + B.y[1] * Y + B.z[1] * Z) / AU_KM,
    (B.x[2] * X + B.y[2] * Y + B.z[2] * Z) / AU_KM,
  ];
}
