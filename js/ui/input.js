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
  if (key === 'a' || key === 'A') return 'atmo';   // 'a' = atmosphere on/off (off = space view)
  if (key === 'e' || key === 'E') return 'edit';   // 'e' = edit mode
  return null;
}

// Single-finger drag steers the aim only when gyroscope aim mode is OFF. In gyro mode the device
// orientation owns the aim, so a stray finger drag must not fight it. (Pinch-zoom and tap still work.)
export function dragAimEnabled(flags) { return !flags.gyro; }

// Attach pointer/wheel input to the canvas. Mouse + single-finger touch drag the sky
// (grab-the-sky); the wheel and two-finger pinch zoom toward the view center. Returns a detach()
// function that removes all listeners.
export function attachInput(canvas, store, opts = {}) {
  const pointers = new Map(); // pointerId -> { x, y }
  let pinch = null;           // { startDist, startFov } while two fingers are down
  let downAt = null; // { x, y, moved } for tap-vs-drag detection
  let grabDir = null; // ENU direction grabbed at pointer-down; the drag pins it under the cursor

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
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, moved: false };
    if (pointers.size === 1) grabDir = unproject(e.clientX, e.clientY, camNow());
    // pointerdown always fires before the next pointermove, so the pointer map is consistent here.
    if (pointers.size === 2) pinch = { startDist: twoPointerDist(), startFov: store.getState().fov };
  };

  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (downAt) downAt.moved = downAt.moved || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); // keep both fingers current so a 2->1 lift resumes drag without a jump
    if (pointers.size === 2 && pinch) { // pinch-zoom takes over from drag
      store.setFov(pinchToFov(pinch.startFov, pinch.startDist, twoPointerDist()));
      return;
    }
    if (!dragAimEnabled(store.getState().flags)) { grabDir = null; return; } // gyro/AR owns the aim — and may move it, so the grab is stale
    if (!grabDir) return;
    // Grab-the-sky: solve for the aim that keeps the grabbed point pinned under the cursor —
    // exact at any pitch (near the zenith the drag naturally becomes rotation about it).
    const { az, alt } = grabAim(grabDir, e.clientX, e.clientY, camNow());
    store.setAim(az, alt);
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
    store.setFov(wheelToFov(store.getState().fov, e.deltaY));
  };

  const onKey = (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    const flag = toggleKeyAction(e.key);
    if (flag) { store.setFlag(flag, !store.getState().flags[flag]); return; }
    if (store.getState().flags.edit && opts.onAction) {
      if (e.key === 'd' || e.key === 'D') opts.onAction('download');
      if (e.key === 'r' || e.key === 'R') opts.onAction('reset');
      if (e.key === 'n' || e.key === 'N') opts.onAction('next');
      if (e.key === 'p' || e.key === 'P') opts.onAction('prev');
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);

  return function detach() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
  };
}
