# EPL community standings readiness data

The JSON file in this directory is a **dated historical readiness record**, not an automatically current table.
It is not loaded by the app, worker, a database migration or a scheduled job.

Source: Wikipedia contributors, [2026–27 Premier League, revision 1382589055](https://en.wikipedia.org/w/index.php?title=2026%E2%80%9327%20Premier%20League&oldid=1382589055).
The article's history, accessible from that page, identifies its contributors. The source describes the table as updated
through October 25, 2026. This record was captured October 29, 2026; it contains 20 clubs and a complete eight-match
round per club. It is Wikimedia community data, not independently verified official Premier League standings.

The derived JSON data is made available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Changes: extracted match results; calculated standings using the source's declared points, goal-difference and
goals-scored criteria; normalized names to existing GTL club codes. The record includes its source revision,
capture/source dates, response hash, attribution, license and change notice. No article prose, pictures or logos are
included. Retain attribution and license/change notices when sharing the record, and apply the required compatible
ShareAlike terms to adaptations. Do not imply Wikipedia or Premier League endorsement.

This data notice applies to this directory's derived standings data. The independently written adapter/validator and
the rest of the repository retain their existing code licensing; this notice does not relicense them.

See [the evidence and remaining integration gates](../../../docs/EPL_STANDINGS_READINESS_2026_10_29.md).
