import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body, bodyMagnitude, bodyAngularRadiusDeg } from './core/astro.js';
import { makeStarAltAz } from './core/astro.js';
import { buildLocationControl } from './ui/location.js';
import { buildTimeControls } from './ui/time-controls.js';
import { PLANETS, planetRadius } from './render/planets.js';
import { drawScene, resizeCanvas } from './render/sky.js';
import { drawHud } from './render/hud.js';
import { createRenderScheduler } from './core/scheduler.js';
import { attachInput } from './ui/input.js';
import { splitSegments, toggleEdge, pickNearest, circularCentroid, exportFigures } from './edit/figures.js';
import { createProjector } from './core/projection.js';
import { openCard, closeCard, colorWord } from './ui/card.js';
import { rankCandidates } from './guide/ranking.js';
import { buildGuide } from './ui/guide.js';
import { animateSlew } from './ui/slew.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon/planet markers { altaz, label, color, radius }
let figures = [];        // editable source: [{name, abbr, lines:[[[ra,dec],[ra,dec]],...]}] (2-point segments)
let constellations = []; // derived render data: [{name, label:{alt,az}, lines:[[{alt,az},...]]}]
let originalFigures = [];   // pristine split from the file, for reset
let loadedRaw = [];   // the raw constellations.json array as loaded (basis for localStorage validity)
let guide = null;
let skyDirty = true; // next render recomputes the sky first (coalesces scrub/tick/edit recomputes)
let selected = null;        // first star picked in edit mode (a skyObjects entry)
let highlighted = null;     // object whose card is currently open (gets a ring on canvas)
let editIndex = 0;          // index into figures[] of the currently active constellation
let prevEdit = false;       // tracks previous edit-mode state to detect enter/exit transitions
const FIGURES_KEY = 'skyscope.figures.v2';
const labelOf = (f) => circularCentroid(f.lines.flat()); // [ra,dec] label position for a figure

// Use saved in-browser edits only if they were based on the SAME committed file. If
// data/constellations.json has since changed (e.g. you edited/committed it directly), the file
// wins and the stale local edits are discarded.
function loadSavedFigures(currentFile) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FIGURES_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved && JSON.stringify(saved.base) === JSON.stringify(currentFile)) return saved.figures;
    return null;
  } catch { return null; }
}

// Recompute alt/az for every object from the current time + location. Called only from render()
// when skyDirty is set (via requestRecompute), so location/time/scrub/edit changes and the live
// tick all coalesce into one recompute per frame. The EQJ->EQD precession is computed once here
// (makeStarAltAz) rather than per star.
function computeSky() {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const toAltAz = makeStarAltAz(observer, time);
  skyObjects = stars.map((s) => ({
    altaz: toAltAz(s.ra, s.dec),
    mag: s.mag, bv: s.bv, name: s.name,
    id: s.id, ra: s.ra, dec: s.dec, con: s.con, dist: s.dist,
  }));
  const planetMarkers = PLANETS.map((p) => {
    const mag = bodyMagnitude(p.body, time);
    return { altaz: altAzOfBody(p.body, observer, time), label: p.name, color: p.color, radius: planetRadius(mag), body: p.body, mag };
  });
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8', angularRadiusDeg: bodyAngularRadiusDeg(Body.Moon, observer, time), body: Body.Moon, mag: bodyMagnitude(Body.Moon, time) },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f', angularRadiusDeg: bodyAngularRadiusDeg(Body.Sun, observer, time), body: Body.Sun },
    ...planetMarkers,
  ];
  constellations = figures.map((f) => {
    const [lra, ldec] = labelOf(f);
    return {
      name: f.name,
      label: toAltAz(lra, ldec),
      lines: f.lines.map((seg) => seg.map(([ra, dec]) => toAltAz(ra, dec))),
    };
  });
  if (guide) {
    const sun = markers.find((m) => m.label === 'Sun');
    const isDay = !!sun && sun.altaz.alt > -0.833;
    guide.setPicks(buildPicks(), { isDay });
  }
}

function render() {
  if (skyDirty) { computeSky(); skyDirty = false; }
  const view = resizeCanvas(canvas);
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, width: view.width, height: view.height };
  // In edit mode, show ONLY the active constellation's lines (focus); otherwise honor the lines flag.
  const visibleCons = st.flags.edit
    ? (constellations[editIndex] ? [constellations[editIndex]] : [])
    : (st.flags.lines ? constellations : []);
  drawScene(ctx, {
    stars: skyObjects,
    markers: st.flags.edit ? [] : markers,   // hide Sun/Moon/planets in edit mode so they don't overlap stars
    constellations: visibleCons,
    cam,
    edit: st.flags.edit,
  });
  drawHud(ctx, cam);
  if (st.flags.edit) drawEditOverlay(ctx, cam);
  drawHighlight(ctx, cam);
}

const requestRender = createRenderScheduler(render, (cb) => requestAnimationFrame(cb));

function requestRecompute() { skyDirty = true; requestRender(); }

function saveFigures() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(FIGURES_KEY, JSON.stringify({ base: loadedRaw, figures })); } catch { /* ignore */ }
}

function onEditTap(x, y) {
  const active = figures[editIndex];
  if (!active) return;
  const view = { width: canvas.clientWidth, height: canvas.clientHeight };
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, ...view };
  const projector = createProjector(cam);
  // Any visible star is clickable; the toggled edge is added to the ACTIVE figure regardless of
  // which constellation the star is catalogued under (so shared/neighbouring stars can be added).
  const projected = skyObjects
    .map((s) => { const p = projector(s.altaz.az, s.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: s }; });
  const star = pickNearest(projected, x, y, 14);
  if (!star) { selected = null; requestRender(); return; }
  if (!selected) { selected = star; requestRender(); return; }
  if (selected.id === star.id) { selected = null; requestRender(); return; }
  active.lines = toggleEdge(active.lines, [selected.ra, selected.dec], [star.ra, star.dec]);
  saveFigures();
  selected = null;
  requestRecompute();
}

// Card context, incl. an onClose that clears the on-canvas highlight.
function cardCtx(observer, time) {
  return { observer, time, currentYear: new Date().getFullYear(), onClose: () => { highlighted = null; requestRender(); } };
}

// Outside edit mode, a tap identifies the nearest visible object and opens its card.
function onIdentifyTap(x, y) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, width: canvas.clientWidth, height: canvas.clientHeight };
  const projector = createProjector(cam);
  const candidates = [
    ...skyObjects.map((s) => ({ kind: 'star', name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz })),
    ...markers.map((m) => ({ kind: m.label === 'Moon' ? 'moon' : m.label === 'Sun' ? 'sun' : 'planet', label: m.label, body: m.body, altaz: m.altaz })),
  ].filter((o) => o.altaz.alt >= 0);
  const projected = candidates.map((o) => { const p = projector(o.altaz.az, o.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: o }; });
  const hit = pickNearest(projected, x, y, 18);
  if (hit) { highlighted = hit; openCard(hit, cardCtx(observer, time)); requestRender(); }
  else { highlighted = null; closeCard(); requestRender(); }
}

// Candidate pool for the guide: bright named stars up + the Moon + naked-eye planets up.
function buildPicks() {
  const stars = skyObjects
    .filter((s) => s.name && s.altaz.alt >= 0 && s.mag <= 2.0)
    .map((s) => ({ kind: 'star', name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz, why: `a bright ${colorWord(s.bv)} star` }));
  const bodies = markers
    .filter((m) => m.label !== 'Sun' && m.altaz.alt >= 0)
    .map((m) => ({
      kind: m.label === 'Moon' ? 'moon' : 'planet',
      name: m.label, label: m.label, body: m.body, mag: m.mag, altaz: m.altaz,
      why: m.label === 'Moon' ? 'our nearest neighbour' : 'a wandering planet, easy with the naked eye',
    }));
  return rankCandidates([...bodies, ...stars]);
}

// Find: open the card immediately, then slew to center the pick.
function onFindObject(pick) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  highlighted = pick;
  openCard(pick, cardCtx(observer, time));
  const targetFov = Math.max(12, Math.min(st.fov, 20)); // ease in a notch
  animateSlew(store, { az: pick.altaz.az, alt: pick.altaz.alt, fov: targetFov });
}

function onTap(x, y) {
  if (store.getState().flags.edit) onEditTap(x, y);
  else onIdentifyTap(x, y);
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
    requestRecompute();
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

function drawHighlight(ctx, cam) {
  if (!highlighted) return;
  const p = createProjector(cam)(highlighted.altaz.az, highlighted.altaz.alt);
  if (!p.visible) return;
  ctx.strokeStyle = 'rgba(255, 220, 130, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
  ctx.stroke();
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
  loadedRaw = loaded;
  const saved = loadSavedFigures(loaded);
  figures = saved || splitSegments(loaded);
  originalFigures = splitSegments(loaded);
  store.subscribe(requestRender);
  let prevLocTime = '';
  store.subscribe(() => {
    const s = store.getState();
    const key = `${s.location.lat},${s.location.lng}|${s.time.live ? 'live' : s.time.instant}`;
    if (key !== prevLocTime) { prevLocTime = key; requestRecompute(); }
  });
  setInterval(() => { if (store.getState().time.live) requestRecompute(); }, 30000); // keep live sky current
  store.subscribe(onEditToggle);
  window.addEventListener('resize', requestRender);
  attachInput(canvas, store, { onTap, onAction: onEditAction });
  const controls = document.getElementById('controls');
  if (controls) controls.append(buildLocationControl(store), buildTimeControls(store));
  guide = buildGuide(store, { onFind: onFindObject });
  const guideHost = document.getElementById('guide-host');
  if (guideHost) guideHost.append(guide.el);
  requestRender();
}

boot();
