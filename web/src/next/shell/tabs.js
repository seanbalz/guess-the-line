import * as trends from '../trends/index.js';
// The tabs' names and jobs (prototype spec 1.1 and 1.2, plus Fantasy Football), the frame's fixed words, and the tab bar's reading of
// each tab's slot file. Pure: no React, so the node tests read it directly.
import * as home from '../home/index.js';
import * as play from '../play/index.js';
import * as bets from '../bets/index.js';
import * as lines from '../lines/index.js';
import * as league from '../league/index.js';
import * as fantasy from '../fantasy/index.js';
import * as me from '../me/index.js';
import { TABS } from './state.js';

/** Each tab's slot file (section 3.1), Me's too. */
export const SLOTS = Object.freeze({ home, play, bets, lines, league, fantasy, trends, me });

/** One job per tab (spec 1.1): the tab's name, its screen title and the sentence its "coming next" card says. */
export const TAB_INFO = Object.freeze({
  home: { label: 'Home', job: 'What’s due this week and the one next thing to do.' },
  play: { label: 'Play', job: 'Make your Guess the Line picks and see how close you were.' },
  bets: { label: 'Bets', job: 'Bet Virtual Units on games or against a friend, and track your bets.' },
  lines: { label: 'Lines', job: 'Every game’s line and one thing worth knowing about it.' },
  league: { label: 'League', job: 'How you stack up, and what friends are saying.' },
  fantasy: { label: 'Fantasy', name: 'Fantasy Football', job: 'Filter weekly and rest-of-season player rankings, scoring formats and strong trends.' },
  trends: { label: 'Trends', job: 'Explore published matchups and permitted player history.' },
});

export const SHELL_COPY = Object.freeze({
  home: 'Guess The Line, home',
  menu: 'Your menu',
  tabs: 'Main',
  comingNext: 'Coming next',
  sameData: 'Your picks, bets and posts are the same in both apps, so keep playing in the old app for now.',
  offline: 'You’re offline. What’s here may be out of date.',
  stillOffline: 'Can’t refresh yet.',
  retry: 'Retry',
  tabFailed: 'This tab couldn’t load.',
  pageFailed: 'This page couldn’t load.',
  layerFailed: 'That couldn’t open.',
  failHelp: 'Try again, or use the old app. Your picks and bets are safe.',
  tryAgain: 'Try again',
  signOutFailed: 'We could not sign you out. Please try again.',
  // The league the pill names when the frame is given none (a test harness); the app passes the league showing.
  defaultLeague: 'Community',
});

/** "League: Community. Switch league" (the pill shows only the name). */
export const leagueLabel = name => `League: ${name}. Switch league`;

/**
 * What the tab bar shows on one tab: `{ label, name, count, dot }`. `name` is the button's accessible name, the label
 * plus the counter's words ("Play, 1 ballot due"). A slot whose counter is missing, throws or returns nothing shows none.
 */
export function tabBadge(tab, data, slots = SLOTS) {
  const label = TAB_INFO[tab]?.label ?? tab;
  const name = TAB_INFO[tab]?.name ?? label;
  let badge = null;
  try { badge = typeof slots[tab]?.counter === 'function' ? slots[tab].counter(data) : null; } catch { badge = null; }
  const count = Number.isInteger(badge?.count) && badge.count > 0 ? badge.count : 0;
  const dot = !count && badge?.dot === true;
  const words = (count || dot) && typeof badge.label === 'string' && badge.label.trim() ? badge.label.trim() : '';
  return { label, name: words ? `${name}, ${words}` : name, count, dot };
}

export { TABS };
