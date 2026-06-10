// Equatorial (RA/Dec) grid: declination rings + right-ascension hour circles, fixed to the SKY,
// not the ground. Sample points are J2000 RA/Dec rotated through the same EQJ->ENU matrix the GPU
// stars use, so the grid stays glued to the stars and the spokes converge exactly at the celestial
// pole. Geometric (no refraction): ~0.5° drift vs the refracted stars at the very horizon —
// invisible at grid scale.
//
// Built for per-frame redraws: all math is vector-only (the ENU images of the EQJ axes are just
// the matrix columns, so a sample costs 2 trig calls + a few multiplies — no az/alt round-trips),
// lines whose closest point lies outside the view are skipped entirely (same idea as the alt-az
// grid's windowing), and one sample pass per line feeds the stroke AND the label anchor.

import { degToRad, radToDeg, wrap360 } from '../core/angles.js';
import { cameraBasis, MIN_VIS_Z } from '../core/projection.js';
import { LINE_STYLES } from './line-styles.js';
import { niceStep } from './grid.js';

const EQ_LABEL_COLOR = 'rgba(205, 170, 130, 0.55)';
const EQ_LABEL_FONT = '10px system-ui, sans-serif';
const SAMPLE_DEG = 2;        // polyline sampling resolution along each line
const DEC_MAX = 80;          // outermost declination ring (±); RA spokes continue to the pole itself
// RA steps that stay round in HOURS (0.25h..3h), so the labels read 6h / 6h30m, never 0h40m.
const RA_STEP_LADDER = [3.75, 7.5, 15, 30, 45];

// J2000 RA/Dec (degrees) -> { az, alt } via a column-major EQJ->ENU rotation (Float32Array(9),
// from eqjToEnuMatrix). Pure reference for the vector math below — unit tested against the
// vendor's star path (the renderer itself never goes through angles).
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

// Half the view's diagonal angle (deg) for windowing. Unlike grid.js's 89°-capped version this
// follows the FOV all the way out (at MAX_FOV the corners reach ~125° off-axis).
function halfDiagDeg(cam) {
  const aspect = cam.height / cam.width;
  return Math.min(150, 0.5 * cam.fov * Math.sqrt(1 + aspect * aspect) * 1.15);
}

// Draw the equatorial grid. eqjToEnu: column-major EQJ->ENU rotation for the current time/place
// (the same matrix main.js hands the GPU star transform). belowFade as everywhere else.
export function drawEqGrid(ctx, cam, eqjToEnu, belowFade = 0) {
  const m = eqjToEnu;
  // ENU images of the EQJ basis: column 0/1 span the celestial equator, column 2 is the pole.
  const E1 = [m[0], m[1], m[2]], E2 = [m[3], m[4], m[5]], P = [m[6], m[7], m[8]];
  const { right, up, fwd, focal, cx, cy } = cameraBasis(cam);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const fovV = cam.fov * (cam.height / cam.width);
  const decStep = niceStep(fovV / 4);
  const half = halfDiagDeg(cam) + 2 * SAMPLE_DEG; // windowing slack covers the sampling step
  const poleAng = radToDeg(Math.acos(Math.max(-1, Math.min(1, dot(fwd, P))))); // aim -> north celestial pole
  // Spoke spacing on the sphere shrinks ∝ sin(distance from the pole), so near a celestial pole a
  // FOV-only step floods the view with the entire converging fan (every spoke passes through both
  // poles). Widen the step by 1/sin like the alt-az grid does at the zenith; the ladder tops out
  // at 45°, so the wheel never thins below 8 spokes.
  const poleNear = Math.min(poleAng, 180 - poleAng);
  const raStep = niceStep(cam.fov / (8 * Math.max(Math.sin(degToRad(poleNear)), 1e-3)), RA_STEP_LADDER);

  // One sample pass per line -> flat screen-point cache (x, y, ok, belowHorizon), then cheap
  // strokes (above at full alpha, below at belowFade) and a label at the first on-screen point.
  const pts = { x: [], y: [], ok: [], below: [], n: 0 };
  const sample = (d) => {
    const i = pts.n++;
    const z = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
    if (z <= MIN_VIS_Z) { pts.ok[i] = false; return; }
    const k = (2 * focal) / (1 + z);
    pts.x[i] = cx + k * (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]);
    pts.y[i] = cy - k * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]);
    pts.ok[i] = true;
    pts.below[i] = d[2] < 0;
  };
  // Stroke the cached line, then label it. Rings label at their first on-screen sample (any RA is
  // as good as another). Spokes label at the on-screen sample CLOSEST TO THE EQUATOR (decAt maps
  // sample index -> declination): every spoke passes through both poles, so "first on-screen"
  // dumped every RA label onto the pole singularity in one overlapping pile — and a label within
  // ~15° of a pole is meaningless anyway (the pole belongs to every RA), so those are skipped.
  const strokeAndLabel = (label, decAt = null) => {
    for (const below of [false, true]) {
      if (below && belowFade <= 0) continue;
      ctx.globalAlpha = below ? belowFade : 1;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < pts.n; i++) {
        if (!pts.ok[i] || pts.below[i] !== below) { pen = false; continue; }
        if (!pen) { ctx.moveTo(pts.x[i], pts.y[i]); pen = true; } else ctx.lineTo(pts.x[i], pts.y[i]);
      }
      ctx.stroke();
    }
    let best = -1, bestDec = Infinity;
    for (let i = 0; i < pts.n; i++) {
      if (!pts.ok[i] || (pts.below[i] && belowFade <= 0)) continue;
      if (pts.x[i] < 0 || pts.x[i] > cam.width || pts.y[i] < 0 || pts.y[i] > cam.height) continue;
      if (!decAt) { best = i; break; }
      const d = Math.abs(decAt(i));
      if (d < bestDec) { bestDec = d; best = i; }
    }
    if (best >= 0 && (!decAt || bestDec <= 75)) {
      ctx.globalAlpha = pts.below[best] ? belowFade : 1;
      ctx.fillText(label, pts.x[best] + 3, pts.y[best] - 2);
    }
    pts.n = 0;
  };

  ctx.strokeStyle = LINE_STYLES.eqGrid.color;
  ctx.lineWidth = LINE_STYLES.eqGrid.width;
  ctx.font = EQ_LABEL_FONT;
  ctx.fillStyle = EQ_LABEL_COLOR;

  // Declination rings (including the celestial equator): circles of angular radius 90-dec around
  // the pole. On screen iff the ring's closest approach to the aim is inside the view.
  for (let dec = -DEC_MAX; dec <= DEC_MAX + 1e-9; dec += decStep) {
    if (Math.abs(poleAng - (90 - dec)) > half) continue; // entire ring outside the view
    const cd = Math.cos(degToRad(dec)), sd = Math.sin(degToRad(dec));
    const c = [P[0] * sd, P[1] * sd, P[2] * sd];
    for (let ra = 0; ra <= 360; ra += SAMPLE_DEG) {
      const cr = Math.cos(degToRad(ra)) * cd, sr = Math.sin(degToRad(ra)) * cd;
      sample([c[0] + E1[0] * cr + E2[0] * sr, c[1] + E1[1] * cr + E2[1] * sr, c[2] + E1[2] * cr + E2[2] * sr]);
    }
    strokeAndLabel(`${dec > 0 ? '+' : ''}${Number(dec.toFixed(4))}°`);
  }

  // RA hour circles, POLE TO POLE so the spokes meet at the celestial pole. Each is half a great
  // circle through both poles; its plane normal is the equator direction at ra+90°, and the
  // half-circle is on screen iff the aim is within `half` of its plane AND of its hemisphere.
  for (let ra = 0; ra < 360 - 1e-9; ra += raStep) {
    const cr = Math.cos(degToRad(ra)), sr = Math.sin(degToRad(ra));
    const dirEq = [E1[0] * cr + E2[0] * sr, E1[1] * cr + E2[1] * sr, E1[2] * cr + E2[2] * sr];
    const normal = [E1[0] * -sr + E2[0] * cr, E1[1] * -sr + E2[1] * cr, E1[2] * -sr + E2[2] * cr];
    const offPlane = Math.abs(radToDeg(Math.asin(Math.max(-1, Math.min(1, dot(fwd, normal))))));
    if (offPlane > half) continue;                       // whole great circle outside the view
    if (dot(fwd, dirEq) < 0 && poleAng > half && 180 - poleAng > half) continue; // wrong half, poles hidden
    for (let dec = -90; dec <= 90 + 1e-9; dec += SAMPLE_DEG) {
      const cd = Math.cos(degToRad(dec)), sd = Math.sin(degToRad(dec));
      sample([dirEq[0] * cd + P[0] * sd, dirEq[1] * cd + P[1] * sd, dirEq[2] * cd + P[2] * sd]);
    }
    strokeAndLabel(raLabel(ra), (i) => -90 + i * SAMPLE_DEG);
  }
  ctx.globalAlpha = 1;
}
