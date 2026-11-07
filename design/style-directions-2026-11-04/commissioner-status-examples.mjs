// Native status/week-opening display words; no operational controllers.
export const STATUS_COPY=Object.freeze({
 title:'Schedule and settlement status',
 automatic:'Automatic week opening',
 monday:'Mondays 12:00 AM PT',
 odds:'Odds refresh',
 settlement:'Virtual Units settlement',
 settle:'Settle finals now',
 check:'Check saved results',
 uncertain:'The reply was lost. Check the saved results before settling again; this never repeats the settlement.',
 weeks:'Week opening',
 weeksHelp:'Weeks open automatically Mondays at 12:00 AM PT. Review the public NFL schedule here, or publish early if the automatic opening fails. Nothing changes until you publish.',
 review:'Review schedule',
 error:'No connection. Reconnect and try again.',
});
export const statusExample=paused=>({weekOpen:{configured:true,enabled:true,lastRunAt:'2026-11-02T08:00:00.000Z',lastStatus:'succeeded'},oddsSchedule:{enabled:true,operationalStatus:paused?'blocked':'ready',pauseReason:paused?'budget_guard':null},settledGames:8});
export function weekInputValid(season,week){return Number.isInteger(Number(season))&&Number(season)>=2000&&Number(season)<=2200&&Number.isInteger(Number(week))&&Number(week)>=1&&Number(week)<=25;}
