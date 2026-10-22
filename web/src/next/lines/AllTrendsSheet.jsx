// `sh.allTrends`, every trend for one game (DASH-7; the All trends sheet of build plan stage 34, pulled forward into
// stage 13 by Sean's choice on October 14, 2026). It opens over the game sheet as its own sheet, so Back (the phone's,
// Escape, or "‹ SEA @ DEN") closes it and shows the game sheet again (the shell's layer rules). Groups: team,
// situational, line, weather and referee, each opening in place, each trend with its record and sample size,
// strongest first; a market still closed to the viewer shows one lock and no numbers. Nothing here writes.
import { useId, useMemo } from 'react';
import { LINES_COPY, gameSheet, lockedRecordsText } from '../../../../shared/lines-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { allTrends, refereeFor } from '../../../../shared/trends-view.mjs';
import { useOfficials } from './trendsHooks.js';
import { useShell } from '../shell/context.js';
import { Card, InfoButton, List, LockLine, Sheet } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { Expander, TrendList } from './parts.jsx';
import { INFO } from '../info.js';
import './lines.css';

function summaryOf(group) {
  if (group.locks?.length && !group.items.length) return 'Opens with your picks';
  if (group.key === 'referee') return group.name || 'Not assigned yet';
  if (!group.items.length) return group.notes.length ? 'Nothing to show yet' : 'None for this game';
  return `${group.items.length} ${group.items.length === 1 ? 'trend' : 'trends'}`;
}

export function GroupBody({ group, rules }) {
  const meetingsId = useId();
  return (
    <>
      {group.locks?.map(market => <LockLine key={market}>{lockedRecordsText(market, rules)}</LockLine>)}
      {group.notes.map(note => <p className="gx-t-meta" key={note}>{note}</p>)}
      {group.items.length ? <TrendList cards={group.items} rules={rules} label={`${group.title} trends`} variant="s2"/> : null}
      {group.meetings ? (
        <section className="gx-vstack gx-gap-4" aria-labelledby={meetingsId}>
          <h3 className="gx-t-strong" id={meetingsId}>Last meetings (within four years)</h3>
          {group.meetings.length ? (
            <ul className="gx-l-alist">
              {group.meetings.map(m => <li className="gx-t-body gx-c-2" key={m.date}>{m.date}: {m.score} · {m.ats} · {m.ou}</li>)}
            </ul>
          ) : <p className="gx-t-meta">No meetings in the last four years.</p>}
        </section>
      ) : null}
      {!group.items.length && !group.notes.length && !group.locks?.length && !group.meetings ? <p className="gx-t-meta">None for this game.</p> : null}
    </>
  );
}

export function AllTrendsSheet({ args }) {
  const shell = useShell();
  const { personal, community, trends, trendsWeek, records, shown } = useLinesData();
  // The sheet's own read of the week file starts as 'loading' (then answers from the shared cache): until it is
  // ready the sheet says so, and never that the file is missing.
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: args.game }) : null),
    [personal.data, community, trendsWeek, trends.status, records, args.game]);
  const officials = useOfficials(shown?.season, shown?.week, Boolean(view?.trendsGame));
  const all = useMemo(() => (view?.trendsGame ? allTrends(trendsWeek, view.id, { access: view.access, saved: view.saved, names: TEAM_NAMES,
    referee: refereeFor(trendsWeek, view.id, officials) }) : null), [view, trendsWeek, officials]);
  const back = { label: view?.title ?? LINES_COPY.title, onBack: shell.closeSheet };
  return (
    <Sheet title={LINES_COPY.allTrends} back={back} onClose={shell.closeSheet} closeLabel="Close All trends" tall className="gx-l-sheet">
      {!all ? <p className="gx-t-body gx-c-2" role="status">{view ? view.trends.notice || LINES_COPY.trendsLoading : personal.data ? LINES_COPY.notOnBoard : LINES_COPY.loading}</p> : (
        <>
          <div className="gx-l-sechead">
            <p className="gx-t-meta gx-c-2 gx-grow">Every record for this game</p>
            <InfoButton title={INFO.trends.title} body={[...INFO.trends.body, trendsWeek?.copy?.reference]} links={INFO.trends.links}/>
          </div>
          <Card variant="flush">
            <List label="Trend groups">
              {all.groups.map(group => (
                <Expander key={group.key} title={group.title} summary={summaryOf(group)} data-group={group.key}>
                  <GroupBody group={group} rules={view.rules}/>
                </Expander>
              ))}
            </List>
          </Card>
        </>
      )}
    </Sheet>
  );
}
