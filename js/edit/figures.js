const EPS = 1e-3; // deg; clicked stars use exact catalog coords, so a tiny epsilon is plenty.
const samePt = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const sameEdge = (seg, a, b) =>
  (samePt(seg[0], a) && samePt(seg[1], b)) || (samePt(seg[0], b) && samePt(seg[1], a));

// Normalize each figure's polylines into 2-point segments (one edge each). Preserves name + abbr.
export function splitSegments(figures) {
  return figures.map((f) => {
    const lines = [];
    for (const poly of f.lines) {
      for (let i = 0; i + 1 < poly.length; i++) lines.push([poly[i], poly[i + 1]]);
    }
    return { name: f.name, abbr: f.abbr, lines };
  });
}

// Toggle edge A-B (each [ra,dec]) in an array of 2-point segments: remove if present, else append.
export function toggleEdge(lines, a, b) {
  const idx = lines.findIndex((seg) => sameEdge(seg, a, b));
  if (idx >= 0) return lines.filter((_, i) => i !== idx);
  return [...lines, [a, b]];
}

// Nearest item to (x,y) within maxDist px among projected points [{x,y,visible,ref}]. Returns ref|null.
export function pickNearest(projected, x, y, maxDist) {
  let best = null, bd = maxDist;
  for (const p of projected) {
    if (!p.visible) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bd) { bd = d; best = p.ref; }
  }
  return best;
}

// Circular-mean RA + plain-mean Dec of [ra,dec] points (label position; handles 0/360 wrap).
export function circularCentroid(pts) {
  const r = Math.PI / 180;
  let sin = 0, cos = 0, dec = 0;
  for (const [ra, d] of pts) { sin += Math.sin(ra * r); cos += Math.cos(ra * r); dec += d; }
  const round = (v) => Math.round(v * 100) / 100;
  const ra = ((Math.atan2(sin, cos) / r) + 360) % 360;
  return [round(ra), round(dec / pts.length)];
}

// Serialize figures to the constellations.json shape (drops empties, recomputes labels). Keeps abbr.
export function exportFigures(figures) {
  return figures
    .filter((f) => f.lines.length > 0)
    .map((f) => ({ name: f.name, abbr: f.abbr, label: circularCentroid(f.lines.flat()), lines: f.lines }));
}
