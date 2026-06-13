import { wrap360 } from '../core/angles.js';

// Shortest signed angular delta a->b in degrees, in (-180, 180].
function shortestDelta(a, b) { return ((b - a + 540) % 360) - 180; }

// Interpolated { az, alt, fov } at t in [0,1], cosine ease-in-out, shortest-path azimuth.
export function slewFrame(from, to, t) {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2;
  return {
    az: wrap360(from.az + shortestDelta(from.az, to.az) * c),
    alt: from.alt + (to.alt - from.alt) * c,
    fov: from.fov + (to.fov - from.fov) * c,
  };
}

// Generation token shared by every slew. A new animateSlew or a cancelSlew() bumps it; an in-flight
// step whose token no longer matches bails on its next frame, so it stops writing the aim/fov.
let slewGen = 0;

// Cancel any in-flight slew — called when the user takes the view (grab-drag, wheel, pinch) so the
// auto-zoom doesn't fight their input. Idempotent and harmless when nothing is animating.
export function cancelSlew() { slewGen++; }

// Animate the store's aim + fov to `to` over durationMs. raf/now injectable for tests. A later slew
// or cancelSlew() supersedes this one (the token check below stops it cleanly mid-flight).
export function animateSlew(store, to, opts = {}) {
  const { durationMs = 800, raf = requestAnimationFrame, now = () => performance.now(), onDone } = opts;
  const s = store.getState();
  const from = { az: s.aim.az, alt: s.aim.alt, fov: s.fov };
  const start = now();
  const gen = ++slewGen;
  const step = () => {
    if (gen !== slewGen) return; // superseded or cancelled -> stop driving the camera
    const t = Math.min(1, (now() - start) / durationMs);
    const f = slewFrame(from, to, t);
    store.setAim(f.az, f.alt);
    store.setFov(f.fov);
    if (t < 1) raf(step);
    else if (onDone) onDone();
  };
  raf(step);
}
