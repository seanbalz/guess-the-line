// The name step (redesign build plan stage 11; prototype `page.nameStep`, spec 3.8; inventory row 6): until the
// account has a display name, this is the whole screen, without the frame, as in the old app (persona audit #29). The
// name goes through the same `/profile` route the old app uses (1 to 60 characters; existing names are never cut,
// D-23). Stage 76 restyles it; the logic stays here.
//
// What the member types is kept as a draft in this tab (nextDrafts.js), so a reload, a lost answer or a sign-in that
// ran out never loses it; it goes once the name is saved, or when another account signs in (AuthGate).
import { useEffect, useId, useRef, useState } from 'react';
import { readNextDraft, removeNextDraft, writeNextDraft } from '../../nextDrafts.js';
import { useAppData } from '../data/AppData.jsx';
import { Avatar, Button } from '../ui/index.js';

export const NAME_DRAFT = 'name-step';
export const NAME_MAX = 60;

export const NAME_STEP_COPY = Object.freeze({
  title: 'First, what should we call you?',
  label: 'Your name',
  help: 'Friends see this name. You can change it later.',
  invite: 'Your invite is saved. You can join once your name is saved.',
  continue: 'Continue',
  saving: 'Saving…',
  check: 'Check if it saved',
  empty: 'Add a name first.',
  uncertain: 'We couldn’t confirm your name was saved. Check before you try again. What you typed is still here.',
  stillNotSaved: 'It isn’t saved yet. Try Continue again.',
  signIn: 'Sign in again to save your name. What you typed is still here.',
  offline: 'Your name wasn’t saved. Check your connection and try again.',
  saved: 'Your name is saved.',
  signOut: 'Sign out',
});

export function NameStep({ onSaved, onSignOut }) {
  const app = useAppData();
  const [text, setText] = useState(() => readNextDraft(app.accountId, NAME_DRAFT));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const heading = useRef(null);
  const inputId = useId();
  const helpId = useId();
  const problemId = useId();
  // The one required step: its heading takes focus, so a screen reader hears it first (as the old app does).
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const clean = text.trim();
  function change(event) {
    const value = event.target.value.slice(0, NAME_MAX);
    setText(value);
    writeNextDraft(app.accountId, NAME_DRAFT, value);
    if (problem?.kind === 'empty') setProblem(null);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!clean) { setProblem({ kind: 'empty', message: NAME_STEP_COPY.empty }); return; }
    setBusy(true);
    setProblem(null);
    const result = await app.saveName(clean);
    setBusy(false);
    if (result.ok) {
      removeNextDraft(app.accountId, NAME_DRAFT);
      onSaved?.(NAME_STEP_COPY.saved);
      return;
    }
    const message = {
      uncertain: NAME_STEP_COPY.uncertain,
      signIn: NAME_STEP_COPY.signIn,
      refused: result.message,
    }[result.kind] || NAME_STEP_COPY.offline;
    setProblem({ kind: result.kind, message });
  }
  // A lost answer: read the account again. If the name landed, the app moves on by itself.
  async function check() {
    if (busy) return;
    setBusy(true);
    await app.refresh({ only: ['lobby'] });
    setBusy(false);
    setProblem({ kind: 'uncertain', message: NAME_STEP_COPY.stillNotSaved });
  }

  return (
    <main className="gx-solo" id="main">
      <div className="gx-solo-brand">
        <Avatar id={app.accountId} name={clean} size={80}/>
        <h1 className="gx-t-title" ref={heading} tabIndex={-1}>{NAME_STEP_COPY.title}</h1>
      </div>
      {app.savedInvite ? <p className="gx-t-body gx-c-2">{NAME_STEP_COPY.invite}</p> : null}
      <form className="gx-solo-form" onSubmit={submit} noValidate>
        <label className="gx-field" htmlFor={inputId}>
          <span className="gx-t-label">{NAME_STEP_COPY.label}</span>
          <input
            id={inputId}
            className="gx-input"
            type="text"
            autoComplete="nickname"
            maxLength={NAME_MAX}
            value={text}
            onChange={change}
            aria-describedby={problem ? `${helpId} ${problemId}` : helpId}
            aria-invalid={problem?.kind === 'empty' || problem?.kind === 'refused' ? true : undefined}
          />
        </label>
        <p className="gx-t-meta" id={helpId}>{NAME_STEP_COPY.help}</p>
        <div role="alert" id={problemId}>
          {problem ? <p className="gx-t-body gx-solo-problem">{problem.message}</p> : null}
        </div>
        <Button type="submit" variant="primary" block aria-disabled={busy || undefined}>{busy ? NAME_STEP_COPY.saving : NAME_STEP_COPY.continue}</Button>
        {problem?.kind === 'uncertain' ? <Button variant="secondary" block onClick={check} aria-disabled={busy || undefined}>{NAME_STEP_COPY.check}</Button> : null}
      </form>
      {/* Not this account? Signing out clears what was typed here (AuthGate). */}
      {onSignOut ? <Button variant="ghost-2" className="gx-solo-end" onClick={onSignOut}>{NAME_STEP_COPY.signOut}</Button> : null}
    </main>
  );
}
