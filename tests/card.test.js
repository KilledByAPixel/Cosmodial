import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorWord, easeTag, distanceLy, lightLeftPhrase, constellationName } from '../js/ui/card.js';

test('colorWord buckets B-V into plain colors', () => {
  assert.equal(colorWord(-0.1), 'blue-white');
  assert.equal(colorWord(0.2), 'white');
  assert.equal(colorWord(0.65), 'yellow');
  assert.equal(colorWord(1.2), 'orange');
  assert.equal(colorWord(1.8), 'red');
  assert.equal(colorWord(null), 'white');
});

test('easeTag from magnitude', () => {
  assert.equal(easeTag(1), 'naked eye');
  assert.equal(easeTag(7), 'binoculars');
  assert.equal(easeTag(12), 'telescope');
});

test('distanceLy converts parsecs (null-safe)', () => {
  assert.ok(Math.abs(distanceLy(10) - 32.6156) < 1e-3);
  assert.equal(distanceLy(null), null);
  assert.equal(distanceLy(100000), 326156);
});

test('lightLeftPhrase handles AD and BC', () => {
  assert.equal(lightLeftPhrase(8.6, 2026), "the light you're seeing left it around 2017");
  assert.equal(lightLeftPhrase(2600, 2026), "the light you're seeing left it around 575 BC");
  assert.equal(lightLeftPhrase(null, 2026), null);
});

test('constellationName resolves abbreviations', () => {
  assert.equal(constellationName('Ori'), 'Orion');
  assert.equal(constellationName('ZZZ'), 'ZZZ');
});
