import { searchIndex } from './search.js';
import { attachPopover } from './popover.js';
import { CITIES } from '../core/cities.js';

// Parse "lat, lng" (comma or whitespace separated) into {lat,lng}, or null if malformed/out of range.
export function parseLatLng(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// City-picker filter: blank query -> the full (alphabetical) list; otherwise the same ranking the
// sky search uses (prefix beats mid-string, case-insensitive). PURE — unit-tested.
export function filterCities(cities, query) {
  const q = (query || '').trim();
  return q ? searchIndex(cities, q, cities.length) : cities;
}

// Build the location control element (geolocation + manual lat/long + city picker). The city label
// doubles as the picker button. Wires to store.setLocation.
export function buildLocationControl(store) {
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-location';
  el.innerHTML = `
    <button type="button" data-geo title="Use my location">📍</button>
    <input type="text" data-latlng placeholder="lat, lng" size="14" />
    <button type="button" data-set>Set</button>
    <button type="button" class="ctrl-label ctrl-citybtn" data-citybtn title="Choose a city"></button>
    <div class="popover city-picker" data-citypanel hidden>
      <input type="search" data-cityq placeholder="Find a city…" autocomplete="off" />
      <ul class="city-list" data-citylist></ul>
    </div>`;

  const cityBtn = el.querySelector('[data-citybtn]');
  const panel = el.querySelector('[data-citypanel]');
  const cityq = el.querySelector('[data-cityq]');
  const cityList = el.querySelector('[data-citylist]');
  const input = el.querySelector('[data-latlng]');
  const showLabel = () => {
    const l = store.getState().location;
    cityBtn.textContent = l.label || `${l.lat.toFixed(2)}, ${l.lng.toFixed(2)}`;
  };

  // City picker: popover (outside-tap/Escape handled by attachPopover) with a filter box.
  const pop = attachPopover(cityBtn, panel);
  function pick(c) {
    store.setLocation(c.lat, c.lng, c.label);
    pop.close();
  }
  function renderCities() {
    cityList.innerHTML = '';
    for (const c of filterCities(CITIES, cityq.value)) {
      const li = document.createElement('li');
      li.className = 'search-item';
      const span = document.createElement('span');
      span.className = 'search-name';
      span.textContent = c.label;
      li.append(span);
      // mousedown (not click): fires before the filter input's blur, like the sky search rows.
      li.addEventListener('mousedown', () => pick(c));
      cityList.append(li);
    }
  }
  // attachPopover's own click handler ran first: if it just opened, present a fresh list.
  cityBtn.addEventListener('click', () => {
    if (pop.isOpen()) { cityq.value = ''; renderCities(); cityq.focus(); }
  });
  cityq.addEventListener('input', renderCities);
  cityq.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const rows = filterCities(CITIES, cityq.value);
    if (rows.length) pick(rows[0]);
  });

  el.querySelector('[data-geo]').addEventListener('click', () => {
    if (!navigator.geolocation) { cityBtn.textContent = 'geolocation unavailable'; return; }
    cityBtn.textContent = 'locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => store.setLocation(pos.coords.latitude, pos.coords.longitude, 'My location'),
      () => { cityBtn.textContent = 'location denied'; },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  });

  const apply = () => {
    const p = parseLatLng(input.value);
    if (p) { store.setLocation(p.lat, p.lng, `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`); input.value = ''; }
    else { input.classList.add('bad'); setTimeout(() => input.classList.remove('bad'), 700); }
  };
  el.querySelector('[data-set]').addEventListener('click', apply);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });

  store.subscribe(showLabel);
  showLabel();
  return el;
}
