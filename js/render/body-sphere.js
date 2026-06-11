// WebGL2 lit-sphere pass for solar-system bodies (the Moon + the detail-capable planets). Each body is a
// lit, textured sphere with correct phase + screen orientation; a flat-colour body uses a 1x1 tint texture
// through the same path; Saturn additionally gets its ring annulus composited in the same quad. Receives
// the shared gl (like sky-background.js); drawn AFTER the stars with premultiplied "over" blending — the
// disc is opaque and occludes the background, the rings are semi-transparent beyond it. Orientation/phase
// come from js/core/moon.js + astro; ring geometry from js/render/ring-math.js.
// A screen-space quad (4 verts via gl_VertexID) avoids the gl.POINTS size cap when zoomed in.
import { cameraBasis } from '../core/projection.js';

const SCREEN_ANGLE_SIGN = 1.0;  // verified for the Moon; -1.0 would mirror limb+north together
const TERMINATOR_SOFT = 0.2;    // terminator fade width (fraction of the lit dot product); higher = softer
const EDGE_AA = 0.02;           // rim antialiasing width (fraction of radius)

// Exported for the projection drift-guard test (mirrors starfield-gl.js's exported shader sources).
export function vertexShaderSource() {
  return `#version 300 es
precision highp float;
uniform vec3 uRight, uUp, uFwd;
uniform float uFocal;
uniform vec2 uViewport;
uniform vec3 uBodyDir;
uniform float uRadiusPx;
uniform float uQuadScale;
out vec2 vCorner;  // globe-radius units: |v| = 1 at the sphere edge, up to uQuadScale at the quad edge
void main() {
  float z = dot(uBodyDir, uFwd);
  vec2 corner = vec2((gl_VertexID == 1 || gl_VertexID == 3) ? 1.0 : -1.0,
                     (gl_VertexID == 2 || gl_VertexID == 3) ? 1.0 : -1.0);
  vCorner = corner * uQuadScale;
  if (z <= -0.8660254) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // = MIN_VIS_Z (stereographic)
  float k = 2.0 * uFocal / (1.0 + z);
  float sx = k * dot(uBodyDir, uRight);
  float sy = k * dot(uBodyDir, uUp);
  vec2 centerNdc = vec2(sx / (uViewport.x * 0.5), sy / (uViewport.y * 0.5));
  vec2 cornerNdc = (corner * uRadiusPx * uQuadScale) / (uViewport * 0.5);
  gl_Position = vec4(centerNdc + cornerNdc, 0.0, 1.0);
}`;
}

// Exported for the below-horizon fade drift-guard test (mirrors the vertex export above).
export function fragmentShaderSource() {
  return `#version 300 es
precision highp float;
in vec2 vCorner;
uniform sampler2D uTex;
uniform float uPhaseAngle;   // radians: 0 = full, PI = new
uniform float uLimbAngle;    // radians: bright-limb screen angle (CW from screen-up)
uniform float uNorthAngle;   // radians: north-pole screen angle (CW from screen-up)
uniform float uSubLat;       // radians: sub-observer latitude (Moon libration / planet axial tip toward viewer)
uniform float uSubLon;       // radians: sub-observer longitude (Moon libration; 0 for planets — rotation untracked)
uniform float uRingTilt;     // sin(B): ring opening; 0 = edge-on (also: pole z toward the viewer)
uniform vec2 uRingRadii;     // ring inner/outer radii in globe radii; (0,0) = no rings
uniform sampler2D uRingTex;  // radial strip: u = (r - inner) / (outer - inner), with alpha
uniform float uFade;         // 0..1 global fade (below-horizon bodies ride belowFade like the markers)
uniform vec3 uVeil;          // atmosphere foreground colour at the body (skyVeil in atmosphere.js)
uniform vec4 uLunarShadow;   // lunar eclipse: umbra centre in disc coords (xy, globe radii, y up),
                             // umbra radius (z), penumbra radius (w); w <= 0 = no eclipse
out vec4 fragColor;
const float PI = 3.14159265358979;
vec2 dirFromUp(float a) { return vec2(sin(a), cos(a)); }
void main() {
  vec2 d = vCorner;                 // globe-radius units: |d| = 1 at the sphere edge
  float r2 = dot(d, d);

  // Ring-plane sample (valid both off and over the globe — rings cross in front of the disc).
  // Plane normal = the pole in the disc frame: in-plane part along the north screen angle (length
  // cos B), z toward the viewer = sin B. Orthographic ray (d.xy, t); radial distance indexes the strip.
  float ringA = 0.0; vec3 ringC = vec3(0.0); float ringZ = -1.0e9;
  if (uRingRadii.y > 0.0) {
    float ct = sqrt(max(0.0, 1.0 - uRingTilt * uRingTilt));
    vec3 p = vec3(dirFromUp(uNorthAngle) * ct, uRingTilt);
    if (abs(p.z) > 1.0e-4) {
      float t = -(d.x * p.x + d.y * p.y) / p.z;
      float rr = length(vec3(d, t));
      float u = (rr - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
      if (u >= 0.0 && u <= 1.0) {
        vec4 rt = texture(uRingTex, vec2(u, 0.5));
        ringC = rt.rgb; ringA = rt.a; ringZ = t;
      }
    }
  }

  // Output is PREMULTIPLIED alpha (the pass blends with ONE, ONE_MINUS_SRC_ALPHA) so the sphere and
  // ring can be layered "over" each other in-shader. Crucially, the globe's antialiased limb must fade
  // into the RING behind it, not punch a transparent seam through to the sky.
  if (r2 > 1.0) {                   // off the globe: ring only
    if (ringA <= 0.003) discard;
    // + veil over the covered fraction; premultiplied, so scaling the whole vec4 fades "over".
    fragColor = vec4(ringC * ringA + uVeil * ringA, ringA) * uFade;
    return;
  }

  float zc = sqrt(1.0 - r2);
  vec3 N = vec3(d.x, d.y, zc);
  vec2 limb = dirFromUp(uLimbAngle);
  vec3 L = vec3(sin(uPhaseAngle) * limb, cos(uPhaseAngle));
  float lit = smoothstep(-${TERMINATOR_SOFT.toFixed(3)}, ${TERMINATOR_SOFT.toFixed(3)}, dot(N, L));
  float c = cos(uNorthAngle), s = sin(uNorthAngle);
  vec3 P = vec3(d.x * c - d.y * s, d.x * s + d.y * c, zc);
  // Sub-observer point: tip the body-north frame toward/away from the viewer by the sub-observer
  // latitude (Moon libration in latitude; a planet's axial tip — Saturn's globe matches its rings),
  // then offset longitude (libration in longitude). Disc centre then samples (uSubLon, uSubLat).
  float ca = cos(uSubLat), sa = sin(uSubLat);
  P = vec3(P.x, P.y * ca + P.z * sa, P.z * ca - P.y * sa);
  float lat = asin(clamp(P.y, -1.0, 1.0));
  float lon = atan(P.x, P.z) + uSubLon;
  vec2 uv = vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI);
  vec3 surf = texture(uTex, uv).rgb;
  // Lunar eclipse: Earth's shadow projected onto the disc. The penumbra dims gently toward the
  // umbra's edge; inside the umbra only sunlight refracted through Earth's atmosphere remains —
  // dim and strongly reddened (the coppery "blood Moon"). The umbra edge is soft in life too.
  if (uLunarShadow.w > 0.0) {
    float du = distance(d, uLunarShadow.xy);
    float pen = 1.0 - smoothstep(uLunarShadow.z, uLunarShadow.w, du);
    float umb = 1.0 - smoothstep(uLunarShadow.z - 0.08, uLunarShadow.z + 0.08, du);
    vec3 shade = mix(vec3(1.0), vec3(0.55, 0.50, 0.46), pen);
    surf *= mix(shade, vec3(0.30, 0.10, 0.05), umb);
  }
  float sphA = 1.0 - smoothstep(1.0 - ${EDGE_AA.toFixed(3)}, 1.0, sqrt(r2)); // rim AA
  vec3 sph = surf * lit * sphA;     // premultiplied sphere layer
  vec3 ring = ringC * ringA;        // premultiplied ring layer
  vec3 cOut; float aOut;
  if (ringA > 0.0 && ringZ > zc) {  // ring crosses IN FRONT of the globe: ring over sphere
    cOut = ring + sph * (1.0 - ringA); aOut = ringA + sphA * (1.0 - ringA);
  } else {                          // ring behind (or none): sphere over ring — the limb fades into the ring
    cOut = sph + ring * (1.0 - sphA); aOut = sphA + ringA * (1.0 - sphA);
  }
  // The atmosphere is IN FRONT of the body: its scattered light (uVeil) adds over the covered
  // fraction. Daytime Moon: the shadowed limb shows sky-blue, the lit side washes out pale —
  // both as in life. Night/space: the veil is ~zero and this is a no-op.
  fragColor = vec4(cOut + uVeil * aOut, aOut) * uFade;
}`;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('[cosmodial] body-sphere shader compile failed:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh); return null;
  }
  return sh;
}

export function createBodySphere(gl) {
  let program, vao, loc;
  const maps = new Map();   // name -> { tex, img|null, ready, clampS }   real surface maps (async)
  const tints = new Map();  // 'r,g,b' (0..255) -> tex            1x1 flat-tint textures
  let noRingTex = null; // 1x1 transparent RGBA bound on unit 1 for ringless bodies
  function dummyRingTex() {
    if (!noRingTex) {
      noRingTex = newTex();
      gl.bindTexture(gl.TEXTURE_2D, noRingTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    }
    return noRingTex;
  }

  function newTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);        // longitude wraps
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // latitude clamps
    return t;
  }
  function tintTex(rgb) {
    const key = rgb.join(',');
    let t = tints.get(key);
    if (!t) {
      t = newTex();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(rgb));
      tints.set(key, t);
    }
    return t;
  }
  function uploadImage(name, image) {
    const e = maps.get(name) || { tex: newTex(), img: null, ready: false, clampS: false };
    e.img = image;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (e.clampS) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // radial strip: no wrap
    e.ready = true;
    maps.set(name, e);
  }

  function setupGL() {
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShaderSource());
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShaderSource());
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[cosmodial] body-sphere link failed:', gl.getProgramInfoLog(program)); return false;
    }
    vao = gl.createVertexArray();
    const names = ['uRight','uUp','uFwd','uFocal','uViewport','uBodyDir','uRadiusPx','uTex','uPhaseAngle','uLimbAngle','uNorthAngle','uSubLat','uSubLon','uQuadScale','uRingTilt','uRingRadii','uRingTex','uFade','uVeil','uLunarShadow'];
    loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    return true;
  }
  if (!setupGL()) return null;

  // Start loading a named surface map (async). The body shows its tint until the map arrives.
  function setTexture(name, url, opts = {}) {
    if (!maps.has(name)) maps.set(name, { tex: newTex(), img: null, ready: false, clampS: !!opts.clampS });
    else maps.get(name).clampS = !!opts.clampS;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { try { uploadImage(name, im); } catch (e) { console.warn('[cosmodial] body tex upload failed', name, e); } };
    im.onerror = () => console.warn('[cosmodial] body texture failed to load:', url);
    im.src = url;
  }

  // bodies: [{ texKey, tint:[r,g,b] 0..255, dir:[x,y,z], radiusPx, phaseAngleDeg, brightLimbAngle, northAngle,
  //            quadScale (optional, default 1), ringTilt (optional), ringRadii (optional [inner,outer]),
  //            ringTexKey (optional) }]
  // Camera uniforms are set once; per-body uniforms + texture bind per draw. Premultiplied-alpha "over"
  // blending (opaque disc, semi-transparent rings); restores additive afterward for the marker pass.
  function draw(cam, bodies) {
    if (!bodies || bodies.length === 0) return;
    const { right, up, fwd, focal } = cameraBasis(cam);
    const D2R = Math.PI / 180;
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied "over" (the shader outputs premultiplied rgb)
    gl.uniform3f(loc.uRight, right[0], right[1], right[2]);
    gl.uniform3f(loc.uUp, up[0], up[1], up[2]);
    gl.uniform3f(loc.uFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(loc.uFocal, focal);
    gl.uniform2f(loc.uViewport, cam.width, cam.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.uTex, 0);
    gl.uniform1i(loc.uRingTex, 1);
    gl.bindVertexArray(vao);
    for (const b of bodies) {
      if (!b || !b.dir) continue;
      const map = b.texKey ? maps.get(b.texKey) : null;
      const ringMap = b.ringTexKey ? maps.get(b.ringTexKey) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (ringMap && ringMap.ready) ? ringMap.tex : dummyRingTex());
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (map && map.ready) ? map.tex : tintTex(b.tint || [128, 128, 128]));
      gl.uniform3f(loc.uBodyDir, b.dir[0], b.dir[1], b.dir[2]);
      gl.uniform1f(loc.uRadiusPx, b.radiusPx);
      gl.uniform1f(loc.uPhaseAngle, b.phaseAngleDeg * D2R);
      gl.uniform1f(loc.uLimbAngle, SCREEN_ANGLE_SIGN * b.brightLimbAngle * D2R);
      gl.uniform1f(loc.uNorthAngle, SCREEN_ANGLE_SIGN * b.northAngle * D2R);
      gl.uniform1f(loc.uSubLat, (b.subLatDeg || 0) * D2R);
      gl.uniform1f(loc.uSubLon, (b.subLonDeg || 0) * D2R);
      gl.uniform1f(loc.uFade, b.fade == null ? 1 : b.fade);
      gl.uniform3fv(loc.uVeil, b.veil || [0, 0, 0]);
      gl.uniform4fv(loc.uLunarShadow, b.lunarShadow || [0, 0, 0, 0]);
      gl.uniform1f(loc.uQuadScale, b.quadScale || 1);
      gl.uniform1f(loc.uRingTilt, b.ringTilt || 0);
      gl.uniform2f(loc.uRingRadii, b.ringRadii ? b.ringRadii[0] : 0, b.ringRadii ? b.ringRadii[1] : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE); // restore additive for the marker pass
  }

  function onContextRestored() {
    if (!setupGL()) return;
    tints.clear(); // 1x1 tints regenerate lazily in draw()
    noRingTex = null; // regenerates lazily in draw()
    for (const [name, e] of maps) {
      e.ready = false; e.tex = newTex();
      if (e.img) { try { uploadImage(name, e.img); } catch { /* stays tint until next setTexture */ } }
    }
  }
  function dispose() {
    gl.deleteProgram(program); gl.deleteVertexArray(vao);
    for (const e of maps.values()) gl.deleteTexture(e.tex);
    for (const t of tints.values()) gl.deleteTexture(t);
    if (noRingTex) gl.deleteTexture(noRingTex);
  }
  return { draw, setTexture, onContextRestored, dispose };
}
