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

// Build the location control element (geolocation + manual lat/long). Wires to store.setLocation.
export function buildLocationControl(store) {
  const el = document.createElement('div');
  el.className = 'ctrl ctrl-location';
  el.innerHTML = `
    <button type="button" data-geo title="Use my location">📍</button>
    <input type="text" data-latlng placeholder="lat, lng" size="14" />
    <button type="button" data-set>Set</button>
    <span class="ctrl-label" data-label></span>`;

  const label = el.querySelector('[data-label]');
  const input = el.querySelector('[data-latlng]');
  const showLabel = () => {
    const l = store.getState().location;
    label.textContent = l.label || `${l.lat.toFixed(2)}, ${l.lng.toFixed(2)}`;
  };

  el.querySelector('[data-geo]').addEventListener('click', () => {
    if (!navigator.geolocation) { label.textContent = 'geolocation unavailable'; return; }
    label.textContent = 'locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => store.setLocation(pos.coords.latitude, pos.coords.longitude, 'My location'),
      () => { label.textContent = 'location denied'; },
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
