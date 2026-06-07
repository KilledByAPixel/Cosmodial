import { wrap360, clamp } from './angles.js';

export const MIN_FOV = 1;    // telescope
export const MAX_FOV = 60;   // naked-eye-ish
export const MAX_ALT = 89;   // clamp pitch just below the zenith to avoid the gimbal-lock singularity
const STORE_KEY = 'skyscope.location';

// Default location (used until the user sets one): Austin, TX.
const DEFAULT_LOCATION = { lat: 30.27, lng: -97.74, label: 'Austin, TX' };

function loadSavedLocation() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function createState() {
  let state = {
    location: loadSavedLocation() || { ...DEFAULT_LOCATION },
    time: { instant: null, live: true }, // instant set by setTime; null means "use Date.now() at read"
    aim: { az: 180, alt: 45 },
    fov: MAX_FOV,
    flags: { lines: true, night: false },
  };
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(state); };

  return {
    // Returns the current state snapshot. Treat it as READ-ONLY — do not mutate the
    // returned object or its nested members; use the setters, which replace state immutably.
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setAim(az, alt) {
      state = { ...state, aim: { az: wrap360(az), alt: clamp(alt, -MAX_ALT, MAX_ALT) } };
      emit();
    },
    setFov(fov) {
      state = { ...state, fov: clamp(fov, MIN_FOV, MAX_FOV) };
      emit();
    },
    setLocation(lat, lng, label) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return; // ignore invalid coordinates
      state = { ...state, location: { lat, lng, label } };
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state.location)); } catch { /* ignore */ }
      }
      emit();
    },
    // Pass live=true (e.g. setTime(null, true)) to return to live "now" mode.
    setTime(instant, live = false) {
      state = { ...state, time: { instant, live } };
      emit();
    },
    setFlag(name, value) {
      if (!(name in state.flags)) throw new Error(`Unknown flag: ${name}`);
      state = { ...state, flags: { ...state.flags, [name]: value } };
      emit();
    },
  };
}
