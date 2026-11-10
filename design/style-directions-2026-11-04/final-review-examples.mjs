import {emptyFields} from './final-review-validation.mjs';
export const FINAL_COPY=Object.freeze({
 title:'Final scores',
 heading:'Commissioner final-result review',
 intro:'Record a sourced final score or correct an earlier version. This is commissioner-reported evidence, not independently verified results. Earlier versions and selections remain in the audit.',
 confirmation:'This records a commissioner-reported ordinary final score. It is not independently verified. Eligible immutable Challenge selections will be graded against this result. No cancellation, void, postponement or pending-game ruling is made.',
 assertion:'I checked the named source and confirm this is the completed game’s ordinary final score, not a live, cancelled, postponed or unresolved result.',
 changed:'This result or its schedule changed while the review was open. Return to the form and review the latest version.',
 unavailable:'The reviewed-results service is unavailable. Result entry is disabled until a current read succeeds.',
 conflict:'This result changed. Refresh the current version before correcting it.',
 conflictHelp:'Refresh results to load the changed version. Your proposed scores remain in the form.',
 keep:'Keep editing',
 firstTitle:'Confirm final result',
 correctionTitle:'Confirm corrected final result',
 confirm:'Confirm commissioner-reported final',
 recording:'Recording final…',
});
export function finalReviewExample(model,scenario='form'){
 const week=model.history.weeks.find(w=>w.week===8),games=week.games.map(g=>({...g,away:g.awayName,home:g.homeName}));
 return{season:week.season,week:week.week,games,now:Date.parse(model.source.publicationGeneratedAt),busy:scenario==='busy',available:scenario!=='unavailable',version:scenario==='correction'||scenario==='conflict'?1:0};
}
export function finalFields(game,correction=false){return{...emptyFields(game.recordedFinal),source:'Archived source · example entry',sourceURL:'https://example.invalid/gtl/final-review',observedAt:'2026-11-03T12:00:00',reason:correction?'Example metadata correction: replace the source reference.':'Visual example using the archived public final.'};}
