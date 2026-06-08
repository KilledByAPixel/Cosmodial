import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeShower, SHOWERS } from '../js/guide/showers.js';

test('SHOWERS is a sane calendar', () => {
  assert.ok(SHOWERS.length >= 8);
  for (const s of SHOWERS) {
    assert.ok(s.name && s.peakMonth >= 1 && s.peakMonth <= 12 && s.peakDay >= 1 && s.peakDay <= 31);
    assert.ok(Number.isFinite(s.zhr) && s.zhr > 0);
    assert.ok(s.radiantRa >= 0 && s.radiantRa < 360 && s.radiantDec >= -90 && s.radiantDec <= 90);
    assert.ok(typeof s.con === 'string' && s.con.length >= 2);
  }
});

test('activeShower flags the shower on its peak day and the adjacent days', () => {
  assert.equal(activeShower(new Date(2026, 11, 14)).name, 'Geminids'); // Dec 14 peak
  assert.equal(activeShower(new Date(2026, 11, 13)).name, 'Geminids'); // night before
  assert.equal(activeShower(new Date(2026, 11, 15)).name, 'Geminids'); // night after
});

test('activeShower returns null far from any peak', () => {
  assert.equal(activeShower(new Date(2026, 2, 1)), null); // March 1 — no major shower
});

test('activeShower resolves the Dec/Jan boundary', () => {
  assert.equal(activeShower(new Date(2026, 0, 3)).name, 'Quadrantids'); // Jan 3
  assert.equal(activeShower(new Date(2026, 11, 22)).name, 'Ursids');     // Dec 22
});

test('activeShower picks the higher-ZHR shower when two peak in the same window', () => {
  const showers = [
    { name: 'Weak',   peakMonth: 6, peakDay: 10, zhr: 10,  radiantRa: 0, radiantDec: 0, con: 'Xx' },
    { name: 'Strong', peakMonth: 6, peakDay: 10, zhr: 100, radiantRa: 0, radiantDec: 0, con: 'Yy' },
  ];
  assert.equal(activeShower(new Date(2026, 5, 10), { showers }).name, 'Strong');
});
