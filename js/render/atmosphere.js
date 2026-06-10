// Pure atmosphere/sky math — no GL, no Astronomy Engine import. Mirrors the philosophy of
// starstyle.js/projection.js: the WebGL shaders re-implement these formulas as GLSL literals, and
// unit tests pin the behaviour so the GPU can't silently drift from the CPU reference here.

import { degToRad, clamp } from '../core/angles.js';

// Hermite smoothstep: 0 below `a`, 1 above `b`, eased in between.
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// Convex blend of three colours by weights that sum to 1 (night/twilight/day).
const blend3 = (cN, cT, cD, wN, wT, wD) => [
  cN[0] * wN + cT[0] * wT + cD[0] * wD,
  cN[1] * wN + cT[1] * wT + cD[1] * wD,
  cN[2] * wN + cT[2] * wT + cD[2] * wD,
];

// Per-channel atmospheric extinction coefficients (magnitudes lost per air mass). Blue is scattered
// more than red (Rayleigh), so low stars dim AND redden. Art-tuned for a believable look, not a
// photometric standard (V-band is ~0.2; we exaggerate the B–R spread a little for visible reddening).
export const EXT_K = Object.freeze({ r: 0.10, g: 0.15, b: 0.24 });

// Kasten–Young (1989) relative air mass for an apparent altitude (degrees). ~1 at the zenith, ~38 at
// the horizon. Altitude is clamped at 0 so below-horizon inputs stay finite (those stars are culled
// before drawing anyway).
export function airmass(altDeg) {
  const h = Math.max(altDeg, 0);
  return 1 / (Math.sin(degToRad(h)) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

// Per-channel transmission [r,g,b] (0..1) for a star at the given altitude, relative to the zenith
// (zenith => [1,1,1]). Multiply a star's emitted colour by this to dim + redden it near the horizon.
export function extinction(altDeg) {
  const dx = airmass(altDeg) - 1; // extra air masses beyond the zenith
  return [
    Math.pow(10, -0.4 * EXT_K.r * dx),
    Math.pow(10, -0.4 * EXT_K.g * dx),
    Math.pow(10, -0.4 * EXT_K.b * dx),
  ];
}

// --- Art-directed sky palette (linear-ish RGB 0..1). Tuned by feel, not a physical sky model. ---
const ZENITH_DAY = [0.16, 0.34, 0.66], HORIZON_DAY = [0.55, 0.70, 0.90];
const ZENITH_DUSK = [0.05, 0.06, 0.16], HORIZON_DUSK = [0.80, 0.40, 0.22];
const ZENITH_NIGHT = [0.004, 0.006, 0.012], HORIZON_NIGHT = [0.015, 0.020, 0.035];
const SUN_GLOW_COLOR = [1.0, 0.62, 0.32];

// Sky-rendering parameters for the background pass, from the Sun's altitude (degrees). Returns the
// zenith/horizon/glow colours plus scalars the shader blends by a fragment's altitude and angle to
// the Sun. Day / twilight / night are weighted so they form a convex blend (weights sum to 1), which
// keeps every output colour in range. PURE + unit-tested; the shader consumes these as uniforms.
export function skyParams(sunAltDeg) {
  const day = smoothstep(-6, 3, sunAltDeg);          // 1 in full daylight, 0 by civil dusk
  const night = 1 - smoothstep(-18, -8, sunAltDeg);  // 1 once astronomically dark
  const twilight = clamp(1 - day - night, 0, 1);     // peaks across the twilight band

  return {
    zenithColor: blend3(ZENITH_NIGHT, ZENITH_DUSK, ZENITH_DAY, night, twilight, day),
    horizonColor: blend3(HORIZON_NIGHT, HORIZON_DUSK, HORIZON_DAY, night, twilight, day),
    sunGlowColor: SUN_GLOW_COLOR.slice(),
    sunGlowStrength: clamp(twilight + day * 0.4, 0, 1), // warm lobe around the Sun, strongest at dusk
    mwVisibility: night,                                // Milky Way only shows once the sky is dark
    horizonAirglow: night * 0.5,                        // faint night lift hugging the horizon
    starDayFade: 1 - smoothstep(-8, 2, sunAltDeg),      // 1 at night, 0 in daylight (multiplies star alpha)
    extinction: 1,                                      // star-shader extinction gain (0 only in space view)
    // The lower hemisphere always renders as FULL NIGHT, whatever the Sun is doing: looking below
    // the horizon is looking away from the lit atmosphere, so down there the palette/airglow are
    // pinned at their astronomical-night values (the shaders blend toward these across
    // BELOW_NIGHT_BAND just under the horizon; the Milky Way and stars use their full-night
    // strength below via the same blend).
    belowZenithColor: ZENITH_NIGHT.slice(),
    belowHorizonColor: HORIZON_NIGHT.slice(),
    belowAirglow: 0.5,                                  // == horizonAirglow at full night
  };
}

// How far below the horizon (in sin-altitude units; 0.1 ~ the first 5.7°) the sky/star shaders
// blend from the live daytime/twilight look to the pinned full-night look of the lower
// hemisphere. Embedded as a GLSL literal in sky-background.js and starfield-gl.js.
export const BELOW_NIGHT_BAND = 0.1;

// How visible the below-horizon sky is for a given aim altitude (deg): 0 at/above the horizon,
// 1 once aiming FULL_BELOW_DEG below, smoothstep-eased between. This replaces the old full-sphere
// toggle — dip the view under the horizon and the lower hemisphere fades in; tilt back up and it
// fades away. There is nothing to switch.
export const FULL_BELOW_DEG = 10;
export function belowHorizonFade(aimAltDeg) {
  return smoothstep(0, FULL_BELOW_DEG, -aimAltDeg);
}

// Sky params with the atmosphere switched OFF ("space view"): pure black sky, no Sun glow or
// airglow, stars and the Milky Way at full strength regardless of the Sun, and extinction 0 so the
// star shader skips the horizon dimming/reddening too. Same shape as skyParams() — main.js swaps
// between the two on the `atmo` flag. (Refraction stays on either way: turning it off would shift
// near-horizon positions and desync the GPU stars from the CPU picking positions.)
export function spaceSkyParams() {
  return {
    zenithColor: [0, 0, 0],
    horizonColor: [0, 0, 0],
    sunGlowColor: SUN_GLOW_COLOR.slice(),
    sunGlowStrength: 0,
    mwVisibility: 1,
    horizonAirglow: 0,
    starDayFade: 1,
    extinction: 0,
    belowZenithColor: [0, 0, 0], // space view is black in every direction — no night palette below
    belowHorizonColor: [0, 0, 0],
    belowAirglow: 0,
  };
}

// The vendor stores rotations so that RotateVector computes out_i = sum_j rot[j][i]*v_j; the matrix
// that *applies* the rotation (A*v == RotateVector(rot, v)) is therefore the transpose of `.rot`.
const applied = (rot) => [
  [rot[0][0], rot[1][0], rot[2][0]],
  [rot[0][1], rot[1][1], rot[2][1]],
  [rot[0][2], rot[1][2], rot[2][2]],
];
const mul3 = (A, B) => {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let k = 0; k < 3; k++)
      M[i][k] = A[i][0] * B[0][k] + A[i][1] * B[1][k] + A[i][2] * B[2][k];
  return M;
};
// Column-major flatten (index = col*3 + row) for gl.uniformMatrix3fv(loc, false, m).
const colMajor = (M) => new Float32Array([
  M[0][0], M[1][0], M[2][0],
  M[0][1], M[1][1], M[2][1],
  M[0][2], M[1][2], M[2][2],
]);
// Basis change from our [East,North,Up] ray to the vendor's horizontal frame [North,West,Zenith].
const B_ENU_HOR = [
  [0, 1, 0],   // North  =  enu.y
  [-1, 0, 0],  // West   = -enu.x
  [0, 0, 1],   // Zenith =  enu.z
];

// Build the ENU-ray -> J2000 (EQJ) rotation as a column-major Float32Array(9). `rotHorEqj` is the
// vendor's raw 3x3 (.rot) for HOR->EQJ. Composes eqj = (applied HOR->EQJ) * (B: ENU->HOR) * enu.
export function enuToEqjMatrix(rotHorEqj) {
  return colMajor(mul3(applied(rotHorEqj), B_ENU_HOR));
}

// Build the ENU-ray -> galactic rotation as a column-major Float32Array(9), for sampling the all-sky
// (galactic-frame) Milky Way texture. `rotEqjGal` is the vendor's raw EQJ->GAL `.rot`. Composes
// gal = (applied EQJ->GAL) * (applied HOR->EQJ) * (B: ENU->HOR) * enu.
export function enuToGalMatrix(rotHorEqj, rotEqjGal) {
  return colMajor(mul3(applied(rotEqjGal), mul3(applied(rotHorEqj), B_ENU_HOR)));
}

// Fade the painted Milky Way out as the user zooms in (narrow FOV), so crisp catalog stars take over
// up close and the photographic band only shows at wide naked-eye views. 1 at/above `wide`, 0 at/below
// `narrow`, smoothly eased between.
export function milkyWayZoomFade(fovDeg, { wide = 55, narrow = 22 } = {}) {
  return smoothstep(narrow, wide, fovDeg);
}
