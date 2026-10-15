"""Offline, immutable matchup inputs; never a forecast or a production reader.

build_matchup_snapshot(matchup_id, schedule, current_audit, *, cutoff,
                       rule_edition, policy)

The schedule/current-source adapters verify raw bytes and release metadata. This
builder additionally verifies their normalized-record hashes, enforces the chosen
cutoff and scope, and seals the selected facts plus the exact receipt references.
First observation of the pinned source version is a conservative known-at time;
an unknown original publication time never prevents honest prospective research.
It never means that the same data was available before that first observation.

Freshness limits are an explicit caller-supplied, versioned research policy, not
a claim that a current-looking file establishes player availability. Missing
injury/role/usage facts remain missing. Candidate datasets cannot confirm a
game-day active list, and every result withholds full-game generation/publication.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import re
import unicodedata
from urllib.parse import urlparse

VERSION = "gtl-matchup-input-snapshot-1"
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / ".local" / "replay-data"
IMPLEMENTATION_PATH = ROOT / "shared" / "simulation-replay.mjs"
IMPLEMENTATION_ID = "gtl-simulation-replay-1"
MAX_MANIFEST_BYTES = 64 * 1024
SOURCES = ("weekly_rosters", "injuries", "depth_charts")
TEAMS = frozenset("ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split())
ALIASES = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS"}
ROSTER_FIELDS = frozenset(("season", "team", "week", "game_type", "gsis_id", "full_name", "position", "status"))
INJURY_FIELDS = frozenset(("season", "team", "week", "game_type", "gsis_id", "full_name", "position", "report_status", "practice_status"))
DEPTH_FIELDS = frozenset(("season", "dt", "team", "player_name", "gsis_id", "pos_grp_id", "pos_grp", "pos_id", "pos_abb", "pos_slot", "pos_rank"))
# Explicit official-page review; never a general suffix-stripping/name join.
NAME_ALIAS_REVIEW = {
    "version": "gtl-reviewed-player-names-1", "reviewedAt": "2026-10-15T16:22:07Z",
    "season": 2026, "teamId": "SEA", "entries": {
        "00-0036994": {"names": ("Ernest Jones", "Ernest Jones IV"), "sourceUrls": (
            "https://www.seahawks.com/team/players-roster/ernest-jones/",)},
        "00-0037323": {"names": ("Rodney Thomas", "Rodney Thomas II"), "sourceUrls": (
            "https://www.seahawks.com/team/players-roster/rodney-thomas-ii/",
            "https://www.nfl.com/players/rodney-thomas-4/",)},
        "00-0040621": {"names": ("Montorie Foster Jr", "Montorie Foster Jr."), "sourceUrls": (
            "https://www.seahawks.com/team/players-roster/montorie-foster-jr/logs/2026/reg/",
            "https://www.seahawks.com/news/montorie-foster-jr-knew-the-sky-was-the-limit-after-making-53-man-roster",)},
    },
}


class MatchupInputError(ValueError):
    """Integrity, cutoff or contradictory-identity error; no snapshot is accepted."""


class FrozenDict(dict):
    """JSON-serializable immutable output. Nested arrays are tuples."""
    def _blocked(self, *args, **kwargs):
        raise TypeError("Matchup snapshots are immutable")
    __setitem__ = __delitem__ = clear = pop = popitem = setdefault = update = __ior__ = _blocked


def freeze(value):
    if isinstance(value, dict):
        return FrozenDict({key: freeze(child) for key, child in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(freeze(child) for child in value)
    return value


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def content_hash(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def require(condition, message):
    if not condition:
        raise MatchupInputError(message)


def instant(value, field):
    require(isinstance(value, str), f"{field}: explicit timezone-aware timestamp required")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise MatchupInputError(f"{field}: invalid timestamp") from None
    require(parsed.tzinfo is not None, f"{field}: explicit timezone required")
    return parsed.astimezone(dt.timezone.utc)


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def plain(value, field, maximum=200):
    require(isinstance(value, str) and 0 < len(value) <= maximum and value.strip() == value
            and not any(unicodedata.category(c).startswith("C") for c in value), f"{field}: nonempty plain text required")
    return value


def sha(value, field):
    require(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value), f"{field}: SHA-256 required")
    return value


def team(value):
    require(isinstance(value, str), "Invalid team identity")
    normalized = ALIASES.get(value, value)
    require(normalized in TEAMS, "Unknown NFL team identity")
    return normalized


def player_id(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{2}-\d{7}", value), "Missing or invalid GSIS player identity")
    return value


def exact_keys(value, keys, field):
    require(isinstance(value, dict) and set(value) == set(keys), f"{field}: unexpected or missing fields")


def validate_policy(policy, cutoff):
    exact_keys(policy, ("id", "createdAt", "validFrom", "validUntil", "maxAgeHours"), "policy")
    plain(policy["id"], "policy.id")
    created, start, end = [instant(policy[key], f"policy.{key}") for key in ("createdAt", "validFrom", "validUntil")]
    require(created <= start <= cutoff < end, "Policy is future-dated, not effective, or stale")
    exact_keys(policy["maxAgeHours"], ("schedule", *SOURCES), "policy.maxAgeHours")
    limits = {}
    for source, hours in policy["maxAgeHours"].items():
        require(type(hours) in (int, float), "Policy freshness limits must be positive finite hours")
        try:
            number = float(hours)
        except OverflowError:
            raise MatchupInputError("Policy freshness limits must be positive finite hours") from None
        require(math.isfinite(number) and number > 0 and math.isfinite(number * 3600), "Policy freshness limits must be positive finite hours")
        limits[source] = number
    return {"id": policy["id"], "createdAt": iso(created), "validFrom": iso(start), "validUntil": iso(end), "maxAgeHours": limits}


def validate_rules(rules, game, cutoff):
    exact_keys(rules, ("id", "season", "gameType", "recordedAt", "sourceUrl", "implementationId", "implementationSha256"), "rule_edition")
    for key in ("id", "implementationId"):
        plain(rules[key], f"rule_edition.{key}")
    require(type(rules["season"]) is int and rules["season"] == game["season"] and rules["gameType"] == game["gameType"], "Rule edition does not cover the selected season/competition")
    recorded = instant(rules["recordedAt"], "rule_edition.recordedAt")
    require(recorded <= cutoff, "Rule implementation was recorded after cutoff")
    public_url(rules["sourceUrl"])
    sha(rules["implementationSha256"], "rule_edition.implementationSha256")
    return {**rules, "recordedAt": iso(recorded)}


def public_url(value):
    plain(value, "source URL", 2048)
    parsed = urlparse(value)
    require(parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username and not parsed.password
            and not parsed.query and not parsed.fragment, "Only an uncredentialed canonical HTTPS source URL is allowed")


def receipt_reference(receipt, source, rows, cutoff, policy, records_key):
    require(isinstance(receipt, dict), f"{source}: source receipt required")
    if source != "schedule":
        require(receipt.get("source") == source, f"{source}: receipt source mismatch")
    sha(receipt.get("sha256"), f"{source}.sha256")
    sha(receipt.get("metadataSha256"), f"{source}.metadataSha256")
    require(sha(receipt.get(records_key), f"{source}.{records_key}") == content_hash(rows), f"{source}: normalized record integrity mismatch")
    public_url(receipt.get("url"))
    first = instant(receipt.get("firstObservedAt"), f"{source}.firstObservedAt")
    retrieved = instant(receipt.get("retrievedAt"), f"{source}.retrievedAt")
    updated = instant(receipt.get("assetUpdatedAt"), f"{source}.assetUpdatedAt")
    require(first <= retrieved <= cutoff and updated <= retrieved, f"{source}: source was not observed/retrieved by cutoff or has inconsistent revision time")
    earliest = receipt.get("earliestObservationRef") if source == "schedule" else None
    if source != "schedule":
        require(updated <= first, f"{source}: observation predates this source version")
    elif first < updated or earliest is not None:
        # Identical schedule bytes may be republished with later release metadata.
        # Only the verified loader's earlier matching receipt permits that case.
        require(isinstance(earliest, dict), "schedule: earlier observation receipt evidence required")
        exact_keys(earliest, ("sha256", "receiptSha256", "metadataSha256", "assetUpdatedAt", "retrievedAt"), "schedule.earliestObservationRef")
        require(earliest.get("sha256") == receipt["sha256"], "schedule: earlier observation raw hash mismatch")
        for key in ("receiptSha256", "metadataSha256"):
            sha(earliest.get(key), f"schedule.earliestObservationRef.{key}")
        earliest_updated = instant(earliest.get("assetUpdatedAt"), "schedule.earliestObservationRef.assetUpdatedAt")
        earliest_retrieved = instant(earliest.get("retrievedAt"), "schedule.earliestObservationRef.retrievedAt")
        require(earliest_updated <= earliest_retrieved == first, "schedule: contradictory earlier observation evidence")
    times = {"firstObservedAt": iso(first), "retrievedAt": iso(retrieved), "assetUpdatedAt": iso(updated)}
    for name in ("publishedAt", "revisionAt", "coverageAsOf"):
        value = receipt.get(name)
        stamp = None if value is None else instant(value, f"{source}.{name}")
        require(stamp is None or stamp <= retrieved, f"{source}: future {name}")
        times[name] = None if stamp is None else iso(stamp)
    # Every applicable freshness clock must pass. Re-fetching old bytes or adding
    # a recent coverage assertion cannot reset the verified release's age.
    freshness = {"assetUpdatedAt": updated, "firstObservedAt": first, "retrievedAt": retrieved}
    if times["coverageAsOf"]:
        freshness["coverageAsOf"] = instant(times["coverageAsOf"], f"{source}.coverageAsOf")
    if earliest is not None:
        freshness["earliestObservationRef.assetUpdatedAt"] = earliest_updated
    for field, stamp in freshness.items():
        require((cutoff - stamp).total_seconds() <= policy["maxAgeHours"][source] * 3600,
                f"{source}: {field} exceeds declared freshness policy")
    return {"source": source, "url": receipt["url"], "sha256": receipt["sha256"], "metadataSha256": receipt["metadataSha256"],
            "normalizedSha256": receipt[records_key], "receiptSha256": content_hash(receipt), **times,
            "earliestObservationRef": earliest,
            "knownAt": iso(first), "knownAtBasis": "first_verified_observation",
            "originalPublicationKnown": times["publishedAt"] is not None}


def select_matchup(matchup_id, schedule, cutoff):
    require(isinstance(schedule, dict) and isinstance(schedule.get("games"), list), "Canonical schedule games required")
    plain(matchup_id, "matchup_id")
    games = schedule["games"]
    ids = set()
    for game in games:
        require(isinstance(game, dict) and isinstance(game.get("id"), str), "Invalid schedule identity")
        require(game["id"] not in ids, "Duplicate schedule identity")
        ids.add(game["id"])
    selected = [game for game in games if game["id"] == matchup_id]
    require(len(selected) == 1, "Selected matchup is missing or ambiguous")
    game = selected[0]
    require(type(game.get("season")) is int and type(game.get("week")) is int and 1 <= game["week"] <= 18 and game.get("gameType") == "REG", "Only a canonical regular-season matchup is supported")
    home, away = team(game.get("homeTeamId")), team(game.get("awayTeamId"))
    require(home != away, "Conflicting matchup teams")
    require(matchup_id == f'{game["season"]}_{game["week"]:02d}_{away}_{home}', "Canonical matchup ID conflicts with its teams/week")
    kickoff = instant(game.get("kickoff"), "matchup.kickoff")
    require(kickoff.year in (game["season"], game["season"] + 1), "Matchup kickoff conflicts with its season")
    require(cutoff < kickoff, "Matchup has started; a prospective input cutoff must precede kickoff")
    require(game.get("resultStatus") == "unplayed" and game.get("homeScore") is None and game.get("awayScore") is None, "Selected matchup already carries outcome labels")
    for other in games:
        if other is game or other.get("season") != game["season"] or other.get("week") != game["week"] or other.get("gameType") != "REG":
            continue
        require(not ({team(other.get("homeTeamId")), team(other.get("awayTeamId"))} & {home, away}), "Conflicting team/week schedule identities")
    # Score and result fields are deliberately NOT copied into a prospective feature snapshot.
    source_id = plain(game.get("sourceGameId"), "matchup.sourceGameId")
    parts = source_id.split("_")
    require(len(parts) == 4 and parts[:2] == [str(game["season"]), f'{game["week"]:02d}']
            and team(parts[2]) == away and team(parts[3]) == home, "Source matchup identity conflicts with canonical teams/week")
    return {"id": matchup_id, "sourceGameId": source_id,
            "season": game["season"], "week": game["week"], "gameType": "REG", "homeTeamId": home, "awayTeamId": away, "kickoff": iso(kickoff)}


def selected_rows(rows, source, game, cutoff, policy):
    fields = {"weekly_rosters": ROSTER_FIELDS, "injuries": INJURY_FIELDS, "depth_charts": DEPTH_FIELDS}[source]
    selected, seen = [], set()
    for row in rows:
        exact_keys(row, fields, f"{source} record")
        require(type(row["season"]) is int, f"{source}: invalid season")
        code = team(row["team"])
        identity = player_id(row["gsis_id"])
        if row["season"] != game["season"] or code not in (game["homeTeamId"], game["awayTeamId"]):
            continue
        if source != "depth_charts":
            require(type(row["week"]) is int and 1 <= row["week"] <= 22, f"{source}: invalid week")
            if row["week"] != game["week"] or row["game_type"] != game["gameType"]:
                continue
            key = (code, identity)
            plain(row["full_name"], f"{source}.full_name", 100)
            plain(row["position"], f"{source}.position", 20)
        else:
            stamp = instant(row["dt"], "depth_charts.dt")
            require(stamp <= cutoff, "Depth chart provider observation is after cutoff")
            require((cutoff - stamp).total_seconds() <= policy["maxAgeHours"][source] * 3600, "Depth chart provider observation is stale")
            plain(row["player_name"], "depth_charts.player_name", 100)
            for key_name in ("pos_grp_id", "pos_id", "pos_slot", "pos_rank"):
                require(type(row[key_name]) is int and row[key_name] >= 0, f"depth_charts.{key_name}: nonnegative integer required")
            for key_name in ("pos_grp", "pos_abb"):
                plain(row[key_name], f"depth_charts.{key_name}", 60)
            key = (code, identity, row["pos_grp_id"], row["pos_id"], row["pos_slot"])
        require(key not in seen, f"{source}: duplicate/conflicting selected player record")
        seen.add(key)
        selected.append({**row, "team": code})
    return sorted(selected, key=canonical_json)


def name_key(value):
    return " ".join(unicodedata.normalize("NFC", value).casefold().split())


def review_name_identity(owner, other_name, source, game, cutoff):
    if name_key(owner["full_name"]) == name_key(other_name):
        return None
    review = NAME_ALIAS_REVIEW
    entry = review["entries"].get(owner["gsis_id"])
    allowed = {name_key(name) for name in entry["names"]} if entry else set()
    require(entry is not None and game["season"] == review["season"] and owner["team"] == review["teamId"]
            and {name_key(owner["full_name"]), name_key(other_name)} <= allowed,
            "Player identity has conflicting source names; an explicit identity review is required")
    require(instant(review["reviewedAt"], "name alias reviewedAt") <= cutoff, "Player identity review was after the input cutoff")
    return {"ruleVersion": review["version"], "reviewedAt": review["reviewedAt"], "season": game["season"],
            "teamId": owner["team"], "playerId": owner["gsis_id"], "rosterName": owner["full_name"],
            "sourceName": other_name, "source": source, "sourceUrls": entry["sourceUrls"]}


def build_matchup_snapshot(matchup_id, schedule, current_audit, *, cutoff, rule_edition, policy):
    """Build a sealed research record or raise on integrity/scope/cutoff conflicts.

    A successful construction means its inputs were checked, NOT that the game
    can be generated. Withholding reasons and missing facts are part of the hash.
    """
    cutoff = instant(cutoff, "cutoff")
    policy = validate_policy(policy, cutoff)
    game = select_matchup(matchup_id, schedule, cutoff)
    rules = validate_rules(rule_edition, game, cutoff)
    sources = {"schedule": receipt_reference(schedule.get("sourceRef"), "schedule", schedule["games"], cutoff, policy, "gamesSha256")}
    require(isinstance(current_audit, dict) and isinstance(current_audit.get("records"), dict) and isinstance(current_audit.get("report"), dict), "Current-source audit envelope required")
    records, report = current_audit["records"], current_audit["report"]
    require(set(records) == set(SOURCES), "Current-source record scopes do not match the supported contract")
    require(report.get("season") == game["season"], "Current-source audit season mismatch")
    require(instant(report.get("asOf"), "audit.asOf") <= cutoff, "Current-source audit was constructed after cutoff")
    statuses = report.get("sourceStatus")
    require(isinstance(statuses, dict) and set(statuses) == set(SOURCES), "Explicit status for every current source is required")
    provenance = report.get("provenance")
    require(isinstance(provenance, list), "Current-source provenance required")
    receipts = {}
    for receipt in provenance:
        require(isinstance(receipt, dict) and receipt.get("source") in SOURCES, "Unknown current-source receipt scope")
        require(receipt["source"] not in receipts, "Duplicate current-source receipt")
        receipts[receipt["source"]] = receipt
    reasons = {"game_day_availability_unverified", "usage_inputs_missing", "complete_rules_unvalidated", "whole_game_model_unvalidated", "production_reader_unimplemented"}
    selected, coverage = {}, {}
    for source in SOURCES:
        require(isinstance(records[source], list), f"{source}: record array required")
        require(statuses[source] in ("available", "unavailable"), f"{source}: unknown source status")
        source_coverage = report.get("coverage", {}).get(source)
        if source_coverage is None:
            reasons.add(f"source_coverage_unverified:{source}")
            coverage[source] = None
        else:
            require(isinstance(source_coverage, dict), f"{source}: invalid coverage report")
            coverage[source] = {key: source_coverage.get(key) for key in ("acceptedRows", "rejectedRows", "rejections", "missingValues", "schemaDrift", "complete", "completeMeaning", "expectedTeamWeekCoverageReconciled", "unavailableReason")}
            if statuses[source] == "unavailable" and source not in receipts:
                # The adapter cannot count rows in an unobserved source. Keep
                # those counts unknown instead of inventing zero or rejecting
                # its legitimate unavailable envelope.
                reasons.add(f"source_coverage_unverified:{source}")
            else:
                rejected = source_coverage.get("rejectedRows")
                accepted = source_coverage.get("acceptedRows")
                require(type(rejected) is int and rejected >= 0, f"{source}: invalid rejected-row count")
                require(type(accepted) is int and accepted == len(records[source]), f"{source}: accepted-row count disagrees with records")
                if rejected:
                    reasons.add(f"source_records_quarantined:{source}")
                if source_coverage.get("schemaDrift"):
                    reasons.add(f"source_schema_drift:{source}")
                if source_coverage.get("complete") is not True:
                    reasons.add(f"source_coverage_incomplete:{source}")
        if source in receipts:
            require(receipts[source].get("season") == game["season"], f"{source}: receipt season mismatch")
            sources[source] = receipt_reference(receipts[source], source, records[source], cutoff, policy, "recordsSha256")
        if statuses[source] == "unavailable":
            require(not records[source], f"{source}: unavailable source contains unverified facts")
            selected[source] = []
            reasons.add(f"source_unavailable:{source}")
            continue
        require(source in receipts, f"{source}: available source has no receipt")
        selected[source] = selected_rows(records[source], source, game, cutoff, policy)
        for code in (game["homeTeamId"], game["awayTeamId"]):
            if not any(row["team"] == code for row in selected[source]):
                reasons.add(f"matching_scope_missing:{source}:{code}")
    # Check the stable identity, not names or ESPN IDs, before joining any role or injury fact.
    roster = {}
    for row in selected["weekly_rosters"]:
        pid = row["gsis_id"]
        require(pid not in roster, "Player identity has conflicting team/roster membership")
        roster[pid] = row
    joined = {source: {} for source in ("injuries", "depth_charts")}
    unresolved, identity_resolutions = [], []
    for source in joined:
        for row in selected[source]:
            pid = row["gsis_id"]
            if pid not in roster:
                unresolved.append({"source": source, "playerId": pid, "teamId": row["team"]})
                reasons.add(f"unmatched_identity:{source}")
                continue
            owner = roster[pid]
            require(owner["team"] == row["team"], "Player identity has conflicting team assignments")
            other_name = row["full_name"] if source == "injuries" else row["player_name"]
            resolution = review_name_identity(owner, other_name, source, game, cutoff)
            if resolution:
                identity_resolutions.append(resolution)
            joined[source].setdefault(pid, []).append(row)
    players = []
    for pid, row in sorted(roster.items()):
        injury = joined["injuries"].get(pid, [None])[0]
        roles = joined["depth_charts"].get(pid, [])
        status = row["status"]
        require(status is None or isinstance(status, str), "Roster status must be text or unknown")
        for value in (() if injury is None else (injury["report_status"], injury["practice_status"])):
            require(value is None or isinstance(value, str), "Injury report status must be text or unknown")
        report_status = injury["report_status"] if injury else None
        normalized = report_status.casefold() if report_status else None
        availability = {"out": "reported_out", "doubtful": "reported_doubtful", "questionable": "reported_questionable"}.get(normalized, "unknown")
        conflicts = []
        if status == "ACT" and normalized == "out":
            conflicts.append("active_roster_but_reported_out")
        missing = ["confirmed_game_day_availability", "usage"]
        if injury is None:
            missing.append("matching_injury_record")
        elif report_status is None:
            missing.append("injury_report_status")
        if not roles:
            missing.append("role")
            reasons.add("player_roles_missing")
        players.append({"id": pid, "name": row["full_name"], "teamId": row["team"], "position": row["position"],
                        "rosterStatus": status, "availability": {"state": availability, "gameDayConfirmed": False,
                        "reportStatus": report_status, "practiceStatus": injury["practice_status"] if injury else None,
                        "conflicts": conflicts},
                        "roles": [{key: role[key] for key in ("dt", "pos_grp_id", "pos_grp", "pos_id", "pos_abb", "pos_slot", "pos_rank")} for role in roles],
                        "usage": None, "missing": missing,
                        "sourceRefs": {"roster": sources["weekly_rosters"]["receiptSha256"],
                                       "injury": sources["injuries"]["receiptSha256"] if injury else None,
                                       "roles": sources["depth_charts"]["receiptSha256"] if roles else None}})
    payload = {"version": VERSION, "status": "withheld", "publicationReady": False, "generationAllowed": False,
               "inputCutoff": iso(cutoff), "matchup": game, "ruleEdition": rules, "ruleEditionSha256": content_hash(rules),
               "policy": policy, "policySha256": content_hash(policy), "sources": [sources[key] for key in sorted(sources)],
               "sourceStatus": {"schedule": "available", **statuses}, "sourceCoverage": coverage, "players": players,
               "unresolvedReferences": sorted(unresolved, key=canonical_json), "withholdingReasons": sorted(reasons),
               "identityResolutions": sorted(identity_resolutions, key=canonical_json),
               "limitations": ["Original publication times may be unknown; facts are usable no earlier than the pinned version's first verified observation.",
                               "Release-file freshness and provider depth timestamps do not confirm game-day participation or injuries; roster/injury row observation times are unknown.",
                               "The rule source URL identifies an edition reference; implementationSha256 hashes incomplete research code, not a complete rulebook implementation.",
                               "This contract does not model usage, assign probabilities, generate a game, or authorize publication."]}
    return freeze({**payload, "snapshotSha256": content_hash(payload)})


def read_manifest(path):
    """Read explicit local policy/rule JSON, with bounded bytes and unique keys."""
    with pathlib.Path(path).open("rb") as handle:
        encoded = handle.read(MAX_MANIFEST_BYTES + 1)
    require(len(encoded) <= MAX_MANIFEST_BYTES, "Manifest exceeds 64 KiB")

    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Manifest has duplicate keys")
            result[key] = value
        return result

    def invalid_constant(value):
        raise MatchupInputError("Manifest contains nonfinite JSON numbers")

    value = json.loads(encoded, object_pairs_hook=unique_keys, parse_constant=invalid_constant)
    require(isinstance(value, dict), "Manifest must be a JSON object")
    return value


def verify_implementation(rule_edition):
    """CLI pins the actual local research reducer; a syntactic hash is insufficient."""
    require(rule_edition.get("implementationId") == IMPLEMENTATION_ID, "Unsupported research implementation ID")
    actual = hashlib.sha256(IMPLEMENTATION_PATH.read_bytes()).hexdigest()
    require(rule_edition.get("implementationSha256") == actual, "Rule implementation hash does not match the local reducer")


def load_verified_inputs(cutoff):
    """Only verified local adapter receipts; never fetch or treat corruption as absence."""
    from replay_schedule import load_schedule
    from replay_current_sources import load_snapshot, audit_current_sources, NoEligibleSnapshotError
    schedule = load_schedule(cutoff)
    snapshots = {}
    for source in SOURCES:
        try:
            snapshots[source] = load_snapshot(source, cutoff)
        except NoEligibleSnapshotError:
            pass
    return schedule, audit_current_sources(snapshots, cutoff)


def store_snapshot(snapshot):
    """Save one immutable canonical artifact under the fixed ignored research root."""
    from replay_sources import immutable_write
    payload = {key: value for key, value in snapshot.items() if key != "snapshotSha256"}
    require(snapshot.get("snapshotSha256") == content_hash(payload), "Snapshot hash no longer matches its contents")
    root = DATA_DIR.resolve()
    path = root / ("matchup-input-" + snapshot["snapshotSha256"] + ".json")
    require(path.resolve().parent == root, "Snapshot output escapes the local research directory")
    encoded = canonical_json(snapshot).encode("utf-8")
    immutable_write(path, encoded)
    return path, hashlib.sha256(encoded).hexdigest()


def aggregate_summary(snapshot, path, artifact_hash):
    players = snapshot["players"]
    return {"matchup": snapshot["matchup"]["id"], "inputCutoff": snapshot["inputCutoff"],
            "status": snapshot["status"], "publicationReady": False, "generationAllowed": False,
            "players": len(players), "playersByTeam": {code: sum(p["teamId"] == code for p in players)
                for code in (snapshot["matchup"]["homeTeamId"], snapshot["matchup"]["awayTeamId"])},
            "unknownAvailability": sum(p["availability"]["state"] == "unknown" for p in players),
            "missingRoles": sum(not p["roles"] for p in players),
            "unresolvedReferences": len(snapshot["unresolvedReferences"]),
            "withholdingReasons": snapshot["withholdingReasons"], "snapshotSha256": snapshot["snapshotSha256"],
            "artifactSha256": artifact_hash, "path": str(path)}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build an offline, withheld research matchup input snapshot from verified cached sources. No fetching or forecasts.")
    parser.add_argument("--matchup", required=True)
    parser.add_argument("--policy", required=True, help="Explicit local JSON freshness policy, at most 64 KiB")
    parser.add_argument("--rule-edition", required=True, help="Explicit local JSON rule edition, at most 64 KiB")
    parser.add_argument("--as-of", default=None, help="Timezone-aware cutoff; defaults to current UTC time")
    args = parser.parse_args(argv)
    try:
        now = dt.datetime.now(dt.timezone.utc)
        cutoff = instant(args.as_of, "as-of") if args.as_of else now
        require(cutoff <= now, "A research input cutoff cannot be in the future")
        policy, rules = read_manifest(args.policy), read_manifest(args.rule_edition)
        verify_implementation(rules)
        schedule, audit = load_verified_inputs(cutoff)
        snapshot = build_matchup_snapshot(args.matchup, schedule, audit, cutoff=iso(cutoff), rule_edition=rules, policy=policy)
        path, artifact_hash = store_snapshot(snapshot)
        print(json.dumps(aggregate_summary(snapshot, path, artifact_hash), indent=2))
    except (ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
