// Documented NFL prop keys; unknown markets stay unavailable.
export const RESEARCH_PROP_UNITS = Object.freeze({
  player_assists: 'assists', player_defensive_interceptions: 'interceptions', player_field_goals: 'field goals', player_kicking_points: 'points',
  player_pass_attempts: 'attempts', player_pass_completions: 'completions', player_pass_interceptions: 'interceptions', player_pass_longest_completion: 'yards',
  player_pass_rush_yds: 'yards', player_pass_rush_reception_tds: 'touchdowns', player_pass_rush_reception_yds: 'yards', player_pass_tds: 'touchdowns', player_pass_yds: 'yards', player_pass_yds_q1: 'yards',
  player_pats: 'extra points', player_receptions: 'receptions', player_reception_longest: 'yards', player_reception_tds: 'touchdowns', player_reception_yds: 'yards',
  player_rush_attempts: 'attempts', player_rush_longest: 'yards', player_rush_reception_tds: 'touchdowns', player_rush_reception_yds: 'yards', player_rush_tds: 'touchdowns', player_rush_yds: 'yards',
  player_sacks: 'sacks', player_solo_tackles: 'tackles', player_tackles_assists: 'tackles and assists', player_tds_over: 'touchdowns', player_tds: 'touchdowns', player_1st_td: 'touchdowns', player_anytime_td: 'touchdowns', player_last_td: 'touchdowns',
});
export const researchMarketUnit = key => {
  const base = typeof key === 'string' ? key.replace(/_alternate$/, '') : '';
  return Object.hasOwn(RESEARCH_PROP_UNITS, base) ? RESEARCH_PROP_UNITS[base] : null;
};
// Research accepts more markets than the eleven stats in the guessing mode.
// Keep the exact market identity in priced selections, including periods and
// binary TD markets; a broad discovery category is not a selection label.
const PROP_LABELS = Object.freeze({
  player_assists: 'Assists', player_defensive_interceptions: 'Defensive interceptions', player_field_goals: 'Field goals', player_kicking_points: 'Kicking points',
  player_pass_attempts: 'Pass attempts', player_pass_completions: 'Completions', player_pass_interceptions: 'Interceptions thrown', player_pass_longest_completion: 'Longest pass completion (yards)',
  player_pass_rush_yds: 'Passing + rushing yards', player_pass_rush_reception_tds: 'Passing + rushing + receiving TDs', player_pass_rush_reception_yds: 'Passing + rushing + receiving yards',
  player_pass_tds: 'Passing TDs', player_pass_yds: 'Passing yards', player_pass_yds_q1: 'First-quarter passing yards',
  player_pats: 'Extra points', player_receptions: 'Receptions', player_reception_longest: 'Longest reception (yards)', player_reception_tds: 'Receiving TDs', player_reception_yds: 'Receiving yards',
  player_rush_attempts: 'Rush attempts', player_rush_longest: 'Longest rush (yards)', player_rush_reception_tds: 'Rushing + receiving TDs', player_rush_reception_yds: 'Rushing + receiving yards', player_rush_tds: 'Rushing TDs', player_rush_yds: 'Rushing yards',
  player_sacks: 'Sacks', player_solo_tackles: 'Solo tackles', player_tackles_assists: 'Tackles + assists', player_tds_over: 'Total touchdowns', player_tds: 'Total touchdowns',
  player_1st_td: 'First touchdown scorer', player_anytime_td: 'Anytime touchdown scorer', player_last_td: 'Last touchdown scorer',
});
export const researchMarketLabel = key => {
  if (typeof key !== 'string') return null;
  const base = key.replace(/_alternate$/, '');
  return Object.hasOwn(PROP_LABELS, base) ? `${PROP_LABELS[base]}${key === base ? '' : ' (alternate)'}` : null;
};
const GAME_UNITS = Object.freeze({ h2h: 'win', spreads: 'points', totals: 'points', alternate_spreads: 'points', alternate_totals: 'points' });
export const researchQuoteMarketUnit = key => Object.hasOwn(GAME_UNITS, key) ? GAME_UNITS[key] : researchMarketUnit(key);
/** The key research intake compares a provider's player name with a roster receipt by (accents, case and punctuation
 * ignored). A name is never an identity: a match must be unique in the game's receipt, and only its stable ID is kept. */
export const researchNameKey = s => typeof s === 'string' ? s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') : '';
