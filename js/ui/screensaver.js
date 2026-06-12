// Screensaver mode: hide the chrome and wander the sky on autopilot — long eased slews
// between interesting targets, calm dwells with a slight drift, and a gentle time-lapse
// that skips daytime. Any tap/key/scroll exits and restores the exact prior view and time.
// The choreography helpers are pure (exported for tests); createScreensaver owns the loop.

import { clamp } from '../core/angles.js';
import { slewFrame } from './slew.js';

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

// The screensaver controller. Drives the app only through the store API; everything
// environmental comes in via deps so the loop is testable with fakes:
//   getCandidates(): [{ type, name, altAzAt(date), priority?, angularRadiusDeg?, sizeArcmin? }]
//   sunAltAt(date): Sun altitude (deg) at a simulated instant
//   nextDusk(date): Date the Sun next sinks below DUSK_SUN_ALT, or null (polar summer)
//   setUiHidden(on): hide/show the chrome (and clear any card/lock-on when hiding)
//   bindExit(onExit): attach the wake-up listeners; returns an unbind function
//   raf / now / rng: injectable for tests (same pattern as animateSlew)
export function createScreensaver(store, deps) {
  const { raf = requestAnimationFrame, now = () => performance.now(), rng = Math.random } = deps;
  let active = false;
  let saved = null;       // { aim, fov, time } snapshot restored on exit
  let unbindExit = null;
  let wakeLock = null;
  let simMs = 0;          // simulated clock (ms epoch), advanced TIME_SCALE x real time
  let lastReal = 0;
  let shot = null;        // current shot: { mode, target, from, startReal, slewMs, dwellMs, fov, base }
  const recent = [];      // last RECENT_WINDOW target names

  const randIn = ([lo, hi]) => lo + rng() * (hi - lo);

  // Begin the next shot from wherever the camera is: a fresh target if one qualifies,
  // else a slow wide pan until something rises.
  function nextShot() {
    const st = store.getState();
    const from = { az: st.aim.az, alt: st.aim.alt, fov: st.fov };
    const target = pickTarget(deps.getCandidates(), recent, { rng, at: new Date(simMs) });
    if (!target) {
      shot = { mode: 'pan', from, startReal: now() };
      return;
    }
    recent.push(target.name);
    if (recent.length > RECENT_WINDOW) recent.shift();
    shot = {
      mode: 'slew', target, from, startReal: now(),
      slewMs: randIn(SLEW_MS), dwellMs: randIn(DWELL_MS),
      fov: framingFov(target, rng), base: null,
    };
  }

  // Skip the daylight: jump the simulated clock to the next dusk and re-pick there.
  function skipToDusk() {
    const dusk = deps.nextDusk(new Date(simMs));
    if (dusk) simMs = dusk.getTime();
    nextShot();
  }

  function step() {
    if (!active) return;
    const t = now();
    simMs += (t - lastReal) * TIME_SCALE;
    lastReal = t;
    if (deps.sunAltAt(new Date(simMs)) > DUSK_SUN_ALT) skipToDusk();
    store.setTime(new Date(simMs), false);
    const el = t - shot.startReal;
    if (shot.mode === 'pan') {
      // Ease into a slow wide creep along the horizon; re-pick after a while.
      const panTo = { az: shot.from.az + (el / 1000) * PAN_RATE, alt: PAN_ALT, fov: PAN_FOV };
      const f = slewFrame(shot.from, panTo, Math.min(1, el / 4000));
      store.setAim(f.az, f.alt);
      store.setFov(f.fov);
      if (el >= PAN_MS) nextShot();
    } else {
      const aa = shot.target.altAzAt(new Date(simMs)); // chase the LIVE position under time-lapse
      if (shot.mode === 'slew') {
        const f = slewFrame(shot.from, { az: aa.az, alt: aa.alt, fov: shot.fov }, Math.min(1, el / shot.slewMs));
        store.setAim(f.az, f.alt);
        store.setFov(f.fov);
        if (el >= shot.slewMs) {
          shot.mode = 'dwell';
          shot.startReal = t;
          // Wide-field shots hold a fixed alt-az so the stars stream through the frame;
          // point targets keep tracking (base stays live).
          if (shot.target.type === 'constellation') shot.base = { az: aa.az, alt: aa.alt };
        }
      } else { // dwell: hold the target with the chill drift eased in from zero
        const base = shot.base || aa;
        const d = driftOffset(el, shot.fov);
        const ramp = Math.min(1, el / DRIFT_RAMP_MS);
        store.setAim(base.az + d.az * ramp, base.alt + d.alt * ramp);
        if (el >= shot.dwellMs) nextShot();
      }
    }
    raf(step);
  }

  function start() {
    if (active) return;
    active = true;
    const st = store.getState();
    saved = { aim: { ...st.aim }, fov: st.fov, time: { ...st.time } };
    if (st.flags.gyro) store.setFlag('gyro', false); // sensor aim would fight the tour
    simMs = (st.time.instant ? new Date(st.time.instant) : new Date()).getTime();
    lastReal = now();
    deps.setUiHidden(true);
    unbindExit = deps.bindExit(stop);
    acquireWakeLock();
    nextShot();
    raf(step);
  }

  function stop() {
    if (!active) return;
    active = false;
    if (unbindExit) { unbindExit(); unbindExit = null; }
    releaseWakeLock();
    deps.setUiHidden(false);
    store.setAim(saved.aim.az, saved.aim.alt);
    store.setFov(saved.fov);
    store.setTime(saved.time.instant, saved.time.live);
    saved = null;
  }

  // Keep the display awake during the show. Progressive enhancement: absent API or a
  // denied request just means the OS may sleep the screen as usual.
  async function acquireWakeLock() {
    try {
      if (typeof navigator !== 'undefined' && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch { /* ignore */ } wakeLock = null; }
  }

  return { start, stop, isActive: () => active };
}
