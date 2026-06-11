// Screenshot capture: composite the WebGL sky canvas and the 2D overlay (lines/labels/HUD) into
// one PNG at the current canvas pixel size and trigger a download. The GL context is created
// WITHOUT preserveDrawingBuffer (cheaper every frame), so the caller must re-render synchronously
// in the same task before calling saveComposite — the buffer is only guaranteed until the task ends.

// cosmodial-YYYYMMDD-HHMMSS.png from a Date (local time). Pure, unit-tested.
export function screenshotName(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `cosmodial-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

// Draw `layers` (canvases, bottom first) onto an offscreen canvas of width x height device px and
// download the result as a PNG named `name`. Black base coat: the GL layer is opaque sky, but the
// 2D-only fallback clears transparent in places and PNG viewers default to white.
export function saveComposite(layers, width, height, name) {
  const shot = document.createElement('canvas');
  shot.width = width;
  shot.height = height;
  const ctx = shot.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  for (const layer of layers) ctx.drawImage(layer, 0, 0, width, height);
  shot.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); // after the download has grabbed the blob
  }, 'image/png');
}
