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

// ---- The dial & title design lives here. Dial radii are fractions of the ring radius R,
// ---- widths/lengths are 640-scale px (scaled by s), text sizes are fractions of the short
// ---- image side. Tweak and refresh; the ring/title sliders cover overall size.
const DIAL = {
  main:  { alpha: 0.65, width: 2.5, glow: 12 }, // the glowing primary circle at R
  inner: { r: 0.933, alpha: 0.35, width: 1 },   // close inner echo
  outer: { r: 1.096, alpha: 0.28, width: 1 },   // faint outer circle
  ticks: { count: 64, majorEvery: 8, majorR: 0.94, minorR: 0.965,
           majorAlpha: 0.6, minorAlpha: 0.3, majorWidth: 2, minorWidth: 1 },
  band:  { alpha: 0.18, width: 22, dash: [1, 7] }, // dotted gradation band, top arc of the outer circle
};
const TITLE = {
  name: 'COSMODIAL',
  tag: 'SKY ATLAS',
  font: "Georgia, 'Times New Roman', serif",
  nameColor: '#f0e9d8',
  tagColor: '#c9b88e',
  nameSpacing: 0.1,  // name letter spacing, em of the name size
  tagScale: 0.48,    // tag size as a fraction of the name size
  tagSpacing: 0.6,   // tag letter spacing, em of the tag size
  baselineY: 0.02,   // name baseline below image center, fraction of the short side
  tagGap: 1.9,       // tag baseline below the name baseline, in tag-size units
  glow: 0.025,       // name glow radius, fraction of the short side
};
const MOON = {
  ambient: 0.04, // how visible the night side stays against the sky
  gamma: 0.85,   // <1 softens the terminator a touch
};

const state = {
  preset: 0, center: 'core', mw: 1, nameScale: 0.13,
  backdrop: 'moon', ringScale: 0.42, phase: 0.65, rotate: 0,
};
let data = null; // { stars, mwTex, moonTex: ImageData }

function setStatus(msg) { document.getElementById('status').textContent = msg; }

async function loadData() {
  const json = (path) => fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });
  const texture = (path) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      resolve(cx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error(`${path} failed to load`));
    img.src = path;
  });
  const [stars, mwTex, moonTex] = await Promise.all([
    json('../data/stars.json'),
    texture('../data/milkyway-4k.webp'),
    texture('../data/moon-2k.webp'),
  ]);
  return { stars, mwTex, moonTex };
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

// Layer 4: the antique-brass astrolabe dial (design constants in DIAL up top).
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
  ring(R, DIAL.main.alpha, DIAL.main.width * s, DIAL.main.glow * s);
  ring(R * DIAL.inner.r, DIAL.inner.alpha, DIAL.inner.width * s);
  ring(R * DIAL.outer.r, DIAL.outer.alpha, DIAL.outer.width * s);
  const T = DIAL.ticks; // majors on the compass points, fine minors between
  for (let i = 0; i < T.count; i++) {
    const major = i % T.majorEvery === 0;
    const ang = (i / T.count) * 2 * Math.PI - Math.PI / 2;
    const r1 = R * (major ? T.majorR : T.minorR);
    ctx.strokeStyle = `rgba(${BRASS}, ${major ? T.majorAlpha : T.minorAlpha})`;
    ctx.lineWidth = (major ? T.majorWidth : T.minorWidth) * s;
    ctx.beginPath();
    ctx.moveTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.lineTo(cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang));
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${BRASS}, ${DIAL.band.alpha})`;
  ctx.lineWidth = DIAL.band.width * s;
  ctx.setLineDash(DIAL.band.dash.map((d) => d * s));
  ctx.beginPath(); ctx.arc(cx, cy, R * DIAL.outer.r, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
}

// Layer 4 (alternative backdrop): the Moon, a per-pixel shaded globe sampled from the
// equirectangular surface map. Phase swings the sun around the moon (0 new -> 0.5 full ->
// 1 new again); Rotate spins the whole disc in the view plane — face and terminator
// together — so it aims where the crescent points.
function paintMoon(ctx, w, h, scale, phase, rotDeg, tex) {
  const cx = w / 2, cy = h / 2;
  const Rm = scale * Math.min(w, h);
  const x0 = Math.max(0, Math.floor(cx - Rm - 1)), x1 = Math.min(w, Math.ceil(cx + Rm + 1));
  const y0 = Math.max(0, Math.floor(cy - Rm - 1)), y1 = Math.min(h, Math.ceil(cy + Rm + 1));
  if (x1 <= x0 || y1 <= y0) return;
  const box = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const d = box.data, t = tex.data, tw = tex.width, th = tex.height;
  const theta = Math.PI * (2 * phase - 1);          // sun angle: -pi new, 0 full, +pi new again
  const Lx = Math.sin(theta), Lz = Math.cos(theta); // the sun stays in the horizontal plane
  const rot = (rotDeg * Math.PI) / 180;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const nx0 = (px + 0.5 - cx) / Rm, ny0 = -(py + 0.5 - cy) / Rm; // 3D y is up
      const d2 = nx0 * nx0 + ny0 * ny0;
      if (d2 >= 1) continue;
      // spin the view: sampling coords rotate one way so the rendered disc turns the other
      const nx = nx0 * cr + ny0 * sr, ny = ny0 * cr - nx0 * sr;
      const nz = Math.sqrt(1 - d2);
      const lambert = Math.max(0, nx * Lx + nz * Lz);
      const shade = MOON.ambient + (1 - MOON.ambient) * Math.pow(lambert, MOON.gamma);
      const lon = Math.atan2(nx, nz), lat = Math.asin(Math.max(-1, Math.min(1, ny)));
      const u = 0.5 + lon / (2 * Math.PI), v = 0.5 - lat / Math.PI;
      const ti = (((v * (th - 1)) | 0) * tw + ((u * (tw - 1)) | 0)) * 4;
      const a = Math.min(1, (1 - Math.sqrt(d2)) * Rm * 0.8); // ~1px soft rim
      const i = ((py - y0) * (x1 - x0) + (px - x0)) * 4;
      d[i]     = t[ti] * shade * a + d[i] * (1 - a);
      d[i + 1] = t[ti + 1] * shade * a + d[i + 1] * (1 - a);
      d[i + 2] = t[ti + 2] * shade * a + d[i + 2] * (1 - a);
    }
  }
  ctx.putImageData(box, x0, y0);
}

// Layer 5: the name (design constants in TITLE up top, overall size from the Title slider).
// Canvas letterSpacing adds a trailing space after the last glyph, so each line is nudged
// right by half its spacing to stay optically centered.
function paintTitle(ctx, w, h) {
  const m = Math.min(w, h);
  const cx = w / 2, cy = h / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const nameSize = state.nameScale * m;
  const nameY = cy + TITLE.baselineY * m;
  ctx.font = `${nameSize}px ${TITLE.font}`;
  ctx.letterSpacing = `${TITLE.nameSpacing * nameSize}px`;
  ctx.fillStyle = TITLE.nameColor;
  ctx.shadowColor = `rgba(${BRASS}, 0.35)`;
  ctx.shadowBlur = TITLE.glow * m;
  ctx.fillText(TITLE.name, cx + (TITLE.nameSpacing * nameSize) / 2, nameY);
  ctx.shadowBlur = 0;

  const tagSize = TITLE.tagScale * nameSize;
  ctx.font = `${tagSize}px ${TITLE.font}`;
  ctx.letterSpacing = `${TITLE.tagSpacing * tagSize}px`;
  ctx.fillStyle = TITLE.tagColor;
  ctx.fillText(TITLE.tag, cx + (TITLE.tagSpacing * tagSize) / 2, nameY + TITLE.tagGap * tagSize);
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
  document.getElementById('backdrop').onchange = (e) => { state.backdrop = e.target.value; render(); };
  document.getElementById('ringScale').onchange = (e) => { state.ringScale = +e.target.value; render(); };
  document.getElementById('phase').onchange = (e) => { state.phase = +e.target.value; render(); };
  document.getElementById('rotate').onchange = (e) => { state.rotate = +e.target.value; render(); };
  document.getElementById('nameScale').onchange = (e) => { state.nameScale = +e.target.value; render(); };
  document.getElementById('save').onclick = download;
}

function download() {
  if (!data) return;
  const { w, h } = PRESETS[state.preset];
  document.getElementById('out').toBlob((blob) => {
    if (!blob) { setStatus('PNG encode failed.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cosmodial-splash-${w}x${h}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function render() {
  if (!data) return; // controls fire before the data load finishes
  try {
    const { w, h } = PRESETS[state.preset];
    const canvas = document.getElementById('out');
    canvas.width = w; canvas.height = h; // exact pixel dimensions; CSS scales the preview
    const ctx = canvas.getContext('2d');
    const center = SKY_CENTERS[state.center];
    const t0 = performance.now();
    paintSky(ctx, w, h, center, state.mw, data.mwTex);
    paintStars(ctx, w, h, center, data.stars);
    if (state.backdrop === 'moon') paintMoon(ctx, w, h, state.ringScale, state.phase, state.rotate, data.moonTex);
    else paintDial(ctx, w, h, state.ringScale);
    paintTitle(ctx, w, h);
    setStatus(`Rendered ${w}×${h} in ${Math.round(performance.now() - t0)} ms`);
  } catch (e) {
    setStatus(`Render failed: ${e.message}`);
  }
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
