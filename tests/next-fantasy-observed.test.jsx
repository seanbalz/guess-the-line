import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ObservedPlayers } from '../web/src/next/fantasy/ObservedPlayers.jsx';
import { scoringRules } from '../shared/fantasy-rankings.mjs';
const zero = Object.fromEntries(scoringRules({scoring:'ppr',passingTds:4}).offense.map(rule => [rule.key,0]));
const snapshot = { statsThroughWeek: 3, players: [
 { id:'zero', name:'Zero Player', team:'SEA', position:'WR', history:[{week:1,...zero}], weekly:{stats:{receptions:99},status:'bye'} },
 { id:'unknown', name:'Unknown Player', team:'DEN', position:'QB', history:[] },
], matchups:{} };
const render = (extra={}) => renderToStaticMarkup(<ObservedPlayers snapshot={snapshot} settings={{scoring:'ppr',passingTds:4}} filters={{search:'',position:'ALL'}} onFilter={()=>{}} compareIds={[]} onProfile={()=>{}} onCompare={()=>{}} {...extra}/>);
describe('observed Fantasy browse',()=>{
 it('lists recorded players without ranking or an estimate, retains zero and exposes actual samples',()=>{
  const html=render(); expect(html).toContain('Zero Player'); expect(html).not.toContain('Unknown Player');
  expect(html).toContain('pts / game'); expect(html).toContain('Observed production'); expect(html).toContain('Last 3 weeks');
  expect(html).not.toContain('est. pts'); expect(html).not.toContain('rank'); expect(html).toContain('Usage &amp; production: Zero Player');
  expect(html).toContain('0.0'); expect(html).toContain('Week 2: bye');
 });
 it('searches actual roster names, teams and positions without depending on estimates',()=>{
  expect(render({filters:{search:'DEN',position:'ALL'}})).toContain('No recorded players match');
  expect(render({filters:{search:'SEA',position:'WR'}})).toContain('Zero Player');
  expect(render({filters:{search:'SEA',position:'QB'}})).toContain('No recorded players match');
 });
});
