// The season history Home's score row and score card and the Play landing's Your score and Compare tiles read (D-69
// step 1): one key and one fetcher here, shared (useLeagueRead's `shared`), so they make one request and the Play
// landing adds no read beyond Home's. The current season's history, or the latest before the Community read names a
// week; a 401 asks for sign-in.
import { communityApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';

export function useHomeScoreRead(app) {
  const current = app.community.data?.week;
  return useLeagueRead(`${app.accountId}:home-score:${current?.season}:${current?.week}`,
    signal => communityApi('history', current?.season ? { season: current.season } : {}, signal),
    error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
}
