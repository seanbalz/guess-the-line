// Fictional League examples only. Reuse the reviewed historical score fixture; never read accounts or live posts.
import fs from 'node:fs';
import {accuracy} from '../../server/domain.mjs';
import {boardFor} from '../../shared/guess-board.mjs';
const out='design/style-directions-2026-11-04/',score=JSON.parse(fs.readFileSync(out+'score-history-data.json','utf8')),research=JSON.parse(fs.readFileSync(out+'populated-research-data.json','utf8'));
if(score.kind!=='PUBLIC_HISTORICAL_SCORE_EXAMPLES'||score.source.completedSha256!=='48fbdd6f9f63ffcc0a0322dd7f5b22fa0faa0303874f21200baebff5d30831df')throw Error('Expected the reviewed historical score source.');
const names=['Alex Lane','Jordan Taylor','Casey Reed','Morgan Park','Riley Stone','Sam Rivera','Cameron Wells','Avery Cole','Taylor Brooks'];
const members=names.map((displayName,i)=>({id:`demo-member-${i}`,displayName})),viewer=members[0].id;
const patterns=[null,[0,.5,0,1,.5,0,.5,1,0,.5,0,1,.5,1],[0,1,.5,1,.5,1,.5,1,.5,1,.5,1,.5,1],[0,1,.5,1,.5,1,.5,1,.5,1,.5,1,.5,1],[0,.5,1,1.5,1,1,1.5,2,.5,1.5,0,2,1,1],[1,.5,2,1,2,1.5,1.5,2,1,1.5,1,2,.5,2],Array(14).fill(1.5),Array(14).fill(6),null];
const standings=[],examplePicks=new Map();
for(const mode of ['guess_spread','guess_total'])for(let member=0;member<members.length-1;member++){
 const weeks=score.history.weeks.map(w=>{const entry=w.entries.find(e=>e.mode===mode);const picks=entry.picks.map((p,i)=>{
  const offset=patterns[member]?.[i]+(mode==='guess_total'&&i%5===0?.5:0);
  const guess=member===0?p.guess:p.reference.value+offset;
  return{...p,guess,points:accuracy(guess,p.reference.value)};
 });examplePicks.set(`${member}:${w.week}:${mode}`,picks);return{week:w.week,points:picks.reduce((sum,p)=>sum+p.points,0),games:picks.length};});
 standings.push({userId:members[member].id,mode,seasonPoints:weeks.reduce((sum,w)=>sum+w.points,0),seasonScored:weeks.reduce((sum,w)=>sum+w.games,0),weekPoints:weeks.at(-1).points,weekScored:weeks.at(-1).games});
}
const pointsTotals=[97.5,104,101,101,99,98.5,98,0,null],pointsWeek=[32.5,36,34,34,33,31,32.7,0,null];
const pointsRanked=boardFor({viewer,members,mode:'guess_spread',standings:pointsTotals.flatMap((n,i)=>n===null?[]:[{userId:members[i].id,mode:'guess_spread',seasonPoints:n,seasonScored:3}])});
const points={standings:{season:members.map((m,i)=>({...m,userId:m.id,points:pointsTotals[i],rank:pointsRanked.find(r=>r.id===m.id)?.rank??null,tied:pointsRanked.find(r=>r.id===m.id)?.tied??false,weeksPlayed:pointsTotals[i]===null?0:3})).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.displayName.localeCompare(b.displayName)),week:members.map((m,i)=>({userId:m.id,displayName:m.displayName,points:pointsWeek[i]}))},result:{house:{complete:true,points:29.7}}};
const old=score.history.weeks.find(w=>w.week===8),game=old.games.find(g=>g.id==='2026_08_BAL_BUF'),result=examplePicks.get('1:8:guess_spread').find(p=>p.gameId===game.id),own=examplePicks.get('0:8:guess_total').find(p=>p.gameId===game.id),rx=(counts={})=>({counts,total:Object.values(counts).reduce((a,b)=>a+b,0),mine:null});
const posts=[
 {id:'demo-result',actorId:members[1].id,kind:'result_shared',season:2026,week:8,mode:'guess_spread',createdAt:'2026-11-03T21:45:00Z',embed:{visible:true,gameId:'BAL-BUF',pick:result.guess,points:result.points,reference:result.reference.value,game},reactions:rx({fire:3,thumbs_up:2}),commentCount:2,comments:[{id:'demo-c1',userId:members[2].id,body:'That was close to the line.'},{id:'demo-c2',userId:members[4].id,body:'The gap chart makes that easy to read.'}]},
 {id:'demo-picks-casey',actorId:members[2].id,kind:'ballot_submitted',season:2026,week:9,mode:'guess_spread',createdAt:'2026-11-03T21:15:00Z',embed:{hiddenGames:['ARI-SEA','JAX-BAL']},reactions:rx(),commentCount:0,comments:[]},
 {id:'demo-picks-morgan',actorId:members[3].id,kind:'ballot_submitted',season:2026,week:9,mode:'guess_total',createdAt:'2026-11-03T21:05:00Z',embed:{hiddenGames:['ARI-SEA']},reactions:rx(),commentCount:0,comments:[]},
 {id:'demo-joined',actorId:members[8].id,kind:'joined',createdAt:'2026-11-03T20:30:00Z',reactions:rx({clap:2}),commentCount:1,comments:[{id:'demo-c3',userId:members[0].id,body:'Welcome to the league!'}]},
 {id:'demo-own-result',actorId:viewer,kind:'result_shared',season:2026,week:8,mode:'guess_total',createdAt:'2026-11-02T23:00:00Z',embed:{visible:true,gameId:'BAL-BUF',pick:own.guess,points:own.points,reference:own.reference.value,game},reactions:rx({thumbs_up:1}),commentCount:0,comments:[]},
 {id:'demo-week',actorId:'demo-system',kind:'week_published',season:2026,week:9,createdAt:'2026-11-02T08:00:00Z',embed:{games:research.boardGames.length,deadline:research.boardGames.map(g=>g.kickoff).sort()[0]},reactions:rx(),commentCount:0,comments:[]},
 {id:'demo-kickoff',actorId:'demo-system',kind:'kickoff',season:2026,week:8,createdAt:game.kickoff,embed:{kickoff:game.kickoff,games:[{gameId:'BAL-BUF',game,in:[viewer,members[1].id,members[2].id],bets:0}]},reactions:rx({clap:1}),commentCount:0,comments:[]}
];
const model={version:1,prepared:'2026-11-06',kind:'FICTIONAL_LEAGUE_VISUAL_PREVIEW',notice:'Fictional members, standings, posts, reactions, comments and demo times. Not a live league or account activity.',name:'Example Community',viewer,members,standings,points,posts,now:'2026-11-03T22:00:00Z',week:8,season:2026,source:score.source,sourceMeaning:'Spread/Total examples are calculated from reviewed public Weeks 6–8 closing references and fictional guesses. Points/House totals are fictional demonstration values. Hidden-pick embeds contain no guesses or reference values.'};
fs.writeFileSync(out+'league-preview-data.json',JSON.stringify(model,null,2)+'\n');
console.log(JSON.stringify({fictionalMembers:members.length,posts:posts.length,ranks:boardFor({...model,mode:'guess_spread'}).map(r=>({name:r.name,rank:r.rank,points:r.points})),liveReads:0}));
