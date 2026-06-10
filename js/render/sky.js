import { createProjector } from '../core/projection.js';
import { starSize, bvToRGB, zoomScale, colorBrightness } from './starstyle.js';
import { drawConstellations } from './constellations.js';
import { drawGrid } from './grid.js';
import { degToRad } from '../core/angles.js';
import { drawDsoGlow, drawDsoSymbols } from './dso.js';

const STAR_MARGIN = 22; // px; covers the largest zoomed star disc (STAR_MAX_R * MAX_ZOOM_SCALE) at the edge
const STAR_LABEL_MAG = 2.0; // only label the brightest named stars, to keep the view uncluttered
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
function drawStars(ctx, stars, projector, cam, edit, labels = true, belowFade = 0) {
  ctx.font = LABEL_FONT;
  const zs = zoomScale(cam.fov);
  const fade = edit ? 1 : belowFade; // edit mode always shows the whole sphere
  for (const s of stars) {
    const below = s.altaz.alt < 0;
    if (below && fade <= 0) continue; // below horizon, fully faded out
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    const c = bvToRGB(s.bv);
    const { radius, alpha } = starSize(s.mag, zs);
    ctx.globalAlpha = alpha * colorBrightness(c) * (below ? fade : 1);
    ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    // Label only the brightest named stars so they can be matched against a sky chart.
    if (labels && s.name && s.mag <= STAR_LABEL_MAG) {
      ctx.globalAlpha = below ? fade : 1;
      ctx.fillStyle = STAR_LABEL_COLOR;
      ctx.fillText(s.name, p.x + 6, p.y - 6);
    }
  }
  ctx.globalAlpha = 1;
}

// The label half of drawStars, used in WebGL mode: the GL canvas draws the star POINTS, but their
// text labels stay on this 2D overlay. Same filter/offset/visibility as drawStars. `belowFade`
// (0..1) reveals labels under the horizon, matching the point-drawing fade.
export function drawStarLabels(ctx, stars, projector, cam, labels = true, belowFade = 0) {
  if (!labels) return;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = STAR_LABEL_COLOR;
  for (const s of stars) {
    if (!s.name || s.mag > STAR_LABEL_MAG) continue;
    const below = s.altaz.alt < 0;
    if (below && belowFade <= 0) continue;
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    ctx.globalAlpha = below ? belowFade : 1;
    ctx.fillText(s.name, p.x + 6, p.y - 6);
  }
  ctx.globalAlpha = 1;
}

// Apparent-size scales for the bodies that carry a true angular radius. 1 = honest apparent size at
// every zoom (the Sun/Moon are only ~0.5° across, so they read small wide out — that's real life).
// The Sun keeps its own knob for taste-tweaking independently of the true-scale Moon.
const MOON_SCALE = 1;
const SUN_SCALE = 1;

// Disk radius (px) for a marker. Sun/Moon carry angularRadiusDeg -> projected to their on-screen size
// for the current FOV (grows as you zoom in), times their scale knob. Others use a fixed dot radius.
// Exported so the WebGL marker pass (starfield-gl.js, via main.js) sizes discs identically.
export function markerRadius(m, cam) {
  if (m.angularRadiusDeg != null) {
    const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
    return focal * Math.tan(degToRad(m.angularRadiusDeg)) * (m.label === 'Sun' ? SUN_SCALE : MOON_SCALE);
  }
  return m.radius || 4;
}

// markers: array of { altaz, label, color, radius? } (radius defaults to 4).
// discs=false (WebGL mode): draw only the labels here; the glowing discs come from the GL pass.
function drawMarkers(ctx, markers, projector, cam, labels = true, belowFade = 0, discs = true) {
  ctx.font = '13px system-ui, sans-serif';
  for (const m of markers) {
    const below = m.altaz.alt < 0;
    if (below && belowFade <= 0) continue;
    const p = projector(m.altaz.az, m.altaz.alt);
    if (!p.visible) continue;
    const fadeA = below ? belowFade : 1;
    if (discs) {
      ctx.globalAlpha = (m.alpha ?? 1) * fadeA; // faint outer planets dim toward transparent
      ctx.fillStyle = m.color || '#ffd27f';
      ctx.beginPath();
      ctx.arc(p.x, p.y, markerRadius(m, cam), 0, Math.PI * 2);
      ctx.fill();
    }
    if (labels) {
      ctx.globalAlpha = fadeA;
      ctx.fillStyle = m.color || '#ffd27f';
      ctx.fillText(m.label, p.x + 7, p.y - 7);
    }
  }
  ctx.globalAlpha = 1;
}

// drawStarPoints=false (WebGL mode): the GL canvas draws the star discs, so skip them here and clear
// transparent; star labels are drawn separately via drawStarLabels(). Default true keeps the
// standalone 2D path (and tests) unchanged.
export function drawScene(ctx, { stars, markers, constellations = [], cam, edit = false, labels = true, grid = false, belowFade = 0, drawStarPoints = true, drawMarkerDiscs = true, dsos = [], deepsky = false, selectedDsoId = null }) {
  const projector = createProjector(cam);
  const fade = edit ? 1 : belowFade; // edit mode always shows the whole sphere
  clear(ctx, cam.width, cam.height, !drawStarPoints);
  if (grid) drawGrid(ctx, projector, cam, fade);
  if (!edit) drawDsoGlow(ctx, dsos, projector, cam, fade);   // realistic glow, behind the stars
  drawConstellations(ctx, projector, constellations, cam, edit, labels, fade);
  if (drawStarPoints) drawStars(ctx, stars, projector, cam, edit, labels, fade);
  drawMarkers(ctx, markers, projector, cam, labels, fade, drawMarkerDiscs);
  // Symbols/labels on top: all when the toggle is on, else just the selected one. Hidden in edit mode.
  if (!edit && (deepsky || selectedDsoId)) {
    const which = deepsky ? null : new Set([selectedDsoId]);
    drawDsoSymbols(ctx, dsos, projector, cam, { labels, belowFade: fade, which });
  }
}
