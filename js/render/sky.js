import { project } from '../core/projection.js';
import { magnitudeToRadius, magnitudeToOpacity, bvToRGB } from './starstyle.js';

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  return { width: w, height: h };
}

function clear(ctx, width, height) {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, width, height);
}

// stars: array of { altaz: {alt, az}, mag, bv }
function drawStars(ctx, stars, cam) {
  for (const s of stars) {
    if (s.altaz.alt < 0) continue; // below the horizon
    const p = project(s.altaz.az, s.altaz.alt, cam);
    if (!p.visible || p.x < 0 || p.x > cam.width || p.y < 0 || p.y > cam.height) continue;
    const c = bvToRGB(s.bv);
    ctx.globalAlpha = magnitudeToOpacity(s.mag);
    ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, magnitudeToRadius(s.mag), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// markers: array of { altaz, label, color }
function drawMarkers(ctx, markers, cam) {
  ctx.font = '13px system-ui, sans-serif';
  for (const m of markers) {
    if (m.altaz.alt < 0) continue;
    const p = project(m.altaz.az, m.altaz.alt, cam);
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
  clear(ctx, cam.width, cam.height);
  drawStars(ctx, stars, cam);
  drawMarkers(ctx, markers, cam);
  drawReticle(ctx, cam);
}
