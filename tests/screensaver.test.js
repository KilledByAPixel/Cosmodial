import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framingFov, driftOffset, pickTarget, createScreensaver, MIN_TARGET_ALT, TIME_SCALE } from '../js/ui/screensaver.js';

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

const T0 = 1700000000000;
const HOUR = 3.6e6;

// Minimal store fake mirroring the real API shape (see js/core/state.js).
function fakeStore() {
  let state = {
    aim: { az: 0, alt: 0 }, fov: 60,
    time: { instant: new Date(T0), live: false },
    flags: { gyro: false },
  };
  return {
    getState: () => state,
    setAim: (az, alt) => { state = { ...state, aim: { az, alt } }; },
    setFov: (fov) => { state = { ...state, fov }; },
    setTime: (instant, live = false) => { state = { ...state, time: { instant, live } }; },
    setFlag: (name, value) => { state = { ...state, flags: { ...state.flags, [name]: value } }; },
  };
}

// Test harness: manual rAF queue + clock, recording deps. Night by default (sun at -20).
function harness(depsOver = {}) {
  const store = fakeStore();
  const frames = [];
  let clock = 0;
  const calls = { hidden: [] };
  let exitCb = null;
  const ss = createScreensaver(store, {
    getCandidates: () => [
      cand({ name: 'A', altAzAt: fixed(45, 100) }),
      cand({ name: 'B', altAzAt: fixed(60, 200) }),
    ],
    sunAltAt: () => -20,
    nextDusk: (d) => new Date(d.getTime() + 6 * HOUR),
    setUiHidden: (on) => calls.hidden.push(on),
    bindExit: (cb) => { exitCb = cb; return () => { exitCb = null; }; },
    raf: (cb) => frames.push(cb),
    now: () => clock,
    rng: () => 0.5,
    ...depsOver,
  });
  // Advance the clock and run the next queued frame.
  const tick = (ms) => { clock += ms; frames.shift()(); };
  return { store, ss, tick, calls, frames, triggerExit: () => exitCb && exitCb(), isExitBound: () => !!exitCb };
}

test('start hides the UI, binds exit, and runs the time-lapse', () => {
  const h = harness();
  h.ss.start();
  assert.deepEqual(h.calls.hidden, [true], 'UI hidden on start');
  assert.ok(h.isExitBound(), 'exit listeners bound');
  assert.ok(h.ss.isActive());
  h.tick(1000);
  const t = h.store.getState().time;
  assert.equal(t.live, false, 'time is paused-at-instant while active');
  assert.equal(t.instant.getTime(), T0 + 1000 * TIME_SCALE, '1s real = TIME_SCALE sim seconds');
});

test('the slew eases to the target framing, then the dwell drifts around it', () => {
  const h = harness();
  h.ss.start();
  // rng 0.5 -> slew 6000ms, dwell 15000ms; pools: one 'star' pool, member index 1 -> 'B'.
  for (let i = 0; i < 6; i++) h.tick(1000);  // 6s: slew complete
  const st = h.store.getState();
  assert.ok(Math.abs(st.aim.az - 200) < 1e-6 && Math.abs(st.aim.alt - 60) < 1e-6,
    'arrived exactly on target B');
  assert.ok(Math.abs(st.fov - 30) < 1e-6, 'at the star framing fov');
  h.tick(1000); // 1s into the dwell
  const d = h.store.getState();
  assert.ok(Math.abs(d.aim.az - 200) < 2 && Math.abs(d.aim.alt - 60) < 2,
    'dwell stays near the target (small drift only)');
  assert.equal(d.fov, 30, 'fov holds during the dwell');
});

test('daytime skips ahead to the next dusk', () => {
  const h = harness({
    sunAltAt: (d) => (d.getTime() < T0 + 6 * HOUR ? 10 : -20), // day until T0+6h
    nextDusk: () => new Date(T0 + 6 * HOUR),
  });
  h.ss.start();
  h.tick(16);
  assert.equal(h.store.getState().time.instant.getTime(), T0 + 6 * HOUR + 60000,
    'sim clock jumped to 60s past dusk (prevents re-firing on tolerance)');
});

test('with no eligible targets the camera falls back to a slow pan', () => {
  const h = harness({ getCandidates: () => [] });
  h.ss.start();
  for (let i = 0; i < 4; i++) h.tick(1000);  // 4s: pan fully eased in
  const st = h.store.getState();
  assert.ok(Math.abs(st.aim.alt - 30) < 1e-6, 'pan holds a mid-sky altitude');
  assert.ok(Math.abs(st.fov - 70) < 1e-6, 'pan is wide-field');
  assert.ok(st.aim.az > 0 && st.aim.az < 10, 'azimuth creeps forward');
});

test('exit restores the exact prior view and time, unhides, and unbinds', () => {
  const h = harness();
  h.ss.start();
  for (let i = 0; i < 8; i++) h.tick(1000);  // well into the show
  h.triggerExit();
  const st = h.store.getState();
  assert.deepEqual(st.aim, { az: 0, alt: 0 }, 'aim restored');
  assert.equal(st.fov, 60, 'fov restored');
  assert.equal(st.time.instant.getTime(), T0, 'instant restored');
  assert.equal(st.time.live, false, 'live mode restored');
  assert.deepEqual(h.calls.hidden, [true, false], 'UI unhidden');
  assert.ok(!h.ss.isActive() && !h.isExitBound(), 'inactive and unbound');
});

test('a live-time session is restored to live on exit', () => {
  const h = harness();
  h.store.setTime(null, true);
  h.ss.start();
  h.tick(1000);
  assert.equal(h.store.getState().time.live, false, 'paused during the show');
  h.triggerExit();
  const t = h.store.getState().time;
  assert.equal(t.live, true, 'back to live');
  assert.equal(t.instant, null);
});

test('starting under gyro aim turns the gyro flag off', () => {
  const h = harness();
  h.store.setFlag('gyro', true);
  h.ss.start();
  assert.equal(h.store.getState().flags.gyro, false, 'sensor aim would fight the tour');
});

test('polar summer (no dusk in reach) runs the show in daylight without re-searching', () => {
  let duskCalls = 0;
  const h = harness({
    sunAltAt: () => 10,
    nextDusk: () => { duskCalls++; return null; },
  });
  h.ss.start();
  for (let i = 0; i < 5; i++) h.tick(1000);
  assert.equal(duskCalls, 1, 'gave up after one null - no per-frame re-search');
  assert.equal(h.store.getState().time.instant.getTime(), T0 + 5000 * TIME_SCALE,
    'time-lapse keeps running in daylight');
  assert.ok(h.ss.isActive());
});

test('the dwell ramp starts the drift from zero (exact arrival hold)', () => {
  const h = harness();
  h.ss.start();
  for (let i = 0; i < 6; i++) h.tick(1000); // slew complete -> dwell begins
  h.tick(50); // 50ms into the dwell: the ramp keeps the offset tiny
  const st = h.store.getState();
  assert.ok(Math.abs(st.aim.az - 200) < 0.05 && Math.abs(st.aim.alt - 60) < 0.05,
    'still pinned to the target right after arrival');
});

test('after exit the leftover queued frame is inert and stop is idempotent', () => {
  const h = harness();
  h.ss.start();
  h.tick(1000);
  h.triggerExit();
  h.ss.stop(); // second stop: no-op
  const before = JSON.stringify(h.store.getState());
  while (h.frames.length) h.tick(16); // drain whatever was queued
  assert.equal(JSON.stringify(h.store.getState()), before, 'store untouched after stop');
  assert.deepEqual(h.calls.hidden, [true, false], 'UI toggled exactly once each way');
});

test('a stale queued frame from a previous run cannot double-step the loop', () => {
  const h = harness();
  h.ss.start();
  h.tick(1000);
  h.triggerExit();           // one stale frame is still queued
  h.ss.start();              // restart immediately, stale frame not yet drained
  for (let i = 0; i < 3; i++) h.tick(16);
  assert.equal(h.frames.length, 1, 'exactly one live frame chain');
});

test('gyro mode is handed back to the sensors on exit', () => {
  const h = harness();
  h.store.setFlag('gyro', true);
  h.ss.start();
  assert.equal(h.store.getState().flags.gyro, false, 'off during the show');
  h.triggerExit();
  assert.equal(h.store.getState().flags.gyro, true, 'restored on exit');
});

test('constellation dwells hold a fixed frame so the stars stream through', () => {
  const orion = {
    type: 'constellation', name: 'Orion',
    // Jumps after arrival: a (buggy) tracking dwell would follow it; a frozen one won't.
    altAzAt: (d) => (d.getTime() - T0 > 6500 * TIME_SCALE ? { az: 140, alt: 20 } : { az: 100, alt: 45 }),
  };
  const h = harness({ getCandidates: () => [orion] });
  h.ss.start();
  for (let i = 0; i < 6; i++) h.tick(1000); // arrive: base frozen at az 100 / alt 45
  for (let i = 0; i < 4; i++) h.tick(1000); // 4s into the dwell, target "moved" to az 140
  const st = h.store.getState();
  assert.ok(Math.abs(st.aim.az - 100) < 4 && Math.abs(st.aim.alt - 45) < 4,
    'aim stayed on the frozen frame (drift only), not the moved target');
});
