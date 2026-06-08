import { createProjector } from '../core/projection.js';
import { starSize, bvToRGB, zoomScale, colorBrightness } from './starstyle.js';
import { drawConstellations } from './constellations.js';
import { drawGrid } from './grid.js';
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

// Opaque black for the standalone 2D path; transparent (clearRect) in WebGL mode, where the GL
// starfield sits behind this canvas and must show through (the black body backdrop is the backstop).
function clear(ctx, width, height, transparent = false) {
  if (transparent) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }
}

// stars: array of { altaz: {alt, az}, mag, bv, name }
function drawStars(ctx, stars, projector, cam, edit, labels = true, below = false) {
  ctx.font = LABEL_FONT;
  const zs = zoomScale(cam.fov);
  for (const s of stars) {
    if (!edit && !below && s.altaz.alt < 0) continue; // below horizon (shown in edit/full-sphere mode)
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
    if (labels && s.name && s.mag <= STAR_LABEL_MAG) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = STAR_LABEL_COLOR;
      ctx.fillText(s.name, p.x + 6, p.y - 6);
    }
  }
  ctx.globalAlpha = 1;
}

// The label half of drawStars, used in WebGL mode: the GL canvas draws the star POINTS, but their
// text labels stay on this 2D overlay. Same filter/offset/visibility as drawStars. `below` reveals
// labels under the horizon (full-sphere/edit), matching the point-drawing cull.
export function drawStarLabels(ctx, stars, projector, cam, labels = true, below = false) {
  if (!labels) return;
  ctx.globalAlpha = 1;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = STAR_LABEL_COLOR;
  for (const s of stars) {
    if (!s.name || s.mag > STAR_LABEL_MAG) continue;
    if (!below && s.altaz.alt < 0) continue;
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    ctx.fillText(s.name, p.x + 6, p.y - 6);
  }
}

const MARKER_MIN_R = 5; // px floor so the Sun/Moon stay visible/obvious even at the widest FOV
// The Sun and Moon are really only ~0.5° across, which reads as a tiny dot on screen (the
// "moon illusion" — people expect them bigger). Gently exaggerate their apparent size, as most
// planetarium apps do, so they read as discs. 1 = true size; bump for a larger Sun/Moon.
const SUN_MOON_SCALE = 2;

// Disk radius (px) for a marker. Sun/Moon carry angularRadiusDeg -> projected to their true on-screen
// size for the current FOV (grows as you zoom in), exaggerated by SUN_MOON_SCALE and floored. Others
// use a fixed radius. Exported so the WebGL marker pass (starfield-gl.js, via main.js) sizes discs identically.
export function markerRadius(m, cam) {
  if (m.angularRadiusDeg != null) {
    const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
    return Math.max(focal * Math.tan(degToRad(m.angularRadiusDeg)) * SUN_MOON_SCALE, MARKER_MIN_R);
  }
  return m.radius || 4;
}

// markers: array of { altaz, label, color, radius? } (radius defaults to 4).
// discs=false (WebGL mode): draw only the labels here; the glowing discs come from the GL pass.
function drawMarkers(ctx, markers, projector, cam, labels = true, below = false, discs = true) {
  ctx.font = '13px system-ui, sans-serif';
  for (const m of markers) {
    if (!below && m.altaz.alt < 0) continue;
    const p = projector(m.altaz.az, m.altaz.alt);
    if (!p.visible) continue;
    if (discs) {
      ctx.globalAlpha = m.alpha ?? 1; // faint outer planets dim toward transparent; reset before labels
      ctx.fillStyle = m.color || '#ffd27f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, markerRadius(m, cam), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (labels) {
      ctx.fillStyle = m.color || '#ffd27f';
      ctx.fillText(m.label, p.x + 7, p.y - 7);
    }
  }
}

// drawStarPoints=false (WebGL mode): the GL canvas draws the star discs, so skip them here and clear
// transparent; star labels are drawn separately via drawStarLabels(). Default true keeps the
// standalone 2D path (and tests) unchanged.
export function drawScene(ctx, { stars, markers, constellations = [], cam, edit = false, labels = true, grid = false, sphere = false, drawStarPoints = true, drawMarkerDiscs = true }) {
  const projector = createProjector(cam);
  clear(ctx, cam.width, cam.height, !drawStarPoints);
  if (grid) drawGrid(ctx, projector, cam, sphere);
  drawConstellations(ctx, projector, constellations, cam, edit, labels, sphere);
  if (drawStarPoints) drawStars(ctx, stars, projector, cam, edit, labels, sphere);
  drawMarkers(ctx, markers, projector, cam, labels, sphere, drawMarkerDiscs);
}
