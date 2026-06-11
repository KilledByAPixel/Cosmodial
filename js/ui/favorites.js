import { altazToWhere } from '../guide/ranking.js';
import { azToCompass } from '../render/hud.js';

// Collapsed-chip label: the active event's leading emoji is appended ("★ Favorites · ☄️") so an
// event stays discoverable while the panel is closed. PURE — unit-tested. Keeps a U+FE0F variation
// selector attached so emoji-style glyphs don't degrade to text-style.
export function chipLabel(event) {
  if (!event || !event.text) return '★ Favorites';
  const cps = [...event.text.trim()];
  if (!cps.length) return '★ Favorites';
  const emoji = cps[1] === '️' ? cps[0] + cps[1] : cps[0];
  return `★ Favorites · ${emoji}`;
}

// Live-position phrase for a row. PURE — unit-tested.
export function rowWhere(altaz) {
  return altaz.alt < 0 ? 'below the horizon' : altazToWhere(altaz, azToCompass);
}

// Build the collapsible Favorites panel. onGoTo(rec) fires when a row is clicked; onRemove(rec)
// when a row's × is clicked. Returns { el, setRows(rows), setEvent(event) } where each row is
// { rec, name, altaz }.
export function buildFavoritesPanel({ onGoTo, onRemove }) {
  const el = document.createElement('div');
  el.className = 'fav-panel collapsed';
  el.innerHTML = `
    <button type="button" class="fav-toggle" data-toggle>★ Favorites</button>
    <div class="fav-body">
      <div class="fav-event" data-event hidden></div>
      <ul class="fav-list" data-list></ul>
      <p class="fav-empty" data-empty hidden>Star objects from their card to add them here.</p>
    </div>`;

  const toggle = el.querySelector('[data-toggle]');
  const listEl = el.querySelector('[data-list]');
  const emptyEl = el.querySelector('[data-empty]');
  const eventEl = el.querySelector('[data-event]');

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
      go.innerHTML = `<span class="fav-name">${r.name}</span><br><span class="fav-where">${rowWhere(r.altaz)}</span>`;
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

  // event = { text, actionLabel, onAction } | null. Rendered as a highlighted first row inside the
  // panel; the collapsed chip appends the event's emoji so it stays discoverable.
  function setEvent(event) {
    toggle.textContent = chipLabel(event);
    eventEl.innerHTML = '';
    if (!event) { eventEl.hidden = true; return; }
    eventEl.hidden = false;
    const span = document.createElement('span');
    span.className = 'event-text';
    span.textContent = event.text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'event-action';
    btn.textContent = event.actionLabel;
    btn.addEventListener('click', event.onAction);
    eventEl.append(span, btn);
  }

  return { el, setRows, setEvent };
}