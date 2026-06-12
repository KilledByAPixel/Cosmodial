// One catalogue fetch: HTTP-error checked, JSON-parsed, and time-limited. The time limit is
// the load-bearing part — a phone radio can stall a connection without erroring, and awaiting
// a fetch with no timeout then hangs boot forever on the splash screen. With the abort signal,
// a stall becomes a visible, retryable error instead. fetchImpl/signalFactory are injected for
// tests (cf. loadSatTles in satellites.js).
export async function loadCatalogue(url, {
  fetchImpl = fetch,
  timeoutMs = 30000,
  signalFactory = (ms) => AbortSignal.timeout(ms),
} = {}) {
  let res;
  try {
    res = await fetchImpl(url, { signal: signalFactory(timeoutMs) });
  } catch (err) {
    if (err && err.name === 'TimeoutError') {
      throw new Error(`${url}: no response after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
