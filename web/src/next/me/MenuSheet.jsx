// `sh.menu`, your avatar's menu (prototype spec 3.7; redesign build plan stage 10): Appearance, Use the old app and
// Sign out. Profile, History, How to play and Settings join it in the Me stages. Appearance opens in place as a
// sub-view ("‹ Menu"), with Dark, Light or System and Reduce motion. Both are kept on this device under the old app's
// own keys (`gtl.theme`, and the motion choice in `gtl.dashboard.preferences.v1`), so the two apps always agree.
import { lazy, Suspense, useState } from 'react';
import { Avatar, Button, Card, LinkRow, List, Segmented, Sheet, Switch } from '../ui/index.js';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useThemePreference } from '../../Theme.jsx';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { useShell } from '../shell/context.js';
import { AccountPreferences } from './AccountPreferences.jsx';
import { ProfileSettings } from './ProfileSettings.jsx';
import { GUIDANCE_ORDER, INFO } from '../info.js';

const Members = lazy(() => import('./CommunityMembers.jsx').then(module => ({ default: module.CommunityMembers })));

export const MENU_COPY = Object.freeze({
  title: 'Menu',
  appearance: 'Appearance',
  profile: 'Profile',
  signedInAs: email => `Signed in as ${email}`,
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  theme: 'Theme',
  themes: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
  guidance: 'Guidance and sources',
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

/** D-55: every ⓘ topic in one list, with its sources and licenses. */
function Guidance() {
  return GUIDANCE_ORDER.map(key => {
    const topic = INFO[key];
    return (
      <section key={key} className="gx-vstack gx-gap-8" data-guidance={key}>
        <h3 className="gx-t-strong">{topic.title.replace(/^About /, '').replace(/^./, c => c.toUpperCase())}</h3>
        {topic.body.map(text => <p key={text} className="gx-t-body gx-c-2">{text}</p>)}
        {(topic.links ?? []).map(link => <a key={link.url + link.text} className="gx-t-meta gx-info-link" href={link.url} target="_blank" rel="noreferrer">{link.text}</a>)}
      </section>
    );
  });
}

export function MenuSheet({ args }) {
  const shell = useShell();
  const [busy, setBusy] = useState(false);
  if (args.sub === 'members') return <Suspense fallback={<Sheet title="Community members" onClose={shell.closeSheet}><p role="status">Loading members…</p></Sheet>}><Members key={shell.you.id}/></Suspense>;
  if (args.sub === 'preferences') return <AccountPreferences key={shell.you.id}/>;
  if (args.sub === 'profile') return <ProfileSettings key={shell.you.id}/>;
  if (args.sub === 'guidance') {
    return (
      <Sheet title={MENU_COPY.guidance} back={{ label: MENU_COPY.title, onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet} tall>
        <Guidance/>
      </Sheet>
    );
  }
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
          {shell.communityAdmin && <LinkRow icon="people" onClick={() => shell.setSheetArgs({ sub: 'members' })}>Community members</LinkRow>}
          <LinkRow key="profile" icon="pencil" onClick={() => shell.setSheetArgs({ sub: 'profile' })}>{MENU_COPY.profile}</LinkRow>
          <LinkRow key="preferences" icon="pencil" onClick={() => shell.setSheetArgs({ sub: 'preferences' })}>Settings · sportsbooks and guidance</LinkRow>
          <LinkRow key="guidance" icon="info" onClick={() => shell.setSheetArgs({ sub: 'guidance' })}>{MENU_COPY.guidance}</LinkRow>
          <LinkRow key="appearance" icon="palette" onClick={() => shell.setSheetArgs({ sub: 'appearance' })}>{MENU_COPY.appearance}</LinkRow>
          {/* D-60: the one everyday way into the old app, until older records and tools have new homes. */}
          <LinkRow key="old" icon="swap" onClick={shell.toOldApp}>{APP_SWITCH_COPY.olderRecords}</LinkRow>
        </List>
      </Card>
      <Button variant="ghost-2" icon="logOut" className="gx-menu-signout" onClick={signOut} aria-disabled={busy || undefined}>
        {busy ? MENU_COPY.signingOut : MENU_COPY.signOut}
      </Button>
    </Sheet>
  );
}
