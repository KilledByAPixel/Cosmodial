// Shareable object links: the card's 🔗 button copies a URL whose ?obj param carries the same
// kind:id identity the favorites store uses (keyOf), and boot replays it through the search-select
// path — opening the link lands on the object as if you had searched for it.
import { keyOf } from '../core/favorites.js';

// Kinds a link may carry — exactly what onSearchSelect can resolve. (keyOf folds moon/sun/planet
// into 'body'; stars key by numeric catalog id, the rest by string id/label/name.)
const LINK_KINDS = new Set(['body', 'star', 'dso', 'comet', 'planet-moon', 'constellation', 'iss']);

// The shareable URL for a card object. `base` defaults to the live page sans any current params.
export function shareUrlFor(obj, base = `${window.location.origin}${window.location.pathname}`) {
  return `${base}?obj=${encodeURIComponent(keyOf(obj))}`;
}

// Parse a ?obj param back into a search-select entry { type, ref }, or null if it's not one of
// ours (junk in shared URLs must never throw during boot).
export function parseShareParam(value) {
  if (!value || typeof value !== 'string') return null;
  const i = value.indexOf(':');
  if (i <= 0 || i === value.length - 1) return null;
  const type = value.slice(0, i);
  let ref = value.slice(i + 1);
  if (!LINK_KINDS.has(type)) return null;
  if (type === 'star') {
    ref = Number(ref);
    if (!Number.isFinite(ref)) return null;
  }
  return { type, ref };
}
