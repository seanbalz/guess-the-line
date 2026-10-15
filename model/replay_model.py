"""Offline next-play research for the NFL replay; never a published forecast.

Fits only public, normalized run/pass observations. A sampled observation is
NOT a complete football simulation: roster allocation, clock management,
penalties, special teams and overtime must be validated before game generation.
No network, account data, sportsbook inputs or production writes occur here.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import datetime as dt
import hashlib
import json
import math
import pathlib
import random
import statistics

VERSION = "gtl-next-play-research-0.1.0"
# Fixed before evaluating any real held-out rows. Do not tune on the test report.
CONFIG = {"trainThrough": 2023, "calibrationSeason": 2024, "heldoutSeason": 2025,
          "minimumCell": 40, "minimumTraining": 200, "priorWeight": 20}
KINDS = ("run", "complete", "incomplete", "interception", "sack", "fumble")
FEATURES = ("down", "ydstogo", "yardline_100")


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def state_key(row):
    """Only pre-snap state; never final scores, next play or named player output."""
    down, distance, field = (row.get(key) for key in FEATURES)
    if not all(finite(v) for v in (down, distance, field)):
        raise ValueError("Missing or nonfinite pre-snap state")
    if down not in (1, 2, 3, 4) or not 0 < distance <= 100 or not 0 < field <= 100:
        raise ValueError("Invalid pre-snap state")
    return (int(down), "short" if distance <= 3 else "medium" if distance <= 7 else "long",
            "redzone" if field <= 20 else "middle" if field <= 80 else "backedup")


def observation(row):
    """Return an allowlisted research label, or an explicit exclusion reason."""
    if row.get("season_type") != "REG":
        return None, "not_regular_season"
    if row.get("play_type") not in ("run", "pass"):
        return None, "not_run_or_pass"
    if row.get("penalty") not in (0, 1):
        return None, "missing_penalty_flag"
    if row["penalty"]:
        return None, "penalty_play"
    if row.get("qtr") not in (1, 2, 3, 4):
        return None, "not_regulation"
    try:
        key = state_key(row)
    except ValueError:
        return None, "missing_pre_snap_state"
    yards = row.get("yards_gained")
    if not finite(yards) or not -100 <= yards <= 100:
        return None, "missing_or_invalid_yards"
    flags = [row.get(k) for k in ("complete_pass", "interception", "fumble_lost", "touchdown")]
    if any(v not in (0, 1) for v in flags):
        return None, "missing_outcome_flags"
    complete, interception, fumble, touchdown = flags
    if interception and complete:
        raise ValueError("Interception cannot be a completed pass")
    if row["play_type"] == "run" and (complete or interception):
        raise ValueError("Run cannot have pass outcome flags")
    sack = row.get("sack")
    if sack not in (0, 1):
        return None, "missing_sack_flag"
    kind = ("fumble" if fumble else "interception" if interception else "sack" if sack
            else "run" if row["play_type"] == "run" else "complete" if complete else "incomplete")
    if kind == "incomplete" and yards != 0:
        return None, "incomplete_with_yards"
    # Historical source players are provenance, NEVER assigned to a future team.
    return {"state": key, "kind": kind, "yards": float(yards),
            "outcomeFlags": {"completePass": bool(complete), "interception": bool(interception),
                             "fumbleLost": bool(fumble), "sack": bool(sack), "touchdownObserved": bool(touchdown)},
            # The source touchdown flag includes defensive scores. This subset
            # cannot establish who scored, or resolve a double-turnover play.
            "scoringSide": None, "requiresFullPlayResolution": True,
            "sourceGameId": row["game_id"],
            "sourcePlayId": row["play_id"]}, None


def checked_rows(rows):
    """Stable identities and dates are required even on otherwise excluded rows."""
    seen = set()
    result = []
    for row in rows:
        day = dt.date.fromisoformat(row["date"])
        season = row["season"]
        if type(season) is not int or day.year not in (season, season + 1):
            raise ValueError("Season/date mismatch")
        play_id = row["play_id"]
        if not finite(play_id) or play_id <= 0 or not isinstance(row["game_id"], str) or not row["game_id"]:
            raise ValueError("Invalid play identity")
        identity = (row["game_id"], play_id)
        if identity in seen:
            raise ValueError("Duplicate game/play identity")
        seen.add(identity)
        result.append((day, row))
    return sorted(result, key=lambda pair: (pair[0], pair[1]["game_id"], pair[1]["play_id"]))


class NextPlayModel:
    """State-conditioned empirical distribution, shrunk to the training prior.

    The fallback is labelled in every result; it never silently pretends sparse
    evidence is a team-specific forecast. Training observations are immutable
    allowlisted copies. Dates exclude the entire cutoff day to avoid leakage.
    """

    def __init__(self, rows, cutoff):
        self.cutoff = dt.date.fromisoformat(cutoff)
        self.global_pool, self.cells, self.excluded = [], defaultdict(list), Counter()
        self.latest_date = None
        for day, row in checked_rows(rows):
            if day >= self.cutoff:
                self.excluded["at_or_after_cutoff"] += 1
                continue
            item, reason = observation(row)
            if reason:
                self.excluded[reason] += 1
                continue
            self.global_pool.append(item)
            self.cells[item["state"]].append(item)
            self.latest_date = day
        if len(self.global_pool) < CONFIG["minimumTraining"]:
            raise ValueError("Insufficient eligible training observations")
        self.prior = self._distribution(self.global_pool)
        self.mean_yards = statistics.mean(item["yards"] for item in self.global_pool)
        self.cell_means = {key: statistics.mean(item["yards"] for item in pool) for key, pool in self.cells.items()}
        self.cell_distributions = {key: self._distribution(pool) for key, pool in self.cells.items()}

    @staticmethod
    def _distribution(pool):
        counts = Counter(item["kind"] for item in pool)
        return {kind: counts[kind] / len(pool) for kind in KINDS}

    def predict(self, state):
        key = state_key(state)
        cell = self.cells.get(key, ())
        supported = len(cell) >= CONFIG["minimumCell"]
        weight = len(cell) / (len(cell) + CONFIG["priorWeight"]) if supported else 0
        local = self.cell_distributions[key] if supported else self.prior
        probabilities = {kind: weight * local[kind] + (1-weight) * self.prior[kind] for kind in KINDS}
        mean = weight * self.cell_means.get(key, self.mean_yards) + (1-weight) * self.mean_yards
        return {"probabilities": probabilities, "meanYards": mean, "stateSupport": len(cell),
                "fallback": not supported, "status": "research_only"}

    def sample_observation(self, state, *, seed):
        """A deterministic historical transition candidate, not a generated play.

        Sampling the entire label preserves its yardage/outcome association.
        Do not relabel the recorded touchdown at another field position or turn
        this result directly into a score: the football rules engine owns that.
        """
        if not isinstance(seed, str) or not seed:
            raise ValueError("Provide a nonempty repeatable seed")
        key = state_key(state)
        cell = self.cells.get(key, ())
        rng = random.Random(hashlib.sha256(seed.encode()).digest())
        supported = len(cell) >= CONFIG["minimumCell"]
        weight = len(cell) / (len(cell) + CONFIG["priorWeight"]) if supported else 0
        pool = cell if rng.random() < weight else self.global_pool
        observed = pool[rng.randrange(len(pool))]
        return {**observed, "outcomeFlags": dict(observed["outcomeFlags"]),
                "modelVersion": VERSION, "status": "research_only", "requestedState": key,
                "stateSupport": len(cell), "fallback": not supported,
                "samplePool": "state" if pool is cell else "training_prior"}


def evaluate(rows):
    """Fixed calendar splits; held-out data never updates the fitted model."""
    checked = checked_rows(rows)
    training = [r for _, r in checked if r["season"] <= CONFIG["trainThrough"]]
    model = NextPlayModel(training, f'{CONFIG["calibrationSeason"]}-07-01')
    reports = {}
    for label, season in (("calibration", CONFIG["calibrationSeason"]), ("heldout", CONFIG["heldoutSeason"])):
        samples, excluded = [], Counter()
        for _, row in checked:
            if row["season"] != season:
                continue
            actual, reason = observation(row)
            if reason:
                excluded[reason] += 1
                continue
            prediction = model.predict(row)
            brier = lambda probs: sum((probs[k] - int(actual["kind"] == k)) ** 2 for k in KINDS)
            samples.append({"gameId": row["game_id"], "kind": actual["kind"], "prediction": prediction,
                            "brier": brier(prediction["probabilities"]), "baselineBrier": brier(model.prior),
                            "absoluteYardsError": abs(prediction["meanYards"] - actual["yards"]),
                            "baselineYardsError": abs(model.mean_yards - actual["yards"])})
        reports[label] = {"season": season, "plays": len(samples), "games": len({s["gameId"] for s in samples}),
                          "excluded": dict(excluded), "fallbackPlays": sum(s["prediction"]["fallback"] for s in samples)}
        for key in ("brier", "baselineBrier", "absoluteYardsError", "baselineYardsError"):
            reports[label][key] = statistics.mean(s[key] for s in samples) if samples else None
        reports[label]["classCalibration"] = {kind: {
            "predictedFrequency": statistics.mean(s["prediction"]["probabilities"][kind] for s in samples) if samples else None,
            "observedFrequency": sum(s["kind"] == kind for s in samples) / len(samples) if samples else None,
        } for kind in KINDS}
    return {"version": VERSION, "status": "research_only", "config": CONFIG,
            "trainingPlays": len(model.global_pool), "trainingExcluded": dict(model.excluded),
            "latestTrainingDate": model.latest_date.isoformat(), "reports": reports,
            "publication": publication_readiness()}


def publication_readiness():
    # No boolean override: this version cannot emit a production replay.
    return {"status": "blocked", "replay": None, "reasons": [
        "Current field-specific data permissions and complete input coverage must be established.",
        "Current roster membership, availability and player usage allocation are not validated.",
        "This next-play model does not generate complete games, special teams, penalties or overtime.",
        "Held-out full-game score and player-stat calibration has not passed.",
        "Historical publication/revision timestamps and server-side projection visibility are not implemented.",
    ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("normalized", type=pathlib.Path, help="Reviewed normalized PBP JSON array; offline research only")
    args = parser.parse_args()
    report = evaluate(json.loads(args.normalized.read_text()))
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
