import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readRetainedPropOffers, propOfferCandidates } from '../cloud/parlay-offer-candidates.mjs';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { buildParlayIdeas } from '../shared/parlay-research.mjs';
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
  // Different best books must not erase the common FanDuel combination.
  quotes.push({...quotes[0],book:'draftkings',source:'DraftKings',odds:105}, {...quotes[1],book:'betmgm',source:'BetMGM',odds:100});
  const retained = await readRetainedPropOffers({retainedResearchQuotes:async()=>board.games.map(g=>({game_id:g.id,markets:['player_reception_yds'],status:'finished',error:null,quote_payload:quotes.filter(q=>q.gameId===g.id)}))},board,NOW);
  const research={generatedAt:AT,source:{stats:{url:'https://example.org/fixture-stats',sha256:'a'.repeat(64)}},games:board.games.map((g,i)=>({gameId:g.id,players:[{playerId:`fixture-player-${i}`,playerName:`Synthetic Receiver ${i+1}`,markets:[{key:'player_reception_yds',unit:'yards',baseline:{status:'available',projection:80,sample:8,trainingPeriod:{from:'2026-09-01T00:00:00Z',to:'2026-10-29T00:00:00Z'},holdout:{mae:24,count:3}}}]}]}))};
  return buildResearchAssessments({board,now:NOW,snapshot:{version:1,season:2026,week:8,generatedAt:AT,sources:[],candidates:propOfferCandidates(retained.quotes,research,NOW),quotes:retained.quotes}});
}
describe('integrated retained capture → researched suggestion → mobile card contract',()=>{
  it('renders a real-offer-shaped two-leg same-book ticket with prices, reasons and risks',async()=>{
    const data=await pipeline();
    const ideas=buildParlayIdeas(data.assessments,{now:NOW});
    expect(ideas).toHaveLength(1);expect(ideas[0].book).toBe('fanduel');
    expect(ideas[0].legs.map(a=>a.quote.odds).sort((a,b)=>a-b)).toEqual([-115,-110]);
    expect(ideas[0].combinedOdds).toBeNull();expect(ideas[0].probability).toBeNull();
    const html=renderToStaticMarkup(<ParlayLab data={data} onOpen={()=>{}} renderDetail={()=>null}/>);
    for(const text of ['2-LEG IDEA','FanDuel','−110','−115','Why it fits','Risk to watch','Shortlist this idea','Not quoted'])expect(html).toContain(text);
  });
  it('never generates a suggestion from hidden or stale lines',async()=>{
    for(const options of [{locked:true},{stale:true}])expect(buildParlayIdeas((await pipeline(options)).assessments,{now:NOW})).toEqual([]);
  });
  it('removes alternate book offers and tickets at expiry as server-relative time advances',async()=>{
    const data=expireAssessments(await pipeline(),3600000);
    expect(data.assessments.every(a=>a.quote===null&&a.offers.length===0)).toBe(true);
    expect(buildParlayIdeas(data.assessments,{now:Date.parse(data.now)})).toEqual([]);
  });
});
