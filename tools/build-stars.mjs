// One-off data prep (NOT part of the runtime). Requires Node >=18 and internet (once).
// Run: node tools/build-stars.mjs
// Downloads the HYG v4.1 catalog, keeps stars with mag <= 7, trims fields, writes data/stars.json.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// HYG v4.1 (current full release) in astronexus/HYG-Database, default branch "main".
const HYG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const MAG_LIMIT = 7.0;

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', 'data', 'stars.json');

function parseCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') q = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
const round = (v, p) => { const f = 10 ** p; return Math.round(v * f) / f; };

console.log('Downloading HYG catalog (~35 MB)...');
const res = await fetch(HYG_URL);
if (!res.ok) throw new Error(`HYG download failed: ${res.status} ${res.statusText} — verify HYG_URL`);
const text = await res.text();
const lines = text.split(/\r?\n/);
const header = parseCSVLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
for (const need of ['id', 'ra', 'dec', 'mag', 'ci', 'proper', 'con', 'hip']) {
  if (!(need in col)) throw new Error(`HYG missing column "${need}". Header: ${header.join(',')}`);
}

const stars = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const f = parseCSVLine(line);
  const mag = parseFloat(f[col.mag]);
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
  const id = parseInt(f[col.id], 10);
  if (id === 0) continue; // HYG row 0 is the Sun
  const raHours = parseFloat(f[col.ra]);
  const dec = parseFloat(f[col.dec]);
  if (!Number.isFinite(raHours) || !Number.isFinite(dec)) continue;
  const ci = parseFloat(f[col.ci]);
  const hip = parseInt(f[col.hip], 10);
  const proper = (f[col.proper] || '').trim();
  const con = (f[col.con] || '').trim();
  stars.push({
    id,
    ra: round(raHours * 15, 4), // hours -> degrees
    dec: round(dec, 4),
    mag: round(mag, 2),
    bv: Number.isFinite(ci) ? round(ci, 3) : null,
    name: proper || null,
    con: con || null,
    hip: Number.isFinite(hip) ? hip : null,
  });
}
stars.sort((a, b) => a.mag - b.mag);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(stars));
console.log(`Wrote ${stars.length} stars (mag <= ${MAG_LIMIT}) to ${OUT}`);
