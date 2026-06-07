import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Astronomy from '../js/vendor/astronomy.js';

test('astronomy-engine exposes the functions astro.js needs', () => {
  for (const name of [
    'Observer', 'Horizon', 'Equator', 'MakeTime', 'Spherical',
    'VectorFromSphere', 'RotateVector', 'EquatorFromVector', 'Rotation_EQJ_EQD',
  ]) {
    assert.equal(typeof Astronomy[name], 'function', `missing function: ${name}`);
  }
  assert.ok(Astronomy.Body && 'Moon' in Astronomy.Body, 'missing Body.Moon enum');
});
