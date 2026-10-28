// One badge line with its game as marks (D-62): "Week 6 · [SEA] @ [DEN] · Total 41 exact". `parts` is badgeParts()
// from model.js; without a game (Never Missed, Perfect Week, Hot Hand) the line is words only. Screen readers hear
// "Week 6 · Seattle Seahawks at Denver Broncos · Total 41 exact".
import { Fragment } from 'react';
import { Matchup } from '../ui/index.js';
import { SEP } from '../format.js';

export function BadgeLine({ parts }) {
  const items = [parts.week, parts.game ? <Matchup away={parts.game.away} home={parts.game.home}/> : null, parts.detail].filter(Boolean);
  return items.map((item, index) => <Fragment key={index}>{index ? SEP : null}{item}</Fragment>);
}
