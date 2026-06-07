// Grab-the-sky drag: convert a pixel delta into an aim (az, alt) delta in degrees.
// Dragging right pulls the sky right (azimuth decreases); dragging down tilts the view up
// (altitude increases). fov is the horizontal field of view; width is the canvas CSS width.
export function dragToAimDelta(dx, dy, fov, width) {
  const degPerPx = fov / width;
  // || 0 coerces -0 -> 0 so negative zero never leaks into the store / strict-equality checks.
  return { dAz: (-dx * degPerPx) || 0, dAlt: (dy * degPerPx) || 0 };
}

// Mouse-wheel zoom: scale FOV multiplicatively. Scrolling up (deltaY<0) zooms IN (smaller FOV).
// Returns the new, UNCLAMPED FOV; state.setFov clamps to [MIN_FOV, MAX_FOV].
export function wheelToFov(currentFov, wheelDeltaY, step = 0.0015) {
  return currentFov * Math.exp(wheelDeltaY * step);
}

// Pinch zoom: new FOV from the FOV at gesture start and the start/current finger distances.
// Fingers spreading apart (currentDist > startDist) zooms IN.
export function pinchToFov(startFov, startDist, currentDist) {
  if (currentDist <= 0) return startFov;
  return startFov * (startDist / currentDist);
}

// Attach pointer/wheel input to the canvas. Mouse + single-finger touch drag the sky
// (grab-the-sky); the wheel and two-finger pinch zoom toward the reticle. Returns a detach()
// function that removes all listeners.
export function attachInput(canvas, store) {
  const pointers = new Map(); // pointerId -> { x, y }
  let pinch = null;           // { startDist, startFov } while two fingers are down

  const twoPointerDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // ignore right/middle mouse buttons
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch = { startDist: twoPointerDist(), startFov: store.getState().fov };
  };

  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) { // pinch-zoom takes over from drag
      store.setFov(pinchToFov(pinch.startFov, pinch.startDist, twoPointerDist()));
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    const { fov, aim } = store.getState();
    const { dAz, dAlt } = dragToAimDelta(dx, dy, fov, canvas.clientWidth);
    store.setAim(aim.az + dAz, aim.alt + dAlt);
  };

  const onEnd = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };

  const onWheel = (e) => {
    e.preventDefault(); // stop the page from scrolling
    store.setFov(wheelToFov(store.getState().fov, e.deltaY));
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return function detach() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    canvas.removeEventListener('wheel', onWheel);
  };
}
