// Stage 59 / Q17-B. The service serializes the owner's creation request and returns
// the same league for the same request id. Retries are explicit and retain that id.
import { useEffect, useId, useRef, useState } from 'react';
import { cloudApi } from '../../api.js';
import { readNextDraft, removeNextDraft, writeNextDraft } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { groupLeagues } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Button, Segmented, Sheet } from '../ui/index.js';
import './invitations.css';

const DRAFT = 'create-league';
function recover(account) {
  try {
    const saved = JSON.parse(readNextDraft(account, DRAFT));
    if (saved?.v === 1 && typeof saved.name === 'string' && saved.name.length <= 80
      && ['duel', 'group'].includes(saved.format)
      && (saved.requestId === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.requestId))
      && (saved.leagueId === null || /^g_[0-9a-f]{32}$/.test(saved.leagueId))) return saved;
  } catch { /* A missing or damaged draft starts empty. */ }
  return { v: 1, name: '', format: 'duel', requestId: null, leagueId: null };
}

export function CreateLeague() {
  const app = useAppData(), shell = useShell();
  const [draft, setDraft] = useState(() => recover(app.accountId));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [kept, setKept] = useState(true);
  const request = useRef(false), lifetime = useRef(null), input = useRef(null);
  const fieldId = useId(), helpId = useId();
  const { setDirty } = shell;
  useEffect(() => {
    const scope = {};
    lifetime.current = scope;
    return () => { lifetime.current = null; };
  }, []);
  useEffect(() => {
    setDirty('create-league', !!draft.name || !!draft.requestId || busy);
    return () => setDirty('create-league', false);
  }, [draft.name, draft.requestId, busy, setDirty]);
  function keep(next) {
    setDraft(next);
    setKept(writeNextDraft(app.accountId, DRAFT, JSON.stringify(next)));
  }
  function change(key, value) {
    if (request.current || draft.requestId) return;
    keep({ ...draft, [key]: value }); setProblem('');
  }
  async function create(event) {
    event.preventDefault();
    const scope = lifetime.current;
    if (!scope || request.current) return;
    if (!draft.name.trim() || /[\x00-\x1f\x7f]/.test(draft.name)) { setProblem('Enter a league name between 1 and 80 characters.'); input.current?.focus(); return; }
    request.current = true; setBusy(true); setProblem('');
    let pending = { ...draft, name: draft.name.trim(), requestId: draft.requestId || crypto.randomUUID() };
    keep(pending);
    try {
      if (!pending.leagueId) {
        const result = await cloudApi('leagues', { name: pending.name, format: pending.format, practice: false, requestId: pending.requestId }, { save: true });
        if (lifetime.current !== scope) return;
        if (!/^g_[0-9a-f]{32}$/.test(result?.leagueId)) { setProblem('The reply did not identify your league. Retry the same creation to recover it safely.'); return; }
        pending = { ...pending, leagueId: result.leagueId }; keep(pending);
      }
      const [read] = await app.refresh({ only: ['lobby'] });
      if (lifetime.current !== scope) return;
      const league = read?.status === 'ready' && !read.error && groupLeagues(read.data).find(row => row.id === pending.leagueId && row.host);
      if (!league) { setProblem('Your league was created, but your league list could not be checked. Choose Show created league to check again.'); return; }
      removeNextDraft(app.accountId, DRAFT); setDirty('create-league', false);
      shell.setSheetArgs({ createLeague: false, inviteLeagueId: league.id });
      shell.toast(`${league.name} created. Invite your friends.`);
    } catch (failure) {
      if (lifetime.current !== scope) return;
      if (failure.status === 401) app.requestSignIn();
      if (failure.name === 'SaveUncertainError') setProblem('We could not confirm creation. Retry the same creation to recover it; this will not create a duplicate league.');
      else if (pending.leagueId) setProblem('Your league was created. Check your connection, then choose Show created league.');
      else {
        // A refusal on a later retry does not prove that the original uncertain request failed.
        if (!draft.requestId) keep({ ...pending, requestId: null });
        setProblem(failure.message || 'The league could not be created.');
      }
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  function leave(next) { if (!request.current && shell.confirmLeave()) next(); }
  return <Sheet title="Create a league" back={{ label: 'Your leagues', onBack: () => leave(() => shell.setSheetArgs({ createLeague: false })) }} onClose={() => leave(shell.closeSheet)}>
    <p className="gx-t-body">Play with friends in a private league. Your weekly picks count across your leagues; each league keeps its own players and standings.</p>
    <form className="gx-invite-stack" onSubmit={create}>
      <label className="gx-field" htmlFor={fieldId}><span className="gx-t-strong">League name</span>
        <input ref={input} id={fieldId} className="gx-input" value={draft.name} required maxLength={80} autoComplete="off" readOnly={busy || !!draft.requestId} onChange={event => change('name', event.target.value)}/></label>
      <fieldset className="gx-league-format gx-invite-stack" disabled={busy || !!draft.requestId} aria-describedby={helpId}>
        <legend className="gx-t-strong">Who’s playing?</legend>
        <Segmented label="League format" value={draft.format} onChange={value => change('format', value)} options={[{ value: 'duel', label: 'Duel' }, { value: 'group', label: 'Group' }]}/>
        <p className="gx-t-meta" id={helpId}>{draft.format === 'duel' ? 'You and one friend.' : 'You and up to 19 friends.'}</p>
      </fieldset>
      <p className="gx-t-meta">Games use the available slate. Games that have already started stay closed. No money or wagers are involved.</p>
      {(draft.name || draft.requestId) && <p className="gx-t-meta">{kept ? 'Draft kept in this tab. It is cleared when you sign out.' : 'This browser cannot keep your draft. Keep this screen open until creation is confirmed.'}</p>}
      {draft.requestId && !busy && <p className="gx-t-body">{draft.leagueId ? 'Your league is saved. Check the league list to continue.' : 'A creation needs checking. Nothing is sent again until you choose Retry same creation.'}</p>}
      <div role="alert">{problem && <p className="gx-t-body gx-invite-problem">{problem}</p>}</div>
      <Button type="submit" block variant="primary" disabled={busy || !draft.name.trim()}>{busy ? 'Working…' : draft.leagueId ? 'Show created league' : draft.requestId ? 'Retry same creation' : 'Create league'}</Button>
    </form>
  </Sheet>;
}
