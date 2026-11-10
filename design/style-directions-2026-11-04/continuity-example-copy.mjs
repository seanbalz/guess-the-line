// Native app-state copy, isolated without shell, stores or app reload functions.
export const SHELL_COPY=Object.freeze({
  home: 'Guess The Line, home',
  menu: 'Your menu',
  tabs: 'Main',
  comingNext: 'Coming next',
  sameData: 'Your picks, bets and posts are kept.',
  offline: 'You’re offline. What’s here may be out of date.',
  stillOffline: 'Can’t refresh yet.',
  retry: 'Retry',
  tabFailed: 'This tab couldn’t load.',
  pageFailed: 'This page couldn’t load.',
  layerFailed: 'That couldn’t open.',
  failHelp: 'Try again, or reload the app. Your picks and bets are safe.',
  tryAgain: 'Try again',
  signOutFailed: 'We could not sign you out. Please try again.',
  // The league the pill names when the frame is given none (a test harness); the app passes the league showing.
  defaultLeague: 'Community',
});
export const APP_SCREENS_COPY=Object.freeze({
  name: 'Guess The Line',
  loading: 'Loading your leagues…',
  failedTitle: 'Your account didn’t load',
  failedHelp: 'Check your connection, then try again.',
  tryAgain: 'Try again',
  trying: 'Trying again…',
  signOut: 'Sign out',
  removedTitle: 'Not in the Community',
  removedBody: 'The commissioner removed this account from the Community, so its boards, picks and posts don’t show here. Everything you entered is kept.',
  removedHelp: 'If that’s a mistake, ask the commissioner to add you back.',
  yourLeagues: 'Your leagues',
  pendingTitle: 'Your spot is pending',
  pendingBody: name => `${name} isn’t open to this account yet. Join from an invite sent to your email, or ask its host to invite you.`,
  toCommunity: 'Switch to Community',
});
export const APP_RELOAD_COPY=Object.freeze({
  reload: 'Reload the app',
  failed: 'The app couldn’t open. Your picks and bets are safe.',
});
export const LEAVE_PROMPT='Leave without saving your changes?';
