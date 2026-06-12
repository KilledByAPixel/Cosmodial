// Debug time-lapse: 't' starts advancing the clock from whatever time is currently shown,
// '+'/'-' double/halve the rate while it runs, 't' again stops. Stopping leaves time PAUSED
// where the lapse landed (the time chip's "▶ Live" returns to now). Regular mode only —
// main.js ignores the key during the screensaver, whose show drives its own clock.
// Any OTHER writer touching the clock mid-lapse (the day scrubber, the datetime field,
// "▶ Live", a guide jump) wins: the loop notices the foreign instant and bows out.

export const DEFAULT_RATE = 60;       // simulated seconds per real second (a minute per second)
export const RATE_RANGE = [1, 86400]; // x1 (real time) up to a day per second

// Rate after one faster (+1) / slower (-1) press: doubles or halves, clamped. PURE — unit-tested.
export function stepRate(rate, dir) {
  const next = dir > 0 ? rate * 2 : rate / 2;
  return Math.min(RATE_RANGE[1], Math.max(RATE_RANGE[0], next));
}

// The controller. deps.onActive(on) fires on every start/stop transition — INCLUDING the
// self-stop when another writer takes the clock — so the host can hide/restore chrome and
// never strand it hidden. raf/now are injectable for tests (same pattern as createScreensaver).
export function createTimeLapse(store, deps = {}) {
  const { raf = requestAnimationFrame, now = () => performance.now() } = deps;
  let active = false;
  let rate = DEFAULT_RATE; // kept across toggles: stop/restart resumes at the tuned speed
  let simMs = 0;           // simulated clock (ms epoch)
  let lastReal = 0;
  let lastSet = 0;         // ms we last wrote, to detect another writer taking the clock
  let run = 0;             // generation token: a stale queued frame from a prior run must bail

  function setActive(on) {
    if (active === on) return;
    active = on;
    if (deps.onActive) deps.onActive(on);
  }

  function step(token) {
    if (!active || token !== run) return;
    const t = store.getState().time;
    const current = !t.live && t.instant ? new Date(t.instant).getTime() : null;
    if (current !== lastSet) { setActive(false); return; } // someone else set the time — they win
    const tr = now();
    simMs += (tr - lastReal) * rate;
    lastReal = tr;
    const d = new Date(simMs);
    lastSet = d.getTime(); // Date truncates fractional ms; compare what was actually stored
    store.setTime(d, false);
    raf(() => step(token));
  }

  function start() {
    if (active) return;
    setActive(true);
    const t = store.getState().time;
    simMs = (t.live || !t.instant ? new Date() : new Date(t.instant)).getTime();
    lastReal = now();
    const d = new Date(simMs);
    lastSet = d.getTime();
    store.setTime(d, false); // claim the clock immediately so step()'s writer check holds
    const token = ++run;
    raf(() => step(token));
  }

  function stop() { setActive(false); } // time stays paused where the lapse landed

  return {
    toggle: () => (active ? stop() : start()),
    stop,
    faster: () => { if (active) rate = stepRate(rate, +1); },
    slower: () => { if (active) rate = stepRate(rate, -1); },
    isActive: () => active,
    rate: () => rate,
  };
}
