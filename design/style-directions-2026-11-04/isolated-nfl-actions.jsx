import {previewStepUnits} from './preview-unit-amounts.mjs';
// Native presentation excerpts with injected example state. No API, auth, timers or persistence controllers.
// Generated/rechecked by .local/prepare-nfl-actions.py; see NFL_ACTIONS_NAVIGATION_REVIEW.md.
import React,{createContext,useContext} from 'react';
export const ActionPreviewContext=createContext(null);
function PreviewAnnotation(){const note=useContext(ActionPreviewContext);return <div className="real-action-annotation" onCancel={event=>event.stopPropagation()} onClose={event=>event.stopPropagation()}>{note?.disclaimer}{note?.feedback}</div>;}
function Sheet({children,...props}){return <NativeSheet {...props}>{children}<PreviewAnnotation/></NativeSheet>;}
function Dialog({children,...props}){return <NativeDialog {...props}>{children}<PreviewAnnotation/></NativeDialog>;}

import {Avatar,AvatarStack,Button,Card,Chip,ChipRail,DESTINATION_ICONS as ICON,Dialog as NativeDialog,Icon,IconButton,InfoButton,LinkRow,List,LockLine,Matchup,Meter,Pill,Row,Segmented,Sheet as NativeSheet,Skeleton,Tag,cx} from '../../web/src/next/ui/index.js';
import {fmtLate,fmtNum,fmtU,fmtWhen} from '../../web/src/next/format.js';
import {INFO} from '../../web/src/next/info.js';
import {MARKET,gameName,guessText,reactionOf} from '../../web/src/next/feed/feedModel.js';
import {PLACE_COPY,UNIT_CHIPS,slipKey,stepUnits} from '../../web/src/next/bets/place.js';
import {marketTime} from '../../web/src/next/lines/marketDetails.js';
import {codes} from '../../web/src/next/feed/feedModel.js';

import {TABS} from '../../web/src/next/shell/state.js';
export const REMINDER_COPY = Object.freeze({
  title: 'Pick reminders',
  // The switch's meta line, one per state. "Due", not "lock" (D-39); the push never names a pick, a line or a score.
  off: 'One push 2 hours before picks are due: Spread, Total and Points. It never shows a pick or a line.',
  on: 'On for this device. One push 2 hours before picks are due.',
  checking: 'Checking this device…',
  turningOn: 'Turning on…',
  turningOff: 'Turning off…',
  blocked: 'Blocked for this site. Allow notifications in your browser or phone settings, then reload.',
  unsupported: 'This browser can’t show reminders.',
  install: 'On iPhone, add the app to your Home Screen first: Share › Add to Home Screen, then open it there.',
  device: 'This device only. Turn it on on each phone or browser you use.',
  doneOn: 'Reminders are on for this device.',
  doneOff: 'Reminders are off for this device.',
  failed: 'Reminders could not be changed. Try again.',
  promptTitle: 'Get a nudge before picks are due',
  promptBody: 'One push 2 hours before your Points players and Spread and Total picks are due. It never shows a pick or a line.',
  promptOn: 'Turn on reminders',
  promptLater: 'Not now',
});
export const TAB_INFO = Object.freeze({
  home: { label: 'Home', job: 'What’s due this week and the one next thing to do.' },
  play: { label: 'Play', job: 'Make your Guess the Line picks and see how close you were.' },
  bets: { label: 'Bets', job: 'Bet Virtual Units on games or against a friend, and track your bets.' },
  research: { label: 'Research', job: 'Explore games, lines, Fantasy football and trends.' },
});

export const SHELL_COPY = Object.freeze({
  home: 'Guess The Line, home',
  menu: 'Your menu',
  tabs: 'Main',
  comingNext: 'Coming next',
  sameData: 'Your picks, bets and posts are kept.',
  offline: 'You’re offline. What’s here may be out of date.',
  stillOffline: 'Can’t refresh yet.',
  retry: 'Retry',
  tabFailed: 'This tab couldn’t load.',
  pageFailed: 'This page couldn’t load.',
  layerFailed: 'That couldn’t open.',
  failHelp: 'Try again, or reload the app. Your picks and bets are safe.',
  tryAgain: 'Try again',
  signOutFailed: 'We could not sign you out. Please try again.',
  // The league the pill names when the frame is given none (a test harness); the app passes the league showing.
  defaultLeague: 'Community',
});

export const leagueLabel = name => `League: ${name}. Switch league`;

export function tabBadge(tab, data, slots = {}) {
  const label = TAB_INFO[tab]?.label ?? tab;
  const name = TAB_INFO[tab]?.name ?? label;
  let badge = null;
  try { badge = typeof slots[tab]?.counter === 'function' ? slots[tab].counter(data) : null; } catch { badge = null; }
  const count = Number.isInteger(badge?.count) && badge.count > 0 ? badge.count : 0;
  const dot = !count && badge?.dot === true;
  const words = (count || dot) && typeof badge.label === 'string' && badge.label.trim() ? badge.label.trim() : '';
  return { label, name: words ? `${name}, ${words}` : name, count, dot };
}

export function IsolatedForfeit({args,open,valid,state,busy,uncertain,storageError,view,close,read,confirm}) {
  const done = Boolean(view?.stored);
  return <Dialog open={open} title={done ? `Week ${args.week} reveal confirmed` : `See picks now for Week ${args.week}?`}
    text={done ? 'Your locked guesses keep counting. Remaining guesses in the recorded markets are sat out; your drafts are kept.'
      : `This is final for Week ${args.week} · ${args.season}. It sits out every remaining unlocked guess in the markets listed below, not just this game. Locked guesses keep their points and drafts stay saved. You cannot lock more guesses in those markets this week. Sitting out breaks your Pick streak.`} onClose={close}>
    <Button haptic={false} disabled={busy} onClick={close}>{done ? 'Back to Research' : 'Keep playing'}</Button>
    {!valid ? <p className="gx-t-body" role="alert">The account or week changed. Close this dialog and reopen it from the current week.</p>
      : busy ? <p className="gx-t-body" role="status">Confirming saved sit-out…</p>
        : state.status === 'loading' ? <p className="gx-t-body" role="status">Checking this week’s status…</p>
          : !view ? <><p className="gx-t-body" role="alert">{state.status === 'expired' ? 'The last kickoff passed. Check the week’s saved status.' : uncertain ? 'Your sit-out is unconfirmed. Check its saved status before trying again.' : 'This week’s reveal status is unavailable. Nothing was changed by this check.'}</p><Button haptic={false} onClick={read}>Check sit-out status</Button></>
            : <>
              {view.rows.map(row => <p className="gx-t-meta" key={row.mode}>{row.name}: {row.status === 'submitted' ? 'fully locked in; keeps counting' : row.status === 'sat_out' ? 'already sat out' : 'remaining guesses will be sat out'} · {row.lockedIn} of {row.games} locked in</p>)}
              {!done && (view.canConfirm ? <>
                {uncertain ? <p className="gx-t-body" role="status">No saved forfeit was found in the latest check. Review the warning before confirming again.</p> : null}
                <Button haptic={false} variant="primary" onClick={confirm}>Confirm sit-out and reveal</Button>
              </> : <p className="gx-t-body" role="status">A new reveal is not available for this week.</p>)}
            </>}
    {storageError && uncertain ? <p className="gx-t-meta" role="alert">This browser cannot keep a recovery marker. Keep this dialog open and check the saved status.</p> : null}
  </Dialog>;
}
export function YourPickDetail({ view }) {
  return <Card className="gx-l-pick gx-vstack gx-gap-12" aria-label="Your saved pick">
    <div className="gx-l-sechead"><p className="gx-t-strong gx-grow">{view.row.main}</p><InfoButton {...INFO.yourPick}/></div>
    {view.row.late && <Pill tone="pending">{view.row.late}</Pill>}
    {view.lockedAt && <p className="gx-t-meta">Locked in {marketTime(view.lockedAt)}</p>}
    <div><h3 className="gx-t-section">{view.lineLabel}</h3><p className="gx-n-m">{view.line ?? '—'}</p></div>
    {view.line !== null && <p className="gx-t-meta">Mathematical comparison only · not a sportsbook reference</p>}
  </Card>;
}

export function IsolatedYourPick({args,view,personal,shell,app,guesses}) {
  const close = shell.closeSheet;
  const marketName = args.market === 'total' ? 'Total' : 'Spread';
  const title = `Your ${marketName} pick`;
  if (!view) return <Sheet title={title} onClose={close}><p className="gx-t-body" role="status">This saved pick is not in the current account and week.</p><Button haptic={false} onClick={close}>Back to game</Button></Sheet>;
  const openPlay = market => shell.go('play', { section: 'picks', market, season: args.season, week: args.week, pickGame: args.game });
  return <Sheet title={title} onClose={close} back={{ label: `${view.game.away} @ ${view.game.home}`, onBack: close }} tall className="gx-l-sheet"
    footer={<Button haptic={false} block onClick={() => openPlay(args.market)}>Open {marketName} in Play</Button>}>
    <p className="gx-t-meta">Week {args.week} · {args.season} · Illustrative matchup</p>
    {personal.error && <p className="gx-t-body" role="status">Your pick could not refresh. Showing the last loaded saved record.</p>}
    <YourPickDetail view={view}/>
    <Button haptic={false} variant="ghost" disabled={personal.loading} onClick={() => app.refresh({ only: ['personal'] })}>Refresh saved pick</Button>
    {view.exampleLocked && <Button haptic={false} variant="ghost" onClick={() => shell.go('play', { section: 'score', season: args.season, week: args.week, market: args.market, scoreGame: args.game })}>View weekly score</Button>}
    {guesses}
  </Sheet>;
}
export function GuessRows({ view, market }) {
  if (!view.rows.length) return <p className="gx-t-body">No community entries for this game.</p>;
  return <Card variant="flush"><List label={`Community ${market === 'spread' ? 'Spread' : 'Total'} guesses`}>
    {view.rows.map(row => <Row key={row.id} you={row.you} className="gx-l-guess-row" start={<Avatar id={row.id} name={row.name} you={row.you}/>}
      title={<>{row.name}{row.you ? ' · You' : ''}</>} sub={`${row.status}${row.removed ? ' · Former member' : ''}`}>
      <span className="gx-l-guess-value gx-n-s">{row.hidden ? <LockLine as="span" className="gx-t-meta">Guess hidden</LockLine> : row.pick ?? '—'}</span>
      {row.score ? <span className="gx-t-meta gx-c-2">{row.score}</span> : null}
      {row.place ? <span className="gx-l-guess-place"><Pill tone="data">{row.place}</Pill></span> : null}
    </Row>)}
  </List></Card>;
}

export function IsolatedGameBets({args,app,shell,read}) {
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const scopeName = app.league?.community === false ? app.league.name : 'Community';
  return <Sheet title="League bets" onClose={close} tall>
    <div className="gx-hstack gx-gap-8"><p className="gx-t-meta gx-grow">{scopeName} · Week {args.week} · {args.season} · Virtual Units</p><InfoButton {...INFO.gameBets}/></div>
    {read.status === 'loading' ? <Skeleton label="Loading this game’s league bets…" shape="rows" count={3}/>
      : read.status === 'error' ? <><p className="gx-t-body" role="alert">League bets are unavailable for this game.</p><Button haptic={false} onClick={read.reload}>Retry league bets</Button></>
        : <><div className="gx-ev gx-vstack gx-gap-12">
          {!read.view.published ? <p className="gx-t-body">This week’s games are not published yet.</p>
            : read.view.game ? <EveryoneGame game={read.view.game}/>
              : <p className="gx-t-body">No Virtual Units picks for this game in {scopeName} yet.</p>}
          {read.view.closed.map(market => <Button haptic={false} key={market} variant="ghost" onClick={() => shell.go('play', { section: 'picks', market, season: args.season, week: args.week, pickGame: args.game })}>Open {market === 'spread' ? 'Spread' : 'Total'} in Play</Button>)}
        </div><Button haptic={false} variant="ghost" onClick={read.reload}>Refresh league bets</Button></>}
  </Sheet>;
}
export function EveryoneGame({ game }) {
  return <Card as="section" className="gx-ev-game gx-vstack gx-gap-12" aria-labelledby={`gx-ev-${game.id}`} data-game={game.id}>
    <header className="gx-ev-game-head">
      <span className="gx-grow gx-vstack gx-gap-4">
        {/* D-62: away mark, "@", home mark; the heading reads as one sentence ("Seattle Seahawks at Denver Broncos"). */}
        <h3 id={`gx-ev-${game.id}`} className="gx-t-strong"><Matchup codes={false} away={game.awayCode} home={game.homeCode} size={32}/></h3>
        {game.kickoff ? <span className="gx-t-meta gx-c-2">{"Illustrative matchup"}</span> : null}
      </span>
      {/* No face stack here: each pick row below already leads with its face and name (design audit A12). */}
    </header>
    <ul className="gx-ev-picks">
      {game.picks.map(pick => <li key={pick.key} className={cx('gx-ev-pick', pick.you && 'gx-ev-you')} data-pick={pick.key} data-open={pick.open ? 'true' : 'false'}>
        <Avatar id={pick.userId} name={pick.display} you={pick.you}/>
        <span className="gx-grow gx-vstack gx-gap-2">
          <span className="gx-ev-pick-head"><span className="gx-t-strong">{pick.name}</span><span className="gx-t-meta gx-c-2">{pick.marketName}</span></span>
          <span className="gx-ev-pick-value"><span className="gx-n-xs">{pick.open ? pick.terms.pick : pick.side}</span><span className="gx-n-xs gx-c-2">{pick.units}</span></span>
          {pick.open ? <span className="gx-t-meta gx-c-2">{pick.terms.odds} · {pick.terms.book}</span> : <LockLine as="span" className="gx-t-meta">{pick.locked}</LockLine>}
        </span>
        {pick.result ? <Pill tone={pick.result.tone}>{pick.result.net ? `${pick.result.label} ${pick.result.net}` : pick.result.label}</Pill> : null}
      </li>)}
    </ul>
  </Card>;
}
export function WeekCard({ week }) {
  const stat = (label, value) => <div className="gx-place-stat"><span className="gx-t-meta gx-c-2">{label}</span><span className="gx-n-s">{value}</span></div>;
  return <Card as="section" className="gx-place-week gx-vstack gx-gap-12" aria-labelledby="gx-place-week" data-bets="week">
    <h2 id="gx-place-week" className="gx-t-section">Your week</h2>
    <div className="gx-place-stats">{stat('Open', week.open)}{stat('In play', week.inPlay)}{stat('To win', week.toWin)}</div>
    <div className="gx-place-stats">{stat('Record', week.record)}{stat('Units', week.units)}{stat('Return', week.ret)}</div>
    {/* Words above a full-width meter (design audit A2): beside it they were squeezed to one letter a line. */}
    <div className="gx-vstack gx-gap-8 gx-place-meter"><span className="gx-t-meta gx-c-2">{week.meter.text}</span><Meter value={week.meter.value} max={3} label={week.meter.text}/></div>
  </Card>;
}

export function PlaceGame({ game, slip, disabled, onToggle }) {
  return <Card as="section" className="gx-place-game gx-vstack gx-gap-12" aria-labelledby={`gx-place-${game.id}`} data-game={game.id}>
    <header className="gx-place-game-head">
      <span className="gx-grow gx-vstack gx-gap-4">
        <h3 id={`gx-place-${game.id}`} className="gx-t-strong"><Matchup codes={false} away={game.awayCode} home={game.homeCode} size={32}/></h3>
        <span className="gx-t-meta gx-c-2">{game.started ? PLACE_COPY.started : "Illustrative matchup"}</span>
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
            {/* Two lines (design audit A15): "SEA +3.5", then "−110 · BetMGM". */}
            {market.sides.map(side => <Chip key={side.side} tall selected={slip[slipKey(game.id, market.market)]?.side === side.side}
              disabled={disabled || !side.offer}
              label={side.offer ? `${side.text}, ${side.offer.source}` : `${side.label}, ${PLACE_COPY.noOffer}`}
              onClick={() => side.offer && onToggle(game, market, side)}>
              <span className="gx-place-chip"><span className="gx-n-s">{side.offer ? side.pick : side.label}</span>
                {side.offer ? <span><span className="gx-n-xs">{side.price}</span><span className="gx-t-meta gx-c-2">{` · ${side.offer.source}`}</span></span>
                  : <span className="gx-t-meta gx-c-2">{PLACE_COPY.noOffer}</span>}</span>
            </Chip>)}
          </ChipRail>}
    </div>)}
  </Card>;
}

export function SlipRow({ entry, disabled, onUnits, onRemove, unitValue, onUnitValue, validUnits }) {
  const { game, market, side, units, edit } = entry;
  return <li className="gx-place-slip-row gx-vstack gx-gap-8" data-slip={entry.key}>
    <div className="gx-hstack gx-gap-8">
      <span className="gx-grow gx-vstack gx-gap-2">
        <span className="gx-t-strong"><Matchup codes={false} away={game.awayCode} home={game.homeCode} size={24}/></span>
        <span className="gx-t-body">{market.name} · {side.text}</span>
        <span className="gx-t-meta gx-c-2">{side.offer.source}{edit ? ' · replaces your saved bet' : ''}</span>
      </span>
      <IconButton icon="close" label={`Remove ${market.name} ${side.text} from your slip`} onClick={onRemove} disabled={disabled}/>
    </div>
    <ChipRail label={`Units for ${market.name} ${side.text}`} className="gx-place-units">
      {UNIT_CHIPS.map(value => <Chip key={value} selected={units === value} disabled={disabled} label={`${fmtNum(value)} units`} onClick={() => onUnits(value)}>{fmtU(value)}</Chip>)}
    </ChipRail>
    <div className="gx-hstack gx-gap-8 gx-place-stepper">
      <IconButton icon="minus" label="0.1 units less" onClick={() => onUnits(previewStepUnits(units, -1))} disabled={disabled || units <= 0.01}/>
      <label className="real-action-unit-field">Custom units<input aria-label="Custom units" type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={unitValue} disabled={disabled} aria-invalid={!validUnits || undefined} onChange={event=>onUnitValue(event.target.value)}/></label>
      <IconButton icon="plus" label="0.1 units more" onClick={() => onUnits(previewStepUnits(units, 1))} disabled={disabled || units >= 100}/>
    </div>
  </li>;
}
function FeedGame({gameId}) { const {away,home}=codes(gameId);return away&&home?<Matchup codes={false} away={away} home={home}/>:gameName(gameId);}
export function IsolatedPicks({args,app,shell,state,shared={},sharing="",problem="",share}) {
 const mode=args.mode??"guess_spread",userId=args.userId??app.accountId,own=userId===app.accountId,market=MARKET[mode],name=(app.community.data.members??[]).find(m=>m.id===userId)?.displayName??"Former member";
  const games = state.data?.games ?? [];
  return <Sheet title={own ? `Your ${market} picks` : `${name}’s ${market} picks`} onClose={shell.closeSheet}>
    {state.data?.week ? <p className="gx-t-meta gx-c-2">Week {state.data.week}</p> : null}
    {state.loading ? <Skeleton label="Loading picks…" shape="rows" count={3}/> : null}
    {state.error ? <p className="gx-t-body gx-c-loss" role="alert">{state.error.status ? state.error.message : 'No connection. Reconnect and try again.'}</p> : null}
    {games.length ? <Card variant="flush" className="gx-feed-picks"><ul className="gx-list" role="list" aria-label={`${market} picks by game`}>{games.map(game => {
      const row = game.rows.find(r => r.userId === userId);
      const pick = row?.pick ?? null, late = row?.late ? fmtLate(row.late.minutes) : '';
      const status = !row || row.status === 'not_yet' ? (own && pick !== null ? 'Draft · not locked in' : 'No pick yet') : row.status === 'sat_out' ? 'Sat out' : '';
      return <li key={game.gameId} className="gx-feed-pick">
        <div className="gx-grow gx-vstack gx-gap-2">
          <FeedGame gameId={game.gameId}/>
          {row?.hidden ? <LockLine>Hidden until you lock in this game or it kicks off.</LockLine>
            : <span className="gx-hstack gx-gap-8 gx-wrap">{pick !== null ? <span className="gx-n-s">{guessText(mode, game.gameId, pick)}</span> : null}{status ? <span className="gx-t-meta gx-c-2">{status}</span> : null}{late ? <Pill tone="pending">{late}</Pill> : null}</span>}
        </div>
        <div className="gx-none gx-vstack gx-gap-4 gx-feed-pick-end">
          {row?.points !== null && row?.points !== undefined ? <span className="gx-n-xs">{fmtNum(row.points)} pts</span> : null}
          {own && row?.lockedIn && row?.points !== null && row?.points !== undefined
            ? <Button haptic={false} variant="secondary" className="gx-feed-share" aria-label={`Share your ${market} result for ${gameName(game.gameId)}`} aria-disabled={Boolean(sharing) || shared[game.gameId] || undefined}
              onClick={() => { if (!shared[game.gameId]) share(game.gameId); }}>{shared[game.gameId] ? 'Shared' : sharing === game.gameId ? 'Sharing…' : 'Share'}</Button> : null}
        </div>
      </li>;
    })}</ul></Card> : null}
    {!state.loading && !state.error && !games.length ? <p className="gx-t-body gx-c-2">No games this week.</p> : null}
    {problem ? <p className="gx-t-body gx-c-loss" role="alert">{problem}</p> : null}
  </Sheet>;
}
export function IsolatedReactors({app,shell,state}) {
 const names=new Map(app.community.data.members.map(m=>[m.id,m.displayName]));
  return <Sheet title={state.loading ? 'Reactions' : `Reactions · ${state.reactors.length}`} onClose={shell.closeSheet}>
    {state.loading ? <Skeleton label="Loading reactions…" shape="rows" count={4}/> : null}
    {state.error ? <p className="gx-t-body gx-c-loss" role="alert">{state.error.status ? state.error.message : 'No connection. Reconnect and try again.'}</p> : null}
    {!state.loading && !state.error && !state.reactors.length ? <p className="gx-t-body gx-c-2">No reactions yet.</p> : null}
    {state.reactors.length ? <Card variant="flush"><List label="Who reacted" data-emoji-ok="true">{state.reactors.map(row => {
      const name = names.get(row.userId) || 'Former member', reaction = reactionOf(row.reaction);
      return <div key={row.userId} className="gx-feed-reactor">
        <Avatar id={row.userId} name={name} size={36} you={row.userId === app.accountId}/>
        <span className="gx-grow gx-t-strong">{name}{row.userId === app.accountId ? ' (you)' : ''}<span className="gx-sr-only">, {reaction?.name}</span></span>
        <span className="gx-feed-emoji gx-feed-emoji--big" aria-hidden="true">{reaction?.emoji}</span>
      </div>;
    })}</List></Card> : null}
  </Sheet>;
}
export const MENU_COPY = Object.freeze({
  title: 'Menu',
  appearance: 'Appearance',
  profile: 'Profile',
  history: 'History',
  export: 'Export my data',
  signedInAs: email => `Signed in as ${email}`,
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  theme: 'Theme',
  themes: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
  guidance: 'Guidance and sources',
  reduceMotion: 'Reduce motion',
  reduceMotionSub: 'Your device’s own setting also stops motion.',
  saved: 'Saved on this device, not your account.',
  notSaved: 'This browser isn’t saving settings, so this lasts until you close the page.',
});

export function IsolatedMenu({shell,busy,signOut}) {
  return (
    <Sheet title={MENU_COPY.title} onClose={shell.closeSheet}>
      <Card className="gx-menu-account"><Avatar id={shell.you.id} name={shell.you.name} size={56}/><div>
        <p className="gx-t-strong">{shell.you.name}</p>
        <p className="gx-t-meta gx-c-2">{MENU_COPY.signedInAs(shell.you.email)}</p>
      </div></Card>
      <Card variant="flush">
        <List>
          {shell.communityAdmin && <LinkRow icon={ICON.members} onClick={() => shell.setSheetArgs({ sub: 'members' })}>Community members</LinkRow>}
          {shell.communityAdmin && <LinkRow icon={ICON.commissioner} onClick={() => shell.setSheetArgs({ sub: 'commissioner', tool: null })}>Commissioner tools</LinkRow>}
          <LinkRow key="profile" icon={ICON.profile} onClick={() => shell.setSheetArgs({ sub: 'profile' })}>{MENU_COPY.profile}</LinkRow>
          <LinkRow key="history" icon={ICON.history} onClick={() => shell.openPage('page.history', {})}>{MENU_COPY.history}</LinkRow>
          <LinkRow key="export" icon={ICON.export} onClick={() => shell.setSheetArgs({ sub: 'export' })}>{MENU_COPY.export}</LinkRow>
          <LinkRow key="preferences" icon={ICON.settings} onClick={() => shell.setSheetArgs({ sub: 'preferences' })}>Settings · sportsbooks and guidance</LinkRow>
          {shell.pushConfigured === true && <LinkRow key="reminders" icon={ICON.reminders} onClick={() => shell.setSheetArgs({ sub: 'reminders' })}>{REMINDER_COPY.title}</LinkRow>}
          <LinkRow key="guidance" icon={ICON.guidance} onClick={() => shell.setSheetArgs({ sub: 'guidance' })}>{MENU_COPY.guidance}</LinkRow>
          <LinkRow key="appearance" icon={ICON.appearance} onClick={() => shell.setSheetArgs({ sub: 'appearance' })}>{MENU_COPY.appearance}</LinkRow>
        </List>
      </Card>
      <Button haptic={false} variant="ghost-2" icon="logOut" className="gx-menu-signout" onClick={signOut} aria-disabled={busy || undefined}>
        {busy ? MENU_COPY.signingOut : MENU_COPY.signOut}
      </Button>
    </Sheet>
  );
}
const TAB_ICONS={home:"house",play:"target",bets:"ticket",research:"chart"};
export function TopBar({ leagueName, you, onHome, onLeague, onMenu }) {
  return (
    <header className="gx-topbar">
      <div className="gx-topbar-inner">
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.home} onClick={onHome}>
          <img className="real-native-logo" src={you.theme==="light"?"logo-hybrid/light-deep-green.svg":"logo-hybrid/lime.svg"} alt=""/>
        </button>
        <button type="button" className="gx-league-btn" aria-label={leagueLabel(leagueName)} onClick={onLeague}>
          <span className="gx-league-pill">
            <span className="gx-league-name gx-truncate">{leagueName}</span>
            <Icon icon="chevronDown" size={16}/>
          </span>
        </button>
        <button type="button" className="gx-top-btn" aria-label={SHELL_COPY.menu} onClick={onMenu}>
          <Avatar id={you.id} name={you.name} size={32}/>
        </button>
      </div>
    </header>
  );
}

export function TabBar({ current, data, onTab }) {
  return (
    <nav className="gx-tabbar" aria-label={SHELL_COPY.tabs}>
      <div className="gx-tabbar-inner">
        {TABS.map(tab => {
          const on = tab === current;
          const badge = tabBadge(tab, data);
          return (
            <button
              key={tab}
              type="button"
              className={cx('gx-tab', on && 'gx-tab--on')}
              data-tab={tab}
              aria-current={on ? 'page' : undefined}
              aria-label={badge.name}
              onClick={() => onTab(tab)}
            >
              <span className="gx-tab-icon">
                <Icon icon={TAB_ICONS[tab]}/>
                {badge.count ? <span className="gx-counter" aria-hidden="true">{badge.count}</span> : null}
                {badge.dot ? <span className="gx-tab-dot" aria-hidden="true"></span> : null}
              </span>
              <span className="gx-tab-label" aria-hidden="true">{badge.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
