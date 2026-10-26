// `sh.switcher`, "Your leagues" (redesign build plan stage 11; prototype spec 3.6; inventory rows 5, 8, 9, 12, 13).
// The league pill and the old `#groups` link open it. Invitations come first: the invite link saved in this tab (Join
// or Dismiss) and the invites sent to this account's email (Join). Then the leagues: the Community first, then this
// account's groups, the one showing checked; tapping one shows it ("Showing …") and keeps the choice on this device.
// Hosts manage private-league invitations here; members can create a Duel or Group without leaving the new app.
//
// Join is a write: it is sent once and never retried by itself. A lost answer says to check, and the leagues below are
// read again, so a league that was joined shows up there.
import { lazy, Suspense, useId, useState } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useAppData } from '../data/AppData.jsx';
import { fmtFull, plural } from '../format.js';
import { useShell } from '../shell/context.js';
import { Avatar, Button, Card, Icon, LinkRow, List, Row, Sheet } from '../ui/index.js';

const CreateLeague = lazy(() => import('./CreateLeague.jsx').then(module => ({ default: module.CreateLeague })));
const InvitePlayers = lazy(() => import('./InvitePlayers.jsx').then(module => ({ default: module.InvitePlayers })));

export const SWITCHER_COPY = Object.freeze({
  title: 'Your leagues',
  invitations: 'Invitations',
  savedTitle: 'You have an invite link',
  savedMeta: 'Join with the account the invite was sent to.',
  invited: (from, league) => `${from} invited you to ${league}`,
  expires: when => `Expires ${when}`,
  join: 'Join',
  joining: 'Joining…',
  joinSaved: 'Join with your invite link',
  joinLeague: league => `Join ${league}`,
  dismiss: 'Dismiss',
  dismissSaved: 'Dismiss your invite link',
  leagues: 'Leagues',
  players: n => plural(n, 'player'),
  host: 'You host',
  everyLeague: 'Picks and bets count in every league you’re in.',
  showing: name => `Showing ${name}`,
  joined: name => (name ? `You’re in ${name}` : 'You joined.'),
  uncertain: 'We couldn’t confirm you joined. Your leagues below were checked again; if it isn’t there, try Join again.',
  signIn: 'Sign in again to join.',
  offline: 'You didn’t join. Check your connection and try again.',
});

function rowMeta(row) {
  const parts = [];
  if (row.players !== null && row.players !== undefined) parts.push(SWITCHER_COPY.players(row.players));
  if (row.host) parts.push(SWITCHER_COPY.host);
  return parts.join(' · ');
}

function InviteCard({ who, title, meta, primary, joinLabel, busy, problem, onJoin, onDismiss, dismissLabel }) {
  return (
    <Card variant="wait" className="gx-vstack gx-gap-12">
      <div className="gx-hstack gx-gap-12">
        <Avatar id={who} name={who} size={40}/>
        <div className="gx-vstack gx-grow">
          <p className="gx-t-strong">{title}</p>
          {meta ? <p className="gx-t-meta">{meta}</p> : null}
        </div>
      </div>
      <div role="alert">{problem ? <p className="gx-t-body gx-solo-problem">{problem}</p> : null}</div>
      <div className="gx-hstack gx-gap-8">
        <Button variant={primary ? 'primary' : 'secondary'} className="gx-grow" aria-label={joinLabel} aria-disabled={busy || undefined} onClick={onJoin}>
          {busy ? SWITCHER_COPY.joining : SWITCHER_COPY.join}
        </Button>
        {onDismiss ? <Button variant="ghost-2" aria-label={dismissLabel} onClick={onDismiss}>{SWITCHER_COPY.dismiss}</Button> : null}
      </div>
    </Card>
  );
}

export function SwitcherSheet({ args = {} }) {
  const shell = useShell();
  const app = useAppData();
  const [busy, setBusy] = useState(null);
  const [problems, setProblems] = useState({});
  const invitesId = useId();
  const hasInvites = !!app.savedInvite || app.invites.length > 0;

  async function join(key, body) {
    if (busy || !shell.confirmLeave()) return;
    setBusy(key);
    setProblems(current => ({ ...current, [key]: '' }));
    const result = await app.join(body);
    setBusy(null);
    if (result.ok) {
      shell.closeSheet();
      shell.toast(SWITCHER_COPY.joined(result.league?.name));
      return;
    }
    const message = { uncertain: SWITCHER_COPY.uncertain, signIn: SWITCHER_COPY.signIn, refused: result.message }[result.kind] || SWITCHER_COPY.offline;
    setProblems(current => ({ ...current, [key]: message }));
  }
  function pick(row) {
    if (!row.on) {
      if (!shell.confirmLeave()) return;
      app.chooseLeague(row);
      shell.toast(SWITCHER_COPY.showing(row.name));
    }
    shell.closeSheet();
  }

  if (args.createLeague) return <Suspense fallback={<Sheet title="Create a league" onClose={shell.closeSheet}><p className="gx-t-body" role="status">Loading league creation…</p></Sheet>}>
    <CreateLeague key={app.accountId}/>
  </Suspense>;
  const hosted = app.leagues.filter(row => row.host && !row.community && row.id !== 'sean-troy-luke');
  const inviteLeague = hosted.find(row => row.id === args.inviteLeagueId);
  if (inviteLeague) return <Suspense fallback={<Sheet title={`Invite to ${inviteLeague.name}`} onClose={shell.closeSheet}
    back={{ label: 'Your leagues', onBack: () => shell.setSheetArgs({ inviteLeagueId: null }) }}><p className="gx-t-body" role="status">Loading invitations…</p></Sheet>}>
    <InvitePlayers key={`${app.accountId}:${inviteLeague.id}`} league={inviteLeague}/>
  </Suspense>;

  return (
    <Sheet title={SWITCHER_COPY.title} onClose={shell.closeSheet}>
      {hasInvites ? (
        <section className="gx-vstack gx-gap-8" aria-labelledby={invitesId}>
          <h3 className="gx-t-micro gx-c-2" id={invitesId}>{SWITCHER_COPY.invitations}</h3>
          {app.savedInvite ? (
            <InviteCard
              who={app.accountId}
              title={SWITCHER_COPY.savedTitle}
              meta={SWITCHER_COPY.savedMeta}
              primary
              joinLabel={SWITCHER_COPY.joinSaved}
              busy={busy === 'saved'}
              problem={problems.saved}
              onJoin={() => join('saved', { token: app.savedInvite })}
              onDismiss={app.dismissSavedInvite}
              dismissLabel={SWITCHER_COPY.dismissSaved}
            />
          ) : null}
          {app.invites.map((invite, index) => (
            <InviteCard
              key={invite.id}
              who={invite.from}
              title={SWITCHER_COPY.invited(invite.from, invite.leagueName)}
              meta={invite.expiresAt ? SWITCHER_COPY.expires(fmtFull(invite.expiresAt)) : ''}
              primary={!app.savedInvite && index === 0}
              joinLabel={SWITCHER_COPY.joinLeague(invite.leagueName)}
              busy={busy === invite.id}
              problem={problems[invite.id]}
              onJoin={() => join(invite.id, { inviteId: invite.id })}
            />
          ))}
        </section>
      ) : null}
      <Card variant="flush">
        <List label={SWITCHER_COPY.leagues}>
          {app.leagues.map(row => (
            <Row
              key={row.id}
              size={64}
              start={<Avatar id={row.id} name={row.name} size={40}/>}
              title={<span className="gx-truncate gx-league-row-name">{row.name}</span>}
              sub={rowMeta(row)}
              end={row.on ? <Icon icon="check" size={20} className="gx-c-accent"/> : null}
              aria-current={row.on ? 'true' : undefined}
              onClick={() => pick(row)}
            />
          ))}
        </List>
      </Card>
      <p className="gx-t-meta">{SWITCHER_COPY.everyLeague}</p>
      {hosted.length > 0 && <Card variant="flush"><List label="Leagues you host">
        {hosted.map(row => <LinkRow key={row.id} icon="plus" onClick={() => shell.setSheetArgs({ inviteLeagueId: row.id })}>Invite to {row.name}</LinkRow>)}
      </List></Card>}
      <Button variant={hasInvites ? 'secondary' : 'primary'} block onClick={() => shell.setSheetArgs({ createLeague: true, inviteLeagueId: null })}>Create a league</Button>
      <Card variant="flush">
        <List>
          <LinkRow key="old" icon="swap" onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</LinkRow>
        </List>
      </Card>
    </Sheet>
  );
}
