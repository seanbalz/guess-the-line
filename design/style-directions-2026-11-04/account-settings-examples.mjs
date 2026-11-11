import {preferenceValue,validBooks,SPORTSBOOK_NAMES} from '../../shared/account-preferences.mjs';
export const sameSettings=(a,b)=>JSON.stringify(preferenceValue(a))===JSON.stringify(preferenceValue(b));
export function settingsExample(scenario='standard'){
 const supportedBooks=Object.keys(SPORTSBOOK_NAMES),standard={revision:1,supportedBooks,sportsbooks:['draftkings','fanduel'],guidanceCollapsed:false};
 if(scenario==='unavailable')return{base:{...standard,supportedBooks:['draftkings','fanduel','betmgm'],sportsbooks:['draftkings','bovada']},draft:{sportsbooks:['draftkings','bovada'],guidanceCollapsed:false},problem:''};
 if(scenario==='conflict')return{base:{...standard,revision:2,sportsbooks:['betmgm']},draft:preferenceValue(standard),problem:'Example: saved settings changed. Your draft is kept. Review it before previewing again.'};
 return{base:standard,draft:preferenceValue(standard),problem:''};
}
export function previewSettings(base,draft){if(!validBooks(draft.sportsbooks)||typeof draft.guidanceCollapsed!=='boolean')throw Error('Check the selected books and guidance choice.');return{...base,...preferenceValue(draft),revision:base.revision+1};}
export const settingsBookKeys=(base,draft)=>[...new Set([...base.supportedBooks,...draft.sportsbooks])];
