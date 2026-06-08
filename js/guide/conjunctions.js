// Pure geometry for conjunctions of bright bodies. No astronomy import — operates on alt/az positions
// already computed by main.js.

const DEG = Math.PI / 180;

// Spherical angular separation (degrees) between two { alt, az } points (degrees).
export function angularSep(a, b) {
  const alt1 = a.alt * DEG, alt2 = b.alt * DEG;
  const dAz = (a.az - b.az) * DEG;
  const cos = Math.sin(alt1) * Math.sin(alt2) + Math.cos(alt1) * Math.cos(alt2) * Math.cos(dAz);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
}

// Close pairs among `bodies` (each { label, altaz, mag }) within maxSepDeg, sorted closest-first.
export function findConjunctions(bodies, maxSepDeg) {
  const pairs = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sepDeg = angularSep(bodies[i].altaz, bodies[j].altaz);
      if (sepDeg <= maxSepDeg) pairs.push({ a: bodies[i], b: bodies[j], sepDeg });
    }
  }
  return pairs.sort((p, q) => p.sepDeg - q.sepDeg);
}

// Midpoint direction (alt/az, degrees) between two alt/az points, via unit-vector average
// (robust to azimuth wrap-around). Used to aim the view between a close pair.
export function midpointAltAz(a, b) {
  const toVec = (p) => {
    const al = p.alt * DEG, az = p.az * DEG;
    return [Math.cos(al) * Math.cos(az), Math.cos(al) * Math.sin(az), Math.sin(al)];
  };
  const [x1, y1, z1] = toVec(a), [x2, y2, z2] = toVec(b);
  const x = (x1 + x2) / 2, y = (y1 + y2) / 2, z = (z1 + z2) / 2;
  const r = Math.hypot(x, y, z) || 1;
  let az = Math.atan2(y, x) / DEG;
  if (az < 0) az += 360;
  return { alt: Math.asin(z / r) / DEG, az };
}
