// Display app-authored league descriptions only. Never pass IDs, source credits, URLs or stored values.
export const leagueWords = text => typeof text === 'string' ? text.replace(/\bNFL\b/g, 'National Football League').replace(/\bEPL\b/g, 'Premier League') : text;

// Only this registered built-in title uses an acronym. Custom/saved/source titles stay literal.
export const trendWords = (card, text = card?.title) => card?.id === 't_rookie_hc' ? leagueWords(text) : text;
