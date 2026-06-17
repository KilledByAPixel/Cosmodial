import { Body } from '../core/astro.js';
import { clamp } from '../core/angles.js';
import { starSize } from './starstyle.js';

// The planets we render: the five naked-eye ones, the two ice giants, and Pluto for completeness.
// Each carries a representative tint for its disk marker. Uranus (~mag 5.7), Neptune (~mag 7.8), and
// Pluto (~mag 14.5) are too faint for the unaided eye; they fall to the smallest disk (planetRadius
// saturates at its floor) and dim toward the alpha floor (markerAlpha in main.js), so they read as
// faint pinpoints, not bright discs. Pluto has no texture (none exists at our source) — it stays a dot.
export const PLANETS = [
  { body: Body.Mercury, name: 'Mercury', color: '#b0a48f', tex: 'mercury' },
  { body: Body.Venus,   name: 'Venus',   color: '#fff4d6', tex: 'venus' }, // cloud deck (what an eye sees), not the radar surface
  { body: Body.Mars,    name: 'Mars',    color: '#ff6a4d', tex: 'mars' },
  { body: Body.Jupiter, name: 'Jupiter', color: '#e3c8a0', tex: 'jupiter' },
  { body: Body.Saturn,  name: 'Saturn',  color: '#e8d9a0', tex: 'saturn', rings: true },
  { body: Body.Uranus,  name: 'Uranus',  color: '#bfe3e8', tex: 'uranus' },
  { body: Body.Neptune, name: 'Neptune', color: '#7c9fe0', tex: 'neptune' },
  { body: Body.Pluto,   name: 'Pluto',   color: '#c9b29a' },
];

// Apparent magnitude -> planet disk radius (px). A naked-eye planet is a POINT — far smaller than the
// Moon's disc — so unlike a star it conveys brightness through its glow (alpha/colour via markerAlpha),
// NOT through size. We borrow the star magnitude->radius CURVE only for a gentle bright-is-slightly-
// bigger gradient, then crush it down by POP and floor it, so every planet stays a small point well
// under the Moon (Venus is the brightest, not the biggest). `zoom` (from zoomScale) tracks the star
// scaling so the points shrink on zoom-out and grow on zoom-in until the true disc resolves.
const PLANET_POP = 0.90;   // brightest-planet size as a fraction of the star cap STAR_MAX_R (bright planet
                           // ≈ STAR_MAX_R*POP px). COUPLED to STAR_MAX_R — change that and the planets move
                           // too. Raised toward Stellarium's exaggeration; bright planet ≈ 2.7px.
const PLANET_MIN_R = 1.2;  // floor (px) for the faint outer planets — tiny specks, brightness via alpha
export function planetRadius(mag, zoom = 1) {
  return Math.max(starSize(mag, zoom).radius * PLANET_POP, PLANET_MIN_R);
}

// Glow-brightness boost for planets — multiplies their markerAlpha. Because planet points are smaller
// than the bright stars, size alone can't make Venus out-shine them; this burns the bright planets'
// additive glow past white so a tiny Venus reads brighter than a bigger-but-dimmer star, while the faint
// outer planets stay dim (their markerAlpha is already low). The additive GL path uses the >1 value; the
// 2D fallback harmlessly clamps alpha to 1. Raise to make planets out-shine the stars more.
export const PLANET_GLOW = 1.8;

// Glow-chip opacity (0..1) as a planet zooms past the point where its true projected disc first
// exceeds the glow dot (projectedPx == dotPx) and the 3D sphere starts drawing. Instead of popping
// the chip off that instant, we keep it lit over the sphere and fade it out over a short zoom range
// — until the disc is `growth` larger than the dot (default +50%) — so the chip dissolves to reveal
// the planet underneath. Returns 1 at (and below) the resolve threshold, 0 once fully resolved, with
// a smoothstep ease so neither end snaps. PURE — unit-tested.
export function planetChipFade(projectedPx, dotPx, growth = 0.5) {
  if (projectedPx <= dotPx) return 1;
  const t = clamp((projectedPx - dotPx) / (growth * dotPx), 0, 1);
  return 1 - t * t * (3 - 2 * t);
}
