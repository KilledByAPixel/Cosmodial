import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altazToWhere } from '../js/guide/ranking.js';

test('altazToWhere phrases compass + altitude band', () => {
  const compass = () => 'south';
  assert.equal(altazToWhere({ alt: 85, az: 180 }, compass), 'almost directly overhead');
  assert.equal(altazToWhere({ alt: 10, az: 180 }, compass), 'low in the south');
  assert.equal(altazToWhere({ alt: 65, az: 180 }, compass), 'high in the south');
});
