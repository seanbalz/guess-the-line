import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { applyResearchCandidate, prepareResearchHistory, observableRows, completedSourceText } from '../../shared/trends-research-candidates.mjs';
import { researchRecord } from '../../shared/trends-research.mjs';
import * as T from '../../shared/trends.mjs';
import {TEAM_NAMES} from '../../shared/nfl-schedule.mjs';
import {parseScheduleCsv,teamSeason as buildTeamSeason} from '../../shared/team-records.mjs';
import { validateResearchIndex, validatePublicResearchSnapshot } from '../../shared/research-data.mjs';
const base='.local/data-inventory-20261105/',out='design/style-directions-2026-11-04/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),index=JSON.parse(fs.readFileSync(base+'index.json'));
validateResearchIndex(index,2026,Date.now());
const datasets=Object.fromEntries(index.files.map(f=>{const bytes=fs.readFileSync(base+f.file);if(hash(bytes)!==f.sha256)throw Error('Bad public asset hash');const data=JSON.parse(zlib.gunzipSync(bytes));validatePublicResearchSnapshot(data,{season:2026,period:f.period,now:Date.now()});return[f.period,data];}));
const data=datasets.season,csv=fs.readFileSync(base+'games.csv','utf8');
const completedHash=hash(completedSourceText(observableRows(csv,index.generatedAt)));
if(completedHash!==index.source.completedSha256)throw Error('Completed source changed; do not mix evidence');
const venues=JSON.parse(fs.readFileSync('shared/nfl-venues.json')),corrections=JSON.parse(fs.readFileSync('shared/trends-corrections.json'));
const history=prepareResearchHistory(csv,{now:index.generatedAt,venues,corrections});
const target=data.targets.find(t=>t.id==='2026_09_ARI_SEA');if(!target)throw Error('Matchup missing');
const candidate=data.candidates.find(c=>c.preset.id==='home_ats|g:g_div'&&c.direction==='B');
if(!candidate||!applyResearchCandidate(candidate,target))throw Error('Situation not applicable');
function prepareTrend(c){
 if(!c)throw Error('Selected candidate missing');
 const pop=history.features.filter(g=>g.played&&g.season>=T.PERIODS.firstSeason&&(c.market==='spread'?g.spread!==null:g.total!==null));
 const known=pop.filter(g=>T.isRowMarket(c.preset.market)?[0,1].every(side=>c.preset.atoms.every(a=>typeof T.atomValue(a,g,side)==='boolean')):c.preset.atoms.every(a=>typeof T.atomValue(a,g)==='boolean'));
 const units=T.betUnits(c.preset,known,{rules:corrections.rules??{}});
 const records=units.map(u=>({gameId:u.g.id,date:u.g.eventAt,availableAt:u.g.availableAt,season:u.g.season,result:c.direction==='A'?u.res:-u.res,odds:c.direction==='A'?u.oa:u.ob}));
 const allRecord=researchRecord(records),expected=datasets.all.candidates.find(x=>x.id===c.id).periods.all.record;
 if(['sample','wins','losses','pushes','illustrativeUnits'].some(k=>allRecord[k]!==expected[k]))throw Error('Historical reconstruction differs from publication: '+c.id);
 const seasons=[...new Set(records.map(r=>r.season))].sort().map(season=>{const r=researchRecord(records.filter(r=>r.season===season));return{season,w:r.wins,l:r.losses,p:r.pushes,units:r.illustrativeUnits};});
 const periods=Object.fromEntries(Object.entries(datasets).map(([period,snapshot])=>{const p=snapshot.candidates.find(x=>x.id===c.id).periods[period];return[period,{record:p.record,series:{...p.series,points:p.series.points.map(x=>({...x,from:new Date(x.from).toISOString(),to:new Date(x.to).toISOString()}))}}];}));
 return{id:c.id,title:c.title,market:c.market,family:c.family,periods,seasons};
}
const trend=prepareTrend(candidate),periods=trend.periods,seasons=trend.seasons,allRecord=periods.all.record;
// Fixed category/side choices for visual variety; never ranked or selected from returns.
const selection=[
 ['home_ats|g:g_div','B','Divisional road teams','Road team ATS'],
 ['team_ats|t:t_off_loss','A','After a loss','Back the team ATS'],
 ['home_ats|g:g_nondiv','A','Non-divisional home teams','Home team ATS'],
 ['total|g:g_div','A','Divisional overs','Over the total'],
 ['total|g:g_prime','B','Primetime unders','19:00 ET or later'],
 ['total|g:g_indoor','A','Indoor overs','Over the total'],
];
const trendList=selection.map(([id,direction,displayTitle,context])=>({...prepareTrend(data.candidates.find(c=>c.preset.id===id&&c.direction===direction)),displayTitle,context}));
function prepareTeam(code){const games=history.games.filter(g=>g.season===2026&&g.played&&(g.homeApp===code||g.awayApp===code));if(!games.length)throw Error('No finals for '+code);let w=0,l=0,t=0,pf=0,pa=0;const margins=games.map(g=>{const home=g.homeApp===code,scored=home?g.homeScore:g.awayScore,allowed=home?g.awayScore:g.homeScore,result=scored>allowed?'W':scored<allowed?'L':'T',opponent=home?g.awayApp:g.homeApp;pf+=scored;pa+=allowed;if(result==='W')w++;else if(result==='L')l++;else t++;return{week:g.week,margin:scored-allowed,result,label:`Week ${g.week} · ${result} ${scored}–${allowed} ${home?'vs':'at'} ${opponent}`,words:`Week ${g.week}: ${result} ${scored} to ${allowed} ${home?'versus':'at'} ${opponent}`};}).sort((a,b)=>a.week-b.week);return{code,name:TEAM_NAMES[code].split(' ').at(-1),record:t?`${w}–${l}–${t}`:`${w}–${l}`,pointsFor:pf/games.length,pointsAgainst:pa/games.length,games:games.length,margins};}
const teams=['ARI','SEA'].map(prepareTeam);
const boardGames=data.targets.filter(t=>t.week===9).map(t=>({id:t.id,season:t.season,week:t.week,date:t.date,kickoff:t.scheduledKickoff,away:t.awayApp,home:t.homeApp,playStatistics:data.playStatistics.find(g=>g.gameId===`${t.awayApp}-${t.homeApp}`&&g.week===t.week)?.teams})).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)||a.id.localeCompare(b.id));
if(boardGames.length!==15||boardGames.some(g=>!g.kickoff||g.playStatistics?.length!==2||g.playStatistics.some(t=>!t.sampleGames)))throw Error('Incomplete weekly board evidence');
const boardTeams=[...new Set(boardGames.flatMap(g=>[g.away,g.home]))].sort().map(prepareTeam);
// Original shared team-season builder: only known finals plus redacted published schedules.
const completedIds=new Set(history.games.filter(g=>g.season===2026&&g.gameType==='REG'&&g.played).map(g=>g.id));
const completedTeamRows=parseScheduleCsv(csv).filter(r=>completedIds.has(r.game_id));
const easternTime=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const scheduledTeamRows=data.targets.map(t=>({game_id:t.id,season:String(t.season),game_type:t.gameType,week:String(t.week),away_team:t.awayApp,home_team:t.homeApp,away_score:'',home_score:'',location:t.fileNeutral?'Neutral':'Home',gameday:t.date,gametime:t.scheduledKickoff?easternTime.format(new Date(t.scheduledKickoff)):''}));
const teamSeason={...buildTeamSeason([...completedTeamRows,...scheduledTeamRows],{season:2026}),updatedAt:index.generatedAt,stale:true,fallback:false,source:{name:'nflverse public snapshot',url:'https://github.com/seanbalz/guess-the-line/releases/tag/research-data-2026',credit:`nflverse (Lee Sharpe) · CC BY 4.0 · public snapshot; finals through ${index.source.latestCompleted}`}};
if(Object.keys(teamSeason.teams).length!==32||teamSeason.finals!==completedIds.size||Object.values(teamSeason.teams).some(t=>t.games.length!==17))throw Error('Incomplete team season');
for(const t of boardTeams){const n=teamSeason.teams[t.code],r=n.overall,record=r.t?`${r.w}–${r.l}–${r.t}`:`${r.w}–${r.l}`;if(record!==t.record||n.pointsFor/t.games!==t.pointsFor||n.pointsAgainst/t.games!==t.pointsAgainst)throw Error('Team source mismatch '+t.code);}
const play=data.playStatistics.find(g=>g.gameId==='ARI-SEA'&&g.week===9);if(!play||play.teams.some(t=>!t.sampleGames))throw Error('No observed team statistics');
const model={version:1,checkedOn:'2026-11-05',generatedAt:index.generatedAt,latestCompleted:index.source.latestCompleted,source:{index:'https://github.com/seanbalz/guess-the-line/releases/download/research-data-2026/index.json',release:'https://github.com/seanbalz/guess-the-line/releases/tag/research-data-2026',schedule:'https://github.com/nflverse/nflverse-data/releases/tag/schedules',plays:'https://github.com/nflverse/nflverse-data/releases/tag/pbp',credit:'nflverse · Lee Sharpe · CC BY 4.0',completedHash,periodHashes:Object.fromEntries(index.files.map(f=>[f.period,f.sha256]))},matchup:{id:target.id,season:2026,week:target.week,date:target.date,away:target.away,home:target.home},trend:{...trend,application:applyResearchCandidate(candidate,target),qualification:candidate.qualification.label},trendList,registeredCandidateCount:data.candidates.length,teams,boardGames,boardTeams,teamSeason,playStatistics:play.teams,market:{mode:'existing authenticated app route; no sportsbook values exported',url:'https://guess-the-line.pages.dev/'}};
fs.writeFileSync(out+'populated-research-data.json',JSON.stringify(model,null,2)+'\n');
const manifest=JSON.parse(fs.readFileSync(out+'visual-assets/sources.json')),sourceAssets=JSON.parse(fs.readFileSync('web/public/team-logos/sources.json')).assets;
for(const team of boardTeams){const source=sourceAssets[team.code];if(!source)throw Error('Missing registered mark '+team.code);const file=source.file;fs.copyFileSync('web/public/team-logos/'+file,out+'visual-assets/'+file);manifest.files=manifest.files.filter(f=>f.file!==file);manifest.files.push({file,original:'web/public/team-logos/'+file,sha256:hash(fs.readFileSync(out+'visual-assets/'+file)),sourceRecord:source});}
fs.mkdirSync(out+'team-logos',{recursive:true});
for(const [code,source] of Object.entries(sourceAssets)){const file='../team-logos/'+source.file;fs.copyFileSync('web/public/team-logos/'+source.file,out+'team-logos/'+source.file);manifest.files=manifest.files.filter(f=>f.file!==file);manifest.files.push({file,original:'web/public/team-logos/'+source.file,sha256:hash(fs.readFileSync(out+'team-logos/'+source.file)),sourceRecord:source});}
fs.writeFileSync(out+'visual-assets/sources.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({verifiedPeriods:Object.keys(periods),matchup:model.matchup,trend:candidate.title,fullSample:allRecord.sample,seasons:seasons.length,teams:teams.map(t=>({team:t.code,record:t.record,games:t.games})),sourceMatches:true,boardGames:boardGames.length,boardTeams:boardTeams.length,teamSeason:{teams:Object.keys(teamSeason.teams).length,finals:teamSeason.finals,throughWeek:teamSeason.throughWeek},list:trendList.map(t=>({id:t.id,record:t.periods.season.record.sample,seasons:t.seasons.length}))}));
