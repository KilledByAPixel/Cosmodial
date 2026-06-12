// Service-worker registration + update lifecycle. Everything is injected (the real
// navigator.serviceWorker / document / location.reload come in from main.js) so the
// state machine is testable with plain fake objects.

// Calls onReady(worker) when a NEW version has finished installing while an old one is
// still controlling the page — i.e. an update is sitting in 'waiting', one tap from live.
// First-ever installs don't fire: there's nothing to "update" on a fresh visit.
export function watchRegistration(reg, serviceWorker, onReady) {
  if (reg.waiting && serviceWorker.controller) { onReady(reg.waiting); return; }
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && serviceWorker.controller) onReady(worker);
    });
  });
}

// Registers the service worker and wires the full update loop:
//  - onUpdateReady(worker) fires when a new version is ready (main.js shows the toast;
//    tapping it posts 'skip-waiting' to the worker),
//  - the page reloads once when the new worker takes over (controllerchange),
//  - returning to a visible tab re-checks for updates (screensaver sessions run for hours).
// No serviceWorker (old browser, file://) or a failed register: silently stay a plain website.
export function initUpdates({ serviceWorker, documentRef, reload, onUpdateReady }) {
  if (!serviceWorker) return;
  serviceWorker.register('./sw.js').then((reg) => {
    watchRegistration(reg, serviceWorker, onUpdateReady);
    documentRef.addEventListener('visibilitychange', () => {
      if (!documentRef.hidden) reg.update().catch(() => {});
    });
  }).catch(() => { /* registration failure is invisible: the app still works online */ });
  let reloading = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    reload();
  });
}
