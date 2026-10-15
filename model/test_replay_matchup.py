"""Offline input-contract fixtures only; no network, accounts or generated NFL results."""
import copy
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("replay_matchup", pathlib.Path(__file__).with_name("replay_matchup.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
CUTOFF = "2026-10-15T16:00:00Z"
OBSERVED = "2026-10-15T15:00:00Z"
UPDATED = "2026-10-15T14:00:00Z"
GAME_ID = "2026_06_SEA_BUF"


def receipt(source, rows):
    return {"source": source, "season": 2026, "url": f"https://example.test/{source}",
            "sha256": "1" * 64, "metadataSha256": "2" * 64,
            "gamesSha256" if source == "schedule" else "recordsSha256": m.content_hash(rows),
            "assetUpdatedAt": UPDATED, "publishedAt": None, "revisionAt": None, "coverageAsOf": None,
            "firstObservedAt": OBSERVED, "retrievedAt": OBSERVED}


def inputs():
    game = {"id": GAME_ID, "sourceGameId": GAME_ID, "season": 2026, "week": 6, "gameType": "REG",
            "homeTeamId": "BUF", "awayTeamId": "SEA", "kickoff": "2026-10-18T17:00:00Z", "gameDate": "2026-10-18",
            "homeScore": None, "awayScore": None, "resultStatus": "unplayed"}
    schedule = {"games": [game], "sourceRef": receipt("schedule", [game])}
    roster, injuries, depth = [], [], []
    for code, pid, name in (("BUF", "00-0000001", "Fixture Home"), ("SEA", "00-0000002", "Fixture Away")):
        roster.append({"season": 2026, "team": code, "week": 6, "game_type": "REG", "gsis_id": pid,
                       "full_name": name, "position": "QB", "status": "ACT"})
        injuries.append({"season": 2026, "team": code, "week": 6, "game_type": "REG", "gsis_id": pid,
                         "full_name": name, "position": "QB", "report_status": None, "practice_status": "Full"})
        depth.append({"season": 2026, "dt": UPDATED, "team": code, "player_name": name, "gsis_id": pid,
                      "pos_grp_id": 1, "pos_grp": "Offense", "pos_id": 1, "pos_abb": "QB", "pos_slot": 1, "pos_rank": 1})
    records = {"weekly_rosters": roster, "injuries": injuries, "depth_charts": depth}
    audit = {"records": records, "report": {"season": 2026, "asOf": OBSERVED,
             "sourceStatus": {key: "available" for key in m.SOURCES},
             "coverage": {key: {"acceptedRows": len(rows), "rejectedRows": 0, "rejections": {}, "missingValues": {}, "schemaDrift": False, "complete": True} for key, rows in records.items()},
             "provenance": [receipt(key, rows) for key, rows in records.items()]}}
    rules = {"id": "nfl-2026-regular-season", "season": 2026, "gameType": "REG", "recordedAt": UPDATED,
             "sourceUrl": "https://example.test/test-only-rulebook", "implementationId": "regulation-research-v1", "implementationSha256": "3" * 64}
    policy = {"id": "test-only-freshness-v1", "createdAt": "2026-10-14T00:00:00Z", "validFrom": "2026-10-14T00:00:00Z",
              "validUntil": "2026-10-17T00:00:00Z", "maxAgeHours": {key: 24 for key in ("schedule", *m.SOURCES)}}
    return schedule, audit, rules, policy


def seal(schedule, audit):
    schedule["sourceRef"]["gamesSha256"] = m.content_hash(schedule["games"])
    for ref in audit["report"]["provenance"]:
        ref["recordsSha256"] = m.content_hash(audit["records"][ref["source"]])
        audit["report"]["coverage"][ref["source"]]["acceptedRows"] = len(audit["records"][ref["source"]])


def build(values=None, **kwargs):
    schedule, audit, rules, policy = values or inputs()
    return m.build_matchup_snapshot(kwargs.pop("matchup_id", GAME_ID), schedule, audit, cutoff=kwargs.pop("cutoff", CUTOFF),
                                    rule_edition=rules, policy=policy, **kwargs)


class MatchupInputTests(unittest.TestCase):
    def test_sealed_deterministic_snapshot_strips_outcomes_and_never_enables_generation(self):
        values = inputs(); before = copy.deepcopy(values)
        result = build(values)
        self.assertEqual(result, build(values))
        self.assertEqual(values, before)
        self.assertEqual(result["matchup"]["kickoff"], "2026-10-18T17:00:00Z")
        self.assertFalse(result["publicationReady"])
        self.assertFalse(result["generationAllowed"])
        self.assertNotIn("ready", result)
        self.assertIsNone(result["players"][0]["usage"])
        self.assertIn("whole_game_model_unvalidated", result["withholdingReasons"])
        self.assertNotIn("homeScore", m.canonical_json(result))
        self.assertNotIn("awayScore", m.canonical_json(result))
        payload = {key: value for key, value in result.items() if key != "snapshotSha256"}
        self.assertEqual(result["snapshotSha256"], m.content_hash(payload))
        self.assertEqual(json.loads(m.canonical_json(result))["snapshotSha256"], result["snapshotSha256"])
        with self.assertRaises(TypeError): result["status"] = "ready"
        with self.assertRaises(TypeError): result["players"][0]["availability"]["state"] = "healthy"
        with self.assertRaises(AttributeError): result["players"].append({})

    def test_unknown_publication_allows_prospective_use_from_first_observation_only(self):
        result = build()
        for ref in result["sources"]:
            self.assertFalse(ref["originalPublicationKnown"])
            self.assertEqual(ref["knownAt"], OBSERVED)
            self.assertEqual(ref["knownAtBasis"], "first_verified_observation")
        with self.assertRaises(m.MatchupInputError):
            build(cutoff="2026-10-15T14:59:59Z")
        # An old declared publication time does not backdate this copy's first verified observation.
        values = inputs(); values[1]["report"]["asOf"] = "2026-10-15T14:00:00Z"
        for ref in [values[0]["sourceRef"], *values[1]["report"]["provenance"]]: ref["publishedAt"] = "2026-10-14T10:00:00Z"
        with self.assertRaises(m.MatchupInputError): build(values, cutoff="2026-10-15T14:59:59Z")

    def test_tampered_normalized_records_or_receipt_and_missing_times_fail_closed(self):
        for source in ("schedule", *m.SOURCES):
            values = inputs(); schedule, audit, _, _ = values
            if source == "schedule": schedule["games"][0]["kickoff"] = "2026-10-18T20:00:00Z"
            else: audit["records"][source][0]["team"] = "SEA"
            with self.subTest(source=source), self.assertRaisesRegex(m.MatchupInputError, "integrity"):
                build(values)
        for patch in ({"sha256": "bad"}, {"metadataSha256": None}, {"firstObservedAt": None},
                      {"retrievedAt": "2026-10-16T00:00:00Z"}, {"revisionAt": "2026-10-16T00:00:00Z"},
                      {"assetUpdatedAt": "2026-10-16T00:00:00Z"}, {"coverageAsOf": "2026-10-16T00:00:00Z"}):
            values = inputs(); values[1]["report"]["provenance"][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(m.MatchupInputError): build(values)

    def test_policy_and_rule_edition_are_versioned_scoped_and_time_checked(self):
        for patch in ({"validUntil": CUTOFF}, {"validFrom": "2026-10-16T00:00:00Z"}, {"createdAt": "2026-10-16T00:00:00Z"}):
            values = inputs(); values[3].update(patch)
            with self.subTest(patch=patch), self.assertRaises(m.MatchupInputError): build(values)
        for limit in (0, -1, float("nan"), float("inf"), 1e308, 10 ** 400, True):
            values = inputs(); values[3]["maxAgeHours"]["injuries"] = limit
            with self.subTest(limit=limit), self.assertRaises(m.MatchupInputError): build(values)
        for patch in ({"season": 2025}, {"gameType": "POST"}, {"recordedAt": "2026-10-16T00:00:00Z"}, {"implementationSha256": "missing"}, {"ready": True}):
            values = inputs(); values[2].update(patch)
            with self.subTest(patch=patch), self.assertRaises(m.MatchupInputError): build(values)

    def test_unknown_and_conflicting_availability_are_never_healthy(self):
        values = inputs(); values[1]["records"]["injuries"][0]["report_status"] = "Out"
        seal(values[0], values[1]); result = build(values)
        home, away = result["players"]
        self.assertEqual(home["availability"]["state"], "reported_out")
        self.assertEqual(home["availability"]["conflicts"], ("active_roster_but_reported_out",))
        self.assertEqual(away["availability"]["state"], "unknown")
        self.assertFalse(home["availability"]["gameDayConfirmed"])
        self.assertFalse(away["availability"]["gameDayConfirmed"])
        self.assertEqual(away["availability"]["practiceStatus"], "Full")

    def test_unavailable_and_fully_quarantined_sources_remain_distinct(self):
        values = inputs(); audit = values[1]
        audit["records"]["injuries"] = []
        audit["report"]["sourceStatus"]["injuries"] = "unavailable"
        audit["report"]["provenance"] = [ref for ref in audit["report"]["provenance"] if ref["source"] != "injuries"]
        absent = build(values)
        self.assertIn("source_unavailable:injuries", absent["withholdingReasons"])
        self.assertEqual(absent["players"][0]["availability"]["state"], "unknown")
        self.assertIsNone(absent["players"][0]["sourceRefs"]["injury"])
        audit["report"]["provenance"].append(receipt("injuries", []))
        audit["report"]["coverage"]["injuries"].update(acceptedRows=0, rejectedRows=2, rejections={"identity_missing": 2}, complete=False)
        quarantined = build(values)
        self.assertIn("source_records_quarantined:injuries", quarantined["withholdingReasons"])
        self.assertIn("injuries", [ref["source"] for ref in quarantined["sources"]])

    def test_actual_adapter_absent_sources_produce_unknown_counts_and_withheld_snapshot(self):
        spec = importlib.util.spec_from_file_location("replay_current_sources", pathlib.Path(__file__).with_name("replay_current_sources.py"))
        adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
        values = inputs()
        values = (values[0], adapter.audit_current_sources({}, OBSERVED), values[2], values[3])
        result = build(values)
        self.assertEqual(result["players"], ())
        self.assertEqual(len(result["sources"]), 1)
        for source in m.SOURCES:
            self.assertIn(f"source_unavailable:{source}", result["withholdingReasons"])
            self.assertIsNone(result["sourceCoverage"][source]["acceptedRows"])
            self.assertIsNone(result["sourceCoverage"][source]["rejectedRows"])
            self.assertTrue(result["sourceCoverage"][source]["unavailableReason"])

    def test_wrong_week_roster_and_unmatched_source_player_are_not_invented_participants(self):
        values = inputs(); audit = values[1]
        audit["records"]["weekly_rosters"][0]["week"] = 5
        seal(values[0], audit); result = build(values)
        self.assertEqual([p["teamId"] for p in result["players"]], ["SEA"])
        self.assertIn("matching_scope_missing:weekly_rosters:BUF", result["withholdingReasons"])
        self.assertIn("unmatched_identity:injuries", result["withholdingReasons"])
        self.assertEqual(result["unresolvedReferences"][0]["playerId"], "00-0000001")

    def test_duplicate_or_contradictory_identities_are_rejected(self):
        for source in m.SOURCES:
            values = inputs(); audit = values[1]
            audit["records"][source].append(copy.deepcopy(audit["records"][source][0]))
            seal(values[0], audit)
            with self.subTest(source=source), self.assertRaisesRegex(m.MatchupInputError, "duplicate"):
                build(values)
        for patch in ({"team": "SEA"}, {"full_name": "Different Person"}):
            values = inputs(); values[1]["records"]["injuries"][0].update(patch)
            seal(values[0], values[1])
            with self.subTest(patch=patch), self.assertRaisesRegex(m.MatchupInputError, "conflicting"):
                build(values)
        values = inputs(); values[1]["records"]["weekly_rosters"][1]["gsis_id"] = "00-0000001"
        seal(values[0], values[1])
        with self.assertRaisesRegex(m.MatchupInputError, "conflicting"): build(values)

    def test_old_file_does_not_become_current_when_retrieved_again_and_future_depth_is_rejected(self):
        values = inputs(); values[1]["report"]["provenance"][0]["assetUpdatedAt"] = "2026-10-01T00:00:00Z"
        with self.assertRaisesRegex(m.MatchupInputError, "freshness"): build(values)
        # A recent asserted coverage time cannot replace an older verified release date.
        values[1]["report"]["provenance"][0]["coverageAsOf"] = OBSERVED
        with self.assertRaisesRegex(m.MatchupInputError, "assetUpdatedAt.*freshness"): build(values)
        values = inputs(); values[1]["report"]["provenance"][0]["firstObservedAt"] = "2026-10-01T00:00:00Z"
        with self.assertRaisesRegex(m.MatchupInputError, "observation predates"): build(values)
        values = inputs(); values[1]["report"]["provenance"][0]["coverageAsOf"] = "2026-10-01T00:00:00Z"
        with self.assertRaisesRegex(m.MatchupInputError, "coverageAsOf.*freshness"): build(values)
        for stamp in ("2026-10-16T00:00:00Z", "2026-10-01T00:00:00Z"):
            values = inputs(); values[1]["records"]["depth_charts"][0]["dt"] = stamp
            seal(values[0], values[1])
            with self.subTest(stamp=stamp), self.assertRaises(m.MatchupInputError): build(values)

    def test_matchup_scope_unknown_kickoff_outcome_and_duplicate_schedule_fail_closed(self):
        for patch in ({"kickoff": None}, {"kickoff": CUTOFF}, {"homeScore": 0}, {"resultStatus": "reported_final"},
                      {"gameType": "POST"}, {"week": 7}, {"sourceGameId": "2026_06_BUF_SEA"}):
            values = inputs(); values[0]["games"][0].update(patch); seal(values[0], values[1])
            with self.subTest(patch=patch), self.assertRaises(m.MatchupInputError): build(values)
        with self.assertRaisesRegex(m.MatchupInputError, "missing"): build(matchup_id="2026_06_BUF_SEA")
        values = inputs(); values[0]["games"].append(copy.deepcopy(values[0]["games"][0])); seal(values[0], values[1])
        with self.assertRaisesRegex(m.MatchupInputError, "Duplicate"): build(values)

    def test_aliases_canonicalize_and_unused_rows_cannot_copy_private_fields(self):
        values = inputs(); game = values[0]["games"][0]
        game.update(id="2026_06_SEA_LAR", sourceGameId="2026_06_SEA_LA", homeTeamId="LA")
        for rows in values[1]["records"].values():
            for row in rows:
                if row["team"] == "BUF": row["team"] = "LA"
        seal(values[0], values[1]); result = build(values, matchup_id="2026_06_SEA_LAR")
        self.assertEqual(result["matchup"]["homeTeamId"], "LAR")
        values = inputs(); values[1]["records"]["weekly_rosters"][0]["privatePicks"] = "NEVER"
        seal(values[0], values[1])
        with self.assertRaisesRegex(m.MatchupInputError, "unexpected"): build(values)

    def test_audit_readiness_flags_never_override_withholding_and_counts_must_agree(self):
        values = inputs(); values[1]["report"].update(productionReady=True, ready=True, publishable=True)
        result = build(values)
        self.assertFalse(result["publicationReady"])
        self.assertFalse(result["generationAllowed"])
        values[1]["report"]["coverage"]["injuries"]["acceptedRows"] = 999
        with self.assertRaisesRegex(m.MatchupInputError, "count disagrees"): build(values)

    def test_receipt_order_is_irrelevant_but_changed_provenance_or_policy_changes_snapshot_hash(self):
        values = inputs(); original = build(values)
        values[1]["report"]["provenance"].reverse()
        self.assertEqual(original, build(values))
        values[3]["id"] = "test-only-freshness-v2"
        self.assertNotEqual(original["snapshotSha256"], build(values)["snapshotSha256"])

    def test_earlier_schedule_observation_requires_verified_matching_republish_evidence(self):
        values = inputs(); ref = values[0]["sourceRef"]
        ref["assetUpdatedAt"] = "2026-10-15T15:30:00Z"
        ref["retrievedAt"] = "2026-10-15T15:45:00Z"
        with self.assertRaisesRegex(m.MatchupInputError, "evidence required"): build(values)
        ref["earliestObservationRef"] = {"sha256": ref["sha256"], "receiptSha256": "4" * 64,
            "metadataSha256": "5" * 64, "assetUpdatedAt": UPDATED, "retrievedAt": OBSERVED}
        result = build(values)
        schedule_ref = next(r for r in result["sources"] if r["source"] == "schedule")
        self.assertEqual(schedule_ref["knownAt"], OBSERVED)
        self.assertEqual(schedule_ref["earliestObservationRef"]["metadataSha256"], "5" * 64)
        ref["earliestObservationRef"]["sha256"] = "9" * 64
        with self.assertRaisesRegex(m.MatchupInputError, "raw hash mismatch"): build(values)

    def test_only_exact_reviewed_same_id_names_can_resolve_and_the_review_is_sealed(self):
        values = inputs(); schedule, audit, _, _ = values
        game_id = "2026_06_DEN_SEA"
        schedule["games"][0].update(id=game_id, sourceGameId=game_id, homeTeamId="SEA", awayTeamId="DEN")
        for rows in audit["records"].values():
            for row in rows:
                row["team"] = {"BUF": "SEA", "SEA": "DEN"}[row["team"]]
                if row["gsis_id"] == "00-0000001":
                    row["gsis_id"] = "00-0036994"
                    row["player_name" if "player_name" in row else "full_name"] = "Ernest Jones"
        audit["records"]["depth_charts"][0]["player_name"] = "Ernest Jones IV"
        seal(schedule, audit)
        with self.assertRaisesRegex(m.MatchupInputError, "review was after"): build(values, matchup_id=game_id)
        result = build(values, matchup_id=game_id, cutoff="2026-10-15T16:30:00Z")
        resolution = result["identityResolutions"][0]
        self.assertEqual(resolution["playerId"], "00-0036994")
        self.assertEqual(resolution["rosterName"], "Ernest Jones")
        self.assertEqual(resolution["sourceName"], "Ernest Jones IV")
        self.assertEqual(resolution["ruleVersion"], "gtl-reviewed-player-names-1")
        self.assertIn("seahawks.com", resolution["sourceUrls"][0])
        audit["records"]["depth_charts"][0]["player_name"] = "Ernest Jones III"; seal(schedule, audit)
        with self.assertRaisesRegex(m.MatchupInputError, "conflicting source names"):
            build(values, matchup_id=game_id, cutoff="2026-10-15T16:30:00Z")

    def test_cli_manifests_are_bounded_unique_finite_objects_and_code_hash_is_verified(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "manifest.json"
            for raw in (b'{}' + b' ' * m.MAX_MANIFEST_BYTES, b'{"id":1,"id":2}', b'{"x":NaN}', b'[]'):
                path.write_bytes(raw)
                with self.subTest(raw=raw[:20]), self.assertRaises(ValueError): m.read_manifest(path)
            path.write_text('{"id":"test"}')
            self.assertEqual(m.read_manifest(path), {"id": "test"})
            code = pathlib.Path(folder) / "reducer.mjs"; code.write_bytes(b"fixture")
            rules = {"implementationId": m.IMPLEMENTATION_ID, "implementationSha256": m.hashlib.sha256(b"fixture").hexdigest()}
            with patch.object(m, "IMPLEMENTATION_PATH", code):
                m.verify_implementation(rules)
                with self.assertRaisesRegex(m.MatchupInputError, "ID"):
                    m.verify_implementation({**rules, "implementationId": "unknown"})
                with self.assertRaisesRegex(m.MatchupInputError, "hash"):
                    m.verify_implementation({**rules, "implementationSha256": "0" * 64})

    def test_cli_verified_adapters_distinguish_absence_from_corruption(self):
        import replay_current_sources as adapter
        import replay_schedule as schedule
        with patch.object(schedule, "load_schedule", return_value=inputs()[0]), \
             patch.object(adapter, "load_snapshot", side_effect=adapter.NoEligibleSnapshotError("absent")), \
             patch.object(adapter, "get_public", side_effect=AssertionError("network forbidden")):
            _, audit = m.load_verified_inputs(CUTOFF)
            self.assertEqual(set(audit["report"]["sourceStatus"].values()), {"unavailable"})
        for error in (ValueError("corrupt"), FileNotFoundError("raw evidence missing")):
            with patch.object(schedule, "load_schedule", return_value=inputs()[0]), \
                 patch.object(adapter, "load_snapshot", side_effect=error), self.assertRaises(type(error)):
                m.load_verified_inputs(CUTOFF)

    def test_cli_writes_immutable_local_snapshot_and_prints_only_aggregate_summary(self):
        values = inputs(); result = build(values)
        with tempfile.TemporaryDirectory() as folder, patch.object(m, "DATA_DIR", pathlib.Path(folder)):
            path, digest = m.store_snapshot(result)
            self.assertEqual((path, digest), m.store_snapshot(result))
            self.assertEqual(path.parent, pathlib.Path(folder).resolve())
            self.assertEqual(digest, m.hashlib.sha256(path.read_bytes()).hexdigest())
            summary = json.dumps(m.aggregate_summary(result, path, digest))
            self.assertNotIn("Fixture Home", summary)
            self.assertNotIn("00-0000001", summary)
            with self.assertRaisesRegex(m.MatchupInputError, "hash"):
                m.store_snapshot({**result, "status": "ready"})
            path.write_text("different evidence")
            with self.assertRaisesRegex(ValueError, "overwrite"): m.store_snapshot(result)
            policy, rules = pathlib.Path(folder) / "policy.json", pathlib.Path(folder) / "rules.json"
            policy.write_text(json.dumps(values[3])); rules.write_text(json.dumps(values[2]))
            output = io.StringIO()
            with patch.object(m, "verify_implementation"), patch.object(m, "load_verified_inputs", return_value=values[:2]), \
                 patch.object(m, "store_snapshot", return_value=(path, digest)), redirect_stdout(output):
                m.main(["--matchup", GAME_ID, "--policy", str(policy), "--rule-edition", str(rules), "--as-of", CUTOFF])
            self.assertFalse(json.loads(output.getvalue())["generationAllowed"])
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                m.main(["--matchup", GAME_ID, "--policy", str(policy), "--rule-edition", str(rules), "--as-of", "2100-01-01T00:00:00Z"])


if __name__ == "__main__":
    unittest.main()
