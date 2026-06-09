// WebGL2 Moon pass: draws the Moon's disc as a lit, textured sphere (real lunar face, correct phase,
// correct screen tilt). Receives the shared gl from createStarfield (like sky-background.js); does not
// own the context. Drawn AFTER the stars with normal alpha blending so the opaque disc occludes the
// background. The orientation/lighting angles come from js/core/moon.js; the texture is the equirect
// lunar map. A screen-space quad (4 verts via gl_VertexID) avoids the gl.POINTS size cap when zoomed in.
import { cameraBasis } from '../core/projection.js';

const SCREEN_ANGLE_SIGN = 1.0;  // flip to -1.0 if the eyeball check shows the tilt/limb mirrored
const TERMINATOR_SOFT = 0.2;    // terminator fade width (fraction of the lit dot product); higher = softer/wider
const EDGE_AA = 0.02;           // rim antialiasing width (fraction of radius)

function vertexShaderSource() {
  return `#version 300 es
precision highp float;
uniform vec3 uRight, uUp, uFwd;   // camera basis (ENU)
uniform float uFocal;             // CSS px
uniform vec2 uViewport;           // CSS px
uniform vec3 uMoonDir;            // ENU unit vector to the Moon
uniform float uRadiusPx;          // on-screen Moon radius (CSS px)
out vec2 vCorner;                 // [-1,1] disc coords; +x screen-right, +y screen-up
void main() {
  // Project the Moon centre with the same gnomonic math as the star/marker shaders.
  float z = dot(uMoonDir, uFwd);
  vec2 corner = vec2((gl_VertexID == 1 || gl_VertexID == 3) ? 1.0 : -1.0,
                     (gl_VertexID == 2 || gl_VertexID == 3) ? 1.0 : -1.0);
  vCorner = corner;
  if (z <= 0.000001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // behind camera -> offscreen
  float sx = uFocal * dot(uMoonDir, uRight) / z;
  float sy = uFocal * dot(uMoonDir, uUp) / z;
  vec2 centerNdc = vec2(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5));
  vec2 cornerNdc = (corner * uRadiusPx) / (uViewport * 0.5);
  gl_Position = vec4(centerNdc + cornerNdc, 0.0, 1.0);
}`;
}

function fragmentShaderSource() {
  return `#version 300 es
precision highp float;
in vec2 vCorner;
uniform sampler2D uMoonTex;
uniform float uPhaseAngle;   // radians: 0 = full, PI = new
uniform float uLimbAngle;    // radians: bright-limb screen angle (CW from screen-up)
uniform float uNorthAngle;   // radians: Moon north-pole screen angle (CW from screen-up)
out vec4 fragColor;
const float PI = 3.14159265358979;
// Unit direction in the disc plane for a screen angle measured CW from +y (screen-up).
vec2 dirFromUp(float a) { return vec2(sin(a), cos(a)); }
void main() {
  vec2 d = vCorner;                 // +x right, +y up
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float zc = sqrt(1.0 - r2);
  vec3 N = vec3(d.x, d.y, zc);      // surface normal (sphere), +z toward viewer

  // Sun direction in the disc frame: in-plane part (length sin p) toward the bright limb, plus a
  // toward/away-from-viewer z = cos p. Full -> +z (all lit), new -> -z (dark), quarter -> in-plane.
  vec2 limb = dirFromUp(uLimbAngle);
  vec3 L = vec3(sin(uPhaseAngle) * limb, cos(uPhaseAngle));
  float lit = smoothstep(-${TERMINATOR_SOFT.toFixed(3)}, ${TERMINATOR_SOFT.toFixed(3)}, dot(N, L));

  // Texture: rotate the disc point so the Moon's north (uNorthAngle) maps to +y, then to lat/lon
  // (near side centred at lon 0 / lat 0; no libration).
  float c = cos(uNorthAngle), s = sin(uNorthAngle);
  vec3 P = vec3(d.x * c - d.y * s, d.x * s + d.y * c, zc);
  float lat = asin(clamp(P.y, -1.0, 1.0));
  float lon = atan(P.x, P.z);
  vec2 uv = vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI);
  vec3 surf = texture(uMoonTex, uv).rgb;

  float alpha = 1.0 - smoothstep(1.0 - ${EDGE_AA.toFixed(3)}, 1.0, sqrt(r2)); // rim AA; opaque interior
  fragColor = vec4(surf * lit, alpha);
}`;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[volvella] moon shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh); return null;
  }
  return sh;
}

export function createMoon(gl) {
  let program, vao, tex, loc;
  let hasTex = false, img = null;

  function setupGL() {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShaderSource());
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShaderSource());
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[volvella] moon link failed:', gl.getProgramInfoLog(program)); return false;
    }
    vao = gl.createVertexArray();
    const names = ['uRight','uUp','uFwd','uFocal','uViewport','uMoonDir','uRadiusPx','uMoonTex','uPhaseAngle','uLimbAngle','uNorthAngle'];
    loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);        // longitude wraps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // latitude clamps
    return true;
  }
  if (!setupGL()) return null;

  function uploadImage(image) {
    img = image;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    hasTex = true;
  }
  function setTexture(url) {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { try { uploadImage(im); } catch (e) { console.warn('[volvella] moon tex upload failed', e); } };
    im.onerror = () => console.warn('[volvella] moon texture failed to load:', url);
    im.src = url;
  }

  // p: { dir:[x,y,z], radiusPx, phaseAngleDeg, brightLimbAngle, northAngle }  (angles in degrees)
  function draw(cam, p) {
    if (!hasTex || !p || !p.dir) return; // need the texture and fully-populated params (dir/angles)
    const { right, up, fwd, focal } = cameraBasis(cam);
    const D2R = Math.PI / 180;
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // opaque disc occludes the background
    gl.uniform3f(loc.uRight, right[0], right[1], right[2]);
    gl.uniform3f(loc.uUp, up[0], up[1], up[2]);
    gl.uniform3f(loc.uFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(loc.uFocal, focal);
    gl.uniform2f(loc.uViewport, cam.width, cam.height);
    gl.uniform3f(loc.uMoonDir, p.dir[0], p.dir[1], p.dir[2]);
    gl.uniform1f(loc.uRadiusPx, p.radiusPx);
    gl.uniform1f(loc.uPhaseAngle, p.phaseAngleDeg * D2R);
    gl.uniform1f(loc.uLimbAngle, SCREEN_ANGLE_SIGN * p.brightLimbAngle * D2R);
    gl.uniform1f(loc.uNorthAngle, SCREEN_ANGLE_SIGN * p.northAngle * D2R);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc.uMoonTex, 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE); // restore additive for any later passes
  }

  function onContextRestored() { if (setupGL() && img) { try { uploadImage(img); } catch { /* texture stays grey until the next setMoon() */ } } }
  function dispose() { gl.deleteProgram(program); gl.deleteVertexArray(vao); gl.deleteTexture(tex); }
  return { draw, setTexture, onContextRestored, dispose };
}
