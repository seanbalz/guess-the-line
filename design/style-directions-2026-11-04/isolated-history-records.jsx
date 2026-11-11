// Native Bets weeks + Older records presentation, isolated from hooks/APIs.
// Preview adapters: injected reads/contexts, Button haptics off, mark-only matchups,
// and explicitly illustrative note/archive/freeze metadata. Pure formatting remains native.
import React,{useId} from 'react';
import {Avatar,Button,Card,Icon,LinkRow,List,Matchup,Pill,Row,Skeleton} from '../../web/src/next/ui/index.js';
import {DASH,SEP,fmtFull,fmtOdds,fmtPct,fmtRecord,plural} from '../../web/src/next/format.js';
import {EVERYONE_COPY} from '../../web/src/next/bets/everyone.js';
import {betResultWords,betWords,betsRecord,olderSections,challengeWeeks,forecastWords,journalChanges,journalSummary,journalWords,matchupWords,noteChanges,guessWords,selectionWords,slipWords} from '../../web/src/next/me/historyFormat.js';
function HistoryMatchup({game,away=game?.awayCode,home=game?.homeCode}){return away&&home?<Matchup away={away} home={home} codes={false}/>:DASH;}
function LeagueFailure({error,onRetry}){return <Card className="gx-vstack gx-gap-12 gx-l-state" role="alert" data-league-state="error"><p className="gx-t-body">{error?.status?error.message:'No connection. Reconnect and try again.'}</p><Button haptic={false} onClick={onRetry}>Try again</Button></Card>;}
export const BETS_COPY = Object.freeze({
  loading: 'Loading bets…',
  empty: 'No Virtual Units bets this week.',
  noWeeks: 'No weeks yet.',
  off: 'Bets history is not available right now. Every bet is kept.',
});

export function IsolatedHistoryBets({ args, app, shell, weeks, reads }) {
  const pick = useId();
  const season = Number.isInteger(args.season) ? args.season : null;
  if (weeks.loading) return <Skeleton label={BETS_COPY.loading} shape="rows" count={4}/>;
  if (weeks.error) return <LeagueFailure error={weeks.error} onRetry={weeks.retry}/>;
  const list = weeks.data.weeks || [];
  if (!list.length) return <p className="gx-empty gx-t-body gx-c-2">{BETS_COPY.noWeeks}</p>;
  const chosen = list.find(w => w.week === args.betsWeek) ?? list[0];
  return (
    <section className="gx-vstack gx-gap-16" aria-label="Bets weeks">
      <div className="gx-vstack gx-gap-8">
        <label className="gx-t-body" htmlFor={pick}>Week</label>
        <select id={pick} className="gx-input" value={chosen.week} onChange={event => shell.setPageArgs({ betsWeek: Number(event.target.value) })}>
          {list.map(w => <option key={w.week} value={w.week}>Week {w.week}</option>)}
        </select>
      </div>
      <BetsWeek app={app} read={reads[chosen.week] ?? reads.default} key={`${chosen.season}:${chosen.week}`} season={chosen.season} week={chosen.week}/>
    </section>
  );
}

function BetsWeek({ season, week, app, read }) {
  if (read.loading) return <Skeleton label={BETS_COPY.loading} shape="rows" count={4}/>;
  if (read.error) return read.error.status === 503 ? <p className="gx-t-body gx-c-2">{BETS_COPY.off}</p> : <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data, viewer = app.accountId;
  const games = new Map((data.games || []).map(game => [game.id, game]));
  const players = (data.roster || []).map(member => ({ ...member, bets: (data.bets || []).filter(bet => bet.userId === member.userId && games.has(bet.gameId)) }))
    .filter(member => member.bets.length)
    .sort((a, b) => Number(b.userId === viewer) - Number(a.userId === viewer) || String(a.displayName).localeCompare(String(b.displayName)));
  if (!players.length) return <p className="gx-empty gx-t-body gx-c-2">{BETS_COPY.empty}</p>;
  const qualified = id => (data.qualification || []).find(row => row.userId === id)?.qualified === true;
  return players.map(member => {
    const name = member.userId === viewer ? 'You' : member.displayName || 'Player', summary = betsRecord(member.bets);
    return (
      <Card as="section" key={member.userId} variant={member.userId === viewer ? 'tint' : undefined} className="gx-vstack gx-gap-12" aria-label={`${name}, Week ${week} bets`} data-bets-player={member.userId}>
        <div className="gx-hstack gx-gap-12">
          <Avatar id={member.userId} name={member.displayName} size={40}/>
          <div className="gx-vstack gx-grow">
            <span className="gx-t-strong">{name}</span>
            <span className="gx-t-meta gx-c-2">{summary.bets}{SEP}{summary.record}</span>
          </div>
          <div className="gx-vstack gx-history-bets-end">
            <span className="gx-n-s" data-net-negative={summary.net.startsWith("−")}>{summary.net}</span>
            {qualified(member.userId) ? <Pill tone="win">Qualified</Pill> : null}
          </div>
        </div>
        <List label={`${name} bets`}>
          {member.bets.map(bet => {
            const game = games.get(bet.gameId), open = member.userId === viewer || data.markets?.[bet.gameId]?.[bet.market]?.visible === true;
            const result = open ? betResultWords(bet) : null;
            return (
              <Row key={`${bet.gameId}:${bet.market}`} size={64} title={<><HistoryMatchup game={game}/>{SEP}{betWords(game, bet)}</>}
                sub={open ? null : <span className="gx-history-lock"><Icon icon="lock" size={16}/>{EVERYONE_COPY.locked(bet.market)}</span>}
                end={result ? <span className="gx-vstack gx-history-bets-end"><Pill tone={result.tone}>{result.word}</Pill>{result.units ? <span className="gx-t-meta">{result.units}</span> : null}</span> : null}/>
            );
          })}
        </List>
      </Card>
    );
  });
}

export const OLDER_COPY = Object.freeze({
  loading: 'Loading older records…',
  off: 'Older records are not available yet. Every record is kept.',
  back: 'Older records',
  none: 'Nothing recorded.',
  challengeHidden: count => `${plural(count, 'selection')} show${count === 1 ? 's' : ''} at kickoff`,
  journalHidden: count => `${plural(count, 'journal record')} show${count === 1 ? 's' : ''} once its game's line opens to you.`,
  archivedCount: count => `${plural(count, 'historical prediction')} with invalid matchups remain${count === 1 ? 's' : ''} archived and excluded from scoring.`,
});

export function IsolatedHistoryOlder({ args, app, shell, records, slipsRead }) {
  const section = olderSections.find(item => item.id === args.older)?.id ?? null;
  // Real slips read their own route (/social/read), so they stay reachable while /me/records is not available yet (M-27).
  const off = records.error?.status === 503;
  if (records.loading) return <Skeleton label={OLDER_COPY.loading} shape="rows" count={4}/>;
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
      <Button haptic={false} variant="ghost" className="gx-history-up" onClick={() => shell.setPageArgs({ older: null })}><Icon icon="chevronLeft" size={20}/>{OLDER_COPY.back}</Button>
      <h2 className="gx-t-section">{label}</h2>
      <Section data={data} args={args} app={app} shell={shell} read={slipsRead}/>
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
        <p className="gx-t-meta gx-c-2">{f.example ? 'Illustrative note · no saved timestamp' : `Last changed ${fmtFull(f.updatedAt)}`}</p>
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

function Slips({ args, app, shell, read }) {
  const pick = useId();
  const week = Number.isInteger(args.slipsWeek) ? args.slipsWeek : null, season = Number.isInteger(args.slipsSeason) ? args.slipsSeason : null;
  if (read.loading) return <Skeleton label={OLDER_COPY.loading} shape="rows" count={4}/>;
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
      <div className="gx-vstack"><span className="gx-t-strong">{a.name ?? 'Group'}{a.week ? `${SEP}Week ${a.week}` : ''}</span><span className="gx-t-meta gx-c-2">{a.example ? 'Illustrative archive · read-only' : `Archived ${fmtFull(a.archivedAt)}${SEP}read-only`}</span></div>
      {Number.isInteger(a.archivedCount) ? <p className="gx-t-body gx-c-2" data-archived-count>{OLDER_COPY.archivedCount(a.archivedCount)}</p> : null}
      {a.snapshots.length ? (
        <ul className="gx-history-plain" aria-label="Archived source timeline">
          {a.snapshots.map(s => (
            <li key={s.id} className="gx-history-snapshot" data-snapshot={s.id}>
              <details className="gx-history-more">
                <summary className="gx-vstack">
                  <span className="gx-t-body">{s.example ? 'Example comparison snapshot' : fmtFull(s.capturedAt)}{s.total !== null ? `${SEP}${s.total} pts` : ''}</span>
                  <span className="gx-t-meta gx-c-2">{s.example ? 'Rule-math illustration · no source/page/capture time' : <>{s.source ?? 'Source'} reference{SEP}{s.timeBasis === 'publication' ? 'page time, capture time unavailable' : `page ${fmtFull(s.quotedAt)}`}{SEP}Unofficial</>}</span>
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
      <div className="gx-between gx-gap-8"><span className="gx-t-strong">Week {b.week}{SEP}{b.example ? 'Example benchmark' : 'Spread benchmark'}</span><Pill tone={b.status === 'frozen' ? 'data' : 'neutral'}>{b.status === 'frozen' ? 'Frozen' : 'Not frozen'}</Pill></div>
      {b.status === 'frozen' ? <>
        <p className="gx-t-meta gx-c-2">{b.example ? 'Illustrative frozen-record layout · no actual freeze or timing evidence' : <>Frozen {fmtFull(b.frozenAt)}{SEP}kickoff {fmtFull(b.actualKickoff)}</>}</p>
        <p className="gx-t-meta gx-c-2">{b.example ? 'Rule-math comparisons · no bookmaker quotes' : <>Captured {fmtFull(b.capturedAt)}{SEP}quoted {fmtFull(b.quotedAt)}</>}</p>
        {b.games ? <ul className="gx-history-plain">{slateOf(data, b.season, b.week).games.filter(g => b.games[g.id]).map(g => <li key={g.id} className="gx-t-meta"><HistoryMatchup game={g}/>{SEP}{guessWords('guess_spread', g, b.games[g.id].value)}</li>)}</ul>
          : <p className="gx-t-meta gx-c-2">The lines show after kickoff.</p>}
        {b.sourceUrl ? <a className="gx-t-meta gx-info-link" href={b.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}
      </> : <p className="gx-t-meta gx-c-2">No benchmark was frozen for this week.</p>}
      {b.decision ? <details className="gx-history-more"><summary className="gx-t-body">The ruling</summary><p className="gx-t-meta gx-c-2">{b.decision}</p></details> : null}
    </Card>
  ));
}

const SECTIONS = Object.freeze({ challenge: Challenge, saved: Saved, forecasts: Forecasts, journal: Journal, slips: Slips, archives: Archives, benchmark: Benchmarks });
