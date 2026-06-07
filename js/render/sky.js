import { createProjector } from '../core/projection.js';
import { magnitudeToRadius, magnitudeToOpacity, bvToRGB, zoomScale } from './starstyle.js';

const STAR_MARGIN = 14; // px; covers the largest zoomed star disc (maxR * MAX_ZOOM_SCALE) overlapping the edge
const STAR_LABEL_MAG = 2.5; // only label the brightest named stars, to keep the view uncluttered
const STAR_LABEL_COLOR = 'rgba(150, 190, 230, 0.9)';
const LABEL_FONT = '11px system-ui, sans-serif';

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  // Assigning canvas.width/height resets the ENTIRE canvas state, so only do it when the
  // size actually changes — otherwise rendering every frame would reset state needlessly.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  return { width: canvas.clientWidth, height: canvas.clientHeight };
}

function clear(ctx, width, height) {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, width, height);
}

// stars: array of { altaz: {alt, az}, mag, bv, name }
function drawStars(ctx, stars, projector, cam) {
  ctx.font = LABEL_FONT;
  const zs = zoomScale(cam.fov);
  for (const s of stars) {
    if (s.altaz.alt < 0) continue; // below the horizon
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    const c = bvToRGB(s.bv);
    ctx.globalAlpha = magnitudeToOpacity(s.mag);
    ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, magnitudeToRadius(s.mag) * zs, 0, Math.PI * 2);
    ctx.fill();
    // Label only the brightest named stars so they can be matched against a sky chart.
    if (s.name && s.mag <= STAR_LABEL_MAG) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = STAR_LABEL_COLOR;
      ctx.fillText(s.name, p.x + 6, p.y - 6);
    }
  }
  ctx.globalAlpha = 1;
}

// markers: array of { altaz, label, color }
function drawMarkers(ctx, markers, projector) {
  ctx.font = '13px system-ui, sans-serif';
  for (const m of markers) {
    if (m.altaz.alt < 0) continue;
    const p = projector(m.altaz.az, m.altaz.alt);
    if (!p.visible) continue;
    ctx.fillStyle = m.color || '#ffd27f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(m.label, p.x + 7, p.y - 7);
  }
}

function drawReticle(ctx, cam) {
  const cx = cam.width / 2, cy = cam.height / 2;
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
}

export function drawScene(ctx, { stars, markers, cam }) {
  const projector = createProjector(cam);
  clear(ctx, cam.width, cam.height);
  drawStars(ctx, stars, projector, cam);
  drawMarkers(ctx, markers, projector);
  drawReticle(ctx, cam);
}
