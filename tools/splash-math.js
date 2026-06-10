// Pure sky math for the splash generator (tools/splash.html). No DOM and no imports from js/ —
// the tool reads committed data files directly so app refactors can't break it, and this half
// stays testable under plain `node --test`.

const DEG = Math.PI / 180;

// J2000 equatorial -> galactic (IAU 1958) rotation; rows are the galactic basis vectors.
const EQJ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [ 0.4941094279, -0.4448296300,  0.7469822445],
  [-0.8676661490, -0.1980763734,  0.4559837762],
];

// Galactic longitude/latitude in radians, l in (-PI, PI].
export function eqToGalactic(raDeg, decDeg) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  const c = Math.cos(dec);
  const v = [c * Math.cos(ra), c * Math.sin(ra), Math.sin(dec)];
  const M = EQJ_TO_GAL;
  const x = M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2];
  const y = M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2];
  const z = M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2];
  return { l: Math.atan2(y, x), b: Math.asin(Math.max(-1, Math.min(1, z))) };
}

// UV into the galactic equirectangular Milky Way texture. Orientation matches
// js/render/sky-background.js: longitude increases to the LEFT (u = 0.5 - l/2pi) and the
// texture is vertically flipped — south galactic hemisphere at the top (v = 0.5 + b/pi).
// v spans [0,1] inclusive (v=1 exactly at b=+90); clamp pixel indices when sampling.
export function galacticUV(raDeg, decDeg) {
  const { l, b } = eqToGalactic(raDeg, decDeg);
  let u = 0.5 - l / (2 * Math.PI);
  u -= Math.floor(u);
  return { u, v: 0.5 + b / Math.PI };
}

// Stereographic projection about a sky center {ra, dec} (degrees). Plane units: a point at
// angular distance c from the center lands at radius 2*tan(c/2); +x toward increasing RA,
// +y toward increasing Dec. The painter mirrors x so larger RA appears on the LEFT, the way
// the sky looks when you're under it.
export function project(raDeg, decDeg, center) {
  const d = decDeg * DEG, d0 = center.dec * DEG, dra = (raDeg - center.ra) * DEG;
  const sinD = Math.sin(d), cosD = Math.cos(d);
  const sinD0 = Math.sin(d0), cosD0 = Math.cos(d0);
  const denom = 1 + sinD0 * sinD + cosD0 * cosD * Math.cos(dra);
  if (denom < 1e-9) return null; // the center's antipode blows up
  const k = 2 / denom;
  return { x: k * cosD * Math.sin(dra), y: k * (cosD0 * sinD - sinD0 * cosD * Math.cos(dra)) };
}

// Inverse stereographic: plane point -> {ra, dec} in degrees, ra normalized to [0, 360).
export function invProject(x, y, center) {
  const rho = Math.hypot(x, y);
  if (rho < 1e-12) return { ra: center.ra, dec: center.dec };
  const c = 2 * Math.atan(rho / 2);
  const sinC = Math.sin(c), cosC = Math.cos(c);
  const d0 = center.dec * DEG;
  const sinD0 = Math.sin(d0), cosD0 = Math.cos(d0);
  const dec = Math.asin(Math.max(-1, Math.min(1, cosC * sinD0 + (y * sinC * cosD0) / rho)));
  const ra = center.ra * DEG + Math.atan2(x * sinC, rho * cosD0 * cosC - y * sinD0 * sinC);
  let raDeg = ra / DEG;
  raDeg -= 360 * Math.floor(raDeg / 360);
  if (raDeg >= 360) raDeg = 0; // a sub-ulp negative input rounds to exactly 360
  return { ra: raDeg, dec: dec / DEG };
}
