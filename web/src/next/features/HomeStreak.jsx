// The Pick streak on Home's hero (design lane, hierarchy pass): a glass pill with a flame and the count, "4-week pick
// streak", beside the week the hero asks you to lock in, so the one action also keeps the streak alive. It reads the
// shared features read (M-25) and draws nothing while it loads, fails or is off, or while the streak is 0 (no "0").
import { Flame } from 'lucide-react';
import { useShell } from '../shell/context.js';
import { Icon } from '../ui/index.js';
import { useFeatures } from './useFeatures.js';
import { HERO_COPY } from '../home/homeModel.js';
import './features.css';

/** The viewer's current Pick streak from the features model, or 0. */
export const pickStreak = model => {
  const n = model?.streaks?.find(s => s.id === 'pick')?.current;
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export function HomeStreak({ app }) {
  const shell = useShell();
  const { model } = useFeatures(app, shell);
  const n = pickStreak(model);
  if (!n) return null;
  return (
    <span className="gx-fx-flame" data-home="streak">
      <Icon icon={Flame} size={16} className="gx-c-accent"/>
      <span className="gx-fx-flame-text">{HERO_COPY.streak(n)}</span>
    </span>
  );
}
