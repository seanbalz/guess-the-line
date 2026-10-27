import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudApi, communityApi } from '../../api.js';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Dialog } from '../ui/index.js';
import { forfeitKey, forfeitView } from './forfeit.js';

function remembered(key) { try { return sessionStorage.getItem(key) === 'pending'; } catch { return false; } }

/** One explicit whole-week confirmation. Lost writes are checked before a player can retry. */
export function ForfeitDialog({ args, open }) {
  const app = useAppData(), personal = useSharedRead('personal'), shell = useShell();
  const key = forfeitKey(args), valid = open && app.accountId === args.accountId
    && personal.data?.season === args.season && personal.data?.week === args.week;
  const context = `${key}:${valid}`;
  const current = useRef(context); current.current = context;
  const alive = useRef(true), running = useRef(false), generation = useRef(0), timer = useRef(null);
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(() => remembered(key));
  const [storageError, setStorageError] = useState(false);
  const appRef = useRef(app); appRef.current = app;
  const active = () => alive.current && current.current === context;
  function remember(value) {
    setUncertain(value);
    try { if (value) sessionStorage.setItem(key, 'pending'); else sessionStorage.removeItem(key); setStorageError(false); } catch { setStorageError(true); }
  }
  const read = useCallback(async () => {
    const epoch = ++generation.current, started = performance.now(); clearTimeout(timer.current);
    setState({ status: 'loading' });
    try {
      const feed = await communityApi('read');
      if (!alive.current || current.current !== context || epoch !== generation.current) return;
      const view = forfeitView(feed, args);
      if (!view) throw new Error('Wrong week or unavailable reader');
      if (view.stored) {
        remember(false);
        await appRef.current.refresh({ only: ['personal', 'community'] });
        if (!alive.current || current.current !== context || epoch !== generation.current) return;
      }
      setState({ status: 'ready', view });
      const remaining = Date.parse(view.closesAt) - Date.parse(view.now) - (performance.now() - started);
      if (view.canConfirm && remaining > 0) timer.current = setTimeout(() => {
        setState({ status: 'expired' });
      }, Math.min(remaining + 1, 2147483647));
      else if (view.canConfirm) setState({ status: 'expired' });
    } catch (error) {
      if (!alive.current || current.current !== context || epoch !== generation.current) return;
      if (error.status === 401) appRef.current.requestSignIn();
      setState({ status: 'error' });
    }
  }, [context]);
  useEffect(() => {
    alive.current = true;
    if (valid) void read();
    return () => { alive.current = false; generation.current += 1; clearTimeout(timer.current); };
  }, [read, valid]);
  useEffect(() => {
    const check = () => { if (!running.current && valid && document.visibilityState === 'visible') void read(); };
    window.addEventListener('focus', check); window.addEventListener('online', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
  }, [read, valid]);
  useEffect(() => { shell.setDirty(key, open && (busy || uncertain)); return () => shell.setDirty(key, false); }, [key, open, busy, uncertain, shell.setDirty]);
  const view = valid && state.status === 'ready' ? state.view : null;
  async function confirm() {
    if (running.current || !valid || !view?.canConfirm) return;
    running.current = true; setBusy(true); remember(true); clearTimeout(timer.current);
    setState({ status: 'saving' });
    try {
      // A save is never automatically retried; the server keeps one immutable forfeit per account/week.
      await cloudApi('community/forfeit', { season: args.season, week: args.week, reason: 'reveal' }, { save: true });
      if (active()) await read();
    } catch (error) {
      if (active()) {
        if (error.status === 401) appRef.current.requestSignIn();
        setState({ status: 'unconfirmed' });
      }
    } finally { running.current = false; if (active()) setBusy(false); }
  }
  const close = () => {
    if (running.current) return;
    // Closing this dialog keeps the underlying game and its unsaved note mounted.
    if (uncertain && !window.confirm('Close while your sit-out is unconfirmed? It may have saved. Reopen See picks now to check before trying again.')) return;
    shell.closeDialog();
  };
  const done = Boolean(view?.stored);
  return <Dialog open={open} title={done ? `Week ${args.week} reveal confirmed` : `See picks now for Week ${args.week}?`}
    text={done ? 'Your locked guesses keep counting. Remaining guesses in the recorded markets are sat out; your drafts are kept.'
      : `This is final for Week ${args.week} · ${args.season}. It sits out every remaining unlocked guess in the markets listed below, not just this game. Locked guesses keep their points and drafts stay saved. You cannot lock more guesses in those markets this week. Sitting out breaks your Pick streak.`} onClose={close}>
    <Button disabled={busy} onClick={close}>{done ? 'Back to Research' : 'Keep playing'}</Button>
    {!valid ? <p className="gx-t-body" role="alert">The account or week changed. Close this dialog and reopen it from the current week.</p>
      : busy ? <p className="gx-t-body" role="status">Confirming saved sit-out…</p>
        : state.status === 'loading' ? <p className="gx-t-body" role="status">Checking this week’s status…</p>
          : !view ? <><p className="gx-t-body" role="alert">{state.status === 'expired' ? 'The last kickoff passed. Check the week’s saved status.' : uncertain ? 'Your sit-out is unconfirmed. Check its saved status before trying again.' : 'This week’s reveal status is unavailable. Nothing was changed by this check.'}</p><Button onClick={read}>Check sit-out status</Button></>
            : <>
              {view.rows.map(row => <p className="gx-t-meta" key={row.mode}>{row.name}: {row.status === 'submitted' ? 'fully locked in; keeps counting' : row.status === 'sat_out' ? 'already sat out' : 'remaining guesses will be sat out'} · {row.lockedIn} of {row.games} locked in</p>)}
              {!done && (view.canConfirm ? <>
                {uncertain ? <p className="gx-t-body" role="status">No saved forfeit was found in the latest check. Review the warning before confirming again.</p> : null}
                <Button variant="primary" onClick={confirm}>Confirm sit-out and reveal</Button>
              </> : <p className="gx-t-body" role="status">A new reveal is not available for this week.</p>)}
            </>}
    {storageError && uncertain ? <p className="gx-t-meta" role="alert">This browser cannot keep a recovery marker. Keep this dialog open and check the saved status.</p> : null}
  </Dialog>;
}
