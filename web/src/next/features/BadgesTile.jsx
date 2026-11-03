// Play's Badges tile (Sean's P1B; D-69): how many badges you have earned, then "New: <name>" while a new badge waits to
// be seen, else "earned", and NEW while any badge, award or Pick streak moment waits for Badges and awards. It reads
// the shared features read the page uses (M-25, POST /league/features: no new request) and reports its moments like
// every reader. Like the "More in Play" row it replaces, it holds the Play scope open, so a badge that waited plays
// when Play opens after a navigation. Nothing is a sample: before the read answers it shows a dash (layers.js).
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { PlayTile } from '../play/PlayTile.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewCount, useNewMoments } from '../moments/MomentsProvider.jsx';
import { badgesTile, featuresView } from './layers.js';
import { useFeatures } from './useFeatures.js';

export function BadgesTile({ onOpen }) {
  const app = useAppData(), shell = useShell();
  useMomentScope(SCOPES.play);
  const features = useFeatures(app, shell);
  const waiting = useNewCount(SCOPES.features);
  const newest = useNewMoments(SCOPES.features).filter(m => m.kind === 'badge').at(-1)?.title ?? null;
  const tile = badgesTile({ model: features.model, off: features.off, newest, waiting: waiting > 0 });
  return <PlayTile label="Badges" icon="award" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={waiting > 0} ariaLabel={tile.ariaLabel}
    onClick={onOpen ?? (() => shell.go('play', featuresView()))}/>;
}
