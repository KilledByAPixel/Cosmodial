import { Body } from '../core/astro.js';
import { clamp } from '../core/angles.js';

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

// Apparent magnitude -> planet disk radius (px). Brighter (smaller mag) -> larger.
// Planets read as small disks, a bit bigger than stars so they stand out.
export function planetRadius(mag) {
  return clamp(4 - mag * 0.6, 2.5, 6);
}
