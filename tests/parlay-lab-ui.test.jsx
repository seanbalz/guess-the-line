import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ParlayLab from '../web/src/next/research/ParlayLab.jsx';
import PropModelPanels from '../web/src/next/research/PropModelPanels.jsx';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { fixture, NOW } from './fixtures/research-assessments.mjs';
const render=data=>renderToStaticMarkup(<ParlayLab data={data} renderDetail={()=> <p>Evidence detail</p>} onOpen={()=>{}}/>);
describe('price-first Parlay Lab',()=>{
 it('defaults to ideas, with deliberate projection and matchup destinations',()=>{
   const html=render(buildResearchAssessments({...fixture(),now:NOW}));
   for(const text of ['Parlay Lab','Ideas','Projections','Matchups','Suggested parlays','Why it fits','Risk to watch'])expect(html).toContain(text);
   expect(html).not.toContain('78.4');
   expect(html).not.toContain('Schedule order');
   expect(html.indexOf('Suggested parlays')).toBeLessThan(html.indexOf('Individual prop research'));
 });
 it('gives honest empty state instead of counterfeit priced picks',()=>{
   const html=render({now:new Date(NOW).toISOString(),assessments:[]});
   expect(html).toContain('No ready-to-review ticket yet');
   expect(html).toContain('Current sportsbook prop lines are unavailable');
   expect(html).not.toContain('Synthetic Receiver');
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
