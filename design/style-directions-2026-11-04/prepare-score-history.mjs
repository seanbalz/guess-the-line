// Reproducible public historical examples. Never read player ballots or current gated markets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {observableRows,completedSourceText} from '../../shared/trends-research-candidates.mjs';
import {appCode,easternToUtc,TEAM_NAMES} from '../../shared/nfl-schedule.mjs';
import {accuracy,validatePrediction} from '../../server/domain.mjs';
const base='.local/data-inventory-20261105/',out='design/style-directions-2026-11-04/';
const index=JSON.parse(fs.readFileSync(base+'index.json','utf8')),csv=fs.readFileSync(base+'games.csv','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const rows=observableRows(csv,index.generatedAt),fingerprint=hash(completedSourceText(rows));
if(fingerprint!==index.source.completedSha256)throw Error('Completed public records do not match the verified publication');
const patterns={6:[1,2,0,-.5,1.5,3,-2,0,4,-1.5,2.5,.5,-3,1],7:[0,.5,-1,2,-.5,1.5,-2.5,5,-3,.5,0,1,-1.5,3.5],8:[0,.5,1,-1.5,5,2,-.5,3,1,-2,0,.5,2.5,-1]};
const viewer='visual-example';
const weeks=[6,7,8].map(week=>{
 const source=rows.filter(r=>r.season==='2026'&&r.game_type==='REG'&&Number(r.week)===week).sort((a,b)=>(a.gameday+' '+a.gametime).localeCompare(b.gameday+' '+b.gametime)||a.game_id.localeCompare(b.game_id));
 if(source.length!==14||source.some(r=>r.spread_line===''||r.total_line===''))throw Error('Expected 14 complete recorded games and historical references');
 const games=source.map(r=>({id:r.game_id,awayCode:appCode(r.away_team),homeCode:appCode(r.home_team),awayName:TEAM_NAMES[appCode(r.away_team)],homeName:TEAM_NAMES[appCode(r.home_team)],kickoff:easternToUtc(r.gameday,r.gametime),recordedFinal:{away:Number(r.away_score),home:Number(r.home_score)}}));
 if(games.some(g=>!g.awayName||!g.homeName))throw Error('Unknown historical team after native code normalization');
 const entries=['guess_spread','guess_total'].map(mode=>{
  const picks=source.map((r,i)=>{
   // nflverse spread_line describes the home winning margin; GTL's home-referenced spread has the opposite sign.
   const reference=mode==='guess_spread'?-Number(r.spread_line):Number(r.total_line);
   const offset=patterns[week][mode==='guess_spread'?i:source.length-1-i]+(mode==='guess_total'&&i%4===0?.5:0);
   const guess=validatePrediction(mode,reference+offset);
   return{gameId:r.game_id,guess,lockedIn:true,points:accuracy(guess,reference),reference:{status:'historical_example',value:reference,source:'nflverse recorded historical closing line',rule:'visual_example_only'}};
  });
  return{userId:viewer,mode,status:'submitted',eligible:true,scoreTiming:'example',weekPoints:picks.reduce((n,p)=>n+p.points,0),picks};
 });
 return{season:2026,week,games,entries};
});
const data={version:1,prepared:'2026-11-05',kind:'PUBLIC_HISTORICAL_SCORE_EXAMPLES',notice:'Sample guesses and calculated example scores against recorded historical closing lines. Not a saved player scoring history.',source:{definition:'https://nflverse.r-universe.dev/nflfastR/nflfastR.pdf#page=27',release:'https://github.com/seanbalz/guess-the-line/releases/tag/research-data-2026',schedule:'https://github.com/nflverse/nflverse-data/releases/tag/schedules',file:'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',publicationGeneratedAt:index.generatedAt,completedSha256:fingerprint,credit:'nflverse · Lee Sharpe · CC BY 4.0',referenceMeaning:'Recorded historical closing lines; not verified submission-time references, current quotes or three-book consensus. No observation/save timestamps or sportsbook identities are fabricated.'},history:{viewer,season:2026,seasons:[2026],weeks},patterns};
fs.writeFileSync(out+'score-history-data.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({completedSourceSha256:fingerprint,weeks:weeks.map(w=>({week:w.week,games:w.games.length,spread:w.entries[0].weekPoints,total:w.entries[1].weekPoints})),privateRows:0}));
