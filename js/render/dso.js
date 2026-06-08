import { degToRad, clamp } from '../core/angles.js';

const MIN_GLOW_R = 2;        // px floor so tiny objects still show as a faint dot
const MAX_ALPHA = 0.6;       // even the brightest DSO is a faint glow, never a solid blob

// On-screen radius (px) from real angular size (arcmin), via the same focal projection as
// markerRadius — so a DSO grows as you zoom in (unlike a magnitude-sized star). Floored.
export function dsoScreenRadius(sizeArcmin, cam) {
  const focal = (cam.width / 2) / Math.tan(degToRad(cam.fov) / 2);
  const radiusDeg = (sizeArcmin / 60) / 2; // arcmin diameter -> degree radius
  return Math.max(focal * Math.tan(degToRad(radiusDeg)), MIN_GLOW_R);
}

// Peak glow alpha from a surface-brightness proxy: sb = mag + 2.5*log10(area_arcmin2). Spreading the
// same total magnitude over more area raises sb (dimmer per pixel). Mapped sb≈[6..14] -> alpha[MAX..0].
export function dsoAlpha(mag, sizeArcmin) {
  const area = Math.PI * (sizeArcmin / 2) ** 2;
  const sb = mag + 2.5 * Math.log10(Math.max(area, 1));
  return clamp(((14 - sb) / 8) * MAX_ALPHA, 0, MAX_ALPHA);
}

const SYMBOLS = { galaxy: 'ellipse', nebula: 'box', 'open cluster': 'dashed-circle', 'globular cluster': 'cross-circle' };

// Cartographic outline shape for a DSO type (atlas convention). Unknown -> 'box'.
export function dsoSymbol(type) { return SYMBOLS[type] || 'box'; }

const GLOW_TINT = { galaxy: '210,215,230', nebula: '200,215,225', 'open cluster': '215,222,235', 'globular cluster': '225,222,210' };
const SYMBOL_COLOR = 'rgba(150, 190, 230, 0.85)';
const LABEL_COLOR = 'rgba(150, 190, 230, 0.9)';

// Pass 1: realistic soft glow. Drawn BEFORE stars so it reads as background nebulosity.
// dsos: [{ altaz, mag, sizeArcmin, minorArcmin, angleDeg, type }]. `below` reveals sub-horizon (full sphere).
export function drawDsoGlow(ctx, dsos, projector, cam, below = false) {
  for (const d of dsos) {
    if (!below && d.altaz.alt < 0) continue;
    const p = projector(d.altaz.az, d.altaz.alt);
    if (!p.visible) continue;
    const r = dsoScreenRadius(d.sizeArcmin, cam);
    const a = dsoAlpha(d.mag, d.sizeArcmin);
    if (a <= 0.01) continue; // effectively invisible — skip
    const tint = GLOW_TINT[d.type] || '210,215,230';
    ctx.save();
    ctx.translate(p.x, p.y);
    // Elliptical for objects with a minor axis + position angle; circular otherwise.
    if (Number.isFinite(d.minorArcmin) && d.minorArcmin > 0 && d.minorArcmin < d.sizeArcmin) {
      ctx.rotate(degToRad(d.angleDeg || 0));
      ctx.scale(1, d.minorArcmin / d.sizeArcmin);
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${tint},${a})`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Pass 2: cartographic symbol + label. Drawn AFTER stars. `which`: a Set of ids to draw, or null = all.
export function drawDsoSymbols(ctx, dsos, projector, cam, { labels = true, below = false, which = null } = {}) {
  ctx.font = '11px system-ui, sans-serif';
  for (const d of dsos) {
    if (which && !which.has(d.id)) continue;
    if (!below && d.altaz.alt < 0) continue;
    const p = projector(d.altaz.az, d.altaz.alt);
    if (!p.visible) continue;
    const r = Math.max(dsoScreenRadius(d.sizeArcmin, cam), 6) + 3; // bracket the glow, min legible size
    ctx.strokeStyle = SYMBOL_COLOR;
    ctx.lineWidth = 1.5;
    drawSymbolShape(ctx, dsoSymbol(d.type), p.x, p.y, r);
    if (labels && d.name) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(d.name, p.x + r + 3, p.y - r - 3);
    }
  }
}

function drawSymbolShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'box') {
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);
  } else if (shape === 'dashed-circle') {
    ctx.setLineDash([3, 3]);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else { // cross-circle (globular)
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
  }
}
