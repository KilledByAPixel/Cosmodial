// A small transient confirmation/notice, parented to body so panel re-renders can't wipe it
// mid-fade. One at a time: a new toast replaces any visible one.
export function showToast(text, ms = 900) {
  for (const old of document.querySelectorAll('.copy-toast')) old.remove();
  const t = document.createElement('div');
  t.className = 'copy-toast';
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.classList.add('gone'), ms);
  setTimeout(() => t.remove(), ms + 600);
}

// A persistent, tappable notice ("Update ready — tap to apply"): runs `onTap` and dismisses
// on tap, or quietly fades after `ms`. Replaces any visible toast, like showToast.
export function showActionToast(text, onTap, ms = 15000) {
  for (const old of document.querySelectorAll('.copy-toast')) old.remove();
  const t = document.createElement('div');
  t.className = 'copy-toast action';
  t.textContent = text;
  t.addEventListener('click', () => { t.remove(); onTap(); });
  document.body.append(t);
  setTimeout(() => {
    t.classList.add('gone');
    setTimeout(() => t.remove(), 600);
  }, ms);
}
