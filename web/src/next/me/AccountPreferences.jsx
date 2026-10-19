import { useEffect, useRef, useState } from 'react';
import { meApi } from '../../api.js';
import { readNextDraft, writeNextDraft, removeNextDraft } from '../../nextDrafts.js';
import { preferenceValue, SPORTSBOOK_NAMES } from '../../../../shared/account-preferences.mjs';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { Button, Card, Sheet } from '../ui/index.js';
import '../play/comparison.css';
const DRAFT = 'account-preferences';
const same = (a,b) => JSON.stringify(preferenceValue(a)) === JSON.stringify(preferenceValue(b));
export function useAccountPreferences(app) {
  return useLeagueRead(`${app.accountId}:preferences`, signal => meApi('preferences', {}, signal), error => { if (error.status === 401) app.requestSignIn?.(); });
}
export function AccountPreferences() {
  const app = useAppData(), shell = useShell(), read = useAccountPreferences(app);
  const initial = useRef(null);
  if (!initial.current && read.data) initial.current=read.data;
  const leave = action => { if (shell.confirmLeave()) action(); };
  return <Sheet title="Settings" back={{ label: 'Menu', onBack: () => leave(() => shell.setSheetArgs({ sub: null })) }} onClose={() => leave(shell.closeSheet)}>
    {initial.current ? <PreferencesEditor key={app.accountId} accountId={app.accountId} initial={initial.current} setDirty={shell.setDirty}/> : read.loading ? <p className="gx-t-body" role="status">Loading settings…</p> : read.error ? <LeagueFailure error={read.error} onRetry={read.retry}/> : <PreferencesEditor key={app.accountId} accountId={app.accountId} initial={read.data} setDirty={shell.setDirty}/>}
  </Sheet>;
}
function recover(accountId, initial) {
  try {
    const saved = JSON.parse(readNextDraft(accountId,DRAFT));
    if (saved?.ownerId === accountId && Array.isArray(saved.sportsbooks) && saved.sportsbooks.every(book => Object.hasOwn(SPORTSBOOK_NAMES,book)) && typeof saved.guidanceCollapsed === 'boolean') return preferenceValue(saved);
  } catch { /* Keep the actual account values when there is no valid draft. */ }
  return preferenceValue(initial);
}
export function PreferencesEditor({ accountId, initial, setDirty }) {
  const [base,setBase] = useState(initial), [draft,setDraft] = useState(() => recover(accountId,initial));
  const [busy,setBusy] = useState(false), [problem,setProblem] = useState(''), [notice,setNotice] = useState('');
  const live = useRef(true), pending = useRef(false), [uncertain,setUncertain] = useState(false);
  const dirty = !same(draft,base) || uncertain;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setDirty('preferences',dirty); return () => setDirty('preferences',false); }, [dirty,setDirty]);
  function change(next) {
    setDraft(next); setNotice('');
    writeNextDraft(accountId,DRAFT,JSON.stringify({ ownerId: accountId,...next }));
  }
  async function check() {
    const fresh = await meApi('preferences');
    if (!live.current) return null;
    setBase(fresh); setUncertain(false);
    return fresh;
  }
  async function save() {
    if (pending.current || !dirty) return;
    pending.current=true; setBusy(true); setNotice(''); setProblem('');
    try {
      // Fresh read detects another device's write without discarding the edited draft.
      const fresh = await check();
      if (!fresh) return;
      if (same(draft,fresh)) { removeNextDraft(accountId,DRAFT); setNotice('Settings saved.'); return; }
      if (fresh.revision !== base.revision) { setProblem('Saved settings changed. Your draft is kept. Review it, then Save settings again to use this draft.'); return; }
      setUncertain(true);
      await meApi('preferences/save', { revision: fresh.revision,...preferenceValue(draft) });
      if (!live.current) return;
      const confirmed = await check();
      if (!confirmed) return;
      if (same(draft,confirmed)) { removeNextDraft(accountId,DRAFT); setNotice('Settings saved.'); }
      else setProblem('The current saved settings differ from your draft. Review before saving again.');
    } catch (error) {
      if (live.current) setProblem(`${error.status ? error.message : 'We could not confirm the save.'} Your draft is kept. Try again to check the saved settings first.`);
    } finally { if (live.current) { pending.current=false; setBusy(false); } }
  }
  const books = [...new Set([...base.supportedBooks,...draft.sportsbooks])];
  return <div className="gx-vstack gx-gap-16">
    <Card className="gx-vstack gx-gap-8"><h2 className="gx-t-section">Your sportsbooks</h2><p className="gx-t-body gx-c-2">Choose books you use. When validated recommendations are available, offers will use the best fresh line and price among these books.</p><p className="gx-t-meta">Only books present in collected source data are selectable. Availability of an individual offer still needs a fresh quote.</p></Card>
    <fieldset className="gx-compare-members" disabled={busy}><legend className="gx-t-strong">Sportsbooks</legend>{books.map(book => <label className="gx-t-body" key={book}><input type="checkbox" checked={draft.sportsbooks.includes(book)} onChange={e => change({ ...draft,sportsbooks: e.target.checked ? [...draft.sportsbooks,book] : draft.sportsbooks.filter(b => b !== book) })}/>{SPORTSBOOK_NAMES[book]}{!base.supportedBooks.includes(book) ? ' · currently unavailable' : ''}</label>)}</fieldset>
    {!books.length && <p className="gx-t-body">No supported books are available from collected data yet.</p>}
    <fieldset className="gx-compare-members" disabled={busy}><legend className="gx-t-strong">Home guidance</legend><label className="gx-t-body"><input type="checkbox" checked={!draft.guidanceCollapsed} onChange={e => change({ ...draft,guidanceCollapsed: !e.target.checked })}/>Show the getting started guide</label></fieldset>
    <p className="gx-t-meta gx-c-2">Saved to your account. Unsaved changes stay in this tab and are cleared on sign-out.</p>
    {problem && <p className="gx-t-body" role="alert">{problem}</p>}<p className="gx-t-body" role="status">{notice}</p>
    <Button variant="primary" aria-disabled={busy || !dirty || undefined} onClick={save}>{busy ? 'Checking and saving…' : uncertain ? 'Check saved settings' : 'Save settings'}</Button>
  </div>;
}
