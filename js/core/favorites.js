const STORE_KEY = 'cosmodial.favorites';
const SEED = [{ kind: 'body', label: 'Moon' }]; // first-run starter so the list isn't empty

// Sun/Moon/planets all persist under one 'body' kind (matched by label, like lock-on follow);
// planetary moons keep their own label-keyed kind; stars, DSOs, and comets persist by catalog id.
function recKind(kind) { return (kind === 'moon' || kind === 'sun' || kind === 'planet') ? 'body' : kind; }
function labelKeyed(kind) { return kind === 'body' || kind === 'planet-moon'; }

// Stable identity key for a live pick OR a stored record — both shapes map to the same key.
export function keyOf(obj) {
  const k = recKind(obj.kind);
  return labelKeyed(k) ? `${k}:${obj.label}` : `${k}:${obj.id}`;
}

// The persisted form of a card/pick object. Stars/DSOs keep their display name so the list can
// render without resolving the catalog.
export function recordOf(obj) {
  const k = recKind(obj.kind);
  if (labelKeyed(k)) return { kind: k, label: obj.label };
  return { kind: k, id: obj.id, name: obj.name || null };
}

// List-row label for a stored record (null-name stars were saved from an "Unnamed star" card).
export function displayName(rec) {
  if (labelKeyed(rec.kind)) return rec.label;
  return rec.name || (rec.kind === 'star' ? 'Unnamed star' : String(rec.id));
}

function isValidRecord(r) {
  if (!r || typeof r !== 'object') return false;
  if (labelKeyed(r.kind)) return typeof r.label === 'string' && r.label.length > 0;
  if (r.kind === 'star' || r.kind === 'dso' || r.kind === 'comet' || r.kind === 'constellation' || r.kind === 'iss') return r.id != null;
  return false;
}

// The favorites store. storage is injectable for tests; defaults to localStorage when available.
// Seeding rule: an ABSENT (or corrupt) key seeds the Moon; a present-but-empty list stays empty,
// so unstarring everything is respected and never re-seeded.
export function createFavorites(storage = (typeof localStorage === 'undefined' ? null : localStorage)) {
  const listeners = new Set();
  let records = load();

  function load() {
    let raw = null;
    try { raw = storage ? storage.getItem(STORE_KEY) : null; } catch { raw = null; }
    if (raw != null) {
      try {
        const v = JSON.parse(raw);
        if (Array.isArray(v)) return v.filter(isValidRecord);
      } catch { /* corrupt: fall through to the seed */ }
    }
    return SEED.map((r) => ({ ...r }));
  }

  const save = () => {
    if (!storage) return;
    try { storage.setItem(STORE_KEY, JSON.stringify(records)); } catch { /* ignore (quota/private mode) */ }
  };

  return {
    list: () => records.map((r) => ({ ...r })),
    has: (obj) => records.some((r) => keyOf(r) === keyOf(obj)),
    // Add or remove; returns the NEW state (true = now favorited).
    toggle(obj) {
      const k = keyOf(obj);
      const had = records.some((r) => keyOf(r) === k);
      records = had ? records.filter((r) => keyOf(r) !== k) : [...records, recordOf(obj)];
      save();
      for (const fn of listeners) fn();
      return !had;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
