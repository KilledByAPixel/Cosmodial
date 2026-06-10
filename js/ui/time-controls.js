import { attachPopover } from './popover.js';

const HOUR = 3.6e6;
const DAY = 24 * HOUR;
const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 24h local HH:MM.
export function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
// 24h local HH:MM:SS (for the live ticking readout).
export function formatClockSeconds(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
// Short local date, e.g. "Sun Jun 7" (fixed labels so it's deterministic and locale-independent).
export function formatDate(date) {
  return `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
// Value string for an <input type="datetime-local"> (local, minute precision).
export function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

// Local midnight (00:00:00.000) of the day containing `date`.
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
// Where `instant` sits within its local day, as 0..1 (00:00 -> 0, 24:00 -> 1).
export function dayFraction(instant) {
  const start = startOfDay(instant);
  return scrubFraction(instant, start, new Date(start.getTime() + DAY));
}
// Instant at `fraction` of the day that `refDay` falls on.
export function instantOnDay(fraction, refDay) {
  const start = startOfDay(refDay);
  return scrubInstant(fraction, start, new Date(start.getTime() + DAY));
}

// Build the time control: a compact chip (live clock / paused date+time) that opens a popover with
// Play/Pause, the 24h day scrubber, and a datetime field. Drives store.setTime; ticks the clock.
export function buildTimeControls(store) {
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-time';
  el.innerHTML = `
    <button type="button" class="time-chip" data-chip title="Time controls"></button>
    <div class="popover time-panel" hidden>
      <div class="time-row">
        <button type="button" data-playpause></button>
        <span class="now-badge" data-status></span>
      </div>
      <input type="range" data-scrub min="0" max="1000" value="0" title="Scrub through the day" />
      <input type="datetime-local" data-datetime title="Jump to a date/time" />
    </div>`;

  const chip = el.querySelector('[data-chip]');
  const panel = el.querySelector('.time-panel');
  const status = el.querySelector('[data-status]');
  const scrub = el.querySelector('[data-scrub]');
  const playpause = el.querySelector('[data-playpause]');
  const datetime = el.querySelector('[data-datetime]');

  // The instant currently shown (real now when live, else the paused instant).
  const shownInstant = () => {
    const t = store.getState().time;
    return t.live ? new Date() : new Date(t.instant);
  };

  // Play/Pause: pause freezes at the current instant; play returns to live "now".
  playpause.addEventListener('click', () => {
    if (store.getState().time.live) store.setTime(new Date(), false);
    else store.setTime(null, true);
  });

  // Scrubber: jump to a time within the currently-shown day (grabbing it pauses live mode).
  scrub.addEventListener('input', () => {
    store.setTime(instantOnDay(Number(scrub.value) / 1000, shownInstant()), false);
  });

  // Explicit date/time entry.
  datetime.addEventListener('change', (e) => {
    const d = new Date(e.target.value);
    if (!Number.isNaN(d.getTime())) store.setTime(d, false);
  });

  const update = () => {
    const live = store.getState().time.live;
    const d = shownInstant();
    // The chip alone always shows whether you're live (green ●) or time-travelling (⏸ + date).
    chip.textContent = live ? `● ${formatClock(d)}` : `⏸ ${formatDate(d)} · ${formatClock(d)}`;
    chip.classList.toggle('live', live);
    playpause.textContent = live ? '⏸ Pause' : '▶ Live';
    playpause.setAttribute('aria-pressed', String(!live));
    status.textContent = live
      ? `● ${formatDate(d)} · ${formatClockSeconds(d)}`
      : `⏸ ${formatDate(d)} · ${formatClock(d)}`;
    status.classList.toggle('live', live);
    scrub.value = String(Math.round(dayFraction(d) * 1000));
    // Keep the date field reflecting the active instant, but don't fight the user while editing it.
    if (typeof document === 'undefined' || document.activeElement !== datetime) {
      datetime.value = toLocalInputValue(d);
    }
  };
  store.subscribe(update);
  setInterval(update, 1000); // ticks the live clock readout (display only; sky recompute is in main.js)
  update();
  attachPopover(chip, panel); // stays open while scrubbing; outside-tap / Escape closes
  return el;
}
