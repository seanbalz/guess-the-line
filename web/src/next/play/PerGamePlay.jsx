import { useContext, useEffect, useRef, useState } from 'react';
import { useSportGuard } from '../../sportNavigation.js';
import { cloudApi, communityApi } from '../../api.js';
import { pickText, shortName } from '../../communityFormat.js';
import { communityDraftScope, readCommunityDraft, COMMUNITY_DRAFT_PREFIX } from '../../communityDraft.js';
import { readSoloDraft, soloDraftScope } from '../../soloDraft.js';
import { DRAFT_PREFIX, draftHasChanges, readDraft as readGroupDraft } from '../../predictionDraft.js';
import { weekOpenAt } from '../../../../shared/nfl-schedule.mjs';
import { Button, Card, Dialog, Icon, InfoButton, Matchup, Nest, Pill, Segmented, cx, teamCode } from '../ui/index.js';
import { lightHaptic } from '../ui/haptics.js';
import { motionReduced } from '../ui/motion.js';
import { ShellContext } from '../shell/context.js';
import { TeamMatchup } from '../teams/TeamMatchup.jsx';
import { fmtFull } from '../format.js';
import { GuessPicker, GUESS_HELP } from './GuessPicker.jsx';
import { ScoreReceipt } from './ScoreReceipt.jsx';
import { WeekProgress, STATE_ICONS } from './WeekProgress.jsx';
import { WeekTiles, nextAfter } from './PicksNest.jsx';
import { RevealFailure, RevealPicks, useWeekPicks } from './RevealPicks.jsx';
import { confirmedLockIns, revealRows, weekLockedId, weekProgress } from './moments.js';
import { usePopped } from '../moments/MomentsProvider.jsx';
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
const vibrate = () => lightHaptic(undefined, motionReduced());

/**
 * Shared by both apps once the server reports M-07. No speculative local success and no silent write retry.
 * `reveal` (the new app only: `{ members }`) turns on the reveal moment, which reads `/community/picks` for this week
 * and market; the old app's Community Picks page passes none and reads nothing more than before.
 */
/** The old group screens' tab copy (predictionDraft.js, same account, week and market), only when it changed a guess. */
function groupDraft(accountId, data, mode) {
  if (!accountId || !Array.isArray(data.games)) return null;
  const copy = readGroupDraft(`${DRAFT_PREFIX}${encodeURIComponent(accountId)}.${data.season}.${data.week}.${mode}`, data.games);
  return draftHasChanges(copy) ? copy : null;
}
/** A line that pops once (D-69 Whole week locked) when it was on screen as the moment played; elsewhere just its words. */
function LockedLine({ id, children, ...rest }) {
  const pop = usePopped(id);
  return <p {...rest} data-moment={pop ? 'pop' : undefined}>{children}</p>;
}

export function PerGameEditor({ accountId, initialData, mode = 'guess_spread', focusGame, nest, optOuts = [], reveal, onMode, onScore, onSaved, onSignInAgain, setDirty }) {
  const key = keyOf(accountId, initialData, mode);
  const focusedGame = useRef(null), section = useRef(null);
  // Move once per destination, never on timer ticks or saves; all other games/drafts stay mounted.
  useEffect(() => {
    focusedGame.current?.focus({ preventScroll: true });
    focusedGame.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [focusGame, key]);
  // D-70: a game address that mounts the editor (a deep link, a reload) lands on that game card's heading; later
  // layer changes move focus inside Nest.
  const openedOnMount = useRef(nest?.game && initialData.games?.some(game => game.id === nest.game));
  useEffect(() => { if (openedOnMount.current) section.current?.querySelector('.gx-nest-title')?.focus({ preventScroll: true }); }, [key]);
  const [data, setData] = useState(initialData), [draft, setDraft] = useState(() => readDraft(key, initialData, mode));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(null), [confirmSitOut, setConfirmSitOut] = useState(false), [checked, setChecked] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false), [elapsed, setElapsed] = useState(0);
  // The lock-in moment: the games a fresh read just confirmed as locked (the stamp plays on their cards once).
  const [moment, setMoment] = useState(null);
  // D-70: opening another card ends the moment, so reopening a locked game never stamps it again.
  useEffect(() => { setMoment(null); }, [nest?.game]);
  const draftRef = useRef(draft), running = useRef(false), alive = useRef(true);
  const [olderDrafts] = useState(() => [
    ['Previous Picks draft', readCommunityDraft(communityDraftScope({ accountId, season: initialData.season, week: initialData.week, mode }), initialData.games)],
    ['Previous Solo draft', readSoloDraft(soloDraftScope({ accountId, season: initialData.season, week: initialData.week, mode }), initialData.games)],
    // RETIRE-01 (D-65): the removed group game screens kept unsaved guesses in this tab for 24 hours; offer an edited copy here.
    ['Previous group game draft', groupDraft(accountId, initialData, mode)],
  ].filter(([, copy]) => copy));
  const pending = draft?.pending, ballot = data.ballots?.[mode], picks = mergeDraft(data, mode, draft), base = savedPicks({ ...data, mode });
  const sitOutPending = draft?.sitOutPending === true, uncertain = Boolean(pending || sitOutPending);
  // Rules that are not per-game send no score receipts, so no locked guess there waits for a line.
  const waitingAnswers = !perGameReady(data.rules) ? 0 : data.games.filter(game => {
    const row=data.scoring?.[mode]?.games?.find(item=>item.gameId===game.id);
    return lockedAt(ballot,game.id)&&row?.eligible!==false&&number(row?.points)===null&&number(row?.reference?.value)===null;
  }).length;
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
  // D-70: moving between this week and one of its games keeps the editor and its drafts on screen (`nest.keeps`).
  const keeps = nest?.keeps;
  // Read-only rules (not per-game) keep no unsaved work to guard: nothing on these cards can be saved.
  useEffect(() => { setDirty?.(key, active && !satOut && dirty || uncertain || busy, keeps); return () => setDirty?.(key, false); }, [key, active, dirty, satOut, uncertain, busy, setDirty, keeps]);
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
  const lockedId = weekLockedId(data.season, data.week, mode);
  const kicked = data.games.filter(game => !(now < Date.parse(game.kickoff))).length;
  const mayOpen = progress.locked > 0 || kicked > 0 || satOut;
  const picksRead = useWeekPicks({ enabled: Boolean(reveal) && active && mayOpen, accountId, season: data.season, week: data.week, mode, version: `${progress.locked}:${kicked}:${satOut}`, onSignIn: onSignInAgain });
  function goTo(gameId) {
    const card = [...(section.current?.querySelectorAll('[data-game]') ?? [])].find(node => node.dataset.game === gameId);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const selected = data.games.find(game => game.id === confirm);
  // D-62: in the new app each card leads with the matchup as marks with this weekend's records, each team opening its
  // sheet; the old app's Community Picks page (no Shell) draws the same marks without records or team buttons.
  const inShell = useContext(ShellContext) !== null;
  const weekNotOpen = Number.isFinite(openAt) && now < openAt;
  const lockable = game => !lockedAt(ballot, game.id) && Number.isFinite(now) && now < Date.parse(game.kickoff) && !satOut && !weekNotOpen;
  const status = <>
    {/* D-69 step 1: rules that are not per-game show these cards read-only; the old whole-market editor is retired. */}
    {!active && <p role="status" className="gx-t-body" data-play="read-only">View only for now. Your saved guesses are shown and kept.</p>}
    {satOut && <p role="status" className="gx-t-body">Sat out · your locked guesses keep counting. Remaining games cannot be locked.</p>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    {/* Always mounted, so a new notice is announced ("Locked in · …"); empty, it takes no room. */}
    <p className={notice ? 'gx-t-body' : 'gx-sr-only'} role="status" data-play="notice">{notice}</p>
    {reveal && picksRead.status === 'error' && <RevealFailure onRetry={picksRead.retry}/>}
    {storageFailed && dirty && <p className="gx-t-meta gx-c-2">This browser cannot keep a recovery copy. Keep this page open until saved.</p>}
    {draft && dirty && active && !uncertain && !satOut && <p className="gx-t-meta gx-c-2">Unsaved guesses stay in this tab. Save draft to use another device.</p>}
  </>;
  // Monday answers: it says "Check below", so it sits right above the check button (on the week card, D-70).
  const waitingLine = waitingAnswers>0&&<p className="gx-t-body gx-c-2" role="status">{waitingAnswers} locked {waitingAnswers===1?'guess is':'guesses are'} waiting for a sportsbook line. Monday guesses show answers as soon as the first qualifying line arrives. Check below to refresh.</p>;
  const checkAndSave = <>
    <div className="gx-score-navigation"><Button disabled={busy} onClick={check}>{busy ? 'Checking…' : waitingAnswers>0&&!uncertain ? 'Check for answers' : 'Check saved picks'}</Button>{active ? <Button disabled={busy || !dirty || uncertain || satOut} onClick={() => save()}>Save draft</Button> : null}</div>
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Check saved picks first. If the save is still unconfirmed, retry uses the same request and cannot count twice.</p><Button disabled={!checked || busy} onClick={() => save(null, true)}>Retry same save</Button></Card>}
    {sitOutPending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Check saved picks first to confirm whether you sat out. Your entered guesses and locked scores are kept.</p><Button disabled={!checked || busy || !canSitOut} onClick={sitOut}>Retry sit-out</Button></Card>}
  </>;
  const olderDraftTools = <>
    {olderDrafts.map(([label, copy]) => <details className="gx-score-detail" key={label}><summary className="gx-t-strong">{label} retained</summary><p className="gx-t-body gx-c-2">These entered numbers are not confirmation of a save. Locked games keep the server’s final value.</p><ul className="gx-vstack gx-gap-8">{data.games.filter(game => copy.draft[game.id] !== '').map(game => <li className="gx-t-body" key={game.id}>{game.awayCode} at {game.homeCode}: {pickText(mode, game.awayCode, game.homeCode, Number(copy.draft[game.id]))}</li>)}</ul><Button disabled={busy || uncertain || !active} onClick={() => {
      const previous = { picks: Object.fromEntries(Object.entries(copy.draft).map(([id, value]) => [id, value === '' ? '' : Number(value)])), base: copy.base };
      keep({ picks: mergeDraft(data, mode, previous), base, pending: null }); setNotice('Unlocked draft guesses restored. Review and save them when ready.');
    }}>Use unlocked drafts</Button></details>)}
  </>;
  const sitOutButton = canSitOut && !uncertain ? <Button variant="ghost" disabled={busy} onClick={() => setConfirmSitOut(true)}>Sit out remaining {market} games</Button> : null;
  /** One game's card: the stacked list's card, or (`nested`, D-70) the body of that game's nesting card. */
  function gameCard(game, nested = false) {
    const index = data.games.indexOf(game);
    const lock = lockedAt(ballot, game.id), value = picks[game.id], closed = !Number.isFinite(now) || !(now < Date.parse(game.kickoff)), notOpen = weekNotOpen;
    const unavailable = Boolean(lock || busy || uncertain || satOut || closed || notOpen || !active);
    // Whole-market rules send no score receipt; the owner's saved line on a submitted ballot stands in (D-16, as before).
    const receipt = data.scoring?.[mode]?.games?.find(row => row.gameId === game.id) ?? (!active && ballot?.scoringReferences?.[game.id] ? { reference: ballot.scoringReferences[game.id] } : undefined);
    const state = progress.games[index].state, [word, tone] = CARD_STATE[state], stamping = moment?.ids.includes(game.id) === true;
    const opened = reveal && picksRead.data ? revealRows(picksRead.data, accountId, reveal.members, game.id) : null;
    const focused = !nested && game.id === focusGame;
    const Frame = nested ? 'article' : Card, frame = nested ? {} : { as: 'article', tabIndex: -1 };
    return <Frame {...frame} key={game.id} className={cx('gx-vstack gx-gap-16 gx-play-game', nested && 'gx-play-game--nested', stamping && 'gx-play-stamp')} aria-label={`${game.awayCode} at ${game.homeCode} ${market}`} data-game={game.id} data-state={state} data-route-focus={focused ? '' : undefined} ref={focused ? focusedGame : undefined}>
      <header className="gx-vstack gx-gap-8">
        <div className="gx-play-card-meta"><p className="gx-t-meta gx-c-2">{fmtFull(game.kickoff)}</p><Pill tone={tone} className={cx('gx-play-card-pill', stamping && 'gx-play-stamp-pill')}><Icon icon={STATE_ICONS[state]} size={12}/>{word}</Pill></div>
        {/* Nested, the nesting card's title is the heading; the marks below it still open each team. */}
        {inShell ? <TeamMatchup as={nested ? null : 'h2'} headingClassName="gx-score-matchup" away={game.awayCode} home={game.homeCode} season={data.season}/>
          : <h2 className="gx-score-matchup"><Matchup away={game.awayCode} home={game.homeCode} size={48} layout="stack"/></h2>}
      </header>
      {lock ? <ScoreReceipt game={game} mode={mode} row={receipt} guess={number(ballot.picks?.[game.id])} lockedAt={lock} onScore={onScore ? () => onScore({ season: data.season, week: data.week, market: mode, scoreGame: game.id }) : undefined}/>
        : !active ? <p className="gx-t-body" data-play="saved-guess">{number(value) === null ? 'No guess yet' : `${String(value) === String(base[game.id]) ? 'Your guess' : 'Unsaved guess'} · ${pickText(mode, game.awayCode, game.homeCode, number(value))}`}</p>
        : <><div className="gx-play-entry"><GuessPicker mode={mode} value={value} away={shortName(game.awayCode)} home={shortName(game.homeCode)} teamLabels={{ away: teamCode(game.awayCode), home: teamCode(game.homeCode) }} disabled={unavailable} label={`${game.awayCode} at ${game.homeCode} ${market} guess`} onChange={value => { keep({ picks: { ...picks, [game.id]: value }, base, pending: null }); setNotice(''); }}/></div>
          {!closed && !satOut && !notOpen && <Button variant={nested ? 'primary' : 'secondary'} haptic={false} disabled={unavailable || number(value) === null} onClick={() => setConfirm(game.id)}>Lock in {market}</Button>}
          {closed && number(value) !== null && <p className="gx-t-meta gx-c-2">Your draft is preserved. It was not locked in and does not score.</p>}
        </>}
      {opened?.open ? <RevealPicks accountId={accountId} season={data.season} week={data.week} mode={mode} game={game} reveal={opened}
        own={lock ? { id: accountId, name: 'You', pick: number(ballot.picks?.[game.id]) } : null} line={lock ? number(receipt?.reference?.value) : null}/> : null}
    </Frame>;
  }
  const dialogs = <>
    {/* A lock-in buzzes only once a fresh read confirms it (vibrate above), so its button skips the kit's press tick. */}
    <Dialog open={Boolean(selected)} title={`Lock in ${market}?`} text={selected ? `${selected.awayCode} at ${selected.homeCode}: ${pickText(mode, selected.awayCode, selected.homeCode, picks[selected.id])}. This guess is final. ${now >= Date.parse(data.deadline) ? 'This pick will be marked Late. ' : ''}Only this game’s ${market} line and picks open. The other market stays separate.` : ''} onClose={() => { if (!busy) setConfirm(null); }}><Button onClick={() => setConfirm(null)}>Keep editing</Button><Button variant="primary" haptic={false} disabled={busy} onClick={() => save(confirm)}>Confirm lock-in</Button></Dialog>
    <Dialog open={confirmSitOut} title={`Sit out Week ${data.week} ${market}?`} text={`This is final for the remaining ${market} games this week. Your locked guesses keep their points and your drafts stay visible. You cannot lock more ${market} guesses this week. Other players’ ${market} picks become available in the feed. ${mode === 'guess_spread' ? 'Total' : 'Spread'} is not affected.`} onClose={() => { if (!busy) setConfirmSitOut(false); }}><Button onClick={() => setConfirmSitOut(false)}>Keep playing</Button><Button variant="primary" disabled={busy || !canSitOut} onClick={sitOut}>Confirm sit-out</Button></Dialog>
  </>;
  const marketControl = <Segmented label="Market" options={SCORE_MARKETS} value={mode} onChange={value => { if (!busy && !uncertain) onMode?.(value); }}/>;

  if (nest) {
    // D-70: the week is one nesting card of game tiles; a game's address (`nest.game`) opens that game's card instead.
    const open = data.games.find(game => game.id === nest.game) ?? null;
    const guessOf = id => lockedAt(ballot, id) ? number(ballot.picks?.[id]) : picks[id];
    const after = open ? nextAfter(progress, open.id) : null;
    return <section ref={section} className="gx-per-game gx-per-game--nest gx-vstack gx-gap-16" aria-label={`Week ${data.week} picks`}>
      {status}
      {/* An unconfirmed save or sit-out: the check and the retry sit above either card, where the alert is. */}
      {uncertain ? checkAndSave : null}
      {open ? <Nest label="Your guesses" layer={`game:${open.id}`} title={`${open.awayCode} @ ${open.homeCode}`}
        lips={[{ key: 'week', label: `Week ${data.week} · ${market}`, onOpen: nest.onWeek }]}
        info={<InfoButton title={`How to make a ${market} guess`} body={[GUESS_HELP[mode]]}/>}>
        {gameCard(open, true)}
        {/* Next opens the next game still to lock in this card's place; it is the primary button once Lock in is gone. */}
        {after && active ? <Button variant={lockable(open) ? 'ghost' : 'primary'} iconEnd="chevronRight" className="gx-play-next" onClick={() => nest.onOpen(after.id)}>Next to lock · <Matchup away={after.game.awayCode} home={after.game.homeCode}/></Button>
          : active ? <LockedLine id={lockedId} className="gx-t-meta gx-c-2">{progress.locked === progress.total ? 'Every game is locked in.' : 'Nothing left to lock this week.'}</LockedLine> : null}
      </Nest>
        : <Nest label="Your guesses" layer="week" title={`Week ${data.week}`}
          info={<InfoButton title="About Your guesses" body={[`Week ${data.week} · ${data.season}. Lock one game at a time. Spread and Total are separate; a locked guess cannot change.`, GUESS_HELP[mode]]}/>}>
          <LockedLine id={lockedId} className="gx-t-meta" data-play="count">{progress.summary}</LockedLine>
          {marketControl}
          <WeekProgress progress={progress} market={market} week={data.week} onNext={active ? nest.onOpen : undefined} nested/>
          <WeekTiles progress={progress} mode={mode} guessOf={guessOf} onOpen={nest.onOpen} label={`Week ${data.week} ${market} games`}/>
          {waitingLine}
          {uncertain ? null : checkAndSave}
          {olderDraftTools}
          {sitOutButton}
        </Nest>}
      {dialogs}
    </section>;
  }
  return <section ref={section} className="gx-per-game gx-vstack gx-gap-16" aria-label={`Week ${data.week} picks`}>
    <p className="gx-t-body gx-c-2">Week {data.week} · {data.season}. Lock one game at a time. Spread and Total are separate; a locked guess cannot change.</p>
    {marketControl}
    <WeekProgress progress={progress} market={market} week={data.week} onNext={goTo}/>
    <details className="gx-score-detail"><summary className="gx-t-strong">How to make a {market} guess</summary><p className="gx-t-body">{GUESS_HELP[mode]}</p></details>
    {status}
    {waitingLine}
    {checkAndSave}
    {olderDraftTools}
    {data.games.map(game => gameCard(game))}
    {sitOutButton}
    {dialogs}
  </section>;
}
