// One-off data prep (NOT part of the runtime). Requires Node >=18 and internet (once).
// Run: node tools/build-constellations.mjs
// Builds data/constellations.json for a CURATED subset: d3-celestial figures (BSD-3) for most,
// hand-authored star-pair overrides (resolved from our own stars.json) for ones d3-celestial draws poorly.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC_URL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json';

// 3-letter IAU abbreviation -> full name.
const NAMES = {
  And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aql: 'Aquila', Aqr: 'Aquarius', Ara: 'Ara',
  Ari: 'Aries', Aur: 'Auriga', Boo: 'Bootes', Cae: 'Caelum', Cam: 'Camelopardalis', Cnc: 'Cancer',
  CVn: 'Canes Venatici', CMa: 'Canis Major', CMi: 'Canis Minor', Cap: 'Capricornus', Car: 'Carina',
  Cas: 'Cassiopeia', Cen: 'Centaurus', Cep: 'Cepheus', Cet: 'Cetus', Cha: 'Chamaeleon', Cir: 'Circinus',
  Col: 'Columba', Com: 'Coma Berenices', CrA: 'Corona Australis', CrB: 'Corona Borealis', Crv: 'Corvus',
  Crt: 'Crater', Cru: 'Crux', Cyg: 'Cygnus', Del: 'Delphinus', Dor: 'Dorado', Dra: 'Draco', Equ: 'Equuleus',
  Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini', Gru: 'Grus', Her: 'Hercules', Hor: 'Horologium',
  Hya: 'Hydra', Hyi: 'Hydrus', Ind: 'Indus', Lac: 'Lacerta', Leo: 'Leo', LMi: 'Leo Minor', Lep: 'Lepus',
  Lib: 'Libra', Lup: 'Lupus', Lyn: 'Lynx', Lyr: 'Lyra', Men: 'Mensa', Mic: 'Microscopium', Mon: 'Monoceros',
  Mus: 'Musca', Nor: 'Norma', Oct: 'Octans', Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus',
  Per: 'Perseus', Phe: 'Phoenix', Pic: 'Pictor', Psc: 'Pisces', PsA: 'Piscis Austrinus', Pup: 'Puppis',
  Pyx: 'Pyxis', Ret: 'Reticulum', Sge: 'Sagitta', Sgr: 'Sagittarius', Sco: 'Scorpius', Scl: 'Sculptor',
  Sct: 'Scutum', Ser: 'Serpens', Sex: 'Sextans', Tau: 'Taurus', Tel: 'Telescopium', Tri: 'Triangulum',
  TrA: 'Triangulum Australe', Tuc: 'Tucana', UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela',
  Vir: 'Virgo', Vol: 'Volans', Vul: 'Vulpecula',
};

const NAME_TO_ABBR = Object.fromEntries(Object.entries(NAMES).map(([abbr, name]) => [name, abbr]));

// Curated subset of well-known / navigation constellations to ship.
const CURATED = new Set([
  'Andromeda', 'Aquila', 'Auriga', 'Bootes', 'Canis Major', 'Canis Minor', 'Cassiopeia', 'Cepheus',
  'Crux', 'Cygnus', 'Draco', 'Gemini', 'Leo', 'Lyra', 'Orion', 'Pegasus', 'Perseus', 'Sagittarius',
  'Scorpius', 'Taurus', 'Ursa Major', 'Ursa Minor',
]);

// Hand-authored figure overrides: segments between two of OUR stars (by proper name). Each pair is
// one drawn line. Used for constellations whose d3-celestial figure connects stars poorly.
const OVERRIDES = {
  Orion: [
    ['Betelgeuse', 'Bellatrix'],
    ['Betelgeuse', 'Alnitak'],
    ['Bellatrix', 'Mintaka'],
    ['Mintaka', 'Alnilam'],
    ['Alnilam', 'Alnitak'],
    ['Alnitak', 'Saiph'],
    ['Mintaka', 'Rigel'],
    ['Meissa', 'Betelgeuse'],
    ['Meissa', 'Bellatrix'],
  ],
};

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'data', 'constellations.json');
const STARS = join(__dir, '..', 'data', 'stars.json');
const wrapRa = (ra) => ((ra % 360) + 360) % 360;
const round = (v) => Math.round(v * 100) / 100;

// proper-name -> [ra, dec] from our catalog, for resolving overrides.
const stars = JSON.parse(await readFile(STARS, 'utf8'));
const starPos = new Map();
for (const s of stars) if (s.name && !starPos.has(s.name)) starPos.set(s.name, [s.ra, s.dec]);
function resolve(name) {
  const p = starPos.get(name);
  if (!p) throw new Error(`override star not found in stars.json: "${name}"`);
  return p;
}

// Angular separation (deg) between two RA/Dec points.
function sepDeg(ra1, d1, ra2, d2) {
  const r = Math.PI / 180;
  const a = Math.sin(d1 * r) * Math.sin(d2 * r) + Math.cos(d1 * r) * Math.cos(d2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, Math.max(-1, a))) / r;
}
// Snap a [ra,dec] vertex to the exact coords of the nearest catalog star within 0.5 deg (else unchanged).
function snapToStar([ra, dec]) {
  let best = null, bd = 0.5;
  for (const s of stars) {
    const d = sepDeg(ra, dec, s.ra, s.dec);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? [best.ra, best.dec] : [ra, dec];
}

// Label position: circular mean RA (handles 0h/360h wrap) + plain mean Dec.
function centroid(pts) {
  const sin = pts.reduce((s, p) => s + Math.sin(p[0] * Math.PI / 180), 0);
  const cos = pts.reduce((s, p) => s + Math.cos(p[0] * Math.PI / 180), 0);
  const ra = wrapRa(Math.atan2(sin, cos) * 180 / Math.PI);
  const dec = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [round(ra), round(dec)];
}

const res = await fetch(SRC_URL);
if (!res.ok) throw new Error(`source download failed: ${res.status} ${res.statusText}`);
const geo = await res.json();

const out = [];

// 1) Hand-authored overrides first.
for (const [name, segs] of Object.entries(OVERRIDES)) {
  if (!CURATED.has(name)) continue;
  const lines = segs.map(([a, b]) => [resolve(a), resolve(b)]);
  out.push({ name, abbr: NAME_TO_ABBR[name] || name, label: centroid(lines.flat()), lines });
}

// 2) d3-celestial figures for the rest of the curated set.
for (const f of geo.features || []) {
  const name = NAMES[f.id] || f.id || 'Unknown';
  if (!CURATED.has(name) || OVERRIDES[name]) continue;
  const geom = f.geometry || {};
  let polylines;
  if (geom.type === 'MultiLineString') polylines = geom.coordinates;
  else if (geom.type === 'LineString') polylines = [geom.coordinates];
  else continue;
  const lines = [];
  const allPts = [];
  for (const poly of polylines) {
    const pts = poly.map(([lon, lat]) => { const ra = round(wrapRa(lon)); const dec = round(lat); allPts.push([ra, dec]); return [ra, dec]; });
    if (pts.length >= 2) lines.push(pts);
  }
  if (!lines.length) continue;
  out.push({ name, abbr: f.id, label: centroid(allPts), lines });
}

// Snap every figure vertex to exact star coordinates so editor clicks (which use catalog coords)
// match the segment endpoints precisely, then recompute the label from the snapped points.
for (const c of out) {
  c.lines = c.lines.map((seg) => seg.map((p) => snapToStar(p)));
  c.label = centroid(c.lines.flat());
}

out.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${out.length} curated constellations to ${OUT} (overrides: ${Object.keys(OVERRIDES).join(', ')})`);
