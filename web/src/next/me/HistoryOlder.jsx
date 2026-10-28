// History › Older records (redesign build plan stage 74; D-23, D-35, D-36, Q8): read-only homes for what retired from the
// main screens. One list opens each record: the retired Betting Challenge (every player's record, graded by the old
// engine), your saved games and notes, your forecasts, your journal (read-only, archived records labelled), the real
// slips record by week, the older group scoring views (dates on every row, DP-17) and the Week 5 benchmark freeze record
// (DP-4). Private records come only to their owner (/me/records decides); nothing here writes.
import { useId } from 'react';
import { socialApi } from '../../api.js';
import { Avatar, Button, Card, Icon, LinkRow, List, Pill, Row } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { DASH, SEP, fmtFull, fmtOdds, fmtPct, fmtRecord, plural } from '../format.js';
import { useRecordsRead } from './HistoryGuess.jsx';
import { olderSections, challengeWeeks, forecastWords, journalChanges, journalSummary, journalWords, matchupWords, noteChanges, guessWords, selectionWords, slipWords } from './historyFormat.js';
import { HistoryMatchup } from './HistoryMatchup.jsx';

export const OLDER_COPY = Object.freeze({
  loading: 'Loading older records…',
  off: 'Older records are not available yet. Every record is kept.',
  back: 'Older records',
  none: 'Nothing recorded.',
  challengeHidden: count => `${plural(count, 'selection')} show${count === 1 ? 's' : ''} at kickoff`,
  journalHidden: count => `${plural(count, 'journal record')} show${count === 1 ? 's' : ''} once its game's line opens to you.`,
  archivedCount: count => `${plural(count, 'historical prediction')} with invalid matchups remain${count === 1 ? 's' : ''} archived and excluded from scoring.`,
});

export function HistoryOlder({ args }) {
  const app = useAppData(), shell = useShell(), records = useRecordsRead(app);
  const section = olderSections.find(item => item.id === args.older)?.id ?? null;
  // Real slips read their own route (/social/read), so they stay reachable while /me/records is not available yet (M-27).
  const off = records.error?.status === 503;
  if (records.loading) return <p className="gx-t-body gx-c-2" role="status">{OLDER_COPY.loading}</p>;
  if (records.error && !off) return <LeagueFailure error={records.error} onRetry={records.retry}/>;
  const data = records.data, open = id => shell.setPageArgs({ older: id });
  const available = off ? olderSections.filter(item => item.id === 'slips') : olderSections;
  if (!section || !available.some(item => item.id === section)) {
    return <>
      {off ? <p className="gx-t-body gx-c-2">{OLDER_COPY.off}</p> : null}
      <Card variant="flush">
        <List label="Older records">
          {available.map(item => <LinkRow key={item.id} icon={item.icon} onClick={() => open(item.id)} data-older={item.id}>{item.label}</LinkRow>)}
        </List>
      </Card>
    </>;
  }
  const Section = SECTIONS[section];
  const label = olderSections.find(item => item.id === section).label;
  return (
    <section className="gx-vstack gx-gap-16" aria-label={label} data-older-section={section}>
      <Button variant="ghost" className="gx-history-up" onClick={() => shell.setPageArgs({ older: null })}><Icon icon="chevronLeft" size={20}/>{OLDER_COPY.back}</Button>
      <h2 className="gx-t-section">{label}</h2>
      <Section data={data} args={args}/>
    </section>
  );
}

const slateOf = (data, season, week) => data.slates.find(s => s.season === season && s.week === week) ?? { games: [], results: {} };
const gameOf = (data, season, week, id) => slateOf(data, season, week).games.find(game => game.id === id) ?? { id };
const Empty = () => <p className="gx-empty gx-t-body gx-c-2">{OLDER_COPY.none}</p>;

function Challenge({ data }) {
  const { players, records, hidden } = data.challenge;
  const weeks = challengeWeeks(data);
  const name = id => (id === data.ownerId ? 'You' : players.find(p => p.userId === id)?.displayName ?? 'Player');
  const removed = id => players.find(p => p.userId === id)?.removed === true;
  if (!data.challenge.selections.length && !hidden.length) return <Empty/>;
  return <>
    <Card variant="flush">
      <List label="Betting Challenge records">
        {records.filter(r => r.selections || hidden.some(h => h.userId === r.userId)).map(r => (
          <Row key={r.userId} size={64} start={<Avatar id={r.userId} name={players.find(p => p.userId === r.userId)?.displayName} size={40}/>}
            title={`${name(r.userId)}${removed(r.userId) ? `${SEP}Removed` : ''}`} data-challenge-record={r.userId}
            sub={`${plural(r.selections, 'selection')}${r.ungraded ? `${SEP}${r.ungraded} ungraded` : ''}`}
            end={<span className="gx-vstack gx-history-bets-end"><span className="gx-n-s">{fmtRecord(r.W, r.L, r.P)}</span><span className="gx-t-meta gx-c-2">{r.winRate === null ? DASH : fmtPct(r.winRate)}</span></span>}/>
        ))}
      </List>
    </Card>
    {weeks.map(week => (
      <Card as="section" key={`${week.season}:${week.week}`} className="gx-vstack gx-gap-12" aria-label={`Week ${week.week} selections`}>
        <h3 className="gx-t-strong">Week {week.week}</h3>
        <ul className="gx-history-plain">
          {week.selections.map(s => {
            const game = gameOf(data, s.season, s.week, s.gameId), words = selectionWords(game, s);
            return (
              <li key={`${s.userId}:${s.gameId}`} className="gx-vstack" data-selection={`${s.userId}:${s.gameId}`}>
                <span className="gx-t-body">{name(s.userId)}{SEP}<HistoryMatchup game={game}/>{SEP}{words.pick}{SEP}{fmtOdds(s.odds)}</span>
                <span className="gx-t-meta gx-c-2">{[words.grade, words.final, s.source, s.practice ? 'Practice' : null].filter(Boolean).join(SEP)}</span>
              </li>
            );
          })}
          {week.hidden.map(h => <li key={`hidden:${h.userId}`} className="gx-t-meta gx-c-2 gx-history-lock"><Icon icon="lock" size={16}/>{name(h.userId)}{SEP}{OLDER_COPY.challengeHidden(h.count)}</li>)}
        </ul>
      </Card>
    ))}
  </>;
}

function Saved({ data }) {
  if (!data.saved.length) return <Empty/>;
  return data.saved.map(f => {
    const game = gameOf(data, f.season, f.week, f.gameId);
    return (
      <Card as="section" key={`${f.season}:${f.week}:${f.gameId}`} className="gx-vstack gx-gap-8" aria-label={`Week ${f.week} ${matchupWords(game)}`} data-saved={f.gameId}>
        <div className="gx-between gx-gap-8"><span className="gx-t-strong">Week {f.week}{SEP}<HistoryMatchup game={game}/></span><Pill tone={f.saved ? 'data' : 'neutral'}>{f.saved ? 'Saved' : 'Not saved'}</Pill></div>
        {f.note ? <p className="gx-t-body gx-history-note">{f.note}</p> : <p className="gx-t-meta gx-c-2">No note</p>}
        <p className="gx-t-meta gx-c-2">Last changed {fmtFull(f.updatedAt)}</p>
        {f.changes.length ? <details className="gx-history-more"><summary className="gx-t-body">{plural(f.changes.length, 'change')}</summary>
          <ul className="gx-history-plain">{noteChanges(f.changes).map((line, i) => <li key={i} className="gx-vstack"><span className="gx-t-body">{line.text}</span><span className="gx-t-meta gx-c-2">{line.at}</span></li>)}</ul>
        </details> : null}
      </Card>
    );
  });
}

function Forecasts({ data }) {
  if (!data.forecasts.length) return <Empty/>;
  return (
    <Card variant="flush">
      <List label="Forecasts">
        {data.forecasts.map(f => {
          const game = gameOf(data, f.season, f.week, f.gameId), words = forecastWords(game, f);
          return <Row key={`${f.season}:${f.week}:${f.gameId}:${f.market}`} size={64} data-forecast={`${f.gameId}:${f.market}`}
            title={<>Week {f.week}{SEP}<HistoryMatchup game={game}/>{SEP}{words.market}</>} sub={words.history} end={<span className="gx-n-s">{words.value}</span>}/>;
        })}
      </List>
    </Card>
  );
}

function Journal({ data }) {
  const summary = journalSummary(data.journal);
  if (!data.journal.length && !data.journalHidden) return <Empty/>;
  return <>
    <Card as="section" className="gx-vstack gx-gap-8" aria-label="Journal summary" data-journal-summary>
      <p className="gx-t-strong">{summary.headline}</p>
      {summary.lines.map(line => <p key={line} className="gx-t-meta gx-c-2">{line}</p>)}
    </Card>
    {data.journal.map(entry => {
      const game = gameOf(data, entry.season, entry.week, entry.gameId), words = journalWords(game, entry);
      return (
        <Card as="section" key={entry.id} className="gx-vstack gx-gap-8" aria-label={`Journal record, Week ${entry.week} ${matchupWords(game)}`} data-journal={entry.id}>
          <div className="gx-between gx-gap-8"><span className="gx-t-strong">Week {entry.week}{SEP}<HistoryMatchup game={game}/></span>
            {entry.archived ? <Pill>Archived</Pill> : <Pill tone={words.tone}>{words.outcome}</Pill>}</div>
          <p className="gx-t-body">{words.kind}{SEP}{words.pick}</p>
          {words.money ? <p className="gx-t-meta gx-c-2">{words.money}</p> : null}
          {entry.notes ? <p className="gx-t-body gx-history-note">{entry.notes}</p> : null}
          <p className="gx-t-meta gx-c-2">{words.meta}</p>
          {entry.changes.length ? <details className="gx-history-more"><summary className="gx-t-body">{plural(entry.changes.length, 'change')}</summary>
            <ul className="gx-history-plain">{journalChanges(entry.changes).map((line, i) => <li key={i} className="gx-vstack"><span className="gx-t-body">{line.text}</span><span className="gx-t-meta gx-c-2">{line.at}</span></li>)}</ul>
          </details> : null}
        </Card>
      );
    })}
    {data.journalHidden ? <p className="gx-t-meta gx-c-2 gx-history-lock"><Icon icon="lock" size={16}/>{OLDER_COPY.journalHidden(data.journalHidden)}</p> : null}
  </>;
}

function Slips({ args }) {
  const app = useAppData(), shell = useShell(), pick = useId();
  const week = Number.isInteger(args.slipsWeek) ? args.slipsWeek : null, season = Number.isInteger(args.slipsSeason) ? args.slipsSeason : null;
  const read = useLeagueRead(`${app.accountId}:history-slips:${season ?? 'latest'}:${week ?? 'latest'}`, signal => socialApi('read', week ? { season, week } : {}, app.accountId, signal),
    error => { if (error.status === 401) app.requestSignIn?.(); });
  if (read.loading) return <p className="gx-t-body gx-c-2" role="status">{OLDER_COPY.loading}</p>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data, weeks = data.availableWeeks || [], entries = data.entries || [];
  return <>
    {weeks.length ? (
      <div className="gx-vstack gx-gap-8">
        <label className="gx-t-body" htmlFor={pick}>Week</label>
        <select id={pick} className="gx-input" value={`${data.season}:${data.week}`} onChange={event => { const [s, w] = event.target.value.split(':').map(Number); shell.setPageArgs({ slipsSeason: s, slipsWeek: w }); }}>
          {weeks.map(w => <option key={`${w.season}:${w.week}`} value={`${w.season}:${w.week}`}>Week {w.week}{w.season !== data.season ? ` ${w.season}` : ''}</option>)}
        </select>
      </div>
    ) : null}
    {entries.length ? entries.map(entry => {
      const words = slipWords(entry, entry.ownerId === app.accountId);
      return (
        <Card as="section" key={entry.id} className="gx-vstack gx-gap-8" aria-label={`${words.owner} slip`} data-slip={entry.id}>
          <div className="gx-between gx-gap-8"><span className="gx-t-strong">{words.owner}</span><span className="gx-wrap gx-gap-8"><Pill tone="real">Real slip</Pill><Pill tone={words.tone}>{words.outcome}</Pill></span></div>
          {words.legs.map(leg => <p key={leg} className="gx-t-body">{leg}</p>)}
          <p className="gx-t-meta gx-c-2">{words.terms}</p>
          {words.note ? <p className="gx-t-body gx-history-note">{words.note}</p> : null}
        </Card>
      );
    }) : <p className="gx-empty gx-t-body gx-c-2">No real slips this week.</p>}
  </>;
}

function Archives({ data }) {
  if (!data.archives.length) return <Empty/>;
  return data.archives.map(a => (
    <Card as="section" key={a.leagueId} className="gx-vstack gx-gap-12" aria-label={`${a.name ?? 'Group'} archive`} data-archive={a.leagueId}>
      <div className="gx-vstack"><span className="gx-t-strong">{a.name ?? 'Group'}{a.week ? `${SEP}Week ${a.week}` : ''}</span><span className="gx-t-meta gx-c-2">Archived {fmtFull(a.archivedAt)}{SEP}read-only</span></div>
      {Number.isInteger(a.archivedCount) ? <p className="gx-t-body gx-c-2" data-archived-count>{OLDER_COPY.archivedCount(a.archivedCount)}</p> : null}
      {a.snapshots.length ? (
        <ul className="gx-history-plain" aria-label="Archived source timeline">
          {a.snapshots.map(s => (
            <li key={s.id} className="gx-history-snapshot" data-snapshot={s.id}>
              <details className="gx-history-more">
                <summary className="gx-vstack">
                  <span className="gx-t-body">{fmtFull(s.capturedAt)}{s.total !== null ? `${SEP}${s.total} pts` : ''}</span>
                  <span className="gx-t-meta gx-c-2">{s.source ?? 'Source'} reference{SEP}{s.timeBasis === 'publication' ? 'page time, capture time unavailable' : `page ${fmtFull(s.quotedAt)}`}{SEP}Unofficial</span>
                </summary>
                {Object.keys(s.games).length ? (
                  <ul className="gx-history-plain">
                    {a.games.filter(g => s.games[g.id]).map(g => (
                      <li key={g.id} className="gx-t-meta"><HistoryMatchup game={g}/>{SEP}{guessWords('guess_spread', g, s.games[g.id].value)}
                        {s.games[g.id].originalPick !== undefined ? `${SEP}your pick ${guessWords('guess_spread', g, s.games[g.id].originalPick)}${SEP}${s.games[g.id].points} pts` : ''}</li>
                    ))}
                  </ul>
                ) : <p className="gx-t-meta gx-c-2">Game lines show from each game's kickoff.</p>}
                {s.sourceUrl ? <a className="gx-t-meta gx-info-link" href={s.sourceUrl} target="_blank" rel="noreferrer">Source page</a> : null}
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  ));
}

function Benchmarks({ data }) {
  if (!data.benchmarks.length) return <Empty/>;
  return data.benchmarks.map(b => (
    <Card as="section" key={b.policyId} className="gx-vstack gx-gap-12" aria-label={`Week ${b.week} benchmark freeze`} data-benchmark={b.policyId}>
      <div className="gx-between gx-gap-8"><span className="gx-t-strong">Week {b.week}{SEP}Spread benchmark</span><Pill tone={b.status === 'frozen' ? 'data' : 'neutral'}>{b.status === 'frozen' ? 'Frozen' : 'Not frozen'}</Pill></div>
      {b.status === 'frozen' ? <>
        <p className="gx-t-meta gx-c-2">Frozen {fmtFull(b.frozenAt)}{SEP}kickoff {fmtFull(b.actualKickoff)}</p>
        <p className="gx-t-meta gx-c-2">Captured {fmtFull(b.capturedAt)}{SEP}quoted {fmtFull(b.quotedAt)}</p>
        {b.games ? <ul className="gx-history-plain">{slateOf(data, b.season, b.week).games.filter(g => b.games[g.id]).map(g => <li key={g.id} className="gx-t-meta"><HistoryMatchup game={g}/>{SEP}{guessWords('guess_spread', g, b.games[g.id].value)}</li>)}</ul>
          : <p className="gx-t-meta gx-c-2">The lines show after kickoff.</p>}
        {b.sourceUrl ? <a className="gx-t-meta gx-info-link" href={b.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
      </> : <p className="gx-t-meta gx-c-2">No benchmark was frozen for this week.</p>}
      {b.decision ? <details className="gx-history-more"><summary className="gx-t-body">The ruling</summary><p className="gx-t-meta gx-c-2">{b.decision}</p></details> : null}
    </Card>
  ));
}

const SECTIONS = Object.freeze({ challenge: Challenge, saved: Saved, forecasts: Forecasts, journal: Journal, slips: Slips, archives: Archives, benchmark: Benchmarks });
