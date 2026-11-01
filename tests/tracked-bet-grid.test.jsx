import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TrackedBetRow} from '../web/src/next/bets/TrackedBetRow.jsx';
import {PlayerPropEntry} from '../web/src/PlayerPropEntry.jsx';
describe('selected roomy ticket preview and full grid',()=>{
 const legs=Array.from({length:6},(_,i)=>({gameId:'SEA-DEN',market:'prop',side:'yes',line:null,selection:`Sample Player ${i+1} anytime touchdown (1+)`}));
 const entry={kind:'parlay',legs,outcome:'pending',stakeUnits:.1,odds:1500,potentialReturnUnits:1.6,week:8,source:'Manual book'};
 it('starts with a closed preview and retains all full selections, preserving unknown cash when the unit is unknown',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={entry} games={[]}><p>Audit data</p></TrackedBetRow>);
  for(let i=1;i<=6;i++)expect(html).toContain(`Sample Player ${i}`);
  expect(html.match(/<li>/g)).toHaveLength(6);expect(html).toContain('aria-expanded="false"');expect(html).not.toContain('$');expect(html).toContain('0.1U');
  expect(html).toContain('aria-label="Expand 6-leg parlay"');expect(html).toContain('class="gx-tracked-expanded" hidden=""');
 });
 it('converts only display amounts using the explicit unit value and labels total return',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={entry} games={[]} unitCash={100}/>);
  expect(html).toContain('$10.00');expect(html).toContain('$160.00');expect(html).toContain('Includes stake');
 });
 it('shows exact milestone semantics and keeps unparsed custom text',()=>{
  const html=renderToStaticMarkup(<TrackedBetRow entry={{...entry,kind:'single',legs:[{...legs[0],selection:'Sample Runner 70+ rushing yards'}]}} games={[]}/>);
  expect(html).toContain('70+');expect(html).not.toContain('Over 70');
 });
 it('asks for the player once in guided entry while leaving older custom selections intact',()=>{
  const common={disabled:false,onChange:()=>{}};
  const fresh=renderToStaticMarkup(<PlayerPropEntry {...common} leg={{gameId:'SEA-DEN',market:'prop',side:'',selection:''}}/>);
  expect(fresh.match(/Player name/g)).toHaveLength(1);expect(fresh).not.toContain('Player and exact selection');
  const custom=renderToStaticMarkup(<PlayerPropEntry {...common} leg={{...legs[0],selection:'Original custom ticket'}}/>);
  expect(custom).toContain('Original custom ticket');
 });
});
