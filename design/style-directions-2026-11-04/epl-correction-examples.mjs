// Fictional normalized review replies. No Sleeper/account/roster data or API imports.
export const EPL_CORRECTION_COPY=Object.freeze({
 intro:'Sleeper stat corrections are shown beside their original captures. Existing picks and draft order are preserved.',
 loading:'Loading EPL correction reviews…',
 refreshing:'Refreshing EPL correction reviews…',
 stale:'Could not refresh. Showing the last loaded reviews.',
 failed:'EPL correction reviews could not load.',
 denied:'Only the Community commissioner can view these corrections.',
 unavailable:'EPL correction checks are not available yet.',
 empty:'No EPL stat corrections are awaiting review.',
 missing:'Some source totals are unavailable. Missing values are shown as —.',
 refresh:'Refresh reviews',
});
export function eplCorrectionExample(scenario='ready'){
 const review={week:9,nextWeek:10,nextPickCount:2,totalsComplete:true,
  original:{capturedAt:'2026-11-03T02:00:00Z'},corrected:{capturedAt:'2026-11-03T20:05:00Z'},
  changes:[{name:'Alex · example',before:{points:611.25,against:584.75},after:{points:613.5,against:583.25},pointsChange:2.25,againstChange:-1.5}]};
 const state={data:{available:true,reviews:[review]},loading:false,failed:false,denied:false};
 if(scenario==='missing'){
  review.nextPickCount=0;review.totalsComplete=false;review.changes[0].after.points=null;review.changes[0].pointsChange=null;
 }else if(scenario==='empty')state.data.reviews=[];
 else if(scenario==='unavailable')state.data={available:false,reviews:[]};
 else if(scenario==='failed'){state.data=null;state.failed=true;}
 else if(scenario==='denied'){state.data=null;state.denied=true;}
 else if(scenario==='loading'){state.data=null;state.loading=true;}
 else if(scenario==='refreshing')state.loading=true;
 else if(scenario==='stale')state.failed=true;
 return state;
}
export function nextWeekCopy(review){return review.nextPickCount>0
 ? `MW${review.nextWeek} has ${review.nextPickCount} recorded ${review.nextPickCount===1?'pick':'picks'}. Its stored picks and draft order are preserved.`
 : `MW${review.nextWeek} has no recorded picks. Review its order against the corrected totals before drafting.`;}
