// Research (D-69 step 3): the landing (ResearchLanding.jsx) and its four sections, each with its own address: Games
// (the board and one game's layer), Trends (D-66 nesting cards), Fantasy (lazy, D-66) and Teams (the list and one
// team's layer).
import { useShell } from '../shell/context.js';
import { TrendsPage } from '../trends/TrendsPage.jsx';
import { FantasyPage } from '../fantasy/FantasyPage.jsx';
import { GamesScreen } from '../lines/GamesScreen.jsx';
import { TeamsScreen } from '../teams/TeamsScreen.jsx';
import { ResearchLanding } from './ResearchLanding.jsx';

export function Research() {
  const section = useShell().state.views.research.section;
  if (section === 'games') return <GamesScreen/>;
  if (section === 'trends') return <TrendsPage/>;
  if (section === 'fantasy') return <FantasyPage/>;
  if (section === 'teams') return <TeamsScreen/>;
  return <ResearchLanding/>;
}
