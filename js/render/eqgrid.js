// Equatorial (RA/Dec) grid: declination rings + right-ascension hour circles, drawn as projected
// polylines like the alt-az grid — but fixed to the SKY, not the ground. Sample points are J2000
// RA/Dec converted through the same EQJ->ENU rotation the GPU stars use (eqjToEnuMatrix), so the
// grid rotates with the stars and the celestial pole sits where the stars circle. Geometric (no
// refraction): a ~0.5° drift vs the refracted stars at the very horizon, invisible at grid scale.

import { degToRad, radToDeg, wrap360 } from '../core/angles.js';
import { LINE_STYLES } from './line-styles.js';
import { niceStep } from './grid.js';

const EQ_LABEL_COLOR = 'rgba(205, 170, 130, 0.55)';
const EQ_LABEL_FONT = '10px system-ui, sans-serif';
const SAMPLE_DEG = 2;        // polyline sampling resolution along each line
const DEC_MAX = 80;          // outermost declination ring (±); nearer the pole rings degenerate
// RA steps that stay round in HOURS (0.25h..3h), so the labels read 6h / 6h30m, never 0h40m.
const RA_STEP_LADDER = [3.75, 7.5, 15, 30, 45];

// J2000 RA/Dec (degrees) -> { az, alt } via a column-major EQJ->ENU rotation (Float32Array(9),
// from eqjToEnuMatrix). Pure — unit tested against the vendor's star path.
export function eqToAltAz(eqjToEnu, raDeg, decDeg) {
  const ra = degToRad(raDeg), dec = degToRad(decDeg);
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const m = eqjToEnu;
  const e = m[0] * v[0] + m[3] * v[1] + m[6] * v[2];
  const n = m[1] * v[0] + m[4] * v[1] + m[7] * v[2];
  const u = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
  return {
    az: wrap360(radToDeg(Math.atan2(e, n))),
    alt: radToDeg(Math.asin(Math.max(-1, Math.min(1, u)))),
  };
}

// RA degrees -> "6h" / "6h30m" label.
function raLabel(raDeg) {
  const hours = raDeg / 15;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

// Stroke one line through the projector, split into above-/below-horizon strokes so the
// below-horizon part rides `belowFade` (hidden entirely at 0) like the rest of the sky.
function strokeSplit(ctx, projector, pts, belowFade) {
  for (const below of [false, true]) {
    if (below && belowFade <= 0) continue;
    ctx.globalAlpha = below ? belowFade : 1;
    ctx.beginPath();
    let pen = false;
    for (const { az, alt } of pts) {
      if ((alt < 0) !== below) { pen = false; continue; }
      const p = projector(az, alt);
      if (!p.visible) { pen = false; continue; }
      if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

// First sample that lands on screen (and on the visible side of the horizon), for placing a label.
function firstOnScreen(projector, cam, pts, belowFade) {
  for (const { az, alt } of pts) {
    if (alt < 0 && belowFade <= 0) continue;
    const p = projector(az, alt);
    if (p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height) {
      return { p, faded: alt < 0 };
    }
  }
  return null;
}

// Draw the equatorial grid. eqjToEnu: column-major EQJ->ENU rotation for the current time/place
// (the matrix main.js already builds for the GPU stars). belowFade as everywhere else.
export function drawEqGrid(ctx, projector, cam, eqjToEnu, belowFade = 0) {
  const fovV = cam.fov * (cam.height / cam.width);
  const decStep = niceStep(fovV / 4);
  const raStep = niceStep(cam.fov / 8, RA_STEP_LADDER);
  ctx.strokeStyle = LINE_STYLES.eqGrid.color;
  ctx.lineWidth = LINE_STYLES.eqGrid.width;

  // Declination rings (including the celestial equator at 0).
  const rings = [];
  for (let dec = -DEC_MAX; dec <= DEC_MAX + 1e-9; dec += decStep) {
    if (Math.abs(dec) > DEC_MAX + 1e-9) continue;
    rings.push(Number(dec.toFixed(6)));
  }
  const ringPts = new Map();
  for (const dec of rings) {
    const pts = [];
    for (let ra = 0; ra <= 360; ra += SAMPLE_DEG) pts.push(eqToAltAz(eqjToEnu, ra, dec));
    ringPts.set(dec, pts);
    strokeSplit(ctx, projector, pts, belowFade);
  }

  // RA hour circles, pole to pole (stopping at the outermost rings so they don't pinch the poles).
  const circlePts = new Map();
  for (let ra = 0; ra < 360 - 1e-9; ra += raStep) {
    const pts = [];
    for (let dec = -DEC_MAX; dec <= DEC_MAX + 1e-9; dec += SAMPLE_DEG) pts.push(eqToAltAz(eqjToEnu, ra, dec));
    circlePts.set(ra, pts);
    strokeSplit(ctx, projector, pts, belowFade);
  }

  // Labels at each line's first on-screen point: Dec in degrees, RA in hours.
  ctx.font = EQ_LABEL_FONT;
  ctx.fillStyle = EQ_LABEL_COLOR;
  for (const [dec, pts] of ringPts) {
    const hit = firstOnScreen(projector, cam, pts, belowFade);
    if (!hit) continue;
    ctx.globalAlpha = hit.faded ? belowFade : 1;
    ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, hit.p.x + 3, hit.p.y - 2);
  }
  for (const [ra, pts] of circlePts) {
    const hit = firstOnScreen(projector, cam, pts, belowFade);
    if (!hit) continue;
    ctx.globalAlpha = hit.faded ? belowFade : 1;
    ctx.fillText(raLabel(ra), hit.p.x + 3, hit.p.y - 2);
  }
  ctx.globalAlpha = 1;
}
