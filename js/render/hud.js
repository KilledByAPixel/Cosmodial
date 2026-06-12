import { createProjector } from '../core/projection.js';
import { LINE_STYLES } from './line-styles.js';

const CARDINALS = [
  { az: 0, label: 'N' }, { az: 45, label: 'NE' }, { az: 90, label: 'E' }, { az: 135, label: 'SE' },
  { az: 180, label: 'S' }, { az: 225, label: 'SW' }, { az: 270, label: 'W' }, { az: 315, label: 'NW' },
];
const STRIP_SPAN_DEG = 90; // the mini compass pill shows this much azimuth across its width
const PILL_MAX_W = 240;    // CSS px pill width cap (shrinks to 60% of the canvas on narrow screens)
const PILL_H = 24;         // pill height
const PILL_GAP = 8;        // gap between the pill and the control bar below it
const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Shortest signed angle from->to in [-180, 180).
function signedDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

// 8-point compass name for an azimuth in degrees.
export function azToCompass(az) {
  const i = Math.round((((az % 360) + 360) % 360) / 45) % 8;
  return POINTS8[i];
}

// Cardinal marks for the mini compass pill. The pill spans STRIP_SPAN_DEG of azimuth across its
// width, centered on where the view faces. Returns { label, az, x } for marks in range.
export function compassMarks(centerAz, width, spanDeg = STRIP_SPAN_DEG) {
  const pxPerDeg = width / spanDeg;
  const half = spanDeg / 2;
  const marks = [];
  for (const c of CARDINALS) {
    const d = signedDelta(centerAz, c.az);
    if (Math.abs(d) <= half) marks.push({ label: c.label, az: c.az, x: width / 2 + d * pxPerDeg });
  }
  return marks;
}

// The horizon line + cardinal labels, drawn only where alt=0 is actually within the view.
function drawHorizon(ctx, cam) {
  const projector = createProjector(cam);
  ctx.strokeStyle = LINE_STYLES.horizon.color;
  ctx.lineWidth = LINE_STYLES.horizon.width;
  ctx.beginPath();
  // Sample the horizon across the full ±180° of azimuth: zoomed out near the zenith/nadir the
  // entire horizon is a closed on-screen ring (the headline stereographic view). At narrower FOVs
  // the projector culls the far side (NaN -> pen up) and canvas clipping trims the rest, so the
  // line still only appears where altitude 0 is actually on screen.
  let started = false;
  for (let d = -180; d <= 180; d += 2) {
    const p = projector(cam.az + d, 0);
    if (!p.visible) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(150, 190, 230, 0.85)';
  ctx.textBaseline = 'top'; // sit the letters just BELOW the horizon line
  for (const c of [{ az: 0, l: 'N' }, { az: 90, l: 'E' }, { az: 180, l: 'S' }, { az: 270, l: 'W' }]) {
    const p = projector(c.az, 0);
    if (p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height) {
      ctx.fillText(c.l, p.x + 3, p.y + 3);
    }
  }
  ctx.textBaseline = 'alphabetic'; // restore default for the rest of the HUD
}

// A rounded-rect path with semicircular ends (arc corners — no roundRect, so test stubs stay tiny).
function pillPath(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

// The mini compass: a small centered pill above the control bar. `bottomInset` lifts it above the
// on-screen bar (whose measured height main.js passes in).
function drawCompass(ctx, cam) {
  const inset = cam.bottomInset || 0;
  const w = Math.min(PILL_MAX_W, cam.width * 0.6);
  const x0 = (cam.width - w) / 2;
  const y0 = cam.height - inset - PILL_H - PILL_GAP;
  ctx.fillStyle = 'rgba(5, 7, 13, 0.55)';
  pillPath(ctx, x0, y0, w, PILL_H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 190, 230, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  pillPath(ctx, x0, y0, w, PILL_H);
  ctx.clip(); // ticks/labels sliding past the rounded ends stay inside the pill
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const m of compassMarks(cam.az, w)) {
    ctx.fillStyle = m.label.length === 1 ? 'rgba(200, 220, 245, 0.95)' : 'rgba(150, 180, 210, 0.7)';
    ctx.fillText(m.label, x0 + m.x, y0 + 16);
    ctx.strokeStyle = 'rgba(150, 190, 230, 0.4)';
    ctx.beginPath(); ctx.moveTo(x0 + m.x, y0); ctx.lineTo(x0 + m.x, y0 + 4); ctx.stroke();
  }
  ctx.restore();
  // center pointer (marks where the view is aimed)
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
  ctx.beginPath(); ctx.moveTo(cam.width / 2, y0); ctx.lineTo(cam.width / 2, y0 + 7); ctx.stroke();
  ctx.textAlign = 'left';
}

// opts.compass: false hides the mini compass pill (screensaver mode) — the horizon
// line and its cardinal letters are scene furniture and always draw.
export function drawHud(ctx, cam, opts = {}) {
  drawHorizon(ctx, cam);
  if (opts.compass !== false) drawCompass(ctx, cam);
}
