// History › Guess weeks (redesign build plan stage 73): any member's weeks, newest first, with person chips (removed
// members listed, D-23), the season picker once a second season has records, and the week detail: the status line, the
// Late pill, "Original time not recorded", eligibility and ruling labels, points, each game's guess and line at the guess
// (the provenance behind a tap), and, for your own weeks only, the drafts closed at kickoff and your changes in plain
// words (/me/changes). Another member's hidden guesses stay hidden: the server sends none (D-31, D-39).
import { useId } from 'react';
import { communityApi, meApi } from '../../api.js';
import { Button, Card, Chip, ChipRail, Icon, List, Pill, Row, Segmented } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { DASH, fmtFull, SEP } from '../format.js';
import { picksHidden } from '../copy.js';
import { HISTORY_MARKETS, MARKET_WORD, changeLines, entryFor, gameRow, weekPointsWords, weekStatus } from './historyFormat.js';

export const GUESS_COPY = Object.freeze({
  loading: 'Loading history…',
  empty: 'No weeks yet.',
  noBallot: 'No ballot this week.',
  satOut: 'Sat out: recorded as sat out, never as zero.',
  allWeeks: 'All weeks',
  changes: 'Your changes',
  changesNone: 'No changes recorded.',
  changesHeld: count => `${count === 1 ? 'One more change shows' : `${count} more changes show`} once those games lock in or kick off.`,
  changesOff: 'Your change list is not available yet. Your saved guesses are kept.',
  drafts: 'Drafts closed at kickoff',
});

function useHistoryRead(app, season) {
  return useLeagueRead(`${app.accountId}:history:${season || 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => {
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['community'] });
  });
}
/** The owner's records (forfeit reasons here; stage 74's older records too). Optional: History works without it. */
export function useRecordsRead(app) {
  return useLeagueRead(`${app.accountId}:me-records`, signal => meApi('records', {}, signal), error => { if (error.status === 401) app.requestSignIn?.(); }, { shared: true });
}

export function HistoryGuess({ args }) {
  const app = useAppData(), shell = useShell(), seasonId = useId();
  const season = Number.isInteger(args.season) ? args.season : null;
  const read = useHistoryRead(app, season), records = useRecordsRead(app);
  if (read.loading) return <p className="gx-t-body gx-c-2" role="status">{GUESS_COPY.loading}</p>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  const data = read.data, viewer = data.viewer ?? app.accountId, members = data.members || [];
  const player = members.some(member => member.id === args.player) ? args.player : viewer;
  const mode = args.mode === 'guess_total' ? 'guess_total' : 'guess_spread';
  const set = patch => shell.setPageArgs(patch);
  const forfeits = records.data?.forfeits || [];
  const forfeitOf = week => (player === viewer ? forfeits.find(f => f.season === week.season && f.week === week.week && f.modes.includes(mode)) ?? null : null);
  const people = [...members].sort((a, b) => Number(b.id === viewer) - Number(a.id === viewer) || String(a.displayName).localeCompare(String(b.displayName)));
  const week = Number.isInteger(args.week) ? (data.weeks || []).find(w => w.week === args.week) ?? null : null;
  return (
    <section className="gx-vstack gx-gap-16" aria-label="Guess weeks">
      {(data.seasons || []).length > 1 && (
        <div className="gx-vstack gx-gap-8">
          <label className="gx-t-body" htmlFor={seasonId}>Season</label>
          <select id={seasonId} className="gx-input" value={data.season} onChange={event => set({ season: Number(event.target.value), week: null })}>
            {data.seasons.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      )}
      <ChipRail label="Player">
        {people.map(member => (
          <Chip key={member.id} text selected={member.id === player} onClick={() => set({ player: member.id })}>
            {member.id === viewer ? 'You' : member.displayName}{member.removed ? `${SEP}Removed` : ''}
          </Chip>
        ))}
      </ChipRail>
      <Segmented label="Market" options={HISTORY_MARKETS} value={mode} onChange={value => set({ mode: value })}/>
      {week
        ? <WeekDetail week={week} data={data} player={player} mode={mode} own={player === viewer} forfeit={forfeitOf(week)} onBack={() => set({ week: null })}/>
        : <WeekList data={data} player={player} mode={mode} own={player === viewer} forfeitOf={forfeitOf} onOpen={w => set({ week: w.week, season: w.season })}/>}
    </section>
  );
}

function WeekList({ data, player, mode, own, forfeitOf, onOpen }) {
  const weeks = data.weeks || [];
  if (!weeks.length) return <p className="gx-empty gx-t-body gx-c-2">{GUESS_COPY.empty}</p>;
  return (
    <Card variant="flush">
      <List label={`${MARKET_WORD[mode]} weeks`}>
        {weeks.map(week => {
          const entry = entryFor(week, player, mode), status = weekStatus(entry, { forfeit: forfeitOf(week), own });
          const points = entry && entry.eligible !== false ? weekPointsWords(entry)?.split(SEP)[0] : null;
          return (
            <Row key={`${week.season}:${week.week}`} size={64} chevron title={`Week ${week.week}`} onClick={() => onOpen(week)} data-week={week.week}
              sub={[status.word, status.late, ...status.notes.slice(0, 1)].filter(Boolean).join(SEP)}
              end={points ? <span className="gx-n-s gx-history-points">{points}</span> : null}/>
          );
        })}
      </List>
    </Card>
  );
}

function WeekDetail({ week, data, player, mode, own, forfeit, onBack }) {
  const app = useAppData();
  const entry = entryFor(week, player, mode), status = weekStatus(entry, { forfeit, own });
  const rules = app.community?.data?.rules;
  const now = Date.parse(data.now) || Date.now();
  const rows = entry && Array.isArray(entry.picks) ? (week.games || []).map(game => gameRow(week, entry, game, { own, rules, now })) : [];
  const drafts = rows.filter(row => row.closedDraft);
  const points = weekPointsWords(entry);
  const when = entry?.status === 'submitted' && entry.submittedAt ? `Submitted ${fmtFull(entry.submittedAt)}` : entry?.satOutAt ? `Sat out ${fmtFull(entry.satOutAt)}` : null;
  return (
    <div className="gx-vstack gx-gap-16" data-week-detail={week.week}>
      <Button variant="ghost" className="gx-history-up" onClick={onBack}><Icon icon="chevronLeft" size={20}/>{GUESS_COPY.allWeeks}</Button>
      <Card as="section" className="gx-vstack gx-gap-12" aria-label={`Week ${week.week} ${MARKET_WORD[mode]}`}>
        <h2 className="gx-t-section">Week {week.week}{SEP}{MARKET_WORD[mode]}</h2>
        <div className="gx-wrap gx-gap-8">
          <Pill tone={status.tone}>{status.word}</Pill>
          {status.late ? <Pill tone="pending">{status.late}</Pill> : null}
        </div>
        {when ? <p className="gx-t-meta gx-c-2">{when}</p> : null}
        {status.notes.map(note => <p key={note} className="gx-t-meta gx-c-2">{note}</p>)}
        {points ? <p className="gx-t-strong" data-week-points>{points}</p> : null}
        {!entry ? <p className="gx-t-body gx-c-2">{GUESS_COPY.noBallot}</p> : null}
        {entry?.status === 'sat_out' && !rows.some(row => row.guess && row.guess !== '—') ? <p className="gx-t-body gx-c-2">{GUESS_COPY.satOut}</p> : null}
        {entry?.picksHidden ? <p className="gx-t-body gx-c-2 gx-history-lock"><Icon icon="lock" size={16}/>{picksHidden(mode === 'guess_total' ? 'total' : 'spread', rules)}</p> : null}
      </Card>
      {rows.length ? (
        <Card variant="flush" className="gx-history-games">
          <ul className="gx-history-game-list" aria-label={`Week ${week.week} games`}>
            {rows.map(row => <GameRow key={row.gameId} row={row}/>)}
          </ul>
        </Card>
      ) : null}
      {own && drafts.length ? (
        <section className="gx-vstack gx-gap-8" aria-label={GUESS_COPY.drafts}>
          <h3 className="gx-t-strong">{GUESS_COPY.drafts}</h3>
          {drafts.map(row => <p key={row.gameId} className="gx-t-body gx-c-2" data-closed-draft>{row.matchup}{SEP}{row.closedDraft}</p>)}
        </section>
      ) : null}
      {own ? <OwnChanges season={week.season} week={week.week} mode={mode}/> : null}
    </div>
  );
}

function GameRow({ row }) {
  return (
    <li className="gx-history-game" data-game={row.gameId}>
      <details>
        <summary className="gx-history-game-head">
          <span className="gx-vstack gx-grow">
            <span className="gx-t-strong">{row.matchup}</span>
            <span className="gx-t-meta gx-c-2">{row.hidden ? 'Hidden' : row.closedDraft ? 'Closed at kickoff' : row.draft ? 'Draft' : row.guess === DASH ? 'No guess' : row.line ?? 'No line saved'}</span>
          </span>
          <span className="gx-vstack gx-history-game-end">
            <span className="gx-n-s">{row.hidden ? <Icon icon="lock" size={16} label="Hidden"/> : row.guess}</span>
            {row.points ? <span className="gx-t-meta gx-c-2">{row.points}</span> : null}
          </span>
          <Icon icon="chevronDown" size={20} className="gx-history-chev"/>
        </summary>
        <div className="gx-vstack gx-gap-8 gx-history-game-body">
          {row.hidden ? <p className="gx-t-body gx-c-2">Hidden until you lock in this game, or at its kickoff.</p> : <>
            <p className="gx-t-body">Guess{SEP}{row.guess}</p>
            {row.line ? <p className="gx-t-body">{row.line}</p> : null}
            {row.late ? <Pill tone="pending">{row.late}</Pill> : null}
            {row.detail.map(line => <p key={line} className="gx-t-meta gx-c-2">{line}</p>)}
            {row.points ? <p className="gx-t-body">Points{SEP}{row.points}</p> : null}
          </>}
          {row.final ? <p className="gx-t-meta gx-c-2">{row.final}</p> : null}
        </div>
      </details>
    </li>
  );
}

/** Your own changes for one week and market, in plain words (/me/changes; owner only, D-16). */
function OwnChanges({ season, week, mode }) {
  const app = useAppData();
  const read = useLeagueRead(`${app.accountId}:me-changes:${season}:${week}`, signal => meApi('changes', { season, week }, signal), error => { if (error.status === 401) app.requestSignIn?.(); });
  const market = read.data?.markets?.find(m => m.mode === mode) ?? null;
  const lines = market ? market.changes.flatMap(change => changeLines(market, change)) : [];
  return (
    <section className="gx-vstack gx-gap-8" aria-label={GUESS_COPY.changes} data-own-changes>
      <h3 className="gx-t-strong">{GUESS_COPY.changes}</h3>
      {read.loading ? <p className="gx-t-meta gx-c-2" role="status">Loading your changes…</p>
        : read.error ? <p className="gx-t-meta gx-c-2">{read.error.status === 503 ? GUESS_COPY.changesOff : read.error.message || GUESS_COPY.changesOff}</p>
        : <>
          {lines.length ? (
            <ol className="gx-history-changes">
              {lines.map((line, index) => (
                <li key={index} className="gx-vstack">
                  <span className="gx-t-body">{line.text}</span>
                  <span className="gx-t-meta gx-c-2">{line.at}</span>
                  {line.late ? <Pill tone="pending">{line.late}</Pill> : null}
                </li>
              ))}
            </ol>
          ) : <p className="gx-t-meta gx-c-2">{GUESS_COPY.changesNone}</p>}
          {market?.pendingChanges ? <p className="gx-t-meta gx-c-2">{GUESS_COPY.changesHeld(market.pendingChanges)}</p> : null}
        </>}
    </section>
  );
}
