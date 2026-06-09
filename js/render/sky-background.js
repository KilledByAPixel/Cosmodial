// WebGL2 sky-background pass: a single fullscreen triangle drawn BEFORE the stars that paints the
// atmosphere (sky colour from the Sun's position) and, when loaded, the all-sky Milky Way panorama.
// It does NOT own the GL context — createStarfield() passes its `gl` in and orchestrates draw order
// (background opaque first, then additive stars/markers over it). The pure math (sky palette, the
// ENU->GAL matrix, zoom fade, extinction) lives in atmosphere.js; this file is just the GL plumbing.
//
// Projection inversion: the fragment shader reconstructs the ENU view ray per pixel as the exact
// inverse of projectPoint()/the star vertex shader (gnomonic). The Milky Way texture is in GALACTIC
// coordinates (the bright band runs along the image midline, galactic centre at the centre), so each
// ray is rotated into the galactic frame (uEnuToGal, built on the CPU each recompute) and mapped to
// equirectangular UV: longitude across, latitude up. Output alpha is always 1.0 (opaque sky).

import { cameraBasis } from '../core/projection.js';

// Texture orientation (galactic equirectangular). Verified against this texture: galactic centre
// (l=0) at the horizontal centre, longitude increasing leftward (the LMC sits at u~0.72), and the
// South galactic hemisphere at the top (the LMC, b=-33, at v~0.32). If a different texture comes out
// mirrored, flip a sign — the galactic-centre bulge should land in Sagittarius.
const GAL_LON_LEFT = true; // true: galactic longitude increases to the left (verified via the LMC at u~0.72)
const GAL_NGP_TOP = false; // this texture is vertically flipped: the South galactic hemisphere is at the top
                           // (the LMC, galactic latitude -33, sits at v~0.32 in the upper half)
const MW_GAIN = 0.6;       // brightness of the Milky Way layer in normal mode — a background glow, not foreground

function vertexShaderSource() {
  // Oversized covering triangle via gl_VertexID — no attributes, no VBO.
  return `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
}

function fragmentShaderSource() {
  const lonExpr = GAL_LON_LEFT ? '0.5 - l / TAU' : '0.5 + l / TAU';
  const latExpr = GAL_NGP_TOP ? '0.5 - b / PI' : '0.5 + b / PI';
  return `#version 300 es
precision highp float;

uniform vec3 uRight, uUp, uFwd;
uniform float uFocal;       // CSS px
uniform vec2 uViewport;     // CSS px
uniform float uDpr;         // device px per CSS px
uniform float uShowBelow;   // 1 = full sphere (mirror the gradient below the horizon, no ground)

uniform vec3 uZenithColor, uHorizonColor, uSunGlowColor, uSunDir;
uniform float uSunGlowStrength, uHorizonAirglow, uMwVisibility, uMwZoomFade, uHasMilkyWay;
uniform mat3 uEnuToGal;
uniform sampler2D uMilkyWay;

out vec4 fragColor;

const float PI  = 3.14159265358979;
const float TAU = 6.28318530717959;

// Atmospheric refraction (degrees) for a TRUE altitude, replicating Astronomy Engine's 'normal' mode
// (Saemundsson, clamped at -1 deg, with a linear taper to 0 at the nadir). The catalogue stars are
// plotted at apparent = true + refraction, so matching this lets the textured sky line up with them.
float refractionDeg(float altDeg) {
  if (altDeg < -90.0 || altDeg > 90.0) return 0.0;
  float hd = max(altDeg, -1.0);
  float r = (1.02 / tan(radians(hd + 10.3 / (hd + 5.11)))) / 60.0;
  if (altDeg < -1.0) r *= (altDeg + 90.0) / 89.0; // taper below the horizon toward the nadir
  return r;
}

void main() {
  // Reconstruct the ENU view ray for this pixel — exact inverse of the gnomonic projectPoint().
  // gl_FragCoord is device px, origin bottom-left, +y up (matches the shader's +up convention).
  vec2 fragCss = gl_FragCoord.xy / uDpr;
  vec2 center = uViewport * 0.5;
  float dx = fragCss.x - center.x;
  float dy = fragCss.y - center.y;
  vec3 ray = normalize(uRight * dx + uUp * dy + uFwd * uFocal);

  // Texture-sampling direction = the pixel's apparent direction warped to TRUE altitude, so the
  // textured sky lines up with the catalogue stars (drawn at apparent = true + refraction). Invert
  // refraction by two fixed-point iterations (it's small); the taper in refractionDeg() means this also
  // works BELOW the horizon in full-sphere mode. Identity at the zenith; leaves azimuth alone.
  float az = atan(ray.x, ray.y);
  float hApp = degrees(asin(clamp(ray.z, -1.0, 1.0)));
  float hTrue = hApp - refractionDeg(hApp);
  hTrue = hApp - refractionDeg(hTrue);
  float hr = radians(hTrue);
  vec3 rayGeo = vec3(cos(hr) * sin(az), cos(hr) * cos(az), sin(hr));

  // Galactic coordinates of this direction -> equirectangular UV of the galactic-frame texture.
  vec3 gal = normalize(uEnuToGal * rayGeo);
  float l = atan(gal.y, gal.x);            // galactic longitude (0 at the galactic centre)
  float b = atan(gal.z, length(gal.xy));   // galactic latitude
  vec2 uv = vec2(${lonExpr}, ${latExpr});  // u may exit [0,1]; wrapS=REPEAT handles the longitude seam

  // Altitude gradient. ray.z == sin(altitude). Full-sphere mirrors the gradient below the horizon.
  float s = (uShowBelow > 0.5) ? abs(ray.z) : ray.z;
  float h = clamp(s, 0.0, 1.0);
  float grad = pow(h, 0.55);
  vec3 sky = mix(uHorizonColor, uZenithColor, grad);

  // Warm glow lobe around the Sun direction (twilight/day only).
  float glow = pow(max(dot(ray, uSunDir), 0.0), 8.0) * uSunGlowStrength;
  sky += uSunGlowColor * glow;

  // Faint night airglow hugging the horizon.
  sky += uHorizonAirglow * vec3(0.03, 0.05, 0.04) * (1.0 - grad);

  // Milky Way: gated by darkness (uMwVisibility) and wide-FOV zoom fade (uMwZoomFade).
  if (uHasMilkyWay > 0.5) {
    vec3 mw = texture(uMilkyWay, uv).rgb;
    sky += mw * (${MW_GAIN.toFixed(2)} * uMwVisibility * uMwZoomFade);
  }

  // Below the (true) horizon when not in full-sphere mode, fade to a dark ground tone.
  if (uShowBelow < 0.5) {
    float ground = smoothstep(0.0, -0.08, ray.z);
    sky = mix(sky, sky * 0.12, ground);
  }

  fragColor = vec4(clamp(sky, 0.0, 1.0), 1.0); // opaque base
}`;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[volvella] sky-background shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Create the sky-background pass on an existing WebGL2 context. Returns null if the program fails to
// build (caller then simply skips the background and falls back to the black clear).
export function createSkyBackground(gl) {
  let program, vao, tex, loc;
  let hasMilkyWay = false;
  let mwImage = null; // retained HTMLImageElement so we can re-upload after context restore

  function setupGL() {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShaderSource());
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShaderSource());
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[volvella] sky-background link failed:', gl.getProgramInfoLog(program));
      return false;
    }
    vao = gl.createVertexArray(); // empty: the vertex shader uses gl_VertexID only
    const names = [
      'uRight', 'uUp', 'uFwd', 'uFocal', 'uViewport', 'uDpr', 'uShowBelow',
      'uZenithColor', 'uHorizonColor', 'uSunGlowColor', 'uSunDir',
      'uSunGlowStrength', 'uHorizonAirglow', 'uMwVisibility', 'uMwZoomFade', 'uHasMilkyWay',
      'uEnuToGal', 'uMilkyWay',
    ];
    loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    // 1x1 black placeholder so the sampler always has a valid binding until the real image loads.
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  if (!setupGL()) return null;

  // Upload the equirectangular Milky Way image (an already-loaded HTMLImageElement / ImageBitmap).
  function uploadImage(img) {
    mwImage = img;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);      // longitude wraps at the seam
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // latitude clamps at the poles
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    hasMilkyWay = true;
  }

  // Kick off an async load of the Milky Way texture from a (relative) URL. No-op-safe: the atmosphere
  // renders fine until it arrives, and a failed load just leaves hasMilkyWay false.
  function setMilkyWay(url) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { try { uploadImage(img); } catch (e) { console.warn('[volvella] Milky Way upload failed:', e); } };
    img.onerror = () => console.warn('[volvella] Milky Way texture failed to load:', url);
    img.src = url;
  }

  // Draw the background. p carries the per-recompute sky params + per-frame zoom fade and dpr.
  function draw(cam, p) {
    const { right, up, fwd, focal } = cameraBasis(cam);
    gl.useProgram(program);
    gl.uniform3f(loc.uRight, right[0], right[1], right[2]);
    gl.uniform3f(loc.uUp, up[0], up[1], up[2]);
    gl.uniform3f(loc.uFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(loc.uFocal, focal);
    gl.uniform2f(loc.uViewport, cam.width, cam.height);
    gl.uniform1f(loc.uDpr, p.dpr || 1);
    gl.uniform1f(loc.uShowBelow, p.showBelow ? 1 : 0);
    gl.uniform3fv(loc.uZenithColor, p.zenithColor);
    gl.uniform3fv(loc.uHorizonColor, p.horizonColor);
    gl.uniform3fv(loc.uSunGlowColor, p.sunGlowColor);
    gl.uniform3fv(loc.uSunDir, p.sunDir);
    gl.uniform1f(loc.uSunGlowStrength, p.sunGlowStrength);
    gl.uniform1f(loc.uHorizonAirglow, p.horizonAirglow);
    gl.uniform1f(loc.uMwVisibility, p.mwVisibility);
    gl.uniform1f(loc.uMwZoomFade, p.mwZoomFade || 0);
    gl.uniform1f(loc.uHasMilkyWay, hasMilkyWay ? 1 : 0);
    gl.uniformMatrix3fv(loc.uEnuToGal, false, p.enuToGal || IDENTITY3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.uMilkyWay, 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function onContextRestored() {
    if (setupGL() && mwImage) { try { uploadImage(mwImage); } catch { /* re-kick handled by caller */ } }
  }

  function dispose() {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(tex);
  }

  return { draw, setMilkyWay, onContextRestored, dispose };
}

const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
