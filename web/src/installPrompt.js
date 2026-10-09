// Capture the browser's install offer as soon as the page script runs. The
// screens that show the offer are lazy-loaded, so this listener must live in an
// eagerly imported module (main.jsx) or an early `beforeinstallprompt` is lost.
let pendingInstallPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstallPrompt = event; window.dispatchEvent(new Event('gtl-install-offer')); });
  window.addEventListener('appinstalled', () => { pendingInstallPrompt = null; });
}
export const getInstallPrompt = () => pendingInstallPrompt;
export const takeInstallPrompt = () => { const current = pendingInstallPrompt; pendingInstallPrompt = null; return current; };
