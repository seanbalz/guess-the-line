// D-82 Player Props: other players' locked prop guesses, under the existing reveal rules (D-31 as amended by D-39): a
// selection opens to you once you lock in that exact athlete and stat, or at its event's kickoff. Drawn with the approved
// shared-picks row pattern (play/RevealPicks.jsx: "Everyone's guesses", the Open pill, one avatar row per player in a
// flush card). Nothing is drawn before POST /props/shared sends it, and that reply holds locked values and names only:
// never a draft, a saved reference, a quote or a line (supabase/migrations/20261110180000_gtl_player_props_shared.sql).
import { useCallback, useEffect, useRef, useState } from 'react';
import { propsApi } from '../../api.js';
import { Avatar, Button, Card, List, Pill, Row } from '../ui/index.js';
import { propStat } from '../../../../shared/player-props.mjs';
import { propNumber } from './PropReceipt.jsx';
import '../play/moments.css';

export const sharedKey = s => (s ? `${s.eventId}/${s.playerId}/${s.stat}` : '');

/**
 * /props/shared for one week, read again whenever `version` changes (a confirmed lock-in). `{ status, selections, retry }`:
 * status is 'idle' | 'loading' | 'ready' | 'off' | 'error'. A server without the reader (dark, or its migration not
 * applied) answers available:false or 404, which is 'off': nothing is drawn and nothing is said, as before the feature.
 */
export function usePropsShared({ season, week, enabled = true, version = 0, onSignInAgain }) {
  const [state, setState] = useState({ status: 'idle', selections: new Map() });
  const [attempt, setAttempt] = useState(0);
  const auth = useRef(onSignInAgain); auth.current = onSignInAgain;
  useEffect(() => {
    if (!enabled || !Number.isInteger(season) || !Number.isInteger(week)) { setState({ status: 'idle', selections: new Map() }); return undefined; }
    const controller = new AbortController();
    setState(current => ({ ...current, status: current.status === 'ready' ? 'ready' : 'loading' }));
    propsApi('shared', { season, week }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data?.available !== true || data.season !== season || data.week !== week || !Array.isArray(data.selections)) { setState({ status: 'off', selections: new Map() }); return; }
      setState({ status: 'ready', selections: new Map(data.selections.map(s => [sharedKey(s), s])) });
    }).catch(error => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      if (error?.status === 401) auth.current?.();
      setState(current => ({ status: error?.status === 404 ? 'off' : 'error', selections: error?.status === 404 ? new Map() : current.selections }));
    });
    return () => controller.abort();
  }, [enabled, season, week, version, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, retry };
}

/**
 * One prop's opened guesses. `selection` is a /props/shared selection (only an open one is ever sent); `own` your locked
 * guess value or null. Renders nothing for a selection the server did not open.
 */
export function PropReveal({ selection, own = null }) {
  const s = propStat(selection?.stat);
  if (!s || !(selection.ownLocked || selection.started)) return null;
  const rows = selection.rows ?? [];
  const label = `${selection.playerName} ${s.label}`;
  return <section className="gx-play-reveal gx-vstack gx-gap-12" aria-label={`Everyone’s guesses for ${label}`} data-prop-reveal="">
    <div className="gx-play-reveal-head"><h3 className="gx-t-strong gx-grow">Everyone’s guesses</h3><Pill tone="data">Open</Pill></div>
    {!rows.length ? <p className="gx-t-body gx-c-2">No one else has locked in this prop.</p>
      : <Card variant="flush"><List label={`Other players’ ${label} guesses`}>
        {rows.map(row => <Row key={row.userId} start={<Avatar id={row.userId} name={row.name} size={32}/>}
          title={row.name} sub={row.removed ? 'Former member' : 'Locked in'}
          end={<span className="gx-play-reveal-end"><span className="gx-n-s">{propNumber(row.guess)} {s.short}</span></span>}/>)}
      </List></Card>}
    {own !== null && rows.length ? <p className="gx-t-meta gx-c-2">Your guess · {propNumber(own)} {s.short}</p> : null}
  </section>;
}

/** One line when the guesses could not be read: say so and offer the read again (RevealFailure's words). */
export function PropRevealFailure({ onRetry }) {
  return <p className="gx-play-state-line gx-t-body" role="alert">Other players’ guesses could not be loaded. <Button variant="ghost" onClick={onRetry}>Try again</Button></p>;
}
