import { TEAM_NAMES, appCode } from '../shared/nfl-schedule.mjs';
import { researchNameKey } from '../shared/research-markets.mjs';
import { UUID_PATTERN } from './lobby.mjs';
import { PROP_PILOT_DEFAULTS, propRosterReceipt } from './player-prop-quote-requests.mjs';
import { propGameId } from './player-prop-receipts.mjs';
import { createPropRosterReader } from './player-prop-sources.mjs';
import { collectResearchQuotes } from './research-provider.mjs';

const PROVIDER_EVENT_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export function providerPropRefreshError(code) {
  const error = new Error('Player Props refresh is unavailable.');
  error.retryLock = ['GTL_PROPS_REFERENCE_FRESH', 'GTL_PROPS_REFRESH_COOLDOWN'].includes(code);
  return error;
}

/** One server-only refresh after the normal lock writer has refused an already saved draft. */
export function createPropRefreshForLock({ apiKey, rows, rpc, fetchImpl = fetch, clock = Date.now }) {
  if (typeof apiKey !== 'string' || !apiKey || /\s/.test(apiKey)) return null;
  const readRoster = createPropRosterReader({ fetchImpl, clock });
  return async ({ offer, requestId }) => {
    const [away, home] = offer.eventId.split('_').slice(2).map(appCode);
    const kickoff = Date.parse(offer.kickoff);
    if (!PROP_PILOT_DEFAULTS.stats.includes(offer.stat) || offer.closed || !Number.isFinite(kickoff) || clock() >= kickoff
      || !TEAM_NAMES[away] || !TEAM_NAMES[home] || away === home || offer.away !== away || offer.home !== home) return false;
    const game = { id: propGameId(offer), away: TEAM_NAMES[away], home: TEAM_NAMES[home], awayCode: away, homeCode: home, kickoff: offer.kickoff };
    const [snapshot] = await rows('gtl_market_snapshots', { select: 'created_at,games:payload->games', season: `eq.${offer.season}`,
      week: `eq.${offer.week}`, order: 'created_at.desc,id.desc', limit: '1' }, 1);
    const created = Date.parse(snapshot?.created_at);
    if (!Number.isFinite(created) || created > clock() || !Array.isArray(snapshot.games) || snapshot.games.length > 32) return false;
    const matches = snapshot.games.filter(entry => entry?.gameId === game.id);
    const [match] = matches;
    if (matches.length !== 1 || match.matchStatus !== 'matched' || match.home !== game.home || match.away !== game.away
      || Date.parse(match.kickoff) !== kickoff || typeof match.providerEventId !== 'string' || !PROVIDER_EVENT_ID.test(match.providerEventId)) return false;

    // A successful ledger capture replaces older quotes for the entire game and stat. Verify the selected offer and
    // normalize every eligible athlete on both teams using the published weekly roster.
    const verified = await readRoster(offer.season, offer.week);
    if (!verified || Date.parse(verified.availableAt) >= kickoff) return false;
    const { receipt: roster, complete } = propRosterReceipt(verified.people, { game, availableAt: verified.availableAt });
    const selected = roster.find(player => player.id === offer.playerId);
    if (!complete || !selected || selected.team !== offer.team || researchNameKey(selected.name) !== researchNameKey(offer.playerName)) return false;

    try {
      const result = await collectResearchQuotes({ apiKey, requestId, season: offer.season, week: offer.week, game, eventId: match.providerEventId,
        markets: [offer.stat], roster, clock, strictPropCapture: true,
        async rpc(name, args) {
          if (name !== 'gtl_begin_research_quotes') return rpc(name, args);
          const lease = await rpc('gtl_props_begin_refresh', { p_request: args.p_request, p_season: args.p_season, p_week: args.p_week,
            p_event_id: offer.eventId, p_player_id: offer.playerId, p_stat: offer.stat });
          if (lease?.replay !== true && (lease?.replay !== false || typeof lease.lease !== 'string' || !UUID_PATTERN.test(lease.lease)
            || typeof lease.expiresAt !== 'string' || !Number.isFinite(Date.parse(lease.expiresAt)))) throw new Error('Invalid Player Props refresh lease.');
          return lease;
        },
        fetchImpl(url, options) {
          if (clock() >= kickoff) throw new Error('Player Props event has kicked off.');
          return fetchImpl(url, options);
        },
      });
      return result.status === 'collected';
    } catch (error) {
      // A peer may have just retained the stat or recorded this athlete's reference. The caller can retry the lock once.
      if (error?.retryLock) return true;
      throw error;
    }
  };
}
