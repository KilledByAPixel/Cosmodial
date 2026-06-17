// Service-worker registration + update lifecycle. Everything is injected (the real
// navigator.serviceWorker / document / location.reload come in from main.js) so the
// state machine is testable with plain fake objects.

// Calls onReady(worker) when a NEW version has finished installing while an old one is
// still controlling the page — i.e. an update is sitting in 'waiting', one tap from live.
// First-ever installs don't fire: there's nothing to "update" on a fresh visit.
// Can fire more than once in a long session (visibility-driven reg.update() checks exist for
// exactly this). Each subsequent onReady supersedes the previous one; the caller's toast
// replaces itself so the tap always reaches the newest worker.
export function watchRegistration(reg, serviceWorker, onReady) {
  if (reg.waiting && serviceWorker.controller) onReady(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && serviceWorker.controller) onReady(worker);
    });
  });
}

// True on a developer's own machine, where a cache-first worker is pure friction: it serves
// the old bytes until sw.js's CACHE is bumped, so edits don't show up on reload. Everywhere
// else (a real domain) the worker is exactly what we want for instant offline loads.
// Empty hostname covers file://. LAN IPs (phone testing) are intentionally NOT dev — keep them
// on the worker so install/offline behaviour matches production.
export function isDevHost(location) {
  const h = location?.hostname ?? '';
  return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

// On a dev host, dismantle any worker a previous visit installed (and its caches) so the page
// stops being served stale bytes. This is why a plain reload "doesn't pick up changes": the
// stuck worker outlives even a browser restart until something unregisters it.
function teardownForDev(serviceWorker, cacheStorage) {
  serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
  cacheStorage?.keys?.().then((keys) => keys.forEach((k) => cacheStorage.delete(k))).catch(() => {});
}

// Registers the service worker and wires the full update loop:
//  - onUpdateReady(worker) fires when a new version is ready (main.js shows the toast;
//    tapping it posts 'skip-waiting' to the worker),
//  - the page reloads once when the new worker takes over (controllerchange),
//  - returning to a visible tab re-checks for updates (screensaver sessions run for hours).
// No serviceWorker (old browser, file://) or a failed register: silently stay a plain website.
// On a dev host we skip registration entirely and tear down any already-installed worker.
export function initUpdates({ serviceWorker, documentRef, reload, onUpdateReady, location, cacheStorage }) {
  if (!serviceWorker) return;
  if (isDevHost(location)) { teardownForDev(serviceWorker, cacheStorage); return; }
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
