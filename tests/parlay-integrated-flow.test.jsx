import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readRetainedPropOffers, propOfferCandidates } from '../cloud/parlay-offer-candidates.mjs';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { buildWeeklyProps } from '../shared/parlay-research.mjs';
import { expireAssessments } from '../web/src/next/research/useAssessments.js';
vi.mock('../web/src/api.js',()=>({linesApi:vi.fn()}));
import ParlayLab from '../web/src/next/research/ParlayLab.jsx';
import { fixture, NOW, AT } from './fixtures/research-assessments.mjs';

// Synthetic named-book captures, never presented as live sportsbook data.
async function pipeline({ locked = false, stale = false } = {}) {
  const f = fixture();
  const board = {...f.board, games: [f.board.games[0], {...f.board.games[0], id:'DAL-PHI', total:{visible:!locked}}]};
  const quotes = board.games.map((g,i)=>({...f.quote, gameId:g.id, observedAt:stale?'2026-10-30T18:00:00Z':AT,
    selection:{...f.quote.selection, playerId:`fixture-player-${i}`, playerName:`Synthetic Receiver ${i+1}`},
    book:'fanduel',source:'FanDuel',odds:i?-115:-110}));
  // Retained alternatives let the weekly board choose each individual price.
  quotes.push({...quotes[0],book:'draftkings',source:'DraftKings',odds:105}, {...quotes[1],book:'betmgm',source:'BetMGM',odds:100});
  const retained = await readRetainedPropOffers({retainedResearchQuotes:async()=>board.games.map(g=>({game_id:g.id,markets:['player_reception_yds'],status:'finished',error:null,quote_payload:quotes.filter(q=>q.gameId===g.id)}))},board,NOW);
  const research={generatedAt:AT,source:{stats:{url:'https://example.org/fixture-stats',sha256:'a'.repeat(64)}},games:board.games.map((g,i)=>({gameId:g.id,players:[{playerId:`fixture-player-${i}`,playerName:`Synthetic Receiver ${i+1}`,markets:[{key:'player_reception_yds',unit:'yards',baseline:{status:'available',projection:80,sample:8,trainingPeriod:{from:'2026-09-01T00:00:00Z',to:'2026-10-29T00:00:00Z'},holdout:{mae:24,count:3}}}]}]}))};
  return buildResearchAssessments({board,now:NOW,snapshot:{version:1,season:2026,week:8,generatedAt:AT,sources:[],candidates:propOfferCandidates(retained.quotes,research,NOW),quotes:retained.quotes}});
}
describe('integrated retained capture → weekly research → individual prop contract',()=>{
  it('renders retained individually priced props without requiring a common book',async()=>{
    const data=await pipeline();
    const props=buildWeeklyProps(data.assessments,{now:NOW});
    expect(props).toHaveLength(2);
    expect(props.map(a=>a.quote.book).sort()).toEqual(['betmgm','draftkings']);
    expect(props.map(a=>a.quote.odds).sort((a,b)=>a-b)).toEqual([100,105]);
    const html=renderToStaticMarkup(<ParlayLab data={data} onOpen={()=>{}}/>);
    expect((html.match(/class="gx-weekly-prop"/g)||[]).length).toBe(2);
    for(const text of ['DraftKings','BetMGM','+105','+100','Why this prop','Risk to watch','fixture-stats'])expect(html).toContain(text);
  });
  it('never generates a suggestion from hidden or stale lines',async()=>{
    expect(buildWeeklyProps((await pipeline({locked:true})).assessments,{now:NOW})).toHaveLength(1);
    expect(buildWeeklyProps((await pipeline({stale:true})).assessments,{now:NOW})).toEqual([]);
  });
  it('removes alternate book offers and ranked props at expiry as server-relative time advances',async()=>{
    const data=expireAssessments(await pipeline(),3600000);
    expect(data.assessments.every(a=>a.quote===null&&a.offers.length===0)).toBe(true);
    expect(buildWeeklyProps(data.assessments,{now:Date.parse(data.now)})).toEqual([]);
  });
});
