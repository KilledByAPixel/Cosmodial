import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eqToGalactic, galacticUV } from '../tools/splash-math.js';

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

test('texture orientation matches the app: LMC near v=0.32, u in [0,1)', () => {
  // Large Magellanic Cloud, RA 80.89, Dec -69.76 (l~280.5, b~-32.9)
  const { u, v } = galacticUV(80.89, -69.76);
  assert.ok(Math.abs(v - 0.317) < 0.01, `v=${v}`);
  assert.ok(u >= 0 && u < 1, `u=${u}`);
});
