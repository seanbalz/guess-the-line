// The row that leads to Play › Badges and awards: Play's "More in Play" row. It draws nothing while the features read is
// loading, failed or off (M-25 not applied yet), so the screen it sits on is unchanged until there is something to show.
// The screen passes its own `app` (the shared data), so the row adds no data provider of its own. Home's recap is the
// awards card in HomeAwards.jsx (design lane), which replaced Home's one-line recap row.
import { useShell } from '../shell/context.js';
import { FocusRow } from '../ui/FocusLanding.jsx';
import { useFeatures } from './useFeatures.js';
import { useMomentScope, useNewCount } from '../moments/MomentsProvider.jsx';

const open = shell => () => shell.go('play', { section: 'features' });

export function PlayFeaturesRow({ app }) {
  const shell = useShell();
  useMomentScope('play');
  const fresh = useNewCount('features');
  const { model } = useFeatures(app, shell);
  if (!model) return null;
  const sub = model.recap ? `Week ${model.recap.week} awards are in` : 'Your badges, streaks and awards';
  return <FocusRow icon="trophy" title="Badges and awards" sub={fresh ? `${fresh} new · ${sub}` : sub} onClick={open(shell)}/>;
}
