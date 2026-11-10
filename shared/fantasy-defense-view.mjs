// What the app shows from a snapshot's defensive-matchup insights (shared/fantasy-defense.mjs). Pure functions: raw counts
// are scored here under the viewer's format, every row keeps its kind (Observed, Estimate or Not available), sample,
// period and basis, and small samples are flagged. The game script reads only the viewer's own gated lines reply
// (D-57, impliedTotals); nothing here fetches.
import { scoreStats, scoringRules, formatFantasyNumber } from './fantasy-rankings.mjs';
import { impliedTotals, gameIdFor, matchupTable, opponentOf, ordinal } from './fantasy-context.mjs';
import { DEFENSE_POSITIONS, GAME_STATS, PLAYER_METRICS, SMALL_SAMPLE, USAGE_GAME_KEYS, validateDefenseInsights } from './fantasy-defense.mjs';

export const KIND_LABEL = Object.freeze({ observed: 'Observed', estimate: 'Estimate', unavailable: 'Not available' });
export const KIND_TONE = Object.freeze({ observed: 'data', estimate: 'pending', unavailable: 'neutral' });
/** A split difference at or above this share of the smaller value reads as a lean; below it, as no clear difference. */
export const LEAN = 0.15;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const pct = value => (finite(value) ? `${(value * 100).toFixed(1)}%` : '—');
const one = value => (finite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '—');
const two = value => (finite(value) ? (Math.round(value * 100) / 100).toFixed(2) : '—');
const plural = (n, word) => `${n} ${n === 1 ? word : word === 'carry' ? 'carries' : `${word}s`}`;
const POSITION_PLURAL = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' };
const most = (rank, of = null) => (rank === 1 ? 'highest' : rank === of ? 'lowest' : `${ordinal(rank)}-highest`);

/** The insights block when it is present and valid for this snapshot; otherwise null (shown as Not available). */
export function defenseInsights(snapshot) {
  const defense = snapshot?.defense;
  if (!defense) return null;
  return validateDefenseInsights(defense, { season: snapshot.season, week: snapshot.week }).valid ? defense : null;
}

function weights(settings) {
  const rules = scoringRules(settings) ?? scoringRules({});
  return Object.fromEntries(rules.offense.map(rule => [rule.key, rule.points]));
}
/** Fantasy points of a raw play-level tally under the selected format. Play splits leave out two-point conversions. */
export function scoreRaw(raw, type, settings = {}) {
  if (!raw || !finite(raw.n)) return null;
  const w = weights(settings), fumbles = (raw.fum ?? 0) * w.fumblesLost;
  if (type === 'recv') return raw.rec * w.receptions + raw.yds * w.receivingYards + raw.td * w.receivingTds + fumbles;
  if (type === 'rush') return raw.yds * w.rushingYards + raw.td * w.rushingTds + fumbles;
  if (type === 'pass') return raw.yds * w.passingYards + raw.td * w.passingTds + raw.int * w.interceptions + (raw.rushYds ?? 0) * w.rushingYards + (raw.rushTd ?? 0) * w.rushingTds + fumbles;
  return null;
}
/** Points per play unit (target, carry or dropback) with its sample. */
export function perUnit(raw, type, settings = {}) {
  const points = scoreRaw(raw, type, settings);
  return { value: raw?.n > 0 && points !== null ? points / raw.n : null, n: raw?.n ?? 0 };
}
/** Average fantasy points per game in one game-level bucket ([games, ...sums in GAME_STATS order]). */
export function bucketPoints(bucket, position, settings = {}) {
  if (!Array.isArray(bucket) || !(bucket[0] > 0)) return { value: null, games: 0 };
  const stats = Object.fromEntries(GAME_STATS.map((key, i) => [key, bucket[i + 1] / bucket[0]]));
  return { value: scoreStats(stats, { ...settings, position }), games: bucket[0] };
}

/** One displayed row. `kind` decides the label; `small` flags a sample below the threshold for its unit. */
function row(id, label, { value, text, kind, n = 0, sample = '', period = null, basis = null, small = false, rank = null, of = null }) {
  if (kind === 'unavailable' || value === null || value === undefined || (finite(value) === false && text === undefined)) {
    return { id, label, text: 'Not available', kind: 'unavailable', n: 0, sample: '', period: null, basis, small: false, rank: null };
  }
  return { id, label, text: text ?? String(value), value, kind, n, sample, period, basis, small, rank: rank && of ? `${most(rank, of)} of ${of}` : null };
}
const teamMetric = (id, label, m, format = pct, sampleWord = 'dropback') => row(id, label, {
  value: m?.value ?? null, text: m?.value !== null && m?.value !== undefined ? format(m.value) : undefined, kind: m?.kind ?? 'unavailable', n: m?.n ?? 0,
  sample: m?.n ? plural(m.n, sampleWord) : '', period: m?.period ?? null, basis: m?.basis ?? null, small: !!m?.small, rank: m?.rank, of: m?.of,
});

/** Split of two raw tallies: per-unit points for each side, the lean, and whether either side is a small sample. */
export function compareSplit(a, b, type, settings, minimum) {
  const left = perUnit(a, type, settings), right = perUnit(b, type, settings);
  if (left.value === null || right.value === null) return { left, right, lean: null, small: true };
  const small = left.n < minimum || right.n < minimum;
  const base = Math.max(Math.min(Math.abs(left.value), Math.abs(right.value)), 0.1);
  const diff = (left.value - right.value) / base;
  return { left, right, small, lean: Math.abs(diff) < LEAN ? 'even' : diff > 0 ? 'left' : 'right' };
}

const unitOf = position => (position === 'QB' ? { type: 'pass', word: 'dropback', min: SMALL_SAMPLE.dropbacks } : { type: 'recv', word: 'target', min: SMALL_SAMPLE.targets });

/** Coverage scheme: what the opponent plays and how the player has produced against each. */
function coverageSection(insight, profile, position, settings) {
  const unit = unitOf(position), rows = [];
  rows.push(teamMetric('opp-man', 'Opponent man coverage rate', profile?.coverage?.man));
  if (profile?.coverage?.shells?.length) rows.push(row('opp-shell', 'Most-used coverage shell', {
    value: profile.coverage.shells[0].value, text: `${profile.coverage.shells[0].shell.replace('_', ' ').replace('COVER', 'Cover')} · ${pct(profile.coverage.shells[0].value)}`,
    kind: profile.coverage.shells[0].kind, n: profile.coverage.shells[0].n, sample: plural(profile.coverage.shells[0].n, 'dropback'), period: profile.coverage.shells[0].period, basis: profile.coverage.shells[0].basis, small: profile.coverage.shells[0].small,
  }));
  rows.push(teamMetric('opp-blitz', 'Opponent blitz rate', profile?.coverage?.blitz));
  rows.push(teamMetric('opp-pressure', 'Opponent pressure rate', profile?.coverage?.pressure));
  if (profile?.coverage?.pressurePrior?.value !== null && profile?.coverage?.pressure?.kind === 'estimate') rows.push(teamMetric('opp-pressure-prior', 'Charted pressure rate, last season', profile.coverage.pressurePrior));
  const splits = [];
  if (insight?.coverage) {
    const split = insight?.coverage ? compareSplit(insight.coverage.man, insight.coverage.zone, unit.type, settings, unit.min) : null;
    splits.push(splitRow('split-man', `Pts per ${unit.word} vs man`, split?.left, unit, insight?.coverage?.seasons));
    splits.push(splitRow('split-zone', `Pts per ${unit.word} vs zone`, split?.right, unit, insight?.coverage?.seasons));
    if (insight?.coverage?.onField && position !== 'QB') {
      const of = insight.coverage.onField;
      for (const side of ['man', 'zone']) {
        const n = of[side], targets = insight.coverage[side]?.n ?? 0;
        splits.push(row(`split-tprr-${side}`, `Targets per dropback on field vs ${side}`, { value: n ? targets / n : null, text: n ? two(targets / n) : undefined, kind: n ? 'observed' : 'unavailable', n, sample: plural(n, 'dropback'), period: insight.coverage.seasons, basis: 'Targets per team dropback he was on the field for (participation): a targets-per-route proxy', small: n < SMALL_SAMPLE.dropbacks }));
      }
    }
  } else splits.push(row('split-man', 'Production vs man and zone', { value: null, kind: 'unavailable', basis: 'Needs participation charting for seasons he played; none is published for this season' }));
  if (insight?.blitz) {
    const split = compareSplit(insight.blitz.blitz, insight.blitz.none, unit.type, settings, unit.min);
    splits.push(splitRow('split-blitz', `Pts per ${unit.word} vs blitz`, split.left, unit, insight.blitz.seasons));
    splits.push(splitRow('split-noblitz', `Pts per ${unit.word}, no blitz`, split.right, unit, insight.blitz.seasons));
    if (insight.blitz.teamTargets) for (const side of ['blitz', 'none']) {
      const team = insight.blitz.teamTargets[side], mine = insight.blitz[side]?.n ?? 0;
      splits.push(row(`split-share-${side}`, `Target share ${side === 'blitz' ? 'vs blitz' : 'without a blitz'}`, { value: team ? mine / team : null, text: team ? pct(mine / team) : undefined, kind: team ? 'observed' : 'unavailable', n: team, sample: plural(team, 'team target'), period: insight.blitz.seasons, basis: 'His share of team targets in his games (FTN blitz charting)', small: team < 40 }));
    }
  } else splits.push(row('split-blitz', 'Production vs blitz', { value: null, kind: 'unavailable', basis: 'No FTN charting for his games' }));
  if (position === 'QB') {
    if (insight?.pressure) {
      const split = compareSplit(insight.pressure.pressured, insight.pressure.clean, 'pass', settings, SMALL_SAMPLE.dropbacks);
      splits.push(splitRow('split-pressured', 'Pts per dropback under pressure', split.left, unit, insight.pressure.seasons));
      splits.push(splitRow('split-clean', 'Pts per dropback, clean pocket', split.right, unit, insight.pressure.seasons));
    } else splits.push(row('split-pressured', 'Production under pressure', { value: null, kind: 'unavailable', basis: 'Charted pressure is published after each season; none exists for his recorded dropbacks' }));
  }
  return { id: 'coverage', title: 'Coverage scheme', opponent: rows, player: splits };
}
function splitRow(id, label, side, unit, seasons) {
  return row(id, label, { value: side?.value ?? null, text: side?.value !== null && side?.value !== undefined ? two(side.value) : undefined, kind: side?.n ? 'observed' : 'unavailable',
    n: side?.n ?? 0, sample: plural(side?.n ?? 0, unit.word), period: seasons ?? null, small: (side?.n ?? 0) < unit.min });
}

function frontSection(insight, profile, position, settings) {
  const rows = [];
  const front = profile?.front;
  rows.push(row('opp-base', 'Base front', { value: front?.base ?? null, text: front?.base ? `${front.base} style · ${pct(front.lightFront.value)} odd-front snaps` : undefined,
    kind: front?.lightFront?.kind ?? 'unavailable', n: front?.lightFront?.n ?? 0, sample: plural(front?.lightFront?.n ?? 0, 'snap'), period: front?.lightFront?.period, basis: front?.lightFront?.basis, small: !!front?.lightFront?.small }));
  rows.push(teamMetric('opp-nickel', 'Nickel (5 DBs) rate', front?.nickel, pct, 'snap'));
  rows.push(teamMetric('opp-dime', 'Dime (6+ DBs) rate', front?.dime, pct, 'snap'));
  rows.push(teamMetric('opp-box', 'Eight-man box rate on runs', front?.box, pct, 'run'));
  rows.push(teamMetric('opp-ypc', 'Yards per carry allowed', front?.runs, one, 'carry'));
  for (const side of ['left', 'middle', 'right']) rows.push(teamMetric(`opp-run-${side}`, `Runs to offense's ${side}: yards per carry`, front?.runLoc?.[side], one, 'carry'));
  for (const gap of ['end', 'tackle', 'guard']) rows.push(teamMetric(`opp-gap-${gap}`, `Runs outside the ${gap}: yards per carry`, front?.runGap?.[gap], one, 'carry'));
  const splits = [];
  if (position === 'RB') {
    if (insight?.box) for (const [key, label] of [['light', 'light box (6 or fewer)'], ['base', 'seven in the box'], ['heavy', 'stacked box (8+)']]) {
      const side = perUnit(insight.box[key], 'rush', settings), raw = insight.box[key];
      splits.push(row(`split-box-${key}`, `Yards per carry, ${label}`, { value: raw?.n ? raw.yds / raw.n : null, text: raw?.n ? `${one(raw.yds / raw.n)} · ${two(side.value)} pts/carry` : undefined, kind: raw?.n ? 'observed' : 'unavailable', n: raw?.n ?? 0, sample: plural(raw?.n ?? 0, 'carry'), period: insight.seasons, small: (raw?.n ?? 0) < SMALL_SAMPLE.carries }));
    } else splits.push(row('split-box', 'Production by box count', { value: null, kind: 'unavailable', basis: 'No FTN charting for his carries' }));
    if (insight?.runLoc) for (const side of ['left', 'middle', 'right']) {
      const raw = insight.runLoc[side], total = insight.runLoc.left.n + insight.runLoc.middle.n + insight.runLoc.right.n;
      splits.push(row(`split-dir-${side}`, `His runs to the ${side}`, { value: raw.n ? raw.yds / raw.n : null, text: raw.n ? `${pct(raw.n / total)} of carries · ${one(raw.yds / raw.n)} YPC` : undefined, kind: raw.n ? 'observed' : 'unavailable', n: raw.n, sample: plural(raw.n, 'carry'), period: insight.seasons, small: raw.n < SMALL_SAMPLE.carries }));
    }
  }
  const style = insight?.style;
  if (style) {
    const odd = bucketPoints(style.odd, position, settings), even = bucketPoints(style.even, position, settings);
    splits.push(row('split-odd', 'Pts per game vs 3-4 style fronts', { value: odd.value, text: finite(odd.value) ? one(odd.value) : undefined, kind: odd.games ? style.kinds.front : 'unavailable', n: odd.games, sample: plural(odd.games, 'game'), period: insight.seasons, basis: 'Opponent front classified from participation personnel (this season uses last season\'s)', small: odd.games < SMALL_SAMPLE.games }));
    splits.push(row('split-even', 'Pts per game vs 4-3 style fronts', { value: even.value, text: finite(even.value) ? one(even.value) : undefined, kind: even.games ? style.kinds.front : 'unavailable', n: even.games, sample: plural(even.games, 'game'), period: insight.seasons, basis: 'Opponent front classified from participation personnel (this season uses last season\'s)', small: even.games < SMALL_SAMPLE.games }));
    for (const [key, label, kindKey] of [['manHeavy', 'man-heavy defenses', 'coverage'], ['zoneHeavy', 'zone-heavy defenses', 'coverage'], ['blitzHeavy', 'blitz-heavy defenses', 'blitz'], ['blitzLight', 'low-blitz defenses', 'blitz']]) {
      const b = bucketPoints(style[key], position, settings);
      splits.push(row(`split-${key}`, `Pts per game vs ${label}`, { value: b.value, text: finite(b.value) ? one(b.value) : undefined, kind: b.games ? style.kinds[kindKey] : 'unavailable', n: b.games, sample: plural(b.games, 'game'), period: insight.seasons, basis: 'Opponents above or below the league median for that season', small: b.games < SMALL_SAMPLE.games }));
    }
  }
  return { id: 'front', title: 'Defensive front', opponent: rows, player: splits };
}

function environmentSection(insight, profile, game, position, settings, wind) {
  const rows = [];
  rows.push(row('game-roof', 'Roof', { value: game?.roof ?? null, text: game?.roof ? `${game.roof[0].toUpperCase()}${game.roof.slice(1)}${game.stadium ? ` · ${game.stadium}` : ''}` : undefined, kind: game?.roof ? 'observed' : 'unavailable', period: 'Schedule', basis: 'nflverse schedule' }));
  rows.push(row('game-surface', 'Surface', { value: game?.surface ?? null, text: game?.surface ?? undefined, kind: game?.surface ? 'observed' : 'unavailable', period: 'Schedule', basis: 'nflverse schedule' }));
  if (wind) rows.push(row('game-weather', 'Weather', { value: wind, text: wind, kind: wind === 'Forecast not available yet' ? 'unavailable' : 'observed', period: 'Forecast', basis: 'The app\'s game-day wind forecast' }));
  rows.push(teamMetric('opp-plays', 'Opponent plays faced per game', profile?.pace?.playsFaced, one, 'game'));
  rows.push(teamMetric('opp-off-plays', 'Opponent offense plays per game', profile?.pace?.offensePlays, one, 'game'));
  const splits = [];
  const env = insight?.environment;
  for (const [key, label] of [['indoor', 'indoors'], ['outdoor', 'outdoors'], ['grass', 'on grass'], ['turf', 'on turf']]) {
    const b = bucketPoints(env?.[key], position, settings);
    splits.push(row(`split-${key}`, `Pts per game ${label}`, { value: b.value, text: finite(b.value) ? one(b.value) : undefined, kind: b.games ? 'observed' : 'unavailable', n: b.games, sample: plural(b.games, 'game'), period: insight?.seasons, small: b.games < SMALL_SAMPLE.games }));
  }
  return { id: 'environment', title: 'Game environment', opponent: rows, player: splits };
}

/**
 * Game script from the viewer's own gated lines reply only: implied team total and spread, with an expected pass rate
 * and expected plays that are labelled estimates. Locked or missing lines say so; nothing is guessed.
 */
export function gameScript({ player, profile, teamProfile, league, lines }) {
  const id = gameIdFor(player), opponent = opponentOf(player), game = id ? lines?.games?.get(id) ?? null : null;
  const implied = game ? impliedTotals(game) : null;
  const rows = [];
  const expectedPlays = finite(teamProfile?.pace?.offensePlays?.value) && finite(profile?.pace?.playsFaced?.value)
    ? (teamProfile.pace.offensePlays.value + profile.pace.playsFaced.value) / 2 : null;
  rows.push(row('script-plays', 'Expected team plays', { value: expectedPlays, text: finite(expectedPlays) ? one(expectedPlays) : undefined, kind: 'estimate', n: Math.min(teamProfile?.pace?.offensePlays?.n ?? 0, profile?.pace?.playsFaced?.n ?? 0),
    sample: 'games each', period: teamProfile?.pace?.offensePlays?.period, basis: 'Average of his offense\'s plays per game and the opponent defense\'s plays faced per game', small: Math.min(teamProfile?.pace?.offensePlays?.n ?? 0, profile?.pace?.playsFaced?.n ?? 0) < SMALL_SAMPLE.games }));
  rows.push(teamMetric('script-neutral', 'His offense\'s neutral pass rate', teamProfile?.pace?.neutralPassRate, pct, 'play'));
  let status = null;
  if (!lines || lines.status === 'unavailable') status = 'Lines are not available right now.';
  else if (!game || implied?.missing) status = 'No verified lines for this game yet.';
  else if (implied?.locked) status = `Lock your ${id.replace('-', '–')} ${implied.locked.length === 2 ? 'spread and total guesses' : `${implied.locked[0]} guess`} to see the game script.`;
  if (implied && 'home' in implied && opponent) {
    const team = opponent.home ? implied.home : implied.away, spread = opponent.home ? game.spread.value : -game.spread.value;
    rows.push(row('script-total', 'Implied team total', { value: team, text: formatFantasyNumber(team), kind: 'observed', n: implied.bookCount, sample: plural(implied.bookCount, 'sportsbook'), period: 'Your saved lines', basis: 'Median of verified sportsbook quotes' }));
    rows.push(row('script-spread', 'Team spread', { value: spread, text: `${spread > 0 ? '+' : ''}${formatFantasyNumber(spread)}`, kind: 'observed', n: implied.bookCount, sample: plural(implied.bookCount, 'sportsbook'), period: 'Your saved lines', basis: 'Median of verified sportsbook quotes' }));
    const slope = league?.passRateBySpread?.slope, neutral = teamProfile?.pace?.neutralPassRate?.value;
    const expected = finite(slope) && finite(neutral) ? Math.min(0.9, Math.max(0.3, neutral + (league.passRateBySpread.intercept ?? 0) + slope * spread)) : null;
    rows.push(row('script-pass', 'Expected pass rate', { value: expected, text: finite(expected) ? pct(expected) : undefined, kind: 'estimate', n: league?.passRateBySpread?.games ?? 0, sample: plural(league?.passRateBySpread?.games ?? 0, 'team game'),
      period: 'Completed games, this and last season', basis: `Neutral pass rate plus the league's pass-rate shift per point of spread (${finite(slope) ? `${(slope * 100).toFixed(2)} points of pass rate per point` : 'unavailable'}) from archived closing lines` }));
  }
  return { id: 'script', title: 'Game script', opponent: rows, player: [], status };
}

const INJURY_EFFECT = {
  CB: 'Thinner at cornerback: more room for wide receivers and the passing game.', S: 'Thinner at safety: more room for tight ends, deep shots and the passing game.',
  EDGE: 'Less edge pressure: cleaner pockets for the quarterback.', IDL: 'Thinner inside: running lanes up the middle may open.', LB: 'Thinner at linebacker: running backs and tight ends may find more room.',
};
function injuriesSection(profile, position) {
  const list = profile?.injuries ?? [];
  const rows = list.map(item => row(`inj-${item.id}`, `${item.name} · ${item.position}`, { value: item.status, text: `${item.status}${item.injury ? ` (${item.injury})` : ''} · ${item.role === 'regular' ? 'regular contributor' : item.role === 'rotational' ? 'rotational' : item.role === 'limited' ? 'limited role' : 'role unknown'}`,
    kind: 'observed', n: item.games, sample: `${item.games} of ${item.teamGames} games with a stat line`, period: 'This week\'s injury report', basis: 'Status from the injury report (observed); role estimated from games with recorded defensive stats and tackles or disruptive plays per game' }));
  const helps = { QB: ['CB', 'S', 'EDGE'], WR: ['CB', 'S'], TE: ['S', 'LB'], RB: ['IDL', 'LB', 'EDGE'] }[position] ?? [];
  const relevant = list.filter(item => ['Out', 'Doubtful'].includes(item.status) && ['regular', 'rotational'].includes(item.role) && helps.includes(item.group));
  const effect = [...new Set(relevant.map(item => item.group))].map(group => INJURY_EFFECT[group]);
  return { id: 'injuries', title: 'Opponent defensive injuries', opponent: rows, player: [], effects: effect, empty: list.length ? null : 'No defensive players listed Out, Doubtful or Questionable.' };
}

/** Season and last-three-game averages of one usage column, each with its sample. */
export function usageAverages(games, key) {
  const index = USAGE_GAME_KEYS.indexOf(key);
  const of = list => { const known = list.map(game => game[index]).filter(finite); return { value: known.length ? known.reduce((s, v) => s + v, 0) / known.length : null, n: known.length }; };
  return { season: of(games), recent: of(games.slice(-3)) };
}
function usageSection(insight, position) {
  const usage = insight?.usage, rows = [];
  const games = usage?.games ?? [];
  const lines = position === 'QB' ? [['attempts', 'Pass attempts per game', one]] : [
    ['targetShare', 'Target share', pct], ['airYardsShare', 'Air-yards share', pct], ['airYards', 'Air yards per game', one], ['carryShare', 'Carry share', pct], ['redZone', 'Red-zone looks per game', one]];
  for (const [key, label, format] of lines) {
    if (key === 'carryShare' && !['RB', 'QB'].includes(position)) continue;
    if (['targetShare', 'airYardsShare', 'airYards'].includes(key) && position === 'QB') continue;
    const { season, recent } = usageAverages(games, key);
    rows.push(row(`use-${key}`, label, { value: season.value, text: finite(season.value) ? `${format(season.value)} · last 3: ${format(recent.value)}` : undefined, kind: season.n ? 'observed' : 'unavailable', n: season.n, sample: plural(season.n, 'game'), period: usage?.period, small: season.n < SMALL_SAMPLE.games,
      basis: key === 'redZone' ? 'Targets plus designed carries inside the opponent 20 (play-by-play)' : 'nflverse weekly player statistics' }));
  }
  const compactRow = (key, label, format) => {
    const m = usage?.[key] ?? { kind: 'unavailable', value: null, n: 0 }, spec = PLAYER_METRICS[key];
    return row(`use-${key}`, label, { value: m.value, text: finite(m.value) ? format(m.value) : undefined, kind: m.kind, n: m.n, sample: m.n ? plural(m.n, key === 'routeRate' ? 'team dropback' : 'target') : '',
      period: m.season ? `${m.season} season` : usage?.period, basis: spec?.[m.kind] ?? null, small: !!m.small });
  };
  rows.push(compactRow('snapShare', 'Snap share', pct));
  if (position !== 'QB') rows.push(compactRow('routeRate', 'Route participation', pct));
  return { id: 'usage', title: 'Usage trend', opponent: [], player: rows };
}

function alignmentSection(insight, profile, league, position, settings) {
  const usage = insight?.usage, rows = [], opponent = [];
  if (position === 'QB') return null;
  const compactRow = (key, label, format) => {
    const m = usage?.[key] ?? { kind: 'unavailable', value: null, n: 0 };
    return row(`align-${key}`, label, { value: m.value, text: finite(m.value) ? format(m.value) : undefined, kind: m.kind, n: m.n, sample: m.n ? plural(m.n, 'target') : '', period: usage?.period, basis: PLAYER_METRICS[key]?.[m.kind] ?? null, small: !!m.small });
  };
  if (['WR', 'TE'].includes(position)) { rows.push(compactRow('middleShare', 'Middle-of-field target share (slot proxy)', pct)); rows.push(compactRow('deepShare', 'Deep target share', pct)); rows.push(compactRow('adot', 'Average depth of target', one)); }
  const allowedRow = (id, label, raw, leagueRaw) => {
    const mine = perUnit(raw, 'recv', settings), all = perUnit(leagueRaw, 'recv', settings);
    return row(id, label, { value: mine.value, text: finite(mine.value) ? `${two(mine.value)} · league ${two(all.value)}` : undefined, kind: mine.n ? 'observed' : 'unavailable', n: mine.n, sample: plural(mine.n, 'target'), period: profile?.allowed?.period, basis: 'Fantasy points per target allowed (play-by-play)', small: mine.n < SMALL_SAMPLE.targets * 2 });
  };
  if (position === 'WR') {
    opponent.push(allowedRow('opp-wr-outside', 'Pts per WR target allowed, outside', profile?.allowed?.wrOutside, league?.allowed?.wrOutside));
    opponent.push(allowedRow('opp-wr-middle', 'Pts per WR target allowed, middle', profile?.allowed?.wrMiddle, league?.allowed?.wrMiddle));
    opponent.push(row('opp-wr-slot', 'Slot vs outside cornerback alignment', { value: null, kind: 'unavailable', basis: 'Alignment charting is not in free, reuse-licensed data; pass location stands in above' }));
  } else {
    opponent.push(allowedRow(`opp-${position}-recv`, `Pts per ${position} target allowed`, profile?.allowed?.[position], league?.allowed?.[position]));
    opponent.push(row('opp-lb-coverage', 'Linebacker coverage specifically', { value: null, kind: 'unavailable', basis: 'Defender-level coverage is not in free, reuse-licensed data; targets to the position stand in above' }));
  }
  return { id: 'alignment', title: 'Position vs alignment', opponent, player: rows };
}

/**
 * Rule-based sentences on how the opponent's style could affect the player, each tagged favorable, unfavorable or
 * neutral, with its kind and a small-sample flag. A sentence needs both sides of a split to exist; otherwise it is left out.
 */
export function explainMatchup({ player, insight, profile, league, table, settings }) {
  const out = [], position = player.position, unit = unitOf(position), opp = opponentOf(player)?.opponent;
  const add = (id, tone, text, kind, small = false) => out.push({ id, tone, text, kind, small });
  const tendency = (m, label) => (m?.value === null || m?.value === undefined ? null : m.rank && m.of ? (m.rank <= Math.ceil(m.of / 4) ? `high ${label}` : m.rank > m.of - Math.ceil(m.of / 4) ? `low ${label}` : null) : null);
  const allowed = table?.rows?.get(opp);
  if (allowed?.adjustedRank && allowed.adjustedGames) {
    const top = allowed.adjustedRank <= 8, bottom = allowed.adjustedRank > table.teams - 8;
    add('adjusted', top ? 'favorable' : bottom ? 'unfavorable' : 'neutral', `${opp} allows ${allowed.adjusted >= 0 ? `${one(allowed.adjusted)} more` : `${one(-allowed.adjusted)} fewer`} points to ${POSITION_PLURAL[position]} than those offenses usually score (${ordinal(allowed.adjustedRank)} softest of ${table.teams}, ${plural(allowed.adjustedGames, 'game')}).`, 'observed', allowed.adjustedGames < SMALL_SAMPLE.games);
  }
  const man = profile?.coverage?.man, manStyle = tendency(man, 'man rate');
  if (insight?.coverage && manStyle) {
    const split = compareSplit(insight.coverage.man, insight.coverage.zone, unit.type, settings, unit.min);
    if (split.lean && split.lean !== 'even') {
      const better = split.lean === 'left' ? 'man' : 'zone', facing = manStyle.startsWith('high') ? 'man' : 'zone';
      add('coverage', better === facing ? 'favorable' : 'unfavorable', `${opp} plays a lot of ${facing} (${pct(man.value)} man, ${man.kind === 'estimate' ? 'estimated from last season' : 'observed'}). ${player.name} has scored ${two(split.left.value)} pts per ${unit.word} vs man and ${two(split.right.value)} vs zone (${insight.coverage.seasons}).`,
        man.kind === 'estimate' ? 'estimate' : 'observed', split.small || man.small);
    }
  }
  const blitzStyle = tendency(profile?.coverage?.blitz, 'blitz rate');
  if (insight?.blitz && blitzStyle) {
    const split = compareSplit(insight.blitz.blitz, insight.blitz.none, unit.type, settings, unit.min);
    if (split.lean && split.lean !== 'even') {
      const heavy = blitzStyle.startsWith('high'), betterVsBlitz = split.lean === 'left';
      add('blitz', heavy === betterVsBlitz ? 'favorable' : 'unfavorable', `${opp} blitzes on ${pct(profile.coverage.blitz.value)} of dropbacks (${ordinal(profile.coverage.blitz.rank)} of ${profile.coverage.blitz.of}). ${player.name} has scored ${two(split.left.value)} pts per ${unit.word} against the blitz and ${two(split.right.value)} without one.`,
        profile.coverage.blitz.kind, split.small || profile.coverage.blitz.small);
    }
  }
  if (position === 'QB' && insight?.pressure && profile?.coverage?.pressure?.rank) {
    const split = compareSplit(insight.pressure.pressured, insight.pressure.clean, 'pass', settings, SMALL_SAMPLE.dropbacks), m = profile.coverage.pressure;
    const high = m.rank <= Math.ceil(m.of / 4), low = m.rank > m.of - Math.ceil(m.of / 4);
    // High pressure hurts only a passer who has produced less under pressure; low pressure helps only that passer.
    const worseUnderPressure = split.lean === 'right';
    if (high || low) add('pressure', worseUnderPressure ? (high ? 'unfavorable' : 'favorable') : 'neutral', `${opp} ${high ? 'gets home often' : 'rarely gets home'} (${pct(m.value)} ${m.kind === 'estimate' ? 'sacks plus QB hits per dropback, an estimate' : 'pressure rate'}). Under pressure ${player.name} has scored ${two(split.left.value)} pts per dropback vs ${two(split.right.value)} from a clean pocket.`, m.kind, split.small || m.small);
  }
  if (position === 'RB' && profile?.front) {
    const runs = profile.front.runs;
    if (runs?.rank) {
      const soft = runs.rank <= 8, stout = runs.rank > runs.of - 8;
      if (soft || stout) add('run', soft ? 'favorable' : 'unfavorable', `${opp} allows ${one(runs.value)} yards per designed carry (${most(runs.rank, runs.of)} of ${runs.of}).`, 'observed', runs.small);
    }
    if (insight?.runLoc) {
      const sides = ['left', 'middle', 'right'], total = sides.reduce((s, k) => s + insight.runLoc[k].n, 0);
      const favorite = sides.slice().sort((a, b) => insight.runLoc[b].n - insight.runLoc[a].n)[0], allowed = profile.front.runLoc?.[favorite];
      if (total >= SMALL_SAMPLE.carries && allowed?.value !== null && allowed?.rank) {
        const leagueYpc = league?.runLoc?.[favorite];
        add('direction', allowed.value > (leagueYpc ?? allowed.value) ? 'favorable' : 'unfavorable', `${player.name} runs to the ${favorite} on ${pct(insight.runLoc[favorite].n / total)} of his carries; ${opp} allows ${one(allowed.value)} yards per carry there (league ${one(leagueYpc)}).`, 'observed', allowed.small);
      }
    }
    if (insight?.box && profile.front.box?.rank) {
      const heavy = profile.front.box.rank <= 8;
      const light = insight.box.light, stacked = insight.box.heavy;
      if (heavy && stacked.n && light.n) add('box', stacked.yds / stacked.n < light.yds / light.n ? 'unfavorable' : 'neutral', `${opp} stacks eight or more in the box on ${pct(profile.front.box.value)} of runs; ${player.name} averages ${one(stacked.yds / stacked.n)} yards per carry into stacked boxes vs ${one(light.yds / light.n)} into light ones.`, profile.front.box.kind, stacked.n < SMALL_SAMPLE.carries);
    }
  }
  if (position === 'WR' && profile?.allowed) {
    const middle = insight?.usage?.middleShare, where = middle?.value !== null && middle?.value !== undefined && middle.value >= 0.35 ? 'wrMiddle' : 'wrOutside';
    const mine = perUnit(profile.allowed[where], 'recv', settings), all = perUnit(league?.allowed?.[where], 'recv', settings);
    if (mine.value !== null && all.value !== null && Math.abs(mine.value - all.value) / Math.max(all.value, 0.1) >= LEAN) add('alignment', mine.value > all.value ? 'favorable' : 'unfavorable',
      `${player.name} works mostly ${where === 'wrMiddle' ? 'over the middle (a slot-role proxy)' : 'outside'}; ${opp} gives up ${two(mine.value)} pts per WR target there vs ${two(all.value)} league-wide.`, 'estimate', mine.n < SMALL_SAMPLE.targets * 2);
  }
  if (['TE', 'RB'].includes(position) && profile?.allowed?.[position]) {
    const mine = perUnit(profile.allowed[position], 'recv', settings), all = perUnit(league?.allowed?.[position], 'recv', settings);
    if (mine.value !== null && all.value !== null && Math.abs(mine.value - all.value) / Math.max(all.value, 0.1) >= LEAN) add('receiving', mine.value > all.value ? 'favorable' : 'unfavorable',
      `${opp} allows ${two(mine.value)} pts per ${position} target vs ${two(all.value)} league-wide (${plural(mine.n, 'target')}).`, 'observed', mine.n < SMALL_SAMPLE.targets * 2);
  }
  return out;
}

/**
 * Everything the player's defensive-matchup section shows. `status` is 'ready', or why nothing can be shown:
 * 'unavailable' (no valid insights in this snapshot), 'position' (not a QB/RB/WR/TE), 'bye' or 'no-opponent'.
 */
export function playerMatchupView(snapshot, playerId, settings = {}, { lines = null, weather = null } = {}) {
  const player = snapshot?.players?.find(item => item.id === playerId);
  if (!player) return null;
  if (!DEFENSE_POSITIONS.includes(player.position)) return { status: 'position', player };
  const defense = defenseInsights(snapshot);
  if (!defense) return { status: 'unavailable', player };
  if (player.weekly?.status === 'bye') return { status: 'bye', player };
  const opponent = opponentOf(player);
  if (!opponent || player.weekly?.status !== 'scheduled') return { status: 'no-opponent', player };
  const profile = defense.teams[opponent.opponent] ?? null, teamProfile = defense.teams[player.team] ?? null;
  const insight = defense.players[player.id] ?? null, game = defense.games[gameIdFor(player)] ?? null;
  const table = matchupTable(snapshot, player.position, settings);
  const sections = [
    coverageSection(insight, profile, player.position, settings),
    frontSection(insight, profile, player.position, settings),
    environmentSection(insight, profile, game, player.position, settings, weather),
    gameScript({ player, profile, teamProfile, league: defense.league, lines }),
    injuriesSection(profile, player.position),
    usageSection(insight, player.position),
    alignmentSection(insight, profile, defense.league, player.position, settings),
  ].filter(Boolean);
  return {
    status: 'ready', player, opponent: opponent.opponent, home: opponent.home, sections,
    explanations: explainMatchup({ player, insight, profile, league: defense.league, table, settings }),
    hasHistory: !!insight, method: defense.method, sources: defense.sources, coverage: defense.coverage,
  };
}

export const TABLE_SORTS = Object.freeze([
  { value: 'adjusted', label: 'Adjusted' }, { value: 'recent', label: 'Last 4' }, { value: 'season', label: 'Season' },
]);
/**
 * The defense ranking table for one position: season, last-four and opponent-adjusted fantasy points allowed per game,
 * sorted by the chosen column (most allowed first, unranked teams last), with each team's style tendencies when the
 * snapshot carries insights.
 */
export function defenseRankingTable(snapshot, position, settings = {}, sort = 'adjusted') {
  const table = matchupTable(snapshot, position, settings);
  if (!table) return null;
  const defense = defenseInsights(snapshot);
  const key = TABLE_SORTS.some(option => option.value === sort) ? sort : 'adjusted';
  const rows = [...table.rows.values()].map(item => {
    const profile = defense?.teams?.[item.team];
    return { ...item, rank: item[`${key}Rank`] ?? null, small: item.seasonGames < SMALL_SAMPLE.games,
      style: profile ? { man: profile.coverage.man, blitz: profile.coverage.blitz, pressure: profile.coverage.pressure, base: profile.front.base, baseKind: profile.front.lightFront.kind, nickel: profile.front.nickel, ypc: profile.front.runs, plays: profile.pace.playsFaced } : null };
  }).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.team.localeCompare(b.team));
  return { position, sort: key, recentGames: table.recentGames, rows, hasStyles: !!defense };
}
export const formatRate = pct;
export const formatTenth = one;
