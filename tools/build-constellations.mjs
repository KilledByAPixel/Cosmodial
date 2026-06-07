// One-off data prep (NOT part of the runtime). Requires Node >=18 and internet (once).
// Run: node tools/build-constellations.mjs
// Converts the d3-celestial constellation-lines dataset into data/constellations.json (RA/Dec polylines).
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// d3-celestial constellation lines (BSD-3-Clause, Olaf Frohn).
const SRC_URL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json';

// 3-letter IAU abbreviation -> full name (88 constellations).
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

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'data', 'constellations.json');
const wrapRa = (ra) => ((ra % 360) + 360) % 360; // normalize to [0,360)
const round = (v) => Math.round(v * 100) / 100;

const res = await fetch(SRC_URL);
if (!res.ok) throw new Error(`source download failed: ${res.status} ${res.statusText} — verify SRC_URL`);
const geo = await res.json();
const features = geo.features || [];
if (!features.length) throw new Error('no features in source — re-check the dataset structure');

const out = [];
for (const f of features) {
  const abbr = f.id || (f.properties && (f.properties.id || f.properties.abbr));
  const name = NAMES[abbr] || abbr || 'Unknown';
  const geom = f.geometry || {};
  let polylines;
  if (geom.type === 'MultiLineString') polylines = geom.coordinates;
  else if (geom.type === 'LineString') polylines = [geom.coordinates];
  else continue;

  const lines = [];
  const allPts = [];
  for (const poly of polylines) {
    const pts = poly.map(([lon, lat]) => {
      const ra = round(wrapRa(lon));
      const dec = round(lat);
      allPts.push([ra, dec]);
      return [ra, dec];
    });
    if (pts.length >= 2) lines.push(pts);
  }
  if (!lines.length) continue;

  // RA is circular: average unit vectors (atan2 of mean sin/cos) so labels for constellations that
  // straddle RA 0h/360h land on the figure, not on the far side. Dec is a plain mean.
  const sinSum = allPts.reduce((s, p) => s + Math.sin(p[0] * Math.PI / 180), 0);
  const cosSum = allPts.reduce((s, p) => s + Math.cos(p[0] * Math.PI / 180), 0);
  const cx = wrapRa(Math.atan2(sinSum, cosSum) * 180 / Math.PI);
  const cy = allPts.reduce((s, p) => s + p[1], 0) / allPts.length;
  out.push({ name, label: [round(cx), round(cy)], lines });
}

out.sort((a, b) => a.name.localeCompare(b.name));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${out.length} constellations to ${OUT}`);
