// Screensaver mode: hide the chrome and wander the sky on autopilot — long eased slews
// between interesting targets, calm dwells with a slight drift, and a gentle time-lapse
// that skips daytime. Any tap/key/scroll exits and restores the exact prior view and time.
// The choreography helpers are pure (exported for tests); createScreensaver owns the loop.

import { clamp } from '../core/angles.js';

// Tuning. Durations are real milliseconds; SIM marks simulated (time-lapse) time.
export const TIME_SCALE = 90;      // simulated seconds per real second (~a night in 6 minutes)
export const DUSK_SUN_ALT = -6;    // Sun altitude (deg) marking "dark enough" (end of civil twilight)
export const MIN_TARGET_ALT = 10;  // deg: candidates below this aren't worth visiting
export const RECENT_WINDOW = 5;    // never revisit any of the last N targets
const SLEW_MS = [4000, 8000];      // randomized slew duration range
const DWELL_MS = [10000, 20000];   // randomized dwell duration range
const DRIFT_RAMP_MS = 3000;        // ease the dwell drift in from zero
const PAN_MS = 10000;              // fallback horizon pan length before re-picking
const PAN_ALT = 30;                // fallback pan altitude (deg)
const PAN_FOV = 70;                // fallback pan field of view (deg)
const PAN_RATE = 0.4;              // fallback pan, degrees of azimuth per real second

// Worst-case SIM time one visit can take (longest slew + dwell): the "will it still be
// up at the end?" eligibility horizon.
const MAX_VISIT_SIM_MS = (SLEW_MS[1] + DWELL_MS[1]) * TIME_SCALE;

// FOV (degrees) that frames a target by type. Bodies zoom to ~8x the disc diameter
// (16x the radius) so the disc fills a satisfying chunk of frame without overzooming;
// DSOs a medium field around their catalogued size; stars stay wide (they're points);
// constellations frame the whole figure.
export function framingFov(target, rng = Math.random) {
  switch (target.type) {
    case 'body': return clamp(16 * (target.angularRadiusDeg || 0), 0.1, 8);
    case 'dso': return clamp(((target.sizeArcmin || 60) / 60) * 3, 4, 20);
    case 'comet': return 5;
    case 'star': return 30;
    case 'constellation': return 50 + rng() * 20;
    default: return 60;
  }
}

// Pick the next target: only candidates above MIN_TARGET_ALT now AND at the end of a
// worst-case visit (so nothing sets mid-dwell), excluding recently-visited names. A
// priority candidate (the Moon mid-eclipse) preempts the rotation; otherwise roughly
// uniform across the type pools so the largest catalogue doesn't dominate the show.
// Null when nothing qualifies (the controller falls back to a horizon pan).
export function pickTarget(candidates, recentNames, opts) {
  const { rng = Math.random, at, visitSimMs = MAX_VISIT_SIM_MS } = opts;
  const later = new Date(at.getTime() + visitSimMs);
  const eligible = candidates.filter((c) =>
    !recentNames.includes(c.name) &&
    c.altAzAt(at).alt >= MIN_TARGET_ALT &&
    c.altAzAt(later).alt >= MIN_TARGET_ALT);
  if (!eligible.length) return null;
  const prio = eligible.filter((c) => c.priority);
  const pickFrom = prio.length ? prio : eligible;
  const pools = new Map();
  for (const c of pickFrom) {
    if (!pools.has(c.type)) pools.set(c.type, []);
    pools.get(c.type).push(c);
  }
  const types = [...pools.keys()];
  const pool = pools.get(types[Math.floor(rng() * types.length)]);
  return pool[Math.floor(rng() * pool.length)];
}

// The "slight chill movement" during a dwell: a slow Lissajous wander scaled to the FOV.
// Two incommensurate periods so the path never visibly repeats. alt starts mid-swing
// (phase 1.3) for variety; the controller ramps the whole offset in from zero over
// DRIFT_RAMP_MS, so the dwell still begins exactly on target.
export function driftOffset(tMs, fov) {
  const a = fov * 0.06;
  return {
    az: a * Math.sin((2 * Math.PI * tMs) / 41000),
    alt: a * Math.sin((2 * Math.PI * tMs) / 53000 + 1.3),
  };
}
