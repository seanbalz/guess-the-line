import copy
import datetime as dt
import importlib.util
import pathlib
import unittest

SPEC = importlib.util.spec_from_file_location("gtl_pipeline", pathlib.Path(__file__).with_name("pipeline.py"))
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)


def game(day, home="AAA", away="BBB", home_score=20, away_score=17):
    date = dt.date.fromisoformat(day)
    return {"id": f"{date}:{away}:{home}", "date": date, "season": date.year,
            "home": home, "away": away, "neutral": 0, "home_score": home_score, "away_score": away_score}


class ModelIntegrityTests(unittest.TestCase):
    def test_current_and_future_results_cannot_change_pregame_features(self):
        games = [game("2010-09-01"), game("2010-09-08"), game("2010-09-15")]
        before = pipeline.chronological_features(games)
        altered = copy.deepcopy(games)
        altered[1]["home_score"] = 100
        altered[2]["away_score"] = 100
        after = pipeline.chronological_features(altered)
        self.assertEqual([row["x"] for row in before[:2]], [row["x"] for row in after[:2]])
        self.assertNotEqual(before[2]["x"], after[2]["x"])
        self.assertTrue(all(row["latest_feature_result_date"] is None or row["latest_feature_result_date"] < row["date"] for row in before))

    def test_same_day_batch_and_input_order_cannot_leak_results(self):
        games = [game("2010-09-01"), game("2010-09-01", "CCC", "DDD"), game("2010-09-08", "AAA", "CCC")]
        rows = pipeline.chronological_features(games)
        self.assertEqual(rows, pipeline.chronological_features(list(reversed(games))))
        altered = copy.deepcopy(games)
        altered[0]["home_score"] = 99
        self.assertEqual(rows[1]["x"], pipeline.chronological_features(altered)[1]["x"])

    def test_csv_whitelist_excludes_elo_probabilities_and_postgame_columns(self):
        prefix = "date,season,neutral,team1,team2,score1,score2,elo_prob1,elo1_post\n"
        data = (prefix + "2010-09-01,2010,0,AAA,BBB,20,17,0.99,9999\n").encode()
        result = pipeline.read_games(data)[0]
        self.assertNotIn("elo_prob1", result)
        self.assertNotIn("elo1_post", result)
        self.assertEqual(result["home_score"], 20)
        for invalid in [b"<!doctype html>", data + data.split(b"\n")[1] + b"\n", data.replace(b",20,17,", b",,17,")]:
            with self.assertRaises(ValueError):
                pipeline.read_games(invalid)

    def test_training_scaling_and_coefficients_use_training_rows_only(self):
        rows = pipeline.chronological_features([game(f"2010-09-{i:02}", home_score=i, away_score=30-i) for i in range(1, 29)])
        training = rows[:20]
        model = pipeline.fit(training, "margin")
        rows[25]["margin"] = 99999
        rows[25]["x"] = [99999]*len(pipeline.FEATURE_NAMES)
        self.assertEqual(model, pipeline.fit(training, "margin"))
        prediction = pipeline.predict(model, training[0]["x"])
        self.assertIsInstance(prediction, float)

    def test_stale_and_even_recent_unapproved_data_abstain(self):
        result = pipeline.readiness([game("2021-02-07")], dt.date(2026, 10, 8))
        self.assertEqual(result["status"], "blocked")
        self.assertGreaterEqual(len(result["reasons"]), 2)
        self.assertIsNone(result["homeSpread"])
        self.assertIsNone(result["total"])
        self.assertIsNone(result["coverProbability"])
        self.assertIsNone(result["expectedValue"])
        recent = pipeline.readiness([game("2026-10-04")], dt.date(2026, 10, 8))
        self.assertEqual(recent["status"], "blocked")

    def test_unreviewed_source_bytes_cannot_be_evaluated(self):
        with self.assertRaisesRegex(ValueError, "Unpinned"):
            pipeline.evaluate(b"date,season,score1,score2\n")

    def test_pinned_research_run_is_deterministic_and_split_safe(self):
        path = pipeline.DEFAULT_DATA / "fivethirtyeight-nfl-games.csv"
        if not path.exists():
            self.skipTest("Pinned public historical data not downloaded; run model/pipeline.py fetch.")
        data = path.read_bytes()
        report, outputs = pipeline.evaluate(data)
        self.assertEqual((report, outputs), pipeline.evaluate(data))
        self.assertEqual(report["splits"]["heldout"], 1070)
        self.assertEqual(report["sourceSha256"], pipeline.source_record()["sha256"])
        self.assertTrue(all(model["trainingLastDate"] < "2014-09-01" for model in report["models"].values()))
        self.assertTrue(all(row["latestFeatureResultDate"] < row["date"] for row in outputs))
        self.assertTrue(all(row["predictedHomeSpread"] == -row["predictedHomeMargin"] for row in outputs))
        self.assertTrue(all(2017 <= row["season"] <= 2020 for row in outputs if row["split"] == "heldout"))
        for market in report["markets"].values():
            self.assertGreater(market["heldout"]["mae"], 0)
            self.assertTrue(0 <= market["nominal80PercentInterval"]["heldoutCoverage"] <= 1)


if __name__ == "__main__":
    unittest.main()
