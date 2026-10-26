// Stage 78, Members: the existing Community commissioner grant, never a private league's host flag.
import { useEffect, useRef, useState } from 'react';
import { cloudApi } from '../../api.js';
import { readNextDraft, removeNextDraft, writeNextDraft } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Sheet } from '../ui/index.js';
import './members.css';

const PENDING = 'community-member-check';
function recover(accountId) {
  try {
    const value = JSON.parse(readNextDraft(accountId, PENDING));
    if (typeof value?.userId === 'string' && typeof value.member === 'boolean') return value;
  } catch { /* Missing or damaged state never starts a write. */ }
  return null;
}

export function CommunityMembers() {
  const app = useAppData(), shell = useShell();
  const [data, setData] = useState(null), [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(() => recover(app.accountId));
  const [busy, setBusy] = useState(true), [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const [kept, setKept] = useState(true);
  const lifetime = useRef(null), request = useRef(false);
  const { setDirty } = shell;
  useEffect(() => {
    setDirty('community-members', busy || !!selected || !!pending);
    return () => setDirty('community-members', false);
  }, [busy, selected, pending, setDirty]);
  function remember(value) {
    setPending(value);
    if (value) setKept(writeNextDraft(app.accountId, PENDING, JSON.stringify(value)));
    else { removeNextDraft(app.accountId, PENDING); setKept(true); }
  }
  async function read(scope, check = null) {
    const [result] = await app.refresh({ only: ['community'] });
    if (lifetime.current !== scope) return null;
    if (!result || result.error || result.status !== 'ready' || !Array.isArray(result.data?.members)) {
      setData(null);
      setProblem('Community access could not be checked. Reconnect and refresh before making a change.');
      return null;
    }
    const fresh = result.data;
    setData(fresh);
    if (!fresh.admin) {
      setSelected(null);
      setProblem('Only the Community commissioner can manage members.');
      return null;
    }
    setProblem('');
    if (check) {
      const member = fresh.members.find(row => row.id === check.userId);
      // A read verifies present access, not which administrator last changed it.
      if (!member) { setProblem('That member is not in the current list. Keep this check pending and refresh again.'); return null; }
      remember(null); setSelected(null);
      setNotice(member.removed === !check.member
        ? `${member.displayName}: Community access ${check.member ? 'restored' : 'removed'} and checked.`
        : 'Current access differs from the requested change. Review the latest list before deciding again.');
    }
    return fresh;
  }
  async function refresh(scope = lifetime.current, check = pending) {
    if (!scope || request.current) return;
    request.current = true; setBusy(true);
    try { await read(scope, check); }
    finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  useEffect(() => {
    const scope = {};
    lifetime.current = scope;
    void refresh(scope, pending);
    return () => { lifetime.current = null; request.current = false; };
    // The menu keys this screen by the authenticated account. Late replies cannot enter a new account/view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const scope = lifetime.current;
    if (!scope || request.current || !selected || pending) return;
    request.current = true; setBusy(true); setProblem(''); setNotice('');
    const change = { userId: selected.id, member: selected.removed };
    try {
      const fresh = await read(scope);
      if (lifetime.current !== scope || !fresh) return;
      const current = fresh.members.find(row => row.id === selected.id);
      if (!current || current.id === app.accountId || current.removed !== selected.removed) {
        setSelected(null); setNotice('Membership changed since your review. Review the current list before deciding again.'); return;
      }
      // Persist before sending: closing/reloading may lose the reply, but must never replay this audit-producing write.
      remember(change);
      try {
        await cloudApi('community/member', change, { save: true });
        if (lifetime.current !== scope) return;
        setNotice('Access change saved. Checking the current list…');
      } catch (failure) {
        if (lifetime.current !== scope) return;
        if (failure.status === 401) app.requestSignIn();
        if (failure.name !== 'SaveUncertainError') {
          remember(null); setSelected(null);
          await read(scope);
          if (lifetime.current === scope) setProblem(failure.message || 'Access could not be changed.');
          return;
        }
        setNotice('The reply was lost. Check current access before deciding again.');
      }
      await read(scope, change);
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  function leave(next) { if (!request.current && shell.confirmLeave()) next(); }
  function review(member) { setSelected(member); setNotice(''); setProblem(''); }
  const allowed = data?.admin === true;
  return <Sheet title={selected && !pending ? `${selected.removed ? 'Restore' : 'Remove'} Community access?` : 'Community members'}
    back={{ label: 'Menu', onBack: () => leave(() => shell.setSheetArgs({ sub: null })) }} onClose={() => leave(shell.closeSheet)} tall>
    <p className="gx-t-body">Removal blocks Community access. Guesses, scores, bets, posts and comments stay recorded and visible under their existing rules. Private-league memberships stay unchanged.</p>
    <div role="alert">{problem && <p className="gx-t-body gx-members-problem">{problem}</p>}</div>
    <p className="gx-t-body" role="status">{notice}</p>
    {busy && <p className="gx-t-meta">Checking Community access…</p>}
    {pending ? <Card className="gx-members-stack">
      <p className="gx-t-strong">An access change needs checking</p>
      <p className="gx-t-body">Check saved access to see the current state. This never repeats the change.</p>
      {!kept && <p className="gx-t-meta">This browser cannot keep the check after you close this screen. Keep it open until access is checked.</p>}
      <Button variant="primary" disabled={busy} onClick={() => refresh()}>Check saved access</Button>
    </Card> : selected ? <Card className="gx-members-stack">
      <h3 className="gx-t-strong gx-members-name">{selected.displayName}</h3>
      <p className="gx-t-body">{selected.removed ? 'Restore this member’s Community access? Their existing records will still be there.' : 'Remove this member’s Community access? You can restore access here later. This does not delete their account or records.'}</p>
      <Button disabled={busy} onClick={() => { setSelected(null); setProblem(''); }}>Cancel</Button>
      <Button variant={selected.removed ? 'primary' : 'danger'} disabled={busy || !allowed} onClick={save}>{selected.removed ? 'Restore access' : 'Remove access'}</Button>
    </Card> : allowed ? <section aria-label="Members" className="gx-members-stack">
      {data.members.map(member => <Card key={member.id} className="gx-members-stack">
        <h3 className="gx-t-strong gx-members-name">{member.displayName}{member.id === app.accountId ? ' · You' : ''}</h3>
        <p className="gx-t-meta">{member.removed ? 'Community access removed · records kept' : 'Community access active'}</p>
        {member.id !== app.accountId && <Button disabled={busy} aria-label={`${member.removed ? 'Restore' : 'Remove'} Community access for ${member.displayName}`} onClick={() => review(member)}>{member.removed ? 'Restore access…' : 'Remove access…'}</Button>}
      </Card>)}
    </section> : null}
    {!pending && <Button disabled={busy} onClick={() => refresh()}>Refresh members</Button>}
  </Sheet>;
}
