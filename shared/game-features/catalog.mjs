// The D-35 game features as data (redesign build plan stage 68): the badges, weekly awards and streaks of the approved
// prototype (D-38, canvas version 2, its `badges.catalog`, `awardsWeek5` and How to play "Streaks, badges, awards"),
// with the rule each one shows. D-35: streaks, badges and weekly awards; no levels or XP. Scores, badges, awards and
// streaks never change official scoring or ranks: they read the scored, settled record and add nothing to it.
//
// `status` says what the build does with an entry today:
//   live      computed by shared/game-features/{badges,awards,streaks}.mjs and recorded by the features job (stage 69).
//   waits     its inputs do not exist yet (friend challenges: stage 50, M-15, and their settlement: stage 55, M-18).
//   question  its rule leaves a product choice open; QUESTIONS below holds the exact question for Sean. Nothing is
//             computed, recorded or shown until he answers, so no badge is ever earned under a guessed rule.
// Pure and import-free (no React, storage, network or clock), shared by gtl-api, the features job and the new app.

/** The badge tile's rarity rings, low to high (web/src/next/ui/Badge.jsx BADGE_RARITIES). */
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);
/** The rarity word printed beside a tile (rule 7: never the ring alone). */
export const RARITY_LABEL = Object.freeze({ common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' });

const entry = value => Object.freeze(value);

/** The 14 badges, in the prototype's order. `family`: guess (Guess the Line), bets (Virtual Units), challenge. */
export const BADGES = Object.freeze([
  entry({ id: 'bullseye', name: 'Bullseye', rarity: 'uncommon', family: 'guess', status: 'live', rule: 'Guess a line exactly (10 points).' }),
  entry({ id: 'double_bullseye', name: 'Double Bullseye', rarity: 'epic', family: 'guess', status: 'live', rule: 'Bullseye on both the Spread and the Total of one game.' }),
  entry({ id: 'called_the_move', name: 'Called the Move', rarity: 'uncommon', family: 'guess', status: 'live', rule: 'The line moves 1+ point toward your guess before kickoff.' }),
  entry({ id: 'dialed_in', name: 'Dialed In', rarity: 'rare', family: 'guess', status: 'live', rule: "Score 80%+ of a full week's points in one market." }),
  entry({ id: 'closer', name: 'Closer', rarity: 'rare', family: 'guess', status: 'question', question: 'closest', rule: 'Be closest 3 games in a row.' }),
  entry({ id: 'never_missed', name: 'Never Missed', rarity: 'epic', family: 'guess', status: 'live', rule: 'Send both ballots 10 weeks in a row.' }),
  entry({ id: 'sharp', name: 'Sharp', rarity: 'uncommon', family: 'bets', status: 'live', rule: 'Get a book line 1+ point better than the kickoff line.' }),
  entry({ id: 'dog_day', name: 'Dog Day', rarity: 'rare', family: 'bets', status: 'live', rule: 'Win a spread bet taking 7+ points, and your team wins outright.' }),
  entry({ id: 'perfect_week', name: 'Perfect Week', rarity: 'rare', family: 'bets', status: 'live', rule: 'Win 4+ bets in a week with no losses.' }),
  entry({ id: 'hot_hand', name: 'Hot Hand', rarity: 'rare', family: 'bets', status: 'live', rule: 'Win 5 bets in a row.' }),
  entry({ id: 'lone_wolf', name: 'Lone Wolf', rarity: 'rare', family: 'bets', status: 'question', question: 'loneWolf', rule: 'Be the only one on your side of a game 4+ friends bet, and win.' }),
  entry({ id: 'showdown', name: 'Showdown', rarity: 'common', family: 'challenge', status: 'waits', waitsFor: 'friend challenges (stages 50 and 55)', rule: 'Win a friend challenge.' }),
  entry({ id: 'giant_slayer', name: 'Giant Slayer', rarity: 'rare', family: 'challenge', status: 'waits', waitsFor: 'friend challenges (stages 50 and 55)', rule: 'Beat the #1 on the Bets board in a challenge.' }),
  entry({ id: 'taker', name: 'Taker', rarity: 'common', family: 'challenge', status: 'waits', waitsFor: 'friend challenges (stage 50)', rule: 'Accept an open league challenge.' }),
]);

/**
 * The weekly awards, in the order the recap lists them. The prototype's one "Guess the Line winner" is two awards,
 * because Spread and Total points are never added together (D-35, D-36: each board has its own weekly winner).
 */
export const AWARDS = Object.freeze([
  entry({ id: 'spread_winner', name: 'Spread winner', status: 'live', plain: 'Most Spread points this week.' }),
  entry({ id: 'total_winner', name: 'Total winner', status: 'live', plain: 'Most Total points this week.' }),
  entry({ id: 'bets_winner', name: 'Bets winner', status: 'live', plain: 'The best return on this week’s Bets board.' }),
  entry({ id: 'best_guess', name: 'Best guess', status: 'live', plain: 'The closest guess of the week.' }),
  entry({ id: 'sharpest_bet', name: 'Sharpest bet', status: 'live', plain: 'The bet line that beat the kickoff line by the most.' }),
  entry({ id: 'saw_it_coming', name: 'Saw it coming', status: 'live', plain: 'The guess the line moved toward the most.' }),
  entry({ id: 'worst_beat', name: 'Worst beat', status: 'live', plain: 'The closest losing bet.' }),
  entry({ id: 'biggest_upset', name: 'Biggest upset', status: 'question', question: 'biggestUpset', plain: '' }),
  entry({ id: 'duel_of_the_week', name: 'Duel of the week', status: 'waits', waitsFor: 'friend challenges (stages 50 and 55)', question: 'duel', plain: '' }),
]);

/** Season winners, one per board, decided once Week 18 is final ("Decided after Week 18" until then). */
export const SEASON_AWARDS = Object.freeze([
  entry({ id: 'spread_champion', name: 'Spread champion', board: 'spread' }),
  entry({ id: 'total_champion', name: 'Total champion', board: 'total' }),
  entry({ id: 'bets_champion', name: 'Bets champion', board: 'bets' }),
]);
/** The last regular-season week: season winners wait for it to be final. */
export const SEASON_FINAL_WEEK = 18;

/** The three streaks of How to play, with the words a row prints beside the number (rule 6: plain words). */
export const STREAKS = Object.freeze([
  entry({ id: 'pick', name: 'Pick streak', unit: 'weeks', status: 'live', rule: 'Weeks you sent both ballots. Sitting out breaks it.' }),
  entry({ id: 'closest', name: 'Closest streak', unit: 'games', status: 'question', question: 'closest', rule: 'Games in a row you were closest.' }),
  entry({ id: 'bets', name: 'Bets streak', unit: 'wins', status: 'live', rule: "Bets won in a row. Pushes don't count." }),
]);

/** Thresholds the rules above name, in one place so the code and the words cannot drift apart. */
export const THRESHOLDS = Object.freeze({
  exactPoints: 10, // Bullseye: an exact guess scores the full 10 points (RULES.md: 10 minus 1 per half point, floor 0).
  calledTheMove: 1, // Called the Move: the line moves 1+ point toward the guess.
  dialedIn: 0.8, // Dialed In: 80% of a full week's points in one market.
  neverMissed: 10, // Never Missed: both ballots sent 10 weeks in a row.
  sharp: 1, // Sharp: a book line 1+ point better than the kickoff line.
  dogDay: 7, // Dog Day: taking 7+ points.
  perfectWeek: 4, // Perfect Week: 4+ wins with no losses.
  hotHand: 5, // Hot Hand: 5 wins in a row.
  qualifyBets: 3, // D-18: the weekly Bets board takes 3 bets or 3U.
  qualifyUnits: 3,
});

/**
 * The product choices the docs and the approved prototype leave open. Each is asked of Sean in the stage 68 PR and
 * holds back the entries that name it (status 'question'); nothing is computed until he answers.
 */
export const QUESTIONS = Object.freeze({
  closest: 'Closer and the Closest streak: "games in a row you were closest". Do Spread and Total run as one sequence of games (in kickoff order) or as two separate streaks? Does a tied closest guess count as closest (gtl_read_guess_picks already flags ties as closest)? Does a game you did not lock in break the streak or get skipped?',
  loneWolf: 'Lone Wolf: "the only one on your side of a game 4+ friends bet, and win". Is it per market (Spread and Total sides separately)? Does "4+ friends" count you, and is it the Community or the league showing?',
  biggestUpset: 'Biggest upset has no rule in the docs or the prototype (it was hidden there for lack of kickoff lines). What wins it, and who receives it: the player who bet the biggest kickoff-line underdog that won outright, or something else?',
  duel: 'Duel of the week (needs friend challenges): which challenge wins it, for example the most units at stake or the biggest margin?',
  awardTies: 'Award ties: Spread, Total and Bets winners share a tie as the boards do (D-36). Best guess, Sharpest bet, Saw it coming and Worst beat list every tied player too. Keep co-winners, or name a tie-break?',
  streakMilestones: 'The feed kind streak_milestone (M-13): at which Pick streak lengths should a post go out (for example 5, 10, 15)? Until then no streak_milestone post is written.',
});

const byId = list => Object.freeze(Object.fromEntries(list.map(item => [item.id, item])));
export const BADGE_BY_ID = byId(BADGES);
export const AWARD_BY_ID = byId(AWARDS);
export const STREAK_BY_ID = byId(STREAKS);
/** Badge ids the job computes and records today. */
export const LIVE_BADGES = Object.freeze(BADGES.filter(b => b.status === 'live').map(b => b.id));
/** Award ids the job computes and records today. */
export const LIVE_AWARDS = Object.freeze(AWARDS.filter(a => a.status === 'live').map(a => a.id));
