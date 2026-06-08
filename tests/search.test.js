import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, searchIndex } from '../js/ui/search.js';

test('buildSearchIndex includes named stars, constellations (with abbr alias), and bodies', () => {
  const stars = [{ id: 1, name: 'Sirius' }, { id: 2, name: '' }, { id: 3, name: 'Vega' }];
  const figures = [{ name: 'Orion', abbr: 'Ori' }, { name: 'Lyra', abbr: 'Lyr' }];
  const idx = buildSearchIndex(stars, figures, ['Moon', 'Mars']);
  assert.equal(idx.length, 6, '2 named stars + 2 constellations + 2 bodies (unnamed star skipped)');
  assert.deepEqual(idx.find((e) => e.label === 'Orion'), { label: 'Orion', type: 'constellation', ref: 'Orion', aliases: ['Ori'] });
  assert.deepEqual(idx.find((e) => e.label === 'Sirius'), { label: 'Sirius', type: 'star', ref: 1 });
});

test('searchIndex ranks prefix matches first, then by length', () => {
  const idx = buildSearchIndex(
    [{ id: 1, name: 'Mira' }, { id: 2, name: 'Mirfak' }, { id: 3, name: 'Sirius' }],
    [], [],
  );
  assert.deepEqual(searchIndex(idx, 'mir').map((e) => e.label), ['Mira', 'Mirfak']); // Sirius lacks "mir"
});

test('searchIndex matches constellation abbreviations via aliases', () => {
  const idx = buildSearchIndex([], [{ name: 'Lyra', abbr: 'Lyr' }, { name: 'Orion', abbr: 'Ori' }], []);
  const r = searchIndex(idx, 'ori');
  assert.ok(r.some((e) => e.label === 'Orion'), 'abbr "Ori" finds Orion');
});

test('searchIndex is case-insensitive, empty query returns nothing, and respects the limit', () => {
  const idx = buildSearchIndex(
    Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Star${i}` })), [], [],
  );
  assert.equal(searchIndex(idx, '').length, 0);
  assert.equal(searchIndex(idx, 'STAR', 5).length, 5, 'limit applied');
  assert.ok(searchIndex(idx, 'star1').length >= 1, 'case-insensitive');
});
