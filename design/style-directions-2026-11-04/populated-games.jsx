import React, {useState} from 'react';
import {MetaLine} from '../../web/src/next/ui/MetaLine.jsx';
import {fmtTime} from '../../web/src/next/format.js';

const zone='America/Los_Angeles';
const dayName=value=>new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).format(new Date(value));
const dayLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long',month:'short',day:'numeric'}).format(new Date(value));
function Form({team}){
 return <span className="real-game-form" role="list" aria-label={`${team.name}, last five completed games`}>{team.margins.slice(-5).map(m=><span key={m.week} className={'is-'+m.result.toLowerCase()} role="listitem" aria-label={m.words}>{m.result}</span>)}</span>;
}
function Team({team}){
 return <div className="real-game-team"><span className="real-game-logo"><img src={`visual-assets/${team.code.toLowerCase()}.png`} alt="" width="48" height="48"/></span><strong>{team.name}</strong><span className="real-game-record">{team.record}</span><Form team={team}/></div>;
}
export function GamesList({model,renderTeams}){
 const [day,setDay]=useState('All'),[opened,setOpened]=useState(null);
 const games=model.boardGames.filter(g=>day==='All'||dayName(g.kickoff)===day),teams=Object.fromEntries(model.boardTeams.map(t=>[t.code,t]));
 const groups=[...new Set(games.map(g=>g.date))];
 const scale=Math.ceil(Math.max(...model.boardTeams.map(t=>t.pointsFor))/5)*5;
 return <div className="real-games-list">
  <MetaLine parts={['Week 9',`${model.boardGames.length} games`,'Times PT']} className="real-game-meta"/>
  <p className="real-context">Records and form through Nov 2 · 2026 season</p>
  <div className="real-game-days" role="group" aria-label="Game day">{['All','Thu','Sun','Mon'].map(label=><button key={label} type="button" aria-pressed={day===label} onClick={()=>{setDay(label);setOpened(null);}}>{label}<span>{model.boardGames.filter(g=>label==='All'||dayName(g.kickoff)===label).length}</span></button>)}</div>
  <p className="real-game-count" role="status">{games.length} {games.length===1?'game':'games'} shown</p>
  {groups.map(group=>{
   const groupGames=games.filter(g=>g.date===group);
   return <section className="real-game-group" key={group} aria-label={dayLabel(groupGames[0].kickoff)}><h3>{dayLabel(groupGames[0].kickoff)}</h3><ul>{groupGames.map(game=>{
    const away=teams[game.away],home=teams[game.home],open=opened===game.id,control=`game-compare-${game.id}`;
    const url=`https://guess-the-line.pages.dev/#research/games?season=${game.season}&week=${game.week}&layer=game&item=${game.away}-${game.home}`;
    return <li className={'real-game-card'+(open?' is-open':'')} key={game.id} data-game={game.id}>
     <div className="real-game-time"><time dateTime={game.kickoff}>{fmtTime(game.kickoff)} PT</time><span>Week {game.week}</span></div>
     <div className="real-game-matchup" role="group" aria-label={`${away.name}, ${away.record}, at ${home.name}, ${home.record}`}><Team team={away}/><span className="real-game-at">at</span><Team team={home}/></div>
     <div className="real-game-scoring"><span className="real-game-scoring-title">Points scored / game</span>{[away,home].map(t=><div className="real-game-bar" key={t.code}><span>{t.name}</span><span className="real-game-track" aria-hidden="true"><span style={{width:`${100*t.pointsFor/scale}%`}}/></span><b>{t.pointsFor.toFixed(1)}</b></div>)}</div>
     <div className="real-game-actions"><button type="button" aria-expanded={open} aria-controls={control} onClick={()=>setOpened(open?null:game.id)}>{open?'Close stats':'Compare stats'} <span aria-hidden="true">{open?'−':'+'}</span></button><a href={url} target="_blank" rel="noopener" aria-label={`Open ${away.name} at ${home.name} game research in GTL`}>Research <span aria-hidden="true">↗</span></a></div>
     <div id={control} className="real-game-comparison" hidden={!open}>{open?renderTeams({teams:[away,home],playStatistics:game.playStatistics}):null}</div>
    </li>;
   })}</ul></section>;
  })}
  <p className="real-data-note">W/L/T chips show each team’s last five completed games. Scoring bars share a 0–{scale} points/game scale.</p>
  <p className="real-source">Public snapshot · <a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a><br/>Game research opens GTL with its existing account and market access rules.</p>
 </div>;
}
