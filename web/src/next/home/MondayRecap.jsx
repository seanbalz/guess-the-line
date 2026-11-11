// Monday recap (design record design/monday-recap-2026-11-05/monday-recap-prism-glass.png). Three steps: a compact
// "Week N recap" entry on Home beside the still-playing card (shared/prior-week.mjs, PriorWeek.jsx), then Home's recap
// layer with the week's separate Spread and Total standings and every game against one friend, then one game's matchup:
// each player's guess, each miss against their own saved line, the final score, and a pending game that has not been
// played. It reads only the existing gated `/league/comparison` (the reply Play › Compare reads), and only while the
// layer is open; recapModel.js words it and gates each game again (D-31). Nothing here is stored or sent anywhere.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { leagueApi } from '../../api.js';
import { shortName, show } from '../../communityFormat.js';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { Avatar, Button, Chip, ChipRail, Icon, InfoButton, MetaLine, Nest, Pill, Segmented, Skeleton, TeamMark, cx } from '../ui/index.js';
import { fmtWhen, SEP } from '../format.js';
import { HOME_COPY } from '../../../../shared/home-view.mjs';
import { hasNavigated } from '../moments/launch.js';
import { focusLayerHeading } from './focusRules.js';
import { HOME_LAYERS } from './homeModel.js';
import { RECAP_MARKETS, STATE_PILL, buildRecap, friendText, isGameId, leftText, missScale, ownText, resultWords, valueText } from './recapModel.js';
import './mondayRecap.css';

export const RECAP_ABOUT = Object.freeze([
  'Last week’s games, your weekly Spread and Total standings, and one friend beside you. Spread and Total stay separate.',
  'Each guess is measured against that player’s own saved line. A friend’s line can differ from yours.',
  'You see a friend’s guess once you lock yours in, or from that game’s kickoff. Until then it stays hidden.',
  'A week with a game still to play is provisional: standings can change when it finishes. Unscored games never count as zero.',
  'The final score and winning margin are a separate comparison. The recap never changes the standings.',
]);

/** Opens the recap of `week` on Home (`#home?layer=recap&season=…&week=…`). */
export const openRecap = (shell, { season, week }, extra = {}) => shell.go('home', { layer: HOME_LAYERS.recap, season, week, market: 'spread', item: undefined, ...extra });

/**
 * The compact Home entry (the board's first screen): "Week 9 recap", how many games are left, and Open recap. `view` is
 * the still-playing view Home already has (priorWeekStillPlaying), so the entry adds no read of its own.
 */
export function RecapEntry({ view, onOpen }) {
  if (!view) return null;
  const left = leftText(view.playing);
  return (
    <section className="gx-home-card gx-recap-entry" aria-labelledby="gx-recap-entry-title" data-recap-entry={`${view.season}-${view.week}`}>
      <div className="gx-recap-entry-text">
        <h2 id="gx-recap-entry-title">Week {view.week} recap</h2>
        <p className="gx-recap-entry-sub">{left}</p>
      </div>
      <button type="button" className="gx-recap-open" onClick={onOpen} aria-label={`Open Week ${view.week} recap, ${left}`}>Open recap <Icon icon={ArrowRight} size={16}/></button>
    </section>
  );
}

function Standing({ market, standing, on, provisional }) {
  const label = market === 'guess_total' ? 'Total' : 'Spread';
  return (
    <div className={cx('gx-recap-rank', on && 'gx-recap-rank--on')} data-recap-rank={market}>
      <span className="gx-t-meta gx-c-2">{label} rank</span>
      <strong className="gx-recap-rank-big">{standing.label}{standing.rank !== null ? <small> / {standing.of}</small> : null}</strong>
      <span className="gx-t-meta gx-c-2">{standing.rank === null ? standing.line : `${show(standing.points)} pts${provisional ? `${SEP}provisional` : ''}`}</span>
    </div>
  );
}

function Score({ item }) {
  const { game, final, state } = item;
  const pill = STATE_PILL[state];
  return (
    <div className="gx-recap-score" role="group" aria-label={final ? `Final, ${game.awayCode} ${final.away}, ${game.homeCode} ${final.home}` : `${game.awayCode} at ${game.homeCode}, ${pill.word.toLowerCase()}`}>
      <span className="gx-recap-side"><TeamMark code={game.awayCode} name={game.awayCode} size={40} decorative/><span className="gx-t-strong">{shortName(game.awayCode)}</span>
        {final ? <strong className="gx-recap-pts" aria-hidden="true">{final.away}</strong> : null}</span>
      <span className="gx-recap-mid" aria-hidden="true">{final ? 'Final' : <Pill tone={pill.tone}>{pill.word}</Pill>}</span>
      <span className="gx-recap-side gx-recap-side--home"><TeamMark code={game.homeCode} name={game.homeCode} size={40} decorative/><span className="gx-t-strong">{shortName(game.homeCode)}</span>
        {final ? <strong className="gx-recap-pts" aria-hidden="true">{final.home}</strong> : null}</span>
    </div>
  );
}

/** One game in the week list: the matchup, its state, your line and your friend's, and Compare guesses. */
function GameRow({ item, mode, onOpen }) {
  const { game, state, final } = item, pill = STATE_PILL[state];
  const when = final ? `Final${SEP}${game.awayCode} ${final.away}–${game.homeCode} ${final.home}`
    : state === 'live' ? `Kicked off ${fmtWhen(game.kickoff)}${SEP}Final when recorded`
    : state === 'upcoming' ? `Kicks off ${fmtWhen(game.kickoff)}` : pill.word[0] + pill.word.slice(1).toLowerCase();
  const friend = friendText(item, mode);
  return (
    <li className="gx-recap-game" data-recap-game={game.id} data-state={state}>
      <div className="gx-recap-game-top">
        <span className="gx-recap-marks" aria-hidden="true"><TeamMark code={game.awayCode} size={32} decorative/><TeamMark code={game.homeCode} size={32} decorative/></span>
        <strong className="gx-t-strong gx-grow">{shortName(game.awayCode)} at {shortName(game.homeCode)}</strong>
        <Pill tone={pill.tone}>{pill.word}</Pill>
      </div>
      <p className="gx-t-meta gx-c-2">{when}</p>
      {item.verdict ? <p className="gx-t-strong" data-recap-verdict={item.verdict.lead}>{item.verdict.text}</p> : null}
      <p className="gx-t-body" data-recap-mine>{ownText(item, mode)}</p>
      {friend ? <p className="gx-t-body" data-recap-friend={item.friend.state}>{friend}</p> : null}
      <Button variant="secondary" onClick={onOpen} aria-label={`Compare guesses, ${game.awayCode} at ${game.homeCode}`}>Compare guesses <Icon icon={ArrowRight} size={16}/></Button>
    </li>
  );
}

/** "Compare guesses": each known miss as a bar on one scale drawn from the labeled values, with its number beside it. */
function MissChart({ item, mode, friendName }) {
  const rows = [{ key: 'me', who: 'You', side: item.me, me: true }, ...(item.friend && item.friend.state !== 'hidden' && item.friend.locked ? [{ key: 'friend', who: friendName, side: item.friend, me: false }] : [])]
    .filter(row => row.side.miss !== null && row.side.miss !== undefined);
  if (!rows.length) return null;
  const scale = missScale(rows.map(row => row.side.miss));
  return (
    <div className="gx-recap-chart" role="img" aria-label={rows.map(row => `${row.who} ${show(row.side.miss)} off`).join(', ')}>
      {rows.map(row => (
        <span key={row.key} className="gx-recap-bar" aria-hidden="true">
          <span className="gx-recap-bar-who"><span className="gx-t-strong">{row.who}</span><span className="gx-t-meta gx-c-2">{valueText(mode, item.game, row.side.guess)}</span></span>
          <span className="gx-recap-track"><span className={cx('gx-recap-fill', row.me && 'gx-recap-fill--me')} style={{ width: `${Math.round(scale.width(row.side.miss) * 1000) / 10}%` }}></span></span>
          <span className="gx-n-s gx-recap-bar-num">{show(row.side.miss)} off</span>
        </span>
      ))}
      <span className="gx-recap-axis" aria-hidden="true"><span className="gx-recap-ticks">{scale.ticks.map(tick => <span key={tick} style={{ left: `${(tick / scale.max) * 100}%` }}>{show(tick)}</span>)}</span><span></span></span>
    </div>
  );
}

/** One game's matchup (the board's third screen). */
function RecapMatchup({ recap, item }) {
  const mode = recap.mode, me = item.me, friend = item.friend, name = recap.friend?.short;
  const result = resultWords(item, mode, shortName);
  const lines = [me.locked && me.line !== null ? `Your saved line ${valueText(mode, item.game, me.line)}` : null,
    friend?.locked && friend.line !== null ? `${name}’s saved line ${valueText(mode, item.game, friend.line)}` : null].filter(Boolean);
  const friendLine = friendText(item, mode);
  return (
    <div className="gx-vstack gx-gap-12" data-recap-matchup={item.game.id}>
      <Score item={item}/>
      {item.state === 'upcoming' || item.state === 'live' ? <p className="gx-t-body" data-recap-pending>{item.state === 'upcoming' ? `Kicks off ${fmtWhen(item.game.kickoff)}. The recap stays provisional until it is final.` : 'Kicked off. The final score shows when it is recorded.'}</p> : null}
      <section className="gx-recap-panel" aria-labelledby="gx-recap-accuracy">
        <h3 className="gx-t-meta gx-c-2" id="gx-recap-accuracy">Your line accuracy</h3>
        <p className="gx-recap-big" data-recap-accuracy>{me.miss !== null ? `${show(me.miss)} pts off.` : me.locked ? (item.state === 'upcoming' ? 'Scores at kickoff.' : 'Not scored yet.') : me.satOut ? 'You sat out.' : 'No locked guess.'}</p>
        {me.locked ? <MetaLine parts={[`Your guess ${valueText(mode, item.game, me.guess)}`, me.line !== null ? `Saved ${valueText(mode, item.game, me.line)}` : 'Saved line pending', me.points !== null ? `${show(me.points)} pts` : null]}/> : null}
      </section>
      {recap.friend ? (
        <section className="gx-recap-panel" aria-labelledby="gx-recap-compare">
          <h3 className="gx-t-strong" id="gx-recap-compare">Compare guesses</h3>
          {item.verdict ? <p className="gx-t-strong" data-recap-verdict={item.verdict.lead}>{item.verdict.text}</p> : null}
          {lines.length ? <MetaLine parts={lines}/> : null}
          <MissChart item={item} mode={mode} friendName={name}/>
          {friendLine && !(friend?.locked && friend.miss !== null) ? <p className="gx-t-body" data-recap-friend={friend.state}>{friendLine}</p> : null}
        </section>
      ) : null}
      {result ? (
        <section className="gx-recap-panel" aria-labelledby="gx-recap-result" data-recap-result>
          <h3 className="gx-t-meta gx-c-2" id="gx-recap-result">Game result</h3>
          <p className="gx-recap-big">{result.headline}</p>
          <p className="gx-t-body gx-c-2">{result.detail}</p>
        </section>
      ) : null}
    </div>
  );
}

function WeekBody({ recap, data, market, onMarket, onFriend, onGame }) {
  const others = (data.members ?? []).filter(m => m.id !== data.viewer);
  const mine = recap.standings[recap.mode];
  return (
    <div className="gx-vstack gx-gap-12">
      <Segmented label="Recap market" options={RECAP_MARKETS} value={market} onChange={onMarket}/>
      <section className={cx('gx-recap-lead', 'gx-recap-panel')} aria-label={`${recap.mode === 'guess_total' ? 'Total' : 'Spread'} standing`} data-recap-lead>
        <Icon icon="people" size={24}/>
        <div><p className="gx-recap-big">{mine.rank === null ? `Not ranked in ${recap.mode === 'guess_total' ? 'Total' : 'Spread'} yet.` : `${mine.label} in ${recap.mode === 'guess_total' ? 'Total' : 'Spread'}.`}</p>
          <p className="gx-t-body gx-c-2">{mine.line}{recap.provisional && mine.rank !== null ? `${SEP}provisional` : ''}</p></div>
      </section>
      <div className="gx-recap-ranks">
        <Standing market="guess_spread" standing={recap.standings.guess_spread} on={recap.mode === 'guess_spread'} provisional={recap.provisional}/>
        <Standing market="guess_total" standing={recap.standings.guess_total} on={recap.mode === 'guess_total'} provisional={recap.provisional}/>
      </div>
      {others.length > 1 ? (
        <ChipRail label="Compare with">
          {others.map(m => <Chip key={m.id} text selected={m.id === recap.friend?.id} className="gx-cmp-face" onClick={() => onFriend(m.id)}><Avatar id={m.id} name={m.displayName} size={32}/>{m.removed ? `${m.displayName} · former` : m.displayName}</Chip>)}
        </ChipRail>
      ) : null}
      {recap.games.length ? <ul className="gx-recap-games" aria-label={`Week ${recap.week} games`}>
        {recap.games.map(item => <GameRow key={item.game.id} item={item} mode={recap.mode} onOpen={() => onGame(item.game.id)}/>)}
      </ul> : <p className="gx-t-body">No games in this week.</p>}
    </div>
  );
}

/** Home's recap layer (`#home?layer=recap`), and one game's matchup inside it (`&item=MIA-GB`). */
export function RecapLayer({ head, app }) {
  const shell = useShell(), view = shell.state?.views?.home ?? {};
  const season = Number.isInteger(view.season) ? view.season : null, week = Number.isInteger(view.week) ? view.week : null;
  const market = view.market === 'total' ? 'total' : 'spread', item = isGameId(view.item) ? view.item : null;
  const leagueId = app.league?.community === false ? app.league.id : null;
  const key = `${app.accountId}:recap:${leagueId ?? 'community'}:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => leagueApi('comparison', { ...(season ? { season } : {}), ...(leagueId ? { leagueId } : {}) }, signal), error => { if (error.status === 401) app.requestSignIn?.(); });
  // The friend is a choice inside the layer (Compare's default until one is chosen), kept for this visit only.
  const [friendId, setFriendId] = useState(null);
  const recap = useMemo(() => (read.data ? buildRecap(read.data, { season, week, market, friendId }) : null), [read.data, season, week, market, friendId]);
  const game = item && recap ? recap.games.find(row => row.game.id === item) ?? null : null;
  const root = useRef(null);
  useLayoutEffect(() => { focusLayerHeading(root.current, hasNavigated()); }, []);
  const weekTitle = week === null ? 'Weekly recap' : `Week ${week} recap`;
  // A step into or out of a layer replaces Home's layer keys (shell/state.js), so each one names the whole recap place.
  const here = { layer: HOME_LAYERS.recap, season, week, market };
  const lips = [{ key: 'home', label: HOME_COPY.title, onOpen: () => shell.setView('home', { layer: undefined }) },
    ...(game ? [{ key: 'recap', label: weekTitle, onOpen: () => shell.setView('home', { ...here, item: undefined }) }] : [])];
  const title = game ? `${shortName(game.game.awayCode)} at ${shortName(game.game.homeCode)}` : weekTitle;
  let body;
  if (read.loading) body = <Skeleton label="Loading your recap…" shape="rows" count={4}/>;
  else if (read.error) body = <><p className="gx-t-body" role="alert">{read.error?.status ? read.error.message : 'No connection. Reconnect and try again.'}</p><Button variant="secondary" onClick={read.retry}>Try again</Button></>;
  else if (!recap) body = <p className="gx-t-body">No recap for this week yet.</p>;
  else body = <>
    <MetaLine parts={[app.league?.name || 'Community', `Week ${recap.week}`, game ? (recap.mode === 'guess_total' ? 'Total' : 'Spread') : leftText(recap.left), recap.provisional ? 'Provisional' : null]}/>
    {game ? <RecapMatchup recap={recap} item={game}/> : item ? <p className="gx-t-body">That game is not in this week.</p>
      : <WeekBody recap={recap} data={read.data} market={market} onMarket={value => shell.setView('home', { market: value })}
        onFriend={setFriendId} onGame={id => shell.setView('home', { ...here, item: id })}/>}
  </>;
  return (
    <div className="gx-screen gx-h gx-recap" data-home="recap-layer" ref={root}>
      {head}
      <Nest label="Monday recap" lips={lips} layer={game ? `recap:${game.game.id}` : 'recap'} title={title} info={<InfoButton title="About the recap" body={RECAP_ABOUT}/>}>
        {body}
      </Nest>
    </div>
  );
}
