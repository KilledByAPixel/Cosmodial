import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SATELLITES, parseTle, tleEpoch, satAltAz, isSunlit, satMagnitude, findNextVisiblePass, loadSatTles, TLE_MAX_AGE_DAYS } from '../js/core/satellites.js';

// Real TLEs pinned from CelesTrak's stations group (2026-06-11) — the tests' oracles.
const ISS_L1 = '1 25544U 98067A   26162.83551936  .00007284  00000+0  13937-3 0  9993';
const ISS_L2 = '2 25544  51.6334 326.5798 0004934 175.2433 184.8603 15.49179015570924';
const ISS_EPOCH = new Date('2026-06-11T20:03:09Z');
const CSS_L1 = '1 48274U 21035A   26162.53781053  .00016554  00000+0  19807-3 0  9993';
const CSS_L2 = '2 48274  41.4693 356.3768 0008209  31.5834 328.5496 15.60566891292282';
const HOUR = 3600000;

test('the catalog stays curated: two stations, each fully described', () => {
  assert.deepEqual(SATELLITES.map((s) => s.id), ['ISS', 'Tiangong']);
  for (const s of SATELLITES) {
    assert.ok(s.noradId > 0 && s.label && s.title && s.blurb && Number.isFinite(s.stdMag), `${s.id} fully described`);
  }
});

test('parseTle accepts real TLEs and rejects garbage', () => {
  const rec = parseTle(ISS_L1, ISS_L2);
  assert.ok(rec, 'real TLE parses');
  assert.ok(Math.abs(tleEpoch(rec).getTime() - ISS_EPOCH.getTime()) < HOUR, 'epoch decodes to the TLE day fraction');
  assert.equal(parseTle('not a tle', 'also not'), null);
});

test('the TLEs describe the real orbits: ~93 min ISS, ~92 min Tiangong, sane ranges', () => {
  for (const [l1, l2] of [[ISS_L1, ISS_L2], [CSS_L1, CSS_L2]]) {
    const rec = parseTle(l1, l2);
    const periodMin = (2 * Math.PI) / rec.no; // satrec mean motion is rad/min
    assert.ok(periodMin > 88 && periodMin < 96, `period ${periodMin.toFixed(1)} min`);
    for (let m = 0; m <= 93; m += 1) {
      const p = satAltAz(rec, 40, -105, new Date(tleEpoch(rec).getTime() + m * 60000));
      assert.ok(p, 'propagates near epoch');
      assert.ok(p.alt >= -90 && p.alt <= 90 && p.az >= 0 && p.az < 360, `sane alt/az at +${m} min`);
      assert.ok(p.rangeKm > 350, `range ${p.rangeKm.toFixed(0)} km can't beat the orbit height at +${m} min`);
    }
  }
});

test('satAltAz refuses to extrapolate a stale TLE (the time-travel guard)', () => {
  const rec = parseTle(ISS_L1, ISS_L2);
  assert.ok(satAltAz(rec, 40, -105, new Date(ISS_EPOCH.getTime() + 86400000)), 'epoch +1 day tracks');
  assert.equal(satAltAz(rec, 40, -105, new Date(ISS_EPOCH.getTime() + (TLE_MAX_AGE_DAYS + 1) * 86400000)), null, 'past the window: absent');
  assert.equal(satAltAz(rec, 40, -105, new Date('2032-11-13T00:00:00Z')), null, 'scrubbed to 2032: absent');
});

test('isSunlit: cylindrical Earth-shadow geometry', () => {
  const sun = { x: 1, y: 0, z: 0 };
  assert.ok(isSunlit({ x: 6800, y: 0, z: 0 }, sun), 'sun side is lit');
  assert.ok(!isSunlit({ x: -6800, y: 0, z: 0 }, sun), 'anti-sun on the shadow axis is dark');
  assert.ok(isSunlit({ x: -6800, y: 8000, z: 0 }, sun), 'anti-sun but outside the cylinder is lit');
});

test('satMagnitude: bright overhead, dimmer at range, dimmer per-satellite stdMag', () => {
  assert.ok(Math.abs(satMagnitude(1000) - -1.8) < 1e-9, 'ISS standard magnitude at 1000 km');
  assert.ok(satMagnitude(420) < -3, 'an ISS zenith pass rivals Venus');
  assert.ok(satMagnitude(2200) > satMagnitude(420), 'monotonic with range');
  assert.ok(satMagnitude(420, -0.4) > satMagnitude(420, -1.8), 'Tiangong runs dimmer than the ISS at the same range');
});

test('findNextVisiblePass finds a plausible pass under permissive skies, none in daylight', () => {
  const rec = parseTle(ISS_L1, ISS_L2);
  const dark = { sunAltAt: () => -30, sunDirAt: () => ({ x: 1, y: 0, z: 0 }) };
  const p = findNextVisiblePass(rec, 40, -105, ISS_EPOCH, dark);
  assert.ok(p, 'permissive sky yields a pass within 1.5 days');
  assert.ok(p.start <= p.peakDate && p.peakDate <= p.end, 'contacts ordered');
  assert.ok((p.end - p.start) / 60000 <= 15, `watchable portion ${(p.end - p.start) / 60000} min is pass-length`);
  assert.ok(p.peakAlt >= 10 && p.peakAlt <= 90, `peak alt ${p.peakAlt.toFixed(0)}`);
  for (const az of [p.startAz, p.peakAz, p.endAz]) assert.ok(az >= 0 && az < 360, 'compass-ready azimuths');

  const day = { sunAltAt: () => 30, sunDirAt: () => ({ x: 1, y: 0, z: 0 }) };
  assert.equal(findNextVisiblePass(rec, 40, -105, ISS_EPOCH, day), null, 'no watchable pass in daylight');
});

// --- TLE acquisition: everything injected, no network, no real localStorage ---

const GROUP_BODY = `ISS (ZARYA)             \n${ISS_L1}\n${ISS_L2}\nFREGAT DEB              \n1 49271U 11037PF  26151.14915702  .00018955  00000+0  30994-1 0  9992\n2 49271  51.6227  53.0895 0914379 245.3590 104.9405 12.41880577222933\nCSS (TIANHE)            \n${CSS_L1}\n${CSS_L2}\n`;
const KEY = 'cosmodial.satTles';
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), dump: () => m };
};

test('loadSatTles: the stations group yields both catalog satellites, debris ignored', async () => {
  const store = memStorage();
  const res = await loadSatTles({ storage: store, fetchImpl: async () => ({ ok: true, text: async () => GROUP_BODY }) });
  assert.deepEqual(Object.keys(res.tles).sort(), ['ISS', 'Tiangong']);
  assert.equal(res.tles.ISS.line1, ISS_L1);
  assert.equal(res.tles.Tiangong.line2, CSS_L2);
  assert.ok(store.dump().get(KEY).includes(CSS_L1), 'both cached');
});

test('loadSatTles: a fresh cache wins without touching the network', async () => {
  const cached = JSON.stringify({ fetchedAt: 1000, tles: { ISS: { line1: ISS_L1, line2: ISS_L2 } } });
  let fetches = 0;
  const res = await loadSatTles({
    storage: memStorage({ [KEY]: cached }),
    fetchImpl: () => { fetches++; throw new Error('should not fetch'); },
    now: () => 1000 + 60000,
  });
  assert.equal(res.tles.ISS.line1, ISS_L1);
  assert.equal(fetches, 0, 'no network call');
});

test('loadSatTles: the ISS-only fallback source still yields a partial catalog', async () => {
  let call = 0;
  const res = await loadSatTles({
    storage: memStorage(),
    fetchImpl: async () => (++call === 1
      ? { ok: true, text: async () => '<html>maintenance</html>' }
      : { ok: true, text: async () => JSON.stringify({ line1: ISS_L1, line2: ISS_L2 }) }),
  });
  assert.equal(call, 2, 'fell through to the second source');
  assert.deepEqual(Object.keys(res.tles), ['ISS'], 'Tiangong simply absent');
});

test('loadSatTles: network failure falls back to the cache at any age; nothing at all means null', async () => {
  const stale = JSON.stringify({ fetchedAt: 0, tles: { ISS: { line1: ISS_L1, line2: ISS_L2 } } });
  const offline = async () => { throw new Error('offline'); };
  const res = await loadSatTles({ storage: memStorage({ [KEY]: stale }), fetchImpl: offline, now: () => 30 * 86400000 });
  assert.equal(res.tles.ISS.line1, ISS_L1, 'stale cache still returned (validity window decides downstream)');
  assert.equal(await loadSatTles({ storage: memStorage(), fetchImpl: offline }), null, 'no cache, no network: absent');
});
