import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOON_ELEMENTS, moonOffsetEqjAu } from '../js/core/planet-moons.js';

const AU_KM = 149597870.7;
// JPL Horizons planet-centred ICRF vectors (km) — fetched once via fetch-fixtures.mjs (see plan).
// EPHEM_TYPE=VECTORS, REF_PLANE=FRAME, VEC_TABLE=1, fetched 2026-06-09 from ssd.jpl.nasa.gov/api/horizons.api.
const FIXTURES = {
  Phobos: [
    { jdTdb: 2461041.5, xyzKm: [-2628.223272465979, -8355.789846470192, -2928.528827295728] },
    { jdTdb: 2461200.5, xyzKm: [-1228.559396167736, 8020.894904293648, 4933.888755127102] },
  ],
  Deimos: [
    { jdTdb: 2461041.5, xyzKm: [10863.68893177189, 20169.95437505683, 5021.956584935375] },
    { jdTdb: 2461200.5, xyzKm: [16363.37960900821, 16795.95426920092, 534.4219958431876] },
  ],
  Mimas: [
    { jdTdb: 2461041.5, xyzKm: [-143810.4364490116, 116038.1746783995, 1193.896731384] },
    { jdTdb: 2461200.5, xyzKm: [151715.4504491394, 111288.0075777776, -19202.3734010855] },
  ],
  Enceladus: [
    { jdTdb: 2461041.5, xyzKm: [-235865.8370892585, -22422.07309841649, 21967.88678984268] },
    { jdTdb: 2461200.5, xyzKm: [-223295.4434388758, -80436.25495271562, 25141.69687512393] },
  ],
  Tethys: [
    { jdTdb: 2461041.5, xyzKm: [-163818.738018959, 244887.7579274892, -3177.981329559368] },
    { jdTdb: 2461200.5, xyzKm: [-266640.5567505318, -122491.4701525173, 26505.61205493878] },
  ],
  Dione: [
    { jdTdb: 2461041.5, xyzKm: [-246118.312387331, -284133.483619931, 41954.48570616019] },
    { jdTdb: 2461200.5, xyzKm: [-44650.46908313091, -374301.0365617811, 31248.53735680587] },
  ],
  Rhea: [
    { jdTdb: 2461041.5, xyzKm: [-267585.4074376423, -450653.605163978, 57058.97220899669] },
    { jdTdb: 2461200.5, xyzKm: [338333.4784359821, -403492.7717406129, 3450.017974438157] },
  ],
  Titan: [
    { jdTdb: 2461041.5, xyzKm: [1111851.3568692, -409723.245139567, -71058.08892330356] },
    { jdTdb: 2461200.5, xyzKm: [1017311.364457553, -612757.1819351936, -49041.04018672806] },
  ],
  Iapetus: [
    { jdTdb: 2461041.5, xyzKm: [-1569010.153391406, 3097768.262503448, 884886.5040435607] },
    { jdTdb: 2461200.5, xyzKm: [-1652880.960806316, 3053918.018009424, 894050.518326178] },
  ],
  Titania: [
    { jdTdb: 2461041.5, xyzKm: [362308.0260562676, -14664.72629697967, -241389.2921433506] },
    { jdTdb: 2461200.5, xyzKm: [-256004.3113953286, 146450.6752204137, -320347.0586998049] },
  ],
  Oberon: [
    { jdTdb: 2461041.5, xyzKm: [289669.879481092, -193050.0603508156, 467214.3747676038] },
    { jdTdb: 2461200.5, xyzKm: [-350664.5437734801, -48967.01718999371, 464105.1501312733] },
  ],
  Triton: [
    { jdTdb: 2461041.5, xyzKm: [-284529.7541283969, -110976.6922305935, 180508.4988726863] },
    { jdTdb: 2461200.5, xyzKm: [-233051.3969327688, -38059.24725928259, 264755.3713848914] },
  ],
};

test('element table covers the 12 moons with sane fields', () => {
  assert.equal(MOON_ELEMENTS.length, 12);
  for (const r of MOON_ELEMENTS) {
    assert.ok(['Mars', 'Saturn', 'Uranus', 'Neptune'].includes(r.planet), r.name);
    assert.ok(r.a_km > 5000 && r.a_km < 4e6 && r.e >= 0 && r.e < 0.1 && r.n_degPerDay !== 0, r.name);
    assert.ok(Number.isFinite(r.mag) && r.mag > 8 && r.mag < 15, r.name);
  }
});

test('oracle: propagator matches JPL Horizons at both instants', () => {
  for (const r of MOON_ELEMENTS) {
    const tol = (r.name === 'Iapetus' ? 0.10 : 0.03) * r.a_km; // km
    for (const f of FIXTURES[r.name]) {
      const p = moonOffsetEqjAu(r, f.jdTdb).map((v) => v * AU_KM); // TT vs TDB: < 2 ms, irrelevant
      const err = Math.hypot(p[0] - f.xyzKm[0], p[1] - f.xyzKm[1], p[2] - f.xyzKm[2]);
      assert.ok(err < tol, `${r.name} @ ${f.jdTdb}: ${Math.round(err)} km off (tol ${Math.round(tol)})`);
      const rr = Math.hypot(...f.xyzKm);
      assert.ok(Math.abs(Math.hypot(...p) - rr) < tol, `${r.name}: radius off`);
    }
  }
});

test('Kepler solver: circular orbit reduces to the mean anomaly', () => {
  const row = { a_km: 1000, e: 0, i_deg: 0, node_deg: 0, peri_deg: 0, M0_deg: 90, n_degPerDay: 0,
                epochJd: 2451545.0, poleRa_deg: 0, poleDec_deg: 90, planet: 'Test', name: 'T', mag: 10 };
  const [x, y, z] = moonOffsetEqjAu(row, 2451545.0).map((v) => v * AU_KM);
  assert.ok(Math.abs(x) < 1e-6 && Math.abs(y - 1000) < 1e-6 && Math.abs(z) < 1e-6, `(${x}, ${y}, ${z})`);
});
