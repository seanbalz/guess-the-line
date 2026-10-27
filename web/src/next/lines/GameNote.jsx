import { useEffect, useId, useRef, useState } from 'react';
import { cloudApi } from '../../api.js';
import { useShell } from '../shell/context.js';
import { Button, Icon, Skeleton } from '../ui/index.js';
import { gameNoteDraftKey, gameNoteFromRead, NOTE_WRITE_MAX, noteFitsWriteLimit, readGameNoteDraft, validNoteReply, writeGameNoteDraft } from './gameNoteDraft.js';
import './gameNote.css';

/** M-09/M-29 are hosted. This writes only the signed-in owner's note, never a Favorite, ballot or feed entry. */
export function GameNote({ accountId, season, week, gameId, requestSignIn, onSaved }) {
  const scope = { accountId, season, week, gameId }, shell = useShell(), label = useId(), help = useId();
  const [draft, setDraft] = useState(() => readGameNoteDraft(scope));
  const currentDraft = useRef(draft), alive = useRef(true), running = useRef(false);
  const [saved, setSaved] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [checked, setChecked] = useState(false), [reviewRequired, setReviewRequired] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const dirtyKey = gameNoteDraftKey(scope);
  const pending = draft?.pending;
  const tooLong = Boolean(draft && !noteFitsWriteLimit(draft.text));
  const conflict = Boolean(saved && draft && saved.revision !== draft.base.revision);
  const dirty = Boolean(draft && (draft.text !== draft.base.note || pending));
  const { setDirty } = shell;
  useEffect(() => { setDirty(dirtyKey, dirty || busy); return () => setDirty(dirtyKey, false); }, [dirtyKey, dirty, busy, setDirty]);
  function keep(next) {
    currentDraft.current = next; setDraft(next);
    setStorageUnavailable(!writeGameNoteDraft(scope, next));
  }
  function accept(row, message = '') {
    setSaved(row); keep({ text: row.note, base: row, pending: null });
    setReviewRequired(false); setChecked(false); setError(''); setNotice(message);
  }
  async function read(signal) {
    const row = gameNoteFromRead(await cloudApi('personal/notes', { season, week }, { signal }), scope);
    if (!alive.current || signal?.aborted) return;
    setSaved(row); setChecked(true); setError('');
    const local = currentDraft.current;
    if (!local) accept(row);
    else if (local.text === row.note) accept(row, local.pending ? 'Your saved note is confirmed.' : 'Your note is up to date.');
    else if (local.pending) setNotice('Saved note checked. Your draft is still here. Retry the same save to confirm its result.');
    else if (row.revision !== local.base.revision) setNotice('The saved note changed. Review both versions before saving.');
    else { setReviewRequired(false); setNotice('Your unsaved draft is restored. Save when you are ready.'); }
  }
  function failed(failure) {
    if (!alive.current) return;
    setError(failure.message || 'The note is unavailable. Try again.');
    if (failure.status === 401 && !failure.uncertain) requestSignIn?.();
    if (failure.status === 403 || failure.status === 404) setSaved(null);
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    read(controller.signal).catch(failure => { if (!controller.signal.aborted) failed(failure); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { alive.current = false; controller.abort(); };
  }, [accountId, season, week, gameId]);
  async function checkSaved() {
    if (running.current) return;
    running.current = true; setLoading(true); setChecked(false); setNotice('');
    try { await read(); } catch (failure) { failed(failure); }
    finally { running.current = false; if (alive.current) setLoading(false); }
  }
  async function save(retry = false) {
    if (running.current || !saved || !draft || loading || !retry && (pending || conflict || reviewRequired || tooLong) || retry && (!pending || !checked)) return;
    const request = retry ? pending : { requestId: crypto.randomUUID(), season, week, gameId, note: draft.text, revision: draft.base.revision };
    running.current = true; setBusy(true); setError(''); setNotice(''); setChecked(false);
    keep({ ...draft, pending: request });
    try {
      const reply = await cloudApi('personal/note', request, { save: true });
      if (!validNoteReply(reply, scope, request)) throw Object.assign(new Error('We could not confirm the saved note. Check the saved note before trying again.'), { uncertain: true });
      if (!alive.current) return;
      // An idempotent receipt confirms the earlier save, not that a later edit is absent. Show a fresh conflict
      // if another device has since changed it; never promote an old receipt to the current note silently.
      const receipt = { note: reply.note, revision: reply.revision };
      let current = saved, refreshFailed = false;
      if (retry) {
        try {
          const latest = gameNoteFromRead(await cloudApi('personal/notes', { season, week }), scope);
          if (latest.revision >= current.revision) current = latest;
        } catch { refreshFailed = true; }
      }
      if (!alive.current) return;
      if (current.revision > receipt.revision && current.note !== receipt.note) {
        setSaved(current); keep({ text: request.note, base: receipt, pending: null });
        setChecked(true); setReviewRequired(true);
        setNotice('Your earlier save is confirmed. A newer saved note is preserved below; review both versions before saving again.');
      } else accept(current.note === receipt.note && current.revision >= receipt.revision ? current : receipt, 'Private note saved.');
      if (refreshFailed) setError('Your earlier save is confirmed, but a fresh note read failed. The last checked version is preserved. Check the saved note before editing again.');
      onSaved?.();
    } catch (failure) {
      if (!alive.current) return;
      if (!failure.uncertain) {
        keep({ ...currentDraft.current, pending: null });
        if (failure.status === 409) setReviewRequired(true);
      }
      failed(failure);
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const canReview = saved && checked && !pending && (conflict || reviewRequired);
  return <section className="gx-game-note" aria-labelledby={label} aria-busy={loading || busy}>
    <header className="gx-game-note-head"><Icon icon="lock" size={20}/><div><h3 id={label} className="gx-t-section">Private game note</h3><p id={help} className="gx-t-meta gx-c-2">Only you see this. Your note stays with this game and week.</p></div></header>
    {/* While the saved note loads: a skeleton field in place of the note (a kept draft shows its own field). */}
    {loading && (draft ? <p className="gx-sr-only" role="status">Loading your saved note…</p> : <Skeleton label="Loading your saved note…" shape="block"/>)}
    {error && <p className="gx-game-note-error gx-t-body" role="alert">{error}</p>}
    {draft && <><label className="gx-game-note-label" htmlFor={`${label}-text`}>Your note</label><textarea id={`${label}-text`} aria-describedby={tooLong ? `${help} ${label}-limit` : help} maxLength={NOTE_WRITE_MAX} rows={5} value={draft.text} disabled={busy || loading || Boolean(pending) || !saved} onChange={event => { keep({ ...draft, text: event.target.value }); setNotice(''); }}/><p className="gx-game-note-count gx-t-meta gx-c-2">{draft.text.length.toLocaleString()} / 2,000 characters</p></>}
    {tooLong && <p id={`${label}-limit`} className="gx-t-body gx-c-2">This note is longer than the current save limit. Its full text is kept. Shorten it or clear it before saving.</p>}
    {notice && <p className="gx-t-body gx-c-2" role="status">{notice}</p>}
    {storageUnavailable && dirty && <p className="gx-t-meta gx-c-2">This browser cannot keep a recovery copy. Keep this page open until your note is saved.</p>}
    {(pending || conflict || reviewRequired) && <div className="gx-game-note-review"><p className="gx-t-body">{pending ? 'Your save is unconfirmed. Check the saved note first; retrying will use the same request.' : 'Your draft is preserved. Check the saved version, then choose which text to keep.'}</p>{saved && checked && <><h4 className="gx-t-strong">Saved note</h4><p className="gx-game-note-saved gx-t-body">{saved.note || 'No saved text.'}</p></>}{canReview && <div className="gx-game-note-actions"><Button onClick={() => accept(saved, 'Showing the saved version.')}>Use saved note</Button><Button onClick={() => { keep({ ...draft, base: saved }); setReviewRequired(false); setNotice('Your draft is ready. Save note to replace the saved version.'); }}>Keep editing my draft</Button></div>}</div>}
    <div className="gx-game-note-actions">
      <Button variant="primary" disabled={!saved || !dirty || loading || busy || Boolean(pending) || conflict || reviewRequired || tooLong} onClick={() => save()}>{busy ? 'Saving…' : 'Save note'}</Button>
      <Button disabled={busy || loading} onClick={checkSaved}>{pending || error || conflict || reviewRequired ? 'Check saved note' : 'Refresh note'}</Button>
      {pending && <Button disabled={!checked || busy || loading} onClick={() => save(true)}>Retry same save</Button>}
    </div>
  </section>;
}
