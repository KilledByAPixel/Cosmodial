import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, recordOf, displayName, createFavorites } from '../js/core/favorites.js';

// Minimal localStorage stand-in (node has none); seed entries via the constructor arg.
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const KEY = 'cosmodial.favorites';

test('keyOf normalizes moon/sun/planet to one body namespace; stars/DSOs key by id', () => {
  assert.equal(keyOf({ kind: 'moon', label: 'Moon' }), 'body:Moon');
  assert.equal(keyOf({ kind: 'sun', label: 'Sun' }), 'body:Sun');
  assert.equal(keyOf({ kind: 'planet', label: 'Saturn' }), 'body:Saturn');
  assert.equal(keyOf({ kind: 'body', label: 'Saturn' }), 'body:Saturn', 'a stored record keys the same as a live pick');
  assert.equal(keyOf({ kind: 'star', id: 11734, name: 'Vega' }), 'star:11734');
  assert.equal(keyOf({ kind: 'dso', id: 'M31', name: 'Andromeda Galaxy' }), 'dso:M31');
});

test('recordOf keeps the display name for stars/DSOs and only the label for bodies', () => {
  assert.deepEqual(recordOf({ kind: 'planet', label: 'Jupiter', body: {}, mag: -2 }), { kind: 'body', label: 'Jupiter' });
  assert.deepEqual(recordOf({ kind: 'star', id: 7, name: 'Vega', mag: 0 }), { kind: 'star', id: 7, name: 'Vega' });
  assert.deepEqual(recordOf({ kind: 'star', id: 8 }), { kind: 'star', id: 8, name: null }, 'unnamed star allowed');
});

test('displayName falls back for unnamed stars', () => {
  assert.equal(displayName({ kind: 'body', label: 'Moon' }), 'Moon');
  assert.equal(displayName({ kind: 'star', id: 7, name: 'Vega' }), 'Vega');
  assert.equal(displayName({ kind: 'star', id: 8, name: null }), 'Unnamed star');
  assert.equal(displayName({ kind: 'dso', id: 'M31', name: null }), 'M31');
});

test('first run (no stored key) seeds the Moon', () => {
  const f = createFavorites(fakeStorage());
  assert.deepEqual(f.list(), [{ kind: 'body', label: 'Moon' }]);
});

test('a stored empty list stays empty — deliberate unstars are respected', () => {
  const f = createFavorites(fakeStorage({ [KEY]: '[]' }));
  assert.deepEqual(f.list(), []);
});

test('corrupt or non-array storage falls back to the seed', () => {
  assert.deepEqual(createFavorites(fakeStorage({ [KEY]: '{not json' })).list(), [{ kind: 'body', label: 'Moon' }]);
  assert.deepEqual(createFavorites(fakeStorage({ [KEY]: '"hi"' })).list(), [{ kind: 'body', label: 'Moon' }]);
});

test('invalid records inside a stored array are dropped, valid ones kept', () => {
  const raw = JSON.stringify([{ kind: 'body', label: 'Moon' }, { kind: 'nope' }, null, { kind: 'star', id: 7, name: 'Vega' }]);
  const f = createFavorites(fakeStorage({ [KEY]: raw }));
  assert.deepEqual(f.list(), [{ kind: 'body', label: 'Moon' }, { kind: 'star', id: 7, name: 'Vega' }]);
});

test('toggle adds then removes; has() matches live picks against stored records; persists', () => {
  const storage = fakeStorage({ [KEY]: '[]' });
  const f = createFavorites(storage);
  const saturn = { kind: 'planet', label: 'Saturn', body: {}, mag: 0.5 };
  assert.equal(f.has(saturn), false);
  assert.equal(f.toggle(saturn), true, 'returns the new state: now favorited');
  assert.equal(f.has(saturn), true);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), [{ kind: 'body', label: 'Saturn' }], 'saved to storage');
  assert.equal(f.toggle(saturn), false, 'returns the new state: removed');
  assert.equal(f.has(saturn), false);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), []);
});

test('onChange fires on toggle and supports unsubscribe', () => {
  const f = createFavorites(fakeStorage());
  let calls = 0;
  const off = f.onChange(() => { calls++; });
  f.toggle({ kind: 'star', id: 7, name: 'Vega' });
  assert.equal(calls, 1);
  off();
  f.toggle({ kind: 'star', id: 7, name: 'Vega' });
  assert.equal(calls, 1, 'no notification after unsubscribe');
});

test('works with no storage at all (node / private mode)', () => {
  const f = createFavorites(null);
  assert.deepEqual(f.list(), [{ kind: 'body', label: 'Moon' }]);
  f.toggle({ kind: 'star', id: 7, name: 'Vega' });
  assert.equal(f.has({ kind: 'star', id: 7 }), true);
});

test('list() returns copies — mutating them does not corrupt the store', () => {
  const f = createFavorites(fakeStorage());
  f.list()[0].label = 'Mangled';
  assert.equal(f.list()[0].label, 'Moon');
});

test('comet records: keyed by id, persist with name, survive validation', () => {
  assert.equal(keyOf({ kind: 'comet', id: '1P', name: "Halley's Comet" }), 'comet:1P');
  assert.deepEqual(recordOf({ kind: 'comet', id: '1P', name: "Halley's Comet", mag: 25 }),
    { kind: 'comet', id: '1P', name: "Halley's Comet" });
  assert.equal(displayName({ kind: 'comet', id: '1P', name: "Halley's Comet" }), "Halley's Comet");
  const storage = fakeStorage({ [KEY]: '[]' });
  const f = createFavorites(storage);
  f.toggle({ kind: 'comet', id: '1P', name: "Halley's Comet" });
  assert.deepEqual(createFavorites(storage).list(), [{ kind: 'comet', id: '1P', name: "Halley's Comet" }],
    'round-trips through storage validation');
});

test('planet-moon records: keyed by label, persist, survive validation, display by name', () => {
  const titan = { kind: 'planet-moon', label: 'Titan', planet: 'Saturn', mag: 8.4 };
  assert.equal(keyOf(titan), 'planet-moon:Titan');
  assert.deepEqual(recordOf(titan), { kind: 'planet-moon', label: 'Titan' });
  assert.equal(displayName({ kind: 'planet-moon', label: 'Titan' }), 'Titan');
  const storage = fakeStorage({ [KEY]: '[]' });
  const f = createFavorites(storage);
  f.toggle(titan);
  assert.deepEqual(createFavorites(storage).list(), [{ kind: 'planet-moon', label: 'Titan' }],
    'round-trips through storage validation');
});

test('the ISS is favoritable: id-keyed, stored with its name, round-trips', () => {
  const pick = { kind: 'iss', id: 'ISS', name: 'ISS', label: 'ISS', altaz: { az: 250, alt: 30 }, rangeKm: 700 };
  assert.equal(keyOf(pick), 'iss:ISS');
  assert.deepEqual(recordOf(pick), { kind: 'iss', id: 'ISS', name: 'ISS' });
  assert.equal(displayName(recordOf(pick)), 'ISS');
  const f = createFavorites(fakeStorage({ [KEY]: '[]' }));
  f.toggle(pick);
  assert.ok(f.has(pick), 'a live pick matches its stored record');
  // and a reload (fresh instance over the same storage) keeps it — isValidRecord accepts it
  const store2 = fakeStorage({ [KEY]: JSON.stringify(f.list()) });
  assert.deepEqual(createFavorites(store2).list(), [{ kind: 'iss', id: 'ISS', name: 'ISS' }]);
});

test('constellations are favoritable: id-keyed, stored with their name, round-trips', () => {
  const pick = { kind: 'constellation', id: 'Orion', name: 'Orion', altaz: { az: 180, alt: 45 } };
  assert.equal(keyOf(pick), 'constellation:Orion');
  assert.deepEqual(recordOf(pick), { kind: 'constellation', id: 'Orion', name: 'Orion' });
  assert.equal(displayName(recordOf(pick)), 'Orion');
  const f = createFavorites(fakeStorage({ [KEY]: '[]' }));
  f.toggle(pick);
  assert.deepEqual(f.list(), [{ kind: 'constellation', id: 'Orion', name: 'Orion' }]);
  assert.ok(f.has(pick), 'a live pick matches its stored record');
  // and a reload (fresh instance over the same storage) keeps it - isValidRecord accepts it
  const store2 = fakeStorage({ [KEY]: JSON.stringify(f.list()) });
  assert.deepEqual(createFavorites(store2).list(), [{ kind: 'constellation', id: 'Orion', name: 'Orion' }]);
});
