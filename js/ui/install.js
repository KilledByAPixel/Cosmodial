// Install-prompt plumbing for the ☰ menu's "Install app" button. Chromium-only by nature:
// only Chromium fires beforeinstallprompt (iOS/Firefox install via the browser's own menu,
// as the README explains), and it doesn't fire when the app is already installed or running
// standalone — so "show the button only when installable and not yet installed" falls out
// for free. windowRef is injected so the state machine is testable with plain fakes.
// True when the menu should offer iOS install GUIDANCE (no programmatic install exists there:
// every iOS browser is WebKit and none fires beforeinstallprompt — install is the browser's own
// Share → "Add to Home Screen"). iPadOS reports itself as "Macintosh", so touch support is the
// tiebreaker. Suppressed when already running from the Home Screen; iOS gives no signal for
// "added but currently browsing", so the hint still shows in that case — accepted limit.
export function iosInstallHint({ userAgent, maxTouchPoints = 0, standalone = false }) {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && !standalone;
}

export function watchInstallability({ windowRef }) {
  let deferred = null; // the stashed BeforeInstallPromptEvent, if the browser has offered one
  const subs = new Set();
  const notify = () => { for (const fn of subs) fn(!!deferred); };
  windowRef.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini-infobar away; the menu button is the UI
    deferred = e;
    notify();
  });
  // Covers installs from browser UI too (address-bar icon), not just our button.
  windowRef.addEventListener('appinstalled', () => { deferred = null; notify(); });
  return {
    installable: () => !!deferred,
    // Subscribe + immediate sync with the current state (the store.subscribe pattern), so a
    // button built after an early beforeinstallprompt still shows up.
    onChange(fn) { subs.add(fn); fn(!!deferred); },
    // Show the browser's install dialog (must be called from inside a user gesture). The
    // stashed event is single-use in Chromium, so it's consumed whatever the user chooses;
    // on a dismissal the browser may re-fire beforeinstallprompt later, which re-stashes
    // and brings the button back.
    prompt() {
      if (!deferred) return;
      const ev = deferred;
      deferred = null;
      notify();
      ev.prompt();
    },
  };
}
