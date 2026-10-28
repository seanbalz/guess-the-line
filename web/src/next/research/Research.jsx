import { TrendsPage } from '../trends/TrendsPage.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { FocusAction, FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { LinesBoard } from '../lines/LinesBoard.jsx';
import { FantasyPage } from '../fantasy/FantasyPage.jsx';

export function Research() {
  const shell = useShell(), app = useAppData();
  const open = section => shell.go('research', { section, season: null, week: null });
  const section = shell.state.views.research.section;
  if (section === 'games') return <LinesBoard/>;
  if (section === 'trends') return <TrendsPage/>;
  if (section === 'fantasy') return <FantasyPage/>;
  return <section className="gx-screen" data-landing="research">
    <div className="gx-focus-heading"><h1 className="gx-t-title">Research</h1>{app.community.data?.week && <p className="gx-t-meta">Week {app.community.data.week.week}</p>}</div>
    <FocusAction title="Know the matchup." description="Open a game for lines, sources, weather and your notes." action="Explore games" onAction={() => open('games')}/>
    <FocusRows label="More research">
      <FocusRow icon="people" title="Fantasy" sub="Player rankings and snapshot details" onClick={() => open('fantasy')}/>
      <FocusRow icon="chart" title="Trends" sub="Game history, samples and sources" onClick={() => open('trends')}/>
    </FocusRows>
  </section>;
}
