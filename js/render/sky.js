import { createProjector } from '../core/projection.js';
import { starSize, bvToRGB, zoomScale, colorBrightness } from './starstyle.js';
import { drawConstellations } from './constellations.js';
import { degToRad } from '../core/angles.js';

const STAR_MARGIN = 22; // px; covers the largest zoomed star disc (STAR_MAX_R * MAX_ZOOM_SCALE) at the edge
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
function drawStars(ctx, stars, projector, cam, edit) {
  ctx.font = LABEL_FONT;
  const zs = zoomScale(cam.fov);
  for (const s of stars) {
    if (!edit && s.altaz.alt < 0) continue; // below horizon (shown in edit mode so any constellation is reachable)
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    const c = bvToRGB(s.bv);
    const { radius, alpha } = starSize(s.mag, zs);
    ctx.globalAlpha = alpha * colorBrightness(c);
    ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
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

const MARKER_MIN_R = 5; // px floor so the Sun/Moon stay visible/obvious even at the widest FOV

// Disk radius (px) for a marker. Sun/Moon carry angularRadiusDeg -> projected to true on-screen
// size for the current FOV (grows as you zoom in), floored. Others use a fixed radius.
function markerRadius(m, cam) {
  if (m.angularRadiusDeg != null) {
    const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
    return Math.max(focal * Math.tan(degToRad(m.angularRadiusDeg)), MARKER_MIN_R);
  }
  return m.radius || 4;
}

// markers: array of { altaz, label, color, radius? } (radius defaults to 4)
function drawMarkers(ctx, markers, projector, cam) {
  ctx.font = '13px system-ui, sans-serif';
  for (const m of markers) {
    if (m.altaz.alt < 0) continue;
    const p = projector(m.altaz.az, m.altaz.alt);
    if (!p.visible) continue;
    ctx.fillStyle = m.color || '#ffd27f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, markerRadius(m, cam), 0, Math.PI * 2);
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

export function drawScene(ctx, { stars, markers, constellations = [], cam, edit = false }) {
  const projector = createProjector(cam);
  clear(ctx, cam.width, cam.height);
  drawConstellations(ctx, projector, constellations, cam, edit);
  drawStars(ctx, stars, projector, cam, edit);
  drawMarkers(ctx, markers, projector, cam);
  drawReticle(ctx, cam);
}
