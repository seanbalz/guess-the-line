// "Matches this week" for the trends saved on this device (proposed D-63): one line on Trends › This Week and one
// row on Home. It counts saved trends that fit at least one upcoming game, using the same matching as the builder (the
// week's schedule, and a line only from the viewer's own saved line once that market is open). No alerts are sent.
import { Pill } from '../ui/index.js';
import { FocusRow } from '../ui/FocusLanding.jsx';
import { useLinesData } from '../lines/linesData.js';
import { savedMatches, useSavedTrends, weekGamesFor } from './builderData.js';

/** `{ matching, of, loading }` for the saved trends against this week's games. */
export function useSavedTrendMatches(lines) {
  const { items } = useSavedTrends();
  const games = weekGamesFor(lines);
  const counts = savedMatches(items, games, lines.shown?.week);
  return { of: items.length, matching: counts ? Object.values(counts).filter(m => m.matches > 0).length : null, loading: !counts };
}

export const matchesLine = ({ of, matching, loading }) => (loading ? 'Checking this week’s games…'
  : matching ? `${matching} of ${of} saved ${of === 1 ? 'trend matches' : 'trends match'} this week`
  : `No saved ${of === 1 ? 'trend matches' : 'trends match'} this week`);

/** Trends › This Week: shown only when this device has saved trends. */
export function SavedTrendsSummary({ lines, onOpen }) {
  const { items } = useSavedTrends();
  if (!items.length) return null;
  return <SummaryCard lines={lines} onOpen={onOpen}/>;
}
// D-66: a tile on This week's first card; the button opens Build.
function SummaryCard({ lines, onOpen }) {
  const m = useSavedTrendMatches(lines);
  return <section aria-label="Saved trends" data-saved-summary={m.loading ? 'loading' : m.matching}><ul className="gx-nest-list"><li>
    <button type="button" className="gx-nest-tile" onClick={onOpen}>
      <span className="gx-nest-tile-label">Saved trends · this device</span>
      <span className="gx-n-m gx-nest-num">{m.loading ? '…' : `${m.matching ?? 0} of ${m.of}`}</span>
      <span className="gx-t-meta">{matchesLine(m)}</span>
      <span className="gx-nest-tags"><Pill>Found by search, not tested</Pill>{m.matching ? <Pill tone="data">Matches this week</Pill> : null}</span>
    </button>
  </li></ul></section>;
}

/** Home's row. Home mounts it only when this device has saved trends, so Home makes no extra read otherwise. */
export function SavedTrendsHomeRow({ onOpen, ...rest }) {
  const lines = useLinesData();
  const m = useSavedTrendMatches(lines);
  return <FocusRow icon="chart" title={m.matching ? 'Saved trends · Matches this week' : 'Saved trends'} sub={matchesLine(m)} onClick={onOpen} data-home="saved-trends" {...rest}/>;
}
