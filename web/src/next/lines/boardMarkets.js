import { appCode } from '../../../../shared/nfl-schedule.mjs';
import { fmtWhen } from '../format.js';
import { lineState, marketTime, marketValue } from './marketDetails.js';

/** Current board values come only from the gated reader, never the saved scoring reference. */
export function boardMarket(card, row, market, read) {
  if (read.status !== 'ready') return card[market].open
    ? { open: true, line: null, label: read.status === 'error' ? 'Unavailable' : 'Loading', ...(read.status === 'error' ? {} : { loading: true }) }
    : { open: false };
  if (!row) return { open: true, line: null, label: 'Unavailable' };
  const cell = row[market];
  if (cell?.visible !== true) return { open: false };
  const state = lineState(cell, read.now);
  return { open: true, line: Number.isFinite(cell.value) ? marketValue(row, market, cell.value) : null,
    label: row.started && state === 'Current line' ? 'Latest recorded line' : state,
    source: cell.source ?? 'Source unavailable', observed: marketTime(cell.observedAt) };
}

/** A recorded final only for this started matchup. Kickoff alone never supplies a live/final score. */
export function recordedFinal(card, row, read) {
  const result = row?.final;
  const score = value => Number.isSafeInteger(value) && value >= 0;
  if (read.status !== 'ready' || !card.started || row?.started !== true || row.id !== card.id ||
    appCode(row.awayCode) !== appCode(card.away.code) || appCode(row.homeCode) !== appCode(card.home.code) ||
    result?.status !== 'final' || !score(result.away) || !score(result.home)) return null;
  const source = typeof result.source === 'string' && result.source.trim() ? result.source.trim() : 'Source unavailable';
  const observed = Date.parse(result.observedAt);
  const time = Number.isFinite(observed) && Number.isFinite(read.now) && observed <= read.now
    ? `Observed ${marketTime(result.observedAt)}` : 'Result time unverified';
  const origin = result.origin === 'commissioner_reported' ? 'Commissioner-reported result' : 'Result source';
  return { score: `Final · ${card.away.code} ${result.away}–${card.home.code} ${result.home}`,
    provenance: `${origin}: ${source} · ${time}`, kickoff: `Kickoff ${marketTime(card.kickoff)}` };
}

export function marketBoard(board, read) {
  const rows = new Map((read.status === 'ready' ? read.data?.games ?? [] : []).map(row => [row.id, row]));
  const decorate = card => {
    const row = rows.get(card.id);
    const spread = boardMarket(card, row, 'spread', read), total = boardMarket(card, row, 'total', read);
    const final = recordedFinal(card, row, read);
    const status = final?.score ?? (row?.started ? 'Kickoff passed' : null);
    const describe = (cell, name) => cell.open ? `${name} ${cell.line ?? '—'}. ${cell.label}${cell.source ? `. ${cell.source}. Updated ${cell.observed}` : ''}` : `${name} line hidden`;
    return { ...card, spread, total, status, final, aria: [
      `${card.away.nick} at ${card.home.nick}, ${fmtWhen(card.kickoff)}`, status, final?.provenance, describe(spread, 'Spread'), describe(total, 'Total'),
      card.tags.away?.aria, card.tags.home?.aria, card.tags.total?.aria, card.late?.text, card.chip ? `${card.chip.kind === 'weather' ? 'Kickoff weather' : 'Trend'}: ${card.chip.text}${card.chip.tier ? ` · ${card.chip.tier}` : ''}` : null, 'Open game details',
    ].filter(Boolean).join('. ') };
  };
  const groups = board.groups.map(group => ({ ...group, cards: group.cards.map(decorate) }));
  const started = board.started?.cards.map(decorate) ?? [];
  const finals = [...groups.flatMap(group => group.cards), ...started].filter(card => card.final);
  const pending = started.filter(card => !card.final);
  return { ...board, groups: groups.map(group => ({ ...group, cards: group.cards.filter(card => !card.final) })).filter(group => group.cards.length),
    started: pending.length ? { ...board.started, label: 'Kickoff passed', count: pending.length, cards: pending } : null,
    finals: finals.length ? { label: 'Final', count: finals.length, cards: finals } : null };
}

/** One gate per board; the M-03 reader controls whether a reveal confirmation is offered. */
export function boardGate(read, canReveal = false) {
  if (read.status !== 'ready') return null;
  const closed = ['spread', 'total'].filter(market => read.data.games.some(game => game[market]?.visible !== true));
  if (!closed.length) return null;
  const names = closed.map(market => market === 'spread' ? 'Spread' : 'Total');
  return { market: closed[0], locked: true,
    sentence: `Some ${names.join(' and ')} lines are locked. Lock in a guess or wait for kickoff.`,
    ctaLabel: `Finish ${names[0]} picks`, canSkip: canReveal, skipLabel: 'See picks now' };
}
