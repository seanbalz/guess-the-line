import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BetsSummary } from '../web/src/next/bets/BetsSummary.jsx';
import { TicketPreviews, teaserAssessment } from '../web/src/next/bets/BetsLandingCards.jsx';
import { scheduleTeam } from '../web/src/scheduleTeam.js';
import { BetChangeHistory } from '../web/src/BetChangeHistory.jsx';
import { trackedOverview } from '../web/src/trackedBetTerms.js';

vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({}), useSharedRead: () => ({}) }));
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

describe('native Bets closeout fields',()=>{
 it('previews real owner tickets with exact literals, exclusions, statuses and unknown-price wording',()=>{
  const html=renderToStaticMarkup(<TicketPreviews read={read([entry('open',me,{outcome:'pending',source:null,odds:null,legs:[{selection:'My literal ticket +9.5'}]}),entry('excluded',me,{countsForRecord:false,kind:'parlay',legs:[{selection:'A'},{selection:'B'}]}),entry('foreign','other',{legs:[{selection:'FOREIGN SENTINEL'}]})])} onOpen={()=>{}}/>);
  for(const text of ['My literal ticket +9.5','Pending','Book unknown','Odds unknown','aria-label="Open My literal ticket +9.5"','2-selection ticket','Excluded','Won','aria-label="View 2-selection ticket"'])expect(html).toContain(text);
  expect(html).not.toContain('FOREIGN SENTINEL');
 });
 it('expands only canonical schedule identity and preserves arbitrary labels',()=>{
  expect(scheduleTeam({away:'TB'},'away')).toEqual({code:'TB',name:'Tampa Bay Buccaneers'});
  expect(scheduleTeam({home:'Dallas Cowboys'},'home')).toEqual({code:'DAL',name:'Dallas Cowboys'});
  expect(scheduleTeam({away:'Custom Team +4.5'},'away')).toEqual({code:'',name:'Custom Team +4.5'});
 });
 it('never selects research for a locked market or closed game',()=>{
  const a={gameId:'TB-DAL',selection:{market:'total'}};
  const data={assessments:[a],coverage:{games:[{id:'TB-DAL',closed:false,spreadAccessible:true,totalAccessible:false}]}};
  expect(teaserAssessment(data)).toBeNull();data.coverage.games[0].totalAccessible=true;expect(teaserAssessment(data)).toBe(a);data.coverage.games[0].closed=true;expect(teaserAssessment(data)).toBeNull();
 });
});
