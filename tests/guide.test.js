import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipLabel } from '../js/ui/guide.js';

test('chipLabel appends the active event\'s leading emoji to the collapsed chip', () => {
  assert.equal(chipLabel(null), '✦ Up now');
  assert.equal(chipLabel({ text: '☄️ Perseids peak tonight — up to ~100/hr.' }), '✦ Up now · ☄️',
    'keeps the emoji-style variation selector');
  assert.equal(chipLabel({ text: '🌑 Total lunar eclipse — happening now.' }), '✦ Up now · 🌑');
  assert.equal(chipLabel({ text: '🌗 Moon and Saturn are close.' }), '✦ Up now · 🌗');
  assert.equal(chipLabel({ text: '' }), '✦ Up now', 'empty text falls back to the plain chip');
});
