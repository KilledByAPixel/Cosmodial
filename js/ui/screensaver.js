// Screensaver mode: hide the chrome and wander the sky on autopilot — long eased slews
// between interesting targets, calm dwells with a slight drift, and a gentle time-lapse
// that skips daytime. A tap/mouse button or Space/Enter/Escape exits (the wake gating
// lives in main.js's bindExit) and restores the exact prior view and time.
// The choreography helpers are pure (exported for tests); createScreensaver owns the loop.

import { clamp } from '../core/angles.js';
import { slewFrame } from './slew.js';
import { altazSepDeg } from '../core/moon.js';

// Tuning. Durations are real milliseconds; SIM marks simulated (time-lapse) time.
export const TIME_SCALE = 90;      // simulated seconds per real second (~a night in 6 minutes)
export const DUSK_SUN_ALT = -6;    // Sun altitude (deg) marking "dark enough" (end of civil twilight)
export const MIN_TARGET_ALT = 10;  // deg: candidates below this aren't worth visiting
export const RECENT_WINDOW = 5;    // never revisit any of the last N targets
const SLEW_MS = [4000, 12000];     // min/max slew duration; the actual scales with distance
const SLEW_PACE_MS_PER_DEG = 100;  // ~10 deg/s of camera travel — far swings take longer, not faster
const NEAR_DEG = 70;               // prefer the next target within this distance of the current aim
const DWELL_MS = [10000, 20000];   // randomized dwell duration range
const DRIFT_RAMP_MS = 3000;        // ease the dwell drift in from zero
const ESTABLISH_FOV = 90;          // entry eases out to this wide view before the first target
const ESTABLISH_MS = 2500;         // entry zoom-out duration
const VISTA_CHANCE = 0.2;          // odds a target shot is followed by a wide pull-back vista
const TIGHT_FOV = 15;              // leaving a shot tighter than this ALWAYS pulls back first
const VISTA_FOV = 120;             // vista width — well past any target framing
const VISTA_EASE_MS = 4000;        // vista pull-back duration
const VISTA_HOLD_MS = [8000, 14000]; // how long a vista holds before the next target
const CONS_FADE_MS = 2500;         // constellation-figure fade-out tail at the end of its dwell
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
// priority candidate (the Moon mid-eclipse) preempts the rotation (however far away);
// otherwise candidates near the current aim (opts.from) are preferred — the tour roams
// the neighborhood instead of whipping across the whole sky — and the pick is roughly
// uniform across the type pools so the largest catalogue doesn't dominate the show.
// Null when nothing qualifies (the controller falls back to a horizon pan).
export function pickTarget(candidates, recentNames, opts) {
  const { rng = Math.random, at, visitSimMs = MAX_VISIT_SIM_MS, from = null } = opts;
  const later = new Date(at.getTime() + visitSimMs);
  const eligible = candidates.filter((c) =>
    !recentNames.includes(c.name) &&
    c.altAzAt(at).alt >= MIN_TARGET_ALT &&
    c.altAzAt(later).alt >= MIN_TARGET_ALT);
  if (!eligible.length) return null;
  const prio = eligible.filter((c) => c.priority);
  let pickFrom = prio.length ? prio : eligible;
  if (from && !prio.length) {
    const near = pickFrom.filter((c) => altazSepDeg(c.altAzAt(at), from) <= NEAR_DEG);
    if (near.length) pickFrom = near;
  }
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
//   getCandidates(at): candidates at the simulated instant [{ type, name, altAzAt(date), priority?, angularRadiusDeg?, sizeArcmin? }]
//   sunAltAt(date): Sun altitude (deg) at a simulated instant
//   nextDusk(date): Date the Sun next sinks below DUSK_SUN_ALT, or null (polar summer)
//     CONTRACT: sunAltAt and nextDusk must share ONE altitude definition (both geometric
//     or both refracted). If the check and the search disagree by even a fraction of a
//     degree, the dusk skip re-fires every frame and the show jumps a day per frame.
//   setUiHidden(on): hide/show the chrome (and clear any card/lock-on when hiding)
//   onShot(name): optional — each new shot's target name (null for the fallback pan);
//     drives the on-screen caption
//   onConsFocus(name, alpha): optional — while a constellation is the target, its name
//     and a 0..1 figure-line opacity (fades in with the approach, out at the dwell's
//     end); (null, 0) whenever no constellation is focused
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
  let shot = null;        // current shot: { mode: 'slew'|'dwell'|'wide'|'pan', target?, from, startReal, ... }
  const recent = [];      // last RECENT_WINDOW target names
  let run = 0;            // generation token: a stale queued frame from a prior run must bail
  let noDusk = false;     // polar summer: nextDusk found nothing — run the show in daylight

  const randIn = ([lo, hi]) => lo + rng() * (hi - lo);

  // Begin the next shot from wherever the camera is: occasionally a wide pull-back
  // vista, else a fresh target if one qualifies, else a slow wide pan until one rises.
  function nextShot() {
    const st = store.getState();
    const from = { az: st.aim.az, alt: st.aim.alt, fov: st.fov };
    const at = new Date(simMs);
    if (deps.onConsFocus) deps.onConsFocus(null, 0); // a new shot clears any figure fade
    // After a target shot, sometimes step back and take in the region — nonstop
    // close-ups make the tour feel busier than it is. Never two vistas in a row.
    // A TIGHT close-up (deep zoom on a planet/DSO) always steps back: slewing to the next
    // target while zoomed deep whips the sky past at nausea speed, so zoom out, breathe at
    // the wide view, and only then move on. (The || order keeps rng() consumption identical
    // for wider shots.)
    if (shot && shot.target && (from.fov < TIGHT_FOV || rng() < VISTA_CHANCE)) {
      if (deps.onShot) deps.onShot(null); // no caption: the vista frames the sky, not a thing
      shot = { mode: 'wide', from, startReal: now(), easeMs: VISTA_EASE_MS, holdMs: randIn(VISTA_HOLD_MS), fov: VISTA_FOV };
      return;
    }
    const target = pickTarget(deps.getCandidates(at), recent, { rng, at, from });
    if (deps.onShot) deps.onShot(target ? target.name : null);
    if (!target) {
      shot = { mode: 'pan', from, startReal: now() };
      return;
    }
    recent.push(target.name);
    if (recent.length > RECENT_WINDOW) recent.shift();
    // Slew duration scales with how far the camera must travel (slightly jittered), so
    // a long swing glides instead of whipping and a short hop doesn't dawdle.
    const dist = altazSepDeg(target.altAzAt(at), from);
    shot = {
      mode: 'slew', target, from, startReal: now(),
      slewMs: clamp(dist * SLEW_PACE_MS_PER_DEG * (0.85 + rng() * 0.3), SLEW_MS[0], SLEW_MS[1]),
      dwellMs: randIn(DWELL_MS),
      fov: framingFov(target, rng), base: null,
    };
  }

  // Skip the daylight: jump the simulated clock to just past the next dusk and re-pick
  // there. Landing 60s beyond the crossing keeps the strict > check from re-firing on
  // the search's ~1s tolerance. No dusk within reach (polar summer): run the show in
  // daylight rather than re-searching every frame.
  function skipToDusk() {
    const dusk = deps.nextDusk(new Date(simMs));
    if (!dusk) { noDusk = true; return; }
    simMs = dusk.getTime() + 60000;
    // Mid-establish (the entry zoom-out), keep widening — the first pick happens when
    // it completes, now at the post-jump instant.
    if (shot && shot.mode === 'wide' && shot.holdMs === 0) return;
    nextShot();
  }

  function step(token) {
    if (!active || token !== run) return;
    const t = now();
    simMs += (t - lastReal) * TIME_SCALE;
    lastReal = t;
    if (!noDusk && deps.sunAltAt(new Date(simMs)) > DUSK_SUN_ALT) skipToDusk();
    store.setTime(new Date(simMs), false);
    const el = t - shot.startReal;
    if (shot.mode === 'pan') {
      // Ease into a slow wide creep along the horizon; re-pick after a while.
      const panTo = { az: shot.from.az + (el / 1000) * PAN_RATE, alt: PAN_ALT, fov: PAN_FOV };
      const f = slewFrame(shot.from, panTo, Math.min(1, el / 4000));
      store.setAim(f.az, f.alt);
      store.setFov(f.fov);
      if (el >= PAN_MS) nextShot();
    } else if (shot.mode === 'wide') {
      // Entry establish / occasional vista: ease straight back at a held aim, linger,
      // then move on — the time-lapse keeps the frame alive while pulled out.
      const f = slewFrame(shot.from, { az: shot.from.az, alt: shot.from.alt, fov: shot.fov }, Math.min(1, el / shot.easeMs));
      store.setAim(f.az, f.alt);
      store.setFov(f.fov);
      if (el >= shot.easeMs + shot.holdMs) nextShot();
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
      // A focused constellation introduces itself: its figure fades in with the
      // approach, holds through the dwell, and dissolves over the dwell's last moments
      // so the shot ends on the bare stars. Elapsed time is re-read because nextShot
      // above may just have replaced `shot` with a fresh one.
      if (deps.onConsFocus && shot.target && shot.target.type === 'constellation') {
        const fe = t - shot.startReal;
        const alpha = shot.mode === 'slew'
          ? Math.min(1, fe / shot.slewMs)
          : clamp((shot.dwellMs - fe) / CONS_FADE_MS, 0, 1);
        deps.onConsFocus(shot.target.name, alpha);
      }
    }
    raf(() => step(token));
  }

  function start() {
    if (active) return;
    active = true;
    const st = store.getState();
    saved = { aim: { ...st.aim }, fov: st.fov, time: { ...st.time }, gyro: st.flags.gyro };
    if (st.flags.gyro) store.setFlag('gyro', false); // sensor aim would fight the tour
    simMs = (st.time.instant ? new Date(st.time.instant) : new Date()).getTime();
    lastReal = now();
    deps.setUiHidden(true);
    unbindExit = deps.bindExit(stop);
    acquireWakeLock();
    // Open wide: entering deep in a telescope zoom would otherwise begin with a frantic
    // swing. Ease out to an establishing view first; the first target slew settles back in.
    if (st.fov < ESTABLISH_FOV - 1) {
      if (deps.onShot) deps.onShot(null);
      shot = { mode: 'wide', from: { az: st.aim.az, alt: st.aim.alt, fov: st.fov }, startReal: lastReal, easeMs: ESTABLISH_MS, holdMs: 0, fov: ESTABLISH_FOV };
    } else {
      nextShot();
    }
    noDusk = false;
    const token = ++run;
    raf(() => step(token));
  }

  function stop() {
    if (!active) return;
    active = false;
    if (unbindExit) { unbindExit(); unbindExit = null; }
    releaseWakeLock();
    if (deps.onConsFocus) deps.onConsFocus(null, 0);
    deps.setUiHidden(false);
    store.setAim(saved.aim.az, saved.aim.alt);
    store.setFov(saved.fov);
    store.setTime(saved.time.instant, saved.time.live);
    if (saved.gyro) store.setFlag('gyro', true); // hand aim back to the sensors
    saved = null;
  }

  // Keep the display awake during the show. Progressive enhancement: absent API or a
  // denied request just means the OS may sleep the screen as usual.
  async function acquireWakeLock() {
    try {
      if (typeof navigator !== 'undefined' && navigator.wakeLock) {
        const lock = await navigator.wakeLock.request('screen');
        if (active) wakeLock = lock;
        else lock.release(); // exited before the request resolved — don't leak a held lock
      }
    } catch { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch { /* ignore */ } wakeLock = null; }
  }

  return { start, stop, isActive: () => active };
}
