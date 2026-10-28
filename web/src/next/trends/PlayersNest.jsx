// D-66 Trends › Players as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// Players › one player › a measure, or › By team › one team › one direction; and Players › This week › one game.
// Every number comes from shared/player-trends.mjs over the scoped reader's reply, so a guess the reader withholds
// never reaches a layer (D-31). Each layer is a heading, one meta line and tiles; explanations sit behind its ⓘ.
import { playerObservations, buildPlayerTrends, buildSentiment, PLAYER_TREND_WINDOWS, PLAYER_TREND_LABELS } from '../../../../shared/player-trends.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { pickText } from '../../communityFormat.js';
import { Avatar, InfoButton, Matchup, matchupWords, Nest, NestMeter, NestSpark, Pill, TeamMark } from '../ui/index.js';
import { BiasChart, number, signed, time } from './charts.jsx';
import { EvidenceGames, Select } from './PlayerEvidence.jsx';

export const PLAYER_MEASURES = Object.freeze(['points', 'error', 'gap', 'covers', 'teams']);
const mode = market => 'guess_' + market;
const record = r => (r?.n ? `${r.W}–${r.L}${r.P ? '–' + r.P : ''}` : '—');
const span = v => (!v?.from ? null : v.from.season === v.to.season ? `${v.from.season} Week ${v.from.week}–${v.to.week}` : `${v.from.season} Week ${v.from.week} to ${v.to.season} Week ${v.to.week}`);
const points = r => r.metrics.meanPoints;
const pointsWords = value => `${number(value)} of 10 points per game`;
const coverWords = r => (r?.hitRate == null ? 'No decided games' : `${number(r.hitRate * 100)}% of decided games; the tick is the 52.4% break-even`);
const directionLabel = (market, c) => (market === 'total' ? (c.direction === 'over' ? 'Over' : 'Under') : `${c.direction === 'for' ? 'For' : 'Against'} ${c.team}`);
const wilson = r => (r?.hitRate == null ? 'Hit rate unavailable without decisions.' : `Hit rate ${number(r.hitRate * 100)}%, Wilson 95% interval ${number(r.wilson95[0] * 100)}%–${number(r.wilson95[1] * 100)}%. Pushes are excluded from the rate.`);

function Tile({ label, value, picture, onOpen, ...rest }) {
  const body = <><span className="gx-nest-tile-label">{label}</span><span className="gx-n-m gx-nest-num">{value}</span>{picture}</>;
  return <li>{onOpen ? <button type="button" className="gx-nest-tile" onClick={onOpen} {...rest}>{body}</button> : <div className="gx-nest-tile" {...rest}>{body}</div>}</li>;
}
const Big = ({ value }) => <p className="gx-nest-big"><span className="gx-n-xl">{value}</span></p>;

export function PlayersNest({ history, published, view, onChange, scopeName }) {
  const market = view.market === 'total' ? 'total' : 'spread', members = history.members || [];
  const window = PLAYER_TREND_WINDOWS.some(w => w.id === view.window) ? view.window : 'season';
  const observations = playerObservations(history, market);
  const trendsFor = (playerId, team = null) => buildPlayerTrends({ observations, playerId, market, team, window, season: published.season, week: published.week });
  const bias = market === 'total' ? PLAYER_TREND_LABELS.totalBias : PLAYER_TREND_LABELS.spreadBias;
  const player = members.find(m => m.id === view.player) ?? null;
  const toPlayers = { key: 'players', label: 'Players', onOpen: () => onChange({ player: null, playerLayer: null, playerItem: null }) };
  const windowSelect = <Select label="History window" value={window} onChange={window => onChange({ window })}>{PLAYER_TREND_WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</Select>;
  const info = (title, body) => <InfoButton title={title} body={body.filter(Boolean)}/>;

  // Players › This week › one game: the permitted guesses for the published week.
  if (!player && view.playerLayer === 'week') {
    const s = buildSentiment({ history, market, season: published.season, week: published.week });
    const row = s.games.find(g => g.game.id === view.playerItem && g.count) ?? null;
    const notes = [s.referenceNote, 'GTL guesses are not sportsbook ticket or money splits.'];
    if (row) {
      const { game } = row, guess = value => pickText(mode(market), game.awayCode, game.homeCode, value);
      return <Nest label="Player trends" layer={'week:' + game.id} title={matchupWords(game.awayCode, game.homeCode)}
        lips={[toPlayers, { key: 'week', label: 'This week', onOpen: () => onChange({ playerItem: null }) }]}
        info={info('About these guesses', [...notes, `Source times: ${row.sourceTimes.known} known, ${row.sourceTimes.missing} unavailable, ${time(row.sourceTimes.from)} through ${time(row.sourceTimes.to)}.`,
          market === 'spread' ? `The distribution uses signed home spreads: negative favors ${game.homeCode}, positive favors ${game.awayCode}. A guess above its saved reference is not team strength.` : null])}>
        <Big value={guess(row.median)}/>
        <div className="gx-nest-tags"><Pill>{row.count} {row.count === 1 ? 'guess' : 'guesses'}</Pill><Pill>Median</Pill></div>
        <ul className="gx-nest-grid gx-nest-grid--3" aria-label="Guesses against each saved reference">
          <Tile label="Above" value={row.savedReferenceCounts.above}/><Tile label="Equal" value={row.savedReferenceCounts.equal}/><Tile label="Below" value={row.savedReferenceCounts.below}/>
        </ul>
        <BiasChart title={game.awayCode + ' at ' + game.homeCode + (market === 'spread' ? ' signed home spread distribution' : ' GTL total distribution')}
          rows={row.guesses.map((r, i) => ({ label: (members.find(m => m.id === r.userId)?.displayName || 'Member') + ' · ' + (i + 1), value: r.guess, sample: 1 }))}/>
      </Nest>;
    }
    return <Nest label="Player trends" layer="week" title="This week" lips={[toPlayers]} info={info('About this week’s guesses', notes)}>
      <p className="gx-t-meta">Week {published.week} · permitted guesses only</p>
      {s.games.length ? <ul className="gx-nest-list" aria-label="This week’s games">{s.games.map(g => <Tile key={g.game.id} data-game={g.game.id}
        label={<Matchup away={g.game.awayCode} home={g.game.homeCode}/>} value={g.count ? pickText(mode(market), g.game.awayCode, g.game.homeCode, g.median) : '—'}
        picture={<span className="gx-t-meta">{g.count ? `Median of ${g.count}` : 'No permitted guesses yet'}</span>}
        onOpen={g.count ? () => onChange({ playerItem: g.game.id }) : null}/>)}</ul> : <p className="gx-t-body">No permitted current-week observations to show.</p>}
    </Nest>;
  }

  // Players: one tile per member with points per game, then This week.
  if (!player) {
    const others = members.filter(m => m.id !== history.viewer), viewer = members.filter(m => m.id === history.viewer);
    const week = buildSentiment({ history, market, season: published.season, week: published.week }).games.filter(g => g.count).length;
    return <Nest label="Player trends" layer="players" title="Players"
      info={info('About player trends', [PLAYER_TREND_LABELS.limitation, `${scopeName} · ${history.requestedSeasons?.join(', ') || history.season} history. Each observation keeps its original competition week.`, 'Official points use each saved reference, including eligible games with pending results. Official standings are separate.'])}>
      {windowSelect}
      <p className="gx-t-meta">{scopeName} · points per game</p>
      <ul className="gx-nest-grid" aria-label="Players">{[...viewer, ...others].map(m => {
        const r = trendsFor(m.id);
        return <Tile key={m.id} data-player={m.id} onOpen={() => onChange({ player: m.id, playerLayer: null, playerItem: null })}
          label={<span className="gx-nest-person"><Avatar id={m.id} name={m.displayName} size={32}/><span>{m.displayName}{m.removed ? ' · former member' : ''}</span></span>}
          value={r.sample ? number(points(r)) : '—'} picture={r.sample ? <NestMeter share={points(r) / 10} label={pointsWords(points(r))} tick={false}/> : <span className="gx-t-meta">No games</span>}/>;
      })}</ul>
      <ul className="gx-nest-list"><Tile label="This week" value={week} picture={<span className="gx-t-meta">{week === 1 ? 'game' : 'games'} with permitted guesses</span>} onOpen={() => onChange({ playerLayer: 'week', playerItem: null })}/></ul>
    </Nest>;
  }

  const all = trendsFor(player.id), name = player.displayName;
  const toPlayer = { key: 'player', label: name, onOpen: () => onChange({ playerLayer: null, playerItem: null }) };
  const measure = PLAYER_MEASURES.includes(view.playerLayer) && all.sample ? view.playerLayer : null;
  const teams = [...new Set(all.games.flatMap(g => [g.game.awayCode, g.game.homeCode]))]
    .map(code => ({ code, result: trendsFor(player.id, code) })).filter(t => t.result.sample)
    .sort((a, b) => b.result.sample - a.result.sample || (a.code < b.code ? -1 : 1));

  // … › By team › one team › one direction.
  if (measure === 'teams' && view.playerItem) {
    const [code, direction] = String(view.playerItem).split(':');
    const team = teams.find(t => t.code === code);
    if (team) {
      const r = team.result, teamName = TEAM_NAMES[code] || code;
      const toTeams = { key: 'teams', label: 'By team', onOpen: () => onChange({ playerItem: null }) };
      const c = direction ? r.callouts.find(x => x.direction === direction) : null;
      if (c) {
        return <Nest label="Player trends" layer={'callout:' + view.playerItem} title={directionLabel(market, c)}
          lips={[toPlayers, toPlayer, toTeams, { key: 'team', label: teamName, onOpen: () => onChange({ playerItem: code }) }]}
          info={info('About this direction', [c.text, 'Recurring needs five decisions across three competition weeks; it is descriptive.', c.conflictingWindows ? 'Recent and earlier results conflict.' : 'Recent and earlier samples are shown separately.', 'Recent is the last five eligible team games before the direction is chosen; earlier does not overlap.', PLAYER_TREND_LABELS.limitation])}>
          <Big value={record(c.record)}/>
          <NestMeter share={c.record.hitRate} label={coverWords(c.record)}/>
          <div className="gx-nest-tags"><Pill>{c.status === 'recurring' ? 'Recurring pattern' : 'Small sample'}</Pill><Pill>{c.sample} finals</Pill><Pill>{c.competitionWeeks} weeks</Pill>{c.conflictingWindows ? <Pill tone="pending">Recent and earlier differ</Pill> : null}</div>
          <ul className="gx-nest-grid" aria-label="Recent and earlier">
            <Tile label="Recent" value={record(c.recent.record)} picture={<NestMeter share={c.recent.record.hitRate} label={coverWords(c.recent.record)}/>}/>
            <Tile label="Earlier" value={record(c.earlier.record)} picture={<NestMeter share={c.earlier.record.hitRate} label={coverWords(c.earlier.record)}/>}/>
          </ul>
          <EvidenceGames games={c.games} market={market} team={code}/>
          {c.current.length > 0 && <EvidenceGames games={c.current} market={market} team={code} title="This week, same direction"/>}
        </Nest>;
      }
      return <Nest label="Player trends" layer={'team:' + code} title={teamName} lips={[toPlayers, toPlayer, toTeams]}
        info={info('About team history', [`Positive gap means ${market === 'total' ? 'Over' : 'stronger for ' + code} relative to the saved reference. It is not a latest-market comparison.`, wilson(r.record), PLAYER_TREND_LABELS.limitation])}>
        <p className="gx-t-meta">{r.sample} games · {span(r)}</p>
        <ul className="gx-nest-grid" aria-label={teamName + ' history'}>
          <Tile label={market === 'total' ? 'Total bias' : 'Strength gap'} value={signed(r.metrics.meanSignedBias)} picture={<NestSpark signed values={r.weekly.map(w => w.metrics.meanSignedBias)}/>}/>
          <Tile label="At saved line" value={record(r.record)} picture={<NestMeter share={r.record.hitRate} label={coverWords(r.record)}/>}/>
          {r.callouts.map(c => <Tile key={c.direction} data-direction={c.direction} label={directionLabel(market, c)} value={record(c.record)}
            picture={<Pill>{c.status === 'recurring' ? 'Recurring pattern' : 'Small sample'}</Pill>} onOpen={() => onChange({ playerItem: code + ':' + c.direction })}/>)}
        </ul>
        <BiasChart title={(market === 'total' ? PLAYER_TREND_LABELS.totalBias : code + ' strength gap') + ' by competition week'} rows={r.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: w.metrics.meanSignedBias, sample: w.sample }))}/>
        <EvidenceGames games={r.games} market={market} team={code}/>
      </Nest>;
    }
  }

  // … › one measure, or By team.
  if (measure) {
    const weekly = key => all.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: key(w), sample: w.sample }));
    const lips = [toPlayers, toPlayer];
    if (measure === 'teams') {
      return <Nest label="Player trends" layer="teams" title="By team" lips={lips} info={info('About team history', ['Each tile is the strength gap for that team, from every eligible game it played in.', PLAYER_TREND_LABELS.limitation])}>
        <p className="gx-t-meta">{teams.length} teams · {market === 'total' ? 'total bias' : 'strength gap'}</p>
        <ul className="gx-nest-grid" aria-label="Teams">{teams.map(t => <Tile key={t.code} data-team={t.code}
          label={<span className="gx-nest-person"><TeamMark code={t.code} name={TEAM_NAMES[t.code] || t.code} size={24}/><span>{t.result.sample} games</span></span>}
          value={signed(t.result.metrics.meanSignedBias)} onOpen={() => onChange({ playerItem: t.code })}/>)}</ul>
      </Nest>;
    }
    if (measure === 'covers') {
      return <Nest label="Player trends" layer="covers" title="At saved line" lips={lips}
        info={info('About these records', [PLAYER_TREND_LABELS.record + '.', wilson(all.record), `${all.finalized} final results; final-result absolute error ${number(all.metrics.meanAbsoluteRealizedError)} across ${all.metrics.realizedSample} games.`, 'Mixed directions do not mean always backing one team. Hypothetical outcomes, not recorded wagers or profit.'])}>
        <Big value={record(all.record)}/>
        <NestMeter share={all.record.hitRate} label={coverWords(all.record)}/>
        <div className="gx-nest-tags"><Pill>{all.record.decided} decisions</Pill><Pill>{all.record.P} pushes</Pill></div>
        <ul className="gx-nest-grid" aria-label="Other records">
          <Tile label="Opposite side" value={record(all.againstRecord)} picture={<NestMeter share={all.againstRecord.hitRate} label={coverWords(all.againstRecord)}/>}/>
          <Tile label="At guessed line" value={record(all.guessedRecord)} picture={<NestMeter share={all.guessedRecord.hitRate} label={coverWords(all.guessedRecord)}/>}/>
          {market === 'spread' && <Tile label="Straight-up" value={`${all.straightUpRecord.W}–${all.straightUpRecord.L}${all.straightUpRecord.T ? '–' + all.straightUpRecord.T : ''}`} picture={<span className="gx-t-meta">Ties are not pushes</span>}/>}
        </ul>
        <BiasChart title="Cover performance by competition week" signedValues={false} unit="percent" rows={all.weekly.map(w => ({ label: w.season + ' Week ' + w.week, value: w.record.hitRate === null ? null : w.record.hitRate * 100, sample: w.record.n, decided: w.record.decided, pushes: w.record.P }))}/>
        <EvidenceGames games={all.games} market={market}/>
      </Nest>;
    }
    const m = { points: { title: 'Points per game', value: number(points(all)), chart: ['Official points by competition week', false, w => w.metrics.meanPoints], about: 'Official points use each saved reference, including eligible games with pending results. Official standings are separate.' },
      error: { title: 'Market error', value: number(all.metrics.meanAbsoluteMarketError), chart: ['Market absolute error by competition week', false, w => w.metrics.meanAbsoluteMarketError], about: PLAYER_TREND_LABELS.marketError + '. Lower is closer.' },
      gap: { title: bias, value: signed(all.metrics.meanSignedBias), chart: [bias + ' by competition week', true, w => w.metrics.meanSignedBias], about: `Positive gap means ${market === 'total' ? 'Over' : 'stronger for the home team'} relative to the saved reference. It is not a latest-market comparison.` } }[measure];
    return <Nest label="Player trends" layer={measure} title={m.title} lips={lips} info={info('About ' + m.title.toLowerCase(), [m.about, PLAYER_TREND_LABELS.limitation])}>
      <Big value={m.value}/>
      {measure === 'points' && <NestMeter share={points(all) / 10} label={pointsWords(points(all))} tick={false}/>}
      <div className="gx-nest-tags"><Pill>{all.sample} games</Pill>{all.pending ? <Pill>{all.pending} pending</Pill> : null}</div>
      <BiasChart title={m.chart[0]} signedValues={m.chart[1]} rows={weekly(m.chart[2])}/>
      <EvidenceGames games={all.games} market={market}/>
    </Nest>;
  }

  // One player: a tile per measure.
  return <Nest label="Player trends" layer={'player:' + player.id} title={name} lips={[toPlayers]}
    info={info('About player trends', [PLAYER_TREND_LABELS.limitation, `${bias}: positive means ${market === 'total' ? 'Over' : 'stronger for the home team'} relative to the saved reference.`])}>
    {windowSelect}
    <p className="gx-t-meta">{all.sample ? `${all.sample} games · ${span(all)}` : 'No games in this window'}</p>
    {all.sample ? <ul className="gx-nest-grid" aria-label={name + ' measures'}>
      <Tile data-measure="points" label="Points per game" value={number(points(all))} picture={<NestMeter share={points(all) / 10} label={pointsWords(points(all))} tick={false}/>} onOpen={() => onChange({ playerLayer: 'points', playerItem: null })}/>
      <Tile data-measure="error" label="Market error" value={number(all.metrics.meanAbsoluteMarketError)} picture={<NestSpark values={all.weekly.map(w => w.metrics.meanAbsoluteMarketError)}/>} onOpen={() => onChange({ playerLayer: 'error', playerItem: null })}/>
      <Tile data-measure="gap" label={bias} value={signed(all.metrics.meanSignedBias)} picture={<NestSpark signed values={all.weekly.map(w => w.metrics.meanSignedBias)}/>} onOpen={() => onChange({ playerLayer: 'gap', playerItem: null })}/>
      <Tile data-measure="covers" label="At saved line" value={record(all.record)} picture={<NestMeter share={all.record.hitRate} label={coverWords(all.record)}/>} onOpen={() => onChange({ playerLayer: 'covers', playerItem: null })}/>
      <Tile data-measure="teams" label="By team" value={teams.length} picture={<span className="gx-nest-marks" aria-hidden="true">{teams.slice(0, 3).map(t => <TeamMark key={t.code} code={t.code} size={24} decorative/>)}</span>} onOpen={() => onChange({ playerLayer: 'teams', playerItem: null })}/>
    </ul> : <p className="gx-t-body" role="status">No eligible locked guesses in this window.</p>}
  </Nest>;
}
