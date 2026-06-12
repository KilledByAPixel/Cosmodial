import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body, bodyMagnitude, bodyAngularRadiusDeg, searchLunarEclipse, nextLunarEclipse, searchSolarEclipse, nextSolarEclipse, moonPhaseInfo, bodyPhaseAngleDeg, northPoleJ2000, planetMoonsAltAz, moonLibrationDeg, nextSunEvent, cometsAltAz, PLANET_MOONS, lunarShadow, nextSunBelowAlt } from './core/astro.js';
import { makeStarAltAz, horToEqjRotation, eqjToGalRotation } from './core/astro.js';
import { eqjToEnuMatrix } from './render/star-transform.js';
import { bodyScreenOrientation, altazSepDeg, discObscuration, frameFovDeg, planetResolveFovDeg } from './core/moon.js';
import { buildTimeControls } from './ui/time-controls.js';
import { buildMenu, buildSkyToggles } from './ui/menu.js';
import { screenshotName, saveComposite } from './ui/screenshot.js';
import { PLANETS, planetRadius } from './render/planets.js';
import { COMETS } from './core/comets.js';
import { SATURN_RING, ringOpening } from './render/ring-math.js';
import { drawScene, drawStarLabels, markerRadius, resizeCanvas, SUN_SCALE } from './render/sky.js';
import { createStarfield, hexToRgb01 } from './render/starfield-gl.js';
import { drawHud, azToCompass } from './render/hud.js';
import { createRenderScheduler } from './core/scheduler.js';
import { attachInput } from './ui/input.js';
import { splitSegments, toggleEdge, pickNearest, circularCentroid, exportFigures } from './edit/figures.js';
import { createProjector, vec, focalPx } from './core/projection.js';
import { skyParams, spaceSkyParams, belowHorizonFade, enuToGalMatrix, eclipseDarkenedSunAlt, eclipseDeepFraction } from './render/atmosphere.js';
import { openCard, closeCard, constellationName, isCardOpen } from './ui/card.js';
import { altazToWhere } from './guide/ranking.js';
import { createFavorites, displayName } from './core/favorites.js';
import { buildFavoritesPanel } from './ui/favorites.js';
import { buildSearch, buildSearchIndex } from './ui/search.js';
import { parseShareParam } from './ui/share.js';
import { animateSlew } from './ui/slew.js';
import { createScreensaver, DUSK_SUN_ALT } from './ui/screensaver.js';
import { findEclipseContext, umbralVisibility, solarVisibility } from './guide/eclipses.js';
import { activeShower } from './guide/showers.js';
import { findConjunctions, midpointAltAz } from './guide/conjunctions.js';

// Planet disc size vs true angular size. 1 = true scale (Stellarium-like): zoomed out, planets are the
// oversized glow DOTS (visibility); the textured sphere appears exactly when its TRUE disc outgrows the
// dot, and from there the disc and Saturn's rings are 1:1. (Moon positions are always true-scale, so a
// value != 1 would inflate discs relative to the moons around them.)
const PLANET_SCALE = 1;

// Comets draw as markers only when at least binocular-bright; fainter ones stay searchable
// (highlight ring + card) without littering the sky with labels for invisible objects.
const COMET_MARKER_MAG = 9;

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
// WebGL2 starfield on a canvas behind #sky. null if WebGL2 is unavailable -> fall back to the 2D
// star path in drawScene. The 2D overlay (#sky) keeps drawing grid/lines/labels/markers/HUD on top.
const glCanvas = document.getElementById('sky-gl');
// '?nogl' in the URL forces the 2D fallback — a quick way to test the no-WebGL2 path without
// hunting for a browser that actually lacks it.
const forceNoGL = new URLSearchParams(window.location.search).has('nogl');
const starfield = (glCanvas && !forceNoGL) ? createStarfield(glCanvas) : null;
const useGL = !!starfield;
if (!useGL) console.warn(forceNoGL ? '[cosmodial] 2D star fallback forced by ?nogl'
  : '[cosmodial] WebGL2 unavailable — using the 2D star fallback');
if (useGL) starfield.setMilkyWay('./data/milkyway-4k.webp'); // all-sky background; renders atmosphere-only until it loads
if (useGL) starfield.setBodyTexture('moon', './data/moon-2k.webp');
if (useGL) {
  // Real surface maps for every planet (Venus = its cloud deck — the visible face). Solar System
  // Scope, CC-BY 4.0; see ATTRIBUTION.md.
  for (const p of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    starfield.setBodyTexture(p, `./data/${p}-2k.webp`);
  }
  starfield.setBodyTexture('saturn-rings', './data/saturn-rings.webp', { clampS: true });
}
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon/planet markers { altaz, label, color, radius }
let figures = [];        // editable source: [{name, abbr, lines:[[[ra,dec],[ra,dec]],...]}] (2-point segments)
let constellations = []; // derived render data: [{name, label:{alt,az}, lines:[[{alt,az},...]]}]
let dsos = [];          // raw catalogue from dso.json
let dsoObjects = [];    // { ...dso, kind:'dso', altaz } for the current time/location
let cometObjects = [];  // [{ kind:'comet', id, name, altaz|null, mag, ... }] for the current time/location
let originalFigures = [];   // pristine split from the file, for reset
let loadedRaw = [];   // the raw constellations.json array as loaded (basis for localStorage validity)
let favPanel = null;
const favorites = createFavorites();
let eclipseCtx = { inProgress: null, next: null }; // lunar; recomputed each full computeSky from the set time
let solarEclipseCtx = { inProgress: null, next: null }; // solar, observer-local; same cadence as eclipseCtx
let eclipseObscuration = 0; // fraction of the Sun's disc the Moon covers right now (per frequent pass)
let tonightShower = null;   // the meteor shower peaking tonight (+ radiant alt/az), or null
let conjunctions = [];      // close Moon/planet pairs tonight, closest-first
let skyDirty = true;  // next render runs the FREQUENT recompute (markers/spheres/lines/labels/DSOs)
let fullDirty = true; // next recompute also runs the FULL pass (100k pick array, eclipse, favorites/events)
let selected = null;        // first star picked in edit mode (a skyObjects entry)
let highlighted = null;     // object whose card is currently open (gets a ring on canvas)
let followTarget = null;    // object kept centred as time changes (set by Find/search; cleared on drag/tap)
let bodyInputs = [];   // per-recompute lit-sphere inputs (Moon + planets); see computeSky()
let planetMoons = [];       // all systems, flat [{planet, name, altaz, mag, behind}]; drawn when planet resolves
let resolvedPlanets = new Set(); // sphere-pass planets from the LAST frame; gates moon picks like moon draws
// NOTE: the 2D (non-GL) fallback path never assigns resolvedPlanets, so moons never draw and stay
// untappable there by construction (search can still slew to one).

// Live pick object for a planetary moon — search, tap, follow, and favorites all converge here.
// planetBody lets the card read the planet's distance without importing Body itself.
const moonPick = (m) => ({ kind: 'planet-moon', label: m.name, planet: m.planet,
  planetBody: Body[m.planet], mag: m.mag, altaz: m.altaz, behind: m.behind });

// Moons whose planet has resolved into a sphere (per the given set) and that aren't occulted —
// the one gate shared by drawing and tap-picking so the two can't drift apart.
const visibleMoons = (resolved) => planetMoons.filter((m) => resolved.has(m.planet) && !m.behind);
let namedStars = []; // skyObjects with names — label positions refresh on the frequent cadence
let skyStamp = null; // { lat, lng, ms } of the last FULL recompute (pick-staleness guard)
let editIndex = 0;          // index into figures[] of the currently active constellation
let prevEdit = false;       // tracks previous edit-mode state to detect enter/exit transitions
const FIGURES_KEY = 'cosmodial.figures.v2';
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

// Recompute the sky from the current time + location. Two tiers: the FREQUENT pass (every skyDirty
// render — per frame in live mode) refreshes everything cheap that's on screen: markers, lit-sphere
// inputs, constellation lines, named-star label positions, DSOs, sky colours. The FULL pass adds the
// 100k skyObjects remap (now only the picking/favorites data source — the GL stars transform on the
// GPU) plus the eclipse/events work. The 2D fallback always runs full (its stars draw from skyObjects).
function computeSky(full) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const toAltAz = makeStarAltAz(observer, time);
  if (full) {
    skyObjects = stars.map((s) => ({
      altaz: toAltAz(s.ra, s.dec),
      mag: s.mag, bv: s.bv, name: s.name,
      id: s.id, ra: s.ra, dec: s.dec, con: s.con, dist: s.dist,
    }));
    namedStars = skyObjects.filter((s) => s.name);
    skyStamp = { lat: st.location.lat, lng: st.location.lng, ms: (st.time.instant ? new Date(st.time.instant) : new Date()).getTime() };
  } else {
    // Frequent pass: refresh only the stars anything on screen reads — label positions (named stars)
    // plus the selected/followed star. GL star rendering doesn't use these at all (GPU transform);
    // other unnamed stars refresh on the full pass. Without the selection refresh, an unnamed star's
    // ring/lock-on sits on the 30 s full-pass cadence and visibly lags the per-frame GPU stars at
    // deep zoom (~0.004 deg/s of sidereal drift).
    for (const s of namedStars) Object.assign(s.altaz, toAltAz(s.ra, s.dec));
    for (const s of selectionStars()) if (!s.name) Object.assign(s.altaz, toAltAz(s.ra, s.dec));
  }
  const planetMarkers = PLANETS.map((p) => {
    const mag = bodyMagnitude(p.body, time);
    return { altaz: altAzOfBody(p.body, observer, time), label: p.name, color: p.color, radius: planetRadius(mag), body: p.body, mag, alpha: markerAlpha(mag) };
  });
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8', angularRadiusDeg: bodyAngularRadiusDeg(Body.Moon, observer, time), body: Body.Moon, mag: bodyMagnitude(Body.Moon, time), alpha: 1 },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f', angularRadiusDeg: bodyAngularRadiusDeg(Body.Sun, observer, time), body: Body.Sun, alpha: 1 },
    ...planetMarkers,
  ];
  // Live solar-eclipse geometry: how much of the Sun's disc the Moon covers RIGHT NOW (pure overlap
  // math — works at any scrubbed instant, catalogued or not). The Sun's additive glow dims by the
  // covered fraction (a black Moon silhouette can't occlude an additive pass, but this reads right:
  // the glow fades as the Moon crosses, and vanishes at totality, leaving the corona in render()).
  {
    const [moonMk, sunMk] = markers;
    eclipseObscuration = discObscuration(altazSepDeg(sunMk.altaz, moonMk.altaz), sunMk.angularRadiusDeg, moonMk.angularRadiusDeg);
    sunMk.alpha = 1 - eclipseObscuration;
    // The Sun's glow disc is normally drawn oversized (SUN_SCALE represents brightness, not
    // geometry). During an eclipse the geometry IS the point, so the glow shrinks to true scale
    // as coverage grows — by mid-partial the disc matches the Moon and the alignment reads right.
    sunMk.radiusScale = SUN_SCALE - (SUN_SCALE - 1) * Math.min(1, eclipseObscuration / 0.4);
  }
  planetMoons = planetMoonsAltAz(observer, time);
  cometObjects = cometsAltAz(observer, time).map((c) => ({ ...c, kind: 'comet' }));
  if (useGL) {
    // Sky background: atmosphere colour + star wash-out are driven by the Sun's altitude; the warm
    // glow lobe needs its direction, and the Milky Way texture its ENU->galactic sampling matrix.
    const sun = markers.find((m) => m.label === 'Sun');
    const sunAlt = sun ? sun.altaz.alt : -90;
    // Deep eclipse darkens the sky toward twilight (stars out at totality) via an effective Sun altitude.
    const eclipseDeep = eclipseDeepFraction(eclipseObscuration);
    const p = st.flags.atmo ? skyParams(eclipseDarkenedSunAlt(sunAlt, eclipseObscuration)) : spaceSkyParams(); // atmo off = space view (flips via the recompute subscriber in boot)
    // The effective twilight would paint its warm dusk lobe AT the eclipsed Sun — real totality has
    // no glow there (the warm light rings the horizon instead), and it would wash out the corona.
    p.sunGlowStrength *= 1 - eclipseDeep;
    p.sunDir = vec(sun ? sun.altaz.az : 0, sunAlt);
    p.enuToGal = enuToGalMatrix(horToEqjRotation(observer, time), eqjToGalRotation()); // sample the galactic-frame Milky Way
    starfield.setSkyParams(p);
    const sunM = markers.find((m) => m.label === 'Sun');
    const sunDir = sunM ? vec(sunM.altaz.az, sunM.altaz.alt) : [0, 0, 1];
    const rgb255 = (hex) => hexToRgb01(hex).map((v) => Math.round(v * 255));
    const addBody = (label, body, texKey, tint, ring = null, libration = null, veilScale = 1) => {
      const m = markers.find((x) => x.label === label);
      if (!m) return;
      const pole = northPoleJ2000(body, time);
      const poleAA = altAzOfStar(pole.raDeg, pole.decDeg, observer, time);
      bodyInputs.push({
        label, texKey, tint, ring, libration, veilScale,
        bodyDir: vec(m.altaz.az, m.altaz.alt),
        sunDir, poleDir: vec(poleAA.az, poleAA.alt),
        phaseAngleDeg: bodyPhaseAngleDeg(body, time),
        angularRadiusDeg: bodyAngularRadiusDeg(body, observer, time),
      });
    };
    bodyInputs = [];
    // Deep in a solar eclipse the Moon's atmospheric veil fades out: the air toward it sits in the
    // shadow, so the disc reads as a true black silhouette instead of sky-coloured, then recovers.
    addBody('Moon', Body.Moon, 'moon', [232, 232, 232], null, moonLibrationDeg(time), 1 - eclipseDeep);
    for (const p of PLANETS) addBody(p.name, p.body, p.tex || null, rgb255(p.color), p.rings ? SATURN_RING : null);
    // Lunar eclipse: attach Earth's shadow to the Moon's body input whenever the penumbra could
    // touch the disc; render() maps it into disc coordinates and the sphere shader does the rest.
    const moonBi = bodyInputs.find((b) => b.label === 'Moon');
    const moonMk = markers.find((m) => m.label === 'Moon');
    if (moonBi && moonMk) {
      const sh = lunarShadow(observer, time);
      if (altazSepDeg(sh.altaz, moonMk.altaz) <= sh.penumbraDeg + moonBi.angularRadiusDeg) moonBi.shadow = sh;
    }
  } else {
    bodyInputs = [];
  }
  const eclipseAt = st.time.instant ? new Date(st.time.instant) : new Date();
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
  // Telescope-only Pluto (mag ~14.5) is excluded: a "conjunction" with an invisible dot isn't an event.
  const bright = markers.filter((m) => m.label !== 'Sun' && m.altaz.alt >= 0 && (m.mag == null || m.mag < 9));
  conjunctions = findConjunctions(bright, 5);
  if (full) {
    eclipseCtx = findEclipseContext({
      at: eclipseAt,
      getFirst: (d) => searchLunarEclipse(d),
      getNextAfter: (peak) => nextLunarEclipse(peak),
      // Penumbral eclipses map to 'none': barely perceptible, never worth a banner or card line.
      visibilityOf: (e) => (e.kind === 'penumbral' ? 'none'
        : umbralVisibility(e, (d) => altAzOfBody(Body.Moon, observer, makeTime(d)).alt)),
    });
    solarEclipseCtx = findEclipseContext({
      at: eclipseAt,
      getFirst: (d) => searchSolarEclipse(d, observer),
      getNextAfter: (peak) => nextSolarEclipse(peak, observer),
      visibilityOf: solarVisibility,
    });
    if (favPanel) {
      favPanel.setSunEvent(nextSunEvent(observer, eclipseAt));
      favPanel.setRows(buildFavoriteRows());
      favPanel.setEvent(buildTonightEvent());
    }
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
    computeSky(fullDirty || !useGL); // the 2D fallback has no GPU stars — it always needs the full remap
    fullDirty = false;
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
  // Aim-driven reveal of the lower hemisphere: 0 above the horizon, 1 by 10° below (smoothstep).
  // A SELECTED object below the horizon overrides it to fully revealed — searching or following
  // something that has set would otherwise show a ghost (or nothing) at gentle aim altitudes.
  const selBelow = highlighted && highlighted.altaz && highlighted.altaz.alt < 0;
  const belowFade = (st.flags.edit || selBelow) ? 1 : belowHorizonFade(st.aim.alt);
  // Lift the compass ribbon/readout above the on-screen control bar so they aren't hidden behind
  // it. Measured from where the bar actually sits in the viewport (not just its height): if the
  // canvas runs taller than the visible area (mobile URL-bar quirks), height-based math would put
  // the pill under the bar or off-screen.
  const controlsEl = document.getElementById('controls');
  const bottomInset = controlsEl ? Math.max(0, view.height - controlsEl.getBoundingClientRect().top) : 0;
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, roll: st.roll, width: view.width, height: view.height, bottomInset };
  // In edit mode, show ONLY the active constellation's lines (focus); otherwise honor the lines flag.
  const visibleCons = st.flags.edit
    ? (constellations[editIndex] ? [constellations[editIndex]] : [])
    : (st.flags.lines ? constellations : []);
  // Comets bright enough to draw, as plain glow-dot markers (kept out of the module `markers`
  // array so conjunctions/body code never see them).
  const cometMarkers = st.flags.edit ? [] : cometObjects
    .filter((c) => c.altaz && c.mag <= COMET_MARKER_MAG)
    .map((c) => ({ altaz: c.altaz, label: c.name, color: c.color, mag: c.mag, alpha: markerAlpha(c.mag), radius: planetRadius(c.mag) }));
  let drawList = st.flags.edit ? [] : markers.concat(cometMarkers); // markers (+ moons/comets variants below)
  // One EQJ->ENU rotation per frame, shared by the GPU star transform and the equatorial grid:
  // stars sweep smoothly in live/play/scrub at zero per-star CPU cost, and the grid stays glued
  // to them because both use the SAME rotation.
  const wantEqGrid = st.flags.eqgrid && !st.flags.edit;
  const eqjToEnu = (useGL || wantEqGrid)
    ? eqjToEnuMatrix(horToEqjRotation(makeObserver(st.location.lat, st.location.lng),
        makeTime(st.time.instant ? new Date(st.time.instant) : new Date())))
    : null;
  if (useGL) {
    starfield.resize(view.width, view.height, window.devicePixelRatio || 1);
    starfield.setStarMatrix(eqjToEnu);
    const focal = focalPx(st.fov, view.width, view.height); // px per radian at screen centre
    const sphereLabels = new Set();
    const bodyList = [];
    for (const bi of bodyInputs) {
      const m = markers.find((x) => x.label === bi.label);
      if (!m) continue;
      const dotR = markerRadius(m, cam);                       // current glow-dot radius (px)
      const scale = bi.label === 'Moon' ? 1 : PLANET_SCALE;    // the Moon is always true-scale
      const rPx = bi.angularRadiusDeg * (Math.PI / 180) * focal * scale;
      const span = bi.ring ? bi.ring.OUTER : 1;                // rings widen the on-screen footprint
      if (bi.label !== 'Moon' && rPx * span <= dotR) continue; // too small -> leave it as a glow dot
      // Below-horizon bodies ride the same fade as the star/marker shaders — without this the
      // Moon's sphere pass drew at full brightness under a hidden horizon.
      const bodyFade = m.altaz.alt < 0 ? belowFade : 1;
      if (bodyFade <= 0) continue;
      const o = bodyScreenOrientation(cam, bi.bodyDir, bi.sunDir, bi.poleDir);
      const radiusPx = rPx;                                    // true projected size for every sphere
      // Sub-observer point: the Moon's true libration (vendor), or the planet's geometric axial tip
      // (sub-observer latitude = asin of the pole's component toward us — Saturn's globe matches its rings).
      const subLatDeg = bi.libration ? bi.libration.latDeg
        : (Math.asin(Math.max(-1, Math.min(1, ringOpening(bi.bodyDir, bi.poleDir)))) * 180) / Math.PI;
      // Lunar eclipse: Earth's shadow into the shader's disc frame — centre offset in globe radii
      // (x right, y up; canvas y points down, hence the flip), radii as multiples of the Moon's.
      let lunShadow = null;
      if (bi.shadow) {
        const proj = createProjector(cam);
        const pm = proj(m.altaz.az, m.altaz.alt);
        const ps = proj(bi.shadow.altaz.az, bi.shadow.altaz.alt);
        if (pm.visible && ps.visible) {
          lunShadow = [(ps.x - pm.x) / radiusPx, (pm.y - ps.y) / radiusPx,
            bi.shadow.umbraDeg / bi.angularRadiusDeg, bi.shadow.penumbraDeg / bi.angularRadiusDeg];
        }
      }
      bodyList.push({
        texKey: bi.texKey, tint: bi.tint, dir: bi.bodyDir, radiusPx, fade: bodyFade, veilScale: bi.veilScale,
        lunarShadow: lunShadow,
        phaseAngleDeg: bi.phaseAngleDeg, brightLimbAngle: o.brightLimbAngle, northAngle: o.northAngle,
        subLatDeg, subLonDeg: bi.libration ? bi.libration.lonDeg : 0,
        quadScale: span,
        ringTilt: bi.ring ? ringOpening(bi.bodyDir, bi.poleDir) : 0,
        ringRadii: bi.ring ? [bi.ring.INNER, bi.ring.OUTER] : null,
        ringTexKey: bi.ring ? bi.ring.TEX : null,
      });
      sphereLabels.add(bi.label);
    }
    resolvedPlanets = sphereLabels;
    starfield.setBodies(bodyList);
    // Planetary moons: labeled glow dots, only once their planet has resolved into a disc.
    // Render-local pseudo-markers (NOT in the module markers array) so body/conjunction code
    // never sees them; picking mirrors this gate via resolvedPlanets. Occulted moons (behind
    // the disc) are hidden, transiting ones stay drawn.
    const moonMarkers = st.flags.edit ? [] : visibleMoons(sphereLabels)
      .map((m) => ({
        altaz: m.altaz, label: m.name, color: '#d8cfc0',
        mag: m.mag, alpha: markerAlpha(m.mag), radius: planetRadius(m.mag),
      }));
    drawList = st.flags.edit ? [] : markers.concat(moonMarkers, cometMarkers);
    starfield.draw(cam, { belowFade, edit: st.flags.edit });
    // Sun/Moon/planets as glowing discs: size from markerRadius (angular for Sun/Moon, disk for
    // planets), tint from the body's colour, brightness from magnitude. Hidden in edit mode.
    const glMarkers = drawList
      .filter((m) => !sphereLabels.has(m.label))   // spheres (Moon + zoomed-in planets) draw via the body pass
      .map((m) => ({
        az: m.altaz.az, alt: m.altaz.alt, color: m.color,
        radiusPx: markerRadius(m, cam), alpha: m.alpha,
      }));
    starfield.drawMarkers(glMarkers, cam, { belowFade });
  }
  drawScene(ctx, {
    stars: skyObjects,
    markers: drawList,   // hide Sun/Moon/planets in edit mode so they don't overlap stars
    constellations: visibleCons,
    cam,
    edit: st.flags.edit,
    labels: st.flags.labels,
    grid: st.flags.grid && !st.flags.edit,   // hide the grid in edit mode to keep the figure clear
    eqGrid: wantEqGrid ? eqjToEnu : null,    // RA/Dec grid rides the same per-frame rotation as the stars
    belowFade,                               // below-horizon content fades in as the aim dips
    drawStarPoints: !useGL,                  // GL draws the star discs; 2D only as the fallback
    drawMarkerDiscs: !useGL,                 // GL draws the marker discs; 2D keeps only their labels
    dsos: st.flags.edit ? [] : dsoObjects,   // deep-sky glow/symbols (hidden in edit mode)
    deepsky: st.flags.deepsky,
    selectedDsoId: highlighted && highlighted.kind === 'dso' ? highlighted.id : null,
    selectedStarId: highlighted && highlighted.kind === 'star' ? highlighted.id : null,
  });
  // In GL mode the star discs live on the GL canvas, so their labels are drawn here, after the
  // constellation lines (so labels sit on top), matching the old single-canvas order.
  if (useGL) drawStarLabels(ctx, skyObjects, createProjector(cam), cam, st.flags.labels, belowFade);
  if (!st.flags.edit) drawCorona(ctx, cam);
  drawHud(ctx, cam);
  if (st.flags.edit) drawEditOverlay(ctx, cam);
  drawHighlight(ctx, cam);
  // Live mode: self-sustaining render loop (one render per animation frame) so the sky moves smoothly —
  // the GPU stars get a fresh matrix and the frequent recompute (~3 ms: markers, spheres, lines, labels)
  // runs per frame. Ends the moment live is switched off; rAF itself pauses in background tabs.
  if (useGL && st.time.live) { skyDirty = true; requestRender(); }
}

const requestRender = createRenderScheduler(render, (cb) => requestAnimationFrame(cb));

function requestRecompute() { skyDirty = true; requestRender(); }
function requestFullRecompute() { fullDirty = true; skyDirty = true; requestRender(); }

function saveFigures() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(FIGURES_KEY, JSON.stringify({ base: loadedRaw, figures })); } catch { /* ignore */ }
}

function onEditTap(x, y) {
  ensureFreshPickData();
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
  return { observer, time, eclipse, fav: favorites, inspect: onInspectObject, onClose: () => { highlighted = null; requestRender(); } };
}

// Picking reads the CPU skyObjects array, which can lag the live GPU stars. If the sidereal drift since
// the last full recompute could exceed half the pick radius at the CURRENT zoom, refresh it first
// (~100 ms, one-off). 0.00418 deg/s is the worst-case (equatorial) sidereal rate.
function ensureFreshPickData() {
  const st = store.getState();
  const ms = (st.time.instant ? new Date(st.time.instant) : new Date()).getTime();
  const locChanged = !skyStamp || skyStamp.lat !== st.location.lat || skyStamp.lng !== st.location.lng;
  const driftDeg = skyStamp ? (Math.abs(ms - skyStamp.ms) / 1000) * 0.00418 : Infinity;
  const pickRadiusDeg = 18 * (st.fov / Math.min(canvas.clientWidth, canvas.clientHeight)); // fov spans the shorter dimension (see focalPx)
  if (locChanged || driftDeg > pickRadiusDeg * 0.5) { computeSky(true); fullDirty = false; } // full just ran; don't repeat it next render
}

// Outside edit mode, a tap identifies the nearest visible object and opens its card.
function onIdentifyTap(x, y) {
  ensureFreshPickData();
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
    ...cometObjects.filter((c) => c.altaz && c.mag <= COMET_MARKER_MAG),
    ...visibleMoons(resolvedPlanets).map(moonPick),
  ].filter((o) => o.altaz.alt >= 0 // faded-in below-horizon objects are pickable too, incl. the
    // fully revealed hemisphere while a below-horizon selection holds the fade open (see render).
    || (highlighted && highlighted.altaz && highlighted.altaz.alt < 0)
    || belowHorizonFade(st.aim.alt) > 0.05);
  const projected = candidates.map((o) => { const p = projector(o.altaz.az, o.altaz.alt); return { x: p.x, y: p.y, visible: p.visible, ref: o }; });
  const hit = pickNearest(projected, x, y, 18);
  if (hit) {
    highlighted = hit;
    openCard(hit, cardCtx(observer, time, eclipseForCard(hit.kind)));
    requestRender();
  }
  else { highlighted = null; closeCard(); requestRender(); }
}

// The eclipse to attach to a Moon card: the live timeline if one's in progress, else the next one,
// so the eclipse shows whether you tap, search, or Find the Moon. Null for any non-Moon object.
function eclipseForMoon(kind) {
  if (kind !== 'moon') return null;
  if (eclipseCtx.inProgress) return { ...eclipseCtx.inProgress, live: true };
  if (eclipseCtx.next) return { ...eclipseCtx.next, live: false };
  return null;
}

// Same idea for the Sun card: the local solar eclipse in progress, else the next one from here.
function eclipseForSun(kind) {
  if (kind !== 'sun') return null;
  if (solarEclipseCtx.inProgress) return { ...solarEclipseCtx.inProgress, live: true };
  if (solarEclipseCtx.next) return { ...solarEclipseCtx.next, live: false };
  return null;
}

// The eclipse context a card should carry, by the picked object's kind (null for everything else).
function eclipseForCard(kind) {
  return kind === 'sun' ? eclipseForSun(kind) : eclipseForMoon(kind);
}

// Current alt/az for the selected object, re-resolved from the freshly recomputed arrays so the
// highlight ring tracks it as time advances. Stars/DSOs match by id, Sun/Moon/planets by label.
// Null if it can't be matched (e.g. an object that's no longer in the catalogue).
function liveAltAzFor(sel) {
  if (sel.kind === 'star') { const s = skyObjects.find((o) => o.id === sel.id); return s ? s.altaz : null; }
  if (sel.kind === 'dso') { const d = dsoObjects.find((o) => o.id === sel.id); return d ? d.altaz : null; }
  if (sel.kind === 'planet-moon') { const m = planetMoons.find((o) => o.name === sel.label); return m ? m.altaz : null; }
  const m = markers.find((o) => o.label === sel.label); // moon / sun / planet
  return m ? m.altaz : null;
}

// Resolve a favorites record (or search entry) to a live card-ready pick, or null if it's not in
// the current catalog arrays. Stars/DSOs match by id, bodies by label.
function resolveFavorite(rec) {
  if (rec.kind === 'star') {
    const s = skyObjects.find((o) => o.id === rec.id);
    return s ? { kind: 'star', id: s.id, name: s.name, mag: s.mag, bv: s.bv, con: s.con, dist: s.dist, altaz: s.altaz } : null;
  }
  if (rec.kind === 'dso') return dsoObjects.find((o) => o.id === rec.id) || null;
  if (rec.kind === 'comet') {
    const c = cometObjects.find((o) => o.id === rec.id);
    return c && c.altaz ? c : null; // out-of-coverage comets drop from rows/go-to but stay stored
  }
  if (rec.kind === 'planet-moon') {
    const m = planetMoons.find((o) => o.name === rec.label);
    return m ? moonPick(m) : null;
  }
  const m = markers.find((o) => o.label === rec.label);
  if (!m) return null;
  const kind = m.label === 'Moon' ? 'moon' : m.label === 'Sun' ? 'sun' : 'planet';
  return { kind, label: m.label, body: m.body, mag: m.mag, altaz: m.altaz };
}

// Naked-eye threshold for a comet to join the screensaver tour. Stricter than
// COMET_MARKER_MAG (the app draws comets down to binocular mag 9, but dwelling on a
// barely-there dot is no show).
const SCREENSAVER_COMET_MAG = 6;

// Candidate targets for the screensaver tour. Each carries a live alt-az resolver so the
// eligibility checks and the per-frame chase both track the time-lapse. The Sun is
// excluded (daytime is skipped anyway) and so is untextured Pluto (mag ~14.5 — dwelling
// on a barely-there dot is no show).
function screensaverCandidates() {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const atDate = st.time.instant ? new Date(st.time.instant) : new Date();
  const atNow = makeTime(atDate);
  // A lunar eclipse with its umbral phase underway at the viewed time makes the Moon the
  // must-see (the disc turns coppery in Earth's shadow). Searching from 2 days back
  // catches an eclipse already in progress.
  const ec = searchLunarEclipse(new Date(atDate.getTime() - 2 * 86400000));
  const eclipseNow = !!(ec.contacts.partialBegin && ec.contacts.partialEnd
    && atDate >= ec.contacts.partialBegin && atDate <= ec.contacts.partialEnd);
  const bodyCandidate = (name, body, priority = false) => ({
    type: 'body', name, priority,
    altAzAt: (d) => altAzOfBody(body, observer, makeTime(d)),
    angularRadiusDeg: bodyAngularRadiusDeg(body, observer, atNow),
  });
  const starAt = (ra, dec) => (d) => altAzOfStar(ra, dec, observer, makeTime(d));
  // Out-of-coverage comets resolve to a below-nadir sentinel: never eligible.
  const cometAt = (id) => (d) => {
    const c = cometsAltAz(observer, makeTime(d)).find((o) => o.id === id);
    return c && c.altaz ? c.altaz : { az: 0, alt: -90 };
  };
  return [
    bodyCandidate('Moon', Body.Moon, eclipseNow),
    ...PLANETS.filter((p) => p.tex).map((p) => bodyCandidate(p.name, p.body)),
    ...cometsAltAz(observer, atNow)
      .filter((c) => c.altaz && c.mag != null && c.mag <= SCREENSAVER_COMET_MAG)
      .map((c) => ({ type: 'comet', name: c.name, altAzAt: cometAt(c.id) })),
    ...dsos.map((d) => ({ type: 'dso', name: d.name, sizeArcmin: d.sizeArcmin, altAzAt: starAt(d.ra, d.dec) })),
    ...figures.map((f) => {
      const [ra, dec] = labelOf(f);
      return { type: 'constellation', name: f.name, altAzAt: starAt(ra, dec) };
    }),
    ...stars.filter((s) => s.name && s.mag <= 1.5).map((s) => ({ type: 'star', name: s.name, altAzAt: starAt(s.ra, s.dec) })),
  ];
}

// Panel rows for the current favorites: resolved live positions; unresolvable records (stale
// catalog ids) are dropped from display but kept in storage.
function buildFavoriteRows() {
  return favorites.list()
    .map((rec) => {
      const obj = resolveFavorite(rec);
      return obj ? { rec, name: displayName(rec), altaz: obj.altaz } : null;
    })
    .filter(Boolean);
}

// skyObjects entries for the star(s) the UI tracks live: the highlighted (carded) star and the
// lock-on follow target. The frequent pass refreshes their positions so the ring/aim stay glued to
// the per-frame GPU stars. At most two finds, and only while a star is actually selected.
function selectionStars() {
  const ids = new Set();
  if (highlighted && highlighted.kind === 'star') ids.add(highlighted.id);
  if (followTarget && followTarget.kind === 'star') ids.add(followTarget.id);
  return [...ids].map((id) => skyObjects.find((o) => o.id === id)).filter(Boolean);
}

// Keep the selection's highlight ring (and its open card) pinned to the object's live position as the
// sky advances. Called at the end of each computeSky. Bare find-aims (shower radiant / conjunction
// midpoint) have no `kind` and stay put — they're transient and barely drift.
function syncSelection() {
  if (!highlighted || !highlighted.kind) return;
  if (highlighted.kind === 'comet') {
    // Comets refresh the whole pick: mag/distances change with the viewed time, and altaz can
    // legitimately become null (scrubbed outside coverage) — the card copes with both.
    const c = cometObjects.find((o) => o.id === highlighted.id);
    if (c) Object.assign(highlighted, c);
  } else if (highlighted.kind === 'planet-moon') {
    // Planet-moon picks refresh the whole pick so behind (and altaz) stay live — scrubbing time
    // forward otherwise leaves the card's "hidden behind X" note frozen at open time.
    const m = planetMoons.find((o) => o.name === highlighted.label);
    if (m) Object.assign(highlighted, moonPick(m));
  } else {
    const altaz = liveAltAzFor(highlighted);
    if (altaz) highlighted.altaz = altaz;          // ring follows the object
  }
  if (!isCardOpen()) return;                       // refresh the card's where-now / distance / phase readouts
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  openCard(highlighted, cardCtx(observer, time, eclipseForCard(highlighted.kind)));
}

// How far ahead a coming solar eclipse earns the banner. Solar eclipses are daytime events that a
// night-time stargazer would otherwise never see coming, and rare enough to outrank a shower.
const SOLAR_ECLIPSE_NOTICE_MS = 2 * 86400000;

// The single most notable thing happening, for the always-visible banner. Priority: in-progress
// solar eclipse > in-progress lunar eclipse > solar eclipse within 2 days > shower at peak >
// closest conjunction > nothing. (The "next eclipse" readouts live on the Sun/Moon cards.)
function buildTonightEvent() {
  if (solarEclipseCtx.inProgress) return solarEclipseEvent(solarEclipseCtx.inProgress, true);
  if (eclipseCtx.inProgress) {
    const e = eclipseCtx.inProgress;
    const kindWord = e.kind === 'total' ? 'Total' : 'Partial';
    return {
      text: `🌑 ${kindWord} lunar eclipse — happening now. The Moon is in Earth's shadow.`,
      actionLabel: 'Find',
      onAction: () => onJumpToEclipse(e),
    };
  }
  const soon = solarEclipseCtx.next;
  if (soon) {
    const st = store.getState();
    const at = st.time.instant ? new Date(st.time.instant) : new Date();
    if (soon.peak.getTime() - at.getTime() <= SOLAR_ECLIPSE_NOTICE_MS) return solarEclipseEvent(soon, false);
  }
  if (tonightShower) return showerEvent(tonightShower);
  if (conjunctions.length) return conjunctionEvent(conjunctions[0]);
  return null;
}

// Banner for a solar eclipse, live ("happening now") or imminent (peak within the notice window).
function solarEclipseEvent(e, live) {
  const kindWord = e.kind === 'total' ? 'Total' : e.kind === 'annular' ? 'Annular' : 'Partial';
  const pct = Math.round(e.obscuration * 100);
  const text = live
    ? `🌞 ${kindWord} solar eclipse — happening now. The Moon covers ${pct}% of the Sun at peak.`
    : `🌞 ${kindWord} solar eclipse from here ${e.peak.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${e.peak.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${pct}% of the Sun covered.`;
  return { text, actionLabel: 'Find', onAction: () => onJumpToSolarEclipse(e) };
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

// Jump to a solar eclipse: set time to its peak, center the Sun, open the Sun card with the
// timeline. Zoomed close enough that the true-scale Moon disc visibly covers the Sun's.
function onJumpToSolarEclipse(e) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(e.peak);
  const altaz = altAzOfBody(Body.Sun, observer, time);
  const pick = { kind: 'sun', label: 'Sun', body: Body.Sun, altaz };
  store.setTime(e.peak, false);              // jump the clock to peak (triggers recompute)
  highlighted = pick;
  openCard(pick, cardCtx(observer, time, { ...e, live: true }));
  animateSlew(store, { az: altaz.az, alt: altaz.alt, fov: Math.max(2, Math.min(st.fov, 8)) });
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
// the sky). Aiming below the horizon fades in a radiant that hasn't risen yet.
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
  if (pick.kind === 'comet') return { kind: 'comet', id: pick.id };
  if (pick.kind === 'planet-moon') return { kind: 'planet-moon', label: pick.label };
  if (pick.kind === 'moon' || pick.kind === 'sun' || pick.kind === 'planet') return { kind: 'body', label: pick.label };
  return null;
}

// Current alt/az of the followed object, re-found in the freshly recomputed arrays, or null.
function resolveFollowAltAz() {
  if (!followTarget) return null;
  if (followTarget.kind === 'star') { const s = skyObjects.find((o) => o.id === followTarget.id); return s ? s.altaz : null; }
  if (followTarget.kind === 'body') { const m = markers.find((o) => o.label === followTarget.label); return m ? m.altaz : null; }
  if (followTarget.kind === 'dso') { const d = dsoObjects.find((o) => o.id === followTarget.id); return d ? d.altaz : null; }
  if (followTarget.kind === 'comet') { const c = cometObjects.find((o) => o.id === followTarget.id); return c && c.altaz ? c.altaz : null; }
  if (followTarget.kind === 'planet-moon') { const m = planetMoons.find((o) => o.name === followTarget.label); return m ? m.altaz : null; }
  if (followTarget.kind === 'constellation') { const c = constellations.find((o) => o.name === followTarget.name); return c ? c.label : null; }
  return null;
}

// Focus an object: open the card, lock on (keep it centred as time changes), slew to it.
function focusObject(pick, targetFov) {
  if (!pick.altaz) return; // position-less pick (comet outside its orbit-data coverage): nothing to aim at
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  highlighted = pick;
  followTarget = followIdentity(pick); // lock on: keep it centred as the clock changes
  openCard(pick, cardCtx(observer, time, eclipseForCard(pick.kind)));
  animateSlew(store, { az: pick.altaz.az, alt: pick.altaz.alt, fov: targetFov });
}

// Moons zoom to frame planet + moon (their dots only draw once the planet resolves into a
// disc, so the gentle search zoom would land on empty sky); falls back to a tight default
// if the planet marker is missing.
// Uses Math.min of frameFovDeg (frames the pair) and planetResolveFovDeg (guarantees the
// planet passes the render sphere gate) so we never land on an unresolved glow dot.
function moonGotoFov(pick) {
  const planet = markers.find((m) => m.label === pick.planet);
  const frameFov = frameFovDeg(planet ? altazSepDeg(planet.altaz, pick.altaz) : 0.125);
  if (!planet) return frameFov;
  const bi = bodyInputs.find((b) => b.label === pick.planet);
  if (!bi) return frameFov;
  const dotR = planetRadius(planet.mag);
  const minDim = Math.min(canvas.clientWidth, canvas.clientHeight);
  const span = bi.ring ? bi.ring.OUTER : 1;
  const resolveFov = planetResolveFovDeg(bi.angularRadiusDeg, dotR, minDim, PLANET_SCALE, span);
  return Math.min(frameFov, resolveFov);
}

// Find (search): open the card and ease the zoom in a notch.
function onFindObject(pick) {
  const fov = pick.kind === 'planet-moon' ? moonGotoFov(pick)
    : Math.max(12, Math.min(store.getState().fov, 20));
  focusObject(pick, fov);
}

// Go-to zoom per kind: planets close enough that their moons resolve; Moon/Sun framed; stars and
// DSOs wider. Tuned by eye.
const GOTO_FOV = { planet: 0.5, moon: 1.5, sun: 1.5, star: 2, dso: 4, comet: 4 };

// A favorites row was clicked: same as Find, but zoomed to the kind's close-up FOV.
function onGoToFavorite(rec) {
  const obj = resolveFavorite(rec);
  if (!obj) return;
  focusObject(obj, obj.kind === 'planet-moon' ? moonGotoFov(obj) : (GOTO_FOV[obj.kind] || 2));
}

// Eye-button zoom: for a body with a disc, the FOV that makes the disc span a set fraction of the
// screen (planets large, Moon/Sun a bit smaller so the whole face fits comfortably); point-like
// kinds get a fixed deep zoom. setFov clamps to MIN_FOV, so small planets just bottom out fully
// zoomed. Tuned by eye.
const INSPECT_FILL = { planet: 0.6, moon: 0.5, sun: 0.5 }; // fraction of the view the disc spans
const INSPECT_FOV = { star: 1, dso: 1.5, comet: 1.5, 'planet-moon': 0.3 }; // no disc: fixed deep zoom

function inspectFov(kind, radiusDeg) {
  const fill = INSPECT_FILL[kind];
  if (fill && radiusDeg != null) return (2 * radiusDeg) / fill;
  return INSPECT_FOV[kind] || 1;
}

// The card's eye button: same lock-on flow as the favorites go-to, zoomed all the way in.
function onInspectObject(pick) {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const radius = pick.body ? bodyAngularRadiusDeg(pick.body, observer, time) : null;
  // For planet-moons, clamp to moonGotoFov so the eye button never zooms OUT to a wider
  // FOV that would un-resolve the planet (e.g. when moonGotoFov < 0.3 for distant planets).
  const fov = pick.kind === 'planet-moon'
    ? Math.min(INSPECT_FOV['planet-moon'], moonGotoFov(pick))
    : inspectFov(pick.kind, radius);
  focusObject(pick, fov);
}

// Search result chosen: resolve it to a live object and reuse Find (slew + card). Constellations
// have no info card, so they just slew to their centroid with a highlight ring.
function onSearchSelect(entry) {
  if (entry.type === 'constellation') {
    const c = constellations.find((o) => o.name === entry.ref);
    if (c && c.label) {
      highlighted = { altaz: c.label };
      followTarget = { kind: 'constellation', name: c.name }; // lock on its label point
      const st = store.getState();
      animateSlew(store, { az: c.label.az, alt: c.label.alt, fov: Math.max(12, Math.min(st.fov, 20)) });
    }
    return;
  }
  const rec = entry.type === 'body' ? { kind: 'body', label: entry.ref }
    : entry.type === 'planet-moon' ? { kind: 'planet-moon', label: entry.ref }
    : { kind: entry.type, id: entry.ref };
  const obj = resolveFavorite(rec);
  if (obj) { onFindObject(obj); return; }
  // A comet outside its orbit-data coverage has no position: open its card (which explains the
  // data range) without slewing or locking on.
  if (entry.type === 'comet') {
    const c = cometObjects.find((o) => o.id === entry.ref);
    if (!c) return;
    const st = store.getState();
    const observer = makeObserver(st.location.lat, st.location.lng);
    const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
    highlighted = c;
    followTarget = null;
    openCard(c, cardCtx(observer, time));
    requestRender();
  }
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
    if (figures[editIndex]) console.log(`[cosmodial] editing: ${figures[editIndex].name}`);
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
    console.log(`[cosmodial] editing: ${figures[editIndex].name}`);
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

// Totality corona: a soft RING hugging the Sun's limb, drawn on the 2D overlay (which sits above
// the GL canvas) with a transparent centre — the Moon's black disc shows through the hole. Fades
// in across the last ~1.5% of coverage, exactly as the Sun's own glow (alpha = 1 - obscuration)
// fades out. A filled additive GL marker can't do this: it would paint glow OVER the silhouette.
function drawCorona(ctx, cam) {
  if (eclipseObscuration <= 0.985) return;
  const sun = markers.find((m) => m.label === 'Sun');
  if (!sun) return;
  const p = createProjector(cam)(sun.altaz.az, sun.altaz.alt);
  if (!p.visible) return;
  const limb = markerRadius({ angularRadiusDeg: sun.angularRadiusDeg, label: '' }, cam); // TRUE disc radius (px)
  const outer = Math.max(limb * 3.2, 14); // keep totality legible even zoomed way out
  const a = 0.85 * Math.min(1, (eclipseObscuration - 0.985) / 0.015);
  const stop = Math.min(limb / outer, 0.95); // where the ring peaks: the limb
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outer);
  g.addColorStop(Math.max(0, stop - 0.05), 'rgba(228, 233, 245, 0)'); // transparent centre
  g.addColorStop(stop, `rgba(228, 233, 245, ${a})`);
  g.addColorStop(Math.min(1, stop + 0.12), `rgba(228, 233, 245, ${a * 0.35})`);
  g.addColorStop(1, 'rgba(228, 233, 245, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawHighlight(ctx, cam) {
  if (!highlighted || !highlighted.altaz) return;
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
    if (useGL) starfield.uploadStarsJ2000(stars); // J2000 attrs upload ONCE; per-frame motion is the matrix uniform
  } catch (err) {
    console.error('[cosmodial] Failed to load star catalogue:', err);
  }
  let loaded = [];
  try {
    const cres = await fetch('./data/constellations.json');
    if (!cres.ok) throw new Error(`constellations.json: HTTP ${cres.status}`);
    loaded = await cres.json();
  } catch (err) {
    console.error('[cosmodial] Failed to load constellations:', err);
  }
  try {
    const dres = await fetch('./data/dso.json');
    if (!dres.ok) throw new Error(`dso.json: HTTP ${dres.status}`);
    dsos = await dres.json();
  } catch (err) {
    console.error('[cosmodial] Failed to load deep-sky catalogue:', err);
  }
  loadedRaw = loaded;
  const saved = loadSavedFigures(loaded);
  figures = saved || splitSegments(loaded);
  originalFigures = splitSegments(loaded);
  store.subscribe(requestRender);
  let prevLoc = '', prevTime = '';
  let settleTimer = 0;
  store.subscribe(() => {
    const s = store.getState();
    const lk = `${s.location.lat},${s.location.lng}`;
    const tk = s.time.live ? 'live' : String(s.time.instant);
    if (lk !== prevLoc) { prevLoc = lk; prevTime = tk; requestFullRecompute(); return; }
    if (tk !== prevTime) {
      prevTime = tk;
      requestRecompute(); // frequent only -> scrubbing stays smooth (~2 ms per tick)
      clearTimeout(settleTimer);
      settleTimer = setTimeout(requestFullRecompute, 350); // events/favorites/pick array once the scrub settles
    }
  });
  setInterval(() => { if (store.getState().time.live) requestFullRecompute(); }, 30000); // events/favorites/pick array (and the 2D fallback's whole live refresh)
  store.subscribe(onEditToggle);
  window.addEventListener('resize', requestRender);
  attachInput(canvas, store, { onTap, onAction: onEditAction, onViewDrag: () => { followTarget = null; } });
  const controls = document.getElementById('controls');
  const bodyLabels = ['Moon', 'Sun', ...PLANETS.map((p) => p.name)];
  const search = buildSearch(buildSearchIndex(stars, figures, bodyLabels, dsos, COMETS, PLANET_MOONS), { onSelect: onSearchSelect });
  // Screenshot: re-render synchronously, then composite GL sky + 2D overlay in the SAME task —
  // the GL context has no preserveDrawingBuffer, so its pixels only survive until the task ends.
  const onScreenshot = () => {
    render();
    saveComposite(useGL ? [glCanvas, canvas] : [canvas], canvas.width, canvas.height, screenshotName());
  };
  const menu = buildMenu(store, { onScreenshot, onScreensaver: () => screensaver.start() });
  const skyToggles = buildSkyToggles(store);
  const screensaver = createScreensaver(store, {
    getCandidates: screensaverCandidates,
    sunAltAt: (d) => {
      const st = store.getState();
      return altAzOfBody(Body.Sun, makeObserver(st.location.lat, st.location.lng), makeTime(d)).alt;
    },
    nextDusk: (d) => {
      const st = store.getState();
      return nextSunBelowAlt(makeObserver(st.location.lat, st.location.lng), d, DUSK_SUN_ALT);
    },
    setUiHidden: (on) => {
      if (on) { closeCard(); highlighted = null; followTarget = null; }
      document.body.classList.toggle('screensaver', on);
    },
    // Wake-up listeners: capture-phase on window so the waking input never reaches the
    // app. pointermove deliberately excluded (a nudged mouse shouldn't end the show), and
    // the click that follows the waking pointerdown is swallowed so it can't press a
    // just-restored button.
    bindExit: (onExit) => {
      const swallowClick = (e) => { e.preventDefault(); e.stopPropagation(); };
      const wake = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'pointerdown') window.addEventListener('click', swallowClick, { capture: true, once: true });
        onExit();
      };
      window.addEventListener('pointerdown', wake, true);
      window.addEventListener('keydown', wake, true);
      window.addEventListener('wheel', wake, { capture: true, passive: false });
      return () => {
        window.removeEventListener('pointerdown', wake, true);
        window.removeEventListener('keydown', wake, true);
        window.removeEventListener('wheel', wake, { capture: true });
      };
    },
  });
  if (controls) controls.append(menu.el, ...skyToggles, search.el, buildTimeControls(store));
  // Thin screens: the emoji sky toggles (🌅 🌙 📱) leave the bar for the menu's Sky section so the
  // search box keeps its width; they move back when the viewport widens (rotation, window resize).
  // Moving the same DOM nodes preserves their listeners and on/off state either way.
  const thinBar = window.matchMedia('(max-width: 640px)');
  const placeSkyToggles = () => {
    if (thinBar.matches) menu.skyRow.append(...skyToggles);
    else menu.el.after(...skyToggles);
    menu.skySection.hidden = !thinBar.matches;
  };
  placeSkyToggles();
  thinBar.addEventListener('change', placeSkyToggles);
  // Night mode also tints the whole document (the toggle button's own state is handled in menu.js).
  const applyNight = () => document.body.classList.toggle('night', store.getState().flags.night);
  store.subscribe(applyNight);
  applyNight();
  // The atmo flag is consumed inside computeSky (sky params), so flipping it must mark the sky
  // dirty — a bare re-render would redraw with the stale params (visible when time is paused).
  let prevAtmo = store.getState().flags.atmo;
  store.subscribe(() => {
    const a = store.getState().flags.atmo;
    if (a !== prevAtmo) { prevAtmo = a; requestRecompute(); }
  });
  favPanel = buildFavoritesPanel({ onGoTo: onGoToFavorite, onRemove: (rec) => favorites.toggle(rec) });
  // Star/unstar refreshes the list AND any open card (its ☆/★ would otherwise stay stale while paused).
  favorites.onChange(() => { favPanel.setRows(buildFavoriteRows()); syncSelection(); });
  const favHost = document.getElementById('favorites-host');
  if (favHost) favHost.append(favPanel.el);
  requestRender();
  // One frame past the first render (live arrays populated): lift the boot splash, and honor a
  // shared ?obj=kind:id link by replaying it through the search-select path — the link lands on
  // the object exactly as if it had been searched for.
  const splash = document.getElementById('boot-splash');
  const sharedEntry = parseShareParam(new URLSearchParams(window.location.search).get('obj'));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (splash) {
      splash.classList.add('done');
      setTimeout(() => splash.remove(), 500);
    }
    if (sharedEntry) {
      onSearchSelect(sharedEntry);
      // Consume the param: the address bar goes back to the clean app URL (other params, e.g.
      // ?nogl, survive), and a reload/bookmark doesn't keep re-focusing the shared object.
      const params = new URLSearchParams(window.location.search);
      params.delete('obj');
      const qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }
  }));
}

boot();
