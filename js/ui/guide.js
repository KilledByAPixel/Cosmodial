import { altazToWhere, easeFor, headline } from '../guide/ranking.js';
import { azToCompass } from '../render/hud.js';

const TOP = 3; // default pick count when opened; "See all" expands to the full ranked list

// Collapsed-chip label: the active event's leading emoji is appended ("✦ Up now · ☄️") so an event
// stays discoverable while the panel is closed. PURE — unit-tested. Keeps a U+FE0F variation
// selector attached so emoji-style glyphs don't degrade to text-style.
export function chipLabel(event) {
  if (!event || !event.text) return '✦ Up now';
  const cps = [...event.text.trim()];
  if (!cps.length) return '✦ Up now';
  const emoji = cps[1] === '️' ? cps[0] + cps[1] : cps[0];
  return `✦ Up now · ${emoji}`;
}

// Build the collapsible "Up now" panel. onFind(pick) fires when a pick's Find button is clicked.
// Returns { el, setPicks(picks, { isDay }), setEvent(event) }.
export function buildGuide(store, { onFind }) {
  const el = document.createElement('div');
  el.className = 'guide collapsed';
  el.innerHTML = `
    <button type="button" class="guide-toggle" data-toggle>✦ Up now</button>
    <div class="guide-body">
      <div class="guide-event" data-event hidden></div>
      <p class="guide-headline" data-headline></p>
      <ul class="guide-picks" data-picks></ul>
      <button type="button" class="guide-seeall" data-seeall hidden>See all</button>
    </div>`;

  const toggle = el.querySelector('[data-toggle]');
  const headlineEl = el.querySelector('[data-headline]');
  const picksEl = el.querySelector('[data-picks]');
  const seeAll = el.querySelector('[data-seeall]');
  const eventEl = el.querySelector('[data-event]');
  let picks = [];
  let expanded = false;

  toggle.addEventListener('click', () => el.classList.toggle('collapsed'));
  seeAll.addEventListener('click', () => { expanded = !expanded; seeAll.textContent = expanded ? 'See fewer' : 'See all'; renderPicks(); });

  function renderPicks() {
    const show = expanded ? picks : picks.slice(0, TOP);
    picksEl.innerHTML = '';
    for (const p of show) {
      const li = document.createElement('li');
      li.className = 'guide-pick';
      const where = altazToWhere(p.altaz, azToCompass);
      const main = document.createElement('div');
      main.className = 'pick-text';
      main.innerHTML = `<span class="pick-name">${p.name}</span> <span class="pick-ease">${p.ease || easeFor(p.kind, p.mag)}</span><br><span class="pick-where">${where}${p.why ? ' — ' + p.why : ''}</span>`;
      const find = document.createElement('button');
      find.type = 'button';
      find.className = 'pick-find';
      find.textContent = 'Find';
      find.addEventListener('click', () => onFind(p));
      li.append(main, find);
      picksEl.append(li);
    }
    seeAll.hidden = picks.length <= TOP;
  }

  function setPicks(next, ctx = {}) {
    picks = next || [];
    headlineEl.textContent = headline(picks, { isDay: !!ctx.isDay });
    renderPicks();
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

  return { el, setPicks, setEvent };
}
