// The two rows that lead to Play › Badges and awards: Home's recap row (while the newest week's awards are the latest
// news) and Play's "More in Play" row. Each draws nothing while the features read is loading, failed or off (M-25 not
// applied yet), so the screens they sit on are unchanged until there is something to show. The screen passes its own
// `app` (the shared data), so these rows add no data provider of their own.
import { useShell } from '../shell/context.js';
import { FocusRow } from '../ui/FocusLanding.jsx';
import { useFeatures } from './useFeatures.js';

const open = shell => () => shell.go('play', { section: 'features' });

export function HomeRecapRow({ app }) {
  const shell = useShell();
  const { model } = useFeatures(app, shell);
  const recap = model?.recap;
  if (!recap) return null;
  return <FocusRow icon="trophy" title={`Week ${recap.week} awards`} sub={recap.mine ? `You won ${recap.mine.name}` : `${recap.rows.length} ${recap.rows.length === 1 ? 'award is' : 'awards are'} in`} onClick={open(shell)}/>;
}

export function PlayFeaturesRow({ app }) {
  const shell = useShell();
  const { model } = useFeatures(app, shell);
  if (!model) return null;
  return <FocusRow icon="trophy" title="Badges and awards" sub={model.recap ? `Week ${model.recap.week} awards are in` : 'Your badges, streaks and awards'} onClick={open(shell)}/>;
}
