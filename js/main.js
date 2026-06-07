import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body, bodyMagnitude, bodyAngularRadiusDeg } from './core/astro.js';
import { PLANETS, planetRadius } from './render/planets.js';
import { drawScene, resizeCanvas } from './render/sky.js';
import { drawHud } from './render/hud.js';
import { createRenderScheduler } from './core/scheduler.js';
import { attachInput } from './ui/input.js';
import { splitSegments, toggleEdge, pickNearest, circularCentroid, exportFigures } from './edit/figures.js';
import { createProjector } from './core/projection.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon/planet markers { altaz, label, color, radius }
let figures = [];        // editable source: [{name, abbr, lines:[[[ra,dec],[ra,dec]],...]}] (2-point segments)
let constellations = []; // derived render data: [{name, label:{alt,az}, lines:[[{alt,az},...]]}]
let originalFigures = [];   // pristine split from the file, for reset
let selected = null;        // first star picked in edit mode (a skyObjects entry)
const FIGURES_KEY = 'skyscope.figures';
const labelOf = (f) => circularCentroid(f.lines.flat()); // [ra,dec] label position for a figure

function loadSavedFigures() {
  if (typeof localStorage === 'undefined') return null;
  try { const raw = localStorage.getItem(FIGURES_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

// Recompute alt/az for every object. Depends only on time + location (no UI for those yet, so
// this runs once at boot; Plan 4's time controls will call it again when the clock changes — and
// must call requestRender() afterward, since time isn't in the store and nothing re-renders on its own).
function computeSky() {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  skyObjects = stars.map((s) => ({
    altaz: altAzOfStar(s.ra, s.dec, observer, time),
    mag: s.mag, bv: s.bv, name: s.name,
    id: s.id, ra: s.ra, dec: s.dec, con: s.con,
  }));
  const planetMarkers = PLANETS.map((p) => ({
    altaz: altAzOfBody(p.body, observer, time),
    label: p.name,
    color: p.color,
    radius: planetRadius(bodyMagnitude(p.body, time)),
  }));
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8', angularRadiusDeg: bodyAngularRadiusDeg(Body.Moon, observer, time) },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f', angularRadiusDeg: bodyAngularRadiusDeg(Body.Sun, observer, time) },
    ...planetMarkers,
  ];
  constellations = figures.map((f) => {
    const [lra, ldec] = labelOf(f);
    return {
      name: f.name,
      label: altAzOfStar(lra, ldec, observer, time),
      lines: f.lines.map((seg) => seg.map(([ra, dec]) => altAzOfStar(ra, dec, observer, time))),
    };
  });
}

function render() {
  const view = resizeCanvas(canvas);
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, width: view.width, height: view.height };
  drawScene(ctx, {
    stars: skyObjects,
    markers,
    constellations: st.flags.lines ? constellations : [],
    cam,
  });
  drawHud(ctx, cam);
  if (st.flags.edit) drawEditOverlay(ctx, cam);
}

const requestRender = createRenderScheduler(render, (cb) => requestAnimationFrame(cb));

function saveFigures() {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(FIGURES_KEY, JSON.stringify(figures)); } catch { /* ignore */ }
  }
}

// A tap in edit mode: pick the nearest star; on the second pick of the SAME constellation, toggle
// the edge between the two stars in that figure.
function onEditTap(x, y) {
  const view = { width: canvas.clientWidth, height: canvas.clientHeight };
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, ...view };
  const projector = createProjector(cam);
  const projected = skyObjects
    .filter((s) => s.altaz.alt >= 0)
    .map((s) => { const p = projector(s.altaz.az, s.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: s }; });
  const star = pickNearest(projected, x, y, 14);
  if (!star) { selected = null; requestRender(); return; }       // tapped empty -> clear
  if (!selected) { selected = star; requestRender(); return; }   // first pick
  if (selected.id === star.id) { selected = null; requestRender(); return; } // same star -> deselect
  if (selected.con !== star.con) { selected = star; requestRender(); return; } // different constellation -> restart
  const fig = figures.find((f) => f.abbr === star.con);
  if (fig) {
    fig.lines = toggleEdge(fig.lines, [selected.ra, selected.dec], [star.ra, star.dec]);
    computeSky();   // re-derive render constellations from the edited figures
    saveFigures();
  }
  selected = null;
  requestRender();
}

function onEditAction(action) {
  if (action === 'download') {
    const json = JSON.stringify(exportFigures(figures));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'constellations.json';
    a.click();
    URL.revokeObjectURL(a.href);
  } else if (action === 'reset') {
    figures = originalFigures.map((f) => ({ name: f.name, abbr: f.abbr, lines: f.lines.map((s) => s.map((p) => [...p])) }));
    if (typeof localStorage !== 'undefined') { try { localStorage.removeItem(FIGURES_KEY); } catch { /* ignore */ } }
    selected = null;
    computeSky();
    requestRender();
  }
}

function drawEditOverlay(ctx, cam) {
  ctx.fillStyle = 'rgba(120, 220, 160, 0.9)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('EDIT MODE - click two stars of a constellation to toggle a line - D download - R reset - E exit', 12, 22);
  if (selected) {
    const p = createProjector(cam)(selected.altaz.az, selected.altaz.alt);
    if (p.visible) {
      ctx.strokeStyle = 'rgba(120, 220, 160, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

async function boot() {
  try {
    const res = await fetch('./data/stars.json');
    if (!res.ok) throw new Error(`stars.json: HTTP ${res.status}`);
    stars = await res.json();
  } catch (err) {
    console.error('[skyscope] Failed to load star catalogue:', err);
  }
  let loaded = [];
  try {
    const cres = await fetch('./data/constellations.json');
    if (!cres.ok) throw new Error(`constellations.json: HTTP ${cres.status}`);
    loaded = await cres.json();
  } catch (err) {
    console.error('[skyscope] Failed to load constellations:', err);
  }
  const saved = loadSavedFigures();
  figures = saved || splitSegments(loaded);
  originalFigures = splitSegments(loaded);
  computeSky();                 // must run before subscribe/first render so the sky isn't blank
  store.subscribe(requestRender);
  window.addEventListener('resize', requestRender);
  attachInput(canvas, store, { onTap: onEditTap, onAction: onEditAction });
  requestRender();
}

boot();
