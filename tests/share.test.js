import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareUrlFor, parseShareParam } from '../js/ui/share.js';

const BASE = 'https://example.com/Cosmodial/';

test('shareUrlFor encodes the object identity as the ?obj param', () => {
  assert.equal(shareUrlFor({ kind: 'planet', label: 'Saturn' }, BASE), `${BASE}?obj=body%3ASaturn`);
  assert.equal(shareUrlFor({ kind: 'star', id: 11734, name: 'Vega' }, BASE), `${BASE}?obj=star%3A11734`);
  assert.equal(shareUrlFor({ kind: 'planet-moon', label: 'Titan' }, BASE), `${BASE}?obj=planet-moon%3ATitan`);
  assert.equal(shareUrlFor({ kind: 'comet', id: '1P', name: "Halley's Comet" }, BASE), `${BASE}?obj=comet%3A1P`);
  assert.equal(shareUrlFor({ kind: 'constellation', id: 'Orion', name: 'Orion' }, BASE), `${BASE}?obj=constellation%3AOrion`);
  assert.equal(shareUrlFor({ kind: 'iss', id: 'ISS', name: 'ISS' }, BASE), `${BASE}?obj=iss%3AISS`);
});

test('parseShareParam round-trips into a search-select entry (star ids back to numbers)', () => {
  assert.deepEqual(parseShareParam('body:Saturn'), { type: 'body', ref: 'Saturn' });
  assert.deepEqual(parseShareParam('star:11734'), { type: 'star', ref: 11734 });
  assert.deepEqual(parseShareParam('planet-moon:Titan'), { type: 'planet-moon', ref: 'Titan' });
  assert.deepEqual(parseShareParam('dso:M31'), { type: 'dso', ref: 'M31' });
  assert.deepEqual(parseShareParam('constellation:Orion'), { type: 'constellation', ref: 'Orion' });
  assert.deepEqual(parseShareParam('iss:ISS'), { type: 'iss', ref: 'ISS' });
});

test('parseShareParam rejects junk without throwing', () => {
  assert.equal(parseShareParam(''), null);
  assert.equal(parseShareParam(null), null);
  assert.equal(parseShareParam('no-colon'), null);
  assert.equal(parseShareParam('star:notanumber'), null);
  assert.equal(parseShareParam('nonsense:thing'), null);
});
