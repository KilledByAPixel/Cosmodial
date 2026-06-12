import { altazToWhere } from '../guide/ranking.js';
import { azToCompass } from '../render/hud.js';

// Collapsed-chip label: the active event's leading emoji is appended ("★ Highlights · ☄️") so an
// event stays discoverable while the panel is closed. PURE — unit-tested. Keeps a U+FE0F variation
// selector attached so emoji-style glyphs don't degrade to text-style.
export function chipLabel(event) {
  const base = '🌟 Highlights';
  if (!event || !event.text) return base;
  const cps = [...event.text.trim()];
  if (!cps.length) return base;
  const emoji = cps[1] === '\uFE0F' ? cps[0] + cps[1] : cps[0];
  return `${base} · ${emoji}`;
}

// Live-position phrase for a row. PURE — unit-tested.
export function rowWhere(altaz) {
  return altaz.alt < 0 ? 'below the horizon' : altazToWhere(altaz, azToCompass);
}

// "🌇 Sunset 8:24 PM" / "🌅 Sunrise 5:42 AM" — the next-sun-event readout. PURE — unit-tested.
export function sunRowText(ev) {
  const t = ev.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return ev.kind === 'sunset' ? `🌇 Sunset ${t}` : `🌅 Sunrise ${t}`;
}

// Build the collapsible Favorites panel. onGoTo(rec) fires when a row is clicked; onRemove(rec)
// when a row's × is clicked. Returns { el, setRows(rows), setEvents(events), setSunEvent(ev) } where
// each row is { rec, name, altaz }.
export function buildFavoritesPanel({ onGoTo, onRemove }) {
  const el = document.createElement('div');
  el.className = 'fav-panel collapsed';
  el.innerHTML = `
    <button type="button" class="fav-toggle" data-toggle>★ Highlights</button>
    <div class="fav-body">
      <div class="fav-sun" data-sun hidden></div>
      <div class="fav-event" data-event hidden></div>
      <ul class="fav-list" data-list></ul>
      <p class="fav-empty" data-empty hidden>Star objects from their card to add them here.</p>
    </div>`;

  const toggle = el.querySelector('[data-toggle]');
  const listEl = el.querySelector('[data-list]');
  const emptyEl = el.querySelector('[data-empty]');
  const eventEl = el.querySelector('[data-event]');
  const sunEl = el.querySelector('[data-sun]');

  toggle.addEventListener('click', () => el.classList.toggle('collapsed'));

  function setRows(rows) {
    listEl.innerHTML = '';
    emptyEl.hidden = rows.length > 0;
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'fav-row' + (r.altaz.alt < 0 ? ' below' : '');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'fav-go';
      // textContent (not an innerHTML template): names round-trip through localStorage, so don't
      // trust them as markup.
      const name = document.createElement('span');
      name.className = 'fav-name';
      name.textContent = r.name;
      const where = document.createElement('span');
      where.className = 'fav-where';
      where.textContent = rowWhere(r.altaz);
      go.append(name, document.createElement('br'), where);
      go.addEventListener('click', () => onGoTo(r.rec));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fav-remove';
      remove.setAttribute('aria-label', `Remove ${r.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => onRemove(r.rec));
      li.append(go, remove);
      listEl.append(li);
    }
  }

  // events = array of { text, actionLabel, onAction }, best-first (may be empty). Rendered as
  // highlighted rows above the favorites list; the collapsed chip appends the TOP event's emoji
  // so the night's headline stays discoverable while the panel is closed.
  function setEvents(events) {
    toggle.textContent = chipLabel(events[0] || null);
    eventEl.innerHTML = '';
    eventEl.hidden = !events.length;
    for (const event of events) {
      const row = document.createElement('div');
      row.className = 'event-row';
      const span = document.createElement('span');
      span.className = 'event-text';
      span.textContent = event.text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-action';
      btn.textContent = event.actionLabel;
      btn.addEventListener('click', event.onAction);
      row.append(span, btn);
      eventEl.append(row);
    }
  }

  // ev = { kind: 'sunset'|'sunrise', date } | null (hidden when null, e.g. polar day/night).
  function setSunEvent(ev) {
    sunEl.hidden = !ev;
    sunEl.textContent = ev ? sunRowText(ev) : '';
  }

  return { el, setRows, setEvents, setSunEvent };
}
