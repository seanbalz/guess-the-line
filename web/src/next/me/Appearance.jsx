import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { Card, Icon, Segmented, Switch } from '../ui/index.js';
import { PrismBrand } from '../ui/PrismBrand.jsx';
import './accountPrism.css';
const themes = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }];
export function Appearance() {
  const theme = useThemePreference();
  const [preferences, setPreferences, { storageAvailable, resolvedMotion }] = useDashboardPreferences();
  const [systemLight, setSystemLight] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: light)'); const change = () => setSystemLight(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  const preference = theme?.preference ?? 'dark', resolved = preference === 'system' ? (systemLight ? 'light' : 'dark') : preference;
  const saved = (theme?.saved ?? true) && storageAvailable;
  return <div className="gx-account-stack gx-appearance-prism">
    <div className="gx-account-heading"><span className="gx-account-icon"><Icon icon={preference === 'system' ? Monitor : resolved === 'light' ? Sun : Moon}/></span><div><h3>Make it feel like yours.</h3><p>Keep the look you selected.</p></div></div>
    <h3 className="gx-t-label">Theme</h3><Segmented label="Theme" options={themes} value={preference} onChange={value => theme?.choose(value)}/>
    <div className="gx gx-appearance-mini" data-theme={resolved} aria-label={`${resolved === 'light' ? 'Porcelain' : 'Dark'} appearance preview`}><header><PrismBrand/><strong>Guess the Line</strong><span>{resolved === 'light' ? 'Porcelain' : 'Dark'}</span></header><article><div><small>APPEARANCE PREVIEW</small><h4>Finish your picks</h4><p>Your game. Your look.</p></div><span className="gx-appearance-progress" aria-hidden="true"><svg viewBox="0 0 64 64"><circle className="gx-appearance-track" cx="32" cy="32" r="25"/><circle className="gx-appearance-fill" cx="32" cy="32" r="25" pathLength="100" strokeDasharray="65 100"/></svg></span></article></div>
    <p className="gx-t-meta" role="status">{preference === 'system' ? `System → ${resolved === 'light' ? 'Light' : 'Dark'}` : `${resolved === 'light' ? 'Light' : 'Dark'} selected`}</p>
    <Card className="gx-account-stack"><h3 className="gx-t-label">Motion</h3><Switch label="Reduce motion" sub="Your device’s own setting also stops motion." checked={preferences.motion === 'reduced'} onChange={on => setPreferences({ motion: on ? 'reduced' : 'system' })}/><p className="gx-t-meta" data-effective-motion={resolvedMotion}>{resolvedMotion === 'reduced' ? (preferences.motion === 'reduced' ? 'Reduced · selected here' : 'Reduced · requested by your device') : 'Standard · follows your device'}</p></Card>
    <section className="gx-account-panel gx-account-note" data-storage={saved ? 'available' : 'unavailable'}><Icon icon={saved ? 'shieldCheck' : 'alert'}/><div><strong>{saved ? 'On this device' : 'Browser storage unavailable'}</strong><p>{saved ? 'Saved on this device, not your account.' : 'This browser isn’t saving settings, so this lasts until you close the page.'}</p></div></section>
  </div>;
}
