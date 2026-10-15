"""Offline evaluation primitives for future, frozen whole-game/player samples.

There is no model, forecast runner, file/network access, fitted threshold or
promotion decision here. Metric helpers can be checked with artificial numbers.
Protocol validation separately requires exact artifact bytes, explicit eligibility
and prospective timing. That validates declarations and integrity, not the truth
of upstream eligibility reviews or outcome attribution. A future runner must
verify outcome sources and bind draws to this protocol before scoring real games.

CRPS is the empirical distribution (V-statistic), not the finite-ensemble unbiased
estimator. Quantiles use linear interpolation at (n-1)*q (type 7); interval edges
are inclusive. Wins and ties are three separately scored binary events. Ties
count as neither team's win; no half-win or conditional-on-non-tie substitution.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import re

VERSION = "gtl-replay-evaluation-1"
MAX_SAMPLES = 100_000
MAX_PLAYERS = 200
MAX_PLAYER_DRAWS = 1_000_000
TIE_POLICY = "separate_binary_tie_event"
ARTIFACT_ROLES = ("model", "engine", "inputs", "code", "config")
NFL_TEAMS = frozenset("ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split())
STATS = ("passingYards", "rushingYards", "receivingYards", "passingTD", "rushingTD", "receivingTD", "receptions")
COUNT_STATS = frozenset(("passingTD", "rushingTD", "receivingTD", "receptions"))
TD_STATS = frozenset(("passingTD", "rushingTD", "receivingTD"))
DEVELOPMENT_SCOPES = (
    {"season": 2022, "throughWeek": 18}, {"season": 2023, "throughWeek": 18},
    {"season": 2024, "throughWeek": 18}, {"season": 2025, "throughWeek": 18},
    {"season": 2026, "throughWeek": 5},
)
METRIC_DEFINITIONS = {
    "crps": "empirical_v_statistic", "quantile": "linear_type_7",
    "intervalBoundary": "inclusive", "gameTiePolicy": TIE_POLICY,
    "playerTouchdownEvent": "count_gt_zero", "playerDenominator": "all_frozen_players",
    "missingOutcome": "unavailable", "aggregation": "per_game_and_player",
}


class EvaluationError(ValueError):
    """Invalid numbers, provenance, timing, denominator or undeclared policy."""


def require(condition, message):
    if not condition:
        raise EvaluationError(message)


def exact_keys(value, keys, field):
    require(isinstance(value, dict) and set(value) == set(keys), f"{field}: missing or unexpected fields")


def number(value, field):
    require(type(value) in (int, float), f"{field}: finite number required")
    try:
        result = float(value)
    except OverflowError:
        raise EvaluationError(f"{field}: finite number required") from None
    require(math.isfinite(result), f"{field}: finite number required")
    return result


def checked_result(value):
    require(math.isfinite(value), "Metric arithmetic exceeded finite range")
    return value


def samples_checked(samples):
    require(isinstance(samples, (list, tuple)) and 0 < len(samples) <= MAX_SAMPLES,
            "Samples must be a nonempty bounded list or tuple")
    return tuple(number(value, "sample") for value in samples)


def probability(value, field="probability"):
    result = number(value, field)
    require(0 <= result <= 1, f"{field}: expected 0 through 1")
    return result


def empirical_crps(samples, outcome):
    """E|X-y| - E|X-X'|/2 for the equally weighted empirical distribution.

    Sorted adjacent gaps give the pairwise term in O(n log n), preserving repeated
    draws and avoiding an O(n^2) distance matrix. Missing truth is an error here;
    aggregate helpers explicitly return unavailable for missing truth instead.
    """
    ordered = sorted(samples_checked(samples))
    truth = number(outcome, "outcome")
    n = len(ordered)
    try:
        absolute_error = math.fsum(abs(value - truth) / n for value in ordered)
        pair_term = math.fsum((ordered[i] - ordered[i - 1]) * (i / n) * ((n - i) / n)
                              for i in range(1, n))
    except (OverflowError, ValueError):
        raise EvaluationError("CRPS arithmetic exceeded finite range") from None
    result = checked_result(absolute_error - pair_term)
    # Only protect floating-point subtraction at zero, never accept an invalid
    # negative score from arithmetic or an alternative estimator.
    require(result >= -1e-12 * max(1, absolute_error), "Negative empirical CRPS")
    return max(0.0, result)


def binary_brier(predicted_probability, outcome):
    """One Bernoulli event, requiring an explicit boolean true outcome."""
    p = probability(predicted_probability)
    require(type(outcome) is bool, "Binary outcome must be an explicit boolean")
    return (p - int(outcome)) ** 2


def empirical_quantile(samples, q):
    """Deterministic type-7 linear quantile; endpoints are min/max."""
    ordered = sorted(samples_checked(samples))
    rank = (len(ordered) - 1) * probability(q, "quantile")
    lower = int(math.floor(rank))
    fraction = rank - lower
    if fraction == 0:
        return ordered[lower]
    # Convex form avoids overflowing the difference between finite endpoints.
    return checked_result((1 - fraction) * ordered[lower] + fraction * ordered[lower + 1])


def central_interval(samples, level, outcome=None):
    """Equal-tailed interval. Unknown truth leaves coverage unavailable, not false."""
    values = samples_checked(samples)
    level = probability(level, "interval level")
    require(0 < level < 1, "Interval level must be strictly between 0 and 1")
    lower = empirical_quantile(values, (1 - level) / 2)
    upper = empirical_quantile(values, (1 + level) / 2)
    truth = None if outcome is None else number(outcome, "outcome")
    return {"level": level, "lower": lower, "upper": upper,
            "width": checked_result(upper - lower),
            "covered": None if truth is None else lower <= truth <= upper}


def interval_levels_checked(levels):
    require(isinstance(levels, (list, tuple)) and 0 < len(levels) <= 10, "Explicit interval levels required")
    result = tuple(probability(level, "interval level") for level in levels)
    require(all(0 < value < 1 for value in result) and len(set(result)) == len(result),
            "Interval levels must be unique and strictly between 0 and 1")
    return result


def distribution_metrics(samples, outcome, interval_levels):
    values = samples_checked(samples)
    truth = None if outcome is None else number(outcome, "outcome")
    levels = interval_levels_checked(interval_levels)
    return {"sampleCount": len(values), "outcomeStatus": "unavailable" if truth is None else "supplied",
            "outcome": truth, "crps": None if truth is None else empirical_crps(values, truth),
            "median": empirical_quantile(values, .5),
            "intervals": [central_interval(values, level, truth) for level in levels]}


def score_pair(value, field):
    exact_keys(value, ("home", "away"), field)
    for side in ("home", "away"):
        require(type(value[side]) is int and value[side] >= 0, f"{field}: scores must be nonnegative integers")
        number(value[side], f"{field}.{side}")
    return value["home"], value["away"]


def paired_game_metrics(samples, outcome, *, tie_policy, interval_levels):
    """Score, margin and total metrics from the SAME paired draw, never marginals.

    This is a calculation over supplied values, not source verification or a
    prospective evaluation certificate. A missing game outcome stays unavailable.
    """
    require(tie_policy == TIE_POLICY, "An explicit supported tie policy is required")
    require(isinstance(samples, (list, tuple)) and 0 < len(samples) <= MAX_SAMPLES, "Invalid paired samples")
    levels = interval_levels_checked(interval_levels)
    pairs = tuple(score_pair(sample, "sample") for sample in samples)
    true_pair = None if outcome is None else score_pair(outcome, "outcome")
    columns = {"homeScore": [h for h, _ in pairs], "awayScore": [a for _, a in pairs],
               "margin": [h - a for h, a in pairs], "total": [h + a for h, a in pairs]}
    truths = dict.fromkeys(columns, None) if true_pair is None else dict(zip(
        columns, (true_pair[0], true_pair[1], true_pair[0] - true_pair[1], sum(true_pair))))
    events = {}
    for event, predicate in (("homeWin", lambda h, a: h > a), ("awayWin", lambda h, a: h < a),
                             ("tie", lambda h, a: h == a)):
        p = sum(predicate(h, a) for h, a in pairs) / len(pairs)
        truth = None if true_pair is None else predicate(*true_pair)
        events[event] = {"probability": p, "outcome": truth,
                         "brier": None if truth is None else binary_brier(p, truth)}
    return {"status": "research_only", "promotionAllowed": False, "publicationReady": False,
            "tiePolicy": tie_policy, "pairedDrawCount": len(pairs), "events": events,
            "distributions": {key: distribution_metrics(values, truths[key], levels)
                              for key, values in columns.items()}}


def stat_value(value, stat, field):
    require(type(value) is int, f"{field}: integer player statistic required")
    number(value, field)
    require(stat not in COUNT_STATS or value >= 0, f"{field}: counts cannot be negative")
    return value


def stat_names_checked(stats):
    require(isinstance(stats, (list, tuple)) and 0 < len(stats) <= len(STATS)
            and all(type(stat) is str and stat in STATS for stat in stats)
            and len(set(stats)) == len(stats), "Explicit unique supported player statistics required")
    return tuple(stats)


def player_ids_checked(ids):
    require(isinstance(ids, (list, tuple)) and 0 < len(ids) <= MAX_PLAYERS
            and all(isinstance(value, str) and re.fullmatch(r"\d{2}-\d{7}", value) for value in ids)
            and len(set(ids)) == len(ids), "Frozen unique GSIS player denominator required")
    return tuple(ids)


def sha(value, field):
    require(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value), f"{field}: SHA-256 required")
    return value


def player_outcome(value, stats):
    """Validate explicit caller-supplied evidence states, without verifying source.

    A named source hash is provenance to verify in a future runner, not proof
    supplied by this module. Missing stat fields never become zero. Explicit
    verified nonparticipation is the only state that implies all zero statistics.
    """
    if value is None:
        return dict.fromkeys(stats, None), "unavailable"
    require(isinstance(value, dict), "Invalid player outcome")
    status = value.get("status")
    if status == "unavailable":
        exact_keys(value, ("status", "reason"), "unavailable outcome")
        plain(value["reason"], "unavailable reason")
        return dict.fromkeys(stats, None), status
    require(status in ("verified_box_score", "verified_nonparticipation"), "Explicit outcome evidence status required")
    fields = ("status", "evidenceSha256") if status == "verified_nonparticipation" else ("status", "evidenceSha256", "stats")
    exact_keys(value, fields, "player outcome")
    sha(value["evidenceSha256"], "outcome evidence")
    if status == "verified_nonparticipation":
        return dict.fromkeys(stats, 0), status
    exact_keys(value["stats"], stats, "outcome stats")
    return {stat: None if value["stats"][stat] is None else stat_value(value["stats"][stat], stat, stat)
            for stat in stats}, status


def player_metrics(samples, outcomes, *, player_ids, stats, interval_levels):
    """Keep every frozen predicted player, including predicted nonparticipants.

    No selection by actual participation and no denominator shrinkage. Missing
    observations remain in the denominator with unavailable metrics; supplied
    players outside that frozen denominator are rejected rather than zero-filled.
    """
    ids, stats = player_ids_checked(player_ids), stat_names_checked(stats)
    levels = interval_levels_checked(interval_levels)
    require(isinstance(samples, (list, tuple)) and 0 < len(samples) <= MAX_SAMPLES
            and len(samples) * len(ids) <= MAX_PLAYER_DRAWS, "Invalid player sample count")
    require(isinstance(outcomes, dict) and set(outcomes) <= set(ids), "Outcome player outside frozen denominator")
    columns = {pid: {stat: [] for stat in stats} for pid in ids}
    for draw in samples:
        exact_keys(draw, ids, "player draw")
        for pid in ids:
            exact_keys(draw[pid], stats, "player draw statistics")
            for stat in stats:
                columns[pid][stat].append(stat_value(draw[pid][stat], stat, f"{pid}.{stat}"))
    results, available = {}, dict.fromkeys(stats, 0)
    nonparticipants = 0
    for pid in ids:
        truth, status = player_outcome(outcomes.get(pid), stats)
        nonparticipants += status == "verified_nonparticipation"
        metrics = {}
        for stat in stats:
            values = columns[pid][stat]
            metrics[stat] = distribution_metrics(values, truth[stat], levels)
            available[stat] += truth[stat] is not None
            if stat in TD_STATS:
                p = sum(value > 0 for value in values) / len(values)
                event = None if truth[stat] is None else truth[stat] > 0
                metrics[stat]["touchdownEvent"] = {"probability": p, "outcome": event,
                                                 "brier": None if event is None else binary_brier(p, event)}
        results[pid] = {"outcomeEvidenceStatus": status, "metrics": metrics}
    return {"status": "research_only", "promotionAllowed": False, "publicationReady": False,
            "outcomeEvidenceVerification": "caller_supplied_not_verified_by_this_module",
            "playerDenominator": len(ids), "sampleCount": len(samples),
            "verifiedNonparticipantsSupplied": nonparticipants,
            "availableOutcomesByStat": available,
            "unavailableOutcomesByStat": {stat: len(ids) - count for stat, count in available.items()},
            "players": results}


def plain(value, field):
    require(isinstance(value, str) and 0 < len(value) <= 200 and value.strip() == value
            and all(ord(char) >= 32 and ord(char) != 127 for char in value), f"{field}: plain text required")
    return value


def instant(value, field):
    require(isinstance(value, str), f"{field}: timezone-aware timestamp required")
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise EvaluationError(f"{field}: invalid timestamp") from None
    require(result.tzinfo is not None, f"{field}: explicit timezone required")
    return result.astimezone(dt.timezone.utc)


def seed_checked(seed):
    require((type(seed) is int and 0 <= seed <= 2 ** 64 - 1)
            or (isinstance(seed, str) and 0 < len(seed) <= 200 and seed.strip() == seed
                and all(32 <= ord(c) <= 126 for c in seed)), "Explicit bounded deterministic seed required")


def count_checked(count):
    require(type(count) is int and 0 < count <= MAX_SAMPLES, "Declared bounded sample count required")


def cohort_classification(season, week):
    require(type(season) is int and 2022 <= season <= 9999 and type(week) is int and 1 <= week <= 18,
            "Regular-season cohort identity required")
    if any(season == scope["season"] and week <= scope["throughWeek"] for scope in DEVELOPMENT_SCOPES):
        return "development_only_already_inspected"
    return "prospective_eligibility_requires_frozen_evidence"


def canonical_sha(value):
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False, ensure_ascii=False).encode("utf-8")
    except (ValueError, TypeError, UnicodeError):
        raise EvaluationError("Protocol must be finite canonical JSON") from None
    return hashlib.sha256(raw).hexdigest()


def validate_protocol(protocol, artifact_bytes):
    """Validate a prospective protocol, exact byte bindings and declarations.

    No implicit defaults, thresholds or 'untouched holdout' certificate. Eligibility
    reviews must be explicitly recorded for each artifact/version. Their substantive
    correctness is external to this validator. Current incomplete research engine/
    input artifacts must NOT be relabelled eligible just to pass this schema.
    This single declaration pins exact artifacts already known at declaration;
    it is not a two-stage method preregistration followed by a later input freeze.
    """
    exact_keys(protocol, ("schemaVersion", "id", "declaredAt", "cutoff", "kickoff", "cohort", "artifacts",
                          "seed", "sampleCount", "metrics", "intervalLevels", "baselines", "playerIds", "stats",
                          "developmentOnly", "status", "promotionAllowed", "publicationReady"), "protocol")
    require(protocol["schemaVersion"] == VERSION and protocol["status"] == "research_only"
            and protocol["promotionAllowed"] is False and protocol["publicationReady"] is False,
            "Research-only protocol cannot grant promotion or publication")
    plain(protocol["id"], "protocol id")
    declared, cutoff, kickoff = [instant(protocol[key], key) for key in ("declaredAt", "cutoff", "kickoff")]
    require(declared <= cutoff < kickoff, "Protocol must be declared by cutoff, strictly before kickoff")
    exact_keys(protocol["cohort"], ("gameId", "season", "week", "gameType"), "cohort")
    cohort = protocol["cohort"]
    require(cohort["gameType"] == "REG", "Only regular-season prospective evaluation is supported")
    require(cohort_classification(cohort["season"], cohort["week"]) != "development_only_already_inspected",
            "Inspected 2022–2025 and 2026 weeks 1–5 are development only, not an untouched evaluation set")
    require(isinstance(cohort["gameId"], str) and re.fullmatch(
        rf'{cohort["season"]}_{cohort["week"]:02d}_[A-Z]{{2,3}}_[A-Z]{{2,3}}', cohort["gameId"]), "Game/cohort identity mismatch")
    away, home = cohort["gameId"].split("_")[2:]
    require(away in NFL_TEAMS and home in NFL_TEAMS and away != home,
            "Game identity requires two distinct canonical NFL teams")
    require(cohort["season"] < 9999, "Season exceeds supported timestamp range")
    season_start = dt.datetime(cohort["season"], 7, 1, tzinfo=dt.timezone.utc)
    season_end = dt.datetime(cohort["season"] + 1, 7, 1, tzinfo=dt.timezone.utc)
    require(season_start <= kickoff < season_end, "Kickoff outside the season July-to-July window")
    require(protocol["developmentOnly"] == list(DEVELOPMENT_SCOPES), "Inspected development scopes must remain explicit")
    exact_keys(protocol["artifacts"], ARTIFACT_ROLES, "artifact references")
    exact_keys(artifact_bytes, ARTIFACT_ROLES, "artifact bytes")
    for role in ARTIFACT_ROLES:
        ref = protocol["artifacts"][role]
        exact_keys(ref, ("id", "version", "sha256", "knownAt", "evaluationEligible", "eligibilityReviewSha256"), role)
        plain(ref["id"], f"{role}.id")
        plain(ref["version"], f"{role}.version")
        require(ref["evaluationEligible"] is True, f"{role}: explicit evaluation eligibility required")
        sha(ref["eligibilityReviewSha256"], f"{role} eligibility review")
        require(instant(ref["knownAt"], f"{role}.knownAt") <= declared,
                f"{role}: exact pinned bytes were not known by protocol declaration")
        sha(ref["sha256"], role)
        require(type(artifact_bytes[role]) is bytes and 0 < len(artifact_bytes[role]) <= 64 * 1024 * 1024,
                f"{role}: exact bounded artifact bytes required")
        require(hashlib.sha256(artifact_bytes[role]).hexdigest() == ref["sha256"], f"{role}: artifact hash mismatch")
    seed_checked(protocol["seed"])
    count_checked(protocol["sampleCount"])
    require(protocol["metrics"] == METRIC_DEFINITIONS, "Metric definitions must be declared exactly")
    interval_levels_checked(protocol["intervalLevels"])
    ids = player_ids_checked(protocol["playerIds"])
    require(len(ids) * protocol["sampleCount"] <= MAX_PLAYER_DRAWS, "Player draw product exceeds bound")
    stat_names_checked(protocol["stats"])
    baselines = protocol["baselines"]
    require(isinstance(baselines, list) and 0 < len(baselines) <= 20, "Predeclared comparison baselines required")
    seen = set()
    for baseline in baselines:
        exact_keys(baseline, ("id", "version", "codeSha256", "configSha256", "inputsSha256", "knownAt",
                              "seed", "sampleCount"), "baseline")
        plain(baseline["id"], "baseline id")
        plain(baseline["version"], "baseline version")
        require(baseline["id"] not in seen, "Duplicate baseline identity")
        seen.add(baseline["id"])
        for field in ("codeSha256", "configSha256", "inputsSha256"):
            sha(baseline[field], field)
        require(instant(baseline["knownAt"], "baseline.knownAt") <= declared,
                "Baseline references were not known by protocol declaration")
        seed_checked(baseline["seed"])
        count_checked(baseline["sampleCount"])
    return {"protocolSha256": canonical_sha(protocol), "status": "research_only",
            "declarationValidated": True, "artifactByteIntegrityValidated": True,
            "validationScope": "schema_timing_and_artifact_bytes_not_substantive_eligibility",
            "limitations": ["artifact_contents_not_decoded_to_verify_cohort",
                            "baseline_bytes_not_verified",
                            "eligibility_reviews_referenced_not_executed",
                            "forecast_draws_and_outcome_sources_not_verified",
                            "predeclaration_time_supplied_not_independently_attested"],
            "cohortClassification": "prospective_declaration_requires_future_runner_verification",
            "forecastEvaluated": False, "promotionAllowed": False, "publicationReady": False}
