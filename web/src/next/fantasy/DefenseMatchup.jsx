// Fantasy defensive matchups: one player's matchup against this week's defense (coverage, front, environment, game
// script, opponent injuries, usage and alignment, each with history splits) and the defense ranking tables. All of it is
// read from the loaded snapshot's precomputed insights (shared/fantasy-defense-view.mjs); the game script uses only the
// viewer's own gated lines reply. Every value names its kind (Observed, Estimate or Not available), sample and period;
// small samples are flagged. Nothing here fetches.
import { useId, useMemo, useState } from 'react';
import { KIND_LABEL, KIND_TONE, TABLE_SORTS, defenseInsights, defenseRankingTable, formatRate, formatTenth, playerMatchupView } from '../../../../shared/fantasy-defense-view.mjs';
import { formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';
import { Pill, Segmented } from '../ui/index.js';
import './defenseMatchup.css';

const httpLink = value => (/^https:\/\//.test(value || '') ? value : undefined);
const POSITIONS = ['QB', 'RB', 'WR', 'TE'].map(value => ({ value, label: value }));
const STATUS_TEXT = {
  unavailable: 'Not available: this week’s snapshot has no defensive-matchup data.',
  position: 'Defensive matchups cover quarterbacks, running backs, wide receivers and tight ends.',
  bye: 'Bye this week: no opponent.',
  'no-opponent': 'The upcoming opponent is not confirmed.',
};

function KindPill({ kind }) {
  return <Pill tone={KIND_TONE[kind] ?? 'neutral'} data-kind={kind}>{KIND_LABEL[kind] ?? KIND_LABEL.unavailable}</Pill>;
}

function MetricList({ rows, label }) {
  return <dl className="gx-fdm-list" aria-label={label}>{rows.map(row => <div key={row.id} className="gx-fdm-item" data-kind={row.kind} data-metric={row.id}>
    <dt>{row.label}</dt>
    <dd className="gx-fdm-value">{row.text}</dd>
    <dd className="gx-fdm-meta"><KindPill kind={row.kind}/>{row.small ? <span className="gx-fdm-small">Small sample</span> : null}
      {[row.sample, row.period, row.rank].filter(Boolean).length ? <span className="gx-t-meta">{[row.sample, row.period, row.rank].filter(Boolean).join(' · ')}</span> : null}</dd>
    {row.basis ? <dd className="gx-t-meta gx-fdm-basis">{row.basis}</dd> : null}
  </div>)}</dl>;
}

/** Source and license credits for the insights; FTN-derived values require "FTN Data via nflverse" attribution. */
export function DefenseCredits({ sources = [], method }) {
  const licenses = [...new Map(sources.map(source => [source.license, source])).values()];
  return <div className="gx-vstack gx-gap-4 gx-fdm-credits">
    <p className="gx-t-meta">{method?.description}</p>
    <p className="gx-t-meta">Data: nflverse play-by-play and schedules ({sources.find(s => s.license === 'CC BY 4.0') ? 'CC BY 4.0' : 'license listed below'}); charting: FTN Data via nflverse (CC BY-SA 4.0). Derived matchup data shares the same license.</p>
    <ul className="gx-fdm-sources">{licenses.map(source => <li key={source.license}><a href={httpLink(source.licenseUrl)} target="_blank" rel="noreferrer">{source.license}</a></li>)}
      {sources.map(source => <li key={source.url}><a href={httpLink(source.url)} target="_blank" rel="noreferrer">{source.name}</a></li>)}</ul>
  </div>;
}

/**
 * A player's defensive matchup. `lines` is the viewer's gated lines reply (or null) and `weather` the existing wind
 * forecast sentence; both are optional.
 */
export function DefenseMatchupSection({ snapshot, playerId, settings, lines = null, weather = null }) {
  const headingId = useId();
  const view = useMemo(() => playerMatchupView(snapshot, playerId, settings, { lines, weather }), [snapshot, playerId, settings.scoring, settings.passingTds, lines, weather]);
  if (!view) return null;
  const { player } = view;
  return <section className="gx-vstack gx-gap-8 gx-fdm" aria-labelledby={headingId} data-fantasy="defense-matchup">
    <h3 className="gx-t-section" id={headingId}>Defensive matchup</h3>
    {view.status !== 'ready' ? <p className="gx-t-body gx-c-2" data-fdm-status={view.status}>{STATUS_TEXT[view.status]}</p> : <>
      <p className="gx-t-meta">{view.home ? 'vs' : '@'} {view.opponent} · every value is labelled</p>
      <p className="gx-fdm-legend" aria-label="Labels"><KindPill kind="observed"/><KindPill kind="estimate"/><KindPill kind="unavailable"/></p>
      <section className="gx-vstack gx-gap-4" aria-label={`How ${view.opponent} could affect ${player.name}`}>
        <h4 className="gx-t-label gx-c-2">How this defense could matter</h4>
        {view.explanations.length ? <ul className="gx-fdm-notes">{view.explanations.map(note => <li key={note.id} data-tone={note.tone}>
          <span className="gx-fdm-tone">{note.tone === 'favorable' ? 'Favorable' : note.tone === 'unfavorable' ? 'Unfavorable' : 'Neutral'}</span>
          <span className="gx-t-body">{note.text}</span>
          <span className="gx-fdm-meta"><KindPill kind={note.kind}/>{note.small ? <span className="gx-fdm-small">Small sample</span> : null}</span>
        </li>)}</ul> : <p className="gx-t-meta">No clear style edge.</p>}
        {!view.hasHistory ? <p className="gx-t-meta">No recorded history for his splits.</p> : null}
      </section>
      {view.sections.map(section => <details key={section.id} className="gx-tr-details gx-fdm-section" data-fdm={section.id}>
        <summary className="gx-t-strong">{section.title}</summary>
        <div className="gx-vstack gx-gap-8">
          {section.status ? <p className="gx-t-body">{section.status}</p> : null}
          {section.effects?.length ? <ul className="gx-fdm-effects">{section.effects.map(text => <li key={text} className="gx-t-body">{text} <KindPill kind="estimate"/></li>)}</ul> : null}
          {section.empty ? <p className="gx-t-body">{section.empty}</p> : null}
          {section.opponent.length ? <><h4 className="gx-t-label gx-c-2">{section.id === 'script' ? 'This game' : section.id === 'injuries' ? `${view.opponent} report` : view.opponent}</h4><MetricList rows={section.opponent} label={`${section.title}: ${view.opponent}`}/></> : null}
          {section.player.length ? <><h4 className="gx-t-label gx-c-2">{player.name}</h4><MetricList rows={section.player} label={`${section.title}: ${player.name}`}/></> : null}
        </div>
      </details>)}
      <details className="gx-tr-details" data-fdm="sources"><summary className="gx-t-strong">Method and sources</summary><DefenseCredits sources={view.sources} method={view.method}/></details>
    </>}
  </section>;
}

function StyleCell({ metric, format = formatRate }) {
  if (!metric || metric.value === null) return <td><span aria-hidden="true">—</span><span className="gx-sr-only">not available</span></td>;
  return <td data-kind={metric.kind}>{format(metric.value)}{metric.kind === 'estimate' ? <span className="gx-fantasy-n">est.</span> : null}{metric.small ? <span className="gx-fantasy-n">small</span> : null}</td>;
}

/** Defense ranking tables: fantasy points allowed by position (season, last four, opponent-adjusted) and defense styles. */
export function DefenseRankings({ snapshot, settings, scoringLabel, initialMode = 'points' }) {
  const [position, setPosition] = useState('WR'), [sort, setSort] = useState('adjusted'), [mode, setMode] = useState(initialMode);
  const table = useMemo(() => defenseRankingTable(snapshot, position, settings, sort), [snapshot, position, settings.scoring, settings.passingTds, sort]);
  const defense = defenseInsights(snapshot);
  if (!table) return <p className="gx-t-body">Defense rankings are not available for this snapshot.</p>;
  const signed = value => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${number(value)}` : '—');
  return <section className="gx-vstack gx-gap-12" aria-label="Defense matchup rankings" data-fantasy="defense-rankings">
    <Segmented label="Position" options={POSITIONS} value={position} onChange={setPosition}/>
    <Segmented label="Table" options={[{ value: 'points', label: 'Points allowed' }, { value: 'styles', label: 'Styles' }]} value={mode} onChange={setMode}/>
    {mode === 'points' ? <Segmented label="Sort by" options={TABLE_SORTS} value={sort} onChange={setSort}/> : null}
    <p className="gx-t-meta" role="status">{scoringLabel} · {position} · Stats through Week {snapshot.statsThroughWeek}</p>
    {mode === 'points' ? <div className="gx-fantasy-table-wrap" role="region" aria-label={`Fantasy points allowed to ${position}`} tabIndex={0}><table className="gx-fantasy-table gx-fdm-table">
      <caption className="gx-sr-only">Fantasy points allowed per game to {position}, most allowed first</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Defense</th><th scope="col">Adj.<span className="gx-fantasy-th-sub">vs offense avg</span></th><th scope="col">Last {table.recentGames}</th><th scope="col">Season</th><th scope="col">Games</th></tr></thead>
      <tbody>{table.rows.map(row => <tr key={row.team} data-team={row.team}>
        <th scope="row">{row.rank ?? '—'}</th><td>{row.team}</td><td>{signed(row.adjusted)}</td><td>{number(row.recent)}</td><td>{number(row.season)}</td>
        <td>{row.seasonGames}{row.small ? <span className="gx-fantasy-n">small</span> : null}</td>
      </tr>)}</tbody>
    </table></div> : defense ? <div className="gx-fantasy-table-wrap" role="region" aria-label="Defense styles" tabIndex={0}><table className="gx-fantasy-table gx-fdm-table">
      <caption className="gx-sr-only">Defense styles: coverage, pressure, front and plays per game</caption>
      <thead><tr><th scope="col">Defense</th><th scope="col">Man</th><th scope="col">Blitz</th><th scope="col">Pressure</th><th scope="col">Front</th><th scope="col">Nickel</th><th scope="col">YPC</th><th scope="col">Plays</th></tr></thead>
      <tbody>{[...table.rows].sort((a, b) => a.team.localeCompare(b.team)).map(row => <tr key={row.team} data-team={row.team}>
        <th scope="row">{row.team}</th><StyleCell metric={row.style?.man}/><StyleCell metric={row.style?.blitz}/><StyleCell metric={row.style?.pressure}/>
        <td data-kind={row.style?.baseKind}>{row.style?.base ?? '—'}{row.style?.base ? <span className="gx-fantasy-n">est.</span> : null}</td>
        <StyleCell metric={row.style?.nickel}/><StyleCell metric={row.style?.ypc} format={formatTenth}/><StyleCell metric={row.style?.plays} format={formatTenth}/>
      </tr>)}</tbody>
    </table></div> : <p className="gx-t-body">Defense styles are not available for this snapshot.</p>}
    <details className="gx-tr-details" data-fdm="table-notes"><summary className="gx-t-strong">How to read this table</summary><div className="gx-vstack gx-gap-4">
      <p className="gx-t-meta">Points allowed per game to every {position} on the opposing offense, scored {scoringLabel}. Rank 1 allowed the most. Teams with fewer than two games are unranked; “small” marks fewer than four games.</p>
      <p className="gx-t-meta">Adjusted: in each game, points allowed minus what that offense’s {position}s scored per game against its other opponents. Positive means the defense gave up more than those offenses usually score.</p>
      <p className="gx-t-meta">Styles: man and nickel rates use last season’s charting when this season has none (est.). Pressure without charting is sacks plus QB hits per dropback (est.). Front is estimated from charted personnel. Blitz, YPC allowed and plays faced are observed this season.</p>
      {defense ? <DefenseCredits sources={defense.sources} method={defense.method}/> : null}
    </div></details>
  </section>;
}
