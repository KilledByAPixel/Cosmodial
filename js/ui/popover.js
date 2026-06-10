// Minimal popover manager for the control bar: shows/hides a panel anchored above its button,
// closes on outside-tap or Escape, and keeps at most ONE popover open app-wide (opening any
// popover closes the others). Pure DOM glue — positioning comes from CSS (.popover).

const all = new Set(); // every wired popover, so any opening can close the rest

export function attachPopover(button, panel) {
  let open = false;
  const setOpen = (v) => {
    open = v;
    panel.hidden = !v;
    button.classList.toggle('on', v);
    button.setAttribute('aria-expanded', String(v));
  };
  const api = { isOpen: () => open, close: () => { if (open) setOpen(false); } };
  all.add(api);

  button.addEventListener('click', () => {
    if (open) { setOpen(false); return; }
    for (const p of all) p.close(); // exclusive: opening one closes the others
    setOpen(true);
  });
  // Outside-tap closes. pointerdown (not click) so a drag that starts on the sky dismisses it too.
  document.addEventListener('pointerdown', (e) => {
    if (open && !panel.contains(e.target) && !button.contains(e.target)) setOpen(false);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  setOpen(false);
  return api;
}
