const LINE_COLOR = 'rgba(120, 160, 210, 0.33)'; // subtle, sits under the stars
const LABEL_COLOR = 'rgba(140, 175, 215, 0.6)';
const LABEL_FONT = '12px system-ui, sans-serif';

// Is this cached alt/az point above the horizon and in front of the camera? Returns the projected
// {x,y} (visible) or null.
function visiblePoint(altaz, projector) {
  if (altaz.alt < 0) return null;
  const p = projector(altaz.az, altaz.alt);
  return p.visible ? p : null;
}

// Draw constellation figures (cached alt/az), projected with the per-frame projector.
// constellations: [ { name, label:{alt,az}, lines: [ [ {alt,az}, ... ], ... ] } ]
export function drawConstellations(ctx, projector, constellations, cam) {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  for (const con of constellations) {
    for (const poly of con.lines) {
      ctx.beginPath();
      let pen = false;  // whether the path currently has a live point to draw from
      let drew = false; // whether any segment was actually added this polyline
      for (const vertex of poly) {
        const p = visiblePoint(vertex, projector);
        if (!p) { pen = false; continue; } // break the line on a culled/below-horizon vertex
        if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else { ctx.lineTo(p.x, p.y); drew = true; }
      }
      if (drew) ctx.stroke(); // skip the no-op stroke when the whole polyline is off-screen
    }
  }
  // Labels on top of the figures, only when on-screen.
  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_COLOR;
  for (const con of constellations) {
    const p = visiblePoint(con.label, projector);
    if (p && p.x >= 0 && p.x <= cam.width && p.y >= 0 && p.y <= cam.height) {
      ctx.fillText(con.name, p.x, p.y);
    }
  }
}
