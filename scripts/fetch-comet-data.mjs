// Fetch JPL Horizons data for the comet catalogue (js/core/comets.js): osculating heliocentric
// ecliptic-J2000 elements at each apparition epoch, Sun-centred ICRF state vectors for the
// propagation oracle (tests/comets.test.js), and topocentric az/el spot checks for the astro-layer
// oracle (tests/comets-astro.test.js). Writes raw Horizons text to local/comets/.
// Run once: node scripts/fetch-comet-data.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUT = 'local/comets';

// Periodic comets have one Horizons record per apparition: CAP<JD picks the fit nearest before JD,
// bare CAP the current one (which Horizons integrates to future epochs, e.g. Halley 2061).
const TARGETS = [
  { file: '1P-1986', command: 'DES=1P; CAP<2447000;', epochJd: 2446480.5 },
  { file: '1P-2061', command: 'DES=1P; CAP;', epochJd: 2474060.5 },
  { file: '2P-1997', command: 'DES=2P; CAP<2450800;', epochJd: 2450600.5 },
  { file: '2P-2023', command: 'DES=2P; CAP;', epochJd: 2460200.5 },
  { file: '55P-1998', command: 'DES=55P; CAP<2451200;', epochJd: 2450870.5 },
  { file: '55P-2031', command: 'DES=55P; CAP;', epochJd: 2462990.5 },
  { file: '109P-1992', command: 'DES=109P; CAP<2449400;', epochJd: 2448980.5 },
  { file: '109P-2126', command: 'DES=109P; CAP;', epochJd: 2497560.5 },
  { file: 'C1995O1', command: 'DES=C/1995 O1; CAP;', epochJd: 2450539.5 },
  { file: 'C2020F3', command: 'DES=C/2020 F3; CAP;', epochJd: 2459036.5 },
  { file: 'C2023A3', command: 'DES=C/2023 A3; CAP;', epochJd: 2460588.5 },
];

// Topocentric az/el fixtures: one night each for two comets near their bright apparitions.
// SITE_COORD is east-longitude, latitude, altitude(km).
const AZEL = [
  { file: 'azel-1P-1986', command: 'DES=1P; CAP<2447000;', site: '289.26,-30.24,2.4',
    start: '1986-03-15 02:00', stop: '1986-03-15 10:00' }, // pre-dawn from Chile
  { file: 'azel-C1995O1-1997', command: 'DES=C/1995 O1; CAP;', site: '0,51.48,0',
    start: '1997-04-01 19:00', stop: '1997-04-02 03:00' }, // evening from Greenwich
];

async function query(file, params) {
  const url = `${API}?${new URLSearchParams({ format: 'text', ...params })}`;
  const res = await fetch(url);
  const text = await res.text();
  await writeFile(`${OUT}/${file}.txt`, text);
  const ok = text.includes('$$SOE');
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}.txt${ok ? '' : ' — no $$SOE, read the file for the Horizons error'}`);
}

await mkdir(OUT, { recursive: true });
for (const t of TARGETS) {
  await query(`${t.file}-elements`, {
    COMMAND: `'${t.command}'`, EPHEM_TYPE: 'ELEMENTS', CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'", OUT_UNITS: "'AU-D'", TLIST: `'${t.epochJd}'`, CSV_FORMAT: "'NO'",
  });
  await query(`${t.file}-vectors`, {
    COMMAND: `'${t.command}'`, EPHEM_TYPE: 'VECTORS', CENTER: "'500@10'",
    REF_PLANE: "'FRAME'", OUT_UNITS: "'AU-D'", VEC_TABLE: "'1'",
    TLIST: `'${t.epochJd}' '${t.epochJd + 120}'`, CSV_FORMAT: "'NO'",
  });
}
for (const a of AZEL) {
  await query(a.file, {
    COMMAND: `'${a.command}'`, EPHEM_TYPE: 'OBSERVER', CENTER: "'coord@399'",
    COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${a.site}'`, QUANTITIES: "'4'",
    APPARENT: "'AIRLESS'", START_TIME: `'${a.start}'`, STOP_TIME: `'${a.stop}'`, STEP_SIZE: "'1 h'",
  });
}
