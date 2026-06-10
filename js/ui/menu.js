// The ☰ menu: a compact popover above its bar button holding everything that isn't needed
// on-screen all the time — location and the view toggles. The sky switches (atmosphere / night /
// AR) live on the bar itself as emoji buttons (buildSkyToggles). Plain DOM, anchored by the
// shared popover primitive.

import { buildLocationControl } from './location.js';
import { isGyroSupported, requestGyroPermission, attachGyro } from './gyro.js';
import { attachPopover } from './popover.js';

// A button that toggles a boolean state flag and reflects it via the `.on` class.
export function makeToggle(store, label, flag, className = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `view-toggle ${className}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', () => store.setFlag(flag, !store.getState().flags[flag]));
  const sync = () => {
    const on = store.getState().flags[flag];
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  store.subscribe(sync);
  sync();
  return btn;
}

// The gyroscope/AR toggle: shown only on devices with orientation sensors. Activating it requests
// permission (must run inside this click handler for iOS) and, if granted, streams device orientation
// into store.setOrientation; deactivating detaches and lets setFlag('gyro', false) level the roll.
function makeGyroToggle(store) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'view-toggle icon-toggle';
  btn.textContent = '📱';
  btn.title = 'AR — aim by moving your phone';
  let detach = null;
  let activating = false; // guards against a second tap while the (async) permission prompt is open
  btn.addEventListener('click', async () => {
    if (store.getState().flags.gyro) {            // turn OFF
      if (detach) { detach(); detach = null; }
      store.setFlag('gyro', false);
      return;
    }
    if (activating) return;                       // a permission request is already in flight
    activating = true;
    try {
      const perm = await requestGyroPermission(); // turn ON — request inside the gesture (iOS)
      if (perm !== 'granted') { console.warn(`[cosmodial] gyroscope unavailable: ${perm}`); return; }
      store.setFlag('gyro', true);                // set the flag BEFORE attaching, so the first
      detach = attachGyro(store);                 // setOrientation events are honored (not no-op'd)
      if (store.getState().fov < 30) store.setFov(50); // don't wave the phone in a telescope view
    } finally {
      activating = false;
    }
  });
  const sync = () => {
    const on = store.getState().flags.gyro;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  };
  store.subscribe(sync);
  sync();
  return btn;
}

// A labelled menu section: small uppercase heading over a wrapping row of controls.
function section(label, ...children) {
  const wrap = document.createElement('div');
  wrap.className = 'menu-section';
  const head = document.createElement('div');
  head.className = 'menu-label';
  head.textContent = label;
  const row = document.createElement('div');
  row.className = 'menu-row';
  row.append(...children);
  wrap.append(head, row);
  return wrap;
}

export function buildMenu(store) {
  const el = document.createElement('div');
  el.className = 'ctrl menu';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-button';
  btn.textContent = '☰';
  btn.title = 'Menu';
  const panel = document.createElement('div');
  panel.className = 'popover menu-panel';
  panel.hidden = true;
  panel.append(
    section('Location', buildLocationControl(store)),
    section('View',
      makeToggle(store, 'Constellations', 'lines'),
      makeToggle(store, 'Labels', 'labels'),
      makeToggle(store, 'Grid', 'grid'),
      makeToggle(store, 'Deep sky', 'deepsky')),
  );
  el.append(btn, panel);
  attachPopover(btn, panel);
  return { el };
}

// The sky switches as emoji-only bar buttons (the name lives in the hover tooltip): atmosphere,
// night mode, and — only on devices with orientation sensors — the AR aim toggle.
export function buildSkyToggles(store) {
  const atmo = makeToggle(store, '🌅', 'atmo', 'icon-toggle');
  atmo.title = 'Atmosphere';
  const night = makeToggle(store, '🌙', 'night', 'icon-toggle night-toggle');
  night.title = 'Night mode';
  const out = [atmo, night];
  if (isGyroSupported()) out.push(makeGyroToggle(store));
  return out;
}
