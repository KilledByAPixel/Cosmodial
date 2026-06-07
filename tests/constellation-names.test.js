import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMES } from '../js/core/constellation-names.js';

test('NAMES maps IAU abbreviations to full names', () => {
  assert.equal(NAMES.Ori, 'Orion');
  assert.equal(NAMES.UMa, 'Ursa Major');
  assert.equal(NAMES.Cyg, 'Cygnus');
  assert.ok(Object.keys(NAMES).length >= 88, 'all 88 constellations present');
});
