import {DESTINATION_ICONS as ICON} from '../../web/src/next/ui/destinations.js';
// Native static commissioner/menu copy, isolated without permissions or API controllers.
export const COMMISSIONER_COPY=Object.freeze({
 title:'Commissioner tools',
 only:'Only the Community commissioner can use these tools.',
 tools:Object.freeze([
  {id:'status',icon:ICON.status,label:'Schedule and settlement status'},
  {id:'weeks',icon:ICON.weekOpening,label:'Week opening'},
  {id:'referees',icon:ICON.referees,label:'Game referees'},
  {id:'results',icon:ICON.finalScores,label:'Final scores'},
  {id:'odds',icon:ICON.odds,label:'Odds connection'},
  {id:'epl-corrections',icon:ICON.eplCorrections,label:'EPL stat corrections'},
 ]),
 originalOnly:'Only the original Triple Threat commissioner can use this tool.',
});
// Display words from CommunityMembers; no live membership state is imported.
export const MEMBER_COPY=Object.freeze({
 title:'Community members',
 explanation:'Removal blocks Community access. Guesses, scores, bets, posts and comments stay recorded and visible under their existing rules. Private-league memberships stay unchanged.',
 restricted:'Only the Community commissioner can manage members.',
 pendingTitle:'An access change needs checking',
 pendingText:'Check saved access to see the current state. This never repeats the change.',
 check:'Check saved access',
 refresh:'Refresh members',
 removeTitle:'Remove Community access?',
 restoreTitle:'Restore Community access?',
 removeText:'Remove this member’s Community access? You can restore access here later. This does not delete their account or records.',
 restoreText:'Restore this member’s Community access? Their existing records will still be there.',
 active:'Community access active',
 removed:'Community access removed · records kept',
 cancel:'Cancel',
 remove:'Remove access',
 restore:'Restore access',
});
export function memberExamples(){return[
 {id:'demo-member-0',displayName:'Alex Lane',removed:false},
 {id:'demo-member-1',displayName:'Morgan Reed',removed:false},
 {id:'demo-member-2',displayName:'Jamie Park',removed:true},
];}
