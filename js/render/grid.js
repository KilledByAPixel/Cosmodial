import { degToRad } from '../core/angles.js';

// Alt-az grid: altitude rings (constant altitude) + azimuth lines (constant azimuth), drawn as
// projected polylines so they curve naturally — rings tighten into small circles near the zenith,
// where the azimuth spokes converge. Spacing adapts to the FOV so only a handful of lines fill the
// view; coverage adapts to where you look. Glance up and the full wheel is drawn, but the spoke
// step widens with altitude so they don't crowd into a dense fan overhead.

const GRID_COLOR = 'rgba(110, 150, 195, 0.18)'; // fainter than the horizon line
const GRID_LABEL_COLOR = 'rgba(140, 175, 215, 0.5)';
const GRID_LABEL_FONT = '10px system-ui, sans-serif';
const TARGET_LINES = 4;       // aim for ~this many altitude rings across the view
const SPOKE_TARGET_LINES = 8; // azimuth spokes are drawn denser than rings so the wheel isn't sparse
const SAMPLE_DEG = 2;         // polyline sampling resolution along each line

// Nice round step (degrees) for grid spacing: the smallest ladder rung >= target.
const STEP_LADDER = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];
export function niceStep(target, ladder = STEP_LADDER) {
  for (const s of ladder) if (s >= target) return s;
  return ladder[ladder.length - 1];
}

// Half the view's diagonal angle (deg) — how far from the aim the corners reach.
function halfDiagDeg(cam) {
  const aspect = cam.height / cam.width;
  return Math.min(89, 0.5 * cam.fov * Math.sqrt(1 + aspect * aspect) * 1.15);
}

// Multiples of `step` within [lo, hi], kept strictly inside (0, 90). Bounded by the range, so deep
// zoom (tiny step) still yields only a few altitude rings.
function ringsInRange(step, lo, hi) {
  const out = [];
  const start = Math.ceil(lo / step) * step;
  for (let v = start; v <= hi + 1e-9; v += step) {
    if (v > 0 && v < 90) out.push(Number(v.toFixed(6)));
  }
  return out;
}

// Which azimuth spokes are worth drawing. Each spoke is a vertical great circle through the zenith;
// it's visible when its nearest point (over altitudes 0..90) falls within the view's half-diagonal.
// As the aim nears the zenith this is satisfied by every enumerated azimuth, so the whole wheel
// gets drawn — but with the widened step there are only a handful of them.
function visibleAzimuths(cam, step) {
  const cosHalf = Math.cos(degToRad(halfDiagDeg(cam)));
  const A = degToRad(cam.alt);
  const sinA = Math.sin(A), cosA = Math.cos(A);
  const out = [];
  for (let az = 0; az < 360 - 1e-9; az += step) {
    const dAz = degToRad(((az - cam.az + 540) % 360) - 180);
    const c = Math.cos(dAz);
    // Max of cos(separation) between the aim and any point on this spoke. For |dAz|>90° the closest
    // approach is the zenith end, so it reduces to sin(alt) — i.e. "is the zenith in view".
    const maxCos = Math.abs(dAz) <= Math.PI / 2 ? Math.sqrt(sinA * sinA + cosA * cosA * c * c) : sinA;
    if (maxCos > cosHalf) out.push(Number(az.toFixed(6)));
  }
  return out;
}

// Which grid lines to draw for this camera. Vertical FOV scales by the canvas aspect ratio so
// altitude rings stay about as dense on screen as azimuth lines.
export function gridSpec(cam, { targetLines = TARGET_LINES } = {}) {
  const fovV = cam.fov * (cam.height / cam.width);
  const cosA = Math.cos(degToRad(cam.alt));
  // Near the zenith, azimuth lines bunch up on screen (spacing ∝ cos alt); widen the step to keep
  // the spoke count steady instead of fanning out densely overhead. cos floored so it can't blow up.
  const azStep = niceStep(cam.fov / (SPOKE_TARGET_LINES * Math.max(cosA, 1e-3)));
  const altStep = niceStep(fovV / targetLines);
  const azimuths = visibleAzimuths(cam, azStep);
  // Rings are windowed to the view, but when the zenith is on screen we extend them up to the pole
  // so the innermost ring reliably caps the converging spokes with a circle.
  const zenithInView = 90 - cam.alt < halfDiagDeg(cam);
  const topAlt = zenithInView ? 90 : cam.alt + fovV / 2 + altStep;
  const botAlt = cam.alt - (fovV / 2 + altStep);
  const altitudes = ringsInRange(altStep, Math.max(0, botAlt), Math.min(90, topAlt));
  return { azStep, altStep, azimuths, altitudes };
}

// Sample a polyline through the projector, breaking the path wherever a point is culled.
function strokePolyline(ctx, projector, points) {
  ctx.beginPath();
  let pen = false;
  for (const [az, alt] of points) {
    const p = projector(az, alt);
    if (!p.visible) { pen = false; continue; }
    if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function onScreen(p, cam) {
  return p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height;
}

export function drawGrid(ctx, projector, cam) {
  const { azimuths, altitudes } = gridSpec(cam);
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  // Altitude rings: full 360° so the whole circle — including the part overhead — is drawn; the
  // projector culls the half behind the camera.
  for (const alt of altitudes) {
    const pts = [];
    for (let az = 0; az <= 360; az += SAMPLE_DEG) pts.push([az, alt]);
    strokePolyline(ctx, projector, pts);
  }
  // Azimuth spokes: from the horizon all the way to the pole, where they converge to a single point.
  for (const az of azimuths) {
    const pts = [];
    for (let h = 0; h <= 90; h += SAMPLE_DEG) pts.push([az, h]);
    strokePolyline(ctx, projector, pts);
  }
  // Degree labels. Rings label on the screen's vertical centerline; spokes a little below the aim so
  // they spread out instead of piling up at the zenith when looking up.
  ctx.font = GRID_LABEL_FONT;
  ctx.fillStyle = GRID_LABEL_COLOR;
  const fovV = cam.fov * (cam.height / cam.width);
  const azLabelAlt = Math.max(0, Math.min(89, cam.alt - fovV * 0.3));
  for (const alt of altitudes) {
    const p = projector(cam.az, alt);
    if (onScreen(p, cam)) ctx.fillText(`${alt}°`, p.x + 3, p.y - 2);
  }
  for (const az of azimuths) {
    const p = projector(az, azLabelAlt);
    if (onScreen(p, cam)) ctx.fillText(`${Math.round(az)}°`, p.x + 3, p.y - 2);
  }
}
