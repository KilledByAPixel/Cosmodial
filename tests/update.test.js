import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchRegistration, initUpdates } from '../js/ui/update.js';

// Minimal fakes: objects that record listeners and let tests fire them by name.
function fakeTarget(props = {}) {
  const listeners = {};
  return {
    ...props,
    listeners,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    fire(type) { for (const fn of listeners[type] ?? []) fn(); },
  };
}

test('watchRegistration reports an already-waiting worker (page loaded mid-update)', () => {
  const waiting = { id: 'w' };
  const ready = [];
  watchRegistration(fakeTarget({ waiting }), { controller: {} }, (w) => ready.push(w));
  assert.deepEqual(ready, [waiting]);
});

test('watchRegistration reports a worker that installs while an old one controls', () => {
  const reg = fakeTarget();
  const sw = { controller: {} };
  const ready = [];
  watchRegistration(reg, sw, (w) => ready.push(w));
  const worker = fakeTarget({ state: 'installing' });
  reg.installing = worker;
  reg.fire('updatefound');
  assert.deepEqual(ready, [], 'not ready while still installing');
  worker.state = 'installed';
  worker.fire('statechange');
  assert.deepEqual(ready, [worker]);
});

test('watchRegistration stays silent on first-ever install (nothing controlling yet)', () => {
  const reg = fakeTarget();
  const ready = [];
  watchRegistration(reg, { controller: null }, (w) => ready.push(w));
  const worker = fakeTarget({ state: 'installed' });
  reg.installing = worker;
  reg.fire('updatefound');
  worker.fire('statechange');
  assert.deepEqual(ready, [], 'first install is not an "update"');
});

test('initUpdates registers ./sw.js, reloads once on controllerchange, re-checks on visibility', async () => {
  const reg = fakeTarget({ updateCalls: 0, update() { this.updateCalls += 1; return Promise.resolve(); } });
  const sw = fakeTarget({ controller: {}, register: (url) => { sw.registered = url; return Promise.resolve(reg); } });
  const doc = fakeTarget({ hidden: false });
  let reloads = 0;
  initUpdates({ serviceWorker: sw, documentRef: doc, reload: () => { reloads += 1; }, onUpdateReady: () => {} });
  await Promise.resolve(); await Promise.resolve(); // let register() resolve
  assert.equal(sw.registered, './sw.js');

  doc.fire('visibilitychange');
  assert.equal(reg.updateCalls, 1, 'visible tab re-checks for updates');
  doc.hidden = true;
  doc.fire('visibilitychange');
  assert.equal(reg.updateCalls, 1, 'hidden tab does not');

  sw.fire('controllerchange');
  sw.fire('controllerchange');
  assert.equal(reloads, 1, 'reload exactly once, even if the event double-fires');
});

test('initUpdates is a no-op without serviceWorker support', () => {
  assert.doesNotThrow(() => initUpdates({ serviceWorker: undefined, documentRef: fakeTarget(), reload: () => {}, onUpdateReady: () => {} }));
});
