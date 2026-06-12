// Install-prompt plumbing for the ☰ menu's "Install app" button. Chromium-only by nature:
// only Chromium fires beforeinstallprompt (iOS/Firefox install via the browser's own menu,
// as the README explains), and it doesn't fire when the app is already installed or running
// standalone — so "show the button only when installable and not yet installed" falls out
// for free. windowRef is injected so the state machine is testable with plain fakes.
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
