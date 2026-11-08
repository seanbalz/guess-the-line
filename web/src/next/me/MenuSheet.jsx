import { AccountSheet } from './AccountSheet.jsx';
// `sh.menu`, your avatar's menu (prototype spec 3.7; redesign build plan stage 10): Appearance and
// Sign out. Profile, History, How to play and Settings join it in the Me stages. Appearance opens in place as a
// sub-view ("‹ Menu"), with Dark, Light or System and Reduce motion. Both are kept on this device under the old app's
// own keys (`gtl.theme`, and the motion choice in `gtl.dashboard.preferences.v1`), so the two apps always agree.
// Pick reminders (Board i39) opens the same way, with this device's push switch; its row shows only while the server can
// send pushes (the shell's `pushConfigured`, from the Community read's stage 2 push guard).
import { Activity, BookOpen, ChartNoAxesCombined, CloudSun, Coins, Database, History, Info, Settings2, Shield, SlidersHorizontal, Target, Ticket, Users } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Avatar, Button, Card, Icon, DESTINATION_ICONS as ICON, LinkRow, List, Skeleton } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { AccountPreferences } from './AccountPreferences.jsx';
import { PickReminderSettings } from './PickReminders.jsx';
import { REMINDER_COPY } from './reminders.js';
import { ProfileSettings } from './ProfileSettings.jsx';
import { AppInvite } from './AppInvite.jsx';
import { Appearance } from './Appearance.jsx';
import './accountPrism.css';
import { GUIDANCE_ORDER, INFO } from '../info.js';

const Members = lazy(() => import('./CommunityMembers.jsx').then(module => ({ default: module.CommunityMembers })));
// D-65 follow-up: the commissioner's tools load only when the Community commissioner opens them.
const Commissioner = lazy(() => import('./commissioner/CommissionerTools.jsx').then(module => ({ default: module.CommissionerTools })));
const ExportData = lazy(() => import('./ExportSheet.jsx').then(module => ({ default: module.ExportSheet })));

export const MENU_COPY = Object.freeze({
  title: 'Menu',
  appearance: 'Appearance',
  profile: 'Profile',
  history: 'History',
  export: 'Export my data',
  signedInAs: email => `Signed in as ${email}`,
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  theme: 'Theme',
  themes: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
  guidance: 'Guidance and sources',
  reduceMotion: 'Reduce motion',
  reduceMotionSub: 'Your device’s own setting also stops motion.',
  saved: 'Saved on this device, not your account.',
  notSaved: 'This browser isn’t saving settings, so this lasts until you close the page.',
});

const TOPIC_ICONS = { trends: ChartNoAxesCombined, gameBets: Users, yourPick: Target, guessPicks: Users, marketLines: Activity, research: BookOpen, researchData: Database, trackedBets: Ticket, recommended: SlidersHorizontal, virtual: Coins, everyone: Users, scores: Target, weather: CloudSun, points: ChartNoAxesCombined, history: History, trendBuilder: Settings2, teamRecords: Shield };

/** D-55: every ⓘ topic in one list, with its sources and licenses. */
function Guidance() {
  return GUIDANCE_ORDER.map(key => {
    const topic = INFO[key];
    return (
      <details key={key} className="gx-guidance-topic" data-guidance={key}>
        <summary><span className="gx-account-icon"><Icon icon={TOPIC_ICONS[key] ?? Info}/></span><span>{topic.title.replace(/^About /, '').replace(/^./, c => c.toUpperCase())}{topic.links?.length ? <small>Sources included</small> : null}</span><Icon icon="chevronDown" size={20}/></summary>
        <div className="gx-guidance-body">{topic.body.map(text => <p key={text}>{text}</p>)}
        {(topic.links ?? []).map(link => <a key={link.url + link.text} href={link.url} target="_blank" rel="noreferrer">{link.text}</a>)}</div>
      </details>
    );
  });
}

export function MenuSheet({ args }) {
  const shell = useShell();
  const [busy, setBusy] = useState(false);
  if (args.sub === 'app-invite') return <AppInvite/>;
  if (args.sub === 'members') return <Suspense fallback={<AccountSheet title="Community members" onClose={shell.closeSheet}><Skeleton label="Loading members…" shape="rows" count={4}/></AccountSheet>}><Members key={shell.you.id}/></Suspense>;
  if (args.sub === 'commissioner' && shell.communityAdmin) return <Suspense fallback={<AccountSheet title="Commissioner tools" onClose={shell.closeSheet}><Skeleton label="Loading…" shape="rows" count={4}/></AccountSheet>}><Commissioner key={shell.you.id} tool={args.tool ?? null}/></Suspense>;
  if (args.sub === 'export') return <Suspense fallback={<AccountSheet title={MENU_COPY.export} onClose={shell.closeSheet}><Skeleton label="Loading…" shape="rows" count={4}/></AccountSheet>}><ExportData key={shell.you.id}/></Suspense>;
  if (args.sub === 'preferences') return <AccountPreferences key={shell.you.id}/>;
  if (args.sub === 'profile') return <ProfileSettings key={shell.you.id}/>;
  if (args.sub === 'guidance') {
    return (
      <AccountSheet className="gx-account-prism gx-guidance" title={MENU_COPY.guidance} back={{ label: MENU_COPY.title, onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet} tall>
        <Guidance/>
      </AccountSheet>
    );
  }
  if (args.sub === 'reminders') {
    return (
      <AccountSheet className="gx-account-prism" title={REMINDER_COPY.title} back={{ label: MENU_COPY.title, onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
        <PickReminderSettings key={shell.you.id}/>
      </AccountSheet>
    );
  }
  if (args.sub === 'appearance') {
    return (
      <AccountSheet className="gx-account-prism" title={MENU_COPY.appearance} back={{ label: MENU_COPY.title, onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
        <Appearance/>
      </AccountSheet>
    );
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    // On success AuthGate shows the sign-in screen and this app unmounts.
    if (!(await shell.signOut())) setBusy(false);
  }
  return (
    <AccountSheet className="gx-account-prism gx-account-menu" title={MENU_COPY.title} onClose={shell.closeSheet}>
      <Card className="gx-menu-account"><Avatar id={shell.you.id} name={shell.you.name} size={56}/><div>
        <p className="gx-t-strong">{shell.you.name}</p>
        <p className="gx-t-meta gx-c-2">{MENU_COPY.signedInAs(shell.you.email)}</p>
      </div></Card>
      <Card variant="flush">
        <List>
          {shell.communityAdmin && <LinkRow icon={ICON.members} onClick={() => shell.setSheetArgs({ sub: 'members' })}>Community members</LinkRow>}
          {shell.communityAdmin && <LinkRow icon={ICON.commissioner} onClick={() => shell.setSheetArgs({ sub: 'commissioner', tool: null })}>Commissioner tools</LinkRow>}
          <LinkRow key="app-invite" icon={ICON.appInvite} className="gx-app-invite-entry" onClick={() => shell.setSheetArgs({ sub: 'app-invite' })}>Invite friends</LinkRow>
          <LinkRow key="profile" icon={ICON.profile} onClick={() => shell.setSheetArgs({ sub: 'profile' })}>{MENU_COPY.profile}</LinkRow>
          <LinkRow key="history" icon={ICON.history} onClick={() => shell.openPage('page.history', {})}>{MENU_COPY.history}</LinkRow>
          <LinkRow key="export" icon={ICON.export} onClick={() => shell.setSheetArgs({ sub: 'export' })}>{MENU_COPY.export}</LinkRow>
          <LinkRow key="preferences" icon={ICON.settings} onClick={() => shell.setSheetArgs({ sub: 'preferences' })}>Settings · sportsbooks and guidance</LinkRow>
          {shell.pushConfigured === true && <LinkRow key="reminders" icon={ICON.reminders} onClick={() => shell.setSheetArgs({ sub: 'reminders' })}>{REMINDER_COPY.title}</LinkRow>}
          <LinkRow key="guidance" icon={ICON.guidance} onClick={() => shell.setSheetArgs({ sub: 'guidance' })}>{MENU_COPY.guidance}</LinkRow>
          <LinkRow key="appearance" icon={ICON.appearance} onClick={() => shell.setSheetArgs({ sub: 'appearance' })}>{MENU_COPY.appearance}</LinkRow>
        </List>
      </Card>
      <Button variant="ghost-2" icon="logOut" className="gx-menu-signout" onClick={signOut} aria-disabled={busy || undefined}>
        {busy ? MENU_COPY.signingOut : MENU_COPY.signOut}
      </Button>
    </AccountSheet>
  );
}
