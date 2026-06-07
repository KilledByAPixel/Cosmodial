import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body, bodyMagnitude } from './core/astro.js';
import { PLANETS, planetRadius } from './render/planets.js';
import { drawScene, resizeCanvas } from './render/sky.js';
import { drawHud } from './render/hud.js';
import { createRenderScheduler } from './core/scheduler.js';
import { attachInput } from './ui/input.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon/planet markers { altaz, label, color, radius }
let constellationData = [];   // raw RA/Dec polylines from constellations.json
let constellations = [];      // cached alt/az for the current time/location

// Recompute alt/az for every object. Depends only on time + location (no UI for those yet, so
// this runs once at boot; Plan 4's time controls will call it again when the clock changes — and
// must call requestRender() afterward, since time isn't in the store and nothing re-renders on its own).
function computeSky() {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  skyObjects = stars.map((s) => ({
    altaz: altAzOfStar(s.ra, s.dec, observer, time),
    mag: s.mag,
    bv: s.bv,
    name: s.name,
  }));
  const planetMarkers = PLANETS.map((p) => ({
    altaz: altAzOfBody(p.body, observer, time),
    label: p.name,
    color: p.color,
    radius: planetRadius(bodyMagnitude(p.body, time)),
  }));
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8', radius: 5 },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f', radius: 6 },
    ...planetMarkers,
  ];
  constellations = constellationData.map((c) => ({
    name: c.name,
    label: altAzOfStar(c.label[0], c.label[1], observer, time),
    lines: c.lines.map((poly) => poly.map(([ra, dec]) => altAzOfStar(ra, dec, observer, time))),
  }));
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
}

const requestRender = createRenderScheduler(render, (cb) => requestAnimationFrame(cb));

async function boot() {
  try {
    const res = await fetch('./data/stars.json');
    if (!res.ok) throw new Error(`stars.json: HTTP ${res.status}`);
    stars = await res.json();
  } catch (err) {
    console.error('[skyscope] Failed to load star catalogue:', err);
  }
  try {
    const cres = await fetch('./data/constellations.json');
    if (!cres.ok) throw new Error(`constellations.json: HTTP ${cres.status}`);
    constellationData = await cres.json();
  } catch (err) {
    console.error('[skyscope] Failed to load constellations:', err);
  }
  computeSky();                 // must run before subscribe/first render so the sky isn't blank
  store.subscribe(requestRender);
  window.addEventListener('resize', requestRender);
  attachInput(canvas, store);
  requestRender();
}

boot();
