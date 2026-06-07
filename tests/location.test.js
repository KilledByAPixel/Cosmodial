import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLatLng } from '../js/ui/location.js';

test('parseLatLng accepts "lat, lng" and "lat lng"', () => {
  assert.deepEqual(parseLatLng('30.27, -97.74'), { lat: 30.27, lng: -97.74 });
  assert.deepEqual(parseLatLng('  40   -105 '), { lat: 40, lng: -105 });
});

test('parseLatLng rejects malformed / out-of-range input', () => {
  assert.equal(parseLatLng('abc'), null);
  assert.equal(parseLatLng('30'), null);          // only one number
  assert.equal(parseLatLng('91, 0'), null);       // lat out of range
  assert.equal(parseLatLng('0, 200'), null);      // lng out of range
  assert.equal(parseLatLng(''), null);
  assert.equal(parseLatLng(null), null);
});
