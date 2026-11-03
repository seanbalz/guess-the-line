// D-69 Your score glue: a history read into the moments engine, and the season rank chip. React only; the rules live in
// scoreMoments.js and yourScore.js.
import { useEffect, useMemo } from 'react';
import { MODES, rankTile } from '../../../../shared/guess-board.mjs';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { scoreReport } from './scoreMoments.js';
import { rankChip } from './yourScore.js';

/** Reports the score moments of each fresh history answer (rule 1). A pending or failed read reports nothing. */
export function useScoreMoments(read) {
  const report = useMoments()?.report;
  const fresh = read && !read.loading && !read.error ? read.data ?? null : null;
  useEffect(() => {
    const out = scoreReport({ data: fresh });
    if (out && report) report(out.candidates, { source: out.source });
  }, [fresh, report]);
}

/**
 * `{ season, guess_spread, guess_total }`: each market's season rank chip from the Community standings Home already
 * reads (`rankTile`), with the move the League board last showed on this device (`peekMove`: read only, so the board
 * still plays its own rank moment). `season` is the season those standings rank.
 */
export function useSeasonRanks(app) {
  const community = app?.community?.data ?? null, viewer = app?.accountId ?? '';
  return useMemo(() => {
    const out = { season: Number.isInteger(community?.week?.season) ? community.week.season : null };
    for (const mode of MODES) {
      const tile = community ? rankTile({ standings: community.standings, viewer, mode }) : null;
      out[mode] = rankChip(tile, tile?.rank ? peekMove(readRank(rankKey(viewer, 'community', mode)), { rank: tile.rank }) : null);
    }
    return out;
  }, [community, viewer]);
}
