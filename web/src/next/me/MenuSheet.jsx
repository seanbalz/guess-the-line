// `sh.menu`, your avatar's menu (prototype spec 3.7; redesign build plan stage 10): Appearance, Use the old app and
// Sign out. Profile, History, How to play and Settings join it in the Me stages. Appearance opens in place as a
// sub-view ("‹ Menu"), with Dark, Light or System and Reduce motion. Both are kept on this device under the old app's
// own keys (`gtl.theme`, and the motion choice in `gtl.dashboard.preferences.v1`), so the two apps always agree.
import { useState } from 'react';
import { Avatar, Button, Card, LinkRow, List, Segmented, Sheet, Switch } from '../ui/index.js';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { useShell } from '../shell/context.js';
import { ProfileSettings } from './ProfileSettings.jsx';

export const MENU_COPY = Object.freeze({
  title: 'Menu',
  appearance: 'Appearance',
  profile: 'Profile',
  signedInAs: email => `Signed in as ${email}`,
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  theme: 'Theme',
  themes: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
  reduceMotion: 'Reduce motion',
  reduceMotionSub: 'Your device’s own setting also stops motion.',
  saved: 'Saved on this device, not your account. The old app uses the same setting.',
  notSaved: 'This browser isn’t saving settings, so this lasts until you close the page.',
});

function Appearance() {
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

export function MenuSheet({ args }) {
  const shell = useShell();
  const [busy, setBusy] = useState(false);
  if (args.sub === 'profile') return <ProfileSettings key={shell.you.id}/>;
  if (args.sub === 'appearance') {
    return (
      <Sheet title={MENU_COPY.appearance} back={{ label: MENU_COPY.title, onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
        <Appearance/>
      </Sheet>
    );
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    // On success AuthGate shows the sign-in screen and this app unmounts.
    if (!(await shell.signOut())) setBusy(false);
  }
  return (
    <Sheet title={MENU_COPY.title} onClose={shell.closeSheet}>
      <Card className="gx-menu-account"><Avatar id={shell.you.id} name={shell.you.name} size={56}/><div>
        <p className="gx-t-strong">{shell.you.name}</p>
        <p className="gx-t-meta gx-c-2">{MENU_COPY.signedInAs(shell.you.email)}</p>
      </div></Card>
      <Card variant="flush">
        <List>
          <LinkRow key="profile" icon="pencil" onClick={() => shell.setSheetArgs({ sub: 'profile' })}>{MENU_COPY.profile}</LinkRow>
          <LinkRow key="appearance" icon="palette" onClick={() => shell.setSheetArgs({ sub: 'appearance' })}>{MENU_COPY.appearance}</LinkRow>
          <LinkRow key="old" icon="swap" onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</LinkRow>
        </List>
      </Card>
      <Button variant="ghost-2" icon="logOut" className="gx-menu-signout" onClick={signOut} aria-disabled={busy || undefined}>
        {busy ? MENU_COPY.signingOut : MENU_COPY.signOut}
      </Button>
    </Sheet>
  );
}
