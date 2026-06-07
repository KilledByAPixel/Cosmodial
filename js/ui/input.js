// Grab-the-sky drag: convert a pixel delta into an aim (az, alt) delta in degrees.
// Dragging right pulls the sky right (azimuth decreases); dragging down tilts the view up
// (altitude increases). fov is the horizontal field of view; width is the canvas CSS width.
export function dragToAimDelta(dx, dy, fov, width) {
  const degPerPx = fov / width;
  // || 0 coerces -0 -> 0 so negative zero never leaks into the store / strict-equality checks.
  return { dAz: (-dx * degPerPx) || 0, dAlt: (dy * degPerPx) || 0 };
}

// Attach pointer-based drag to the canvas. Mouse and single-finger touch both drag the sky.
// (Wheel + pinch zoom are added in the next task.)
export function attachInput(canvas, store) {
  const pointers = new Map(); // pointerId -> { x, y }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // ignore right/middle mouse buttons
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return; // not a tracked drag
    const cur = { x: e.clientX, y: e.clientY };
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    pointers.set(e.pointerId, cur);
    const { fov, aim } = store.getState();
    const { dAz, dAlt } = dragToAimDelta(dx, dy, fov, canvas.clientWidth);
    store.setAim(aim.az + dAz, aim.alt + dAlt);
  });

  const end = (e) => { pointers.delete(e.pointerId); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
