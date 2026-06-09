import { wrap360, clamp } from './angles.js';

export const MIN_FOV = 0.02;  // deepest zoom (~1.2 arcmin) — lets the true-scale (1:1) planets resolve large
export const MAX_FOV = 120;   // widest zoom-out (wide-angle); gnomonic edges start to stretch past ~120°
export const DEFAULT_FOV = 60; // startup FOV (comfortable naked-eye view); zoom-out can widen to MAX_FOV
export const MAX_ALT = 89;   // clamp pitch just below the zenith to avoid the gimbal-lock singularity
const STORE_KEY = 'volvella.location';
const STORE_KEY_VIEW = 'volvella.view'; // last aim + fov, so a reload resumes where you were looking
const STORE_KEY_FLAGS = 'volvella.flags'; // remembered view toggles (see PERSISTED_FLAGS)

// View toggles that persist across reloads. Deliberately excludes `lines` (constellations always
// start hidden) and `edit` (a transient mode, never restored).
const PERSISTED_FLAGS = ['labels', 'grid', 'deepsky', 'sphere', 'night'];

// Default location (used until the user sets one): Austin, TX.
const DEFAULT_LOCATION = { lat: 30.27, lng: -97.74, label: 'Austin, TX' };
const DEFAULT_AIM = { az: 180, alt: 45 };

// Lowest altitude the camera may aim at. Normally the horizon (0°), so you can't tilt down into the
// empty black below it; full-sphere mode unlocks the lower hemisphere down to near the nadir.
const minAltFor = (flags) => (flags.sphere || flags.gyro ? -MAX_ALT : 0);

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

// Restore the remembered view toggles (only the PERSISTED_FLAGS keys, only booleans), or {} if none.
function loadSavedFlags() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY_FLAGS) || 'null');
    if (!v || typeof v !== 'object') return {};
    const out = {};
    for (const k of PERSISTED_FLAGS) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  } catch { return {}; }
}

export function createState() {
  const savedView = loadSavedView();
  const flags = { lines: false, labels: true, grid: false, sphere: false, deepsky: false, night: false, edit: false, gyro: false, ...loadSavedFlags() };
  const aim = savedView ? savedView.aim : { ...DEFAULT_AIM };
  let state = {
    location: loadSavedLocation() || { ...DEFAULT_LOCATION },
    time: { instant: null, live: true }, // instant set by setTime; null means "use Date.now() at read"
    aim: { az: aim.az, alt: clamp(aim.alt, minAltFor(flags), MAX_ALT) }, // honor the horizon lock on restore
    fov: savedView ? savedView.fov : DEFAULT_FOV,
    roll: 0, // camera roll about the viewing axis; nonzero only while gyro/AR aim is active
    flags,
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
  const saveFlags = () => {
    if (typeof localStorage === 'undefined') return;
    const subset = {};
    for (const k of PERSISTED_FLAGS) subset[k] = state.flags[k];
    try { localStorage.setItem(STORE_KEY_FLAGS, JSON.stringify(subset)); } catch { /* ignore */ }
  };
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(state); };

  return {
    // Returns the current state snapshot. Treat it as READ-ONLY — do not mutate the
    // returned object or its nested members; use the setters, which replace state immutably.
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setAim(az, alt) {
      state = { ...state, aim: { az: wrap360(az), alt: clamp(alt, minAltFor(state.flags), MAX_ALT) } };
      saveView();
      emit();
    },
    setFov(fov) {
      state = { ...state, fov: clamp(fov, MIN_FOV, MAX_FOV) };
      saveView();
      emit();
    },
    // Gyro/AR aim: set azimuth, altitude, and roll in one update. Honors the gyro horizon unlock
    // (minAltFor) and does NOT persist — the live orientation isn't a resting view to restore.
    setOrientation(az, alt, roll) {
      if (!state.flags.gyro) return; // AR aim only; ignore stray calls when gyro mode is off
      if (!Number.isFinite(az) || !Number.isFinite(alt)) return; // ignore a non-finite sensor reading
      state = {
        ...state,
        aim: { az: wrap360(az), alt: clamp(alt, minAltFor(state.flags), MAX_ALT) },
        roll: Number.isFinite(roll) ? roll : 0,
      };
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
      const flags = { ...state.flags, [name]: value };
      // Turning full-sphere (or gyro) off while aimed below the horizon snaps the pitch back up to 0°.
      const alt = clamp(state.aim.alt, minAltFor(flags), MAX_ALT);
      const aimChanged = alt !== state.aim.alt;
      // Exiting gyro/AR levels the view (roll back to 0); other flag changes leave roll untouched.
      const roll = (name === 'gyro' && value === false) ? 0 : state.roll;
      state = { ...state, flags, aim: aimChanged ? { ...state.aim, alt } : state.aim, roll };
      if (PERSISTED_FLAGS.includes(name)) saveFlags();
      if (aimChanged) saveView();
      emit();
    },
  };
}
