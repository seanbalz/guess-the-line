import { useEffect, useRef, useState } from 'react';
import { useSportGuard } from '../../sportNavigation.js';
import { cloudApi, communityApi } from '../../api.js';
import { pickText, shortName } from '../../communityFormat.js';
import { communityDraftScope, readCommunityDraft, COMMUNITY_DRAFT_PREFIX } from '../../communityDraft.js';
import { readSoloDraft, soloDraftScope } from '../../soloDraft.js';
import { weekOpenAt } from '../../../../shared/nfl-schedule.mjs';
import { Button, Card, Dialog, Icon, Pill, Segmented, TeamMark, cx, teamCode } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { GuessPicker, GUESS_HELP } from './GuessPicker.jsx';
import { ScoreReceipt } from './ScoreReceipt.jsx';
import { WeekProgress, STATE_ICONS } from './WeekProgress.jsx';
import { RevealFailure, RevealPicks, useWeekPicks } from './RevealPicks.jsx';
import { confirmedLockIns, revealRows, weekProgress } from './moments.js';
import { SCORE_MARKETS, lockConfirmed, lockedAt, mergeDraft, number, perGameReady, savedPicks } from './scoring.js';
import './scores.css';
import './moments.css';

const keyOf = (accountId, data, mode) => `${COMMUNITY_DRAFT_PREFIX}per-game.${encodeURIComponent(accountId)}.${data.season}.${data.week}.${mode}`;
function readDraft(key, data, mode) {
  try {
    const item = JSON.parse(sessionStorage.getItem(key));
    if (!item || typeof item.picks !== 'object' || typeof item.base !== 'object' || Object.values(item.picks).some(value => value !== '' && number(value) === null)) return null;
    const pending = item.pending;
    if (pending && (pending.season !== data.season || pending.week !== data.week || pending.mode !== mode || typeof pending.requestId !== 'string' || !pending.picks)) return null;
    return item;
  } catch { return null; }
}
const matchesSave = (data, request) => request.lockIn?.length ? lockConfirmed(data, request)
  : data.season === request.season && data.week === request.week && Object.entries(request.picks).every(([id, value]) => data.ballots?.[request.mode]?.picks?.[id] === value);

/** Each card's state word (unchanged from before the design upgrade) and its pill tone. */
const CARD_STATE = Object.freeze({ locked: ['Locked in', 'accent'], kicked: ['Closed at kickoff', 'neutral'], skipped: ['Skipped', 'neutral'], notopen: ['Not open', 'neutral'], draft: ['Draft', 'pending'], open: ['To pick', 'neutral'] });
const vibrate = () => { try { globalThis.navigator?.vibrate?.(20); } catch { /* Haptics are optional. */ } };

/**
 * Shared by both apps once the server reports M-07. No speculative local success and no silent write retry.
 * `reveal` (the new app only: `{ members }`) turns on the reveal moment, which reads `/community/picks` for this week
 * and market; the old app's Community Picks page passes none and reads nothing more than before.
 */
export function PerGameEditor({ accountId, initialData, mode = 'guess_spread', focusGame, optOuts = [], reveal, onMode, onScore, onSaved, onSignInAgain, setDirty }) {
  const key = keyOf(accountId, initialData, mode);
  const focusedGame = useRef(null), section = useRef(null);
  // Move once per destination, never on timer ticks or saves; all other games/drafts stay mounted.
  useEffect(() => {
    focusedGame.current?.focus({ preventScroll: true });
    focusedGame.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [focusGame, key]);
  const [data, setData] = useState(initialData), [draft, setDraft] = useState(() => readDraft(key, initialData, mode));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(null), [confirmSitOut, setConfirmSitOut] = useState(false), [checked, setChecked] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false), [elapsed, setElapsed] = useState(0);
  // The lock-in moment: the games a fresh read just confirmed as locked (the stamp plays on their cards once).
  const [moment, setMoment] = useState(null);
  const draftRef = useRef(draft), running = useRef(false), alive = useRef(true);
  const [olderDrafts] = useState(() => [
    ['Previous Picks draft', readCommunityDraft(communityDraftScope({ accountId, season: initialData.season, week: initialData.week, mode }), initialData.games)],
    ['Previous Solo draft', readSoloDraft(soloDraftScope({ accountId, season: initialData.season, week: initialData.week, mode }), initialData.games)],
  ].filter(([, copy]) => copy));
  const pending = draft?.pending, ballot = data.ballots?.[mode], picks = mergeDraft(data, mode, draft), base = savedPicks({ ...data, mode });
  const sitOutPending = draft?.sitOutPending === true, uncertain = Boolean(pending || sitOutPending);
  // The legacy Community surface has no Shell registry; its drafts still guard sport navigation.
  const now = Date.parse(data.now) + elapsed, openAt = Date.parse(weekOpenAt(data.deadline));
  const dirty = (data.games || []).some(game => now < Date.parse(game.kickoff) && String(picks[game.id]) !== String(base[game.id]));
  useSportGuard(!setDirty && (dirty || uncertain));
  const receiptSitOut = data.scoring?.[mode]?.satOut;
  const satOut = typeof receiptSitOut === 'boolean' ? receiptSitOut : (data.optOuts || optOuts).includes(mode), active = perGameReady(data.rules), market = mode === 'guess_total' ? 'Total' : 'Spread';
  const canSitOut = active && !satOut && Number.isFinite(now) && now >= openAt && data.games.some(game => !lockedAt(ballot, game.id) && now < Date.parse(game.kickoff));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const start = performance.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(performance.now() - start), 1000);
    return () => clearInterval(timer);
  }, [data.now]);
  useEffect(() => { setData(initialData); }, [initialData]);
  useEffect(() => { setDirty?.(key, !satOut && dirty || uncertain || busy); return () => setDirty?.(key, false); }, [key, dirty, satOut, uncertain, busy, setDirty]);
  function keep(next) {
    draftRef.current = next; setDraft(next);
    try { if (next) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key); setStorageFailed(false); } catch { setStorageFailed(true); }
  }
  function accept(latest, request, message) {
    if (!alive.current) return;
    setData(latest); setChecked(true); setError('');
    const current = draftRef.current;
    if (current?.sitOutPending && latest.scoring?.[mode]?.satOut === true) {
      keep({ ...current, picks: mergeDraft(latest, mode, current), base: savedPicks({ ...latest, mode }), sitOutPending: false });
      setNotice(`Sat out the remaining ${market} games. Your locked guesses still count and your drafts are kept.`); onSaved?.(); return true;
    }
    if (request && matchesSave(latest, request)) {
      const fresh = savedPicks({ ...latest, mode });
      const retained = mergeDraft(latest, mode, current);
      const remains = Object.keys(fresh).some(id => String(fresh[id]) !== String(retained[id]));
      // The moment plays only here, after a fresh read shows the lock with the requested value (never on the request).
      const locks = confirmedLockIns(latest, request);
      const game = latest.games?.find(row => row.id === locks[0]);
      keep(remains ? { picks: retained, base: fresh, pending: null } : null);
      setNotice(locks.length && game ? `Locked in · ${game.awayCode} at ${game.homeCode} · ${pickText(mode, game.awayCode, game.homeCode, number(latest.ballots?.[mode]?.picks?.[game.id]))}. Your saved receipt is below.`
        : request.lockIn?.length ? 'Locked in. Your saved receipt is below.' : 'Draft saved.');
      if (locks.length) { setMoment({ ids: locks, at: Date.now() }); vibrate(); }
      onSaved?.(); return true; }
    if (request?.lockIn?.some(id => lockedAt(latest.ballots?.[mode], id))) {
      // A second device locked a different value. Show its final value, keep unrelated unsaved guesses.
      keep({ picks: mergeDraft(latest, mode, current), base: savedPicks({ ...latest, mode }), pending: null });
      setNotice('A guess was locked on another device. Its saved value is shown; your other drafts are kept.');
      return false;
    }
    if (current) keep({ ...current, picks: mergeDraft(latest, mode, current), base: savedPicks({ ...latest, mode }) });
    setNotice(message || 'Saved picks checked. Your unsaved guesses are kept.');
    return false;
  }
  async function read() {
    const latest = await cloudApi('personal/read', { season: data.season, week: data.week });
    if (latest.season !== data.season || latest.week !== data.week) throw new Error('The requested week could not be confirmed. Your draft is kept.');
    return latest;
  }
  async function check() {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setChecked(false);
    try { accept(await read(), draftRef.current?.pending); }
    catch (failure) { setError(failure.status ? failure.message : 'No connection. Your draft is kept; reconnect and check saved picks.'); if (failure.status === 401) onSignInAgain?.(); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function save(gameId, retry = false) {
    if (running.current || !active || sitOutPending || !retry && pending || retry && (!pending || !checked)) return;
    if (!retry && gameId && (!Number.isFinite(now) || !(now < Date.parse(data.games.find(game => game.id === gameId)?.kickoff)) || lockedAt(ballot, gameId))) {
      setConfirm(null); setError('This game has closed or was already locked. Your entered guess is kept; check saved picks for its current status.'); return;
    }
    const request = retry ? pending : { season: data.season, week: data.week, mode, revision: data.revision, weeklyRevision: data.weeklyRevision,
      picks: Object.fromEntries(data.games.map(game => [game.id, now >= Date.parse(game.kickoff) ? base[game.id] : picks[game.id]]).filter(([, value]) => number(value) !== null)), submit: false,
      ...(gameId ? { lockIn: [gameId] } : {}), requestId: crypto.randomUUID() };
    running.current = true; setBusy(true); setChecked(false); setConfirm(null); setError(''); setNotice('');
    keep({ picks, base, pending: request });
    try {
      await cloudApi('personal/ballot', request, { save: true });
      const confirmed = accept(await read(), request);
      if (!confirmed) setError('The save has not been confirmed. Check saved picks before retrying the same request.');
    } catch (failure) {
      if (!alive.current) return;
      if ([400, 403, 409, 422].includes(failure.status) || failure.code === 'GTL_BALLOT_LOCKED') {
        keep({ picks, base, pending: null });
        try { accept(await read(), request, 'Saved picks checked. Your entered guesses are kept.'); setError(failure.message || 'The save was refused. Review the saved picks before continuing.'); } catch { setError('Saved picks changed, but could not be loaded. Your draft is kept. Check saved picks before continuing.'); }
      } else {
        setError(failure.status === 401 ? 'Sign in again, then check saved picks. Your draft is kept.' : 'Your save is unconfirmed. Your draft is kept. Check saved picks before retrying.');
        if (failure.status === 401) onSignInAgain?.();
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  async function sitOut() {
    if (running.current || pending || !canSitOut || sitOutPending && !checked) return;
    running.current = true; setBusy(true); setChecked(false); setConfirmSitOut(false); setError(''); setNotice('');
    keep({ picks, base, pending: null, sitOutPending: true });
    try {
      await communityApi('sit-out', { season: data.season, week: data.week, mode });
      if (!accept(await read())) setError('Your sit-out is unconfirmed. Check saved picks before retrying. Your guesses are kept.');
    } catch (failure) {
      if (!alive.current) return;
      if ([400, 403, 409, 422].includes(failure.status)) {
        try { if (accept(await read())) return; } catch { /* Retain the entered guesses below. */ }
        keep({ picks, base, pending: null, sitOutPending: false }); setError(failure.message || 'Sit-out was refused. Your guesses are kept.');
      } else {
        setError('Your sit-out is unconfirmed. Check saved picks before retrying. Your guesses are kept.');
        if (failure.status === 401) onSignInAgain?.();
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  // Week progress (the strip at the top) and the reveal: the read runs again after a confirmed lock-in, a sit-out or a
  // kickoff passing, and not at all before one of them, since nothing can be open to this player before then.
  const progress = weekProgress({ games: data.games, ballot, picks, now, openAt, satOut });
  const kicked = data.games.filter(game => !(now < Date.parse(game.kickoff))).length;
  const mayOpen = progress.locked > 0 || kicked > 0 || satOut;
  const picksRead = useWeekPicks({ enabled: Boolean(reveal) && active && mayOpen, accountId, season: data.season, week: data.week, mode, version: `${progress.locked}:${kicked}:${satOut}`, onSignIn: onSignInAgain });
  function goTo(gameId) {
    const card = [...(section.current?.querySelectorAll('[data-game]') ?? [])].find(node => node.dataset.game === gameId);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const selected = data.games.find(game => game.id === confirm);
  return <section ref={section} className="gx-per-game gx-vstack gx-gap-16" aria-label={`Week ${data.week} picks`}>
    <p className="gx-t-body gx-c-2">Week {data.week} · {data.season}. Lock one game at a time. Spread and Total are separate; a locked guess cannot change.</p>
    <Segmented label="Market" options={SCORE_MARKETS} value={mode} onChange={value => { if (!busy && !uncertain) onMode?.(value); }}/>
    <WeekProgress progress={progress} market={market} week={data.week} onNext={goTo}/>
    <details className="gx-score-detail"><summary className="gx-t-strong">How to make a {market} guess</summary><p className="gx-t-body">{GUESS_HELP[mode]}</p></details>
    {!active && <p role="alert" className="gx-t-body">The scoring rules changed. Refresh before making another pick.</p>}
    {satOut && <p role="status" className="gx-t-body">Sat out · your locked guesses keep counting. Remaining games cannot be locked.</p>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    {/* Always mounted, so a new notice is announced ("Locked in · …"); empty, it takes no room. */}
    <p className={notice ? 'gx-t-body' : 'gx-sr-only'} role="status" data-play="notice">{notice}</p>
    {reveal && picksRead.status === 'error' && <RevealFailure onRetry={picksRead.retry}/>}
    {storageFailed && dirty && <p className="gx-t-meta gx-c-2">This browser cannot keep a recovery copy. Keep this page open until saved.</p>}
    {draft && dirty && !uncertain && !satOut && <p className="gx-t-meta gx-c-2">Unsaved guesses are kept in this browser tab. Save draft to use them on another device.</p>}
    <div className="gx-score-navigation"><Button disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Check saved picks'}</Button><Button disabled={busy || !dirty || uncertain || !active || satOut} onClick={() => save()}>Save draft</Button></div>
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Check saved picks first. If the save is still unconfirmed, retry uses the same request and cannot count twice.</p><Button disabled={!checked || busy} onClick={() => save(null, true)}>Retry same save</Button></Card>}
    {sitOutPending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Check saved picks first to confirm whether you sat out. Your entered guesses and locked scores are kept.</p><Button disabled={!checked || busy || !canSitOut} onClick={sitOut}>Retry sit-out</Button></Card>}
    {olderDrafts.map(([label, copy]) => <details className="gx-score-detail" key={label}><summary className="gx-t-strong">{label} retained</summary><p className="gx-t-body gx-c-2">These entered numbers are not confirmation of a save. Locked games keep the server’s final value.</p><ul className="gx-vstack gx-gap-8">{data.games.filter(game => copy.draft[game.id] !== '').map(game => <li className="gx-t-body" key={game.id}>{game.awayCode} at {game.homeCode}: {pickText(mode, game.awayCode, game.homeCode, Number(copy.draft[game.id]))}</li>)}</ul><Button disabled={busy || uncertain || !active} onClick={() => {
      const previous = { picks: Object.fromEntries(Object.entries(copy.draft).map(([id, value]) => [id, value === '' ? '' : Number(value)])), base: copy.base };
      keep({ picks: mergeDraft(data, mode, previous), base, pending: null }); setNotice('Unlocked draft guesses restored. Review and save them when ready.');
    }}>Use unlocked drafts</Button></details>)}
    {data.games.map((game, index) => {
      const lock = lockedAt(ballot, game.id), value = picks[game.id], closed = !Number.isFinite(now) || !(now < Date.parse(game.kickoff)), notOpen = Number.isFinite(openAt) && now < openAt;
      const unavailable = Boolean(lock || busy || uncertain || satOut || closed || notOpen || !active);
      const receipt = data.scoring?.[mode]?.games?.find(row => row.gameId === game.id);
      const state = progress.games[index].state, [word, tone] = CARD_STATE[state], stamping = moment?.ids.includes(game.id) === true;
      const opened = reveal && picksRead.data ? revealRows(picksRead.data, accountId, reveal.members, game.id) : null;
      return <Card as="article" key={game.id} className={cx('gx-vstack gx-gap-16 gx-play-game', stamping && 'gx-play-stamp')} aria-label={`${game.awayCode} at ${game.homeCode} ${market}`} data-game={game.id} data-state={state} ref={game.id === focusGame ? focusedGame : undefined} tabIndex={-1}>
        <header className="gx-vstack gx-gap-8">
          <div className="gx-play-card-meta"><p className="gx-t-meta gx-c-2">{fmtFull(game.kickoff)}</p><Pill tone={tone} className={cx('gx-play-card-pill', stamping && 'gx-play-stamp-pill')}><Icon icon={STATE_ICONS[state]} size={12}/>{word}</Pill></div>
          <h2 className="gx-score-matchup gx-t-strong"><TeamMark code={game.awayCode} size={32} decorative/><span>{game.awayCode} at {game.homeCode}</span><TeamMark code={game.homeCode} size={32} decorative/></h2>
        </header>
        {lock ? <ScoreReceipt game={game} mode={mode} row={receipt} guess={number(ballot.picks?.[game.id])} lockedAt={lock} onScore={onScore ? () => onScore({ season: data.season, week: data.week, market: mode, scoreGame: game.id }) : undefined}/>
          : <><div className="gx-play-entry"><GuessPicker mode={mode} value={value} away={shortName(game.awayCode)} home={shortName(game.homeCode)} teamLabels={{ away: teamCode(game.awayCode), home: teamCode(game.homeCode) }} disabled={unavailable} label={`${game.awayCode} at ${game.homeCode} ${market} guess`} onChange={value => { keep({ picks: { ...picks, [game.id]: value }, base, pending: null }); setNotice(''); }}/></div>
            {!closed && !satOut && !notOpen && <Button disabled={unavailable || number(value) === null} onClick={() => setConfirm(game.id)}>Lock in {market}</Button>}
            {closed && number(value) !== null && <p className="gx-t-meta gx-c-2">Your draft is preserved. It was not locked in and does not score.</p>}
          </>}
        {opened?.open ? <RevealPicks accountId={accountId} season={data.season} week={data.week} mode={mode} game={game} reveal={opened}
          own={lock ? { id: accountId, name: 'You', pick: number(ballot.picks?.[game.id]) } : null} line={lock ? number(receipt?.reference?.value) : null}/> : null}
      </Card>;
    })}
    {canSitOut && !uncertain && <Button variant="ghost" disabled={busy} onClick={() => setConfirmSitOut(true)}>Sit out remaining {market} games</Button>}
    <Dialog open={Boolean(selected)} title={`Lock in ${market}?`} text={selected ? `${selected.awayCode} at ${selected.homeCode}: ${pickText(mode, selected.awayCode, selected.homeCode, picks[selected.id])}. This guess is final. ${now >= Date.parse(data.deadline) ? 'This pick will be marked Late. ' : ''}Only this game’s ${market} line and picks open. The other market stays separate.` : ''} onClose={() => { if (!busy) setConfirm(null); }}><Button onClick={() => setConfirm(null)}>Keep editing</Button><Button variant="primary" disabled={busy} onClick={() => save(confirm)}>Confirm lock-in</Button></Dialog>
    <Dialog open={confirmSitOut} title={`Sit out Week ${data.week} ${market}?`} text={`This is final for the remaining ${market} games this week. Your locked guesses keep their points and your drafts stay visible. You cannot lock more ${market} guesses this week. Other players’ ${market} picks become available in the feed. ${mode === 'guess_spread' ? 'Total' : 'Spread'} is not affected.`} onClose={() => { if (!busy) setConfirmSitOut(false); }}><Button onClick={() => setConfirmSitOut(false)}>Keep playing</Button><Button variant="primary" disabled={busy || !canSitOut} onClick={sitOut}>Confirm sit-out</Button></Dialog>
  </section>;
}
