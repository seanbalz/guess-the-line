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

export function marketBoard(board, read) {
  const rows = new Map((read.data?.games ?? []).map(row => [row.id, row]));
  const decorate = card => {
    const row = rows.get(card.id);
    const spread = boardMarket(card, row, 'spread', read), total = boardMarket(card, row, 'total', read);
    const final = row?.final;
    const status = final?.status === 'final' && Number.isFinite(final.away) && Number.isFinite(final.home)
      ? `Final · ${card.away.code} ${final.away}–${card.home.code} ${final.home}` : row?.started ? 'Kicked off' : null;
    const describe = (cell, name) => cell.open ? `${name} ${cell.line ?? '—'}. ${cell.label}${cell.source ? `. ${cell.source}. Updated ${cell.observed}` : ''}` : `${name} line hidden`;
    return { ...card, spread, total, status, aria: [
      `${card.away.nick} at ${card.home.nick}, ${fmtWhen(card.kickoff)}`, status, describe(spread, 'Spread'), describe(total, 'Total'),
      card.tags.away?.aria, card.tags.home?.aria, card.tags.total?.aria, card.late?.text, card.chip ? `${card.chip.kind === 'weather' ? 'Kickoff weather' : 'Trend'}: ${card.chip.text}${card.chip.tier ? ` · ${card.chip.tier}` : ''}` : null, 'Open game details',
    ].filter(Boolean).join('. ') };
  };
  return { ...board, groups: board.groups.map(group => ({ ...group, cards: group.cards.map(decorate) })),
    started: board.started ? { ...board.started, cards: board.started.cards.map(decorate) } : null };
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
