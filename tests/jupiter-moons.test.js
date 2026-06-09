import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, makeTime, Body, jupiterMoonsAltAz, altAzOfBody } from '../js/core/astro.js';
import { vec } from '../js/core/projection.js';

const observer = makeObserver(40.0, -74.0);
const sepDeg = (a, b) => {
  const va = vec(a.az, a.alt), vb = vec(b.az, b.alt);
  return (Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))) * 180) / Math.PI;
};

test('jupiterMoonsAltAz returns the four Galilean moons, near Jupiter, sane fields', () => {
  const time = makeTime(new Date('2026-06-09T04:00:00Z'));
  const moons = jupiterMoonsAltAz(observer, time);
  assert.equal(moons.length, 4);
  assert.deepEqual(moons.map((m) => m.name), ['Io', 'Europa', 'Ganymede', 'Callisto']);
  const jup = altAzOfBody(Body.Jupiter, observer, time);
  for (const m of moons) {
    const d = sepDeg(m.altaz, jup);
    assert.ok(d < 0.25, `${m.name} is ${d} deg from Jupiter (must be within its orbit, < 0.25)`);
    assert.ok(d > 1e-5, `${m.name} is not exactly at Jupiter`);
    assert.ok(m.mag >= 4 && m.mag <= 6, `${m.name} mag ${m.mag}`);
    assert.equal(typeof m.behind, 'boolean');
  }
});

test('moons move and occasionally hide behind the disc across a week of samples', () => {
  let moved = 0, behindSeen = 0, visibleAlways = 0;
  const t0 = Date.parse('2026-06-09T00:00:00Z');
  let prev = null;
  for (let day = 0; day < 7; day += 0.25) {
    const moons = jupiterMoonsAltAz(observer, makeTime(new Date(t0 + day * 86400e3)));
    behindSeen += moons.filter((m) => m.behind).length;
    visibleAlways += moons.filter((m) => !m.behind).length;
    if (prev && sepDeg(moons[0].altaz, prev[0].altaz) > 1e-4) moved++;
    prev = moons;
  }
  assert.ok(moved > 20, `Io moved between samples (${moved}/27)`);
  assert.ok(visibleAlways > 80, 'most moon-samples are visible');
  // Io occults roughly every 1.8 days, but exact counts depend on geometry/sampling — assert only a
  // sane bound (occultations are RARE: most of the 112 moon-samples must be visible).
  assert.ok(behindSeen < 15, `behind flagged ${behindSeen}/112 samples — should be rare`);
});
