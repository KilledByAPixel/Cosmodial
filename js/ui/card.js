import { NAMES } from '../core/constellation-names.js';
import { bodyDistanceAu, moonPhaseInfo } from '../core/astro.js';
import { azToCompass } from '../render/hud.js';

const PC_TO_LY = 3.26156;

// B-V color index -> a plain-language color.
export function colorWord(bv) {
  if (bv == null || !Number.isFinite(bv)) return 'white';
  if (bv < 0.0) return 'blue-white';
  if (bv < 0.3) return 'white';
  if (bv < 0.6) return 'yellow-white';
  if (bv < 1.0) return 'yellow';
  if (bv < 1.5) return 'orange';
  return 'red';
}

// Naked-eye / binoculars / telescope from apparent magnitude.
export function easeTag(mag) {
  if (!Number.isFinite(mag)) return 'telescope';
  if (mag <= 5.5) return 'naked eye';
  if (mag <= 9) return 'binoculars';
  return 'telescope';
}

// Parsecs -> light-years (null-safe).
export function distanceLy(distPc) {
  if (distPc == null || !Number.isFinite(distPc) || distPc <= 0) return null;
  return distPc * PC_TO_LY;
}

// "the light you're seeing left it around <year>" (AD) or "... around <n> BC".
export function lightLeftPhrase(distLy, currentYear) {
  if (distLy == null || !Number.isFinite(distLy)) return null;
  const y = Math.round(currentYear - distLy);
  if (y > 0) return `the light you're seeing left it around ${y}`;
  return `the light you're seeing left it around ${Math.abs(y) + 1} BC`; // no year 0
}

// IAU abbreviation -> full constellation name (falls through to the input if unknown).
export function constellationName(abbr) {
  return NAMES[abbr] || abbr || '';
}

// Plain-language visibility phrase for an eclipse.
export function visWord(visibility) {
  return visibility === 'partial' ? 'partly visible from here' : 'visible from here';
}

// Ordered [label, Date] contact pairs that actually occur for this eclipse (peak always present).
export function eclipseContacts(e) {
  const c = e.contacts;
  const out = [];
  if (c.partialBegin) out.push(['partial begins', c.partialBegin]);
  if (c.totalBegin) out.push(['totality begins', c.totalBegin]);
  out.push(['peak', c.peak]);
  if (c.totalEnd) out.push(['totality ends', c.totalEnd]);
  if (c.partialEnd) out.push(['partial ends', c.partialEnd]);
  return out;
}

const AU_TO_KM = 1.495978707e8;
const MIN_PER_AU = 8.317; // light travel time per AU

let onCloseCb = null;

function row(html) { const p = document.createElement('p'); p.className = 'card-line'; p.innerHTML = html; return p; }

// Where the object is right now.
function whereLine(altaz) {
  return row(`<b>Where now:</b> ${azToCompass(altaz.az)} (az ${Math.round(altaz.az)}°), ${Math.round(altaz.alt)}° above the horizon`);
}

// Type-specific body lines (array of <p>).
function bodyLines(obj, ctx) {
  const lines = [];
  if (obj.kind === 'star') {
    const cn = constellationName(obj.con);
    lines.push(row(`A ${colorWord(obj.bv)} star${cn ? ` in ${cn}` : ''}.`));
    const ly = distanceLy(obj.dist);
    if (ly != null) {
      lines.push(row(`<b>Distance:</b> ${ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString()} light-years`));
      const phrase = lightLeftPhrase(ly, ctx.currentYear);
      if (phrase) lines.push(row(`✨ ${phrase}.`));
    }
    lines.push(row(`<b>How to see it:</b> ${easeTag(obj.mag)} (magnitude ${obj.mag})`));
  } else if (obj.kind === 'moon') {
    const m = moonPhaseInfo(ctx.time);
    const km = Math.round(bodyDistanceAu(obj.body, ctx.observer, ctx.time) * AU_TO_KM);
    lines.push(row(`The Moon — <b>${m.phaseName}</b>, ${m.illumPct}% lit.`));
    lines.push(row(`<b>Distance:</b> ${km.toLocaleString()} km away`));
    lines.push(row(`<b>How to see it:</b> naked eye`));
    if (ctx.eclipse) {
      const e = ctx.eclipse;
      if (e.live) {
        const kindWord = e.kind === 'total' ? 'Total' : 'Partial';
        const note = e.visibility === 'partial' ? ' (partly visible from here)' : '';
        const fmt = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        lines.push(row(`🌘 <b>${kindWord} lunar eclipse${note}.</b>`));
        lines.push(row(`<b>Times:</b> ${eclipseContacts(e).map(([label, d]) => `${label} ${fmt(d)}`).join(' · ')}`));
        if (e.totalityMinutes) lines.push(row(`<b>Totality:</b> ${Math.round(e.totalityMinutes)} min`));
        lines.push(row(`✨ Sunlight bent through Earth's atmosphere paints it coppery-red — dimmer than the photos, but unmistakable to the eye.`));
      } else {
        const when = e.peak.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        lines.push(row(`<b>Next lunar eclipse:</b> ${when} (${e.kind}), ${visWord(e.visibility)}.`));
      }
    }
  } else if (obj.kind === 'sun') {
    lines.push(row(`The Sun.`));
    lines.push(row(`⚠️ <b>Never look at the Sun</b> through binoculars or a telescope without a proper solar filter.`));
  } else { // planet
    const au = bodyDistanceAu(obj.body, ctx.observer, ctx.time);
    lines.push(row(`${obj.label} — a planet.`));
    lines.push(row(`<b>Distance:</b> ${au.toFixed(2)} AU (light takes ${Math.round(au * MIN_PER_AU)} min to reach us)`));
    const magStr = Number.isFinite(obj.mag) ? ` (magnitude ${obj.mag.toFixed(1)})` : '';
    lines.push(row(`<b>How to see it:</b> ${easeTag(obj.mag)}${magStr}`));
  }
  return lines;
}

function titleOf(obj) {
  if (obj.kind === 'star') return obj.name || 'Unnamed star';
  if (obj.kind === 'moon') return 'Moon';
  if (obj.kind === 'sun') return 'Sun';
  return obj.label;
}

// Render the card into #card-host (replacing any open card).
export function openCard(obj, ctx) {
  const host = document.getElementById('card-host');
  if (!host) return;
  host.innerHTML = '';
  onCloseCb = (ctx && ctx.onClose) || null;
  const card = document.createElement('div');
  card.className = 'card';
  const close = document.createElement('button');
  close.className = 'card-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closeCard);
  const h = document.createElement('h2');
  h.className = 'card-title';
  h.textContent = titleOf(obj);
  card.append(close, h, ...bodyLines(obj, ctx), whereLine(obj.altaz));
  host.append(card);
}

export function closeCard() {
  const host = document.getElementById('card-host');
  if (host) host.innerHTML = '';
  const cb = onCloseCb; onCloseCb = null;
  if (cb) cb();
}
