import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipLabel, rowWhere, sunRowText } from '../js/ui/favorites.js';

test('chipLabel appends the active event\'s leading emoji to the collapsed chip', () => {
  assert.equal(chipLabel(null), '★ Favorites');
  assert.equal(chipLabel({ text: '☄️ Perseids peak tonight — up to ~100/hr.' }), '★ Favorites · ☄️',
    'keeps the emoji-style variation selector');
  assert.equal(chipLabel({ text: '🌑 Total lunar eclipse — happening now.' }), '★ Favorites · 🌑');
  assert.equal(chipLabel({ text: '🌗 Moon and Saturn are close.' }), '★ Favorites · 🌗');
  assert.equal(chipLabel({ text: '' }), '★ Favorites', 'empty text falls back to the plain chip');
});

test('rowWhere phrases the live position, or says below the horizon', () => {
  assert.equal(rowWhere({ alt: 65, az: 180 }), 'high in the S');
  assert.equal(rowWhere({ alt: 10, az: 180 }), 'low in the S');
  assert.equal(rowWhere({ alt: -5, az: 90 }), 'below the horizon');
});

test('sunRowText phrases the next sun event with its emoji (time is locale-formatted)', () => {
  const set = sunRowText({ kind: 'sunset', date: new Date('2026-06-08T01:35:00Z') });
  assert.match(set, /^🌇 Sunset /);
  assert.match(set, /\d/, 'contains a clock time');
  const rise = sunRowText({ kind: 'sunrise', date: new Date('2026-06-08T11:30:00Z') });
  assert.match(rise, /^🌅 Sunrise /);
});
