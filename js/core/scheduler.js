// Coalesce many state changes into a single render per animation frame.
// raf: a requestAnimationFrame-like function; injected so this is testable without a browser.
export function createRenderScheduler(renderFn, raf) {
  let scheduled = false;
  return function requestRender() {
    if (scheduled) return;
    scheduled = true;
    raf(() => { scheduled = false; renderFn(); });
  };
}
