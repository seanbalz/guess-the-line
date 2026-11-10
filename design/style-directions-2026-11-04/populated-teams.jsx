import React, {useRef, useState} from 'react';
import {PictureRow} from '../../web/src/next/ui/PictureRow.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {TeamView} from '../../web/src/next/teams/TeamView.jsx';
import {teamRows, nextGame, lastFive} from '../../web/src/next/teams/teamModel.js';
import {teamName} from '../../web/src/next/ui/Matchup.jsx';

export function TeamsBrowser({model,onSelection}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(null),root=useRef(null),saved=useRef(null);
 const rows=teamRows(model.teamSeason),shown=rows.filter(r=>`${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase()));
 function open(row,event){const scroll=root.current.closest('.screen');saved.current={scroll,top:scroll.scrollTop,opener:event.currentTarget};setSelected(row.code);onSelection({name:row.name,open:true});scroll.scrollTop=0;requestAnimationFrame(()=>root.current.querySelector('.real-team-back')?.focus({preventScroll:true}));}
 function close(){setSelected(null);onSelection({name:'Teams',open:false});requestAnimationFrame(()=>{saved.current?.opener.focus({preventScroll:true});if(saved.current)saved.current.scroll.scrollTop=saved.current.top;});}
 return <div className="real-team-browser" ref={root}>
  <section hidden={selected!==null} aria-label="Browse NFL teams">
   <p className="real-context">2026 season · Records through Nov 2</p>
   <div className="real-team-search"><label htmlFor="real-team-search">Find a team</label><input id="real-team-search" type="search" placeholder="Search all 32 teams" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <p className="real-team-count" role="status">{shown.length} of 32 teams</p>
   <ol className="gx-prows" aria-label="NFL teams">{shown.map(row=>{
    const next=nextGame(model.teamSeason.teams[row.code]);
    const form=lastFive(model.teamSeason.teams[row.code]);
    const meta=<span className="real-team-list-meta">{next?<span className="real-team-next">Next {next.home?'vs':'at'} <TeamMark code={next.opponent} size={24} decorative/><span className="gx-sr-only">{teamName(next.opponent)}</span></span>:null}<span className="real-game-form" role="list" aria-label={`${row.name}, last five completed games`}>{form.map(item=><span key={item.week} className={'is-'+item.result.toLowerCase()} role="listitem" aria-label={item.words}>{item.result}</span>)}</span></span>;
    return <li key={row.code}><PictureRow id={`real-team-${row.code}`} data-team={row.code} picture={<TeamMark code={row.code} size={32} decorative/>} title={row.name} meta={meta} value={row.record} word={row.word} tone={row.tone} ariaLabel={row.ariaLabel} onClick={event=>open(row,event)}/></li>;
   })}</ol>
   {!shown.length?<p className="real-context">No teams match this search. Try another name.</p>:null}
  </section>
  {selected?<section className="real-team-profile" aria-label={teamName(selected)}><button type="button" className="real-team-back" onClick={close}>← Back to Teams</button><p className="real-context">2026 season · Records through Nov 2</p><TeamView key={selected} season={model.teamSeason} code={selected}/></section>:null}
  <p className="real-source">Public snapshot · <a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a></p>
 </div>;
}
