import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framingFov, driftOffset, pickTarget, MIN_TARGET_ALT } from '../js/ui/screensaver.js';

test('framingFov frames each target type appropriately', () => {
  assert.ok(Math.abs(framingFov({ type: 'body', angularRadiusDeg: 0.26 }) - 4.16) < 0.01,
    'Moon-sized disc -> ~8x its diameter');
  assert.equal(framingFov({ type: 'body', angularRadiusDeg: 0.001 }), 0.1,
    'tiny disc clamps to the deep-zoom floor');
  assert.equal(framingFov({ type: 'body', angularRadiusDeg: 5 }), 8,
    'huge disc clamps to the ceiling');
  assert.equal(framingFov({ type: 'dso', sizeArcmin: 180 }), 9, 'big DSO -> 3x its size');
  assert.equal(framingFov({ type: 'dso', sizeArcmin: 10 }), 4, 'small DSO hits the 4-deg floor');
  assert.equal(framingFov({ type: 'dso' }), 4, 'missing size falls back to a modest field');
  assert.equal(framingFov({ type: 'star' }), 30, 'stars stay wide-field');
  assert.equal(framingFov({ type: 'comet' }), 5, 'comets get a medium field');
  const c = framingFov({ type: 'constellation' }, () => 0.5);
  assert.equal(c, 60, 'constellations frame at 50-70 deg via the rng');
});

test('driftOffset is a slow bounded wander scaled to the fov', () => {
  const fov = 30;
  const z = driftOffset(0, fov);
  assert.equal(z.az, 0, 'azimuth drift starts at zero');
  for (const t of [0, 5000, 20000, 47000]) {
    const d = driftOffset(t, fov);
    assert.ok(Math.abs(d.az) <= fov * 0.06 + 1e-9 && Math.abs(d.alt) <= fov * 0.06 + 1e-9,
      `drift at ${t}ms stays within 6% of the fov`);
  }
  const a = driftOffset(10000, fov), b = driftOffset(20000, fov);
  assert.ok(Math.abs(a.az - b.az) > 1e-3, 'the offset actually moves over time');
  assert.ok(Math.abs(a.alt - b.alt) > 1e-3, 'the alt offset moves too');
});

// A candidate whose alt-az never changes, and a base candidate factory.
const fixed = (alt, az = 100) => () => ({ az, alt });
const cand = (over = {}) => ({ type: 'star', name: 'X', altAzAt: fixed(45), ...over });
const AT = new Date(1700000000000);

test('pickTarget skips below-horizon, recently-visited, and soon-to-set candidates', () => {
  const up = cand({ name: 'Up' });
  const low = cand({ name: 'Low', altAzAt: fixed(MIN_TARGET_ALT - 5) });
  const setting = cand({ name: 'Setting', altAzAt: (d) => ({ az: 100, alt: d > AT ? 5 : 45 }) });
  const recent = cand({ name: 'Recent' });
  const pick = pickTarget([low, setting, recent, up], ['Recent'], { rng: () => 0, at: AT });
  assert.equal(pick.name, 'Up');
});

test('pickTarget returns null when nothing qualifies', () => {
  const low = cand({ name: 'Low', altAzAt: fixed(2) });
  assert.equal(pickTarget([low], [], { rng: () => 0, at: AT }), null);
  assert.equal(pickTarget([], [], { rng: () => 0, at: AT }), null);
});

test('pickTarget picks roughly uniformly across type pools, not across candidates', () => {
  // 3 stars + 1 dso: first rng call picks the pool, second the member. rng=0.9 -> the
  // second pool (dso) despite stars outnumbering it 3:1.
  const stars = ['S1', 'S2', 'S3'].map((name) => cand({ name }));
  const dso = cand({ type: 'dso', name: 'M31' });
  const seq = [0.9, 0.0];
  const rng = () => seq.shift();
  assert.equal(pickTarget([...stars, dso], [], { rng, at: AT }).name, 'M31');
});

test('pickTarget prefers priority candidates (the Moon mid-eclipse) unless just visited', () => {
  const moon = cand({ type: 'body', name: 'Moon', priority: true });
  const star = cand({ name: 'Vega' });
  assert.equal(pickTarget([star, moon], [], { rng: () => 0, at: AT }).name, 'Moon',
    'a priority candidate preempts the rotation');
  assert.equal(pickTarget([star, moon], ['Moon'], { rng: () => 0, at: AT }).name, 'Vega',
    'recency still wins — the show does not pin itself on the Moon all eclipse');
});
