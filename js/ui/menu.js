// The ☰ menu: a compact popover above its bar button holding everything that isn't needed
// on-screen all the time — location and the view toggles. The sky switches (atmosphere / night /
// AR) live on the bar itself as emoji buttons (buildSkyToggles). Plain DOM, anchored by the
// shared popover primitive.

import { buildLocationControl } from './location.js';
import { detectGyro, requestGyroPermission, attachGyro } from './gyro.js';
import { attachPopover } from './popover.js';
import { openAbout } from './about.js';
import { showToast } from './toast.js';

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
      // Every failure is VISIBLE: on a phone there is no console, and a silently dead button
      // reads as broken. 'denied' is sticky on iOS (the browser remembers) — say where to fix it.
      if (perm !== 'granted') {
        console.warn(`[cosmodial] gyroscope unavailable: ${perm}`);
        showToast(perm === 'denied'
          ? 'Motion access blocked — allow motion & orientation for this site in your browser settings'
          : 'No orientation sensor available', 3000);
        return;
      }
      store.setFlag('gyro', true);                // set the flag BEFORE attaching, so the first
      detach = attachGyro(store, {                // setOrientation events are honored (not no-op'd)
        onNoData: () => showToast('No motion data is arriving from this device — AR aim cannot work here', 3000),
      });
      if (store.getState().fov < 30) store.setFov(50); // don't wave the phone in a telescope view
      showToast('AR aim on — point your phone at the sky', 1600);
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

// A one-shot action button for the menu (same styling as the toggles, no on/off state).
function makeAction(label, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'view-toggle';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

// opts.onScreenshot: capture the current view as a PNG (wired by main.js, which owns the canvases).
// opts.onScreensaver: start screensaver mode (wired by main.js, which owns the controller).
// opts.install: installability watcher (js/ui/install.js); its button appears only while the
// browser is offering an install prompt — installable, not yet installed, Chromium.
export function buildMenu(store, opts = {}) {
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
      makeToggle(store, 'Eq grid', 'eqgrid'),
      makeToggle(store, 'Deep sky', 'deepsky'),
      makeToggle(store, 'Horizon', 'horizon')),
  );
  // On narrow screens main.js re-homes the bar's emoji sky toggles (🌅 🌙 📱) into this section
  // to free bar width for the search box; it stays hidden while empty (see placeSkyToggles).
  const skySection = section('Sky');
  skySection.hidden = true;
  panel.append(skySection);
  // One-shot tools share a section (a heading per single button read as clutter). The screensaver
  // action closes the menu first so the chrome is already gone when the tour starts.
  let pop; // assigned below
  const tools = [];
  if (opts.onScreenshot) tools.push(makeAction('📷 Screenshot', 'Save the current view as a PNG', opts.onScreenshot));
  if (opts.onScreensaver) {
    tools.push(makeAction('🌌 Sky Tour', 'Sit back and tour the sky — a tap, Space, Enter, or Esc exits',
      () => { pop.close(); opts.onScreensaver(); }));
  }
  if (opts.install) {
    const ib = makeAction('📲 Install app', 'Install Cosmodial as an app — works fully offline',
      () => opts.install.prompt());
    ib.hidden = true;
    opts.install.onChange((ok) => { ib.hidden = !ok; });
    tools.push(ib);
  }
  if (tools.length) panel.append(section('Tools', ...tools));
  panel.append(section('Info', makeAction('✨ About Cosmodial', 'About this app', openAbout)));
  el.append(btn, panel);
  pop = attachPopover(btn, panel);
  return { el, skySection, skyRow: skySection.querySelector('.menu-row') };
}

// The sky switches as emoji-only bar buttons (the name lives in the hover tooltip): atmosphere,
// night mode, and — only on devices with orientation sensors — the AR aim toggle. The AR button is
// created hidden and revealed only once detectGyro confirms a real sensor (desktop browsers define
// the orientation API without ever delivering data, so a plain feature check shows it everywhere).
export function buildSkyToggles(store) {
  const atmo = makeToggle(store, '🌅', 'atmo', 'icon-toggle');
  atmo.title = 'Atmosphere';
  const night = makeToggle(store, '🌙', 'night', 'icon-toggle night-toggle');
  night.title = 'Night mode';
  const ar = makeGyroToggle(store);
  ar.hidden = true;
  detectGyro((ok) => { ar.hidden = !ok; });
  return [atmo, night, ar];
}
