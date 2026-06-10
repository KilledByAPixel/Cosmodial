// Splash / social-image generator for Cosmodial Sky Atlas. Open tools/splash.html served over
// http (the same way the app is served) — fetch of the data files fails on file://.
// Deliberately self-contained: reads committed data/ files, never imports app code from js/.

import { galacticUV, invProject } from './splash-math.js';

const PRESETS = [
  { w: 1280, h: 640,  label: '1280×640 — GitHub social preview' },
  { w: 1200, h: 630,  label: '1200×630 — og:image' },
  { w: 1920, h: 1080, label: '1920×1080 — widescreen' },
  { w: 1024, h: 1024, label: '1024×1024 — square' },
];

const SKY_CENTERS = {
  core:     { ra: 266.4,  dec: -29.0,  label: 'Galactic core' },
  orion:    { ra: 83.8,   dec: -1.2,   label: 'Orion' },
  pleiades: { ra: 56.75,  dec: 24.12,  label: 'Pleiades' },
};

const FOV_X = 110;      // degrees of sky across the image width
const MAG_LIMIT = 6.5;  // faintest star drawn
const BRASS = '212, 175, 110';

const state = { preset: 0, center: 'core', mw: 0.55, lines: false, ringScale: 0.42 };
let data = null; // { stars, constellations, mwTex: ImageData }

function setStatus(msg) { document.getElementById('status').textContent = msg; }

async function loadData() {
  const json = (path) => fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });
  const [stars, constellations] = await Promise.all([
    json('../data/stars.json'),
    json('../data/constellations.json'),
  ]);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('milkyway-4k.webp failed to load'));
    img.src = '../data/milkyway-4k.webp';
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  return { stars, constellations, mwTex: cx.getImageData(0, 0, c.width, c.height) };
}

// Plane <-> pixel mapping. The stereographic plane radius covering half the horizontal FOV
// is 2*tan(FOV_X/4); x is mirrored so larger RA appears on the LEFT, like the real sky.
function makeMapping(w, h) {
  const S = (w / 2) / (2 * Math.tan((FOV_X / 2) * Math.PI / 180 / 2));
  return {
    S,
    toPx: (p) => ({ x: w / 2 - p.x * S, y: h / 2 - p.y * S }),
    toPlane: (px, py) => ({ x: (w / 2 - px) / S, y: (h / 2 - py) / S }),
  };
}

// Layer 1+2: deep-blue background with the Milky Way texture sampled per pixel through the
// inverse projection (one-shot render; a CPU pixel loop is fine here, ~2M px worst case).
function paintSky(ctx, w, h, center, mwIntensity, mwTex) {
  const { toPlane } = makeMapping(w, h);
  const out = ctx.createImageData(w, h);
  const d = out.data, t = mwTex.data, tw = mwTex.width, th = mwTex.height;
  for (let py = 0; py < h; py++) {
    const f = py / h; // a whisper of vertical depth: #07101e up top -> #02050c at the bottom
    const bg = [7 - 5 * f, 16 - 11 * f, 30 - 18 * f];
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      let [r, g, b] = bg;
      if (mwIntensity > 0) {
        const pl = toPlane(px, py);
        const sky = invProject(pl.x, pl.y, center);
        const { u, v } = galacticUV(sky.ra, sky.dec);
        const ti = (((v * (th - 1)) | 0) * tw + ((u * (tw - 1)) | 0)) * 4;
        r += t[ti] * mwIntensity;
        g += t[ti + 1] * mwIntensity;
        b += t[ti + 2] * mwIntensity;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function render() {
  const { w, h } = PRESETS[state.preset];
  const canvas = document.getElementById('out');
  canvas.width = w; canvas.height = h; // exact pixel dimensions; CSS scales the preview
  const ctx = canvas.getContext('2d');
  const center = SKY_CENTERS[state.center];
  const t0 = performance.now();
  paintSky(ctx, w, h, center, state.mw, data.mwTex);
  setStatus(`Rendered ${w}×${h} in ${Math.round(performance.now() - t0)} ms`);
}

async function init() {
  if (location.protocol === 'file:') {
    setStatus('Serve this page over http (the same way you run the app) — data/ can\'t be fetched from file://.');
    return;
  }
  try {
    setStatus('Loading sky data…');
    data = await loadData();
  } catch (e) {
    setStatus(`Could not load data (${e.message}). Serve the repo root over http and open /tools/splash.html.`);
    return;
  }
  render();
}

init();
