# Guess The Line — simulation references supplied by Sean

Owner: Sean Balsiger · Version 1 · November 4, 2026

Sean supplied two X posts during the owner-mockup review. This is a reference
brief and an original concept storyboard, not a decision to implement a model.

| Source | What its thread describes | Potential GTL use |
| --- | --- | --- |
| [MySpariEdge](https://x.com/MySpariEdge/status/2111185414421643313) | Bills–Raiders visual replay from 10,000 simulations, using play-by-play and coverage tendencies; related thread mentions player stats and box score | A watchable drive/play timeline and supporting stats inside a game |
| [RotoBot](https://x.com/rotobot_ai/status/2110512433282625965) | Representative Seahawks–Broncos game from 2,000 runs; coverage/pressure/usage explanation; probabilities across all runs | Separate the illustrative replay from outcome distributions and explain the factors |

These are the authors' claims, not independently validated inputs or model
results. Retrieval exposed post/thread text but no attached media; the video
frames and exact visual treatment were not inspected. RotoBot also describes
limited sample data and scoring bias. A large run count alone is not evidence
of calibration.

## Original GTL concept

Open [the three-screen storyboard](index.html#references): sample replay,
all outcomes, and matchup explanation. It uses GTL tokens and unavailable
values. No fabricated live lines or model probabilities are shown.

The proposed entry point is Research → Game → Simulation. Keep an illustrative
game distinct from aggregate outcomes. Show source, sample size, model version,
run time and limitations with any eventual result; preserve saved Guess scoring
references separately. This is a design proposal inferred from the references,
not an approved product decision.

The [existing work queue](../../planning/PLATFORM_WORK_QUEUE.md) already places
simulator work after current completion. Input rights, free-source availability,
model validation and held-out evaluation remain separate work. No data access,
provider agreement, simulation accuracy, source integration or production
implementation is established by these posts.
