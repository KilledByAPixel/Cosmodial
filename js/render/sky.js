import { createProjector, focalPx } from '../core/projection.js';
import { starSize, bvToRGB, zoomScale, colorBrightness, faintMagLimit } from './starstyle.js';
import { planetRadius } from './planets.js';
import { drawConstellations } from './constellations.js';
import { drawGrid } from './grid.js';
import { drawEqGrid } from './eqgrid.js';
import { degToRad } from '../core/angles.js';
import { drawDsoGlow, drawDsoSymbols } from './dso.js';

const STAR_MARGIN = 22; // px; covers the largest zoomed star disc (STAR_MAX_R * MAX_ZOOM_SCALE) at the edge
const STAR_LABEL_MAG = 2.0; // only label the brightest named stars, to keep the view uncluttered
const STAR_LABEL_COLOR = 'rgba(150, 190, 230, 0.9)';
const LABEL_FONT = '11px system-ui, sans-serif';
const LABEL_OFFSET_X = 6;  // px; text nudged up-right of the star (must match the fillText calls)
const LABEL_OFFSET_Y = -6;
const LABEL_BOX_H = 13;    // px; approximate height of the 11px label box for overlap tests

// Labels are placed brightest-first (the catalog is mag-sorted), so when two would overlap the
// brighter, better-known name wins and the dimmer one is suppressed. `placed` accumulates the
// screen rect of every label drawn this frame; returns false (skip) if `text` at (px,py) would
// overlap one already there. This is what stops Rigil Kentaurus + Toliman (Alpha Cen A/B, only a
// few arcsec apart) from stacking — they separate and both reappear once you zoom in far enough.
function placeLabel(ctx, placed, text, px, py) {
  const w = ctx.measureText(text).width;
  const r = { x: px + LABEL_OFFSET_X, y: py + LABEL_OFFSET_Y - LABEL_BOX_H, w, h: LABEL_BOX_H };
  for (const q of placed) {
    if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return false;
  }
  placed.push(r);
  return true;
}

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

function drawStarPoint(ctx, s, projector, cam, zs, fade, labels, placed) {
  const below = s.altaz.alt < 0;
  if (below && fade <= 0) return; // below horizon, fully faded out
  const p = projector(s.altaz.az, s.altaz.alt);
  if (!p.visible ||
      p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
      p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) return;
  const c = bvToRGB(s.bv);
  const { radius, alpha } = starSize(s.mag, zs);
  ctx.globalAlpha = alpha * colorBrightness(c) * (below ? fade : 1);
  ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Label only the brightest named stars so they can be matched against a sky chart,
  // skipping any that would overlap a brighter label already placed this frame.
  if (labels && s.name && s.mag <= STAR_LABEL_MAG && placeLabel(ctx, placed, s.name, p.x, p.y)) {
    ctx.globalAlpha = below ? fade : 1;
    ctx.fillStyle = STAR_LABEL_COLOR;
    ctx.fillText(s.name, p.x + LABEL_OFFSET_X, p.y + LABEL_OFFSET_Y);
  }
}

// stars: array of { altaz: {alt, az}, mag, bv, name }, sorted brightest-first (build-stars.mjs
// sorts the catalog by mag and skyObjects preserves that order) — the early break relies on it.
function drawStars(ctx, stars, projector, cam, edit, labels = true, belowFade = 0, selectedStarId = null) {
  ctx.font = LABEL_FONT;
  const zs = zoomScale(cam.fov);
  const fade = edit ? 1 : belowFade; // edit mode always shows the whole sphere
  const placed = []; // label rects placed this frame, for overlap suppression
  // Stop at the first star past the cull limit: everything after it would draw below CULL_ALPHA,
  // an invisible sub-pixel speck. (WebGL mode draws the whole catalog instead — the shader's
  // identical alpha fade hides the same stars at no CPU cost.)
  const magLimit = faintMagLimit(zs);
  let i = 0;
  for (; i < stars.length && stars[i].mag <= magLimit; i++) {
    drawStarPoint(ctx, stars[i], projector, cam, zs, fade, labels, placed);
  }
  // A selected faint star (reachable via search) still draws past the cull, so its highlight
  // ring doesn't circle empty sky.
  if (selectedStarId != null) {
    for (; i < stars.length; i++) {
      if (stars[i].id !== selectedStarId) continue;
      drawStarPoint(ctx, stars[i], projector, cam, zs, fade, labels, placed);
      break;
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
  const placed = []; // label rects placed this frame, for overlap suppression
  for (const s of stars) {
    if (!s.name || s.mag > STAR_LABEL_MAG) continue;
    const below = s.altaz.alt < 0;
    if (below && belowFade <= 0) continue;
    const p = projector(s.altaz.az, s.altaz.alt);
    if (!p.visible ||
        p.x < -STAR_MARGIN || p.x > cam.width + STAR_MARGIN ||
        p.y < -STAR_MARGIN || p.y > cam.height + STAR_MARGIN) continue;
    if (!placeLabel(ctx, placed, s.name, p.x, p.y)) continue; // overlaps a brighter label
    ctx.globalAlpha = below ? belowFade : 1;
    ctx.fillText(s.name, p.x + LABEL_OFFSET_X, p.y + LABEL_OFFSET_Y);
  }
  ctx.globalAlpha = 1;
}

// Apparent-size scales for the bodies that carry a true angular radius. 1 = honest apparent size at
// every zoom (the Sun/Moon are only ~0.5° across, so they read small wide out — that's real life).
// The Sun keeps its own knob for taste-tweaking independently of the true-scale Moon.
const MOON_SCALE = 1;
export const SUN_SCALE = 4; // exported: main.js shrinks the Sun toward true scale during an eclipse

// Disk radius (px) for a marker. Sun/Moon carry angularRadiusDeg -> projected to their on-screen size
// for the current FOV (grows as you zoom in), times their scale knob — or a marker-supplied
// `radiusScale` override (the eclipsing Sun shrinks from its brightness-sized glow to true scale).
// Others use a fixed dot radius. Exported so the WebGL marker pass (via main.js) sizes discs identically.
export function markerRadius(m, cam) {
  if (m.angularRadiusDeg != null) {
    const focal = focalPx(cam.fov, cam.width, cam.height);
    const scale = m.radiusScale != null ? m.radiusScale : (m.label === 'Sun' ? SUN_SCALE : MOON_SCALE);
    return focal * Math.tan(degToRad(m.angularRadiusDeg)) * scale;
  }
  // Point-source markers (planets, moons, comets, satellites) ride the same magnitude->radius curve as
  // stars, zoom-scaled, so they grow with the field as you zoom in — until a planet's true disc resolves.
  if (m.mag != null && Number.isFinite(m.mag)) return planetRadius(m.mag, zoomScale(cam.fov));
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
export function drawScene(ctx, { stars, markers, constellations = [], cam, edit = false, labels = true, grid = false, eqGrid = null, belowFade = 0, drawStarPoints = true, drawMarkerDiscs = true, dsos = [], deepsky = false, selectedDsoId = null, selectedStarId = null }) {
  const projector = createProjector(cam);
  const fade = edit ? 1 : belowFade; // edit mode always shows the whole sphere
  clear(ctx, cam.width, cam.height, !drawStarPoints);
  if (grid) drawGrid(ctx, projector, cam, fade);
  if (eqGrid) drawEqGrid(ctx, cam, eqGrid, fade); // eqGrid = the EQJ->ENU matrix when the toggle is on
  if (!edit) drawDsoGlow(ctx, dsos, projector, cam, fade);   // realistic glow, behind the stars
  drawConstellations(ctx, projector, constellations, cam, edit, labels, fade);
  if (drawStarPoints) drawStars(ctx, stars, projector, cam, edit, labels, fade, selectedStarId);
  drawMarkers(ctx, markers, projector, cam, labels, fade, drawMarkerDiscs);
  // Symbols/labels on top: all when the toggle is on, else just the selected one. Hidden in edit mode.
  if (!edit && (deepsky || selectedDsoId)) {
    const which = deepsky ? null : new Set([selectedDsoId]);
    drawDsoSymbols(ctx, dsos, projector, cam, { labels, belowFade: fade, which });
  }
}
