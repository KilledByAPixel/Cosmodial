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
let editIndex = 0;          // index into figures[] of the currently active constellation
let prevEdit = false;       // tracks previous edit-mode state to detect enter/exit transitions
const FIGURES_KEY = 'skyscope.figures.v2';
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
    edit: st.flags.edit,
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

function onEditTap(x, y) {
  const active = figures[editIndex];
  if (!active) return;
  const view = { width: canvas.clientWidth, height: canvas.clientHeight };
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, ...view };
  const projector = createProjector(cam);
  // Clickable: stars tagged to this constellation, PLUS any star already used by this figure
  // (e.g. Alpheratz, catalogued under Andromeda but a corner of the Great Square of Pegasus).
  const inFigure = new Set(active.lines.flat().map(([ra, dec]) => `${ra},${dec}`));
  const projected = skyObjects
    .filter((s) => s.con === active.abbr || inFigure.has(`${s.ra},${s.dec}`))
    .map((s) => { const p = projector(s.altaz.az, s.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: s }; });
  const star = pickNearest(projected, x, y, 14);
  if (!star) { selected = null; requestRender(); return; }
  if (!selected) { selected = star; requestRender(); return; }
  if (selected.id === star.id) { selected = null; requestRender(); return; }
  active.lines = toggleEdge(active.lines, [selected.ra, selected.dec], [star.ra, star.dec]);
  computeSky();
  saveFigures();
  selected = null;
  requestRender();
}

function centerOnActive() {
  const c = constellations[editIndex];
  if (c && c.label) store.setAim(c.label.az, c.label.alt); // setAim triggers a render
}

function onEditToggle() {
  const e = store.getState().flags.edit;
  if (e === prevEdit) return;      // no edit-mode transition (also stops re-entrancy below)
  prevEdit = e;                    // set BEFORE centerOnActive() so its setAim->emit re-entry bails here
  selected = null;                 // clear selection on entering AND exiting edit mode
  if (e) {                         // entered edit mode
    if (editIndex >= figures.length) editIndex = 0;
    centerOnActive();
    if (figures[editIndex]) console.log(`[skyscope] editing: ${figures[editIndex].name}`);
  }
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
  } else if (action === 'next' || action === 'prev') {
    if (!figures.length) return;
    editIndex = (editIndex + (action === 'next' ? 1 : -1) + figures.length) % figures.length;
    selected = null;
    centerOnActive();
    console.log(`[skyscope] editing: ${figures[editIndex].name}`);
    requestRender();
  }
}

function drawEditOverlay(ctx, cam) {
  ctx.fillStyle = 'rgba(120, 220, 160, 0.9)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const active = figures[editIndex];
  ctx.fillText(`EDIT: ${active ? active.name : '(none)'} - click two of its stars to toggle a line - N/P prev/next - D download - R reset - E exit`, 12, 22);
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
  store.subscribe(onEditToggle);
  window.addEventListener('resize', requestRender);
  attachInput(canvas, store, { onTap: onEditTap, onAction: onEditAction });
  requestRender();
}

boot();
