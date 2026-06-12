// Object search: type a name (or constellation abbreviation) and jump to it. The index is built
// once from the loaded catalogues; resolving a pick back to live alt/az happens in main.js.

// Flat search index. Entries: { label, type: 'star'|'constellation'|'body'|'dso'|'comet'|'planet-moon'|'satellite',
// ref, aliases?, hint? }. ref is the star id, the constellation name, or the body/moon label —
// whatever main.js needs to resolve. hint overrides the per-type result hint.
export function buildSearchIndex(stars, figures, bodyLabels, dsos = [], comets = [], moons = [], satellites = []) {
  const index = [];
  for (const s of stars) if (s.name) index.push({ label: s.name, type: 'star', ref: s.id });
  for (const f of figures) index.push({ label: f.name, type: 'constellation', ref: f.name, aliases: f.abbr ? [f.abbr] : [] });
  for (const b of bodyLabels) index.push({ label: b, type: 'body', ref: b });
  for (const d of dsos) index.push({ label: d.name, type: 'dso', ref: d.id, aliases: [d.id] });
  for (const c of comets) index.push({ label: c.name, type: 'comet', ref: c.id, aliases: [c.id, ...(c.aliases || [])] });
  for (const m of moons) index.push({ label: m.name, type: 'planet-moon', ref: m.name, hint: `moon of ${m.planet}` });
  // Always indexed, even before (or without) live TLE data — selecting one opens the card, which
  // explains itself when there's no position to fly to.
  for (const s of satellites) index.push({ label: s.label, type: 'satellite', ref: s.id, aliases: s.aliases || [] });
  return index;
}

// Rank index entries against a query: prefix matches beat mid-string matches, earlier matches beat
// later ones, then shorter labels, then alphabetical. Case-insensitive; empty query -> [].
export function searchIndex(index, query, limit = 8) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const e of index) {
    let best = Infinity;
    for (const hay of [e.label, ...(e.aliases || [])]) {
      const i = hay.toLowerCase().indexOf(q);
      if (i < 0) continue;
      const score = (i === 0 ? 0 : 1000) + i; // prefix matches score lowest (best)
      if (score < best) best = score;
    }
    if (best < Infinity) scored.push({ e, best });
  }
  scored.sort((a, b) => a.best - b.best
    || a.e.label.length - b.e.label.length
    || a.e.label.localeCompare(b.e.label));
  return scored.slice(0, limit).map((x) => x.e);
}

const TYPE_HINT = { constellation: 'constellation', body: '', star: 'star', dso: 'deep sky', comet: 'comet', satellite: 'satellite' };

// Build the search control: an input with an as-you-type result list that opens upward over the
// sky. Selecting a result calls onSelect(entry). Returns { el }.
export function buildSearch(index, { onSelect }) {
  const el = document.createElement('div');
  el.className = 'ctrl search';
  el.innerHTML = `
    <input type="search" data-q placeholder="Search sky…" autocomplete="off" />
    <ul class="search-results" data-results></ul>`;
  const input = el.querySelector('[data-q]');
  const list = el.querySelector('[data-results]');
  let results = [];
  let active = -1;

  const render = () => {
    list.innerHTML = '';
    el.classList.toggle('open', results.length > 0);
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'search-item' + (i === active ? ' active' : '');
      const hint = r.hint || TYPE_HINT[r.type];
      li.innerHTML = `<span class="search-name">${r.label}</span>${hint ? `<span class="search-type">${hint}</span>` : ''}`;
      // mousedown (not click) so it fires before the input's blur clears the list.
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(r); });
      list.append(li);
    });
  };

  const choose = (r) => {
    onSelect(r);
    input.value = '';
    results = [];
    active = -1;
    render();
    input.blur();
  };

  input.addEventListener('input', () => {
    results = searchIndex(index, input.value);
    active = results.length ? 0 : -1;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (results[active]) choose(results[active]); }
    else if (e.key === 'Escape') { results = []; active = -1; render(); input.blur(); }
  });
  // Clear the dropdown shortly after losing focus (delay lets a result's mousedown land first).
  input.addEventListener('blur', () => setTimeout(() => { results = []; render(); }, 120));

  return { el };
}
