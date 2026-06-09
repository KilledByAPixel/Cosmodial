import { deviceToCamera } from '../core/orientation.js';

// True when the browser exposes device-orientation events (mobile). Desktop -> false, so the AR
// toggle is simply never shown there.
export function isGyroSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

// iOS 13+ gates the sensor behind a permission prompt that MUST be triggered from a user gesture
// (call this synchronously inside the toggle's click handler). Returns 'granted' | 'denied' |
// 'unsupported'. Android/desktop have no prompt -> 'granted' when supported.
export async function requestGyroPermission() {
  if (!isGyroSupported()) return 'unsupported';
  const req = window.DeviceOrientationEvent.requestPermission;
  if (typeof req !== 'function') return 'granted';
  try {
    return (await req.call(window.DeviceOrientationEvent)) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

// Shortest-path angular interpolation (degrees), so azimuth smooths across the 0/360 seam.
function lerpAngle(a, b, t) { return a + (((b - a + 540) % 360) - 180) * t; }

// Stream device orientation into store.setOrientation(az, alt, roll). Picks the heading source
// (iOS webkitCompassHeading, else the absolute event's north-referenced alpha), corrects for screen
// orientation, and low-pass smooths to kill jitter. Returns detach() removing the listener.
export function attachGyro(store, opts = {}) {
  const smoothing = opts.smoothing ?? 0.2; // 0..1; higher = snappier but noisier
  const screenAngle = () => {
    if (typeof window === 'undefined') return 0;
    return (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
  };
  let prev = null;

  const onOrient = (e) => {
    // Yaw source: iOS reports a true-north compass heading directly (webkitCompassHeading, clockwise
    // from north); the W3C alpha that yields that heading is (360 - heading). Android's absolute
    // event already provides a north-referenced alpha, so pass it through.
    let alpha = typeof e.alpha === 'number' ? e.alpha : 0;
    if (typeof e.webkitCompassHeading === 'number') alpha = 360 - e.webkitCompassHeading;
    const s = deviceToCamera({ alpha, beta: e.beta || 0, gamma: e.gamma || 0, screen: screenAngle() });
    prev = prev
      ? { az: lerpAngle(prev.az, s.az, smoothing), alt: lerpAngle(prev.alt, s.alt, smoothing), roll: lerpAngle(prev.roll, s.roll, smoothing) }
      : s;
    store.setOrientation(prev.az, prev.alt, prev.roll);
  };

  // Prefer the absolute (north-referenced) event when the platform has it (Android Chrome); otherwise
  // the plain event (iOS, which carries webkitCompassHeading). Using one avoids two sources fighting.
  const evName = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evName, onOrient, true);
  return function detach() { window.removeEventListener(evName, onOrient, true); };
}
