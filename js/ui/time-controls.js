import { makeObserver, nightWindow } from '../core/astro.js';

const HOUR = 3.6e6;
const pad = (n) => String(n).padStart(2, '0');

// 24h local HH:MM.
export function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
// 24h local HH:MM:SS (for the live ticking readout).
export function formatClockSeconds(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Position 0..1 of `instant` within [start,end] (clamped).
export function scrubFraction(instant, start, end) {
  const a = start.getTime(), b = end.getTime();
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (instant.getTime() - a) / (b - a)));
}
// Instant (Date) at fraction 0..1 within [start,end] (fraction clamped).
export function scrubInstant(fraction, start, end) {
  const a = start.getTime(), b = end.getTime();
  const f = Math.min(1, Math.max(0, fraction));
  return new Date(a + f * (b - a));
}

// Named jump targets. now=null (live); tonight=sunset+2h; midnight=next local 00:00 after ref.
export function presetInstants({ sunset, sunrise, ref }) {
  const tonight = sunset ? new Date(sunset.getTime() + 2 * HOUR) : null;
  const midnight = new Date(ref);
  midnight.setHours(24, 0, 0, 0); // roll to next local midnight
  return { now: null, sunset, sunrise, tonight, midnight };
}

// Build the time control element. Drives store.setTime; reflects live/scrubbed status; ticks the clock.
export function buildTimeControls(store) {
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-time';
  el.innerHTML = `
    <span class="now-badge" data-status></span>
    <button type="button" data-now>NOW</button>
    <button type="button" data-preset="sunset">Sunset</button>
    <button type="button" data-preset="tonight">Tonight</button>
    <button type="button" data-preset="midnight">Midnight</button>
    <button type="button" data-preset="sunrise">Sunrise</button>
    <input type="range" data-scrub min="0" max="1000" value="0" title="Scrub through tonight" />
    <input type="datetime-local" data-datetime title="Jump to a date/time" />`;

  const status = el.querySelector('[data-status]');
  const scrub = el.querySelector('[data-scrub]');

  // current night window for the active location (recomputed on demand)
  let win = { sunset: null, sunrise: null };
  const refreshWindow = () => {
    const loc = store.getState().location;
    win = nightWindow(makeObserver(loc.lat, loc.lng), new Date());
  };

  // presets
  el.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      refreshWindow();
      const when = presetInstants({ sunset: win.sunset, sunrise: win.sunrise, ref: new Date() })[btn.dataset.preset];
      if (when) store.setTime(when, false);
    });
  });
  el.querySelector('[data-now]').addEventListener('click', () => store.setTime(null, true));

  // scrubber (scoped to tonight: sunset -> sunrise)
  scrub.addEventListener('input', () => {
    if (!win.sunset || !win.sunrise) refreshWindow();
    if (!win.sunset || !win.sunrise) return;
    store.setTime(scrubInstant(Number(scrub.value) / 1000, win.sunset, win.sunrise), false);
  });

  // explicit date/time
  el.querySelector('[data-datetime]').addEventListener('change', (e) => {
    const d = new Date(e.target.value);
    if (!Number.isNaN(d.getTime())) store.setTime(d, false);
  });

  // status line + keep the slider in sync; recompute window when location changes
  let lastLoc = '';
  const update = () => {
    const st = store.getState();
    const locKey = `${st.location.lat},${st.location.lng}`;
    if (locKey !== lastLoc) { lastLoc = locKey; refreshWindow(); }
    if (st.time.live) {
      status.textContent = `NOW ${formatClockSeconds(new Date())}`;
      status.classList.add('live');
    } else {
      const d = new Date(st.time.instant);
      status.textContent = `⏸ ${formatClock(d)} ${d.toLocaleDateString()}`;
      status.classList.remove('live');
      if (win.sunset && win.sunrise) scrub.value = String(Math.round(scrubFraction(d, win.sunset, win.sunrise) * 1000));
    }
  };
  store.subscribe(update);
  setInterval(update, 1000); // ticks the live clock readout (display only; sky recompute is in main.js)
  refreshWindow();
  update();
  return el;
}
