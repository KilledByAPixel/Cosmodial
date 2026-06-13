import { unproject, grabAim } from '../core/projection.js';

// Mouse-wheel zoom: scale FOV multiplicatively. Scrolling up (deltaY<0) zooms IN (smaller FOV).
// Returns the new, UNCLAMPED FOV; state.setFov clamps to [MIN_FOV, MAX_FOV].
// step=0.0015: a mouse wheel (~±100/notch) gives ~16% FOV change per notch; trackpads accumulate smoothly.
export function wheelToFov(currentFov, wheelDeltaY, step = 0.0015) {
  return currentFov * Math.exp(wheelDeltaY * step);
}

// Pinch zoom: new FOV from the FOV at gesture start and the start/current finger distances.
// Fingers spreading apart (currentDist > startDist) zooms IN.
export function pinchToFov(startFov, startDist, currentDist) {
  if (currentDist <= 0) return startFov;
  return startFov * (startDist / currentDist);
}

// Map a keyboard key to a state flag to toggle, or null if the key isn't a toggle.
export function toggleKeyAction(key) {
  if (key === 'c' || key === 'C') return 'lines';  // 'c' = constellation lines
  if (key === 'l' || key === 'L') return 'labels'; // 'l' = object name labels
  if (key === 'g' || key === 'G') return 'grid';   // 'g' = alt-az grid
  if (key === 'q' || key === 'Q') return 'eqgrid'; // 'q' = equatorial (RA/Dec) grid
  if (key === 'a' || key === 'A') return 'atmo';   // 'a' = atmosphere on/off (off = space view)
  if (key === 'n' || key === 'N') return 'night';  // 'n' = night (red) mode
  if (key === 'd' || key === 'D') return 'deepsky'; // 'd' = deep-sky objects
  if (key === 'e' || key === 'E') return 'edit';   // 'e' = edit mode
  return null;
}

// Map a key to a time-lapse action: 't' toggles the debug time-lapse, Escape exits it (a no-op
// when it isn't running), '+'/'-' change its speed ('=' is unshifted '+', '_' shifted '-').
// Null if the key isn't one.
export function timeLapseKeyAction(key) {
  if (key === 't' || key === 'T') return 'toggle';
  if (key === 'Escape') return 'stop';
  if (key === '+' || key === '=') return 'faster';
  if (key === '-' || key === '_') return 'slower';
  return null;
}

// Single-finger drag steers the aim only when gyroscope aim mode is OFF. In gyro mode the device
// orientation owns the aim, so a stray finger drag must not fight it. (Pinch-zoom and tap still work.)
export function dragAimEnabled(flags) { return !flags.gyro; }

// Ghost pointers: a pointerdown with isPrimary set asserts the browser sees no OTHER active pointer
// of that type, so any same-type ids still tracked lost their pointerup/pointercancel (e.g. a touch
// that began and ended while the page was janked mid-load). Left tracked, a ghost finger turns every
// later one-finger drag into a phantom pinch — until a reload. Returns the stale ids to evict.
// tracked: Map pointerId -> { type }; down: the new pointerdown event. PURE — unit-tested.
export function ghostPointerIds(tracked, down) {
  if (!down.isPrimary) return [];
  return [...tracked].filter(([, p]) => p.type === down.pointerType).map(([id]) => id);
}

// Damped azimuth for grab-drags near the zenith/nadir. The exact grab solve spins the view
// arbitrarily fast when the grabbed point is angularly close to a pole (like spinning a record
// by a point near its centre — az sensitivity grows as 1/distance-from-pole). Within `zone`
// degrees of the pole the applied az delta is scaled by distance/zone — exactly cancelling that
// growth, so the spin rate stays bounded; the grabbed point trades exact pinning for control
// there. At the zone edge and beyond the solve passes through untouched.
export function dampedGrabAz(currentAz, solvedAz, grabAltDeg, zone = 20) {
  const f = Math.min(1, (90 - Math.abs(grabAltDeg)) / zone);
  const delta = ((solvedAz - currentAz + 540) % 360) - 180; // shortest signed way around
  return (((currentAz + delta * f) % 360) + 360) % 360;
}

// How quickly the aim chases the drag target (seconds). Slow drags lag by velocity·tau —
// imperceptible — while a fast flick becomes a very quick glide instead of a jerk. Tune to taste;
// 0 would restore the old instant-snap feel.
const DRAG_TAU = 0.05;

// Exponential approach of the aim toward the drag target: factor 1 - exp(-dt/tau) per step, so the
// motion is frame-rate independent (two half-steps equal one full step). Shortest-path azimuth.
// PURE — unit-tested.
export function aimApproach(current, target, dt, tau) {
  const k = 1 - Math.exp(-dt / tau);
  const dAz = ((target.az - current.az + 540) % 360) - 180;
  return {
    az: (((current.az + dAz * k) % 360) + 360) % 360,
    alt: current.alt + (target.alt - current.alt) * k,
  };
}

// Attach pointer/wheel input to the canvas. Mouse + single-finger touch drag the sky
// (grab-the-sky); the wheel and two-finger pinch zoom toward the view center. Returns a detach()
// function that removes all listeners.
export function attachInput(canvas, store, opts = {}) {
  const pointers = new Map(); // pointerId -> { x, y }
  let pinch = null;           // { startDist, startFov } while two fingers are down
  let downAt = null; // { x, y, moved } for tap-vs-drag detection
  let grabDir = null; // ENU direction grabbed at pointer-down; the drag pins it under the cursor
  let dragTarget = null; // aim the lerp loop is chasing; null = no chase running
  let lerpRaf = 0;
  let lastT = 0;

  // The chase loop: ease the aim toward dragTarget each frame; after the pointer lifts, keep
  // gliding until the remaining offset is sub-pixel at the current zoom, then snap and stop.
  const stopChase = () => {
    dragTarget = null;
    if (lerpRaf) { cancelAnimationFrame(lerpRaf); lerpRaf = 0; }
  };
  const chaseTick = (t) => {
    lerpRaf = 0;
    if (!dragTarget || !dragAimEnabled(store.getState().flags)) { stopChase(); return; }
    const dt = Math.min(0.1, Math.max(0.001, (t - lastT) / 1000)); // clamp tab-hidden gaps
    lastT = t;
    const st = store.getState();
    const next = aimApproach(st.aim, dragTarget, dt, DRAG_TAU);
    const remAz = Math.abs(((dragTarget.az - next.az + 540) % 360) - 180);
    const rem = Math.hypot(remAz, dragTarget.alt - next.alt);
    if (rem < st.fov * 0.0005 && pointers.size === 0) { // settled after release (< ~⅓ px)
      store.setAim(dragTarget.az, dragTarget.alt);
      stopChase();
      return;
    }
    store.setAim(next.az, next.alt);
    lerpRaf = requestAnimationFrame(chaseTick);
  };
  const chase = (az, alt) => {
    dragTarget = { az, alt };
    if (!lerpRaf) { lastT = performance.now(); lerpRaf = requestAnimationFrame(chaseTick); }
  };

  const camNow = () => {
    const { aim, fov } = store.getState();
    return { az: aim.az, alt: aim.alt, fov, width: canvas.clientWidth, height: canvas.clientHeight };
  };

  const twoPointerDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // ignore right/middle mouse buttons
    const ghosts = ghostPointerIds(pointers, e);
    if (ghosts.length) { for (const id of ghosts) pointers.delete(id); pinch = null; }
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (pointers.size === 1) stopChase(); // grabbing the sky stops any residual glide, mid-flight
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (pointers.size === 1) grabDir = unproject(e.clientX, e.clientY, camNow());
    // pointerdown always fires before the next pointermove, so the pointer map is consistent here.
    if (pointers.size === 2) { pinch = { startDist: twoPointerDist(), startFov: store.getState().fov }; stopChase(); }
  };

  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (downAt) downAt.moved = downAt.moved || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
    pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY }); // keep both fingers current so a 2->1 lift resumes drag without a jump
    if (pointers.size === 2 && pinch) { // pinch-zoom takes over from drag
      if (opts.onUserZoom) opts.onUserZoom();
      store.setFov(pinchToFov(pinch.startFov, pinch.startDist, twoPointerDist()));
      return;
    }
    if (!dragAimEnabled(store.getState().flags)) { grabDir = null; return; } // gyro/AR owns the aim — and may move it, so the grab is stale
    if (!grabDir) return;
    // Grab-the-sky: solve for the aim that keeps the grabbed point pinned under the cursor —
    // exact at any pitch (near the zenith the drag naturally becomes rotation about it), with
    // the azimuth damped when the grabbed point is within a few degrees of a pole.
    const cam = camNow();
    const { az, alt } = grabAim(grabDir, e.clientX, e.clientY, cam);
    const grabAlt = (Math.asin(Math.max(-1, Math.min(1, grabDir[2]))) * 180) / Math.PI;
    chase(dampedGrabAz(cam.az, az, grabAlt), alt); // ease toward the solve instead of snapping
    if (opts.onViewDrag) opts.onViewDrag(); // user moved the view -> exit any lock-on follow
  };

  const onEnd = (e) => {
    if (downAt && !downAt.moved && pointers.size === 1 && opts.onTap) {
      opts.onTap(downAt.x, downAt.y);
    }
    if (pointers.size <= 1) downAt = null;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [pt] = [...pointers.values()];
      grabDir = unproject(pt.x, pt.y, camNow());
    }
    if (pointers.size === 0) grabDir = null;
    if (pointers.size < 2) pinch = null;
  };

  const onWheel = (e) => {
    e.preventDefault(); // stop the page from scrolling
    if (opts.onUserZoom) opts.onUserZoom();
    store.setFov(wheelToFov(store.getState().fov, e.deltaY));
  };

  // Touches that end while the page is hidden never deliver a pointerup; drop all gesture state
  // rather than resume with ghost fingers when the app comes back.
  const onHidden = () => {
    if (!document.hidden) return;
    pointers.clear(); pinch = null; downAt = null; grabDir = null;
  };

  const onKey = (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    // Edit-mode actions own their keys WHILE editing — d/n double as the deep-sky/night toggles
    // everywhere else.
    if (store.getState().flags.edit && opts.onAction) {
      if (e.key === 'd' || e.key === 'D') { opts.onAction('download'); return; }
      if (e.key === 'r' || e.key === 'R') { opts.onAction('reset'); return; }
      if (e.key === 'n' || e.key === 'N') { opts.onAction('next'); return; }
      if (e.key === 'p' || e.key === 'P') { opts.onAction('prev'); return; }
    }
    const flag = toggleKeyAction(e.key);
    if (flag) { store.setFlag(flag, !store.getState().flags[flag]); return; }
    const lapse = timeLapseKeyAction(e.key);
    if (lapse && opts.onTimeLapse) opts.onTimeLapse(lapse);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);

  return function detach() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHidden);
  };
}
