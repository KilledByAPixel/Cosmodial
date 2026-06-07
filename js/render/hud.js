import { createProjector } from '../core/projection.js';

const CARDINALS = [
  { az: 0, label: 'N' }, { az: 45, label: 'NE' }, { az: 90, label: 'E' }, { az: 135, label: 'SE' },
  { az: 180, label: 'S' }, { az: 225, label: 'SW' }, { az: 270, label: 'W' }, { az: 315, label: 'NW' },
];
const STRIP_SPAN_DEG = 180; // the compass ribbon shows this much azimuth across the full width
const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Shortest signed angle from->to in (-180, 180].
function signedDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

// 8-point compass name for an azimuth in degrees.
export function azToCompass(az) {
  const i = Math.round((((az % 360) + 360) % 360) / 45) % 8;
  return POINTS8[i];
}

// Cardinal marks for the compass ribbon. The ribbon spans STRIP_SPAN_DEG of azimuth across the
// full canvas width, centered on where the view faces. Returns { label, az, x } for marks in range.
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
  ctx.strokeStyle = 'rgba(120, 160, 200, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  let started = false;
  for (let d = -90; d <= 90; d += 2) {
    const p = projector(cam.az + d, 0);
    if (!p.visible) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(150, 190, 230, 0.85)';
  for (const c of [{ az: 0, l: 'N' }, { az: 90, l: 'E' }, { az: 180, l: 'S' }, { az: 270, l: 'W' }]) {
    const p = projector(c.az, 0);
    if (p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height) {
      ctx.fillText(c.l, p.x + 3, p.y - 3);
    }
  }
}

// The always-visible compass ribbon along the bottom.
function drawCompass(ctx, cam) {
  const barTop = cam.height - 36;
  const labelY = cam.height - 13;
  ctx.fillStyle = 'rgba(5, 7, 13, 0.55)';
  ctx.fillRect(0, barTop, cam.width, 36);
  ctx.strokeStyle = 'rgba(150, 190, 230, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, barTop); ctx.lineTo(cam.width, barTop); ctx.stroke();

  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const m of compassMarks(cam.az, cam.width)) {
    ctx.fillStyle = m.label.length === 1 ? 'rgba(200, 220, 245, 0.95)' : 'rgba(150, 180, 210, 0.7)';
    ctx.fillText(m.label, m.x, labelY);
    ctx.strokeStyle = 'rgba(150, 190, 230, 0.4)';
    ctx.beginPath(); ctx.moveTo(m.x, barTop); ctx.lineTo(m.x, barTop + 6); ctx.stroke();
  }
  // center pointer (where the reticle faces)
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.95)';
  ctx.beginPath(); ctx.moveTo(cam.width / 2, barTop); ctx.lineTo(cam.width / 2, barTop + 10); ctx.stroke();
  ctx.textAlign = 'left';
}

// The text readout: which way you're facing, altitude, field of view.
function drawReadout(ctx, cam) {
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 245, 0.9)';
  ctx.textAlign = 'left';
  const txt = `facing ${azToCompass(cam.az)} ${Math.round(cam.az)}° · alt ${Math.round(cam.alt)}° · FOV ${Math.round(cam.fov)}°`;
  ctx.fillText(txt, 12, cam.height - 48);
}

export function drawHud(ctx, cam) {
  drawHorizon(ctx, cam);
  drawReadout(ctx, cam);
  drawCompass(ctx, cam);
}
