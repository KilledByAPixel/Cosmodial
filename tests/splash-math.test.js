import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eqToGalactic, galacticUV, project, invProject, bvToColor } from '../tools/splash-math.js';

const RAD = 180 / Math.PI;

test('the galactic center is at l=0, b=0', () => {
  const { l, b } = eqToGalactic(266.405, -28.936);
  assert.ok(Math.abs(l * RAD) < 0.1, `l=${l * RAD}`);
  assert.ok(Math.abs(b * RAD) < 0.1, `b=${b * RAD}`);
});

test('the north galactic pole is at b=+90', () => {
  const { b } = eqToGalactic(192.859, 27.128);
  assert.ok(Math.abs(b * RAD - 90) < 0.1, `b=${b * RAD}`);
});

test('Sirius lands at its catalogued galactic coords', () => {
  const { l, b } = eqToGalactic(101.287, -16.716);
  let lDeg = l * RAD; if (lDeg < 0) lDeg += 360;
  assert.ok(Math.abs(lDeg - 227.23) < 0.1, `l=${lDeg}`);
  assert.ok(Math.abs(b * RAD - -8.89) < 0.1, `b=${b * RAD}`);
});

test('the galactic center maps to the middle of the texture', () => {
  const { u, v } = galacticUV(266.405, -28.936);
  assert.ok(Math.abs(u - 0.5) < 0.001 && Math.abs(v - 0.5) < 0.001, `u=${u} v=${v}`);
});

test('texture orientation matches the app: LMC near v=0.32, u near 0.72', () => {
  // Large Magellanic Cloud, RA 80.89, Dec -69.76 (l~280.5, b~-32.9)
  const { u, v } = galacticUV(80.89, -69.76);
  assert.ok(Math.abs(v - 0.317) < 0.01, `v=${v}`);
  assert.ok(Math.abs(u - 0.72) < 0.01, `u=${u}`);
});

const CENTER = { ra: 266.4, dec: -29.0 };

test('the projection center lands at the plane origin', () => {
  const p = project(CENTER.ra, CENTER.dec, CENTER);
  assert.ok(Math.abs(p.x) < 1e-12 && Math.abs(p.y) < 1e-12);
});

test('project/invProject round-trip', () => {
  for (const [ra, dec] of [[300, -10], [250, -45], [10, 60], [266.4, 30], [266.4, -29]]) {
    const p = project(ra, dec, CENTER);
    const s = invProject(p.x, p.y, CENTER);
    assert.ok(Math.abs(s.ra - ra) < 1e-9, `ra ${ra} -> ${s.ra}`);
    assert.ok(Math.abs(s.dec - dec) < 1e-9, `dec ${dec} -> ${s.dec}`);
  }
});

test('plane orientation: higher RA -> +x, higher Dec -> +y; antipode is culled', () => {
  assert.ok(project(CENTER.ra + 5, CENTER.dec, CENTER).x > 0);
  assert.ok(project(CENTER.ra, CENTER.dec + 5, CENTER).y > 0);
  assert.equal(project(CENTER.ra + 180, -CENTER.dec, CENTER), null);
});

test('angular distance c from center lands at plane radius 2*tan(c/2)', () => {
  const p = project(CENTER.ra, CENTER.dec + 40, CENTER); // 40 deg straight up in Dec
  const expected = 2 * Math.tan((40 / 2) * Math.PI / 180);
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - expected) < 1e-9);
});

test('bvToColor: hot stars are blue, cool stars are orange', () => {
  const hot = bvToColor(-0.3), cool = bvToColor(1.8);
  assert.ok(hot[2] > hot[0], 'hot star: blue channel > red');
  assert.ok(cool[0] > cool[2], 'cool star: red channel > blue');
});

test('bvToColor clamps out-of-range and defaults missing bv to white-ish', () => {
  assert.deepEqual(bvToColor(99), bvToColor(2.0));
  assert.deepEqual(bvToColor(-5), bvToColor(-0.4));
  assert.deepEqual(bvToColor(undefined), bvToColor(0));
});

test('bvToColor returns integer rgb channels in range', () => {
  for (const bv of [-0.4, 0, 0.65, 1.5, 2.0]) {
    for (const ch of bvToColor(bv)) {
      assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, `bv=${bv} ch=${ch}`);
    }
  }
});
