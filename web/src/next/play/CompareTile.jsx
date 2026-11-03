// The Play landing's Compare tile (D-69 step 1, P1B): your lead over the player Compare opens on, in the latest week you
// share a scored game ("+6", "vs Troy"). It reuses Home's history read (the same key and options, so one shared request
// and no new read on the landing). A private league's roster is not read on the landing, so there the tile shows the
// plain label. Compare has no moments (none in the catalog), so the tile never shows NEW. `onOpen(view)` receives the
// Compare keys for that head-to-head (`item`, `season`, `week`, `market`), for `openPlay(shell, 'compare', view)`.
import { useMemo } from 'react';
import { communityApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PlayTile } from './PlayTile.jsx';
import { compareTile } from './compare.js';

export function CompareTile({ onOpen }) {
  const app = useAppData(), current = app.community.data?.week;
  const read = useLeagueRead(`${app.accountId}:home-score:${current?.season}:${current?.week}`, signal => communityApi('history', current?.season ? { season: current.season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
  const data = app.league?.community === false ? null : read.data;
  const tile = useMemo(() => compareTile(data, current), [data, current]);
  return <PlayTile label="Compare" icon="swap" big={tile.big} sub={tile.sub} tone={tile.tone} ariaLabel={tile.ariaLabel} onClick={() => onOpen?.(tile.view)}/>;
}
