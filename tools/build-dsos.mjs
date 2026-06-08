// One-off data prep (NOT part of the runtime). Requires Node >=18 and internet (once).
// Run: node tools/build-dsos.mjs
// Pulls position/mag/size/type from OpenNGC for a curated list, merges hand-written blurbs, writes data/dso.json.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// OpenNGC (mattiaverga/OpenNGC), CC-BY-SA. Semicolon-separated. Verify the URL/branch once; OpenNGC
// keys rows by NGC/IC Name and carries a Messier number in the "M" column. Load the addendum too
// (it holds non-NGC objects like the Pleiades). If a column/URL has changed, the guards below throw.
const BASE = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files';
const FILES = [`${BASE}/NGC.csv`, `${BASE}/addendum.csv`];

// Curated showpieces. `key` finds the row: { m: <Messier number> } or { name: '<OpenNGC Name>' }.
// type override only for hybrids OpenNGC types poorly. distLy is hand-curated (well-documented).
const CURATED = [
  { id: 'M31',  name: 'Andromeda Galaxy', key: { m: 31 },  distLy: 2500000, blurb: 'the nearest big spiral galaxy', seen: 'a faint elongated oval; binoculars and dark skies help' },
  { id: 'M42',  name: 'Orion Nebula',     key: { m: 42 },  type: 'nebula', distLy: 1340, blurb: 'a glowing stellar nursery in Orion’s sword', seen: 'a soft grey-green misty patch around a knot of stars' },
  { id: 'M45',  name: 'Pleiades',         key: { m: 45 },  type: 'open cluster', distLy: 444, blurb: 'the Seven Sisters — a sparkling young cluster', seen: 'a tight dipper-shaped knot of bright blue stars, naked-eye' },
  { id: 'M44',  name: 'Beehive Cluster',  key: { m: 44 },  type: 'open cluster', distLy: 577, blurb: 'a swarm of stars in Cancer', seen: 'a faint fuzzy patch to the eye; a field of stars in binoculars' },
  { id: 'M13',  name: 'Hercules Cluster', key: { m: 13 },  type: 'globular cluster', distLy: 25000, blurb: 'the finest globular in the northern sky', seen: 'a round fuzzy ball; grainy with a telescope' },
  { id: 'M57',  name: 'Ring Nebula',      key: { m: 57 },  type: 'nebula', distLy: 2300, blurb: 'a dying star’s smoke ring', seen: 'a tiny grey smoke-ring — a telescope helps' },
  { id: 'M27',  name: 'Dumbbell Nebula',  key: { m: 27 },  type: 'nebula', distLy: 1360, blurb: 'a bright planetary nebula in Vulpecula', seen: 'a soft glowing apple-core shape in binoculars' },
  { id: 'M51',  name: 'Whirlpool Galaxy', key: { m: 51 },  type: 'galaxy', distLy: 31000000, blurb: 'a face-on spiral with a companion', seen: 'a faint round glow; spiral hints need a big scope' },
  { id: 'M81',  name: 'Bode\'s Galaxy', key: { m: 81 }, type: 'galaxy', distLy: 12000000, blurb: 'a bright spiral in Ursa Major', seen: 'an oval glow, bright core; binoculars show it' },
  { id: 'M104', name: 'Sombrero Galaxy',  key: { m: 104 }, type: 'galaxy', distLy: 31000000, blurb: 'an edge-on galaxy with a dark dust lane', seen: 'a small elongated glow; the lane needs a scope' },
  { id: 'M8',   name: 'Lagoon Nebula',    key: { m: 8 },   type: 'nebula', distLy: 4100, blurb: 'a big bright nebula in Sagittarius', seen: 'a misty glow with an embedded cluster, naked-eye in dark skies' },
  { id: 'M20',  name: 'Trifid Nebula',    key: { m: 20 },  type: 'nebula', distLy: 5200, blurb: 'a nebula split by dark dust lanes', seen: 'a faint patch; the trifurcation needs a scope' },
  { id: 'M16',  name: 'Eagle Nebula',     key: { m: 16 },  type: 'nebula', distLy: 7000, blurb: 'home of the Pillars of Creation', seen: 'a cluster wrapped in faint nebulosity' },
  { id: 'M17',  name: 'Omega Nebula',     key: { m: 17 },  type: 'nebula', distLy: 5500, blurb: 'a bright swan-shaped nebula', seen: 'a glowing checkmark/swan shape in binoculars' },
  { id: 'M22',  name: 'Sagittarius Cluster', key: { m: 22 }, type: 'globular cluster', distLy: 10600, blurb: 'one of the brightest globulars', seen: 'a bright round fuzzball low in the south' },
  { id: 'M4',   name: 'M4',               key: { m: 4 },   type: 'globular cluster', distLy: 7200, blurb: 'a nearby loose globular near Antares', seen: 'a dim round glow beside a bright red star' },
  { id: 'M3',   name: 'M3',               key: { m: 3 },   type: 'globular cluster', distLy: 33900, blurb: 'a rich spring globular', seen: 'a compact fuzzy ball' },
  { id: 'M15',  name: 'M15',              key: { m: 15 },  type: 'globular cluster', distLy: 33600, blurb: 'a dense globular in Pegasus', seen: 'a tight bright fuzzball' },
  { id: 'M11',  name: 'Wild Duck Cluster', key: { m: 11 }, type: 'open cluster', distLy: 6200, blurb: 'a rich, compact open cluster', seen: 'a dense fan of faint stars in binoculars' },
  { id: 'M7',   name: 'Ptolemy Cluster',  key: { m: 7 },   type: 'open cluster', distLy: 980, blurb: 'a big bright cluster in the Scorpion’s tail', seen: 'a sparkling naked-eye scatter of stars' },
  { id: 'M6',   name: 'Butterfly Cluster', key: { m: 6 },  type: 'open cluster', distLy: 1600, blurb: 'a butterfly-shaped cluster', seen: 'a small spray of stars near M7' },
  { id: 'M101', name: 'Pinwheel Galaxy',  key: { m: 101 }, type: 'galaxy', distLy: 21000000, mag: 7.86, sizeArcmin: 28.8, blurb: 'a big face-on spiral', seen: 'a large, very faint round glow — dark skies essential' },
  { id: 'M33',  name: 'Triangulum Galaxy', key: { m: 33 }, type: 'galaxy', distLy: 2700000, blurb: 'a nearby face-on spiral', seen: 'a big, very faint glow; easier in binoculars than a scope' },
  { id: 'M97',  name: 'Owl Nebula',       key: { m: 97 },  type: 'nebula', distLy: 2030, blurb: 'a planetary nebula with two dark "eyes"', seen: 'a round grey disc — a scope is needed' },
  { id: 'M64',  name: 'Black Eye Galaxy', key: { m: 64 },  type: 'galaxy', distLy: 17000000, blurb: 'a galaxy with a dark dust "black eye"', seen: 'a small oval glow; the dark lane needs aperture' },
  { id: 'M1',   name: 'Crab Nebula',      key: { m: 1 },   type: 'nebula', distLy: 6500, blurb: 'the wreck of a supernova seen in 1054', seen: 'a faint grey oval smudge' },
  { id: 'M92',  name: 'M92',              key: { m: 92 },  type: 'globular cluster', distLy: 26700, blurb: 'a fine globular overshadowed by M13', seen: 'a compact round fuzzball' },
  { id: 'M63',  name: 'Sunflower Galaxy', key: { m: 63 },  type: 'galaxy', distLy: 29000000, blurb: 'a flocculent spiral in Canes Venatici', seen: 'an elongated faint glow' },
  { id: 'NGC869', name: 'Double Cluster', key: { name: 'NGC0869' }, type: 'open cluster', distLy: 7500, blurb: 'a stunning pair of clusters in Perseus', seen: 'two side-by-side knots of stars, naked-eye in dark skies' },
  { id: 'NGC253', name: 'Sculptor Galaxy', key: { name: 'NGC0253' }, type: 'galaxy', mag: 7.1, distLy: 11400000, blurb: 'a bright edge-on galaxy', seen: 'a long faint streak low in the south' },
];

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'data', 'dso.json');

function parseCSVLine(line) { return line.split(';'); } // OpenNGC is ';'-separated, no quoted commas
const round = (v, p) => { const f = 10 ** p; return Math.round(v * f) / f; };
// OpenNGC RA "HH:MM:SS.ss" -> degrees; Dec "+DD:MM:SS.s" -> degrees.
function raToDeg(s) { const [h, m, sec] = s.split(':').map(Number); return round((h + m / 60 + sec / 3600) * 15, 4); }
function decToDeg(s) { const sign = s.trim().startsWith('-') ? -1 : 1; const [d, m, sec] = s.replace('+', '').split(':').map(Number); return round(sign * (Math.abs(d) + m / 60 + sec / 3600), 4); }

function mapType(code) {
  const t = (code || '').trim();
  if (t.startsWith('G')) return 'galaxy';
  if (t === 'OCl') return 'open cluster';
  if (t === 'GCl') return 'globular cluster';
  if (['PN', 'EmN', 'RfN', 'HII', 'Neb', 'SNR', 'Cl+N'].includes(t)) return 'nebula';
  return null; // unknown -> rely on curated `type` override
}

const rows = new Map();   // Name -> field object
const byMessier = new Map(); // Messier number -> field object
for (const url of FILES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenNGC fetch failed: ${res.status} ${url} — verify BASE/branch`);
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const header = parseCSVLine(lines[0]).map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ['Name', 'Type', 'RA', 'Dec', 'Const', 'MajAx', 'M']) {
    if (!(need in col)) throw new Error(`OpenNGC missing column "${need}" in ${url}. Header: ${header.join(',')}`);
  }
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = parseCSVLine(lines[i]);
    const rec = { f, col };
    rows.set((f[col.Name] || '').trim(), rec);
    const m = parseInt(f[col.M], 10);
    if (Number.isFinite(m)) byMessier.set(m, rec);
  }
}

function field(rec, name) { return (rec.f[rec.col[name]] || '').trim(); }
function num(rec, name) { const v = parseFloat(field(rec, name)); return Number.isFinite(v) ? v : null; }

const out = [];
for (const c of CURATED) {
  const rec = c.key.m != null ? byMessier.get(c.key.m) : rows.get(c.key.name);
  if (!rec) throw new Error(`OpenNGC has no row for ${c.id} (key ${JSON.stringify(c.key)})`);
  const vmag = num(rec, 'V-Mag'); const bmag = num(rec, 'B-Mag');
  const maj = num(rec, 'MajAx'); const min = num(rec, 'MinAx'); const pa = num(rec, 'PosAng');
  const type = c.type || mapType(field(rec, 'Type'));
  if (!type) throw new Error(`${c.id}: unmapped type "${field(rec, 'Type')}" — add a curated type override`);
  out.push({
    id: c.id,
    name: c.name,
    ra: raToDeg(field(rec, 'RA')),
    dec: decToDeg(field(rec, 'Dec')),
    type,
    mag: c.mag ?? vmag ?? bmag ?? 99, // a curated mag is a deliberate override (OpenNGC sometimes has only a B-mag)
    sizeArcmin: maj ?? c.sizeArcmin ?? 5,
    minorArcmin: min,
    angleDeg: pa,
    distLy: c.distLy ?? null,
    con: field(rec, 'Const') || null,
    blurb: c.blurb,
    seen: c.seen,
  });
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${out.length} deep-sky objects to ${OUT}`);
