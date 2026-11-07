export const APP_INVITE_URL='https://guess-the-line.pages.dev/';
export const APP_INVITE_TITLE='Guess the Line';
export const APP_INVITE_MESSAGE='Join me on Guess the Line. Guess NFL spreads and totals, explore research, and compete with the Community.';
// Public entry only: no invite token, league, account, email or referral identifier.
export function appInvitePayload(){return{title:APP_INVITE_TITLE,text:APP_INVITE_MESSAGE,url:APP_INVITE_URL};}
