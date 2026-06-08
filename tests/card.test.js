import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorWord, easeTag, distanceLy, lightLeftPhrase, constellationName, eclipseContacts, visWord, lightYears, lightTravelPhrase } from '../js/ui/card.js';

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

test('visWord phrases visibility', () => {
  assert.equal(visWord('full'), 'visible from here');
  assert.equal(visWord('partial'), 'partly visible from here');
});

test('eclipseContacts lists only the phases that occur, in order', () => {
  const peak = new Date('2026-07-01T05:00:00Z');
  const mk = (sdPartial, sdTotal) => ({
    contacts: {
      partialBegin: sdPartial ? new Date(peak.getTime() - sdPartial * 60000) : null,
      totalBegin: sdTotal ? new Date(peak.getTime() - sdTotal * 60000) : null,
      peak,
      totalEnd: sdTotal ? new Date(peak.getTime() + sdTotal * 60000) : null,
      partialEnd: sdPartial ? new Date(peak.getTime() + sdPartial * 60000) : null,
    },
  });
  const total = eclipseContacts(mk(90, 30)).map(([label]) => label);
  assert.deepEqual(total, ['partial begins', 'totality begins', 'peak', 'totality ends', 'partial ends']);
  const partial = eclipseContacts(mk(60, 0)).map(([label]) => label);
  assert.deepEqual(partial, ['partial begins', 'peak', 'partial ends']);
});

test('lightYears formats with thousand/million units', () => {
  assert.equal(lightYears(444), '444 light-years');
  assert.equal(lightYears(25000), '25 thousand light-years');
  assert.equal(lightYears(2500000), '2.5 million light-years');
  assert.equal(lightYears(null), null);
});

test('lightTravelPhrase describes light-travel time, null-safe', () => {
  assert.equal(lightTravelPhrase(2500000), 'the light reaching you tonight left it ~2.5 million years ago');
  assert.equal(lightTravelPhrase(444), 'the light reaching you tonight left it ~444 years ago');
  assert.equal(lightTravelPhrase(null), null);
});
