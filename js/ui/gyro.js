import { deviceToCamera } from '../core/orientation.js';
import { wrap360 } from '../core/angles.js';

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

// Resolve one device-orientation sample into camera { az, alt, roll } (degrees).
// `alt` and `roll` come from the device tilt (beta/gamma) and are independent of the yaw zero-point,
// so the matrix supplies them. The azimuth source is platform-specific:
//   - Android's `deviceorientationabsolute` gives a north-referenced `alpha`, so the matrix azimuth
//     is already a true bearing — use it.
//   - iOS has no absolute alpha; it provides `compass` (webkitCompassHeading), a tilt-compensated
//     true-north heading of where the device points. Use it DIRECTLY as the aim azimuth. Feeding
//     `360 - compass` into the Euler `alpha` is wrong off-portrait — the heading is tilt-compensated
//     but the Euler alpha is not — which flipped the view ~180° when aiming up in landscape.
export function sampleToCamera({ alpha, beta, gamma, compass, screen }) {
  const s = deviceToCamera({ alpha: Number.isFinite(alpha) ? alpha : 0, beta: beta || 0, gamma: gamma || 0, screen: screen || 0 });
  const az = Number.isFinite(compass) ? wrap360(compass) : s.az;
  return { az, alt: s.alt, roll: s.roll };
}

// Stream device orientation into store.setOrientation(az, alt, roll). Picks the heading source
// (iOS webkitCompassHeading, else the absolute event's north-referenced alpha), corrects for screen
// orientation, and low-pass smooths to kill jitter. Returns detach() removing the listener.
export function attachGyro(store, opts = {}) {
  const smoothing = opts.smoothing ?? 0.2; // 0..1; higher = snappier but noisier
  const screenAngle = () => {
    if (typeof window === 'undefined') return 0;
    const a = window.screen && window.screen.orientation && window.screen.orientation.angle;
    return Number.isFinite(a) ? a : (window.orientation || 0); // angle 0 (portrait) is valid, not a fallthrough
  };
  let prev = null;

  const onOrient = (e) => {
    const s = sampleToCamera({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, compass: e.webkitCompassHeading, screen: screenAngle() });
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
