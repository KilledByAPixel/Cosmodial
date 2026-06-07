# Attribution

- **Star data:** HYG Database v4.1 (astronexus/HYG-Database,
  https://github.com/astronexus/HYG-Database — `hyg/CURRENT/hygdata_v41.csv`),
  licensed **CC-BY-SA 4.0**. Skyscope ships a magnitude-limited (mag <= 7), field-trimmed
  subset in `data/stars.json`; that subset is likewise CC-BY-SA 4.0.
- **Astronomy calculations:** Astronomy Engine v2.1.19 (cosinekitty/astronomy,
  https://github.com/cosinekitty/astronomy), **MIT** — vendored at `js/vendor/astronomy.js`
  (downloaded from https://cdn.jsdelivr.net/npm/astronomy-engine@2/esm/astronomy.js) with its
  original license header.
- **Constellation lines:** figure line data from d3-celestial (ofrohn/d3-celestial), **BSD-3-Clause**
  (https://github.com/ofrohn/d3-celestial). Converted to RA/Dec polylines in `data/constellations.json`.
- **Application code:** MIT (see `LICENSE`).
