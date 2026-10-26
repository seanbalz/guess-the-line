// Q17-A: host-only invitations through the existing authorized lobby API.
// Links stay in this mounted account/view only. A lost write reply is checked, never replayed automatically.
import { useEffect, useId, useRef, useState } from 'react';
import { cloudApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { fmtFull } from '../format.js';
import { useShell } from '../shell/context.js';
import { Button, Card, Sheet } from '../ui/index.js';
import './invitations.css';

export function InvitePlayers({ league }) {
  const app = useAppData(), shell = useShell();
  const [email, setEmail] = useState(''), [created, setCreated] = useState(null);
  const [invites, setInvites] = useState(null), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(''), [readProblem, setReadProblem] = useState(''), [notice, setNotice] = useState('');
  const lifetime = useRef(null), request = useRef(false), requestId = useRef(null), link = useRef(null);
  const fieldId = useId(), linkId = useId();
  const { setDirty } = shell;
  useEffect(() => {
    setDirty('invitations', !!email || busy || (!!created && !copied));
    return () => setDirty('invitations', false);
  }, [email, busy, created, copied, setDirty]);

  async function refresh(scope, pending = uncertain) {
    setLoading(true); setReadProblem('');
    try {
      const result = await cloudApi('invites', undefined, { league: league.id, signal: scope.controller.signal });
      if (lifetime.current !== scope) return;
      const rows = Array.isArray(result) ? result : result.invites;
      if (!Array.isArray(rows)) throw new Error('Invalid invitation list');
      setInvites(rows);
      if (pending?.kind === 'create') {
        const found = rows.some(row => row.email.toLowerCase() === pending.email.toLowerCase() && ['pending', 'active'].includes(row.status));
        if (!found) { setUncertain(null); setProblem(''); setNotice('No pending invitation for that email. You can create a link.'); }
      } else if (pending?.kind === 'revoke') {
        const row = rows.find(item => item.id === pending.id);
        if (row?.status === 'revoked') {
          setUncertain(null); setProblem(''); setNotice('Invitation revoked.');
          setCreated(current => current?.inviteId === pending.id ? null : current);
        }
      }
    } catch (failure) {
      if (lifetime.current !== scope) return;
      if (failure.status === 401) app.requestSignIn();
      setReadProblem('Invitations could not be checked. Your new link, if shown, is still available. Try refreshing the list.');
    } finally { if (lifetime.current === scope) setLoading(false); }
  }
  useEffect(() => {
    const scope = { controller: new AbortController() };
    lifetime.current = scope;
    void refresh(scope);
    return () => { lifetime.current = null; scope.controller.abort(); };
    // The parent keys this view by account and league, so old replies cannot enter a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function write(kind, id, event) {
    event?.preventDefault();
    const scope = lifetime.current;
    if (!scope || request.current || loading || (kind === 'create' && (created || uncertain || !email.trim()))) return;
    request.current = true; setBusy(true); setProblem(''); setNotice('');
    const pending = kind === 'create' ? { kind, email: email.trim() } : { kind, id };
    try {
      if (kind === 'create') requestId.current ||= crypto.randomUUID();
      const result = await cloudApi(kind === 'create' ? 'invites' : 'invite/revoke',
        kind === 'create' ? { email: pending.email, requestId: requestId.current } : { inviteId: id },
        { league: league.id, save: true });
      if (lifetime.current !== scope) return;
      setUncertain(null); requestId.current = null;
      if (kind === 'create') { setCreated({ ...result, email: pending.email }); setCopied(false); setEmail(''); setNotice('Invitation created.'); }
      else { setCreated(current => current?.inviteId === id ? null : current); setNotice('Invitation revoked. That link can no longer be accepted.'); }
      await refresh(scope, null);
    } catch (failure) {
      if (lifetime.current !== scope) return;
      if (failure.status === 401) app.requestSignIn();
      if (failure.name === 'SaveUncertainError') {
        setUncertain(pending);
        setProblem(kind === 'create'
          ? 'We could not confirm creation. Check the list below. If the invitation is pending, revoke it before creating a replacement link; existing links cannot be recovered.'
          : 'We could not confirm revocation. Refresh the list to check its status before trying again.');
        await refresh(scope, pending);
      } else { requestId.current = null; setProblem(failure.message || 'The invitation could not be changed.'); await refresh(scope, null); }
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  async function copy() {
    const scope = lifetime.current;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      if (lifetime.current === scope) { setCopied(true); setNotice('Invitation link copied. Share it with the person you invited.'); }
    } catch {
      if (lifetime.current !== scope) return;
      link.current?.focus(); link.current?.select();
      setNotice('Select and copy the invitation link, then share it with the person you invited.');
    }
  }
  function leave(next) { if (!request.current && shell.confirmLeave()) next(); }
  return <Sheet title={`Invite to ${league.name}`} back={{ label: 'Your leagues', onBack: () => leave(() => shell.setSheetArgs({ inviteLeagueId: null })) }} onClose={() => leave(shell.closeSheet)}>
    <p className="gx-t-body">Create a link for one email address. Only that account can join. Email is not sent automatically.</p>
    {!created && <form className="gx-invite-stack" onSubmit={event => write('create', null, event)}>
      <label className="gx-field" htmlFor={fieldId}><span className="gx-t-strong">Their email address</span>
        <input className="gx-input" id={fieldId} type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} readOnly={busy || !!uncertain || !!created}
          onChange={event => { setEmail(event.target.value); requestId.current = null; }}/></label>
      <Button type="submit" variant="primary" block disabled={busy || loading || !!created || !!uncertain || !email.trim()}>{busy ? 'Working…' : 'Create invitation link'}</Button>
    </form>}
    <div role="alert">{problem && <p className="gx-t-body gx-invite-problem">{problem}</p>}</div>
    <p className="gx-t-body" role="status">{notice}</p>
    {created && <Card className="gx-invite-stack" aria-label="New invitation">
      <h3 className="gx-t-strong">Your invitation link is ready</h3>
      <p className="gx-t-body gx-invite-email">For {created.email}</p>
      <p className="gx-t-meta">Save it before closing. Existing links are not shown again.</p>
      <label className="gx-field" htmlFor={linkId}>Invitation link<input ref={link} id={linkId} className="gx-input" value={created.inviteUrl} readOnly onFocus={event => event.target.select()}/></label>
      <Button onClick={copy}>Copy invitation link</Button>
      <p className="gx-t-meta">Expires {fmtFull(created.expiresAt)}</p>
      <Button variant="ghost-2" disabled={busy} onClick={() => { if (shell.confirmLeave()) { setCreated(null); setNotice(''); } }}>Start another invitation</Button>
    </Card>}
    <section className="gx-invite-stack" aria-label="Sent invitations" aria-busy={loading}>
      <h3 className="gx-t-section">Sent invitations</h3>
      {readProblem && <p className="gx-t-body gx-invite-problem" role="alert">{readProblem}</p>}
      {loading && <p className="gx-t-meta">Checking invitations…</p>}
      {!loading && !readProblem && invites?.length === 0 && <p className="gx-t-meta">No invitations created yet.</p>}
      {invites?.map(invite => <Card key={invite.id} className="gx-invite-stack">
        <p className="gx-t-strong gx-invite-email">{invite.email}</p>
        <p className="gx-t-meta">{invite.status} · Expires {fmtFull(invite.expiresAt)}</p>
        {['pending', 'active'].includes(invite.status) && <Button variant="danger" aria-label={`Revoke invitation to ${invite.email}`} disabled={busy} onClick={() => write('revoke', invite.id)}>Revoke invitation</Button>}
      </Card>)}
      <Button disabled={loading || busy} onClick={() => refresh(lifetime.current)}>Refresh invitations</Button>
    </section>
  </Sheet>;
}
