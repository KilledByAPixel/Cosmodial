import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, rankCandidates, easeFor, altazToWhere, headline } from '../js/guide/ranking.js';

test('scoreCandidate: below horizon excluded; curation + brightness + altitude raise score', () => {
  assert.equal(scoreCandidate({ kind: 'star', mag: 1, altaz: { alt: -5, az: 0 } }), -Infinity);
  const planet = scoreCandidate({ kind: 'planet', mag: -2, altaz: { alt: 40, az: 0 } });
  const star = scoreCandidate({ kind: 'star', mag: 1, altaz: { alt: 40, az: 0 } });
  assert.ok(planet > star, 'a bright planet outranks a bright star at the same altitude');
  const low = scoreCandidate({ kind: 'star', mag: 1, altaz: { alt: 5, az: 0 } });
  const high = scoreCandidate({ kind: 'star', mag: 1, altaz: { alt: 70, az: 0 } });
  assert.ok(high > low, 'higher in the sky scores better');
});

test('rankCandidates filters below-horizon and sorts best-first', () => {
  const out = rankCandidates([
    { kind: 'star', name: 'Dim', mag: 2, altaz: { alt: 10, az: 0 } },
    { kind: 'moon', name: 'Moon', mag: -10, altaz: { alt: 30, az: 0 } },
    { kind: 'star', name: 'Below', mag: -1, altaz: { alt: -2, az: 0 } },
  ]);
  assert.equal(out.length, 2, 'below-horizon dropped');
  assert.equal(out[0].name, 'Moon', 'Moon ranks first');
  assert.ok(out.every((c) => Number.isFinite(c.score)));
});

test('easeFor', () => {
  assert.equal(easeFor('moon'), 'naked eye');
  assert.equal(easeFor('planet'), 'naked eye');         // no magnitude -> defaults to the classic-five case
  assert.equal(easeFor('planet', -2), 'naked eye');     // a bright planet (e.g. Jupiter)
  assert.equal(easeFor('planet', 5.7), 'binoculars');   // Uranus is too faint for the unaided eye
  assert.equal(easeFor('planet', 7.8), 'binoculars');   // Neptune
  assert.equal(easeFor('star', 1), 'naked eye');
  assert.equal(easeFor('star', 6), 'binoculars');
});

test('altazToWhere phrases compass + altitude band', () => {
  const compass = () => 'south';
  assert.equal(altazToWhere({ alt: 85, az: 180 }, compass), 'almost directly overhead');
  assert.equal(altazToWhere({ alt: 10, az: 180 }, compass), 'low in the south');
  assert.equal(altazToWhere({ alt: 65, az: 180 }, compass), 'high in the south');
});

test('headline reflects day vs night and pick count', () => {
  assert.match(headline([], { isDay: true }), /Sun/);
  assert.match(headline([], { isDay: false }), /Nothing/);
  assert.match(headline([{ name: 'Jupiter' }], { isDay: false }), /Jupiter/);
});
