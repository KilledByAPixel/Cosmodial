// WebGL2 starfield: draws the whole star catalogue as glowing point sprites in ONE draw call, plus
// the Sun/Moon/planet markers as a second small glowing-sprite pass.
//
// The star POINTS + glow and the marker discs + glow live here; the rest (grid, constellation lines,
// all text LABELS, HUD) stays on the Canvas-2D overlay above this canvas (see sky.js / main.js). The
// expensive per-star alt/az precession is unchanged — computeSky() in main.js still does it on the CPU,
// gated by skyDirty; we just re-upload the resulting buffer on the same cadence. Per frame we set a
// handful of camera uniforms and issue gl.drawArrays(POINTS).
//
// Projection and sizing mirror the CPU exactly: the projection algebra reuses cameraBasis() from
// projection.js, and the star-size formula mirrors starSize()/STAR_CONSTS from starstyle.js. Colour
// (bvToRGB) and the colour-brightness factor (colorBrightness) are precomputed on the CPU at upload.

import { cameraBasis, vec } from '../core/projection.js';
import { bvToRGB, colorBrightness, zoomScale, STAR_CONSTS } from './starstyle.js';

// --- Star glow tunables (tweak to taste) ---
const GLOW_SCALE = 9.0;    // sprite diameter as a multiple of the 2D core radius — room for the halo
const GLOW_FALLOFF = 9.0;  // halo falloff exponent: higher = tighter core, softer fade to the edge
const GLOW_BRIGHTNESS = 1.5; // overall light gain: >1 brightens (bright cores bloom to white), <1 dims. Try ~1.3–1.6.

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

// Build the per-star vertex data for the GPU. PURE (no GL) so it's unit-testable.
// Interleaved layout per star (stride 8 floats): [dirX, dirY, dirZ, r, g, b, mag, alphaScale]
//  - dir: ENU unit vector === vec(az, alt) in projection.js. dir.z === sin(alt) (reused for horizon cull).
//  - rgb: bvToRGB(bv) scaled to 0..1 (handles null/NaN bv).
//  - mag: apparent magnitude (size depends on per-frame zoom, so it's computed in the shader).
//  - alphaScale: colorBrightness(rgb) — the magnitude-independent opacity factor.
export function buildStarAttributes(skyObjects) {
  const count = skyObjects.length;
  const data = new Float32Array(count * FLOATS_PER_STAR);
  for (let i = 0; i < count; i++) {
    const s = skyObjects[i];
    const d = vec(s.altaz.az, s.altaz.alt);
    const c = bvToRGB(s.bv);
    const o = i * FLOATS_PER_STAR;
    data[o] = d[0]; data[o + 1] = d[1]; data[o + 2] = d[2];
    data[o + 3] = c.r / 255; data[o + 4] = c.g / 255; data[o + 5] = c.b / 255;
    data[o + 6] = s.mag;
    data[o + 7] = colorBrightness(c);
  }
  return { data, count };
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

// Vertex shader source. Replicates projectPoint() (gnomonic, via the camera-basis uniforms) and
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
uniform float uZoom;      // zoomScale(fov)
uniform float uMaxPointSize;
uniform float uShowBelow; // 1 = also draw stars below the horizon

out vec3 vColor;
out float vAlpha;

void main() {
  // aDir.z == sin(alt): cull below-horizon stars unless full-sphere/edit is on.
  if (uShowBelow < 0.5 && aDir.z < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float z = dot(aDir, uFwd);            // along the view axis; front hemisphere when > 0
  if (z <= 0.000001) {                  // behind the camera
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // Gnomonic projection in CSS px, identical to projectPoint() in projection.js.
  float sx = uFocal * dot(aDir, uRight) / z;
  float sy = uFocal * dot(aDir, uUp) / z;   // +y is UP here (NDC y is up): do NOT negate.
  gl_Position = vec4(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5), 0.0, 1.0);

  // starSize(mag, zoom) from starstyle.js (constants embedded from STAR_CONSTS).
  float radius = ${glslFloat(C.STAR_BASE_R)} * pow(${glslFloat(C.STAR_MAG_SHRINK)}, aMag) * uZoom;
  radius = min(radius, ${glslFloat(C.STAR_MAX_R)} * uZoom);
  float magAlpha = 1.0;
  if (radius < ${glslFloat(C.STAR_MIN_R)}) {
    magAlpha = clamp(pow(radius / ${glslFloat(C.STAR_MIN_R)}, ${glslFloat(C.STAR_DIM_EXP)}), 0.0, 1.0);
    radius = ${glslFloat(C.STAR_MIN_R)};
  }
  vAlpha = magAlpha * aAlphaScale;          // == starSize().alpha * colorBrightness(color)
  vColor = aColor;

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

// Marker vertex shader. Same gnomonic projection as the star shader, but the point size comes from an
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
uniform float uShowBelow;

out vec3 vColor;
out float vAlpha;

void main() {
  if (uShowBelow < 0.5 && aDir.z < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float z = dot(aDir, uFwd);
  if (z <= 0.000001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  // Identical projection to the star shader / projectPoint() (CSS px; +y up, do NOT negate).
  float sx = uFocal * dot(aDir, uRight) / z;
  float sy = uFocal * dot(aDir, uUp) / z;
  gl_Position = vec4(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5), 0.0, 1.0);
  vColor = aColor;
  vAlpha = aAlpha;
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
    console.error('[volvella] star shader compile failed:', gl.getShaderInfoLog(sh));
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
    console.error('[volvella] star program link failed:', gl.getProgramInfoLog(program));
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
  let lastSky = null;  // retained so we can re-upload after context restore
  let lost = false;
  let dpr = 1;

  const cameraUniforms = (program) => ({
    uRight: gl.getUniformLocation(program, 'uRight'),
    uUp: gl.getUniformLocation(program, 'uUp'),
    uFwd: gl.getUniformLocation(program, 'uFwd'),
    uFocal: gl.getUniformLocation(program, 'uFocal'),
    uViewport: gl.getUniformLocation(program, 'uViewport'),
    uDpr: gl.getUniformLocation(program, 'uDpr'),
    uMaxPointSize: gl.getUniformLocation(program, 'uMaxPointSize'),
    uShowBelow: gl.getUniformLocation(program, 'uShowBelow'),
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
    loc = { ...cameraUniforms(program), uZoom: gl.getUniformLocation(program, 'uZoom') };
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
    console.warn(`[volvella] WebGL max point size is ${maxPointSize}px — very large stars may be clamped.`);
  }

  glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  glCanvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (setupGL() && lastSky) uploadStars(lastSky);
  });

  // Rebuild + upload the per-star buffer. Call ONLY when the sky changed (skyDirty), mirroring computeSky().
  function uploadStars(skyObjects) {
    lastSky = skyObjects;
    if (lost) return;
    const { data, count: n } = buildStarAttributes(skyObjects);
    count = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    if (data.length > capacity) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      capacity = data.length;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }
  }

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
  function setCameraUniforms(L, cam, showBelow) {
    const { right, up, fwd, focal } = cameraBasis(cam);
    gl.uniform3f(L.uRight, right[0], right[1], right[2]);
    gl.uniform3f(L.uUp, up[0], up[1], up[2]);
    gl.uniform3f(L.uFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(L.uFocal, focal);
    gl.uniform2f(L.uViewport, cam.width, cam.height);
    gl.uniform1f(L.uDpr, dpr);
    gl.uniform1f(L.uMaxPointSize, maxPointSize);
    gl.uniform1f(L.uShowBelow, showBelow ? 1 : 0);
  }

  // Clear the canvas and draw all stars in one call. cam: { az, alt, fov, width, height } (CSS px).
  function draw(cam, { showBelow = false, edit = false } = {}) {
    if (lost) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!count) return;
    gl.useProgram(program);
    setCameraUniforms(loc, cam, showBelow || edit);
    gl.uniform1f(loc.uZoom, zoomScale(cam.fov));
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }

  // Draw the Sun/Moon/planet markers as glowing discs. Call AFTER draw() (which does the clear) so the
  // markers accumulate over the stars; this does NOT clear. Markers are few, so the tiny buffer is
  // rebuilt each call. markerList items: { az, alt, color (hex), radiusPx, alpha }.
  function drawMarkers(markerList, cam, { showBelow = false } = {}) {
    if (lost || !markerList || markerList.length === 0) return;
    const { data, count: n } = buildMarkerAttributes(markerList);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.useProgram(markerProgram);
    setCameraUniforms(markerLoc, cam, showBelow);
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
  }

  return { uploadStars, draw, drawMarkers, resize, dispose };
}
