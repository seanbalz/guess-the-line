import {ODDS_LOW_QUOTA,ODDS_PENDING,ODDS_FAILURES,oddsFetchAllowed,oddsSummary} from '../../web/src/oddsConnection.js';
export const ODDS_COPY=Object.freeze({
 title:'Odds connection',
 intro:'Triple Threat. Check the saved server connection before fetching current lines. This screen never asks for the provider key or shows market values.',
 limitsTitle:'Free quota only',
 limits:'Checking uses no credits; each fetch can use up to 2. The server allows 6 fetches per UTC day, at least 5 minutes apart, and keeps a 50-credit reserve. Manual fetches do not change the schedule.',
 check:'Check connection (zero-credit)',
 checking:'Checking…',
 collect:'Fetch current lines',
 fetching:'Fetching…',
 prerequisite:'A successful connection check is required before fetching.',
 incomplete:'Request not completed',
 checked:'Connection check completed',
 fetched:'Manual fetch completed',
 matched:'Matched events',
 quotes:'Available quotes saved',
 remaining:'Provider credits remaining',
 used:'Credits used in this request',
 benchmark:'Provider quotes are not an official verified benchmark. Pick reveal rules still apply.',
});
export function oddsExample(scenario='initial'){
 const checked={status:'succeeded',matchedEvents:15,quota:{remaining:316,last:0}},collected={status:'succeeded',matchedEvents:15,availableQuotes:90,quota:{remaining:314,last:2}};
 let result=null,ready=false,problem='',busy='';
 if(scenario==='ready'){result=oddsSummary('preflight',checked);ready=oddsFetchAllowed(checked);}
 if(scenario==='fetched'){result=oddsSummary('collect',collected);ready=oddsFetchAllowed(checked);}
 if(scenario==='low-quota'){const low={...checked,quota:{remaining:51,last:0}};result=oddsSummary('preflight',low);ready=oddsFetchAllowed(low);problem=ODDS_LOW_QUOTA;}
 if(scenario==='pending'){result=oddsSummary('collect',{status:'running'});ready=oddsFetchAllowed(checked);problem=ODDS_PENDING;}
 if(scenario==='failed'){result=oddsSummary('preflight',{status:'failed'});problem=ODDS_FAILURES.ODDS_RATE_LIMIT;}
 if(scenario==='checking')busy='preflight';
 return{result,ready,problem,busy,schedule:{oddsSchedule:{enabled:true}},priorMeasuredCheck:scenario==='fetched'||scenario==='pending'?checked:null};
}
