// The reveal moment (design upgrade, item 3): once the server opens a game's guesses to this player (D-31 as amended
// by D-39: your lock-in, a sit-out or that game's kickoff), the other players' guesses appear on that game's card,
// staggered (fade and rise) the first time this device draws them. "Seen" lives under a gtl. key in localStorage, one
// week at a time. Nothing is drawn before `/community/picks` sends it, and only rows the server left visible.
import { useCallback, useEffect, useRef, useState } from 'react';
import { communityApi } from '../../api.js';
import { pickText } from '../../communityFormat.js';
import { Avatar, Button, Card, List, Pill, Row, Strip } from '../ui/index.js';
import { fmtLate } from '../format.js';
import { landing, markSeen, readSeen, revealRows, revealScope, seenKey, staggerIndex, unseen, writeSeen } from './moments.js';

const storage = () => { try { return window.localStorage; } catch { return null; } };

/**
 * `/community/picks` for one week and market (every game), read again whenever `version` changes (a confirmed lock-in,
 * a game passing kickoff). `{ status: 'idle' | 'loading' | 'ready' | 'error', data, retry }`. A reply for another account,
 * week or market is dropped. A failed read keeps the guesses already drawn and says so once (RevealFailure).
 */
export function useWeekPicks({ enabled, accountId, season, week, mode, version, onSignIn }) {
  const [state, setState] = useState({ status: 'idle', data: null, scope: null });
  const [attempt, setAttempt] = useState(0);
  const scope = `${accountId}:${season}:${week}:${mode}`;
  const signIn = useRef(onSignIn); signIn.current = onSignIn;
  useEffect(() => {
    if (!enabled || !accountId) return undefined;
    const controller = new AbortController();
    setState(previous => ({ status: previous.scope === scope && previous.data ? 'ready' : 'loading', data: previous.scope === scope ? previous.data : null, scope }));
    communityApi('picks', { season, week, mode }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (String(data?.viewer ?? '').toLowerCase() !== accountId.toLowerCase() || data.season !== season || data.week !== week || data.mode !== mode || !Array.isArray(data.games)) throw new Error('Wrong picks reply');
      setState({ status: 'ready', data, scope });
    }).catch(error => {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      if (error?.status === 401) signIn.current?.();
      setState(previous => ({ status: 'error', data: previous.scope === scope ? previous.data : null, scope }));
    });
    return () => controller.abort();
  }, [enabled, accountId, scope, season, week, mode, version, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...(state.scope === scope ? state : { status: enabled ? 'loading' : 'idle', data: null }), retry };
}

/**
 * Which visible rows animate: those this device has not drawn for this game before. Worked out once per row set (so a
 * re-render mid-animation keeps it), then stored; a storage failure only means they animate once more next time.
 */
function useFresh(accountId, scope, keep, ids) {
  const signature = ids.join(',');
  const memo = useRef({ signature: null, fresh: new Set() });
  if (memo.current.signature !== `${scope}|${signature}`) {
    const seen = readSeen(storage(), seenKey(accountId));
    memo.current = { signature: `${scope}|${signature}`, fresh: new Set(unseen(seen, scope, ids)) };
  }
  useEffect(() => {
    if (!ids.length) return;
    const key = seenKey(accountId), store = storage();
    writeSeen(store, key, markSeen(readSeen(store, key), scope, ids, keep));
  }, [accountId, scope, keep, signature]);
  return memo.current.fresh;
}

/**
 * One game's opened guesses. `reveal` is revealRows(); `own` is this player's locked guess `{ id, name, pick }` or null;
 * `line` their saved scoring line for the strip's tick (only once it is theirs to see), else null.
 */
export function RevealPicks({ accountId, season, week, mode, game, reveal, own, line }) {
  const scope = revealScope({ season, week, mode, gameId: game.id });
  const fresh = useFresh(accountId, scope, `${season}-${week}-`, reveal.rows.map(row => row.id));
  const market = mode === 'guess_total' ? 'Total' : 'Spread';
  const text = value => pickText(mode, game.awayCode, game.homeCode, value);
  const strip = landing(reveal.rows, own, line);
  const others = reveal.rows.length;
  const waiting = [reveal.waiting ? `${reveal.waiting} not locked in` : '', reveal.satOut ? `${reveal.satOut} sitting out` : ''].filter(Boolean).join(' · ');
  const moving = others > 0 && fresh.size > 0;
  // The strip comes first, then the rows; each new one waits one stagger step more (staggerIndex caps the steps).
  const enter = (id, i) => (fresh.has(id) ? { className: 'gx-play-reveal-in', style: { '--gx-play-i': staggerIndex(i) } } : {});
  return <section className="gx-play-reveal gx-vstack gx-gap-12" aria-label={`Everyone’s ${market} guesses for ${game.awayCode} at ${game.homeCode}`} data-play="reveal" data-fresh={moving || undefined}>
    <div className="gx-play-reveal-head"><h3 className="gx-t-strong gx-grow">Everyone’s guesses</h3><Pill tone="data">Open</Pill></div>
    {!others ? <p className="gx-t-body gx-c-2">No one else has locked in this game{waiting ? ` · ${waiting}` : ''}.</p> : <>
      {strip ? <div {...(moving ? { className: 'gx-play-reveal-in', style: { '--gx-play-i': 0 } } : {})}>
        <Strip items={strip.items} linePct={strip.linePct} lowLabel={text(strip.low)} highLabel={text(strip.high)}
          label={`${strip.items.length} ${strip.items.length === 1 ? 'guess' : 'guesses'} from ${text(strip.low)} to ${text(strip.high)}${strip.linePct !== null ? `; your saved line is ${text(line)}` : ''}`}/>
      </div> : null}
      <Card variant="flush"><List label={`Other players’ ${market} guesses`}>
        {reveal.rows.map((row, i) => {
          const motion = enter(row.id, i + 1);
          // The guess and its Late marker (D-30) stack at the row's end, so the row fits 320 wide.
          return <Row key={row.id} className={motion.className} style={motion.style} start={<Avatar id={row.id} name={row.name} size={32}/>}
            title={row.name} sub={row.removed ? 'Former member' : 'Locked in'}
            end={<span className="gx-play-reveal-end"><span className="gx-n-s">{text(row.pick)}</span>{row.late ? <Pill tone="pending">{fmtLate(row.late.minutes)}</Pill> : null}</span>}/>;
        })}
      </List></Card>
      {waiting ? <p className="gx-t-meta gx-c-2">{waiting}</p> : null}
    </>}
  </section>;
}

/** One line for the whole screen when the guesses could not be read: say so and offer the read again. */
export function RevealFailure({ onRetry }) {
  return <p className="gx-play-state-line gx-t-body" role="alert">Other players’ guesses could not be loaded. <Button variant="ghost" onClick={onRetry}>Try again</Button></p>;
}
