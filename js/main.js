import { createState } from './core/state.js';
import { makeObserver, altAzOfStar, altAzOfBody, makeTime, Body } from './core/astro.js';
import { drawScene, resizeCanvas } from './render/sky.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const store = createState();

let stars = [];

function render() {
  const view = resizeCanvas(canvas);
  const st = store.getState();
  const observer = makeObserver(st.location.lat, st.location.lng);
  const time = makeTime(st.time.instant ? new Date(st.time.instant) : new Date());
  const cam = { az: st.aim.az, alt: st.aim.alt, fov: st.fov, width: view.width, height: view.height };

  const projectedStars = stars.map((s) => ({
    altaz: altAzOfStar(s.ra, s.dec, observer, time),
    mag: s.mag,
    bv: s.bv,
  }));

  // M0 validation markers: Sun and Moon as labeled dots.
  const markers = [
    { altaz: altAzOfBody(Body.Moon, observer, time), label: 'Moon', color: '#e8e8e8' },
    { altaz: altAzOfBody(Body.Sun, observer, time), label: 'Sun', color: '#ffd27f' },
  ];

  drawScene(ctx, { stars: projectedStars, markers, cam });
}

async function boot() {
  const res = await fetch('./data/stars.json');
  stars = await res.json();
  store.subscribe(render);
  window.addEventListener('resize', render);
  render();
}

boot();
