// `sh.menu`, your avatar's menu (prototype spec 3.7; redesign build plan stage 10): Appearance and
// Sign out. Profile, History, How to play and Settings join it in the Me stages. Appearance opens in place as a
// sub-view ("‹ Menu"), with Dark, Light or System and Reduce motion. Both are kept on this device under the old app's
// own keys (`gtl.theme`, and the motion choice in `gtl.dashboard.preferences.v1`), so the two apps always agree.
import { lazy, Suspense, useState } from 'react';
import { Avatar, Button, Card, LinkRow, List, Sheet } from '../ui/index.js';
import { Appearance } from './Appearance.jsx';
import { MENU_COPY } from './menuCopy.js';
import { useShell } from '../shell/context.js';
import { AccountPreferences } from './AccountPreferences.jsx';
import { ProfileSettings } from './ProfileSettings.jsx';
import { GUIDANCE_ORDER, INFO } from '../info.js';

const Members = lazy(() => import('./CommunityMembers.jsx').then(module => ({ default: module.CommunityMembers })));
// D-65 follow-up: the commissioner's tools load only when the Community commissioner opens them.
const Commissioner = lazy(() => import('./commissioner/CommissionerTools.jsx').then(module => ({ default: module.CommissionerTools })));
const ExportData = lazy(() => import('./ExportSheet.jsx').then(module => ({ default: module.ExportSheet })));

export { MENU_COPY } from './menuCopy.js';

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
  if (args.sub === 'commissioner' && shell.communityAdmin) return <Suspense fallback={<Sheet title="Commissioner tools" onClose={shell.closeSheet}><p role="status">Loading…</p></Sheet>}><Commissioner key={shell.you.id} tool={args.tool ?? null}/></Suspense>;
  if (args.sub === 'export') return <Suspense fallback={<Sheet title={MENU_COPY.export} onClose={shell.closeSheet}><p role="status">Loading…</p></Sheet>}><ExportData key={shell.you.id}/></Suspense>;
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
          {shell.communityAdmin && <LinkRow icon="settings" onClick={() => shell.setSheetArgs({ sub: 'commissioner', tool: null })}>Commissioner tools</LinkRow>}
          <LinkRow key="profile" icon="pencil" onClick={() => shell.setSheetArgs({ sub: 'profile' })}>{MENU_COPY.profile}</LinkRow>
          <LinkRow key="history" icon="clock" onClick={() => shell.openPage('page.history', {})}>{MENU_COPY.history}</LinkRow>
          <LinkRow key="export" icon="receipt" onClick={() => shell.setSheetArgs({ sub: 'export' })}>{MENU_COPY.export}</LinkRow>
          <LinkRow key="preferences" icon="pencil" onClick={() => shell.setSheetArgs({ sub: 'preferences' })}>Settings · sportsbooks and guidance</LinkRow>
          <LinkRow key="guidance" icon="info" onClick={() => shell.setSheetArgs({ sub: 'guidance' })}>{MENU_COPY.guidance}</LinkRow>
          <LinkRow key="appearance" icon="palette" onClick={() => shell.setSheetArgs({ sub: 'appearance' })}>{MENU_COPY.appearance}</LinkRow>
        </List>
      </Card>
      <Button variant="ghost-2" icon="logOut" className="gx-menu-signout" onClick={signOut} aria-disabled={busy || undefined}>
        {busy ? MENU_COPY.signingOut : MENU_COPY.signOut}
      </Button>
    </Sheet>
  );
}
