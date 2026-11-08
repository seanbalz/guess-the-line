// Display app-authored league descriptions only. Never pass IDs, source credits, URLs or stored values.
export const leagueWords = text => typeof text === 'string' ? text.replace(/\bNFL\b/g, 'National Football League').replace(/\bEPL\b/g, 'Premier League') : text;
