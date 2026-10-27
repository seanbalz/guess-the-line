// Streaks, badges and awards as screen data (redesign build plan stage 71). Pure: it turns the POST /league/features reply
// (cloud/features.mjs featuresView) into what the screens draw, and decides nothing the server has not. Wording follows
// the approved prototype's shelf, badge detail, awards sheet and recap card; numbers use format.js (a real minus, "—").
import { AWARD_BY_ID, BADGES, BADGE_BY_ID, RARITY_LABEL, STREAK_BY_ID } from '../../../../shared/game-features/catalog.mjs';
import { DASH, SEP, fmtAmt, fmtNum, fmtPct, fmtRecord, fmtSide, fmtSpreadPick, plural } from '../format.js';
import { AWARD_ICONS, BADGE_ICONS } from './icons.js';

const RANK = { epic: 0, rare: 1, uncommon: 2, common: 3 };
const LIVE = BADGES.filter(b => b.status === 'live');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** "SEA @ DEN" from a fact's codes, else from a game id written AWAY-HOME ("SEA-DEN"), else "—". */
export function matchupOf(facts) {
  const away = facts?.away ?? /^([A-Z]{2,3})-([A-Z]{2,3})$/.exec(facts?.gameId ?? '')?.[1];
  const home = facts?.home ?? /^([A-Z]{2,3})-([A-Z]{2,3})$/.exec(facts?.gameId ?? '')?.[2];
  return away && home ? { away, home, text: `${away} @ ${home}` } : null;
}
const marketName = market => (market === 'total' ? 'Total' : market === 'spread' ? 'Spread' : '');
const guessText = (market, value, game) => (market === 'total' ? fmtNum(value) : game ? fmtSpreadPick(game.away, game.home, value) : fmtNum(value));
const points = n => (finite(n) ? `${fmtNum(n)} PTS` : DASH);

/** One earned badge's line in its detail: "Week 6 · SEA @ DEN · Total 41 exact". */
export function badgeLine(badge) {
  const f = badge.facts ?? {}, game = matchupOf(f), parts = [`Week ${badge.week}`];
  if (game) parts.push(game.text);
  switch (badge.badge) {
    case 'bullseye': parts.push(`${marketName(f.market)} ${guessText(f.market, f.guess, game)} exact`); break;
    case 'double_bullseye': parts.push(`Spread ${guessText('spread', f.spread, game)} and Total ${fmtNum(f.total)} exact`); break;
    case 'called_the_move': parts.push(`${marketName(f.market)} ${guessText(f.market, f.from, game)} to ${guessText(f.market, f.to, game)}, toward ${guessText(f.market, f.guess, game)}`); break;
    case 'dialed_in': parts.push(`${marketName(f.market)} ${fmtNum(f.points)} of ${fmtNum(f.full)} PTS`); break;
    case 'never_missed': parts.push(`Weeks ${f.from}–${f.to}`); break;
    case 'sharp': parts.push(`${game ? fmtSide(game.away, game.home, f.side, f.side === 'away' ? -f.line : f.line) : fmtNum(f.line)} vs ${fmtNum(f.kickoff)} at kickoff`); break;
    case 'dog_day': parts.push(`${game ? fmtSide(game.away, game.home, f.side, f.side === 'away' ? -f.line : f.line) : fmtNum(f.line)} won outright`); break;
    case 'perfect_week': parts.push(`${plural(f.wins, 'win')}, no losses`); break;
    case 'hot_hand': parts.push(`${plural(f.wins, 'win')} in a row`); break;
    default: break;
  }
  return parts.join(SEP);
}

/** An award's value in words: "18 PTS", "Exact · 10 PTS", "90.9% return · +2.73U · 1–0–0", "Lost by 0.5". */
export function awardValue(award) {
  const v = award.value ?? {};
  switch (award.id) {
    case 'spread_winner': case 'total_winner': case 'spread_champion': case 'total_champion': return points(v.points);
    case 'bets_winner': case 'bets_champion': return [`${fmtPct(finite(v.roi) ? v.roi * 100 : null)} return`, fmtAmt(v.net), fmtRecord(v.wins, v.losses, v.pushes)].join(SEP);
    case 'best_guess': return v.error === 0 ? `Exact${SEP}${points(v.points)}` : `${fmtNum(v.error)} off${SEP}${points(v.points)}`;
    case 'sharpest_bet': return `${fmtNum(v.by)} ${v.by === 1 ? 'pt' : 'pts'} better than the kickoff line`;
    case 'saw_it_coming': return `Line moved ${fmtNum(v.moved)} toward the guess`;
    case 'worst_beat': return `Lost by ${fmtNum(v.lostBy)}`;
    default: return DASH;
  }
}

/** Display names for the winners: "You", "Luke", "Luke and Troy", "Luke, Troy and Sean". */
export function namesText(ids, nameOf, viewer) {
  const names = ids.map(id => (id === viewer ? 'You' : nameOf(id)));
  return names.length <= 1 ? (names[0] ?? DASH) : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One award as a row: `{ id, name, plain, icon, value, winners, people: [{ id, name, you }], who, you }`. */
export function awardRow(award, { nameOf, viewer }) {
  const meta = AWARD_BY_ID[award.id] ?? { name: award.id, plain: '' };
  return { id: award.id, name: meta.name ?? award.id, plain: meta.plain ?? '', icon: AWARD_ICONS[award.id] ?? AWARD_ICONS.spread_winner,
    value: awardValue(award), winners: award.winners, people: award.winners.map(id => ({ id, name: nameOf(id), you: id === viewer })),
    who: namesText(award.winners, nameOf, viewer), you: award.winners.includes(viewer) };
}

/**
 * The screen's model from the reader's reply: `{ ok, ran, recap, history, season, shelf, streaks, mine }`.
 * - recap: the newest week with awards, `{ week, rows, mine }` (mine: the viewer's first award there), or null.
 * - shelf: the viewer's earned badges (rarest first, then most earned) and the live badges still to earn.
 * - streaks: the viewer's Pick streak and Bets streak `{ id, name, unit, current, best }`.
 */
export function featuresModel(reply, { viewer, nameOf = () => 'Player' } = {}) {
  if (!record(reply)) return { ok: false, ran: false, recap: null, history: [], season: null, shelf: { earned: [], toEarn: [], of: LIVE.length }, streaks: [], badgesOf: () => [] };
  const weeks = (reply.awards ?? []).filter(w => w.awards?.length).sort((a, b) => b.week - a.week);
  const toRows = w => ({ week: w.week, rows: w.awards.map(a => awardRow(a, { nameOf, viewer })) });
  const recap = weeks.length ? toRows(weeks[0]) : null;
  if (recap) recap.mine = recap.rows.find(r => r.you) ?? null;
  const badgesOf = userId => {
    const own = (reply.badges ?? []).filter(b => b.userId === userId && BADGE_BY_ID[b.badge]);
    const groups = new Map();
    for (const b of own) groups.set(b.badge, [...(groups.get(b.badge) ?? []), b]);
    return [...groups].map(([id, list]) => ({ ...badgeMeta(id), count: list.length, lines: list.sort((a, b) => Date.parse(b.visibleAt) - Date.parse(a.visibleAt)).map(badgeLine), earned: true }))
      .sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || b.count - a.count || a.name.localeCompare(b.name));
  };
  const earned = badgesOf(viewer);
  const toEarn = LIVE.filter(b => !earned.some(e => e.id === b.id)).map(b => ({ ...badgeMeta(b.id), count: 0, lines: [], earned: false }));
  const own = (reply.streaks ?? []).find(s => s.userId === viewer);
  const streaks = ['pick', 'bets'].map(id => ({ id, name: STREAK_BY_ID[id].name, unit: STREAK_BY_ID[id].unit, current: own?.[id]?.current ?? 0, best: own?.[id]?.best ?? 0 }));
  const season = reply.seasonWinners?.winners?.length ? reply.seasonWinners.winners.map(a => awardRow(a, { nameOf, viewer })) : null;
  return { ok: true, ran: reply.ran === true, recap, history: weeks.slice(1).map(toRows), season, shelf: { earned, toEarn, of: LIVE.length }, streaks, badgesOf,
    streakOf: userId => (reply.streaks ?? []).find(s => s.userId === userId) ?? null };
}

/** A badge's catalog entry for the tile: `{ id, name, rarity, rarityLabel, rule, icon }`. */
export function badgeMeta(id) {
  const b = BADGE_BY_ID[id];
  return { id, name: b.name, rarity: b.rarity, rarityLabel: RARITY_LABEL[b.rarity], rule: b.rule, icon: BADGE_ICONS[id] };
}

/** "Earned once", "Earned 3 times", "Not earned yet". */
export const earnedText = count => (count === 1 ? 'Earned once' : count > 1 ? `Earned ${count} times` : 'Not earned yet');

/**
 * One fact for a board row, when true (the prototype's line-2 rule): "Won Week 7" while that week's recap is the newest,
 * for the board's own market. Null otherwise.
 */
export function boardFact(model, userId, mode) {
  const id = mode === 'guess_total' ? 'total_winner' : 'spread_winner';
  const row = model?.recap?.rows.find(r => r.id === id);
  return row?.winners.includes(userId) ? `Won Week ${model.recap.week}` : null;
}

/**
 * New things to celebrate between two reads in one session (never on page load): the viewer's badges and awards in
 * `next` that `previous` did not have. Each `{ key, kind: 'badge' | 'award', title, meta, icon, rarity }`, oldest first.
 */
export function newCelebrations(previous, next, viewer) {
  if (!record(previous) || !record(next)) return [];
  const seen = new Set((previous.badges ?? []).map(b => b.key));
  const out = (next.badges ?? []).filter(b => b.userId === viewer && !seen.has(b.key) && BADGE_BY_ID[b.badge])
    .sort((a, b) => Date.parse(a.visibleAt) - Date.parse(b.visibleAt))
    .map(b => ({ key: `badge:${b.key}`, kind: 'badge', title: BADGE_BY_ID[b.badge].name, meta: badgeLine(b), icon: BADGE_ICONS[b.badge], rarity: BADGE_BY_ID[b.badge].rarity }));
  const had = new Set((previous.awards ?? []).flatMap(w => w.awards.filter(a => a.winners.includes(viewer)).map(a => `${w.week}:${a.id}`)));
  for (const w of next.awards ?? []) for (const a of w.awards) {
    if (!a.winners.includes(viewer) || had.has(`${w.week}:${a.id}`)) continue;
    out.push({ key: `award:${w.week}:${a.id}`, kind: 'award', title: AWARD_BY_ID[a.id]?.name ?? a.id, meta: `Week ${w.week}${SEP}${awardValue(a)}`, icon: AWARD_ICONS[a.id], rarity: 'rare' });
  }
  return out;
}
