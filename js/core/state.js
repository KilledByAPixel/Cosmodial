import { wrap360, clamp } from './angles.js';

export const MIN_FOV = 1;    // telescope
export const MAX_FOV = 120;   // widest zoom-out (wide-angle); gnomonic edges start to stretch past ~120°
export const DEFAULT_FOV = 60; // startup FOV (comfortable naked-eye view); zoom-out can widen to MAX_FOV
export const MAX_ALT = 89;   // clamp pitch just below the zenith to avoid the gimbal-lock singularity
const STORE_KEY = 'volvella.location';
const STORE_KEY_VIEW = 'volvella.view'; // last aim + fov, so a reload resumes where you were looking

// Default location (used until the user sets one): Austin, TX.
const DEFAULT_LOCATION = { lat: 30.27, lng: -97.74, label: 'Austin, TX' };
const DEFAULT_AIM = { az: 180, alt: 45 };

function loadSavedLocation() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Restore the last view (aim direction + fov), validated, or null if absent/corrupt.
function loadSavedView() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORE_KEY_VIEW);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !v.aim || !Number.isFinite(v.aim.az) || !Number.isFinite(v.aim.alt) || !Number.isFinite(v.fov)) return null;
    return {
      aim: { az: wrap360(v.aim.az), alt: clamp(v.aim.alt, -MAX_ALT, MAX_ALT) },
      fov: clamp(v.fov, MIN_FOV, MAX_FOV),
    };
  } catch { return null; }
}

export function createState() {
  const savedView = loadSavedView();
  let state = {
    location: loadSavedLocation() || { ...DEFAULT_LOCATION },
    time: { instant: null, live: true }, // instant set by setTime; null means "use Date.now() at read"
    aim: savedView ? savedView.aim : { ...DEFAULT_AIM },
    fov: savedView ? savedView.fov : DEFAULT_FOV,
    flags: { lines: false, labels: true, grid: false, sphere: false, deepsky: false, night: false, edit: false },
  };

  // Persisting on every aim/fov change would write to localStorage on every drag frame; throttle so we
  // write at most a few times a second. The trailing timer reads `state` at fire time, so it always
  // captures the final resting view.
  let viewSaveTimer = null;
  const saveView = () => {
    if (typeof localStorage === 'undefined' || viewSaveTimer) return;
    viewSaveTimer = setTimeout(() => {
      viewSaveTimer = null;
      try { localStorage.setItem(STORE_KEY_VIEW, JSON.stringify({ aim: state.aim, fov: state.fov })); } catch { /* ignore */ }
    }, 250);
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
      saveView();
      emit();
    },
    setFov(fov) {
      state = { ...state, fov: clamp(fov, MIN_FOV, MAX_FOV) };
      saveView();
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
