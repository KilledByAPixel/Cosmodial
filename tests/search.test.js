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

test('buildSearchIndex includes DSOs, findable by name and catalog id', () => {
  const dsos = [{ id: 'M31', name: 'Andromeda Galaxy' }];
  const index = buildSearchIndex([], [], [], dsos);
  const byName = searchIndex(index, 'Androm');
  const byId = searchIndex(index, 'M31');
  assert.ok(byName.some((e) => e.type === 'dso' && e.ref === 'M31'), 'found by name');
  assert.ok(byId.some((e) => e.type === 'dso' && e.ref === 'M31'), 'found by catalog id');
});

test('buildSearchIndex includes comets, findable by name, id, and alias', () => {
  const comets = [{ id: '1P', name: "Halley's Comet", aliases: ['1P/Halley', 'Halley'] }];
  const index = buildSearchIndex([], [], [], [], comets);
  assert.deepEqual(index, [{ label: "Halley's Comet", type: 'comet', ref: '1P', aliases: ['1P', '1P/Halley', 'Halley'] }]);
  assert.ok(searchIndex(index, 'halley').some((e) => e.ref === '1P'), 'found by alias substring');
});

test('buildSearchIndex includes planetary moons with a per-entry hint', () => {
  const moons = [{ planet: 'Saturn', name: 'Titan' }, { planet: 'Jupiter', name: 'Io' }];
  const index = buildSearchIndex([], [], [], [], [], moons);
  assert.deepEqual(index, [
    { label: 'Titan', type: 'planet-moon', ref: 'Titan', hint: 'moon of Saturn' },
    { label: 'Io', type: 'planet-moon', ref: 'Io', hint: 'moon of Jupiter' },
  ]);
  assert.ok(searchIndex(index, 'tit').some((e) => e.ref === 'Titan'), 'findable by prefix');
});

test('buildSearchIndex includes satellites, findable by name and full-name aliases', () => {
  const sats = [
    { id: 'ISS', label: 'ISS', aliases: ['International Space Station', 'Space Station'] },
    { id: 'Tiangong', label: 'Tiangong', aliases: ['Chinese Space Station', 'CSS', 'Tianhe'] },
  ];
  const index = buildSearchIndex([], [], [], [], [], [], sats);
  assert.deepEqual(index[0], { label: 'ISS', type: 'satellite', ref: 'ISS', aliases: ['International Space Station', 'Space Station'] });
  assert.ok(searchIndex(index, 'iss').some((e) => e.ref === 'ISS'), 'ISS found by name');
  assert.ok(searchIndex(index, 'tiangong').some((e) => e.ref === 'Tiangong'), 'Tiangong found by name');
  assert.ok(searchIndex(index, 'space station').map((e) => e.ref).join() === 'ISS,Tiangong', 'both found by alias');
});

test('searchIndex ranks Titan ahead of Titania for the query "titan"', () => {
  const moons = [{ planet: 'Uranus', name: 'Titania' }, { planet: 'Saturn', name: 'Titan' }];
  const index = buildSearchIndex([], [], [], [], [], moons);
  assert.deepEqual(searchIndex(index, 'titan').map((e) => e.label), ['Titan', 'Titania']);
});
