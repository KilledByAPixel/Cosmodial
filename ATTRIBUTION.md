# Attribution

- **Star data:** HYG Database v4.1 (astronexus/HYG-Database,
  https://github.com/astronexus/HYG-Database — `hyg/CURRENT/hygdata_v41.csv`),
  licensed **CC-BY-SA 4.0**. Cosmodial ships a magnitude-limited (mag <= 9.6), field-trimmed
  subset in `data/stars.json`; that subset is likewise CC-BY-SA 4.0.
- **Astronomy calculations:** Astronomy Engine v2.1.19 (cosinekitty/astronomy,
  https://github.com/cosinekitty/astronomy), **MIT** — vendored at `js/vendor/astronomy.js`
  (downloaded from https://cdn.jsdelivr.net/npm/astronomy-engine@2/esm/astronomy.js) with its
  original license header.
- **Constellation lines:** figure line data from d3-celestial (ofrohn/d3-celestial), **BSD-3-Clause**
  (https://github.com/ofrohn/d3-celestial). Converted to RA/Dec polylines in `data/constellations.json`.
- **Deep-sky objects:** OpenNGC (mattiaverga/OpenNGC, https://github.com/mattiaverga/OpenNGC),
  **CC-BY-SA 4.0**. Cosmodial ships a small curated subset in `data/dso.json`; that subset is likewise CC-BY-SA 4.0.
- **Milky Way panorama:** "Stars and Milky Way" equirectangular sky texture from Solar System Scope
  (https://www.solarsystemscope.com/textures/), **CC-BY 4.0**. Downscaled to a 4096×2048 WebP in
  `data/milkyway-4k.webp` and used as the all-sky background behind the catalogue stars.
- **Moon map:** "Moon" equirectangular albedo texture from Solar System Scope
  (https://www.solarsystemscope.com/textures/), **CC-BY 4.0**. Downscaled to a 2048×1024 WebP in
  `data/moon-2k.webp` and used as the lunar surface in the phase render.
- **Planet maps:** Mercury, Venus (atmosphere/cloud deck), Mars, Jupiter, Saturn, Uranus, and Neptune
  equirectangular surface textures from Solar System Scope (https://www.solarsystemscope.com/textures/),
  **CC-BY 4.0**. Downscaled to 2048×1024 WebPs in `data/<planet>-2k.webp` for the planet-disc render.
- **Saturn ring texture:** "Saturn Ring" alpha texture from Solar System Scope
  (https://www.solarsystemscope.com/textures/), **CC-BY 4.0**. Reduced to a 1024×16 RGBA radial strip in
  `data/saturn-rings.webp` (u spans the visible ring system, C-ring inner to A-ring outer edge).

- **Application code:** MIT (see `LICENSE`).
