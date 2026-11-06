import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { applyResearchCandidate, prepareResearchHistory, observableRows, completedSourceText } from '../../shared/trends-research-candidates.mjs';
import { researchRecord } from '../../shared/trends-research.mjs';
import * as T from '../../shared/trends.mjs';
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
const teams=['ARI','SEA'].map(code=>{const games=history.games.filter(g=>g.season===2026&&g.played&&(g.homeApp===code||g.awayApp===code));if(!games.length)throw Error('No finals for '+code);let w=0,l=0,t=0,pf=0,pa=0;const margins=games.map(g=>{const home=g.homeApp===code,scored=home?g.homeScore:g.awayScore,allowed=home?g.awayScore:g.homeScore,result=scored>allowed?'W':scored<allowed?'L':'T',opponent=home?g.awayApp:g.homeApp;pf+=scored;pa+=allowed;if(result==='W')w++;else if(result==='L')l++;else t++;return{week:g.week,margin:scored-allowed,result,label:`Week ${g.week} · ${result} ${scored}–${allowed} ${home?'vs':'at'} ${opponent}`,words:`Week ${g.week}: ${result} ${scored} to ${allowed} ${home?'versus':'at'} ${opponent}`};}).sort((a,b)=>a.week-b.week);return{code,name:code==='ARI'?'Cardinals':'Seahawks',record:t?`${w}–${l}–${t}`:`${w}–${l}`,pointsFor:pf/games.length,pointsAgainst:pa/games.length,games:games.length,margins};});
const play=data.playStatistics.find(g=>g.gameId==='ARI-SEA'&&g.week===9);if(!play||play.teams.some(t=>!t.sampleGames))throw Error('No observed team statistics');
const model={version:1,checkedOn:'2026-11-05',generatedAt:index.generatedAt,latestCompleted:index.source.latestCompleted,source:{index:'https://github.com/seanbalz/guess-the-line/releases/download/research-data-2026/index.json',release:'https://github.com/seanbalz/guess-the-line/releases/tag/research-data-2026',schedule:'https://github.com/nflverse/nflverse-data/releases/tag/schedules',plays:'https://github.com/nflverse/nflverse-data/releases/tag/pbp',credit:'nflverse · Lee Sharpe · CC BY 4.0',completedHash,periodHashes:Object.fromEntries(index.files.map(f=>[f.period,f.sha256]))},matchup:{id:target.id,season:2026,week:target.week,date:target.date,away:target.away,home:target.home},trend:{...trend,application:applyResearchCandidate(candidate,target),qualification:candidate.qualification.label},trendList,registeredCandidateCount:data.candidates.length,teams,playStatistics:play.teams,market:{mode:'existing authenticated app route; no sportsbook values exported',url:'https://guess-the-line.pages.dev/'}};
fs.writeFileSync(out+'populated-research-data.json',JSON.stringify(model,null,2)+'\n');
fs.copyFileSync('web/public/team-logos/ari.png',out+'visual-assets/ari.png');
const manifest=JSON.parse(fs.readFileSync(out+'visual-assets/sources.json'));manifest.files=manifest.files.filter(f=>f.file!=='ari.png');manifest.files.push({file:'ari.png',original:'web/public/team-logos/ari.png',sha256:hash(fs.readFileSync(out+'visual-assets/ari.png')),sourceRecord:JSON.parse(fs.readFileSync('web/public/team-logos/sources.json')).assets.ARI});fs.writeFileSync(out+'visual-assets/sources.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({verifiedPeriods:Object.keys(periods),matchup:model.matchup,trend:candidate.title,fullSample:allRecord.sample,seasons:seasons.length,teams:teams.map(t=>({team:t.code,record:t.record,games:t.games})),sourceMatches:true,list:trendList.map(t=>({id:t.id,record:t.periods.season.record.sample,seasons:t.seasons.length}))}));
