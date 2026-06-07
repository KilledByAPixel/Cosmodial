import { altazToWhere, easeFor, headline } from '../guide/ranking.js';
import { azToCompass } from '../render/hud.js';

const TOP = 5;

// Build the collapsible "Up now" panel. onFind(pick) fires when a pick's Find button is clicked.
// Returns { el, setPicks(picks, { isDay }) }.
export function buildGuide(store, { onFind }) {
  const el = document.createElement('div');
  el.className = 'guide collapsed';
  el.innerHTML = `
    <button type="button" class="guide-toggle" data-toggle>✦ Up now</button>
    <div class="guide-body">
      <p class="guide-headline" data-headline></p>
      <ul class="guide-picks" data-picks></ul>
      <button type="button" class="guide-seeall" data-seeall hidden>See all</button>
    </div>`;

  const headlineEl = el.querySelector('[data-headline]');
  const picksEl = el.querySelector('[data-picks]');
  const seeAll = el.querySelector('[data-seeall]');
  let picks = [];
  let expanded = false;

  el.querySelector('[data-toggle]').addEventListener('click', () => el.classList.toggle('collapsed'));
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

  return { el, setPicks };
}
