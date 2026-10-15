import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Card, Button } from '../ui/index.js';

/** Navigation only; personal points are read on the authenticated score screen, never inferred from shared rank. */
export function ScoreHomeTile() {
  const app = useAppData(), shell = useShell(), current = app.community.data;
  return <Card as="section" className="gx-vstack gx-gap-12" aria-label="Your score"><h2 className="gx-t-section">Your weekly score</h2><p className="gx-t-body gx-c-2">Saved guesses, scoring lines and points, game by game.</p><Button iconEnd="chevronRight" onClick={() => shell.go('play', { section: 'score', season: current?.week?.season ?? null, week: current?.week?.week ?? null, team: '', matchup: '', scoreGame: null })}>View your score</Button></Card>;
}
