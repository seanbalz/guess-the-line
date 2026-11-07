import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { homeProgress, homeSeason, homeActivity } from '../web/src/next/home/approvedHomeModel.js';

test('Home season selector keeps Spread and Total rank/points separate, including ties and unranked states', () => {
  const community={viewer:'you',members:[{id:'you',displayName:'You'},{id:'them',displayName:'Other'}],standings:[
    {userId:'you',mode:'guess_spread',seasonPoints:25,seasonScored:2},
    {userId:'them',mode:'guess_spread',seasonPoints:40,seasonScored:3},
    {userId:'you',mode:'guess_total',seasonPoints:80,seasonScored:3},
    {userId:'them',mode:'guess_total',seasonPoints:80,seasonScored:3}]};
  const spread=homeSeason(community,'you','spread'), total=homeSeason(community,'you','total');
  assert.equal(spread.points,25);assert.equal(total.points,80);
  assert.equal(spread.rank,2);assert.equal(total.rank,1);assert.equal(total.tied,true);
  assert.equal(homeSeason({...community,standings:[]},'you','spread').rank,null);
});

test('Home progress follows the server-eligible next market and never merges its counts with the other market', () => {
  const c={rules:{perGameScoring:true},week:{week:9,games:12},picksDue:{week:9,state:'due'},due:[
    {mode:'guess_spread',locked:12,openGames:0,games:12},
    {mode:'guess_total',locked:8,openGames:4,games:12}]};
  assert.deepEqual(homeProgress(c),{market:'total',label:'Total',done:8,of:12,left:4,closed:0,state:'locked'});
  c.due[1]={mode:'guess_total',locked:4,openGames:7,games:12};
  assert.equal(homeProgress(c).left,7,'a missed kickoff never becomes an eligible pick');
  assert.equal(homeProgress(c).closed,1);
});

test('Home activity is a safe summary only: payload guesses, bet selections, notes and comments never enter the view', () => {
  const c={members:[{id:'other',displayName:'Jordan'}],posts:[{id:'p',actorId:'other',kind:'ballot_submitted',mode:'guess_spread',picks:{'SEA-DEN':-99},body:'secret note',comments:[{body:'private'}]}]};
  const view=homeActivity(c);assert.equal(view.name,'Jordan');assert.match(view.text,/Spread/);
  const raw=JSON.stringify(view);for(const secret of ['-99','SEA-DEN','secret note','private'])assert.ok(!raw.includes(secret));
});

test('Home scoring chart is a fingerprinted historical subset of the public source, never invented trend values', () => {
  const trend=JSON.parse(fs.readFileSync(new URL('../web/src/next/home/scoring-trend.json',import.meta.url),'utf8'));
  const bytes=fs.readFileSync(new URL('../shared/trends/builder-history.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),trend.sourceSha256);
  const {games}=JSON.parse(bytes);
  trend.weeks.forEach((week,index)=>{
    const rows=games.season.flatMap((season,i)=>season===trend.season&&games.week[i]===week?[games.hs[i]+games.as[i]]:[]);
    assert.equal(rows.length,trend.games[index]);
    assert.equal(Math.round(rows.reduce((a,b)=>a+b,0)/rows.length*100)/100,trend.values[index]);
  });
  assert.match(trend.meaning,/historical scoring, not a forecast/);
});

test('Home image bytes match their reviewed provenance hashes', () => {
  const sources=JSON.parse(fs.readFileSync(new URL('../web/src/next/home/assets/sources.json',import.meta.url),'utf8'));
  for(const asset of sources.files){
    const bytes=fs.readFileSync(new URL(`../web/src/next/home/assets/${asset.file}`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);
  }
});
