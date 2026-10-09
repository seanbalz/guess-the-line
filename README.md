# guess-the-lines-repo

The [D-18 virtual units game task list](planning/virtual-units-game.md) records the confirmed play-money rules and unresolved implementation decisions. It is a plan, not a shipped game.

## Guess the Spread / Guess the Total scoring engine

A TypeScript engine scores both Guess modes separately from commissioner-entered picks and manually recorded, timestamped named-book quotes (decision D-19). Run `npm ci`, `npm test`, then `npm run score -- --week 6`. File formats, the benchmark gate and the current limitations are documented in the [scoring engine guide](docs/SCORING_ENGINE.md). It is a local commissioner tool, not a deployed app.
