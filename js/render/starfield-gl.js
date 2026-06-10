// WebGL2 starfield: draws the whole star catalogue as glowing point sprites in ONE draw call, plus
// the Sun/Moon/planet markers as a second small glowing-sprite pass.
//
// The star POINTS + glow and the marker discs + glow live here; the rest (grid, constellation lines,
// all text LABELS, HUD) stays on the Canvas-2D overlay above this canvas (see sky.js / main.js).
// Star attributes (J2000 unit vectors + colour/mag/alphaScale) are uploaded ONCE at boot from the raw
// catalogue; per frame, one EQJ->ENU rotation matrix uniform + in-shader forward refraction position
// them (see star-transform.js). The CPU skyObjects remap in computeSky() survives only as the
// picking/guide/label data source. Per frame we set a handful of camera uniforms and issue
// gl.drawArrays(POINTS).
//
// Projection and sizing mirror the CPU exactly: the projection algebra reuses cameraBasis() from
// projection.js, and the star-size formula mirrors starSize()/STAR_CONSTS from starstyle.js. Colour
// (bvToRGB) and the colour-brightness factor (colorBrightness) are precomputed at boot by
// buildStarAttributesJ2000 in star-transform.js.

import { cameraBasis, vec } from '../core/projection.js';
import { zoomScale, STAR_CONSTS } from './starstyle.js';
import { EXT_K, milkyWayZoomFade, BELOW_NIGHT_BAND, skyVeil } from './atmosphere.js';
import { createSkyBackground } from './sky-background.js';
import { createBodySphere } from './body-sphere.js';
import { REFRACTION_GLSL, buildStarAttributesJ2000 } from './star-transform.js';

// --- Star glow tunables (tweak to taste) ---
const GLOW_SCALE = 9.0;    // sprite diameter as a multiple of the 2D core radius — room for the halo
const GLOW_FALLOFF = 9.0;  // halo falloff exponent: higher = tighter core, softer fade to the edge
const GLOW_BRIGHTNESS = 2.0; // overall light gain: >1 brightens (bright cores bloom to white), <1 dims. Try ~1.3–1.6.

// --- Marker (Sun/Moon/planet) glow tunables ---
// Markers render as a solid disc (their true angular/disk radius) plus a soft halo, so the Sun and
// Moon read at roughly their real size while still glowing like the stars.
const MARKER_GLOW_SCALE = 5.0;    // sprite diameter as a multiple of the disc diameter — halo room beyond the disc
const MARKER_GLOW_FALLOFF = 5.0;  // halo falloff exponent past the disc edge
const MARKER_BRIGHTNESS = 2.0;    // overall light gain for markers (matches GLOW_BRIGHTNESS for stars)

const FLOATS_PER_STAR = 8; // aDir(3) + aColor(3) + aMag(1) + aAlphaScale(1)
const STRIDE = FLOATS_PER_STAR * 4; // bytes
const FLOATS_PER_MARKER = 8; // aDir(3) + aColor(3) + aCoreRadius(1) + aAlpha(1)
const MARKER_STRIDE = FLOATS_PER_MARKER * 4; // bytes

// Format a JS number as a GLSL float literal (always with a decimal point: 5 -> "5.0").
function glslFloat(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

// Parse a CSS hex colour ('#rrggbb' or '#rgb') to [r, g, b] in 0..1. Returns white on bad input.
export function hexToRgb01(hex) {
  if (typeof hex !== 'string') return [1, 1, 1];
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [1, 1, 1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Build the per-marker vertex data (Sun/Moon/planets). PURE (no GL) so it's unit-testable.
// markerList items: { az, alt, color (hex), radiusPx (CSS px disc radius), alpha (0..1 glow gain) }.
// Interleaved layout per marker (stride 8 floats): [dirX, dirY, dirZ, r, g, b, coreRadiusPx, alpha].
export function buildMarkerAttributes(markerList) {
  const count = markerList.length;
  const data = new Float32Array(count * FLOATS_PER_MARKER);
  for (let i = 0; i < count; i++) {
    const m = markerList[i];
    const d = vec(m.az, m.alt);
    const rgb = hexToRgb01(m.color);
    const o = i * FLOATS_PER_MARKER;
    data[o] = d[0]; data[o + 1] = d[1]; data[o + 2] = d[2];
    data[o + 3] = rgb[0]; data[o + 4] = rgb[1]; data[o + 5] = rgb[2];
    data[o + 6] = m.radiusPx;
    data[o + 7] = m.alpha;
  }
  return { data, count };
}

// Vertex shader source. Replicates projectPoint() (stereographic, via the camera-basis uniforms) and
// starSize() (the STAR_CONSTS embedded below as GLSL literals — a test guards against drift).
export function vertexShaderSource() {
  const C = STAR_CONSTS;
  return `#version 300 es
precision highp float;

layout(location = 0) in vec3 aDir;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aMag;
layout(location = 3) in float aAlphaScale;

uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uFocal;     // CSS px
uniform vec2 uViewport;   // CSS px
uniform float uDpr;       // device pixels per CSS px (gl_PointSize is in device px)
uniform float uZoom;      // from zoomScale(fov)
uniform float uMaxPointSize;
uniform float uBelowFade;   // 0..1: visibility of the below-horizon sky (0 = culled, 1 = full)
uniform float uExtinction;  // 1 = atmospheric extinction on; 0 = space view (no dimming/reddening)
uniform float uStarDayFade; // 1 at night, 0 in daylight — fades stars out when the sky is bright
uniform mat3 uEqjToEnu;      // J2000 -> ENU (true direction); per-frame rotation for GPU star transform

out vec3 vColor;
out float vAlpha;

${REFRACTION_GLSL}

void main() {
  // GPU star transform: aDir holds the star's FIXED J2000 vector. Rotate by the per-frame EQJ->ENU
  // matrix, then lift true altitude to apparent with the same forward refraction the CPU path
  // (Horizon 'normal') applies.
  vec3 e = uEqjToEnu * aDir;
  float trueAlt = degrees(asin(clamp(e.z, -1.0, 1.0)));
  float appAlt = radians(trueAlt + refractionDeg(trueAlt));
  float hxy = length(e.xy);
  vec3 dir = (hxy < 1e-6) ? e : vec3(e.xy * (cos(appAlt) / hxy), sin(appAlt));
  // dir.z == sin(alt): below-horizon stars fade by uBelowFade (culled entirely at 0).
  if (uBelowFade <= 0.0 && dir.z < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float z = dot(dir, uFwd);             // along the view axis
  if (z <= -0.8660254) {                // beyond 150 deg from the aim (near-antipode): cull. = MIN_VIS_Z
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // Stereographic projection in CSS px, identical to projectPoint() in projection.js.
  float k = 2.0 * uFocal / (1.0 + z);
  float sx = k * dot(dir, uRight);
  float sy = k * dot(dir, uUp);   // +y is UP here (NDC y is up): do NOT negate.
  gl_Position = vec4(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5), 0.0, 1.0);

  // starSize(mag, zoom) from starstyle.js (constants embedded from STAR_CONSTS).
  float radius = ${glslFloat(C.STAR_BASE_R)} * pow(${glslFloat(C.STAR_MAG_SHRINK)}, aMag) * uZoom;
  radius = min(radius, ${glslFloat(C.STAR_MAX_R)} * uZoom);
  float magAlpha = 1.0;
  if (radius < ${glslFloat(C.STAR_MIN_R)}) {
    magAlpha = clamp(pow(radius / ${glslFloat(C.STAR_MIN_R)}, ${glslFloat(C.STAR_DIM_EXP)}), 0.0, 1.0);
    radius = ${glslFloat(C.STAR_MIN_R)};
  }
  float belowA = (dir.z < 0.0) ? uBelowFade : 1.0;
  // Below the horizon it is ALWAYS full night (matching the sky background's belowNight blend):
  // daylight never washes out the lower hemisphere's stars.
  float dayFade = mix(uStarDayFade, 1.0, smoothstep(0.0, -${glslFloat(BELOW_NIGHT_BAND)}, dir.z));
  vAlpha = magAlpha * aAlphaScale * dayFade * belowA; // size/colour fade * wash-out * horizon fade

  // Atmospheric extinction: dim + redden toward the horizon. Air mass (Kasten-Young) comes from the
  // star's altitude (aDir.z == sin(alt)); this mirrors airmass()/extinction() in atmosphere.js, with
  // the EXT_K coefficients embedded as literals (a test guards against drift).
  float altDeg = degrees(asin(clamp(dir.z, -1.0, 1.0)));
  // |alt| mirrors the air mass below the horizon (matching the mirrored sky gradient) so faded-in
  // stars don't clamp at the horizon's ~11 magnitudes of extinction and vanish; above the horizon
  // it's identical to max(alt, 0). uExtinction zeroes the whole effect in space view.
  float hh = abs(altDeg);
  float airmass = 1.0 / (sin(radians(hh)) + 0.50572 * pow(hh + 6.07995, -1.6364));
  vec3 extK = vec3(${glslFloat(EXT_K.r)}, ${glslFloat(EXT_K.g)}, ${glslFloat(EXT_K.b)});
  vColor = aColor * pow(vec3(10.0), -0.4 * extK * (airmass - 1.0) * uExtinction);

  // Sprite is larger than the 2D core radius to leave room for the glow halo (device px, hardware-capped).
  gl_PointSize = min(radius * 2.0 * ${glslFloat(GLOW_SCALE)} * uDpr, uMaxPointSize);
}`;
}

// Fragment shader: soft radial glow, premultiplied output for additive blending (ONE, ONE).
export function fragmentShaderSource() {
  return `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;  // 0 at center .. 1 at sprite edge
  float glow = pow(clamp(1.0 - d, 0.0, 1.0), ${glslFloat(GLOW_FALLOFF)});
  float a = glow * vAlpha;
  if (a <= 0.003) discard;
  // Brightness gain scales emitted light only (not the alpha mask): cores can exceed 1.0 and clamp
  // to white. Premultiplied; blendFunc(ONE, ONE) accumulates the glow over the black backdrop.
  fragColor = vec4(vColor * a * ${glslFloat(GLOW_BRIGHTNESS)}, a);
}`;
}

// Marker vertex shader. Same stereographic projection as the star shader, but the point size comes from an
// explicit per-marker disc radius (CSS px) rather than the magnitude formula.
export function markerVertexShaderSource() {
  return `#version 300 es
precision highp float;

layout(location = 0) in vec3 aDir;
layout(location = 1) in vec3 aColor;
layout(location = 2) in float aCoreRadius; // CSS px: Sun/Moon true angular radius, planets disk radius
layout(location = 3) in float aAlpha;

uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uFocal;
uniform vec2 uViewport;
uniform float uDpr;
uniform float uMaxPointSize;
uniform float uBelowFade;

out vec3 vColor;
out float vAlpha;

void main() {
  if (uBelowFade <= 0.0 && aDir.z < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float z = dot(aDir, uFwd);
  if (z <= -0.8660254) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; } // = MIN_VIS_Z
  // Identical projection to the star shader / projectPoint() (CSS px; +y up, do NOT negate).
  float k = 2.0 * uFocal / (1.0 + z);
  float sx = k * dot(aDir, uRight);
  float sy = k * dot(aDir, uUp);
  gl_Position = vec4(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5), 0.0, 1.0);
  vColor = aColor;
  vAlpha = aAlpha * ((aDir.z < 0.0) ? uBelowFade : 1.0); // below-horizon markers ride the fade
  // Sprite diameter = disc diameter * MARKER_GLOW_SCALE so the disc fills the central 1/scale (see fragment).
  gl_PointSize = min(aCoreRadius * 2.0 * ${glslFloat(MARKER_GLOW_SCALE)} * uDpr, uMaxPointSize);
}`;
}

// Marker fragment shader: a solid disc (the true angular/disk size) surrounded by a soft glow halo.
export function markerFragmentShaderSource() {
  return `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;       // 0 at center .. 1 at sprite edge
  float coreEdge = 1.0 / ${glslFloat(MARKER_GLOW_SCALE)};   // solid disc occupies the central 1/scale
  float intensity;
  if (d <= coreEdge) {
    intensity = 1.0;                                        // inside the disc: full
  } else {
    float h = clamp((d - coreEdge) / (1.0 - coreEdge), 0.0, 1.0);
    intensity = pow(1.0 - h, ${glslFloat(MARKER_GLOW_FALLOFF)}); // halo fades to the sprite edge
  }
  float a = intensity * vAlpha;
  if (a <= 0.003) discard;
  fragColor = vec4(vColor * a * ${glslFloat(MARKER_BRIGHTNESS)}, a); // premultiplied; additive (ONE, ONE)
}`;
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[cosmodial] star shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[cosmodial] star program link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// Create the WebGL2 starfield, or return null if WebGL2 (or shader compilation) is unavailable —
// callers fall back to the Canvas-2D star path. glCanvas is the dedicated background canvas (#sky-gl).
export function createStarfield(glCanvas) {
  let gl;
  try {
    gl = glCanvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    });
  } catch { gl = null; }
  if (!gl) return null;

  let program, vao, vbo, loc, maxPointSize;
  let markerProgram, markerVao, markerVbo, markerLoc;
  let count = 0;       // stars currently uploaded
  let capacity = 0;    // floats allocated in the VBO
  let starMatrix = null; // EQJ->ENU column-major mat3; set per frame
  let lastJ2000 = null;  // raw catalogue retained for context restore
  let lost = false;
  let dpr = 1;
  let skyBg = null;          // sky-background pass (atmosphere + Milky Way); null if it failed to build
  let skyParamsStash = null; // latest sky params from computeSky; bg is skipped until the first one
  let bodySphere = null;      // lit-sphere pass for Moon + planets; null if it failed to build
  let bodyList = null;        // per-frame draw list (Moon + sphere-planets)

  const cameraUniforms = (program) => ({
    uRight: gl.getUniformLocation(program, 'uRight'),
    uUp: gl.getUniformLocation(program, 'uUp'),
    uFwd: gl.getUniformLocation(program, 'uFwd'),
    uFocal: gl.getUniformLocation(program, 'uFocal'),
    uViewport: gl.getUniformLocation(program, 'uViewport'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uMaxPointSize: gl.getUniformLocation(program, 'uMaxPointSize'),
    uBelowFade: gl.getUniformLocation(program, 'uBelowFade'),
  });

  // dir(3)@0, color(3)@12, then two more floats (mag/alphaScale or coreRadius/alpha) @24,@28.
  const setupAttribs = (vaoObj, vboObj, stride) => {
    gl.bindVertexArray(vaoObj);
    gl.bindBuffer(gl.ARRAY_BUFFER, vboObj);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);
  };

  // (Re)create all GL resources + state. Runs at setup and again on context restore.
  function setupGL() {
    program = buildProgram(gl, vertexShaderSource(), fragmentShaderSource());
    markerProgram = buildProgram(gl, markerVertexShaderSource(), markerFragmentShaderSource());
    if (!program || !markerProgram) return false;
    loc = {
      ...cameraUniforms(program),
      uZoom: gl.getUniformLocation(program, 'uZoom'),
      uStarDayFade: gl.getUniformLocation(program, 'uStarDayFade'),
      uExtinction: gl.getUniformLocation(program, 'uExtinction'),
      uEqjToEnu: gl.getUniformLocation(program, 'uEqjToEnu'),
    };
    markerLoc = cameraUniforms(markerProgram);
    vao = gl.createVertexArray();
    vbo = gl.createBuffer();
    setupAttribs(vao, vbo, STRIDE);
    markerVao = gl.createVertexArray();
    markerVbo = gl.createBuffer();
    setupAttribs(markerVao, markerVbo, MARKER_STRIDE);
    capacity = 0; // buffer is fresh
    maxPointSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [1, 64])[1] || 64;
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive: glow from overlapping/bright stars accumulates
    return true;
  }

  if (!setupGL()) return null;
  if (maxPointSize < 64) {
    console.warn(`[cosmodial] WebGL max point size is ${maxPointSize}px — very large stars may be clamped.`);
  }
  skyBg = createSkyBackground(gl); // null-safe: draw() falls back to the black clear if this is null
  bodySphere = createBodySphere(gl);

  glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  glCanvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (setupGL()) {
      if (skyBg) skyBg.onContextRestored();
      if (bodySphere) bodySphere.onContextRestored();
      if (lastJ2000) uploadStarsJ2000(lastJ2000);
    }
  });

  // Upload the FIXED J2000 star attributes (once at boot); per-frame motion comes from setStarMatrix().
  function uploadStarsJ2000(rawStars) {
    lastJ2000 = rawStars;
    if (lost) return;
    const { data, count: n } = buildStarAttributesJ2000(rawStars);
    count = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    if (data.length > capacity) { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); capacity = data.length; }
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }
  function setStarMatrix(m) { starMatrix = m; }

  // Size the backing store to device pixels (guarded to avoid needless GL state churn).
  function resize(cssW, cssH, devicePixelRatio = 1) {
    dpr = devicePixelRatio || 1;
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
    }
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  }

  // Set the camera-projection uniforms shared by the star and marker programs. The target program
  // must already be active (gl.useProgram). L is that program's uniform-location map.
  // belowFade is the 0..1 visibility of the below-horizon sky (0 = fully culled, 1 = fully visible).
  function setCameraUniforms(L, cam, belowFade) {
    const { right, up, fwd, focal } = cameraBasis(cam);
    gl.uniform3f(L.uRight, right[0], right[1], right[2]);
    gl.uniform3f(L.uUp, up[0], up[1], up[2]);
    gl.uniform3f(L.uFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(L.uFocal, focal);
    gl.uniform2f(L.uViewport, cam.width, cam.height);
    gl.uniform1f(L.uDpr, dpr);
    gl.uniform1f(L.uMaxPointSize, maxPointSize);
    gl.uniform1f(L.uBelowFade, belowFade);
  }

  // Stash the latest sky-background params (sun-driven colours + ENU->galactic matrix). Called from
  // every computeSky() pass (per frame in live mode). Until the first call, the bg pass is skipped.
  function setSkyParams(params) { skyParamsStash = params; }

  // Start loading the all-sky Milky Way texture (relative URL). Atmosphere renders fine until it lands.
  function setMilkyWay(url) { if (skyBg) skyBg.setMilkyWay(url); }

  function setBodies(list) { bodyList = list; }                 // per-frame draw list (Moon + sphere-planets)
  function setBodyTexture(name, url, opts) { if (bodySphere) bodySphere.setTexture(name, url, opts); }

  // Draw the sky background (opaque) then all stars. cam: { az, alt, fov, width, height } (CSS px).
  function draw(cam, { belowFade = 0, edit = false } = {}) {
    if (lost) return;
    const fade = edit ? 1 : belowFade; // edit mode always shows the whole sphere
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Sky background first: an OPAQUE base under the additive star pass. Blend is disabled so the
    // fragment's alpha=1 fully replaces the pixel; restore additive (ONE,ONE) before the stars.
    if (skyBg && skyParamsStash) {
      gl.disable(gl.BLEND);
      skyBg.draw(cam, { ...skyParamsStash, dpr, belowFade: fade, mwZoomFade: milkyWayZoomFade(cam.fov) });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    }
    if (count && starMatrix) {
      gl.useProgram(program);
      setCameraUniforms(loc, cam, fade);
      gl.uniform1f(loc.uZoom, zoomScale(cam.fov));
      gl.uniform1f(loc.uStarDayFade, skyParamsStash ? skyParamsStash.starDayFade : 1);
      gl.uniform1f(loc.uExtinction, skyParamsStash && skyParamsStash.extinction != null ? skyParamsStash.extinction : 1);
      gl.uniformMatrix3fv(loc.uEqjToEnu, false, starMatrix);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    }
    if (bodySphere && bodyList) {
      // One atmosphere-veil sample per body (its true angular size is < 1°, so a single colour is
      // exact in practice): the air is in front of the disc, so the daytime Moon's shadowed side
      // shows sky-blue instead of black. See skyVeil in atmosphere.js.
      const withVeil = skyParamsStash
        ? bodyList.map((b) => ({ ...b, veil: skyVeil(b.dir, skyParamsStash.sunDir, skyParamsStash) }))
        : bodyList;
      bodySphere.draw(cam, withVeil); // after the stars (opaque, occludes them); independent of star count
    }
  }

  // Draw the Sun/Moon/planet markers as glowing discs. Call AFTER draw() (which does the clear) so the
  // markers accumulate over the stars; this does NOT clear. Markers are few, so the tiny buffer is
  // rebuilt each call. markerList items: { az, alt, color (hex), radiusPx, alpha }.
  function drawMarkers(markerList, cam, { belowFade = 0 } = {}) {
    if (lost || !markerList || markerList.length === 0) return;
    const { data, count: n } = buildMarkerAttributes(markerList);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.useProgram(markerProgram);
    setCameraUniforms(markerLoc, cam, belowFade);
    gl.bindVertexArray(markerVao);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }

  function dispose() {
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    gl.deleteBuffer(markerVbo);
    gl.deleteVertexArray(markerVao);
    gl.deleteProgram(markerProgram);
    if (skyBg) skyBg.dispose();
    if (bodySphere) bodySphere.dispose();
  }

  return { uploadStarsJ2000, setStarMatrix, draw, drawMarkers, resize, dispose, setSkyParams, setMilkyWay, setBodies, setBodyTexture };
}
