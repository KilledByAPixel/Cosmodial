// Pure logic for surfacing partial/total lunar eclipses. No vendor or DOM imports — astronomy is
// injected (getFirst/getNextAfter/moonAltAt), so this is fully unit-testable.

const DAY_MS = 86400000;

// Visibility of an eclipse's umbral (partial/total) phase from the observer, by sampling the Moon's
// altitude at the partial contacts and the peak:
//   'full'    Moon above horizon through the whole umbral phase
//   'partial' Moon rises or sets during it
//   'none'    Moon below the horizon throughout (or no umbral phase at all)
export function umbralVisibility(e, moonAltAt, horizonDeg = 0) {
  const { partialBegin, partialEnd, peak } = e.contacts;
  if (!partialBegin || !partialEnd) return 'none'; // penumbral-only: nothing to see
  const up = (d) => moonAltAt(d) > horizonDeg;
  const a = up(partialBegin), b = up(partialEnd), p = up(peak);
  if (a && b) return 'full';
  if (a || b || p) return 'partial';
  return 'none';
}

// Find the in-progress and next visible partial/total lunar eclipse relative to the set time `at`.
//   at:           Date — the currently-set scene time (everything derives from this)
//   getFirst:     (date) => eclipse | null      — first eclipse at/after date
//   getNextAfter: (peakDate) => eclipse | null  — eclipse after the given peak
//   moonAltAt:    (date) => altitude degrees
//   horizonDeg, maxYears — tuning
// Returns { inProgress, next }, each an eclipse annotated with { visibility } or null.
export function findEclipseContext({ at, getFirst, getNextAfter, moonAltAt, horizonDeg = 0, maxYears = 3 }) {
  const horizon = new Date(at.getTime() + maxYears * 365.25 * DAY_MS);
  let inProgress = null;
  let next = null;
  // Start a day before `at` so an eclipse already underway at `at` is caught.
  let e = getFirst(new Date(at.getTime() - DAY_MS));
  while (e && e.peak <= horizon) {
    if (e.kind !== 'penumbral') {
      const visibility = umbralVisibility(e, moonAltAt, horizonDeg);
      if (visibility !== 'none') {
        const annotated = { ...e, visibility };
        const { partialBegin, partialEnd } = e.contacts;
        if (!inProgress && at >= partialBegin && at <= partialEnd) inProgress = annotated;
        if (!next && partialBegin > at) next = annotated;
        if (inProgress && next) break;
      }
    }
    e = getNextAfter(e.peak);
  }
  return { inProgress, next };
}
