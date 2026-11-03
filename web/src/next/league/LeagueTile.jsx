// Play landing › League (D-69 step 1, P1B): your rank on the board League opens by default (the Community's Spread board),
// the move this device last saw and "New posts", from the reads the landing already makes (the Community read; a group's
// player count from the lobby). It reports the Spread rank moment from that read and shows NEW while a League moment waits.
import { useMemo } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { useNewCount } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { PlayTile } from '../play/PlayTile.jsx';
import { readSeen, seenKey } from '../feed/feedModel.js';
import { leagueTile } from './leagueModel.js';
import { rankKey, readRank } from './rankMoment.js';
import { useRankMoment } from './useRankMoment.js';

export function LeagueTile({ onOpen }) {
  const app = useAppData(), viewer = app.accountId, community = app.league.community === true, read = app.community;
  const players = app.leagues?.find(row => row.on)?.players ?? null;
  const tile = useMemo(() => leagueTile({ community, data: read.data, viewer, players,
    stored: readRank(rankKey(viewer, 'community', 'guess_spread')), seen: readSeen(seenKey(viewer, null)) }), [community, read.data, viewer, players]);
  useRankMoment({ account: viewer, league: 'community', mode: 'guess_spread', rank: tile.rank, tied: tile.tied, market: 'Spread',
    read: community ? read.data : null, fresh: community && read.status === 'ready' && !read.error });
  const isNew = useNewCount(SCOPES.league) > 0;
  return <PlayTile label="League" icon="trophy" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={isNew} onClick={onOpen} ariaLabel={tile.aria}/>;
}
