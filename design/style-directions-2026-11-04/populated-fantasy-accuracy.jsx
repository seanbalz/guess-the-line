import React from 'react';
import {summarizeReview} from '../../shared/fantasy-review.mjs';
import {formatFantasyNumber as number,SCORING_OPTIONS} from '../../shared/fantasy-rankings.mjs';
import {FantasyReport} from '../../web/src/next/fantasy/FantasyReport.jsx';
import {reportModel} from '../../web/src/next/fantasy/fantasyReport.js';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {fmtFull} from '../../web/src/next/format.js';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {teamName} from '../../web/src/next/ui/Matchup.jsx';

export function FantasyAccuracy({model,settings}){
 const review=model.review,scoringLabel=SCORING_OPTIONS.find(o=>o.value===settings.scoring).label,nativeReport=reportModel(review,settings,scoringLabel),summary=summarizeReview(review,settings);
 const players=new Map(review.players.map(p=>[p.id,p]));
 const visualMiss=row=>{const player=players.get(row.id);return {...row,title:<span className="real-fantasy-miss-name" data-miss-player={row.id}><TeamMark code={player.team} name={teamName(player.team)} size={32}/><span>{row.title}</span></span>,meta:row.meta.slice(player.team.length+1)};};
 const report={...nativeReport,overs:nativeReport.overs.map(visualMiss),unders:nativeReport.unders.map(visualMiss)};
 const paired=summary.byPosition.filter(p=>p.pairedMae!==null&&p.baselineMae!==null),scale=Math.max(1,Math.ceil(Math.max(0,...paired.flatMap(p=>[p.pairedMae,p.baselineMae]))/5)*5);
 return <div className="real-fantasy-accuracy">
  <div className="real-fantasy-section-head"><h3>Week {review.week} accuracy report</h3><InfoButton title="About the accuracy report" body={[...report.fine,'Displayed values are rounded; comparisons use the original unrounded errors.',`Estimates published ${fmtFull(review.estimate.generatedAt)}. Review updated ${fmtFull(review.generatedAt)}.`]} links={[{text:'Published review',url:model.reviewSource.file},{text:'Original Week '+review.week+' estimates',url:model.reviewSource.estimate.url}]}/></div>
  <p className="real-context">Published Week {review.week} estimates vs recorded results · {scoringLabel}</p>
  <FantasyReport report={report}/>
  <section className="real-fantasy-error-chart" aria-label="Paired error by position">
   <h3>GTL vs season average</h3><p className="real-context">Mean absolute error · lower is closer<br/>Same players with a baseline · 0–{scale} points</p>
   <div className="real-fantasy-error-legend"><span>GTL</span><span>Season average</span></div>
   {paired.map(p=><div className="real-fantasy-error-position" key={p.position} data-error-position={p.position}><div className="real-fantasy-error-label"><strong>{p.position}</strong><span>{p.graded} graded</span></div>{[['GTL',p.pairedMae],['Season average',p.baselineMae]].map(([label,value])=><div className={'real-fantasy-error-bar'+(label==='GTL'?' is-gtl':'')} key={label}><span className="gx-sr-only">{label}</span><span className="real-fantasy-error-track" aria-hidden="true"><span style={{width:`${100*value/scale}%`}}/></span><b>{number(value)}</b></div>)}</div>)}
  </section>
  <p className="real-source">{review.status} · Missing actual-stat rows are excluded, never scored as zero.<br/>Figures are rounded; baseline comparisons use full precision.<br/><a href={model.reviewSource.file} target="_blank" rel="noopener">Public Week {review.week} review · nflverse · CC BY 4.0</a></p>
 </div>;
}
