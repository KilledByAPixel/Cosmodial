import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTle, tleEpoch, issAltAz, isSunlit, issMagnitude, findNextVisiblePass, loadIssTle, TLE_MAX_AGE_DAYS } from '../js/core/iss.js';

// Real ISS TLE pinned from CelesTrak (epoch 2026-06-11 ~20:03 UTC) — the tests' oracle.
const L1 = '1 25544U 98067A   26162.83551936  .00007284  00000+0  13937-3 0  9993';
const L2 = '2 25544  51.6334 326.5798 0004934 175.2433 184.8603 15.49179015570924';
const EPOCH = new Date('2026-06-11T20:03:09Z');
const HOUR = 3600000;

test('parseTle accepts a real TLE and rejects garbage', () => {
  const rec = parseTle(L1, L2);
  assert.ok(rec, 'real TLE parses');
  assert.ok(Math.abs(tleEpoch(rec).getTime() - EPOCH.getTime()) < HOUR, 'epoch decodes to the TLE day fraction');
  assert.equal(parseTle('not a tle', 'also not'), null);
});

test('the TLE describes the real ISS orbit (~93 min period, never closer than its altitude)', () => {
  const rec = parseTle(L1, L2);
  const periodMin = (2 * Math.PI) / rec.no; // satrec mean motion is rad/min
  assert.ok(periodMin > 88 && periodMin < 96, `period ${periodMin.toFixed(1)} min`);
  for (let m = 0; m <= 93; m += 1) {
    const p = issAltAz(rec, 40, -105, new Date(EPOCH.getTime() + m * 60000));
    assert.ok(p, 'propagates near epoch');
    assert.ok(p.alt >= -90 && p.alt <= 90 && p.az >= 0 && p.az < 360, `sane alt/az at +${m} min`);
    assert.ok(p.rangeKm > 350, `range ${p.rangeKm.toFixed(0)} km can't beat the orbit height at +${m} min`);
  }
});

test('issAltAz refuses to extrapolate a stale TLE (the time-travel guard)', () => {
  const rec = parseTle(L1, L2);
  assert.ok(issAltAz(rec, 40, -105, new Date(EPOCH.getTime() + 86400000)), 'epoch +1 day tracks');
  assert.equal(issAltAz(rec, 40, -105, new Date(EPOCH.getTime() + (TLE_MAX_AGE_DAYS + 1) * 86400000)), null, 'past the window: absent');
  assert.equal(issAltAz(rec, 40, -105, new Date('2032-11-13T00:00:00Z')), null, 'scrubbed to 2032: absent');
});

test('isSunlit: cylindrical Earth-shadow geometry', () => {
  const sun = { x: 1, y: 0, z: 0 };
  assert.ok(isSunlit({ x: 6800, y: 0, z: 0 }, sun), 'sun side is lit');
  assert.ok(!isSunlit({ x: -6800, y: 0, z: 0 }, sun), 'anti-sun on the shadow axis is dark');
  assert.ok(isSunlit({ x: -6800, y: 8000, z: 0 }, sun), 'anti-sun but outside the cylinder is lit');
});

test('issMagnitude: bright overhead, dimmer at range', () => {
  assert.ok(Math.abs(issMagnitude(1000) - -1.8) < 1e-9, 'standard magnitude at 1000 km');
  assert.ok(issMagnitude(420) < -3, 'zenith pass rivals Venus');
  assert.ok(issMagnitude(2200) > issMagnitude(420), 'monotonic with range');
});

test('findNextVisiblePass finds a plausible pass under permissive skies, none in daylight', () => {
  const rec = parseTle(L1, L2);
  const dark = { sunAltAt: () => -30, sunDirAt: () => ({ x: 1, y: 0, z: 0 }) };
  const p = findNextVisiblePass(rec, 40, -105, EPOCH, dark);
  assert.ok(p, 'permissive sky yields a pass within 1.5 days');
  assert.ok(p.start <= p.peakDate && p.peakDate <= p.end, 'contacts ordered');
  assert.ok((p.end - p.start) / 60000 <= 15, `watchable portion ${(p.end - p.start) / 60000} min is pass-length`);
  assert.ok(p.peakAlt >= 10 && p.peakAlt <= 90, `peak alt ${p.peakAlt.toFixed(0)}`);
  for (const az of [p.startAz, p.peakAz, p.endAz]) assert.ok(az >= 0 && az < 360, 'compass-ready azimuths');

  const day = { sunAltAt: () => 30, sunDirAt: () => ({ x: 1, y: 0, z: 0 }) };
  assert.equal(findNextVisiblePass(rec, 40, -105, EPOCH, day), null, 'no watchable pass in daylight');
});

// --- TLE acquisition: everything injected, no network, no real localStorage ---

const CELESTRAK_BODY = `ISS (ZARYA)             \n${L1}\n${L2}\n`;
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), dump: () => m };
};

test('loadIssTle: a fresh cache wins without touching the network', async () => {
  const cached = JSON.stringify({ line1: L1, line2: L2, fetchedAt: 1000 });
  let fetches = 0;
  const tle = await loadIssTle({
    storage: memStorage({ 'cosmodial.issTle': cached }),
    fetchImpl: () => { fetches++; throw new Error('should not fetch'); },
    now: () => 1000 + 60000,
  });
  assert.equal(tle.line1, L1);
  assert.equal(fetches, 0, 'no network call');
});

test('loadIssTle: stale cache refreshes from the first working source and re-caches', async () => {
  const store = memStorage({ 'cosmodial.issTle': JSON.stringify({ line1: 'old1', line2: 'old2', fetchedAt: 0 }) });
  const tle = await loadIssTle({
    storage: store,
    fetchImpl: async () => ({ ok: true, text: async () => CELESTRAK_BODY }),
    now: () => 10 * 86400000,
  });
  assert.equal(tle.line1, L1, 'fresh lines returned');
  assert.ok(store.dump().get('cosmodial.issTle').includes(L1), 'fresh lines cached');
});

test('loadIssTle: network failure falls back to the cache at any age; nothing at all means null', async () => {
  const stale = JSON.stringify({ line1: L1, line2: L2, fetchedAt: 0 });
  const offline = async () => { throw new Error('offline'); };
  const tle = await loadIssTle({ storage: memStorage({ 'cosmodial.issTle': stale }), fetchImpl: offline, now: () => 30 * 86400000 });
  assert.equal(tle.line1, L1, 'stale cache still returned (validity window decides downstream)');
  assert.equal(await loadIssTle({ storage: memStorage(), fetchImpl: offline }), null, 'no cache, no network: absent');
});

test('loadIssTle: a source returning junk is skipped, the JSON fallback is used', async () => {
  let call = 0;
  const tle = await loadIssTle({
    storage: memStorage(),
    fetchImpl: async () => (++call === 1
      ? { ok: true, text: async () => '<html>maintenance</html>' }
      : { ok: true, text: async () => JSON.stringify({ line1: L1, line2: L2 }) }),
  });
  assert.equal(call, 2, 'fell through to the second source');
  assert.equal(tle.line1, L1);
});
