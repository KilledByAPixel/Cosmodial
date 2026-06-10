// Grab-the-sky drag: convert a pixel delta into an aim (az, alt) delta in degrees.
// Dragging right pulls the sky right (azimuth decreases); dragging down tilts the view up
// (altitude increases). fov spans `span` px — the SHORTER canvas dimension (see focalPx), so the
// sky tracks the pointer at the view centre whatever the window aspect.
export function dragToAimDelta(dx, dy, fov, span) {
  const degPerPx = fov / span;
  // || 0 coerces -0 -> 0 so negative zero never leaks into the store / strict-equality checks.
  return { dAz: (-dx * degPerPx) || 0, dAlt: (dy * degPerPx) || 0 };
}

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

  const twoPointerDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // ignore right/middle mouse buttons
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, moved: false };
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
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (!dragAimEnabled(store.getState().flags)) return; // gyro/AR owns the aim
    const { fov, aim } = store.getState();
    const { dAz, dAlt } = dragToAimDelta(dx, dy, fov, Math.min(canvas.clientWidth, canvas.clientHeight));
    store.setAim(aim.az + dAz, aim.alt + dAlt);
    if (opts.onViewDrag) opts.onViewDrag(); // user moved the view -> exit any lock-on follow
  };

  const onEnd = (e) => {
    if (downAt && !downAt.moved && pointers.size === 1 && opts.onTap) {
      opts.onTap(downAt.x, downAt.y);
    }
    if (pointers.size <= 1) downAt = null;
    pointers.delete(e.pointerId);
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
