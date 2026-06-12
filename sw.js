// Cosmodial service worker: precaches the entire app so it runs fully offline in a dark field.
//
// RELEASE CHECKLIST: bump CACHE below (v1 -> v2 -> ...) whenever ANY app file changes.
// A stale version here means users silently keep the old app. tests/sw.test.js keeps the
// PRECACHE list itself honest against the files on disk, but the version bump is manual.
//
// Serving is cache-first (instant offline load); the browser refetches this file in the
// background on navigation, and js/ui/update.js surfaces a "tap to apply" toast when a new
// version has finished installing. Cross-origin requests (satellite TLE fetches) are not
// intercepted — js/core/satellites.js has its own localStorage fallback.

const CACHE = 'cosmodial-v6';

const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/icon-maskable-512.png',
  './images/apple-touch-icon.png',
  './js/main.js',
  './js/core/angles.js',
  './js/core/astro.js',
  './js/core/catalogue.js',
  './js/core/cities.js',
  './js/core/comets.js',
  './js/core/constellation-names.js',
  './js/core/favorites.js',
  './js/core/moon.js',
  './js/core/orientation.js',
  './js/core/planet-moons.js',
  './js/core/projection.js',
  './js/core/satellites.js',
  './js/core/scheduler.js',
  './js/core/state.js',
  './js/edit/figures.js',
  './js/guide/conjunctions.js',
  './js/guide/eclipses.js',
  './js/guide/highlights.js',
  './js/guide/ranking.js',
  './js/guide/showers.js',
  './js/render/atmosphere.js',
  './js/render/body-sphere.js',
  './js/render/constellations.js',
  './js/render/dso.js',
  './js/render/eqgrid.js',
  './js/render/grid.js',
  './js/render/hud.js',
  './js/render/line-styles.js',
  './js/render/planets.js',
  './js/render/ring-math.js',
  './js/render/sky-background.js',
  './js/render/sky.js',
  './js/render/star-transform.js',
  './js/render/starfield-gl.js',
  './js/render/starstyle.js',
  './js/ui/about.js',
  './js/ui/card.js',
  './js/ui/favorites.js',
  './js/ui/gyro.js',
  './js/ui/input.js',
  './js/ui/install.js',
  './js/ui/location.js',
  './js/ui/menu.js',
  './js/ui/popover.js',
  './js/ui/screensaver.js',
  './js/ui/screenshot.js',
  './js/ui/search.js',
  './js/ui/share.js',
  './js/ui/slew.js',
  './js/ui/time-controls.js',
  './js/ui/timelapse.js',
  './js/ui/toast.js',
  './js/ui/update.js',
  './js/vendor/astronomy.js',
  './js/vendor/satellite.js',
  './data/constellations.json',
  './data/dso.json',
  './data/stars.json',
  './data/jupiter-2k.webp',
  './data/mars-2k.webp',
  './data/mercury-2k.webp',
  './data/milkyway-4k.webp',
  './data/moon-2k.webp',
  './data/neptune-2k.webp',
  './data/saturn-2k.webp',
  './data/saturn-rings.webp',
  './data/uranus-2k.webp',
  './data/venus-2k.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache:'reload' bypasses the HTTP cache: a version bump fetches real new bytes,
      // never a stale copy the browser cached for the previous version.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // TLE fetches etc. pass through
  if (e.request.mode === 'navigate') {
    // Any navigation (including share links with ?obj=... params) is the one-page app.
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

// The page posts 'skip-waiting' when the user taps the update toast.
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
