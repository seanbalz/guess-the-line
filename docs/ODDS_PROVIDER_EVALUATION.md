# Free-only NFL odds data provider evaluation — 2026-10-08

| Provider | Free spreads? | Free totals? | Notes / decision |
|---|---|---|---|
| TheRundown | **Advertised yes** | **Advertised yes** | Free pre-match NFL game lines from DraftKings, FanDuel and BetMGM, five-minute delayed; up to 20,000 data points/day, 200,000/month. **Check actual account terms for multiplayer/public display rights before deploying.** Candidate P0. https://therundown.io/nfl-odds-api |
| The Odds API (theoddsapi.com) | **No** on advertised free plan | **No** on advertised free plan | Free tier limited to moneyline (h2h), so not suitable as sole GTL data source. https://theoddsapi.com/ |
| Action Network | Unverified | Unverified | Public consensus page may exist, but free automated API/redistribution rights not confirmed. Manual comparison only pending approval. |
| ESPN publicly visible game odds | Unverified lawful reuse | Unverified lawful reuse | Displayed data or undocumented endpoints are not permission for automated commercial redistribution; evaluate terms before integration. |
| nflverse | Not an odds feed | Not an odds feed | Free historical analytics for independent model, not bookmaker consensus. |

## Technical evaluation checklist
API credentials, explicit data display/reuse terms, league/game IDs, timezone and kickoff timestamps, spreads and totals, source books, update timestamp, latency, rate limit, 6-hour refresh feasibility, historical snapshot persistence, and failure handling. If free tier cannot legally support multiuser published odds, keep public interface to scores with appropriate permissions and use a manually entered authorized benchmark.

## Selection
**Provisional recommendation:** TheRundown free key for proof-of-concept after verifying terms. No integration currently connected or tested. Never assume a sportsbook is a sharp-book consensus merely because it is one of the three free books.
