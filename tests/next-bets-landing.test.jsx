// Main's approved Bets landing contracts (#495), on D-69 step 4's landing. Main's "Your tracked bets" and "Recommended"
// cards became the My bets and Recommended tiles: their numbers are pinned in tests/next-bets-landing.test.mjs
// (myBetsTile: owner-only included records, an unknown return is "—", loading and failure apart from empty;
// recommendedTile) and drawn in tests/next-bets-landing-ui.test.jsx. Kept here: the saved ticket history, the schedule
// identity and the teaser's selection rule (now betsModel.js teaserAssessment).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { teaserAssessment } from '../web/src/next/bets/betsModel.js';
import { scheduleTeam } from '../web/src/scheduleTeam.js';
import { BetChangeHistory } from '../web/src/BetChangeHistory.jsx';

vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), date: value => value }));

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
