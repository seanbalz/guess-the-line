import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
// The browser offer is captured by installPrompt.js at page load (eagerly, from main.jsx),
// so it survives until Settings is opened even though this screen is lazy-loaded.
import { getInstallPrompt, takeInstallPrompt } from './installPrompt';
export default function InstallApp() {
  const [prompt, setPrompt] = useState(getInstallPrompt), [message, setMessage] = useState('');
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const offer = () => setPrompt(getInstallPrompt());
    const done = () => { setInstalled(true); setPrompt(null); setMessage('The app was added to this device.'); };
    window.addEventListener('gtl-install-offer', offer); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('gtl-install-offer', offer); window.removeEventListener('appinstalled', done); };
  }, []);
  async function install() {
    if (!prompt) return;
    const current = takeInstallPrompt() || prompt; setPrompt(null);
    try { await current.prompt(); const choice = await current.userChoice; setMessage(choice.outcome === 'accepted' ? 'Install accepted. Your browser will finish adding the app.' : 'Installation cancelled. You can keep playing in your browser.'); }
    catch { setMessage('Use your browser menu to add the app to this device.'); }
  }
  return <section className="panel install-app" aria-labelledby="install-app-title"><h2 id="install-app-title"><Smartphone size={20}/>Add Guess The Line to your device</h2>{installed ? <p>You’re using the installed app view.</p> : <><p>Open your weekly game from your Home Screen or desktop. Sign in with your existing account to access saved picks.</p>{prompt && window.isSecureContext && <button className="primary" onClick={install}><Download size={18}/>Install app</button>}<details><summary>Install instructions</summary><ol><li>On iPhone or iPad, open this site in Safari, open the Share menu, then choose Add to Home Screen. If offered, enable Open as Web App.</li><li>On supported desktop or Android browsers, use the address bar install icon or the browser menu’s Install app / Add to Home Screen action.</li></ol><p>If your browser does not offer installation, you can use the website normally.</p></details></>}{message && <p role="status">{message}</p>}<p className="muted">An internet connection is required to load your account and save changes. Installation does not enable notifications. Push, email and SMS delivery are not connected.</p></section>;
}
