// Existing /profile workflow, with an explicit save. A stored draft never overwrites the account on mount.
import { useEffect, useId, useRef, useState } from 'react';
import { readNextDraft, removeNextDraft, writeNextDraft } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { profileName } from '../data/account.js';
import { useShell } from '../shell/context.js';
import { Avatar, Button, Card, Sheet } from '../ui/index.js';
import './profile.css';

export const PROFILE_DRAFT = 'profile-name';
const MAX_NAME = 60;
function recovered(accountId, name) {
  try {
    const saved = JSON.parse(readNextDraft(accountId, PROFILE_DRAFT));
    if (saved?.v === 1 && typeof saved.text === 'string' && typeof saved.base === 'string'
      && (saved.pending === null || typeof saved.pending === 'string')) return saved;
  } catch { /* Missing or damaged copies start with the account's actual name. */ }
  return { v: 1, text: name, base: name, pending: null };
}

export function ProfileSettings() {
  const app = useAppData(), shell = useShell();
  const [draft, setDraft] = useState(() => recovered(app.accountId, app.name));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(''), [notice, setNotice] = useState('');
  const [kept, setKept] = useState(true);
  const request = useRef(false), input = useRef(null), lifetime = useRef(null);
  // A cancelled store read can resolve with its old cached lobby. Only this mounted account/view may
  // continue a save or restore a draft after that await; sign-out has already purged those drafts.
  useEffect(() => {
    const scope = { accountId: app.accountId };
    lifetime.current = scope;
    return () => { if (lifetime.current === scope) lifetime.current = null; };
  }, [app.accountId]);
  const fieldId = useId(), helpId = useId(), problemId = useId();
  const clean = draft.text.trim(), dirty = draft.text !== draft.base || !!draft.pending;
  const { setDirty } = shell;
  useEffect(() => { setDirty('profile', dirty); return () => setDirty('profile', false); }, [dirty, setDirty]);

  function keep(next) {
    setDraft(next);
    if (next.text === next.base && !next.pending) { removeNextDraft(app.accountId, PROFILE_DRAFT); setKept(true); }
    else setKept(writeNextDraft(app.accountId, PROFILE_DRAFT, JSON.stringify(next)));
  }
  function saved(name) {
    keep({ v: 1, text: name, base: name, pending: null });
    setDirty('profile', false);
    setProblem('');
    setNotice('Your name is saved.');
  }
  async function freshName(scope) {
    const [read] = await app.refresh({ only: ['lobby'] });
    if (lifetime.current !== scope) return null;
    if (!read || read.error || read.status !== 'ready') {
      setProblem('Your account could not be checked. Your draft is kept; reconnect or sign in, then try again.');
      return null;
    }
    return profileName(read.data);
  }
  async function submit(event) {
    event.preventDefault();
    const scope = lifetime.current;
    if (!scope || request.current || draft.pending) return;
    if (!clean || clean.length > MAX_NAME || /[\x00-\x1f\x7f]/.test(clean)) {
      setProblem('Enter a display name between 1 and 60 characters.');
      input.current?.focus();
      return;
    }
    request.current = true; setBusy('save'); setProblem(''); setNotice('');
    try {
      // Check the account before a deliberate overwrite, including when another device changed it.
      const current = await freshName(scope);
      if (lifetime.current !== scope || current === null) return;
      if (current === clean) { saved(current); return; }
      if (current !== draft.base) {
        keep({ ...draft, base: current });
        setProblem(`Your saved name changed to “${current}”. Your draft is kept. Choose Save name again to replace it.`);
        return;
      }
      // A reload or leaving this sheet during the request must remember to check, never replay it.
      keep({ ...draft, pending: clean });
      const result = await app.saveName(clean);
      if (lifetime.current !== scope) return;
      if (result.ok) { saved(clean); return; }
      if (result.kind === 'uncertain') {
        setProblem('We could not confirm the save. Check if it saved before trying again.');
        return;
      }
      keep({ ...draft, pending: null });
      setProblem(result.kind === 'signIn' ? 'Sign in again to save your name. Your draft is kept.'
        : result.kind === 'refused' ? result.message : 'Your name was not saved. Reconnect and try again.');
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  async function check() {
    const scope = lifetime.current;
    if (!scope || request.current || !draft.pending) return;
    request.current = true; setBusy('check'); setProblem(''); setNotice('');
    try {
      const current = await freshName(scope);
      if (lifetime.current !== scope || current === null) return;
      if (current === draft.pending) { saved(current); return; }
      keep({ ...draft, base: current, pending: null });
      setNotice('That name is not saved. Review your draft, then choose Save name.');
    } finally { if (lifetime.current === scope) { request.current = false; setBusy(false); } }
  }
  function leave(next) { if (!request.current && shell.confirmLeave()) next(); }
  return <Sheet title="Profile" back={{ label: 'Menu', onBack: () => leave(() => shell.setSheetArgs({ sub: null })) }} onClose={() => leave(shell.closeSheet)}>
    <Card className="gx-profile-account"><Avatar id={app.accountId} name={app.name} size={56}/><div>
      <p className="gx-t-strong">{app.name}</p><p className="gx-t-meta">{app.email}</p>
    </div></Card>
    <form className="gx-profile-form" onSubmit={submit} noValidate>
      <label className="gx-field" htmlFor={fieldId}><span className="gx-t-strong">Display name</span>
        <input ref={input} id={fieldId} className="gx-input" autoComplete="nickname" maxLength={MAX_NAME} value={draft.text}
          readOnly={!!busy || !!draft.pending} aria-describedby={`${helpId} ${problemId}`} aria-invalid={problem && (!clean || clean.length > MAX_NAME || /[\x00-\x1f\x7f]/.test(clean)) ? true : undefined}
          onChange={event => { keep({ ...draft, text: event.target.value }); setProblem(''); setNotice(''); }}/>
      </label>
      <p className="gx-t-meta" id={helpId}>Friends see this name across your leagues. Up to 60 characters.</p>
      {dirty && <p className="gx-t-meta">{kept ? 'Unsaved draft kept in this tab. It is cleared when you sign out.' : 'This browser is not keeping the draft. Keep this screen open until you save.'}</p>}
      <div role="alert" id={problemId}>{problem && <p className="gx-t-body gx-profile-problem">{problem}</p>}</div>
      <p className="gx-t-body" role="status">{notice}</p>
      {draft.pending ? <>
        {!problem && <p className="gx-t-body">A save needs checking. Your draft is kept; no request will be sent again automatically.</p>}
        <Button variant="primary" block onClick={check} aria-disabled={!!busy || undefined}>{busy === 'save' ? 'Saving…' : busy ? 'Checking…' : 'Check if it saved'}</Button>
      </> : <Button type="submit" variant="primary" block aria-disabled={!!busy || !dirty || undefined}>{busy ? 'Saving…' : 'Save name'}</Button>}
    </form>
  </Sheet>;
}
