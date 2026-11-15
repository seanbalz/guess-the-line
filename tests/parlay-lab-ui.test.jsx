import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ParlayLab from '../web/src/next/research/ParlayLab.jsx';
import PropModelPanels from '../web/src/next/research/PropModelPanels.jsx';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { fixture, NOW } from './fixtures/research-assessments.mjs';
const render=data=>renderToStaticMarkup(<ParlayLab data={data} renderDetail={()=> <p>Evidence detail</p>} onOpen={()=>{}}/>);
describe('weekly props board',()=>{
 it('defaults to individual props with projection and matchup destinations',()=>{
   const html=render(buildResearchAssessments({...fixture(),now:NOW}));
   for(const text of ['Weekly props','Top props','Projections','Matchups','Why this prop','Risk to watch','How these are ranked'])expect(html).toContain(text);
   expect(html).not.toContain('78.4');
   expect(html).not.toContain('Schedule order');
   expect(html).not.toContain('Ticket size');
   expect(html).not.toContain('Suggested parlays');
 });
 it('gives honest empty state instead of counterfeit priced picks',()=>{
   const html=render({now:new Date(NOW).toISOString(),assessments:[]});
   expect(html).toContain('No eligible props right now');
   expect(html).toContain('Fresh sportsbook lines and sourced supporting research are required');
   expect(html).not.toContain('Synthetic Receiver');
 });
 it('shows up to twenty individually priced props with sources rather than bundled legs',()=>{
   const data=buildResearchAssessments({...fixture(),now:NOW});
   const a=data.assessments.find(a=>a.selection.market==='prop');
   data.assessments=Array.from({length:25},(_,i)=>({...a,id:`prop-${i}`,routeId:`prop-${i}`,selection:{...a.selection,playerId:`player-${i}`,playerName:`Player ${i}`}}));
   const html=render(data);
   expect((html.match(/class="gx-weekly-prop"/g)||[]).length).toBe(20);
   expect(html).toContain('DraftKings'); expect(html).toContain('Recorded');
   expect(html).toContain('https://x.com/rotobot_ai/status/1000001');
   expect(html).toContain('not win probability');
 });
 it('does not promote ineligible evidence',()=>{
   const data=buildResearchAssessments({...fixture(),now:NOW});
   data.assessments.forEach(a=>a.evidence.forEach(e=>{e.eligible=false;e.statement='UNVERIFIED CLAIM';}));
   expect(render(data)).not.toContain('UNVERIFIED CLAIM');
 });
 it('renders locked games with actionable explanation',()=>{
   expect(render({now:new Date(NOW).toISOString(),assessments:[],coverage:{games:[{closed:false,spreadAccessible:false,totalAccessible:false}]}})).toContain('Lock both Spread and Total');
 });
 it('does not render projections in matchup mode',()=>{
   const html=renderToStaticMarkup(<PropModelPanels research={null} assessments={[]} category="All props" view="matchups"/>);
   expect(html).toContain('Matchup spotlight');expect(html).not.toContain('Player projections');expect(html).toContain('Matchup rankings unavailable');
 });
});
