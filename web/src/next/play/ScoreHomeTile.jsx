import { communityApi } from '../../api.js';
import { show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PlayFailure } from './PlayStates.jsx';
import { Card, Button } from '../ui/index.js';
import { ownEntry, scoreRows, scoreSummary, SCORE_MARKETS } from './scoring.js';
export function ScoreHomeTile() {
  const app = useAppData(), shell = useShell(), current = app.community.data?.week;
  const read = useLeagueRead(`${app.accountId}:home-score:${current?.season}:${current?.week}`, signal => communityApi('history', current?.season ? { season: current.season } : {},signal), error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
  const week = read.data?.weeks?.find(w => w.season === current?.season && w.week === current?.week);
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label="Your score"><h2 className="gx-t-section">Your week</h2>
    {read.loading ? <p className="gx-t-body" role="status">Loading your score…</p> : read.error ? <PlayFailure what="Your score" error={read.error} onRetry={read.retry}/> : !week ? <p className="gx-t-body">No scoring record for this week yet.</p> : SCORE_MARKETS.map(({ value,label }) => {
      const entry = ownEntry(week,read.data.viewer,value), summary = scoreSummary(scoreRows(week,entry));
      return <section key={value} className="gx-vstack gx-gap-4"><h3 className="gx-t-strong">{label}</h3><p className="gx-t-body">{show(summary.points)} personal points · {summary.scored} scored</p><p className="gx-t-meta">{summary.locked} locked · {summary.remaining} not locked · {summary.pending} waiting for a line</p><p className="gx-t-meta">Standings · games started: {show(entry?.standingsPoints ?? (entry?.scoreTiming === 'immediate' ? null : entry?.weekPoints))} points</p></section>;
    })}
    <p className="gx-t-body gx-c-2">A scored guess uses its saved line. Personal points and official standings can differ while games are waiting for kickoff.</p>
    <Button onClick={() => shell.go('play', { section: 'score',season: current?.season ?? null,week: current?.week ?? null,team: '',matchup: '',scoreGame: null })}>View your score</Button>
    <Button onClick={() => shell.go('play', { section: 'compare',season: current?.season ?? null,week: current?.week ?? null,period: 'week',team: '',matchup: '' })}>Compare players</Button>
  </Card>;
}
