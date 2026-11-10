// Explicit fictional normalized presentation states. No source/receipt/kickoff timestamps.
import {accuracy} from '../../server/domain.mjs';
import {gameGuesses} from '../../web/src/next/lines/gameGuesses.js';
import {everyoneBoard} from '../../web/src/next/bets/everyone.js';
import {betsWeekData,RECORD_OWNER} from './history-records-examples.mjs';
export const ACTION_SCENARIOS=['forfeit-ready','forfeit-close-warning','forfeit-loading','forfeit-unconfirmed','forfeit-busy','forfeit-expired','forfeit-done','forfeit-scope','saved-pick','saved-total','saved-draft','saved-pending','saved-stale','saved-scope','game-bets','game-bets-loading','game-bets-failed','game-bets-empty','feed-picks','feed-hidden','feed-picks-loading','feed-picks-failed','feed-picks-empty','feed-share-uncertain','reactors','reactors-loading','reactors-failed','reactors-empty','virtual','virtual-minimum','virtual-slip','virtual-locked','virtual-no-offer','virtual-busy','virtual-uncertain','menu','menu-admin','menu-no-reminders','menu-busy','navigation-nfl','navigation-epl','navigation-nfl-only','navigation-layer-failed'];
export const OWNER=RECORD_OWNER;
export const MEMBERS=[{id:OWNER,displayName:'Alex Lane'},{id:'example-jordan',displayName:'Jordan Taylor'},{id:'example-casey',displayName:'Casey Vale'}];
export function actionExample(scenario){
 const app={accountId:OWNER,league:{community:true,name:'Community'},community:{data:{members:MEMBERS}}},args={accountId:OWNER,season:2026,week:9,game:'example-record-game-0',market:scenario==='saved-total'?'total':'spread'};
 const total=args.market==='total',draft=scenario==='saved-draft',pending=scenario==='saved-pending';
 const game={id:args.game,awayCode:'SEA',homeCode:'DEN',away:'SEA',home:'DEN',kickoff:null};
 const comparison=total?44.5:-3.5,pick=total?45.5:-2.5,math=accuracy(pick,comparison);
 const yourView=scenario==='saved-scope'?null:{game,row:{main:draft?'Your draft · DEN −2.5':total?'Your locked Total · 45.5':'Your locked Spread · DEN −2.5'},lockedAt:null,observedAt:null,exampleLocked:!draft,lineLabel:draft?'No saved scoring reference':pending?'Saved reference unavailable':'Example comparison',line:draft||pending?null:total?'44.5':'DEN −3.5'};
 const rawGuesses={games:[{gameId:game.id,open:!draft,started:false,rows:[{userId:OWNER,status:draft?'not_yet':'in',lockedIn:!draft,pick,eligible:pending?null:true,...(!draft&&!pending?{error:Math.abs(pick-comparison),points:math}: {})},{userId:'example-jordan',status:'in',lockedIn:true,...(draft?{hidden:true}:{hidden:false,pick:comparison})},{userId:'example-casey',status:'sat_out',lockedIn:false,removed:true}]}]};
 const guesses=gameGuesses(rawGuesses,OWNER,MEMBERS,game,args.market);
 const betData=betsWeekData();betData.bets.push({gameId:game.id,userId:'example-jordan',market:'total',selection:{side:'over',units:1.5},status:null,result:null});betData.markets[game.id].total.visible=false;const bets=everyoneBoard(betData,OWNER);const betGame=bets.games.find(g=>g.id===game.id);
 const forfeitView={stored:scenario==='forfeit-done'?{example:true}:null,canConfirm:scenario==='forfeit-ready',rows:[{mode:'guess_spread',name:'Guess the Spread',status:scenario==='forfeit-done'?'sat_out':'open',lockedIn:2,games:8},{mode:'guess_total',name:'Guess the Total',status:'submitted',lockedIn:8,games:8}]};
 const ownFeed=[{gameId:'SEA-DEN',rows:[{userId:OWNER,status:'in',lockedIn:true,pick:-2.5,points:math}]},{gameId:'HOU-JAX',rows:[{userId:OWNER,status:'not_yet',lockedIn:false,pick:1.5}]},{gameId:'BAL-CLE',rows:[{userId:OWNER,status:'sat_out',lockedIn:false}]}];
 const feedGames=scenario==='feed-hidden'?[{gameId:'SEA-DEN',rows:[{userId:'example-jordan',status:'in',lockedIn:true,hidden:true}]}]:ownFeed;
 const offers=(market,sides)=>({market,name:market==='spread'?'Spread':'Total',locked:scenario==='virtual-locked'?'Lock in your guess in Play to see prices.':null,sides:sides.map(([side,pick])=>({side,label:side,pick,text:pick+' · −110',price:'−110',offer:scenario==='virtual-no-offer'?null:{source:'Example terms',observedAt:null}}))});
 const placeGame={...game,started:false,faces:[],markets:[offers('spread',[['away','SEA +3.5'],['home','DEN −3.5']]),offers('total',[['over','Over 44.5'],['under','Under 44.5']])]};
 return{app,args,yourView,guesses,rawGuesses,forfeitView,betGame,feedGames,placeGame,week:{open:'2',inPlay:'3U',toWin:'+2.73U',record:'0–0–0',units:'3U',ret:'—',meter:{text:'Qualified · 3U in play',value:3}},reactors:MEMBERS.map((m,i)=>({userId:m.id,reaction:['fire','bullseye','clap'][i]}))};
}
