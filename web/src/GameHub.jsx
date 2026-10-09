import React, { lazy, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Flag, LoaderCircle, Plus, RefreshCw, ShieldCheck, TriangleAlert, Users, X } from 'lucide-react';
import DeferredScreen from './DeferredScreen';
import CommunityHome from './CommunityHome';
const App = lazy(() => import('./App.jsx'));
const PersonalWorkspace = lazy(() => import('./PersonalWorkspace.jsx'));
const SocialBetTracker = lazy(() => import('./SocialBetTracker.jsx'));
import ThemeSelector from './Theme';
import Brand from './Brand';
import { cloudApi, date } from './api';
import { clearInvitation, pendingInvitation } from './invitations';
import { goScreen, useScreen } from './screenHash';

const formatName = value => ({ duel: 'Duel', group: 'Group', 'triple-threat': 'Triple Threat' })[value] || value;

function Dialog({ title, onClose, children }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={ref} className="modal hub-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}

function ErrorMessage({ children }) {
  return children ? <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{children}</span></div> : null;
}

function ProfileForm({ profile, onSaved, onCancel }) {
  const [name, setName] = useState(profile?.displayName || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await cloudApi('profile', { displayName: name.trim() }); await onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className="hub-form" onSubmit={submit}>
    <ErrorMessage>{error}</ErrorMessage>
    <label htmlFor="profile-name">Your display name<input id="profile-name" required minLength={1} maxLength={60} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
    <p className="hub-help">Choose the name to use when creating or joining games. Existing game rosters keep the name you joined with.</p>
    <div className="hub-actions"><button className="primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save display name'}<Check size={17}/></button>{onCancel && <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>}</div>
  </form>;
}

function NewGame({ onClose, onCreated }) {
  const [name, setName] = useState(''), [format, setFormat] = useState('duel'), [practice, setPractice] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(null);
  function change(setter, value) { requestId.current = null; setter(value); }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); requestId.current ||= crypto.randomUUID();
    try {
      const result = await cloudApi('leagues', { name: name.trim(), format, practice, requestId: requestId.current });
      await onCreated(result.leagueId);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog title="Start a new game" onClose={busy ? () => {} : onClose}>
    <p className="hub-help">Create a private game, then invite the people you want to play with. Your weekly predictions and Challenge selections are reused. Each group has its own players and standings.</p>
    <form className="hub-form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor="game-name">Game name<input id="game-name" required minLength={1} maxLength={80} placeholder="Give your rivalry a name" value={name} onChange={event => change(setName, event.target.value)} disabled={busy}/></label>
      <fieldset className="format-options"><legend>Who’s playing?</legend>
        <label className={format === 'duel' ? 'selected' : ''}><input type="radio" name="format" value="duel" checked={format === 'duel'} onChange={() => change(setFormat, 'duel')} disabled={busy}/><span><strong>Duel</strong><small>You and one other player</small></span></label>
        <label className={format === 'group' ? 'selected' : ''}><input type="radio" name="format" value="group" checked={format === 'group'} onChange={() => change(setFormat, 'group')} disabled={busy}/><span><strong>Group</strong><small>Bring a group of friends</small></span></label>
      </fieldset>
      <label className="practice-choice"><input type="checkbox" checked={practice} onChange={event => change(setPractice, event.target.checked)} disabled={busy}/><span><strong>Make this a practice game</strong><small>Use this if you’ve already seen the lines. Saving entries here keeps their practice history across groups. Practice scores are unofficial, and the slate’s original deadlines still apply.</small></span></label>
      <p className="hub-help">Games start with the available slate. Matchups whose deadline has passed remain closed. No money or wagers are involved.</p>
      <button className="primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create game'}<ArrowRight size={17}/></button>
    </form>
  </Dialog>;
}

function InvitePlayers({ league, onClose }) {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [created, setCreated] = useState(null), [invites, setInvites] = useState([]), [loading, setLoading] = useState(true);
  const requestId = useRef(null), link = useRef(null);
  const refresh = useCallback(async () => {
    const result = await cloudApi('invites', undefined, { league: league.id });
    setInvites(Array.isArray(result) ? result : result.invites || []);
  }, [league.id]);
  useEffect(() => { let active = true; refresh().catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [refresh]);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice(''); requestId.current ||= crypto.randomUUID();
    try {
      const result = await cloudApi('invites', { email: email.trim(), requestId: requestId.current }, { league: league.id });
      setCreated(result); requestId.current = null;
      try { await refresh(); } catch { setNotice('Invitation created. The invitation list could not refresh; your link is still available below.'); }
    } catch (failure) { setError(failure.message); try { await refresh(); } catch { /* Keep the actionable invitation error. */ } }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(created.inviteUrl); setNotice('Invitation link copied. Share it with the person you invited.'); }
    catch { link.current?.focus(); link.current?.select(); setNotice('Select and copy the invitation link, then share it with the person you invited.'); }
  }
  async function revoke(id) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      await cloudApi('invite/revoke', { inviteId: id }, { league: league.id });
      requestId.current = null;
      if (created?.inviteId === id) setCreated(null);
      await refresh(); setNotice('Invitation revoked. That invitation can no longer be accepted.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Dialog title={`Invite to ${league.name}`} onClose={busy ? () => {} : onClose}>
    <p className="hub-help">Create an invitation for a specific email address, then share its secure link. The recipient creates their own account and chooses to join.</p>
    <ErrorMessage>{error}</ErrorMessage>
    {notice && <p className="auth-notice" role="status">{notice}</p>}
    <form className="hub-form" onSubmit={submit}>
      <label htmlFor="invite-email">Their email address<input id="invite-email" type="email" required maxLength={254} autoComplete="off" value={email} disabled={busy} onChange={event => { setEmail(event.target.value); requestId.current = null; setCreated(null); }}/></label>
      <button className="primary" disabled={busy || !email.trim() || Boolean(created)}>{busy ? 'Working…' : 'Create invitation link'}<Plus size={17}/></button>
    </form>
    {created && <section className="invite-result" aria-label="New invitation">
      <h3>Your invitation link is ready</h3><p>Email delivery is not enabled. Copy this link and send it to the person you invited. Save it before closing; existing links are not shown again.</p>
      <label htmlFor="invite-link">Invitation link<input ref={link} id="invite-link" value={created.inviteUrl} readOnly onFocus={event => event.target.select()}/></label>
      <button className="secondary" onClick={copy}><Copy size={17}/>Copy invitation link</button><small>Expires {date(created.expiresAt)} PT. Only the invited email account can accept.</small>
    </section>}
    <section className="sent-invitations"><h3>Invitations for this game</h3>
      {loading ? <p className="hub-help">Loading invitations…</p> : !invites.length ? <p className="hub-help">No invitations created yet.</p> : <ul>{invites.map(invite => <li key={invite.id}><div><strong>{invite.email}</strong><small>{invite.status} · Expires {date(invite.expiresAt)} PT</small></div>{['pending', 'active'].includes(invite.status) && <button className="secondary" onClick={() => revoke(invite.id)} disabled={busy}>Revoke</button>}</li>)}</ul>}
    </section>
  </Dialog>;
}

export default function GameHub({ session, onSignOut }) {
  const selectionKey = `gtl.selectedGame.${session.user.id}`;
  const [lobby, setLobby] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => { try { return sessionStorage.getItem(selectionKey) || ''; } catch { return ''; } });
  const [creating, setCreating] = useState(false), [editingProfile, setEditingProfile] = useState(false), [inviting, setInviting] = useState(null);
  const [token, setToken] = useState(pendingInvitation);
  const [socialDirty, setSocialDirty] = useState(false);
  // D-21: the community feed is home; groups and games are one step away. Persona audit #3: which screen is open lives in the URL hash
  // (#feed, #picks, #groups), one history entry each, so Back moves between screens and a reload lands on the same one.
  const screen = useScreen(), [communityOnline, setCommunityOnline] = useState(true);
  const groupsOpen = screen === 'groups' || !communityOnline;
  const communityUnavailable = useCallback(() => { setCommunityOnline(false); goScreen('groups', { replace: true }); }, []);
  const load = useCallback(async signal => { const result = await cloudApi('lobby', undefined, { signal }); setLobby(result); return result; }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(failure => { if (failure.name !== 'AbortError') setError(failure.message); }); return () => controller.abort(); }, [load]);
  function choose(id) { setSelected(id); try { id ? sessionStorage.setItem(selectionKey, id) : sessionStorage.removeItem(selectionKey); } catch { /* Selection still works in this tab. */ } }
  async function reload() { setBusy(true); setError(''); try { await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function signOut() { setBusy(true); setError(''); try { await onSignOut(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function accept(body) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const result = await cloudApi('invite/accept', body);
      if (body.token) { clearInvitation(); setToken(''); }
      await load(); choose(result.leagueId);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const profileReady = Boolean(lobby?.profile?.displayName?.trim());
  const current = lobby?.leagues.find(league => league.id === selected);
  const onProfileSaved = async () => { await load(); setEditingProfile(false); setNotice('Your display name has been saved.'); };
  if (!selected && !token && profileReady && !groupsOpen && !editingProfile) return <CommunityHome accountId={session.user.id} displayName={lobby.profile.displayName} onGroups={() => goScreen('groups')} onUnavailable={communityUnavailable} onSignOut={signOut}/>;
  if (selected === 'solo' && profileReady && !token) return <DeferredScreen key={session.user.id} label="your Solo workspace"><PersonalWorkspace key={session.user.id} accountId={session.user.id} onBack={() => choose('')} onSignOut={onSignOut}/></DeferredScreen>;
  if (['social', 'units'].includes(selected) && profileReady && !token) return <div className="hub-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <header className="hub-header"><Brand/><div className="hub-account"><span>{lobby.profile.displayName}</span><button className="secondary" onClick={() => { if (!socialDirty || window.confirm('You have unsaved changes. Leave without saving?')) { setSocialDirty(false); choose(''); } }}>My games</button></div></header>
    <main className="hub-main" id="main"><ThemeSelector/><DeferredScreen resetKey={selected} label={selected === 'units' ? 'your betting week' : 'bet tracker'}><SocialBetTracker key={selected} player={session.user.id} initialView={selected === 'units' ? 'units' : 'feed'} onDirty={setSocialDirty}/></DeferredScreen></main>
  </div>;
  return <>
    {current && !token ? <DeferredScreen resetKey={current.id} label="your league"><App key={current.id} session={session} onSignOut={onSignOut} leagueId={current.id} leagues={lobby.leagues} onSelectLeague={choose} onMyGames={() => { goScreen('groups'); choose(''); }} onInvite={current.role === 'commissioner' && current.format !== 'triple-threat' ? () => setInviting(current) : undefined}/></DeferredScreen>
      : <div className="hub-shell">
        <a className="skip-link" href="#main">Skip to main content</a>
        <header className="hub-header"><Brand /><div className="hub-account"><span>{lobby?.profile?.displayName || session.user.email}</span><button className="secondary" onClick={signOut} disabled={busy}>Sign out</button></div></header>
        <main className="hub-main" id="main">
          <ThemeSelector/>
          <div className="hub-heading"><div>{profileReady && communityOnline && <button className="text-button" onClick={() => goScreen('feed')}>← Community</button>}<p className="eyebrow">YOUR PEOPLE. YOUR PREDICTIONS.</p><h1>My games</h1><p>One weekly spread ballot, one total ballot, and one set of Challenge selections, reused across all your groups. Compete with different people using the same calls.</p></div><button className="primary" disabled={!profileReady || busy} onClick={() => setCreating(true)}><Plus size={18}/>New game</button></div>
          <ErrorMessage>{error}</ErrorMessage>
          {error && <button className="secondary" onClick={reload} disabled={busy}><RefreshCw size={16}/>Try again</button>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {!lobby ? !error && <div className="loading" role="status"><LoaderCircle className="spin"/>Loading your games…</div> : <>
            {(!profileReady || editingProfile) ? <section className="panel profile-setup"><h2>{profileReady ? 'Your display name' : 'First, what should we call you?'}</h2><ProfileForm key={lobby.profile.id} profile={lobby.profile} onSaved={onProfileSaved} onCancel={profileReady ? () => setEditingProfile(false) : undefined}/></section> : <div className="profile-summary"><span>Playing as <strong>{lobby.profile.displayName}</strong></span><button className="text-button" onClick={() => setEditingProfile(true)}>Edit display name</button></div>}
            {profileReady && <section className="panel invitation-card"><ShieldCheck size={24}/><div><h2>Play Solo</h2><p>Your private Favorites, journal and weekly guesses are available without joining a group.</p><button className="primary" disabled={busy} onClick={() => choose('solo')}>Open Solo<ArrowRight size={17}/></button></div></section>}
            {profileReady && <section className="panel invitation-card"><Users size={24}/><div><h2>Bet Tracker</h2><p>Shared with every signed-in player. Follow bets, record singles and parlays, and compare units, ROI and history.</p><div className="hub-actions"><button className="primary" disabled={busy} onClick={() => choose('social')}>Open Bet Tracker<ArrowRight size={17}/></button><button className="secondary" disabled={busy} onClick={() => choose('units')}>My Unit Betting week</button></div></div></section>}
            {token && <section className="panel invitation-card"><ShieldCheck size={24}/><div><h2>You have an invitation link</h2><p>Join with the account whose email was invited. Your private game details appear after acceptance.</p>{!profileReady && <p>Save your display name above to continue.</p>}<div className="hub-actions"><button className="primary" disabled={!profileReady || busy} onClick={() => accept({ token })}>Accept invitation<ArrowRight size={17}/></button><button className="secondary" disabled={busy} onClick={() => { clearInvitation(); setToken(''); }}>Dismiss link</button></div></div></section>}
            {!!lobby.pendingInvites.length && <section className="pending-invitations"><div className="section-title"><h2>Invitations for you</h2></div>{lobby.pendingInvites.map(invite => <section className="panel invitation-card" key={invite.id}><Users size={24}/><div><h3>{invite.leagueName}</h3><p>{invite.inviterName} invited you to a {formatName(invite.format)}. Expires {date(invite.expiresAt)} PT.</p><button className="primary" disabled={!profileReady || busy} onClick={() => accept({ inviteId: invite.id })}>Join game<ArrowRight size={17}/></button></div></section>)}</section>}
            <section aria-label="Your games">{lobby.leagues.length ? <div className="hub-games">{lobby.leagues.map(league => <article className="panel hub-game" key={league.id}><div className="hub-game-top"><span className="mode-icon lime"><Users size={24}/></span><span className={`badge ${league.practice ? 'amber' : ''}`}>{league.practice ? 'PRACTICE' : formatName(league.format)}</span></div><h2>{league.name}</h2><p>{league.memberCount} of {league.maxMembers} players · {league.role === 'commissioner' ? 'You host this game' : 'You’re a player'}</p>{league.practice && <p className="hub-help">No official scores. Original slate deadlines apply.</p>}<div className="hub-actions"><button className="primary" onClick={() => choose(league.id)}>Open game<ArrowRight size={17}/></button>{league.role === 'commissioner' && league.format !== 'triple-threat' && <button className="secondary" disabled={!profileReady} onClick={() => setInviting(league)}>Invite players</button>}</div></article>)}</div> : <div className="panel hub-empty"><Flag size={32}/><h2>Your next rivalry starts here.</h2><p>Create a Duel with one friend or bring a group together. You can play Spread, Total and Betting Challenge in each game.</p><button className="primary" disabled={!profileReady} onClick={() => setCreating(true)}>Create your first game<Plus size={17}/></button></div>}</section>
            <div className="hub-bottom"><span>Private games · No real-money wagers</span><button className="text-button" onClick={reload} disabled={busy}><RefreshCw size={16}/>{busy ? 'Refreshing…' : 'Refresh games'}</button></div>
          </>}
        </main>
      </div>}
    {creating && <NewGame onClose={() => setCreating(false)} onCreated={async id => { await load(); setCreating(false); choose(id); }}/>}
    {inviting && <InvitePlayers league={inviting} onClose={() => setInviting(null)}/>}
  </>;
}
