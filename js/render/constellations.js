import { LINE_STYLES } from './line-styles.js';

const LABEL_COLOR = 'rgba(140, 175, 215, 0.6)';
const LABEL_FONT = '12px system-ui, sans-serif';

// Draw constellation figures (cached alt/az), projected with the per-frame projector.
// constellations: [ { name, label:{alt,az}, lines: [ [ {alt,az}, ... ], ... ] } ]
// belowFade (0..1): segments touching a below-horizon vertex draw at that alpha (skipped entirely
// at 0, full strength at 1). Edit mode always shows the whole sphere at full alpha.
export function drawConstellations(ctx, projector, constellations, cam, edit, labels = true, belowFade = 0) {
  const fade = edit ? 1 : belowFade;
  ctx.strokeStyle = LINE_STYLES.constellation.color;
  ctx.lineWidth = LINE_STYLES.constellation.width;
  // Two stroke batches: segments wholly above the horizon (full alpha), then segments touching a
  // below-horizon vertex (fade alpha) — globalAlpha applies per stroke, not per vertex.
  for (const batch of [{ below: false, alpha: 1 }, { below: true, alpha: fade }]) {
    if (batch.below && fade <= 0) continue;
    ctx.globalAlpha = batch.alpha;
    for (const con of constellations) {
      for (const poly of con.lines) {
        ctx.beginPath();
        let prev = null;  // previous vertex { x, y, below }, or null if it was culled
        let drew = false;
        for (const vertex of poly) {
          const p = projector(vertex.az, vertex.alt);
          const pt = p.visible ? { x: p.x, y: p.y, below: vertex.alt < 0 } : null;
          if (prev && pt && (prev.below || pt.below) === batch.below) {
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(pt.x, pt.y);
            drew = true;
          }
          prev = pt;
        }
        if (drew) ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  // Labels on top of the figures, only when on-screen and the labels flag is on.
  if (!labels) return;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_COLOR;
  for (const con of constellations) {
    const below = con.label.alt < 0;
    if (below && fade <= 0) continue;
    const p = projector(con.label.az, con.label.alt);
    if (p.visible && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height) {
      ctx.globalAlpha = below ? fade : 1;
      ctx.fillText(con.name, p.x, p.y);
    }
  }
  ctx.globalAlpha = 1;
}
