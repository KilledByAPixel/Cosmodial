import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMETS, activeCometSet, cometHelioEqjAu, cometMagnitude, cometCoverage } from '../js/core/comets.js';

// JPL Horizons Sun-centred ICRF vectors (AU) — fetched once via scripts/fetch-comet-data.mjs
// (EPHEM_TYPE=VECTORS, CENTER='500@10', REF_PLANE=FRAME, OUT_UNITS=AU-D), fetched 2026-06-11.
// Two instants per element set: at its epoch (tolEpoch) and 120 days later (tolDrift).
const TOL_EPOCH = 2e-4, TOL_DRIFT = 0.01; // AU
const FIXTURES = [
  { id: '1P', setIndex: 0, jdTdb: 2446480.5, xyzAu: [7.943340152665264E-02, -6.046832115174712E-01, -1.290236846873692E-01], tol: TOL_EPOCH },
  { id: '1P', setIndex: 0, jdTdb: 2446600.5, xyzAu: [-2.230714260536646E+00, -3.003941792937741E-02, -6.293006889847671E-01], tol: TOL_DRIFT },
  { id: '1P', setIndex: 1, jdTdb: 2474060.5, xyzAu: [-3.617539574114182E-01, -6.770533985363930E-01, -2.722259952376361E-01], tol: TOL_EPOCH },
  { id: '1P', setIndex: 1, jdTdb: 2474180.5, xyzAu: [-2.438674497903611E+00, 7.232611036791493E-02, -6.768773616709186E-01], tol: TOL_DRIFT },
  { id: '2P', setIndex: 0, jdTdb: 2450600.5, xyzAu: [-3.348096080666196E-01, -1.648006565076518E-01, -1.481241696181571E-01], tol: TOL_EPOCH },
  { id: '2P', setIndex: 0, jdTdb: 2450720.5, xyzAu: [1.303158548732328E+00, -1.440730396277288E+00, -8.413819935120244E-01], tol: TOL_DRIFT },
  { id: '2P', setIndex: 1, jdTdb: 2460200.5, xyzAu: [6.358961902963940E-01, 5.585073331682420E-01, 4.378825363627586E-01], tol: TOL_EPOCH },
  { id: '2P', setIndex: 1, jdTdb: 2460320.5, xyzAu: [6.958230740470909E-01, -1.193087282778489E+00, -7.220964788987276E-01], tol: TOL_DRIFT },
  { id: '55P', setIndex: 0, jdTdb: 2450870.5, xyzAu: [4.086392247888209E-01, 7.917057651171489E-01, 4.014234287935450E-01], tol: TOL_EPOCH },
  { id: '55P', setIndex: 0, jdTdb: 2450990.5, xyzAu: [1.630968133039227E+00, -6.937122152254761E-01, -9.614139986091917E-01], tol: TOL_DRIFT },
  { id: '55P', setIndex: 1, jdTdb: 2462990.5, xyzAu: [8.112193713653033E-02, 8.465023265019327E-01, 5.353067452365354E-01], tol: TOL_EPOCH },
  { id: '55P', setIndex: 1, jdTdb: 2463110.5, xyzAu: [1.568957962085288E+00, -5.209465509068416E-01, -8.244917687801182E-01], tol: TOL_DRIFT },
  { id: '109P', setIndex: 0, jdTdb: 2448980.5, xyzAu: [7.766794258755866E-01, -5.891943367190682E-01, -7.633606117214700E-02], tol: TOL_EPOCH },
  { id: '109P', setIndex: 0, jdTdb: 2449100.5, xyzAu: [-3.584983579241352E-02, -2.165704988701833E-01, -2.220277990797049E+00], tol: TOL_DRIFT },
  { id: '109P', setIndex: 1, jdTdb: 2497560.5, xyzAu: [-1.239514300155485E+00, 1.187809284187473E+00, 2.454737477884090E+00], tol: TOL_EPOCH },
  { id: '109P', setIndex: 1, jdTdb: 2497680.5, xyzAu: [6.553242905569370E-02, 1.218332124419993E-01, 1.576708660874543E+00], tol: TOL_DRIFT },
  { id: 'C/1995 O1', setIndex: 0, jdTdb: 2450539.5, xyzAu: [-1.211145519395226E-01, 2.548681938409467E-01, 8.695315190021796E-01], tol: TOL_EPOCH },
  { id: 'C/1995 O1', setIndex: 0, jdTdb: 2450659.5, xyzAu: [-3.179919116256172E-01, 1.889021161408616E+00, -9.280462692774171E-01], tol: TOL_DRIFT },
  { id: 'C/2020 F3', setIndex: 0, jdTdb: 2459036.5, xyzAu: [2.200839683613764E-01, -1.775828091488398E-02, 2.084362287542257E-01], tol: TOL_EPOCH },
  { id: 'C/2020 F3', setIndex: 0, jdTdb: 2459156.5, xyzAu: [-1.108356607708764E+00, -2.043658038319095E+00, -7.682484295975281E-01], tol: TOL_DRIFT },
  { id: 'C/2023 A3', setIndex: 0, jdTdb: 2460588.5, xyzAu: [3.689186827738107E-01, 2.350270484849886E-01, 3.006952743560795E-02], tol: TOL_EPOCH },
  { id: 'C/2023 A3', setIndex: 0, jdTdb: 2460708.5, xyzAu: [1.015129406387468E+00, -2.071605833009110E+00, 8.317879324181028E-01], tol: TOL_DRIFT },
];

test('catalogue covers the 7 comets with sane fields', () => {
  assert.equal(COMETS.length, 7);
  const ids = new Set(COMETS.map((c) => c.id));
  assert.equal(ids.size, 7, 'unique ids');
  for (const c of COMETS) {
    assert.ok(c.name && c.blurb && c.color, c.id);
    assert.ok(Number.isFinite(c.M1) && c.M1 > -3 && c.M1 < 16, `${c.id} M1`);
    assert.ok(Number.isFinite(c.K1) && c.K1 >= 2 && c.K1 <= 25, `${c.id} K1`);
    assert.ok(c.sets.length >= 1, c.id);
    for (const s of c.sets) {
      assert.ok(s.q_au > 0.1 && s.q_au < 1.2, `${c.id} q`);
      assert.ok(s.e > 0.5 && s.e < 1.05, `${c.id} e`);
      assert.ok(s.validFromJd < s.validToJd, `${c.id} window ordered`);
      assert.ok(Number.isFinite(s.tpJd) && Number.isFinite(s.i_deg) && Number.isFinite(s.node_deg) && Number.isFinite(s.peri_deg), c.id);
    }
  }
});

test('activeCometSet honors validity windows and picks the nearest epoch', () => {
  const comet = { sets: [
    { epochJd: 1000, validFromJd: 500, validToJd: 1500 },
    { epochJd: 2000, validFromJd: 1400, validToJd: 2500 },
  ] };
  assert.equal(activeCometSet(comet, 400), null, 'before all windows');
  assert.equal(activeCometSet(comet, 3000), null, 'after all windows');
  assert.equal(activeCometSet(comet, 900).epochJd, 1000);
  assert.equal(activeCometSet(comet, 1450).epochJd, 1000, 'overlap: nearest epoch wins');
  assert.equal(activeCometSet(comet, 2400).epochJd, 2000);
});

test('propagator: r equals q exactly at perihelion, elliptic and hyperbolic', () => {
  const base = { i_deg: 0, node_deg: 0, peri_deg: 0, tpJd: 2451545.0 };
  for (const e of [0.0, 0.848, 0.967, 0.9992, 1.0001, 1.05]) {
    const set = { ...base, q_au: 0.6, e };
    const r = Math.hypot(...cometHelioEqjAu(set, 2451545.0));
    assert.ok(Math.abs(r - 0.6) < 1e-9, `e=${e}: r=${r}`);
  }
});

test('propagator: high-e orbit is symmetric about perihelion and recedes', () => {
  const set = { q_au: 0.6, e: 0.9992, i_deg: 45, node_deg: 30, peri_deg: 60, tpJd: 2451545.0 };
  const rBefore = Math.hypot(...cometHelioEqjAu(set, 2451545.0 - 200));
  const rAfter = Math.hypot(...cometHelioEqjAu(set, 2451545.0 + 200));
  assert.ok(Math.abs(rBefore - rAfter) < 1e-9, 'time-symmetric distance');
  assert.ok(rAfter > 0.6 && rAfter < 10, `recedes sensibly: ${rAfter}`);
});

test('oracle: propagator matches JPL Horizons heliocentric vectors', () => {
  for (const f of FIXTURES) {
    const comet = COMETS.find((c) => c.id === f.id);
    const p = cometHelioEqjAu(comet.sets[f.setIndex], f.jdTdb); // TT vs TDB < 2 ms — irrelevant
    const err = Math.hypot(p[0] - f.xyzAu[0], p[1] - f.xyzAu[1], p[2] - f.xyzAu[2]);
    assert.ok(err < f.tol, `${f.id}[${f.setIndex}] @ ${f.jdTdb}: ${err.toExponential(2)} AU off (tol ${f.tol})`);
  }
});

test('cometMagnitude reduces to M1 at r = delta = 1 AU and dims with distance', () => {
  assert.ok(Math.abs(cometMagnitude(5.5, 8, 1, 1) - 5.5) < 1e-12);
  assert.ok(cometMagnitude(5.5, 8, 10, 10) > cometMagnitude(5.5, 8, 1, 1));
});

test('cometCoverage spans the outermost validity windows as years', () => {
  const comet = { sets: [
    { validFromJd: 2415020.5, validToJd: 2459945.5 },   // 1900 -> 2023
    { validFromJd: 2459945.5, validToJd: 2491721.5 },   // 2023 -> 2110
  ] };
  assert.equal(cometCoverage(comet), '1900–2110');
});
