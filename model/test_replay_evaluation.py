"""Hand-computable artificial forecasts only; no real outcomes or fitting."""
import copy
import hashlib
import itertools
import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import replay_evaluation as e

P1, P2, P3 = "00-0000001", "00-0000002", "00-0000003"
H = "a" * 64


def protocol_fixture():
    blobs = {role: f"artificial eligible {role}".encode() for role in e.ARTIFACT_ROLES}
    protocol = {
        "schemaVersion": e.VERSION, "id": "artificial-protocol",
        "declaredAt": "2026-10-15T12:00:00Z", "cutoff": "2026-10-15T13:00:00Z",
        "kickoff": "2026-10-16T00:15:00Z",
        "cohort": {"gameId": "2026_06_BUF_SEA", "season": 2026, "week": 6, "gameType": "REG"},
        "artifacts": {role: {"id": role, "version": "artificial-1", "sha256": hashlib.sha256(raw).hexdigest(),
                             "knownAt": "2026-10-15T11:00:00Z", "evaluationEligible": True,
                             "eligibilityReviewSha256": H} for role, raw in blobs.items()},
        "seed": "predeclared-seed", "sampleCount": 2,
        "metrics": dict(e.METRIC_DEFINITIONS), "intervalLevels": [.5, .8, .95],
        "baselines": [{"id": "artificial-league-baseline", "version": "example-1", "codeSha256": H,
                       "configSha256": H, "inputsSha256": H, "knownAt": "2026-10-15T11:00:00Z",
                       "seed": 1, "sampleCount": 2}],
        "playerIds": [P1, P2], "stats": ["rushingYards", "rushingTD"],
        "developmentOnly": copy.deepcopy(list(e.DEVELOPMENT_SCOPES)),
        "status": "research_only", "promotionAllowed": False, "publicationReady": False,
    }
    return protocol, blobs


class MetricTests(unittest.TestCase):
    def test_crps_hand_formula_and_single_point(self):
        # For [0,2] and y=1: E|X-y|=1, half E|X-X'|=.5.
        self.assertEqual(e.empirical_crps([0, 2], 1), .5)
        self.assertEqual(e.empirical_crps([0, 2], 0), .5)
        self.assertEqual(e.empirical_crps([0, 2], 3), 1.5)
        self.assertEqual(e.empirical_crps([5], 2), 3)
        self.assertEqual(e.empirical_crps([5, 5, 5], 5), 0)

    def test_crps_equals_explicit_pairwise_formula_on_adversarial_small_samples(self):
        for samples in itertools.product((-2, 0, 3), repeat=4):
            for truth in (-3, 0, 5):
                n = len(samples)
                expected = sum(abs(x - truth) for x in samples) / n - sum(
                    abs(x - y) for x in samples for y in samples) / (2 * n * n)
                self.assertAlmostEqual(e.empirical_crps(samples, truth), expected)

    def test_crps_permutation_replication_translation_scaling(self):
        samples = [-4, -1, 5, 5]
        reference = e.empirical_crps(samples, 3)
        self.assertEqual(e.empirical_crps(list(reversed(samples)), 3), reference)
        self.assertAlmostEqual(e.empirical_crps(samples * 2, 3), reference)
        self.assertAlmostEqual(e.empirical_crps([v + 10 for v in samples], 13), reference)
        self.assertAlmostEqual(e.empirical_crps([v * 3 for v in samples], 9), reference * 3)

    def test_nonfinite_empty_bool_strings_and_missing_truth_rejected(self):
        for samples in ([], (), [math.nan], [math.inf], [-math.inf], [True], ["2"], None, iter([1])):
            for function in (lambda: e.empirical_crps(samples, 0), lambda: e.empirical_quantile(samples, .5)):
                with self.subTest(samples=repr(samples)), self.assertRaises(e.EvaluationError):
                    function()
        for truth in (None, True, "0", math.nan, math.inf, 10 ** 1000):
            with self.subTest(truth=repr(truth)), self.assertRaises(e.EvaluationError):
                e.empirical_crps([0], truth)
        with self.assertRaises(e.EvaluationError):
            e.empirical_crps([-1e308, 1e308], 1e308)

    def test_binary_brier_requires_boolean_not_half_outcome(self):
        self.assertAlmostEqual(e.binary_brier(.25, True), .5625)
        self.assertAlmostEqual(e.binary_brier(.25, False), .0625)
        for probability in (-.1, 1.1, math.nan, math.inf, True, "0.5"):
            with self.assertRaises(e.EvaluationError):
                e.binary_brier(probability, True)
        for outcome in (0, 1, .5, None, "win"):
            with self.assertRaises(e.EvaluationError):
                e.binary_brier(.5, outcome)

    def test_type7_quantiles_and_interval_edges_by_hand(self):
        self.assertEqual(e.empirical_quantile([30, 0, 20, 10], .25), 7.5)
        self.assertEqual(e.empirical_quantile([30, 0, 20, 10], .5), 15)
        self.assertEqual(e.empirical_quantile([30, 0, 20, 10], 0), 0)
        self.assertEqual(e.empirical_quantile([30, 0, 20, 10], 1), 30)
        self.assertEqual(e.central_interval([0, 10, 20, 30], .5, 7.5),
                         {"level": .5, "lower": 7.5, "upper": 22.5, "width": 15, "covered": True})
        self.assertTrue(e.central_interval([0, 10, 20, 30], .5, 22.5)["covered"])
        self.assertFalse(e.central_interval([0, 10, 20, 30], .5, 23)["covered"])
        self.assertIsNone(e.central_interval([0, 10], .5)["covered"])
        self.assertEqual(e.central_interval([4, 4], .95, 4)["width"], 0)
        for level in (0, 1, -.1, math.nan):
            with self.assertRaises(e.EvaluationError):
                e.central_interval([1], level, 1)
        for q in (-.1, 1.1, None):
            with self.assertRaises(e.EvaluationError):
                e.empirical_quantile([1], q)

    def test_paired_scores_preserve_joint_margin_and_total_distribution(self):
        # Marginals alone are identical but dependence produces different totals.
        positive = [{"home": 0, "away": 0}, {"home": 10, "away": 10}]
        negative = [{"home": 0, "away": 10}, {"home": 10, "away": 0}]
        kwargs = {"tie_policy": e.TIE_POLICY, "interval_levels": [.5]}
        first = e.paired_game_metrics(positive, {"home": 5, "away": 5}, **kwargs)
        second = e.paired_game_metrics(negative, {"home": 5, "away": 5}, **kwargs)
        self.assertEqual(first["distributions"]["homeScore"], second["distributions"]["homeScore"])
        self.assertEqual(first["distributions"]["awayScore"], second["distributions"]["awayScore"])
        self.assertEqual(first["distributions"]["total"]["crps"], 5)
        self.assertEqual(second["distributions"]["total"]["crps"], 0)
        self.assertEqual(first["distributions"]["margin"]["crps"], 0)
        self.assertEqual(second["distributions"]["margin"]["crps"], 5)

    def test_ties_are_retained_as_three_explicit_binary_events(self):
        draws = [{"home": 7, "away": 7}, {"home": 14, "away": 7}, {"home": 7, "away": 14}]
        result = e.paired_game_metrics(draws, {"home": 10, "away": 10},
                                       tie_policy=e.TIE_POLICY, interval_levels=[.8])
        self.assertEqual(result["pairedDrawCount"], 3)
        for name in ("homeWin", "awayWin"):
            self.assertEqual(result["events"][name]["probability"], 1 / 3)
            self.assertIs(result["events"][name]["outcome"], False)
            self.assertAlmostEqual(result["events"][name]["brier"], 1 / 9)
        self.assertIs(result["events"]["tie"]["outcome"], True)
        self.assertAlmostEqual(result["events"]["tie"]["brier"], 4 / 9)
        self.assertIs(result["promotionAllowed"], False)
        for policy in (None, "half_win", "drop_ties"):
            with self.assertRaises(e.EvaluationError):
                e.paired_game_metrics(draws, None, tie_policy=policy, interval_levels=[.8])

    def test_missing_game_truth_does_not_create_a_zero_score_or_brier(self):
        result = e.paired_game_metrics([{"home": 7, "away": 0}], None,
                                       tie_policy=e.TIE_POLICY, interval_levels=[.8])
        self.assertIsNone(result["distributions"]["homeScore"]["crps"])
        self.assertIsNone(result["events"]["homeWin"]["brier"])
        self.assertIsNone(result["events"]["homeWin"]["outcome"])
        self.assertIsNone(result["distributions"]["total"]["intervals"][0]["covered"])
        self.assertEqual(result["distributions"]["total"]["median"], 7)

    def test_invalid_pairs_and_levels_are_rejected(self):
        for pair in ({"home": 7}, {"home": 7, "away": -1}, {"home": 7.0, "away": 0},
                     {"home": True, "away": 0}, {"home": 7, "away": 0, "id": 1}):
            with self.assertRaises(e.EvaluationError):
                e.paired_game_metrics([pair], None, tie_policy=e.TIE_POLICY, interval_levels=[.8])
        for levels in ([], [.8, .8], [0], [1]):
            with self.assertRaises(e.EvaluationError):
                e.paired_game_metrics([{"home": 7, "away": 0}], None,
                                      tie_policy=e.TIE_POLICY, interval_levels=levels)


class PlayerMetricTests(unittest.TestCase):
    def fixtures(self):
        draws = [{P1: {"rushingYards": 0, "rushingTD": 0}, P2: {"rushingYards": 10, "rushingTD": 1},
                  P3: {"rushingYards": 0, "rushingTD": 0}},
                 {P1: {"rushingYards": 0, "rushingTD": 0}, P2: {"rushingYards": 20, "rushingTD": 0},
                  P3: {"rushingYards": 0, "rushingTD": 0}}]
        kwargs = {"player_ids": [P1, P2, P3], "stats": ["rushingYards", "rushingTD"], "interval_levels": [.8]}
        return draws, kwargs

    def test_frozen_denominator_keeps_nonparticipants_and_missing_players(self):
        draws, kwargs = self.fixtures()
        truth = {P1: {"status": "verified_nonparticipation", "evidenceSha256": H},
                 P2: {"status": "verified_box_score", "evidenceSha256": H,
                      "stats": {"rushingYards": 0, "rushingTD": 0}}}
        result = e.player_metrics(draws, truth, **kwargs)
        self.assertEqual(result["playerDenominator"], 3)
        self.assertEqual(set(result["players"]), {P1, P2, P3})
        self.assertEqual(result["verifiedNonparticipantsSupplied"], 1)
        self.assertEqual(result["availableOutcomesByStat"], {"rushingYards": 2, "rushingTD": 2})
        self.assertEqual(result["unavailableOutcomesByStat"], {"rushingYards": 1, "rushingTD": 1})
        self.assertEqual(result["players"][P1]["metrics"]["rushingYards"]["crps"], 0)
        self.assertEqual(result["players"][P2]["metrics"]["rushingYards"]["crps"], 12.5)
        self.assertEqual(result["players"][P2]["metrics"]["rushingTD"]["touchdownEvent"]["brier"], .25)
        self.assertIsNone(result["players"][P3]["metrics"]["rushingYards"]["crps"])
        self.assertIsNone(result["players"][P3]["metrics"]["rushingTD"]["touchdownEvent"]["brier"])

    def test_predicted_zero_player_is_evaluated_even_if_actual_participant(self):
        draws, kwargs = self.fixtures()
        truth = {P1: {"status": "verified_box_score", "evidenceSha256": H,
                      "stats": {"rushingYards": 30, "rushingTD": 1}}}
        result = e.player_metrics(draws, truth, **kwargs)
        self.assertEqual(result["players"][P1]["metrics"]["rushingYards"]["crps"], 30)
        self.assertEqual(result["players"][P1]["metrics"]["rushingTD"]["touchdownEvent"]["brier"], 1)
        self.assertEqual(result["playerDenominator"], 3)

    def test_partial_box_score_preserves_per_stat_unknown(self):
        draws, kwargs = self.fixtures()
        result = e.player_metrics(draws, {P2: {"status": "verified_box_score", "evidenceSha256": H,
                                               "stats": {"rushingYards": None, "rushingTD": 0}}}, **kwargs)
        self.assertEqual(result["availableOutcomesByStat"], {"rushingYards": 0, "rushingTD": 1})
        self.assertIsNone(result["players"][P2]["metrics"]["rushingYards"]["outcome"])
        unavailable = e.player_metrics(draws, {P1: {"status": "unavailable", "reason": "No box score"}}, **kwargs)
        self.assertEqual(unavailable["unavailableOutcomesByStat"]["rushingTD"], 3)

    def test_no_implicit_missing_players_stats_or_nonparticipation(self):
        draws, kwargs = self.fixtures()
        for bad in ({P1: {"status": "verified_nonparticipation"}},
                    {P1: {"status": "absent_from_box_score"}},
                    {P1: {"status": "verified_box_score", "evidenceSha256": H, "stats": {"rushingYards": 0}}},
                    {"00-0000099": None}):
            with self.assertRaises(e.EvaluationError):
                e.player_metrics(draws, bad, **kwargs)
        missing = copy.deepcopy(draws)
        del missing[0][P3]
        with self.assertRaises(e.EvaluationError):
            e.player_metrics(missing, {}, **kwargs)
        del draws[0][P2]["rushingTD"]
        with self.assertRaises(e.EvaluationError):
            e.player_metrics(draws, {}, **kwargs)

    def test_negative_yards_are_valid_but_negative_counts_are_not(self):
        kwargs = {"player_ids": [P1], "stats": ["rushingYards", "receptions"], "interval_levels": [.5]}
        draws = [{P1: {"rushingYards": -2, "receptions": 0}}]
        result = e.player_metrics(draws, {}, **kwargs)
        self.assertEqual(result["players"][P1]["metrics"]["rushingYards"]["median"], -2)
        for value in (-1, True, 0.5, math.inf):
            draws[0][P1]["receptions"] = value
            with self.assertRaises(e.EvaluationError):
                e.player_metrics(draws, {}, **kwargs)

    def test_inputs_are_not_mutated(self):
        draws, kwargs = self.fixtures()
        before = copy.deepcopy((draws, kwargs))
        e.player_metrics(draws, {}, **kwargs)
        self.assertEqual((draws, kwargs), before)


class ProtocolTests(unittest.TestCase):
    def test_exact_bytes_and_protocol_pins_are_checked_without_claiming_evaluation(self):
        protocol, blobs = protocol_fixture()
        before = copy.deepcopy(protocol)
        result = e.validate_protocol(protocol, blobs)
        self.assertEqual(protocol, before)
        self.assertEqual(result["protocolSha256"], e.canonical_sha(protocol))
        self.assertIs(result["forecastEvaluated"], False)
        self.assertIs(result["promotionAllowed"], False)
        self.assertIs(result["publicationReady"], False)
        self.assertIs(result["declarationValidated"], True)
        self.assertIs(result["artifactByteIntegrityValidated"], True)
        self.assertIn("artifact_contents_not_decoded_to_verify_cohort", result["limitations"])
        self.assertIn("baseline_bytes_not_verified", result["limitations"])
        self.assertIn("eligibility_reviews_referenced_not_executed", result["limitations"])
        self.assertIn("forecast_draws_and_outcome_sources_not_verified", result["limitations"])
        changed = copy.deepcopy(protocol)
        changed["seed"] = "different-predeclared-seed"
        self.assertNotEqual(e.validate_protocol(changed, blobs)["protocolSha256"], result["protocolSha256"])

    def test_inspected_history_is_never_an_untouched_holdout(self):
        for season, week in ((2022, 18), (2023, 1), (2024, 18), (2025, 1), (2026, 5)):
            self.assertEqual(e.cohort_classification(season, week), "development_only_already_inspected")
            protocol, blobs = protocol_fixture()
            protocol["cohort"].update(season=season, week=week, gameId=f"{season}_{week:02d}_BUF_SEA")
            with self.assertRaisesRegex(e.EvaluationError, "development only"):
                e.validate_protocol(protocol, blobs)
        self.assertIn("requires_frozen_evidence", e.cohort_classification(2026, 6))
        protocol, blobs = protocol_fixture()
        protocol["developmentOnly"] = []
        with self.assertRaises(e.EvaluationError):
            e.validate_protocol(protocol, blobs)

    def test_ineligible_research_versions_cannot_be_certified(self):
        for role in e.ARTIFACT_ROLES:
            protocol, blobs = protocol_fixture()
            protocol["artifacts"][role]["evaluationEligible"] = False
            with self.assertRaisesRegex(e.EvaluationError, "evaluation eligibility"):
                e.validate_protocol(protocol, blobs)
        protocol, blobs = protocol_fixture()
        protocol["artifacts"]["engine"]["eligibilityReviewSha256"] = None
        with self.assertRaises(e.EvaluationError):
            e.validate_protocol(protocol, blobs)

    def test_changed_artifact_bytes_versions_or_missing_hash_fail(self):
        for role in e.ARTIFACT_ROLES:
            protocol, blobs = protocol_fixture()
            blobs[role] += b" changed"
            with self.assertRaisesRegex(e.EvaluationError, "hash mismatch"):
                e.validate_protocol(protocol, blobs)
        for field, value in (("version", ""), ("sha256", None), ("knownAt", "2026-10-15T14:00:00Z")):
            protocol, blobs = protocol_fixture()
            protocol["artifacts"]["model"][field] = value
            with self.assertRaises(e.EvaluationError):
                e.validate_protocol(protocol, blobs)

    def test_late_protocol_cutoff_naive_time_and_identity_fail(self):
        for key, value in (("declaredAt", "2026-10-15T14:00:00Z"),
                           ("cutoff", "2026-10-16T00:15:00Z"), ("kickoff", "2026-10-16T00:15:00")):
            protocol, blobs = protocol_fixture()
            protocol[key] = value
            with self.assertRaises(e.EvaluationError):
                e.validate_protocol(protocol, blobs)
        for key, value in (("gameType", "POST"), ("week", 7), ("season", True)):
            protocol, blobs = protocol_fixture()
            protocol["cohort"][key] = value
            with self.assertRaises(e.EvaluationError):
                e.validate_protocol(protocol, blobs)

    def test_baselines_metrics_thresholds_and_promotion_are_not_implicit(self):
        for key, value in (("baselines", []), ("metrics", {"crps": "fair_estimator"}),
                           ("promotionAllowed", True), ("publicationReady", True), ("status", "validated"),
                           ("sampleCount", True), ("seed", None), ("playerIds", [P1, P1])):
            protocol, blobs = protocol_fixture()
            protocol[key] = value
            with self.assertRaises(e.EvaluationError):
                e.validate_protocol(protocol, blobs)
        protocol, blobs = protocol_fixture()
        protocol["passThreshold"] = 1
        with self.assertRaises(e.EvaluationError):
            e.validate_protocol(protocol, blobs)
        protocol, blobs = protocol_fixture()
        protocol["baselines"].append(copy.deepcopy(protocol["baselines"][0]))
        with self.assertRaises(e.EvaluationError):
            e.validate_protocol(protocol, blobs)

    def test_canonical_distinct_teams_and_july_season_window_are_required(self):
        for teams in ("SEA_SEA", "AAA_SEA", "LA_SEA", "JAC_SEA", "SEA_BBB"):
            protocol, blobs = protocol_fixture()
            protocol["cohort"]["gameId"] = f"2026_06_{teams}"
            with self.assertRaisesRegex(e.EvaluationError, "canonical NFL teams"):
                e.validate_protocol(protocol, blobs)
        for kickoff in ("2026-06-30T23:59:59Z", "2027-07-01T00:00:00Z"):
            protocol, blobs = protocol_fixture()
            protocol["kickoff"] = kickoff
            protocol["declaredAt"] = "2026-01-01T00:00:00Z"
            protocol["cutoff"] = "2026-01-02T00:00:00Z"
            with self.assertRaisesRegex(e.EvaluationError, "July-to-July"):
                e.validate_protocol(protocol, blobs)

    def test_exact_pinned_artifacts_must_be_known_when_protocol_is_declared(self):
        for role in e.ARTIFACT_ROLES:
            protocol, blobs = protocol_fixture()
            protocol["artifacts"][role]["knownAt"] = "2026-10-15T12:30:00Z"
            with self.subTest(role=role), self.assertRaisesRegex(e.EvaluationError, "protocol declaration"):
                e.validate_protocol(protocol, blobs)
        protocol, blobs = protocol_fixture()
        protocol["baselines"][0]["knownAt"] = "2026-10-15T12:30:00Z"
        with self.assertRaisesRegex(e.EvaluationError, "protocol declaration"):
            e.validate_protocol(protocol, blobs)
        protocol, blobs = protocol_fixture()
        for ref in protocol["artifacts"].values():
            ref["knownAt"] = protocol["declaredAt"]
        protocol["baselines"][0]["knownAt"] = protocol["declaredAt"]
        result = e.validate_protocol(protocol, blobs)
        self.assertIn("predeclaration_time_supplied_not_independently_attested", result["limitations"])
        self.assertIs(result["forecastEvaluated"], False)

if __name__ == "__main__":
    unittest.main()
