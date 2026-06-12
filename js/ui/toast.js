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
