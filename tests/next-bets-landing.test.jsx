import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BetsSummary } from '../web/src/next/bets/BetsSummary.jsx';
import { BetChangeHistory } from '../web/src/BetChangeHistory.jsx';
import { trackedOverview } from '../web/src/trackedBetTerms.js';

vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), date: value => value }));

const me='00000000-0000-4000-8000-000000000003';
const entry=(id,ownerId,extra={})=>({id,ownerId,origin:'tracked',kind:'single',outcome:'win',countsForRecord:true,stakeUnits:1,odds:100,netUnits:1,legs:[{market:'prop',selection:'Fixture 30+ yards'}],...extra});
const read=entries=>({loading:false,error:null,model:trackedOverview({entries,chart:entries.map((e,i)=>({entryId:e.id,ownerId:e.ownerId,netUnits:e.netUnits,at:`2026-11-0${i+1}T18:00:00Z`}))},{actorId:me})});

describe('approved Bets landing summary',()=>{
 it('uses owner-only included tracked records and excludes virtual, foreign and excluded returns',()=>{
  const html=renderToStaticMarkup(<BetsSummary read={read([entry('one',me),entry('two',me,{outcome:'loss',netUnits:-1}),entry('excluded',me,{countsForRecord:false,netUnits:200}),entry('virtual',me,{origin:'virtual',netUnits:300}),entry('foreign','other',{netUnits:400})])}/>);
  expect(html).toContain('Your tracked bets');expect(html).toContain('0U');expect(html).not.toContain('200U');expect(html).not.toContain('300U');expect(html).not.toContain('400U');expect(html).toContain('2 settled tickets');expect(html).toContain('Move along the line · Your tracked bets');
 });
 it('does not manufacture a chart or zero profit for an unknown return',()=>{
  const html=renderToStaticMarkup(<BetsSummary read={read([entry('unknown',me,{odds:null,netUnits:null})])}/>);
  expect(html).toContain('—');expect(html).not.toContain('type="range"');
 });
 it('keeps loading and failed reads distinct from an empty record',()=>{
  expect(renderToStaticMarkup(<BetsSummary read={{loading:true}}/>)).toContain('Loading your tracked bets');
  const html=renderToStaticMarkup(<BetsSummary read={{error:Object.assign(new Error('Fixture unavailable'),{status:503}),retry:()=>{}}}/>);
  expect(html).toContain('Fixture unavailable');expect(html).toContain('Try again');expect(html).not.toContain('Settled');
 });
});
describe('native saved history',()=>{
 it('shows exact before/after source, notes, timestamps and decimal stakes without inventing a missing price',()=>{
  const before={outcome:'pending',stakeUnits:.01,source:null,notes:'Before',quotedAt:null,placedAt:null,odds:null,legs:[{locked:true,selection:'Secret selection',line:9.5}]};
  const after={...before,stakeUnits:.11,source:'Manually entered book',notes:'After',quotedAt:'2026-11-04T12:00:00Z',placedAt:'2026-11-04T13:00:00Z'};
  const html=renderToStaticMarkup(<BetChangeHistory events={[{action:'correct',reason:'Exact correction',before,after}]}/>);
  for(const value of ['Ticket correction','Source','Note','Quote observed','Bet placed','Before: Not entered','After: Manually entered book','0.01U risk','0.11U risk'])expect(html).toContain(value);
  expect(html).not.toContain('9.5');expect(html).not.toContain('-110');
 });
});
