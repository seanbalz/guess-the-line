// Bets › Virtual › Your picks (redesign stages 43 and 44): the account-level placing screen. Sean, October 28, 2026:
// it replaces the old private-league Your picks for everyone, Community included. It reads POST /bets/read for the
// published week (the league showing only filters whose faces appear) and places through POST /bets/place (M-11).
// place.js decides what shows; this file draws it and keeps the slip.
import { useEffect, useMemo, useRef, useState } from 'react';
import { betsApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Dock } from '../shell/Frame.jsx';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { AvatarStack, Button, Card, Chip, ChipRail, GateBanner, IconButton, LockLine, Matchup, Meter, Pill, Sheet, Tag } from '../ui/index.js';
import { fmtNum, fmtU, fmtWhen } from '../format.js';
import { PLACE_COPY, UNIT_CHIPS, placeBoard, placeRequest, slipEntries, slipKey, stepUnits, weekCard } from './place.js';
import './place.css';

export function PlaceBets({ onDirty }) {
  const app = useAppData(), shell = useShell();
  const leagueId = app.league?.community === false && !app.league.pending ? app.league.id : null;
  const key = `${app.accountId}:place:${leagueId ?? 'community'}`;
  const read = useLeagueRead(key, signal => betsApi('read', leagueId ? { leagueId } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  const board = useMemo(() => read.data ? placeBoard(read.data, app.accountId) : null, [read.data, app.accountId]);
  const [slip, setSlip] = useState({}), [review, setReview] = useState(false), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null), [uncertain, setUncertain] = useState(false);
  const request = useRef(null);
  const entries = board ? slipEntries(board, slip) : [];
  // A slip, a save in flight or an unconfirmed save keeps the leave guard on.
  useEffect(() => { onDirty?.(entries.length > 0 || busy || uncertain); }, [entries.length, busy, uncertain, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  // Any change to the slip is a new request; a retry of the same slip after an unconfirmed save reuses its id.
  const change = next => { if (uncertain) return; request.current = null; setFailure(null); setSlip(next); };

  function toggle(game, market, side) {
    const k = slipKey(game.id, market.market);
    if (slip[k]?.side === side.side) { const { [k]: _, ...rest } = slip; change(rest); return; }
    change({ ...slip, [k]: { gameId: game.id, market: market.market, side: side.side, units: slip[k]?.units ?? market.mine?.selection.units ?? 1 } });
  }
  const setUnits = (k, units) => change({ ...slip, [k]: { ...slip[k], units } });
  const remove = k => { const { [k]: _, ...rest } = slip; change(rest); if (Object.keys(rest).length === 0) setReview(false); };

  async function place() {
    if (busy || !entries.length) return;
    request.current ??= crypto.randomUUID();
    setBusy(true); setFailure(null);
    try {
      const reply = await betsApi('place', placeRequest(board, entries, request.current));
      const count = reply?.placed?.bets?.length ?? entries.length;
      request.current = null; setUncertain(false); setSlip({}); setReview(false);
      shell.toast(`${count} ${count === 1 ? 'bet' : 'bets'} saved`, { tone: 'done' });
      read.retry();
    } catch (error) {
      if (error?.uncertain) { setUncertain(true); setFailure(error.message); return; }
      request.current = null; setUncertain(false);
      if (error?.status === 401) app.requestSignIn();
      setFailure(error?.status === 404 ? PLACE_COPY.notOpen : error?.status === 409 && /changed/i.test(error.message || '') ? PLACE_COPY.changed : error?.message || 'Your bets could not be saved. Try again.');
      if (error?.status === 409) read.retry();
    } finally { setBusy(false); }
  }

  if (read.loading && !board) return <p className="gx-t-body" role="status">Loading this week’s games and prices…</p>;
  if (read.error && !board) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  if (!board.published) return <p className="gx-t-body" role="status">{PLACE_COPY.unpublished}</p>;
  const units = entries.reduce((sum, entry) => sum + entry.units, 0);
  return <div className="gx-place gx-vstack gx-gap-16" data-bets="place">
    <p className="gx-t-meta gx-c-2">Week {board.week} · Virtual Units · {PLACE_COPY.empty}</p>
    <WeekCard week={weekCard(read.data, app.accountId)}/>
    {board.closed ? <GateBanner gate={{ locked: true, sentence: PLACE_COPY.banner, ctaLabel: 'Lock in a guess' }} onCta={() => shell.go('play', { section: 'picks' })}/> : null}
    {board.games.map(game => <PlaceGame key={game.id} game={game} slip={slip} disabled={busy || uncertain} onToggle={toggle}/>)}
    <Button variant="ghost" onClick={read.retry} disabled={busy}>Refresh prices</Button>
    {entries.length ? <Dock><div className="gx-dock-bar gx-place-dock">
      <span className="gx-grow gx-vstack"><span className="gx-t-strong">Slip · {entries.length} {entries.length === 1 ? 'bet' : 'bets'}</span><span className="gx-t-meta gx-c-2">{fmtU(units)} risked</span></span>
      <Button variant="primary" onClick={() => setReview(true)}>Review slip</Button>
    </div></Dock> : null}
    {review && entries.length ? <Sheet title="Your slip" onClose={() => { if (!busy) setReview(false); }} tall
      footer={<div className="gx-vstack gx-gap-8">
        {failure ? <p className="gx-t-body gx-c-loss" role="alert">{failure}</p> : null}
        <Button variant="primary" block onClick={place} disabled={busy}>{busy ? 'Saving…' : uncertain ? 'Retry the same save' : `Place ${entries.length} ${entries.length === 1 ? 'bet' : 'bets'} · ${fmtU(units)}`}</Button>
      </div>}>
      <ul className="gx-place-slip gx-vstack gx-gap-16">
        {entries.map(entry => <SlipRow key={entry.key} entry={entry} disabled={busy || uncertain} onUnits={value => setUnits(entry.key, value)} onRemove={() => remove(entry.key)}/>)}
      </ul>
      <p className="gx-t-meta gx-c-2">Virtual Units are play money. Each bet saves the price shown; if a book’s price changes first, you will be asked to review it.</p>
    </Sheet> : null}
  </div>;
}

/** Stage 45: OPEN · IN PLAY · TO WIN, then RECORD · UNITS · RETURN, and the 3 bets or 3U qualification meter. */
export function WeekCard({ week }) {
  const stat = (label, value) => <div className="gx-place-stat"><span className="gx-t-meta gx-c-2">{label}</span><span className="gx-n-s">{value}</span></div>;
  return <Card as="section" className="gx-place-week gx-vstack gx-gap-12" aria-labelledby="gx-place-week" data-bets="week">
    <h2 id="gx-place-week" className="gx-t-section">Your week</h2>
    <div className="gx-place-stats">{stat('Open', week.open)}{stat('In play', week.inPlay)}{stat('To win', week.toWin)}</div>
    <div className="gx-place-stats">{stat('Record', week.record)}{stat('Units', week.units)}{stat('Return', week.ret)}</div>
    <div className="gx-hstack gx-gap-8 gx-place-meter"><Meter value={week.meter.value} max={3} label={week.meter.text}/><span className="gx-t-meta gx-c-2 gx-grow">{week.meter.text}</span></div>
  </Card>;
}

export function PlaceGame({ game, slip, disabled, onToggle }) {
  return <Card as="section" className="gx-place-game gx-vstack gx-gap-12" aria-labelledby={`gx-place-${game.id}`} data-game={game.id}>
    <header className="gx-place-game-head">
      <span className="gx-grow gx-vstack gx-gap-4">
        <h3 id={`gx-place-${game.id}`} className="gx-t-strong"><Matchup away={game.awayCode} home={game.homeCode} size={32}/></h3>
        <span className="gx-t-meta gx-c-2">{game.started ? PLACE_COPY.started : fmtWhen(game.kickoff)}</span>
      </span>
      {game.faces.length ? <AvatarStack people={game.faces.map(face => ({ id: face.id, name: face.display, you: face.you }))} label={`${game.faces.map(face => face.name).join(', ')} bet this game`}/> : null}
    </header>
    {game.markets.map(market => <div key={market.market} className="gx-place-market gx-vstack gx-gap-8" data-market={market.market}>
      <div className="gx-hstack gx-gap-8">
        <span className="gx-t-label gx-grow">{market.name}</span>
        {market.mine ? <Tag k="Your bet">{market.mine.text} · {market.mine.units}</Tag> : null}
      </div>
      {market.mine?.moved && !game.started ? <Pill tone="pending">{PLACE_COPY.priceMoved}</Pill> : null}
      {market.locked ? <LockLine as="p" className="gx-t-meta">{market.locked}</LockLine>
        : game.started ? null
          : <ChipRail label={`${game.awayCode} at ${game.homeCode} ${market.name.toLowerCase()} prices`} className="gx-place-sides">
            {market.sides.map(side => <Chip key={side.side} text tall selected={slip[slipKey(game.id, market.market)]?.side === side.side}
              disabled={disabled || !side.offer}
              label={side.offer ? `${side.text}, ${side.offer.source}` : `${side.label}, ${PLACE_COPY.noOffer}`}
              onClick={() => side.offer && onToggle(game, market, side)}>
              <span className="gx-vstack"><span>{side.offer ? side.text : side.label}</span><span className="gx-t-meta gx-c-2">{side.offer ? side.offer.source : PLACE_COPY.noOffer}</span></span>
            </Chip>)}
          </ChipRail>}
    </div>)}
  </Card>;
}

export function SlipRow({ entry, disabled, onUnits, onRemove }) {
  const { game, market, side, units, edit } = entry;
  return <li className="gx-place-slip-row gx-vstack gx-gap-8" data-slip={entry.key}>
    <div className="gx-hstack gx-gap-8">
      <span className="gx-grow gx-vstack gx-gap-2">
        <span className="gx-t-strong"><Matchup away={game.awayCode} home={game.homeCode} size={24}/></span>
        <span className="gx-t-body">{market.name} · {side.text}</span>
        <span className="gx-t-meta gx-c-2">{side.offer.source}{edit ? ' · replaces your saved bet' : ''}</span>
      </span>
      <IconButton icon="close" label={`Remove ${market.name} ${side.text} from your slip`} onClick={onRemove} disabled={disabled}/>
    </div>
    <ChipRail label={`Units for ${market.name} ${side.text}`} className="gx-place-units">
      {UNIT_CHIPS.map(value => <Chip key={value} selected={units === value} disabled={disabled} label={`${fmtNum(value)} units`} onClick={() => onUnits(value)}>{fmtU(value)}</Chip>)}
    </ChipRail>
    <div className="gx-hstack gx-gap-8 gx-place-stepper">
      <IconButton icon="minus" label="Half a unit less" onClick={() => onUnits(stepUnits(units, -1))} disabled={disabled || units <= 0.5}/>
      <span className="gx-n-xs" aria-live="polite">{fmtU(units)}</span>
      <IconButton icon="plus" label="Half a unit more" onClick={() => onUnits(stepUnits(units, 1))} disabled={disabled}/>
    </div>
  </li>;
}
