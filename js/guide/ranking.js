// Curation weight by kind: Moon/planets float above a coincidentally-up star.
const CURATION = { moon: 100, planet: 80, star: 30 };

// Ease tag. The Moon is always naked-eye; planets and stars go by magnitude (so the faint outer
// planets read as binoculars/telescope, not naked-eye). A planet with no magnitude defaults to
// naked-eye, since the classic five are.
export function easeFor(kind, mag) {
  if (kind === 'moon') return 'naked eye';
  if (kind === 'planet' && !Number.isFinite(mag)) return 'naked eye';
  if (!Number.isFinite(mag)) return 'telescope';
  if (mag <= 4) return 'naked eye';
  if (mag <= 9) return 'binoculars';
  return 'telescope';
}

// Higher = better pick. Below the horizon -> -Infinity (excluded by rankCandidates).
export function scoreCandidate(c) {
  const alt = c.altaz.alt;
  if (alt < 0) return -Infinity;
  let s = CURATION[c.kind] || 0;
  s += Math.max(0, Math.min(60, 30 - (c.mag ?? 0) * 6)); // brighter (lower mag) ranks higher
  s += alt * 0.5;                                          // higher in the sky is better
  if (alt < 15) s -= 25;                                   // "technically up but low / hard"
  return s;
}

// Drop below-horizon candidates; attach .score + .ease; sort best-first.
export function rankCandidates(list) {
  return list
    .filter((c) => c.altaz.alt >= 0)
    .map((c) => ({ ...c, score: scoreCandidate(c), ease: easeFor(c.kind, c.mag) }))
    .sort((a, b) => b.score - a.score);
}

// "low in the NE" / "high in the south" / "almost directly overhead". compassFn = azToCompass.
export function altazToWhere(altaz, compassFn) {
  if (altaz.alt >= 80) return 'almost directly overhead';
  const band = altaz.alt < 20 ? 'low' : altaz.alt < 55 ? 'partway up' : 'high';
  return `${band} in the ${compassFn(altaz.az)}`;
}

// Friendly one-liner above the picks.
export function headline(picks, { isDay }) {
  if (isDay) return "The Sun's up — here's what'll be worth a look after dark.";
  if (!picks.length) return 'Nothing notable above the horizon right now.';
  return `Up now: ${picks[0].name} leads — ${picks.length} pick${picks.length > 1 ? 's' : ''} worth a look.`;
}
