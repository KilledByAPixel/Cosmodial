import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchInstallability, iosInstallHint } from '../js/ui/install.js';

// A fake window: records listeners, lets tests fire them with an event object.
function fakeWindow() {
  const listeners = {};
  return {
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    fire(type, ev) { for (const fn of listeners[type] ?? []) fn(ev); },
  };
}

// A fake BeforeInstallPromptEvent.
const fakePromptEvent = () => ({
  prevented: false, prompted: 0,
  preventDefault() { this.prevented = true; },
  prompt() { this.prompted += 1; },
});

test('beforeinstallprompt is stashed: default suppressed, subscribers told installable', () => {
  const win = fakeWindow();
  const w = watchInstallability({ windowRef: win });
  const seen = [];
  w.onChange((ok) => seen.push(ok));
  assert.deepEqual(seen, [false], 'subscribing syncs the current (not installable) state');
  const ev = fakePromptEvent();
  win.fire('beforeinstallprompt', ev);
  assert.ok(ev.prevented, "Chrome's own mini-infobar is suppressed");
  assert.deepEqual(seen, [false, true]);
  assert.equal(w.installable(), true);
});

test('a late subscriber still learns about an event that fired before the menu was built', () => {
  const win = fakeWindow();
  const w = watchInstallability({ windowRef: win });
  win.fire('beforeinstallprompt', fakePromptEvent());
  const seen = [];
  w.onChange((ok) => seen.push(ok));
  assert.deepEqual(seen, [true], 'immediate sync call carries the current state');
});

test('prompt() shows the dialog once and consumes the single-use event', () => {
  const win = fakeWindow();
  const w = watchInstallability({ windowRef: win });
  const seen = [];
  w.onChange((ok) => seen.push(ok));
  const ev = fakePromptEvent();
  win.fire('beforeinstallprompt', ev);
  w.prompt();
  assert.equal(ev.prompted, 1, 'the stashed browser dialog is shown');
  assert.equal(w.installable(), false, 'the event is single-use: consumed either way');
  assert.deepEqual(seen, [false, true, false]);
  w.prompt();
  assert.equal(ev.prompted, 1, 'a second tap with nothing stashed is a no-op');
});

test('a re-offered prompt after a dismissal brings the button back', () => {
  const win = fakeWindow();
  const w = watchInstallability({ windowRef: win });
  win.fire('beforeinstallprompt', fakePromptEvent());
  w.prompt(); // user dismissed; Chromium may re-fire later
  const again = fakePromptEvent();
  win.fire('beforeinstallprompt', again);
  assert.equal(w.installable(), true);
  w.prompt();
  assert.equal(again.prompted, 1);
});

test('appinstalled hides the button even if the install came from browser UI', () => {
  const win = fakeWindow();
  const w = watchInstallability({ windowRef: win });
  const seen = [];
  win.fire('beforeinstallprompt', fakePromptEvent());
  w.onChange((ok) => seen.push(ok));
  win.fire('appinstalled');
  assert.deepEqual(seen, [true, false]);
  assert.equal(w.installable(), false);
});

test('prompt() with nothing ever stashed does not throw', () => {
  const w = watchInstallability({ windowRef: fakeWindow() });
  assert.doesNotThrow(() => w.prompt());
});

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

test('iosInstallHint: iPhone browsing -> hint; running standalone -> no hint', () => {
  assert.equal(iosInstallHint({ userAgent: IPHONE_UA }), true);
  assert.equal(iosInstallHint({ userAgent: IPHONE_UA, standalone: true }), false,
    'already on the Home Screen: nothing to suggest');
});

test('iosInstallHint: iPadOS masquerades as a Mac but has touch', () => {
  assert.equal(iosInstallHint({ userAgent: IPAD_AS_MAC_UA, maxTouchPoints: 5 }), true);
  assert.equal(iosInstallHint({ userAgent: IPAD_AS_MAC_UA, maxTouchPoints: 0 }), false,
    'a real desktop Mac gets the Chromium path or nothing');
});

test('iosInstallHint: Android is beforeinstallprompt territory, not hint territory', () => {
  assert.equal(iosInstallHint({ userAgent: ANDROID_UA }), false);
});
