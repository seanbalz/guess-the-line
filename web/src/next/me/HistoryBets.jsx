// History › Bets weeks (redesign build plan stage 73): everyone's Virtual Units picks for a chosen week, who placed each
// one, its result and units, read from POST /bets/read one week at a time (M-10). Until the season reader (/bets/season,
// stage 42) ships, the weeks come from the published slates /community/history lists. A friend's line and price show
// only where the server marks that game's market open for you (D-36, D-39); otherwise side and units with a lock line.
import { useId } from 'react';
import { betsApi, communityApi } from '../../api.js';
import { Avatar, Card, Icon, List, Pill, Row } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useAppData } from '../data/AppData.jsx';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { SEP } from '../format.js';
import { EVERYONE_COPY } from '../bets/everyone.js';
import { betResultWords, betWords, betsRecord, matchupWords } from './historyFormat.js';

export const BETS_COPY = Object.freeze({
  loading: 'Loading bets…',
  empty: 'No Virtual Units bets this week.',
  noWeeks: 'No weeks yet.',
  off: 'Bets history is not available right now. Every bet is kept.',
});

export function HistoryBets({ args }) {
  const app = useAppData(), shell = useShell(), pick = useId();
  const season = Number.isInteger(args.season) ? args.season : null;
  const weeks = useLeagueRead(`${app.accountId}:history:${season || 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => {
    if (error.status === 401) app.requestSignIn?.();
  });
  if (weeks.loading) return <p className="gx-t-body gx-c-2" role="status">{BETS_COPY.loading}</p>;
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
      <BetsWeek key={`${chosen.season}:${chosen.week}`} season={chosen.season} week={chosen.week}/>
    </section>
  );
}

function BetsWeek({ season, week }) {
  const app = useAppData();
  const read = useLeagueRead(`${app.accountId}:history-bets:${season}:${week}`, signal => betsApi('read', { season, week }, signal), error => { if (error.status === 401) app.requestSignIn?.(); });
  if (read.loading) return <p className="gx-t-body gx-c-2" role="status">{BETS_COPY.loading}</p>;
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
            <span className="gx-n-s">{summary.net}</span>
            {qualified(member.userId) ? <Pill tone="win">Qualified</Pill> : null}
          </div>
        </div>
        <List label={`${name} bets`}>
          {member.bets.map(bet => {
            const game = games.get(bet.gameId), open = member.userId === viewer || data.markets?.[bet.gameId]?.[bet.market]?.visible === true;
            const result = open ? betResultWords(bet) : null;
            return (
              <Row key={`${bet.gameId}:${bet.market}`} size={64} title={`${matchupWords(game)}${SEP}${betWords(game, bet)}`}
                sub={open ? null : <span className="gx-history-lock"><Icon icon="lock" size={16}/>{EVERYONE_COPY.locked(bet.market)}</span>}
                end={result ? <span className="gx-vstack gx-history-bets-end"><Pill tone={result.tone}>{result.word}</Pill>{result.units ? <span className="gx-t-meta">{result.units}</span> : null}</span> : null}/>
            );
          })}
        </List>
      </Card>
    );
  });
}
