// Small angle helpers. Angles in degrees unless a name says otherwise.
export const degToRad = (d) => (d * Math.PI) / 180;
export const radToDeg = (r) => (r * 180) / Math.PI;

// Normalize any angle into [0, 360).
export const wrap360 = (deg) => ((deg % 360) + 360) % 360;

// Constrain v to [lo, hi].
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Shortest distance between two bearings, in degrees (0..180).
export const angularSep = (a, b) => {
  const d = Math.abs(wrap360(a) - wrap360(b));
  return d > 180 ? 360 - d : d;
};
