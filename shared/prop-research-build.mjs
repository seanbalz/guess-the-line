// Public, free completed-game statistics. No picks, quotes or sportsbook access.
import { parseFantasyCsv } from './fantasy-build.mjs';
import { appCode, easternToUtc, TEAM_NAMES } from './nfl-schedule.mjs';
import { finalAvailableAt } from './trends-research-candidates.mjs';
import { PROP_STATS, PROP_POSITIONS, validPlayerId, validPropActual } from './player-props.mjs';
import { buildPropBaselineProjection } from './prop-baseline-projections.mjs';
import { buildPositionDefenseMatchups } from './position-defense-matchups.mjs';
const number = v => v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
const keys = new Set(['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_receptions', 'player_rush_attempts']);
const markets = PROP_STATS.filter(s => keys.has(s.key));

/** Only completed, unique player-games with an explicit weekly roster join enter observations.
 * Current roster eligibility is not an injury clearance. Missing position/game rows are NOT zeros.
 */
export function buildPropResearch({statsCsv, rostersCsv, scheduleCsv, season, now, source}) {
  const at = Date.parse(now); if (!Number.isFinite(at)) throw new Error('Invalid research clock');
  const schedule = parseFantasyCsv(scheduleCsv, ['game_id','season','week','game_type','gameday','gametime','away_team','home_team','away_score','home_score'])
    .filter(g => Number(g.season) === season && g.game_type === 'REG');
  if (new Set(schedule.map(g => g.game_id)).size !== schedule.length) throw new Error('Duplicate schedule identity');
  const games = new Map(schedule.map(g => [g.game_id, {...g, kickoff:easternToUtc(g.gameday,g.gametime), away:appCode(g.away_team),home:appCode(g.home_team),availableAt:finalAvailableAt(g.gameday)}]));
  const sourceRosterRows = parseFantasyCsv(rostersCsv,['season','week','game_type','gsis_id','team','position','status','full_name']).filter(r => Number(r.season) === season && r.game_type === 'REG');
  const rosterRows = sourceRosterRows.filter(r=>validPlayerId(r.gsis_id));
  const roster = new Map(), conflicts = new Set();
  for (const r of rosterRows) {
    const key=`${Number(r.week)}:${r.gsis_id}`, prior=roster.get(key);
    if (conflicts.has(key)) continue;
    if (prior && ['team','position','status','full_name'].some(f=>prior[f]!==r[f])) { roster.delete(key); conflicts.add(key); }
    else if (!prior) roster.set(key,r);
  }
  const rosters=[...roster.values()];
  const stats = parseFantasyCsv(statsCsv,['player_id','season','week','season_type','game_id','team']).filter(r => Number(r.season) === season && r.season_type === 'REG');
  const byGame = new Map();const identities=new Set();
  for (const r of stats) {const key=`${r.game_id}:${r.player_id}`;if(identities.has(key)) throw new Error('Duplicate player-game');identities.add(key);if(!byGame.has(r.game_id))byGame.set(r.game_id,[]);byGame.get(r.game_id).push(r);}
  const rowsByMarket=new Map(markets.map(m=>[m.key,[]])),completeByMarket=new Map(markets.map(m=>[m.key,[]]));
  for(const [id,g] of games){
    if(Date.parse(g.availableAt)>at || Date.parse(g.kickoff)>=at || !TEAM_NAMES[g.home] || !TEAM_NAMES[g.away])continue;
    for(const m of markets) for(const defense of [g.away,g.home]) for(const position of PROP_POSITIONS) completeByMarket.get(m.key).push({gameId:id,defense,position,season,kickoff:g.kickoff,availableAt:g.availableAt,complete:false});
    // Preserve a missing-final calendar gap: last5 must not backfill an older game.
    if([g.home_score,g.away_score].some(v=>!Number.isSafeInteger(number(v))||number(v)<0))continue;
    const rows=byGame.get(id)??[];const sides=new Set(rows.map(r=>appCode(r.team)));if(!sides.has(g.home)||!sides.has(g.away)||sides.size!==2)continue;
    // Refuse the game if a stat row's historical team/position join is unknown.
    if(rows.some(r=>{const f=roster.get(`${r.week}:${r.player_id}`);return !f || !validPlayerId(r.player_id) || !f.position || appCode(f.team)!==appCode(r.team) || Number(r.week)!==Number(g.week);}))continue;
    for(const m of markets) for(const offense of [g.away,g.home])for(const position of PROP_POSITIONS){
      const group=rows.filter(r=>appCode(r.team)===offense && roster.get(`${r.week}:${r.player_id}`).position===position);
      const defense=offense===g.away?g.home:g.away;
      const valid = r => validPropActual(m.key,number(r[m.resultColumn]));
      // A reliable individual observation remains usable when a teammate is missing.
      for(const r of group.filter(valid)) rowsByMarket.get(m.key).push({playerId:r.player_id,position,opponent:defense,gameId:id,kickoff:g.kickoff,availableAt:g.availableAt,value:number(r[m.resultColumn])});
      // Conservative coverage, NOT an assertion that the publisher's full file is complete:
      // every source-listed ACT roster member at this position must have an explicit
      // valid stat cell. An absent appearance cannot be silently counted as zero.
      const expected=sourceRosterRows.filter(r=>Number(r.week)===Number(g.week)&&appCode(r.team)===offense&&r.position===position&&r.status==='ACT');
      const uncertainRoster=sourceRosterRows.some(r=>Number(r.week)===Number(g.week)&&appCode(r.team)===offense&&r.status==='ACT'&&(!r.position||conflicts.has(`${Number(r.week)}:${r.gsis_id}`)));
      if(!group.length || !expected.length || uncertainRoster || group.some(r=>!valid(r)) || expected.some(r=>!validPlayerId(r.gsis_id)||!group.some(s=>s.player_id===r.gsis_id)))continue;
      completeByMarket.get(m.key).find(x=>x.gameId===id&&x.defense===defense&&x.position===position).complete=true;
    }
  }
  const targets=[...games.values()].filter(g=>Date.parse(g.kickoff)>at && Date.parse(g.kickoff)<=at+7*86400000 && TEAM_NAMES[g.away]&&TEAM_NAMES[g.home]);
  const rankingCache=new Map();
  const rank=(key,position,period)=>{const id=`${key}:${position}:${period}`;if(!rankingCache.has(id))rankingCache.set(id,buildPositionDefenseMatchups({rows:rowsByMarket.get(key),completedGames:completeByMarket.get(key).filter(g=>g.position===position),position,season,period,asOf:now,minGames:3}));return rankingCache.get(id);};
  return {version:1,generatedAt:now,source,games:targets.map(g=>({gameId:`${g.away}-${g.home}`,kickoff:g.kickoff,week:Number(g.week),players:rosters.filter(r=>Number(r.week)===Number(g.week)&&[g.away,g.home].includes(appCode(r.team))&&PROP_POSITIONS.includes(r.position)&&r.status==='ACT'&&validPlayerId(r.gsis_id)).flatMap(r=>{
    const team=appCode(r.team),opponent=team===g.away?g.home:g.away;
    const values=markets.flatMap(m=>{const history=rowsByMarket.get(m.key).filter(x=>x.playerId===r.gsis_id);if(!history.some(x=>x.value!==0))return[];
      const baseline=buildPropBaselineProjection({rows:history,playerId:r.gsis_id,gameId:g.game_id,kickoff:g.kickoff,asOf:now});
      const matchups=Object.fromEntries(['season','last5'].map(period=>{const ranked=rank(m.key,r.position,period);const teams=ranked.teams??[];const result=teams.find(t=>t.defense===opponent);return[period,result?{...result,rankedDefenses:teams.filter(t=>t.rank!=null).length}:null];}));
      return[{key:m.key,unit:m.unit,baseline,matchups}];});
    return values.length?[{playerId:r.gsis_id,playerName:r.full_name,team,opponent,position:r.position,markets:values}]:[];
  })}))};
}
