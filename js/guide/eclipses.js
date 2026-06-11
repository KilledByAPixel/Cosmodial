// Pure logic for surfacing eclipses (lunar and solar). No vendor or DOM imports — astronomy is
// injected (getFirst/getNextAfter/visibilityOf), so this is fully unit-testable.

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

// Visibility of a solar eclipse from the observer: the vendor's local search already carries the
// Sun's altitude at each contact (eclipse.altDeg), so no sampling callback is needed.
//   'full'    Sun above horizon through the whole eclipse
//   'partial' Sun rises or sets during it
//   'none'    Sun below the horizon throughout
export function solarVisibility(e, horizonDeg = 0) {
  const up = (k) => e.altDeg[k] > horizonDeg;
  const a = up('partialBegin'), b = up('partialEnd');
  if (a && b) return 'full';
  if (a || b || up('peak')) return 'partial';
  return 'none';
}

// Find the in-progress and next visible eclipse relative to the set time `at`. Works for lunar
// and solar alike — both normalized shapes carry Date `peak` and `contacts.partialBegin/End`.
//   at:           Date — the currently-set scene time (everything derives from this)
//   getFirst:     (date) => eclipse | null      — first eclipse at/after date
//   getNextAfter: (peakDate) => eclipse | null  — eclipse after the given peak
//   visibilityOf: (eclipse) => 'full'|'partial'|'none' — 'none' also filters kinds not worth
//                 surfacing (the lunar caller maps penumbral eclipses to 'none')
//   maxYears — search horizon
// Returns { inProgress, next }, each an eclipse annotated with { visibility } or null.
export function findEclipseContext({ at, getFirst, getNextAfter, visibilityOf, maxYears = 3 }) {
  const horizon = new Date(at.getTime() + maxYears * 365.25 * DAY_MS);
  let inProgress = null;
  let next = null;
  // Start a day before `at` so an eclipse already underway at `at` is caught.
  let e = getFirst(new Date(at.getTime() - DAY_MS));
  while (e && e.peak <= horizon) {
    const visibility = visibilityOf(e);
    if (visibility !== 'none') {
      const annotated = { ...e, visibility };
      const { partialBegin, partialEnd } = e.contacts;
      if (!inProgress && at >= partialBegin && at <= partialEnd) inProgress = annotated;
      if (!next && partialBegin > at) next = annotated;
      // `next` is the first visible eclipse starting after `at`. Any in-progress eclipse must
      // begin at/before `at`, so it was found on an earlier iteration — once we have `next`,
      // there's nothing left to find. Breaking here keeps the per-frame search to ~1-2 vendor
      // eclipse lookups instead of scanning all the way to the maxYears horizon every recompute.
      if (next) break;
    }
    e = getNextAfter(e.peak);
  }
  return { inProgress, next };
}
