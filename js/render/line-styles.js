// One place to tune the overlay lines drawn on the 2D canvas. `width` is the CSS-px stroke width;
// `color` is any CSS colour string (the alpha sets how subtle the line is). The constellation figures,
// both grids, and the horizon line all read from here, so you can restyle them without hunting
// through the renderers. (The compass pill lives in hud.js, deep-sky symbols in dso.js.)
export const LINE_STYLES = {
  constellation: { width: 3.0, color: 'rgba(120, 160, 210, 0.33)' },
  grid: { width: 2.5, color: 'rgba(150, 200, 220, 0.3)' },
  eqGrid: { width: 2.0, color: 'rgba(200, 155, 105, 0.3)' }, // warm, so it reads apart from the cool alt-az grid
  horizon: { width: 2.0, color: 'rgba(120, 160, 200, 0.4)' },
};
