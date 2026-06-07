import { Body } from '../core/astro.js';
import { clamp } from '../core/angles.js';

// The five naked-eye planets, with a representative tint for each disk marker.
export const PLANETS = [
  { body: Body.Mercury, name: 'Mercury', color: '#b0a48f' },
  { body: Body.Venus,   name: 'Venus',   color: '#fff4d6' },
  { body: Body.Mars,    name: 'Mars',    color: '#ff6a4d' },
  { body: Body.Jupiter, name: 'Jupiter', color: '#e3c8a0' },
  { body: Body.Saturn,  name: 'Saturn',  color: '#e8d9a0' },
];

// Apparent magnitude -> planet disk radius (px). Brighter (smaller mag) -> larger.
// Planets read as small disks, a bit bigger than stars so they stand out.
export function planetRadius(mag) {
  return clamp(4 - mag * 0.6, 2.5, 6);
}
