import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body, bodyMagnitude, bodyAngularRadiusDeg, searchLunarEclipse, nextLunarEclipse, moonPhaseInfo, moonPhaseAngleDeg, bodyEquatorialJ2000, northPoleJ2000, bodyHourAngleDeg } from './core/astro.js';
import { makeStarAltAz, horToEqjRotation, eqjToGalRotation } from './core/astro.js';
import { moonScreenAngles } from './core/moon.js';
import { buildLocationControl } from './ui/location.js';
import { buildTimeControls } from './ui/time-controls.js';
import { PLANETS, planetRadius } from './render/planets.js';
import { drawScene, drawStarLabels, markerRadius, resizeCanvas } from './render/sky.js';
import { createStarfield } from './render/starfield-gl.js';
import { drawHud, azToCompass } from './render/hud.js';
import { createRenderScheduler } from './core/scheduler.js';
import { attachInput } from './ui/input.js';
import { splitSegments, toggleEdge, pickNearest, circularCentroid, exportFigures } from './edit/figures.js';
import { createProjector, vec } from './core/projection.js';
import { skyParams, enuToGalMatrix } from './render/atmosphere.js';
import { openCard, closeCard, colorWord, constellationName, isCardOpen } from './ui/card.js';
import { rankCandidates, altazToWhere } from './guide/ranking.js';
import { buildGuide } from './ui/guide.js';
import { buildSearch, buildSearchIndex } from './ui/search.js';
import { animateSlew } from './ui/slew.js';
import { findEclipseContext } from './guide/eclipses.js';
import { activeShower } from './guide/showers.js';
import { findConjunctions, midpointAltAz } from './guide/conjunctions.js';
import { isGyroSupported, requestGyroPermission, attachGyro } from './ui/gyro.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
// WebGL2 starfield on a canvas behind #sky. null if WebGL2 is unavailable -> fall back to the 2D
// star path in drawScene. The 2D overlay (#sky) keeps drawing grid/lines/labels/markers/HUD on top.
const glCanvas = document.getElementById('sky-gl');
const starfield = glCanvas ? createStarfield(glCanvas) : null;
const useGL = !!starfield;
if (!useGL) console.warn('[volvella] WebGL2 unavailable — using the 2D star fallback');
if (useGL) starfield.setMilkyWay('./data/milkyway-4k.webp'); // all-sky background; renders atmosphere-only until it loads
if (useGL) starfield.setMoon('./data/moon-2k.webp');
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon/planet markers { altaz, label, color, radius }
let figures = [];        // editable source: [{name, abbr, lines:[[[ra,dec],[ra,dec]],...]}] (2-point segments)
let constellations = []; // derived render data: [{name, label:{alt,az}, lines:[[{alt,az},...]]}]
let dsos = [];          // raw catalogue from dso.json
let dsoObjects = [];    // { ...dso, kind:'dso', altaz } for the current time/location
let originalFigures = [];   // pristine split from the file, for reset
let loadedRaw = [];   // the raw constellations.json array as loaded (basis for localStorage validity)
let guide = null;
let eclipseCtx = { inProgress: null, next: null }; // recomputed each computeSky from the set time
let tonightShower = null;   // the meteor shower peaking tonight (+ radiant alt/az), or null
let conjunctions = [];      // close Moon/planet pairs tonight, closest-first
let skyDirty = true; // next render recomputes the sky first (coalesces scrub/tick/edit recomputes)
let selected = null;        // first star picked in edit mode (a skyObjects entry)
let highlighted = null;     // object whose card is currently open (gets a ring on canvas)
let followTarget = null;    // object kept centred as time changes (set by Find/search; cleared on drag/tap)
let editIndex = 0;          // index into figures[] of the currently active constellation
let prevEdit = false;       // tracks previous edit-mode state to detect enter/exit transitions
const FIGURES_KEY = 'volvella.figures.v2';
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
    return { altaz: altAzOfBody(p.body, observer, time), label: p.name, color: p.color, radius: planetRadius(mag), body: p.body, mag, alpha: markerAlpha(mag) };
  });
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8', angularRadiusDeg: bodyAngularRadiusDeg(Body.Moon, observer, time), body: Body.Moon, mag: bodyMagnitude(Body.Moon, time), alpha: 1 },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f', angularRadiusDeg: bodyAngularRadiusDeg(Body.Sun, observer, time), body: Body.Sun, alpha: 1 },
    ...planetMarkers,
  ];
  if (useGL) {
    // Sky background: atmosphere colour + star wash-out are driven by the Sun's altitude; the warm
    // glow lobe needs its direction. (Phase 3 adds the ENU->EQJ matrix here for the Milky Way.)
    const sun = markers.find((m) => m.label === 'Sun');
    const sunAlt = sun ? sun.altaz.alt : -90;
    const p = skyParams(sunAlt);
    p.sunDir = vec(sun ? sun.altaz.az : 0, sunAlt);
    p.enuToGal = enuToGalMatrix(horToEqjRotation(observer, time), eqjToGalRotation()); // sample the galactic-frame Milky Way
    starfield.setSkyParams(p);
    const moonM = markers.find((m) => m.label === 'Moon');
    if (moonM) {
      const moonEq = bodyEquatorialJ2000(Body.Moon, observer, time);
      const sunEq = bodyEquatorialJ2000(Body.Sun, observer, time);
      const pole = northPoleJ2000(Body.Moon, time);
      const angles = moonScreenAngles({
        moonRaDeg: moonEq.raDeg, moonDecDeg: moonEq.decDeg,
        sunRaDeg: sunEq.raDeg, sunDecDeg: sunEq.decDeg,
        poleRaDeg: pole.raDeg, poleDecDeg: pole.decDeg,
        haDeg: bodyHourAngleDeg(Body.Moon, observer, time), latDeg: st.location.lat,
      });
      starfield.setMoonParams({
        dir: vec(moonM.altaz.az, moonM.altaz.alt),
        radiusPx: 0, // filled per-frame in render() via updateMoonRadius (depends on camera/fov)
        phaseAngleDeg: moonPhaseAngleDeg(time),
        brightLimbAngle: angles.brightLimbAngle,
        northAngle: angles.northAngle,
      });
    }
  }
  const eclipseAt = st.time.instant ? new Date(st.time.instant) : new Date();
  eclipseCtx = findEclipseContext({
    at: eclipseAt,
    getFirst: (d) => searchLunarEclipse(d),
    getNextAfter: (peak) => nextLunarEclipse(peak),
    moonAltAt: (d) => altAzOfBody(Body.Moon, observer, makeTime(d)).alt,
  });
  constellations = figures.map((f) => {
    const [lra, ldec] = labelOf(f);
    return {
      name: f.name,
      label: toAltAz(lra, ldec),
      lines: f.lines.map((seg) => seg.map(([ra, dec]) => toAltAz(ra, dec))),
    };
  });
  dsoObjects = dsos.map((d) => ({ ...d, kind: 'dso', altaz: toAltAz(d.ra, d.dec) }));
  const sh = activeShower(eclipseAt);
  tonightShower = sh ? { ...sh, radiant: toAltAz(sh.radiantRa, sh.radiantDec) } : null;
  const bright = markers.filter((m) => m.label !== 'Sun' && m.altaz.alt >= 0);
  conjunctions = findConjunctions(bright, 5);
  if (guide) {
    const sun = markers.find((m) => m.label === 'Sun');
    const isDay = !!sun && sun.altaz.alt > -0.833;
    guide.setPicks(buildPicks(), { isDay });
    guide.setEvent(buildTonightEvent());
  }
  syncSelection();
}

// Approximate glow brightness (0..1) for a Sun/Moon/planet marker from its apparent magnitude:
// brighter (smaller mag) glows more. The Sun marker has no mag field, so it gets the max. The low
// 0.22 floor lets the faint outer planets (Uranus ~5.7, Neptune ~7.8) dim well below the naked-eye
// ones, so they read as faint pinpoints rather than bright discs.
function markerAlpha(mag) {
  if (mag == null || !Number.isFinite(mag)) return 1.0;
  return Math.max(0.22, Math.min(1.0, 1.0 - (mag + 4) * 0.0625));
}

function render() {
  if (skyDirty) {
    computeSky();
    if (useGL) starfield.uploadStars(skyObjects); // re-upload on the same cadence as the CPU recompute
    // Locked onto an object: re-aim to keep it centred as time/location change (skipped under gyro aim,
    // which owns the aim). setAim below is read by getState() further down, so this frame uses it.
    if (followTarget && !store.getState().flags.gyro) {
      const aa = resolveFollowAltAz();
      if (aa) store.setAim(aa.az, aa.alt);
    }
    skyDirty = false;
  }
  const view = resizeCanvas(canvas);
  const st = store.getState();
  // Lift the compass ribbon/readout above the on-screen control bar so they aren't hidden behind it.
  const controlsEl = document.getElementById('controls');
  const bottomInset = controlsEl ? controlsEl.offsetHeight : 0;
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, roll: st.roll, width: view.width, height: view.height, bottomInset };
  // In edit mode, show ONLY the active constellation's lines (focus); otherwise honor the lines flag.
  const visibleCons = st.flags.edit
    ? (constellations[editIndex] ? [constellations[editIndex]] : [])
    : (st.flags.lines ? constellations : []);
  if (useGL) {
    starfield.resize(view.width, view.height, window.devicePixelRatio || 1);
    const moonM = markers.find((m) => m.label === 'Moon');
    if (moonM) starfield.updateMoonRadius(markerRadius(moonM, cam)); // before draw: the Moon pass runs in draw()
    starfield.draw(cam, { showBelow: st.flags.sphere, edit: st.flags.edit });
    // Sun/Moon/planets as glowing discs: size from markerRadius (angular for Sun/Moon, disk for
    // planets), tint from the body's colour, brightness from magnitude. Hidden in edit mode.
    const glMarkers = st.flags.edit ? [] : markers
      .filter((m) => m.label !== 'Moon')   // the Moon is drawn by its own phased pass, not as a disc
      .map((m) => ({
        az: m.altaz.az, alt: m.altaz.alt, color: m.color,
        radiusPx: markerRadius(m, cam), alpha: m.alpha,
      }));
    starfield.drawMarkers(glMarkers, cam, { showBelow: st.flags.sphere });
  }
  drawScene(ctx, {
    stars: skyObjects,
    markers: st.flags.edit ? [] : markers,   // hide Sun/Moon/planets in edit mode so they don't overlap stars
    constellations: visibleCons,
    cam,
    edit: st.flags.edit,
    labels: st.flags.labels,
    grid: st.flags.grid && !st.flags.edit,   // hide the grid in edit mode to keep the figure clear
    sphere: st.flags.sphere,                 // also draw everything below the horizon
    drawStarPoints: !useGL,                  // GL draws the star discs; 2D only as the fallback
    drawMarkerDiscs: !useGL,                 // GL draws the marker discs; 2D keeps only their labels
    dsos: st.flags.edit ? [] : dsoObjects,   // deep-sky glow/symbols (hidden in edit mode)
    deepsky: st.flags.deepsky,
    selectedDsoId: highlighted && highlighted.kind === 'dso' ? highlighted.id : null,
  });
  // In GL mode the star discs live on the GL canvas, so their labels are drawn here, after the
  // constellation lines (so labels sit on top), matching the old single-canvas order.
  if (useGL) drawStarLabels(ctx, skyObjects, createProjector(cam), cam, st.flags.labels, st.flags.sphere || st.flags.edit);
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
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, roll: st.roll, ...view };
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
function cardCtx(observer, time, eclipse = null) {
  return { observer, time, eclipse, onClose: () => { highlighted = null; requestRender(); } };
}

// Outside edit mode, a tap identifies the nearest visible object and opens its card.
function onIdentifyTap(x, y) {
  followTarget = null; // tapping/selecting exits lock-on mode
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, roll: st.roll, width: canvas.clientWidth, height: canvas.clientHeight };
  const projector = createProjector(cam);
  const candidates = [
    ...skyObjects.map((s) => ({ kind: 'star', id: s.id, name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz })),
    ...markers.map((m) => ({ kind: m.label === 'Moon' ? 'moon' : m.label === 'Sun' ? 'sun' : 'planet', label: m.label, body: m.body, mag: m.mag, altaz: m.altaz })),
    ...dsoObjects,
  ].filter((o) => st.flags.sphere || o.altaz.alt >= 0); // full-sphere mode draws below-horizon objects, so let them be picked too
  const projected = candidates.map((o) => { const p = projector(o.altaz.az, o.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: o }; });
  const hit = pickNearest(projected, x, y, 18);
  if (hit) {
    highlighted = hit;
    openCard(hit, cardCtx(observer, time, eclipseForMoon(hit.kind)));
    requestRender();
  }
  else { highlighted = null; closeCard(); requestRender(); }
}

// Candidate pool for the guide: bright named stars up + the Moon + naked-eye planets up.
function buildPicks() {
  const stars = skyObjects
    .filter((s) => s.name && s.altaz.alt >= 0 && s.mag <= 2.0)
    .map((s) => ({ kind: 'star', id: s.id, name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz, why: `a bright ${colorWord(s.bv)} star` }));
  const bodies = markers
    .filter((m) => m.label !== 'Sun' && m.altaz.alt >= 0)
    .map((m) => ({
      kind: m.label === 'Moon' ? 'moon' : 'planet',
      name: m.label, label: m.label, body: m.body, mag: m.mag, altaz: m.altaz,
      why: m.label === 'Moon' ? 'our nearest neighbour'
        : m.mag > 4 ? 'a distant ice giant — bring binoculars'
        : 'a wandering planet, easy with the naked eye',
    }));
  const deepSky = dsoObjects
    .filter((d) => d.altaz.alt >= 0)
    .map((d) => ({ ...d, why: d.blurb }));
  return rankCandidates([...bodies, ...stars, ...deepSky]);
}

// The eclipse to attach to a Moon card: the live timeline if one's in progress, else the next one,
// so the eclipse shows whether you tap, search, or Find the Moon. Null for any non-Moon object.
function eclipseForMoon(kind) {
  if (kind !== 'moon') return null;
  if (eclipseCtx.inProgress) return { ...eclipseCtx.inProgress, live: true };
  if (eclipseCtx.next) return { ...eclipseCtx.next, live: false };
  return null;
}

// Current alt/az for the selected object, re-resolved from the freshly recomputed arrays so the
// highlight ring tracks it as time advances. Stars/DSOs match by id, Sun/Moon/planets by label.
// Null if it can't be matched (e.g. an object that's no longer in the catalogue).
function liveAltAzFor(sel) {
  if (sel.kind === 'star') { const s = skyObjects.find((o) => o.id === sel.id); return s ? s.altaz : null; }
  if (sel.kind === 'dso') { const d = dsoObjects.find((o) => o.id === sel.id); return d ? d.altaz : null; }
  const m = markers.find((o) => o.label === sel.label); // moon / sun / planet
  return m ? m.altaz : null;
}

// Keep the selection's highlight ring (and its open card) pinned to the object's live position as the
// sky advances. Called at the end of each computeSky. Bare find-aims (shower radiant / conjunction
// midpoint) have no `kind` and stay put — they're transient and barely drift.
function syncSelection() {
  if (!highlighted || !highlighted.kind) return;
  const altaz = liveAltAzFor(highlighted);
  if (altaz) highlighted.altaz = altaz;            // ring follows the object
  if (!isCardOpen()) return;                       // refresh the card's where-now / distance / phase readouts
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  openCard(highlighted, cardCtx(observer, time, eclipseForMoon(highlighted.kind)));
}

// The single most notable thing happening tonight, for the always-visible banner. Tonight-only:
// in-progress eclipse > shower at peak > closest conjunction > nothing. (The "next eclipse" readout
// lives on the Moon card, not here.)
function buildTonightEvent() {
  if (eclipseCtx.inProgress) {
    const e = eclipseCtx.inProgress;
    const kindWord = e.kind === 'total' ? 'Total' : 'Partial';
    return {
      text: `🌑 ${kindWord} lunar eclipse — happening now. The Moon is in Earth's shadow.`,
      actionLabel: 'Find',
      onAction: () => onJumpToEclipse(e),
    };
  }
  if (tonightShower) return showerEvent(tonightShower);
  if (conjunctions.length) return conjunctionEvent(conjunctions[0]);
  return null;
}

// Banner for a meteor shower at peak: rate + radiant + a moonlight heads-up when the Moon's bright.
function showerEvent(sh) {
  const moon = markers.find((m) => m.label === 'Moon');
  let note = '';
  if (moon && moon.altaz.alt >= 0) {
    const st = store.getState();
    const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
    if (moonPhaseInfo(time).illumPct > 40) note = ' A bright Moon will wash out fainter ones.';
  }
  const text = `☄️ ${sh.name} peaks tonight — up to ~${sh.zhr}/hr under dark skies, radiant in ${constellationName(sh.con)}.${note}`;
  return { text, actionLabel: 'Find', onAction: () => onFindShower(sh) };
}

// Banner for a close pairing of bright bodies (Moon named first, else the brighter one).
function conjunctionEvent(pair) {
  const [first, second] = pair.a.label === 'Moon' ? [pair.a, pair.b]
    : pair.b.label === 'Moon' ? [pair.b, pair.a]
    : (pair.a.mag ?? 99) <= (pair.b.mag ?? 99) ? [pair.a, pair.b] : [pair.b, pair.a];
  const sepStr = pair.sepDeg < 1 ? pair.sepDeg.toFixed(1) : String(Math.round(pair.sepDeg));
  const where = altazToWhere(midpointAltAz(pair.a.altaz, pair.b.altaz), azToCompass);
  const text = `🌗 ${first.label} and ${second.label} are close — ${sepStr}° apart, ${where}.`;
  return { text, actionLabel: 'Find', onAction: () => onFindConjunction(pair) };
}

// Jump to an eclipse: set time to its peak, center the Moon, open the Moon card with the timeline.
function onJumpToEclipse(e) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(e.peak);
  const altaz = altAzOfBody(Body.Moon, observer, time);
  const pick = { kind: 'moon', label: 'Moon', body: Body.Moon, altaz, mag: bodyMagnitude(Body.Moon, time) };
  store.setTime(e.peak, false);              // jump the clock to peak (triggers recompute)
  highlighted = pick;
  openCard(pick, cardCtx(observer, time, { ...e, live: true }));
  const targetFov = Math.max(12, Math.min(st.fov, 20));
  animateSlew(store, { az: altaz.az, alt: altaz.alt, fov: targetFov });
}

// Find a meteor shower: clear any card and slew to its radiant at a wide field (meteors streak across
// the sky). Full-sphere reveals a radiant that's still below the horizon early in the evening.
function onFindShower(sh) {
  closeCard();
  highlighted = { altaz: sh.radiant };
  const st = store.getState();
  const targetFov = Math.min(Math.max(st.fov, 40), 60);
  animateSlew(store, { az: sh.radiant.az, alt: sh.radiant.alt, fov: targetFov });
}

// Find a conjunction: clear any card, aim between the pair, and zoom to frame both.
function onFindConjunction(pair) {
  closeCard();
  const mid = midpointAltAz(pair.a.altaz, pair.b.altaz);
  highlighted = { altaz: mid };
  const targetFov = Math.max(8, Math.min(pair.sepDeg * 4, 20));
  animateSlew(store, { az: mid.az, alt: mid.alt, fov: targetFov });
}

// A re-resolvable identity for "lock onto this object and keep it centred as time changes". Returns
// null for picks without a stable single-object identity (e.g. a shower radiant or conjunction midpoint).
function followIdentity(pick) {
  if (!pick || !pick.kind) return null;
  if (pick.kind === 'star') return { kind: 'star', id: pick.id };
  if (pick.kind === 'dso') return { kind: 'dso', id: pick.id };
  if (pick.kind === 'moon' || pick.kind === 'sun' || pick.kind === 'planet') return { kind: 'body', label: pick.label };
  return null;
}

// Current alt/az of the followed object, re-found in the freshly recomputed arrays, or null.
function resolveFollowAltAz() {
  if (!followTarget) return null;
  if (followTarget.kind === 'star') { const s = skyObjects.find((o) => o.id === followTarget.id); return s ? s.altaz : null; }
  if (followTarget.kind === 'body') { const m = markers.find((o) => o.label === followTarget.label); return m ? m.altaz : null; }
  if (followTarget.kind === 'dso') { const d = dsoObjects.find((o) => o.id === followTarget.id); return d ? d.altaz : null; }
  if (followTarget.kind === 'constellation') { const c = constellations.find((o) => o.name === followTarget.name); return c ? c.label : null; }
  return null;
}

// Find: open the card immediately, then slew to center the pick.
function onFindObject(pick) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  highlighted = pick;
  followTarget = followIdentity(pick); // lock on: keep it centred as the clock changes
  openCard(pick, cardCtx(observer, time, eclipseForMoon(pick.kind)));
  const targetFov = Math.max(12, Math.min(st.fov, 20)); // ease in a notch
  animateSlew(store, { az: pick.altaz.az, alt: pick.altaz.alt, fov: targetFov });
}

// Search result chosen: resolve it to a live object and reuse Find (slew + card). Constellations
// have no info card, so they just slew to their centroid with a highlight ring.
function onSearchSelect(entry) {
  if (entry.type === 'dso') {
    const d = dsoObjects.find((o) => o.id === entry.ref);
    if (d) onFindObject(d);
  } else if (entry.type === 'star') {
    const s = skyObjects.find((o) => o.id === entry.ref);
    if (s) onFindObject({ kind: 'star', id: s.id, name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz });
  } else if (entry.type === 'body') {
    const m = markers.find((o) => o.label === entry.ref);
    if (m) {
      const kind = m.label === 'Moon' ? 'moon' : m.label === 'Sun' ? 'sun' : 'planet';
      onFindObject({ kind, label: m.label, body: m.body, mag: m.mag, altaz: m.altaz });
    }
  } else { // constellation
    const c = constellations.find((o) => o.name === entry.ref);
    if (c && c.label) {
      highlighted = { altaz: c.label };
      followTarget = { kind: 'constellation', name: c.name }; // lock on its label point
      const st = store.getState();
      animateSlew(store, { az: c.label.az, alt: c.label.alt, fov: Math.max(12, Math.min(st.fov, 20)) });
    }
  }
}

// A control-bar button that toggles a boolean state flag and reflects it via the `.on` class.
function makeToggle(label, flag, className = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `view-toggle ${className}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', () => store.setFlag(flag, !store.getState().flags[flag]));
  const sync = () => {
    const on = store.getState().flags[flag];
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  store.subscribe(sync);
  sync();
  return btn;
}

// The gyroscope/AR toggle: shown only on devices with orientation sensors. Activating it requests
// permission (must run inside this click handler for iOS) and, if granted, streams device orientation
// into store.setOrientation; deactivating detaches and lets setFlag('gyro', false) level the roll.
function makeGyroToggle() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'view-toggle';
  btn.textContent = '📱 AR';
  let detach = null;
  let activating = false; // guards against a second tap while the (async) permission prompt is open
  btn.addEventListener('click', async () => {
    if (store.getState().flags.gyro) {            // turn OFF
      if (detach) { detach(); detach = null; }
      store.setFlag('gyro', false);
      return;
    }
    if (activating) return;                       // a permission request is already in flight
    activating = true;
    try {
      const perm = await requestGyroPermission(); // turn ON — request inside the gesture (iOS)
      if (perm !== 'granted') { console.warn(`[volvella] gyroscope unavailable: ${perm}`); return; }
      store.setFlag('gyro', true);                // set the flag BEFORE attaching, so the first
      detach = attachGyro(store);                 // setOrientation events are honored (not no-op'd)
      if (store.getState().fov < 30) store.setFov(50); // don't wave the phone in a telescope view
    } finally {
      activating = false;
    }
  });
  const sync = () => {
    const on = store.getState().flags.gyro;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  store.subscribe(sync);
  sync();
  return btn;
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
    if (figures[editIndex]) console.log(`[volvella] editing: ${figures[editIndex].name}`);
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
    console.log(`[volvella] editing: ${figures[editIndex].name}`);
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
    console.error('[volvella] Failed to load star catalogue:', err);
  }
  let loaded = [];
  try {
    const cres = await fetch('./data/constellations.json');
    if (!cres.ok) throw new Error(`constellations.json: HTTP ${cres.status}`);
    loaded = await cres.json();
  } catch (err) {
    console.error('[volvella] Failed to load constellations:', err);
  }
  try {
    const dres = await fetch('./data/dso.json');
    if (!dres.ok) throw new Error(`dso.json: HTTP ${dres.status}`);
    dsos = await dres.json();
  } catch (err) {
    console.error('[volvella] Failed to load deep-sky catalogue:', err);
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
  attachInput(canvas, store, { onTap, onAction: onEditAction, onViewDrag: () => { followTarget = null; } });
  const controls = document.getElementById('controls');
  const bodyLabels = ['Moon', 'Sun', ...PLANETS.map((p) => p.name)];
  const search = buildSearch(buildSearchIndex(stars, figures, bodyLabels, dsos), { onSelect: onSearchSelect });
  if (controls) {
    controls.append(buildLocationControl(store), search.el, buildTimeControls(store));
    controls.append(
      makeToggle('Constellations', 'lines'),
      makeToggle('Labels', 'labels'),
      makeToggle('Grid', 'grid'),
      makeToggle('Deep sky', 'deepsky'),
      makeToggle('Full sphere', 'sphere'),
      makeToggle('🌙 Night', 'night', 'night-toggle'),
    );
    if (isGyroSupported()) controls.append(makeGyroToggle());
  }
  // Night mode also tints the whole document (the toggle button's own state is handled by makeToggle).
  const applyNight = () => document.body.classList.toggle('night', store.getState().flags.night);
  store.subscribe(applyNight);
  applyNight();
  guide = buildGuide(store, { onFind: onFindObject });
  const guideHost = document.getElementById('guide-host');
  if (guideHost) guideHost.append(guide.el);
  requestRender();
}

boot();
