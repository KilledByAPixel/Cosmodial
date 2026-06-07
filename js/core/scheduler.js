// Coalesce many state changes into a single render per animation frame.
// raf: a requestAnimationFrame-like function; injected so this is testable without a browser.
export function createRenderScheduler(renderFn, raf) {
  let scheduled = false;
  return function requestRender() {
    if (scheduled) return;
    scheduled = true;
    // Reset the flag BEFORE calling renderFn so (a) renderFn may itself call requestRender, and
    // (b) a throw in renderFn doesn't permanently block future renders.
    raf(() => { scheduled = false; renderFn(); });
  };
}
