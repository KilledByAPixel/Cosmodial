import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeLapse, stepRate, DEFAULT_RATE, RATE_RANGE } from '../js/ui/timelapse.js';

const T0 = 1700000000000;

test('stepRate doubles/halves and clamps to the range', () => {
  assert.equal(stepRate(60, +1), 120);
  assert.equal(stepRate(60, -1), 30);
  assert.equal(stepRate(RATE_RANGE[1], +1), RATE_RANGE[1], 'clamped at the top');
  assert.equal(stepRate(RATE_RANGE[0], -1), RATE_RANGE[0], 'clamped at the bottom');
});

// Minimal store fake mirroring the real API shape (see js/core/state.js).
function fakeStore(time = { instant: new Date(T0), live: false }) {
  let state = { time };
  return {
    getState: () => state,
    setTime: (instant, live = false) => { state = { ...state, time: { instant, live } }; },
  };
}

// Manual rAF queue + clock harness, mirroring the screensaver tests.
function harness(time) {
  const store = fakeStore(time);
  const frames = [];
  let clock = 0;
  const activeCalls = [];
  const tl = createTimeLapse(store, {
    raf: (cb) => frames.push(cb),
    now: () => clock,
    onActive: (on) => activeCalls.push(on),
  });
  const tick = (ms) => { clock += ms; frames.shift()(); };
  return { store, tl, tick, frames, activeCalls };
}

test('toggle starts the lapse from the paused instant and advances at DEFAULT_RATE', () => {
  const h = harness();
  h.tl.toggle();
  assert.ok(h.tl.isActive());
  let t = h.store.getState().time;
  assert.equal(t.live, false, 'claims the clock immediately');
  assert.equal(t.instant.getTime(), T0, 'starts from the shown instant');
  h.tick(1000);
  t = h.store.getState().time;
  assert.equal(t.instant.getTime(), T0 + 1000 * DEFAULT_RATE, '1s real = DEFAULT_RATE sim seconds');
});

test('toggle again stops, leaving time paused where the lapse landed', () => {
  const h = harness();
  h.tl.toggle();
  h.tick(2000);
  const landed = h.store.getState().time.instant.getTime();
  h.tl.toggle();
  assert.ok(!h.tl.isActive());
  h.tick(1000); // the queued frame bails without writing
  const t = h.store.getState().time;
  assert.equal(t.instant.getTime(), landed, 'clock frozen at the stop instant');
  assert.equal(t.live, false, 'still paused, not live');
});

test('faster/slower double/halve the advance rate while running', () => {
  const h = harness();
  h.tl.toggle();
  h.tl.faster();
  h.tick(1000);
  assert.equal(h.store.getState().time.instant.getTime(), T0 + 1000 * DEFAULT_RATE * 2);
  h.tl.slower();
  h.tl.slower();
  h.tick(1000);
  assert.equal(h.store.getState().time.instant.getTime(),
    T0 + 1000 * DEFAULT_RATE * 2 + 1000 * DEFAULT_RATE / 2, 'rate halved twice from 2x');
  assert.equal(h.tl.rate(), DEFAULT_RATE / 2, 'tuned rate survives until changed');
});

test('faster/slower are inert while the lapse is stopped', () => {
  const h = harness();
  h.tl.faster();
  assert.equal(h.tl.rate(), DEFAULT_RATE, 'no speed change while idle');
});

test('another writer taking the clock stops the lapse (scrubber/datetime/Live wins)', () => {
  const h = harness();
  h.tl.toggle();
  h.tick(1000);
  h.store.setTime(new Date(T0 + 5000), false); // user scrubs mid-lapse
  h.tick(1000); // the next frame notices the foreign instant and bows out
  assert.ok(!h.tl.isActive(), 'lapse deactivated');
  assert.equal(h.store.getState().time.instant.getTime(), T0 + 5000, 'the scrub instant survives');
});

test('onActive fires once per transition, including the self-stop', () => {
  const h = harness();
  h.tl.toggle();
  assert.deepEqual(h.activeCalls, [true], 'start fires onActive(true)');
  h.tl.toggle();
  h.tl.stop(); // already stopped: no duplicate callback
  assert.deepEqual(h.activeCalls, [true, false], 'stop fires onActive(false) exactly once');
  h.tl.toggle();
  h.tick(1000);
  h.store.setTime(new Date(T0 + 5000), false); // another writer takes the clock
  h.tick(1000);
  assert.deepEqual(h.activeCalls, [true, false, true, false],
    'the self-stop reports too, so the host can restore hidden chrome');
});

test('starting from live mode begins at the current wall clock', () => {
  const before = Date.now();
  const h = harness({ instant: null, live: true });
  h.tl.toggle();
  const t = h.store.getState().time;
  assert.equal(t.live, false);
  assert.ok(t.instant.getTime() >= before && t.instant.getTime() <= Date.now() + 1,
    'starts from now when live');
});
