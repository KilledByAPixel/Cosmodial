// The ℹ️ About modal: a short card over the sky — what this is, who made it, where the code
// lives. Click outside the card, the ×, or Escape to dismiss. Plain DOM, one at a time.

const GITHUB_URL = 'https://github.com/KilledByAPixel/Cosmodial';

export function openAbout() {
  if (document.querySelector('.about-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'about-overlay';
  overlay.innerHTML = `
    <div class="about-card" role="dialog" aria-label="About Cosmodial">
      <button type="button" class="about-close" aria-label="Close">×</button>
      <h2>Cosmodial Sky Atlas</h2>
      <p>The whole night sky, live from your web browser.</p>
      <p>Copyright 2026 <a href="https://frankforce.com" target="_blank" rel="noopener">Frank Force</a></p>
      <p><a href="${GITHUB_URL}" target="_blank" rel="noopener">Open source on GitHub</a> — MIT license</p>
    </div>`;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.about-close')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
}
