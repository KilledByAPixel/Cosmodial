import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body } from './core/astro.js';
import { drawScene, resizeCanvas } from './render/sky.js';
import { createRenderScheduler } from './core/scheduler.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const store = createState();

let stars = [];        // raw catalogue from stars.json
let skyObjects = [];   // { altaz, mag, bv, name } for the current time/location
let markers = [];      // Sun/Moon { altaz, label, color }

// Recompute alt/az for every object. Depends only on time + location (no UI for those yet, so
// this runs once at boot; Plan 4's time controls will call it again when the clock changes).
function computeSky() {
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  skyObjects = stars.map((s) => ({
    altaz: altAzOfStar(s.ra, s.dec, observer, time),
    mag: s.mag, bv: s.bv, name: s.name,
  }));
  markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8' },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f' },
  ];
}

function render() {
  const view = resizeCanvas(canvas);
  const st = store.getState();
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, width: view.width, height: view.height };
  drawScene(ctx, { stars: skyObjects, markers, cam });
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
  computeSky();
  store.subscribe(requestRender);
  window.addEventListener('resize', requestRender);
  requestRender();
}

boot();
