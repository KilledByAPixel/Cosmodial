// Splash / social-image generator for Cosmodial Sky Atlas. Open tools/splash.html served over
// http (the same way the app is served) — fetch of the data files fails on file://.
// Deliberately self-contained: reads committed data/ files, never imports app code from js/.

import { galacticUV, invProject, project, bvToColor } from './splash-math.js';

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
        const pl = toPlane(px + 0.5, py + 0.5); // sample pixel centers so the image is symmetric about the sky center
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

// Layer 3: real stars. Size and alpha scale with magnitude, tint from B-V, soft halo on the
// brightest few. `s` keeps proportions identical across presets (designed at 640px short side).
function paintStars(ctx, w, h, center, stars) {
  const { toPx } = makeMapping(w, h);
  const s = Math.min(w, h) / 640;
  for (const st of stars) {
    if (st.mag > MAG_LIMIT) continue;
    const p = project(st.ra, st.dec, center);
    if (!p) continue;
    const { x, y } = toPx(p);
    const m = 30 * s; // wide enough that a just-off-frame bright star's halo still spills in
    if (x < -m || y < -m || x > w + m || y > h + m) continue;
    const r = Math.max(0.4, (5.5 - st.mag) * 0.5) * s;
    const [cr, cg, cb] = bvToColor(st.bv);
    const a = Math.max(0.25, Math.min(1, 1.1 - st.mag * 0.11));
    if (st.mag < 1.5) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      halo.addColorStop(0, `rgba(${cr},${cg},${cb},0.35)`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
  }
}

// Layer 4 (optional): constellation figures, same faint blue as the brainstorm mockups.
function paintConstellations(ctx, w, h, center, constellations) {
  const { toPx } = makeMapping(w, h);
  const s = Math.min(w, h) / 640;
  ctx.strokeStyle = 'rgba(150, 180, 255, 0.30)';
  ctx.lineWidth = 1.5 * s;
  for (const con of constellations) {
    for (const [a, b] of con.lines) {
      const pa = project(a[0], a[1], center), pb = project(b[0], b[1], center);
      if (!pa || !pb) continue;
      const A = toPx(pa), B = toPx(pb);
      const off = (q) => q.x < 0 || q.x > w || q.y < 0 || q.y > h;
      if (off(A) && off(B)) continue;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
}

// Layer 5: the antique-brass astrolabe dial.
function paintDial(ctx, w, h, ringScale) {
  const cx = w / 2, cy = h / 2;
  const R = ringScale * Math.min(w, h);
  const s = Math.min(w, h) / 640;
  const ring = (r, alpha, lw, blur = 0) => {
    ctx.strokeStyle = `rgba(${BRASS}, ${alpha})`;
    ctx.lineWidth = lw;
    ctx.shadowColor = blur ? `rgba(${BRASS}, 0.5)` : 'transparent';
    ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.shadowBlur = 0;
  };
  ring(R, 0.65, 2.5 * s, 12 * s); // main circle, glowing
  ring(R * 0.933, 0.35, 1 * s);   // close inner echo
  ring(R * 1.096, 0.28, 1 * s);   // faint outer circle
  for (let i = 0; i < 64; i++) {  // 8 major ticks on the compass points, fine minors between
    const major = i % 8 === 0;
    const ang = (i / 64) * 2 * Math.PI - Math.PI / 2;
    const r1 = major ? R * 0.94 : R * 0.965;
    ctx.strokeStyle = `rgba(${BRASS}, ${major ? 0.6 : 0.3})`;
    ctx.lineWidth = (major ? 2 : 1) * s;
    ctx.beginPath();
    ctx.moveTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.lineTo(cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang));
    ctx.stroke();
  }
  // dotted gradation band along the top half of the outer circle
  ctx.strokeStyle = `rgba(${BRASS}, 0.18)`;
  ctx.lineWidth = 22 * s;
  ctx.setLineDash([1 * s, 7 * s]);
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.096, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
}

// Layer 6: the name. Canvas letterSpacing adds a trailing space after the last glyph, so each
// line is nudged right by half its spacing to stay optically centered.
function paintTitle(ctx, w, h) {
  const m = Math.min(w, h);
  const cx = w / 2, cy = h / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const nameSize = 0.13 * m;
  ctx.font = `${nameSize}px Georgia, 'Times New Roman', serif`;
  ctx.letterSpacing = `${0.1 * nameSize}px`;
  ctx.fillStyle = '#f0e9d8';
  ctx.shadowColor = 'rgba(212, 175, 110, 0.35)';
  ctx.shadowBlur = 0.025 * m;
  ctx.fillText('COSMODIAL', cx + 0.05 * nameSize, cy + 0.02 * m);
  ctx.shadowBlur = 0;

  const tagSize = 0.042 * m;
  ctx.font = `${tagSize}px Georgia, serif`;
  ctx.letterSpacing = `${0.6 * tagSize}px`;
  ctx.fillStyle = '#c9b88e';
  ctx.fillText('SKY ATLAS', cx + 0.3 * tagSize, cy + 0.02 * m + 1.9 * tagSize);
  ctx.letterSpacing = '0px';
  ctx.shadowColor = 'transparent';
}

function buildControls() {
  const preset = document.getElementById('preset');
  PRESETS.forEach((p, i) => preset.add(new Option(p.label, i)));
  const center = document.getElementById('center');
  for (const [key, c] of Object.entries(SKY_CENTERS)) center.add(new Option(c.label, key));
  // 'change' (not 'input') events: a full render takes a beat, no point re-rendering mid-drag
  preset.onchange = () => { state.preset = +preset.value; render(); };
  center.onchange = () => { state.center = center.value; render(); };
  document.getElementById('mw').onchange = (e) => { state.mw = +e.target.value; render(); };
  document.getElementById('lines').onchange = (e) => { state.lines = e.target.checked; render(); };
  document.getElementById('ringScale').onchange = (e) => { state.ringScale = +e.target.value; render(); };
  document.getElementById('save').onclick = download;
}

function download() {
  if (!data) return;
  const { w, h } = PRESETS[state.preset];
  document.getElementById('out').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cosmodial-splash-${w}x${h}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function render() {
  if (!data) return; // controls fire before the data load finishes
  const { w, h } = PRESETS[state.preset];
  const canvas = document.getElementById('out');
  canvas.width = w; canvas.height = h; // exact pixel dimensions; CSS scales the preview
  const ctx = canvas.getContext('2d');
  const center = SKY_CENTERS[state.center];
  const t0 = performance.now();
  paintSky(ctx, w, h, center, state.mw, data.mwTex);
  if (state.lines) paintConstellations(ctx, w, h, center, data.constellations);
  paintStars(ctx, w, h, center, data.stars);
  paintDial(ctx, w, h, state.ringScale);
  paintTitle(ctx, w, h);
  setStatus(`Rendered ${w}×${h} in ${Math.round(performance.now() - t0)} ms`);
}

async function init() {
  if (location.protocol === 'file:') {
    setStatus('Serve this page over http (the same way you run the app) — data/ can\'t be fetched from file://.');
    return;
  }
  buildControls();
  try {
    setStatus('Loading sky data…');
    data = await loadData();
  } catch (e) {
    setStatus(`Could not load data (${e.message}). Serve the repo root over http and open /tools/splash.html.`);
    return;
  }
  render();
}

init().catch((e) => setStatus(`Render failed: ${e.message}`));
