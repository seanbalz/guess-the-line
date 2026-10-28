// `sh.badge`: one badge's detail (the prototype's badge sub-view): the 96 tile (dashed when not earned), its rarity in
// words, its rule, how often it was earned and when ("Week 6 · SEA @ DEN · Total 41 exact", the game as marks), newest
// first.
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Badge, Sheet } from '../ui/index.js';
import { badgeMeta, earnedText } from './model.js';
import { BadgeLine } from './BadgeLine.jsx';
import { BADGE_BY_ID } from '../../../../shared/game-features/catalog.mjs';
import { useFeatures } from './useFeatures.js';
import './features.css';

export function BadgeSheet({ id, args }) {
  const app = useAppData(), shell = useShell();
  const features = useFeatures(app, shell, { celebrate: false });
  if (!Object.hasOwn(BADGE_BY_ID, args?.badge)) throw new Error('Unknown badge.');
  const meta = badgeMeta(args.badge);
  const earned = features.model?.badgesOf(args.userId ?? app.accountId).find(b => b.id === args.badge) ?? null;
  return (
    <Sheet title={meta.name} onClose={() => shell.closeLayer(id, args.key)}>
      <div className="gx-fx-detail" data-features="badge">
        <Badge iconPath={meta.icon} size={96} rarity={meta.rarity} locked={!earned}/>
        <p className="gx-t-micro gx-c-2">{meta.rarityLabel}</p>
        <p className="gx-t-body">{meta.rule}</p>
        <p className="gx-t-strong">{features.loading ? 'Loading…' : earnedText(earned?.count ?? 0)}</p>
      </div>
      {earned?.lines.length ? <ul className="gx-fx-lines" aria-label={`When ${meta.name} was earned`}>{earned.lines.map((line, index) => <li key={line} className="gx-t-body gx-c-2"><BadgeLine parts={earned.parts[index]}/></li>)}</ul> : null}
    </Sheet>
  );
}
