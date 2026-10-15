"""Research-fixture tests: these deliberately do not publish NFL projections."""
import copy
import importlib.util
import pathlib
import unittest

SPEC = importlib.util.spec_from_file_location("replay_model", pathlib.Path(__file__).with_name("replay_model.py"))
model = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(model)


def row(index, season=2023, **extra):
    run = index % 2 == 0
    return {"game_id": f"{season}_01_AAA_BBB", "play_id": index+1,
            "date": f"{season}-09-10", "season": season, "season_type": "REG",
            "qtr": 1, "down": 1 if run else 3, "ydstogo": 2 if run else 9,
            "yardline_100": 50, "play_type": "run" if run else "pass",
            "yards_gained": 4 if run else 12, "complete_pass": 0 if run else 1,
            "interception": 0, "fumble_lost": 0, "touchdown": 0, "sack": 0,
            "penalty": 0, **extra}


class ReplayResearchTests(unittest.TestCase):
    def setUp(self):
        self.rows = [row(i) for i in range(240)]
        self.subject = model.NextPlayModel(self.rows, "2024-07-01")

    def test_same_day_future_and_final_score_values_cannot_leak_into_fit(self):
        future = [row(i, 2024, date="2024-07-01", yards_gained=95) for i in range(200)]
        altered = copy.deepcopy(self.rows)
        for r in altered:
            r.update(home_score=99, away_score=1, vegas_wp=1, spread_line=-100, receiver_player_id="SECRET")
        refit = model.NextPlayModel(altered + future, "2024-07-01")
        self.assertEqual(self.subject.predict(row(0)), refit.predict(row(0)))
        self.assertEqual(refit.excluded["at_or_after_cutoff"], 200)
        self.assertNotIn("SECRET", str(refit.global_pool))

    def test_seed_repeats_and_input_order_is_irrelevant(self):
        reverse = model.NextPlayModel(list(reversed(self.rows)), "2024-07-01")
        expected = self.subject.sample_observation(row(0), seed="research:1")
        self.assertEqual(expected, reverse.sample_observation(row(0), seed="research:1"))
        self.assertEqual(expected, self.subject.sample_observation(row(0), seed="research:1"))
        self.assertEqual(expected["status"], "research_only")
        with self.assertRaises(ValueError):
            self.subject.sample_observation(row(0), seed="")

    def test_conditional_distribution_shrinks_and_sparse_state_explicitly_falls_back(self):
        p = self.subject.predict(row(0))
        self.assertAlmostEqual(sum(p["probabilities"].values()), 1)
        self.assertGreater(p["probabilities"]["run"], .5)
        self.assertGreater(p["probabilities"]["complete"], 0)
        self.assertFalse(p["fallback"])
        sparse = self.subject.predict(row(0, down=4, ydstogo=20, yardline_100=5))
        self.assertTrue(sparse["fallback"])
        self.assertEqual(sparse["stateSupport"], 0)
        self.assertEqual(sparse["probabilities"], self.subject.prior)
        sample = self.subject.sample_observation(row(0, down=4, ydstogo=20, yardline_100=5), seed="sparse")
        self.assertTrue(sample["fallback"])
        self.assertEqual(sample["stateSupport"], 0)
        self.assertEqual(sample["samplePool"], "training_prior")
        self.assertEqual(sample["requestedState"], (4, "long", "redzone"))

    def test_compound_turnover_scores_stay_unresolved_not_offensive_touchdowns(self):
        observed, reason = model.observation(row(1, complete_pass=0, interception=1, fumble_lost=1, touchdown=1))
        self.assertIsNone(reason)
        self.assertEqual(observed["kind"], "fumble")
        self.assertTrue(observed["outcomeFlags"]["interception"])
        self.assertTrue(observed["outcomeFlags"]["fumbleLost"])
        self.assertTrue(observed["outcomeFlags"]["touchdownObserved"])
        self.assertTrue(observed["requiresFullPlayResolution"])
        self.assertIsNone(observed["scoringSide"])
        sample = self.subject.sample_observation(row(0), seed="copy")
        sample["outcomeFlags"]["fumbleLost"] = True
        self.assertFalse(self.subject.sample_observation(row(0), seed="copy")["outcomeFlags"]["fumbleLost"])

    def test_invalid_states_duplicates_missing_labels_and_penalties_are_not_filled(self):
        for patch in ({"down": 0}, {"ydstogo": float("nan")}, {"yardline_100": 101}):
            with self.assertRaises(ValueError):
                self.subject.predict({**row(0), **patch})
        for patch, reason in (({"sack": None}, "missing_sack_flag"),
                              ({"penalty": 1}, "penalty_play"),
                              ({"interception": None}, "missing_outcome_flags")):
            self.assertEqual(model.observation({**row(0), **patch}), (None, reason))
        with self.assertRaises(ValueError):
            model.NextPlayModel(self.rows + [self.rows[0]], "2024-07-01")
        with self.assertRaises(ValueError):
            model.NextPlayModel(self.rows[:10], "2024-07-01")
        with self.assertRaises(ValueError):
            model.observation(row(1, complete_pass=1, interception=1))

    def test_evaluation_never_updates_fit_from_calibration_or_holdout(self):
        samples = self.rows + [row(i, 2024) for i in range(8)] + [row(i, 2025) for i in range(8)]
        report = model.evaluate(samples)
        altered = copy.deepcopy(samples)
        for r in altered:
            if r["season"] == 2024:
                r["yards_gained"] = 80
        changed = model.evaluate(altered)
        self.assertEqual(report["reports"]["heldout"], changed["reports"]["heldout"])
        self.assertNotEqual(report["reports"]["calibration"], changed["reports"]["calibration"])
        self.assertLess(report["reports"]["heldout"]["brier"], report["reports"]["heldout"]["baselineBrier"])
        self.assertEqual(report["reports"]["heldout"]["games"], 1)

    def test_missing_holdout_returns_null_and_never_enables_publication(self):
        report = model.evaluate(self.rows)
        self.assertIsNone(report["reports"]["heldout"]["brier"])
        self.assertEqual(report["publication"]["status"], "blocked")
        self.assertIsNone(report["publication"]["replay"])
        self.assertEqual(model.evaluate(self.rows + [row(i, 2025) for i in range(10)])["publication"], report["publication"])


if __name__ == "__main__":
    unittest.main()
