// "low in the NE" / "high in the south" / "almost directly overhead". compassFn = azToCompass.
export function altazToWhere(altaz, compassFn) {
  if (altaz.alt >= 80) return 'almost directly overhead';
  const band = altaz.alt < 20 ? 'low' : altaz.alt < 55 ? 'partway up' : 'high';
  return `${band} in the ${compassFn(altaz.az)}`;
}
