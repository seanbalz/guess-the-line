import { Card, Segmented, Switch } from '../ui/index.js';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { MENU_COPY } from './menuCopy.js';

export function Appearance() {
  const theme = useThemePreference();
  const [preferences, setPreferences, { storageAvailable }] = useDashboardPreferences();
  const saved = (theme?.saved ?? true) && storageAvailable;
  return (
    <>
      <Segmented label={MENU_COPY.theme} options={MENU_COPY.themes} value={theme?.preference ?? 'dark'} onChange={value => theme?.choose(value)}/>
      <Card variant="flush">
        <Switch
          label={MENU_COPY.reduceMotion}
          sub={MENU_COPY.reduceMotionSub}
          checked={preferences.motion === 'reduced'}
          onChange={on => setPreferences({ motion: on ? 'reduced' : 'system' })}
        />
      </Card>
      <p className="gx-t-meta">{saved ? MENU_COPY.saved : MENU_COPY.notSaved}</p>
    </>
  );
}

