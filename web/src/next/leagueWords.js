// Display app-authored league descriptions only. Never pass IDs, source credits, URLs or stored values.
export const leagueWords = text => typeof text === 'string' ? text.replace(/\bNFL\b/g, 'National Football League').replace(/\bEPL\b/g, 'Premier League') : text;

// Exact registered ID/title pairs, including shortCard's capitalization and optional team suffix.
// An atom name alone is not a card ID; custom/saved/source titles stay literal.
const authoredTitles = {
  'team_ats|t:t_rookie_hc': 'First-year NFL head coach: ATS',
  'total|any:t_rookie_hc': 'either team: first-year NFL head coach: over/under',
};
export const trendWords = (card, text = card?.title) => {
  const title = Object.hasOwn(authoredTitles, card?.id) ? authoredTitles[card.id] : null;
  const titles = title ? [title, title[0].toUpperCase() + title.slice(1)] : [];
  const authored = titles.some(value => card.title === value || (/^[A-Z]{2,3}$/.test(card.team ?? '') && card.title === `${value} · ${card.team}`));
  return authored && card.sourceState !== 'source-reported' ? leagueWords(text) : text;
};
