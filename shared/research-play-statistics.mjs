// Descriptive facts from observed, completed plays. Never a forecast, pressure
// proxy, route estimate, coverage tag or replacement for proprietary charting.
const number = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const average = values => values.length ? values.reduce((s, n) => s + n, 0) / values.length : null;
export function observedPlayStatistics({ plays, completedGames, team, asOf, sourceHash }) {
  const completed = new Map(completedGames.filter(g => Number.isFinite(Date.parse(g.availableAt)) && Date.parse(g.availableAt) <= Date.parse(asOf)).map(g => [g.id, g]));
  const rows = plays.filter(p => completed.has(p.game_id) && p.posteam === team && number(p.no_play) === 0);
  const gameIds = [...new Set(rows.map(p => p.game_id))];
  const pass = rows.filter(p => number(p.qb_dropback) === 1 && number(p.qb_spike) === 0);
  const run = rows.filter(p => number(p.rush_attempt) === 1 && number(p.qb_kneel) === 0 && number(p.qb_scramble) === 0);
  function success(records) {
    const known = records.filter(p => [number(p.down), number(p.ydstogo), number(p.yards_gained)].every(n => n !== null) && number(p.down) >= 1 && number(p.down) <= 4 && number(p.ydstogo) > 0);
    return { value: known.length ? known.filter(p => Number(p.yards_gained) >= Number(p.ydstogo) * (Number(p.down) === 1 ? 0.4 : Number(p.down) === 2 ? 0.6 : 1)).length / known.length : null,
      sample: known.length, excluded: records.length - known.length };
  }
  const passSuccess = success(pass), runSuccess = success(run);
  const sacks = pass.filter(p => number(p.sack) !== null);
  const passing = rows.filter(p => number(p.pass_attempt) === 1 && number(p.sack) === 0 && number(p.qb_spike) === 0);
  const yards = passing.map(p => number(p.passing_yards)).filter(n => n !== null);
  const carries = run.map(p => number(p.rushing_yards)).filter(n => n !== null);
  const games = gameIds.map(id => completed.get(id)).sort((a, b) => a.date.localeCompare(b.date));
  return { team, asOf, sourceHash, sourceUrl: 'https://github.com/nflverse/nflverse-data/releases/tag/pbp', sampleGames: gameIds.length,
    from: games[0]?.date ?? null, to: games.at(-1)?.date ?? null, metrics: [
      { id: 'passing-success', title: 'Pass play success', ...passSuccess, unit: 'share', definition: 'Dropbacks excluding spikes: gain 40% of yards to go on first down, 60% on second, 100% on third/fourth.' },
      { id: 'rushing-success', title: 'Run play success', ...runSuccess, unit: 'share', definition: 'Rushing plays excluding kneels and scrambles; the same 40/60/100 rule. Designed QB runs may remain.' },
      { id: 'passing-yards-attempt', title: 'Passing yards per attempt', value: average(yards), sample: yards.length, excluded: passing.length - yards.length, unit: 'yards per attempt', definition: 'Observed pass attempts with known passing yards; sacks and spikes excluded. This is not yards per dropback.' },
      { id: 'rushing-yards-carry', title: 'Rushing yards per carry', value: average(carries), sample: carries.length, excluded: run.length - carries.length, unit: 'yards per carry', definition: 'Observed carries with known rushing yards; kneels and scrambles excluded. Run concepts are not inferred.' },
      { id: 'observed-sacks', title: 'Sacks observed', value: sacks.length ? sacks.filter(p => Number(p.sack) === 1).length : null, sample: sacks.length, excluded: pass.length - sacks.length, unit: 'sacks', definition: 'Sacks in supplied observed dropbacks with known sack flags; incomplete files do not establish complete season totals.' },
    ] };
}
/** Rebuild the public subset; never serve raw play rows or arbitrary source keys. */
export function projectPlayStatistics(raw, board, now) {
  if (!Array.isArray(raw) || raw.length > 64) return [];
  const rows = [];
  for (const entry of raw) {
    const g = board.games.find(g => g.id === entry?.gameId);
    if (!g || !g.spread?.visible || !g.total?.visible || !Array.isArray(entry.teams)) continue;
    const teams = entry.teams.flatMap(t => {
      if (![g.awayCode, g.homeCode].includes(t?.team) || !/^[a-f0-9]{64}$/.test(t.sourceHash ?? '') || !Number.isFinite(Date.parse(t.asOf)) || Date.parse(t.asOf) > Math.min(now, Date.parse(g.kickoff)) || !Array.isArray(t.metrics)) return [];
      const metrics = t.metrics.filter(m => ['passing-success', 'rushing-success', 'passing-yards-attempt', 'rushing-yards-carry', 'observed-sacks'].includes(m.id)
        && typeof m.title === 'string' && m.title.length <= 100 && typeof m.definition === 'string' && m.definition.length <= 500
        && (m.value === null || typeof m.value === 'number' && Number.isFinite(m.value)) && Number.isSafeInteger(m.sample) && m.sample >= 0 && Number.isSafeInteger(m.excluded) && m.excluded >= 0)
        .slice(0, 5).map(m => ({ id: m.id, title: m.title, definition: m.definition, value: m.value, sample: m.sample, excluded: m.excluded, unit: String(m.unit).slice(0, 60) }));
      return [{ team: t.team, asOf: t.asOf, sourceHash: t.sourceHash, sourceUrl: 'https://github.com/nflverse/nflverse-data/releases/tag/pbp', metrics }];
    });
    if (teams.length) rows.push({ gameId: g.id, teams });
  }
  return rows;
}
