"""Deterministic, dependency-free GTL margin/total research baseline.

No sportsbook inputs, player guesses, network credentials or production writes.
Raw public data and per-game research outputs stay under .local/model-data.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import itertools
import json
import math
import pathlib
import statistics
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / ".local" / "model-data"
VERSION = "gtl-score-baseline-0.1.0"
CONFIG = {"warmup_start": 1995, "train_start": 2000, "train_end": 2013,
          "calibration_start": 2014, "calibration_end": 2016,
          "test_start": 2017, "test_end": 2020,
          "ewma_alpha": 0.12, "offseason_retention": 0.7, "ridge_penalty": 10.0}
FEATURE_NAMES = ["home_advantage", "relative_prior_net_points", "prior_matchup_total",
                 "prior_league_total", "rest_difference", "rest_sum"]


def manifest():
    return json.loads((ROOT / "model" / "sources.json").read_text())


def source_record():
    return manifest()["sources"][0]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch_history(directory=DEFAULT_DATA):
    """Fetch only the pinned, approved public CSV; reject drift and HTML."""
    source = source_record()
    request = urllib.request.Request(source["url"], headers={"User-Agent": "GuessTheLine-research/0.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(source["bytes"] + 1)
    if len(data) != source["bytes"] or digest(data) != source["sha256"]:
        raise ValueError("Source bytes changed; review and repin the manifest before use.")
    read_games(data)  # Structure is checked before any write.
    directory = pathlib.Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "fivethirtyeight-nfl-games.csv"
    if path.exists() and path.read_bytes() != data:
        raise ValueError("Refusing to replace different local source evidence.")
    path.write_bytes(data)
    (directory / "source-receipt.json").write_text(json.dumps({
        "sourceId": source["id"], "url": source["url"], "sha256": digest(data),
        "bytes": len(data), "downloadedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "license": source["license"], "licenseUrl": source["licenseUrl"],
    }, indent=2) + "\n")
    return path


def read_games(data):
    """Whitelist fields; never accidentally learn from post-game Elo or odds."""
    text = data.decode("utf-8-sig")
    if text.lstrip().startswith("<"):
        raise ValueError("Expected CSV, received HTML.")
    reader = csv.DictReader(io.StringIO(text))
    needed = {"date", "season", "neutral", "team1", "team2", "score1", "score2"}
    if not needed.issubset(reader.fieldnames or []):
        raise ValueError("Missing required final-score fields.")
    games, seen = [], set()
    for row in reader:
        date = dt.date.fromisoformat(row["date"])
        season = int(row["season"])
        if date.year not in (season, season + 1):
            raise ValueError("Season/date mismatch.")
        home, away = row["team1"], row["team2"]
        if not home.isalnum() or not away.isalnum() or not home.isupper() or not away.isupper() or home == away:
            raise ValueError("Invalid team identity.")
        neutral = int(row["neutral"])
        home_score, away_score = int(row["score1"]), int(row["score2"])
        if neutral not in (0, 1) or min(home_score, away_score) < 0 or max(home_score, away_score) > 100:
            raise ValueError("Invalid completed score or neutral-site value.")
        identity = f"{date}:{away}:{home}"
        if identity in seen:
            raise ValueError("Duplicate game identity.")
        seen.add(identity)
        games.append({"id": identity, "date": date, "season": season, "home": home,
                      "away": away, "neutral": neutral, "home_score": home_score, "away_score": away_score})
    return sorted(games, key=lambda game: (game["date"], game["id"]))


def chronological_features(games):
    """Predict the entire date batch before updating with that date's outcomes.

    Source dates have no kickoff/finalization timestamps. Earlier-date scores
    are assumed available next day for this retrospective test; no claim of
    original publication-time or correction-history reconstruction is made.
    """
    teams, rows, league_points = {}, [], 22.0
    current_season = None
    for day, batch_iter in itertools.groupby(sorted(games, key=lambda g: (g["date"], g["id"])), key=lambda g: g["date"]):
        batch = list(batch_iter)
        seasons = {game["season"] for game in batch}
        if len(seasons) != 1:
            raise ValueError("One date cannot mix NFL seasons.")
        season = batch[0]["season"]
        if current_season is not None and season != current_season:
            for team in teams.values():
                team["for"] = league_points + CONFIG["offseason_retention"] * (team["for"] - league_points)
                team["against"] = league_points + CONFIG["offseason_retention"] * (team["against"] - league_points)
        current_season = season
        for game in batch:
            prior = {side: teams.get(game[side], {"for": league_points, "against": league_points, "last": None}) for side in ("home", "away")}
            home, away = prior["home"], prior["away"]
            rests = [min(21, max(0, (day - prior[side]["last"]).days)) if prior[side]["last"] else 7 for side in ("home", "away")]
            features = [1 - game["neutral"], ((home["for"] - home["against"]) - (away["for"] - away["against"])) / 2,
                        (home["for"] + home["against"] + away["for"] + away["against"]) / 2,
                        league_points * 2, rests[0] - rests[1], rests[0] + rests[1]]
            rows.append({**game, "x": features, "margin": game["home_score"] - game["away_score"],
                         "total": game["home_score"] + game["away_score"],
                         "latest_feature_result_date": max((team["last"] for team in prior.values() if team["last"]), default=None),
                         "rolling_margin": features[1] + 2.5 * features[0],
                         "rolling_total": features[2]})
        for game in batch:
            for side, other in (("home", "away"), ("away", "home")):
                old = teams.get(game[side], {"for": league_points, "against": league_points})
                alpha = CONFIG["ewma_alpha"]
                teams[game[side]] = {"for": (1-alpha)*old["for"] + alpha*game[f"{side}_score"],
                                     "against": (1-alpha)*old["against"] + alpha*game[f"{other}_score"], "last": day}
        # Apply one aggregate update for the date, so its row order cannot alter later features.
        mean_points = statistics.mean(game["home_score"] + game["away_score"] for game in batch) / 2
        league_points = .98 * league_points + .02 * mean_points
    return rows


def solve(matrix, target):
    augmented = [list(row) + [value] for row, value in zip(matrix, target)]
    n = len(target)
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(augmented[row][col]))
        augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
        scale = augmented[col][col]
        if abs(scale) < 1e-12:
            raise ValueError("Singular training matrix.")
        augmented[col] = [value / scale for value in augmented[col]]
        for row in range(n):
            if row != col:
                factor = augmented[row][col]
                augmented[row] = [a - factor*b for a, b in zip(augmented[row], augmented[col])]
    return [row[-1] for row in augmented]


def fit(rows, target):
    if len(rows) < 20:
        raise ValueError("Insufficient chronological training history.")
    means = [statistics.mean(row["x"][i] for row in rows) for i in range(len(FEATURE_NAMES))]
    scales = [statistics.pstdev(row["x"][i] for row in rows) or 1.0 for i in range(len(FEATURE_NAMES))]
    vectors = [[1.0] + [(x-m)/s for x, m, s in zip(row["x"], means, scales)] for row in rows]
    n = len(vectors[0])
    matrix = [[sum(x[i]*x[j] for x in vectors) + (CONFIG["ridge_penalty"] if i == j and i else 0)
               for j in range(n)] for i in range(n)]
    rhs = [sum(x[i]*row[target] for x, row in zip(vectors, rows)) for i in range(n)]
    return {"target": target, "means": means, "scales": scales, "coefficients": solve(matrix, rhs),
            "trainingLastDate": max(row["date"] for row in rows).isoformat()}


def predict(model, features):
    vector = [1.0] + [(x-m)/s for x, m, s in zip(features, model["means"], model["scales"])]
    return sum(a*b for a, b in zip(vector, model["coefficients"]))


def summary(actual, predicted):
    errors = [p-a for a, p in zip(actual, predicted)]
    return {"n": len(errors), "mae": statistics.mean(abs(e) for e in errors),
            "rmse": math.sqrt(statistics.mean(e*e for e in errors)), "biasPredictionMinusActual": statistics.mean(errors)}


def quantile(values, probability):
    values = sorted(values)
    position = (len(values)-1)*probability
    lo, hi = math.floor(position), math.ceil(position)
    return values[lo] + (position-lo)*(values[hi]-values[lo])


def readiness(games, target_date):
    before = [game for game in games if game["date"] < target_date]
    latest = max((game["date"] for game in before), default=None)
    reasons = []
    if latest is None or (target_date-latest).days > 21:
        reasons.append("Current completed-game coverage is missing or older than 21 days.")
    if not before or max(game["season"] for game in before) < target_date.year - (1 if target_date.month < 3 else 0):
        reasons.append("No completed outcomes from the target NFL season.")
    # Prototype has no production validation gate, even when a file is recent.
    reasons.append("Production model validation and market-specific calibrated probabilities are not approved.")
    return {"status": "blocked", "targetDate": target_date.isoformat(), "latestAvailableGameDate": latest.isoformat() if latest else None,
            "reasons": reasons, "homeSpread": None, "total": None, "coverProbability": None, "expectedValue": None}


def evaluate(data, target_date=dt.date(2026, 10, 8)):
    if digest(data) != source_record()["sha256"]:
        raise ValueError("Unpinned dataset: review its license, identity and completeness before evaluation.")
    all_games = read_games(data)
    games = [game for game in all_games if CONFIG["warmup_start"] <= game["season"] <= CONFIG["test_end"]]
    rows = chronological_features(games)
    train = [row for row in rows if CONFIG["train_start"] <= row["season"] <= CONFIG["train_end"]]
    calibration = [row for row in rows if CONFIG["calibration_start"] <= row["season"] <= CONFIG["calibration_end"]]
    heldout = [row for row in rows if CONFIG["test_start"] <= row["season"] <= CONFIG["test_end"]]
    models = {target: fit(train, target) for target in ("margin", "total")}
    outcomes = []
    for row in calibration + heldout:
        outcomes.append({"gameId": row["id"], "date": row["date"].isoformat(), "season": row["season"],
                         "split": "calibration" if row in calibration else "heldout",
                         "actualMargin": row["margin"], "actualTotal": row["total"],
                         "predictedHomeMargin": predict(models["margin"], row["x"]),
                         "predictedHomeSpread": -predict(models["margin"], row["x"]),
                         "predictedTotal": predict(models["total"], row["x"]),
                         "latestFeatureResultDate": row["latest_feature_result_date"].isoformat() if row["latest_feature_result_date"] else None})
    report = {"name": "Guess The Line score baseline", "version": VERSION, "status": "historical_research_only",
              "sourceId": source_record()["id"], "sourceSha256": digest(data), "config": CONFIG,
              "sourceCoverage": {"rows": len(all_games), "firstGame": all_games[0]["date"].isoformat(), "lastGame": all_games[-1]["date"].isoformat()},
              "splits": {"warmup": len(rows)-len(train)-len(calibration)-len(heldout), "train": len(train), "calibration": len(calibration), "heldout": len(heldout)},
              "features": FEATURE_NAMES, "markets": {}, "models": models, "currentReadiness": readiness(all_games, target_date),
              "limitations": ["No 2021-2026 outcome coverage in this source.", "No historical sportsbook line/price benchmark or betting-return validation.",
                              "Prior-date scores are assumed available the next day; source publication-time/revision vintages are unavailable.",
                              "No injuries, quarterback changes, weather, play efficiency or opponent adjustment.",
                              "Prediction intervals assess score error only, not cover/Over probabilities; no EV or staking output.",
                              "An outcome mean translated to a signed home spread is not yet a calibrated fair-price line."]}
    for target in ("margin", "total"):
        fitted = models[target]
        baseline = statistics.mean(row[target] for row in train)
        cal_errors = [row[target] - predict(fitted, row["x"]) for row in calibration]
        bounds = [quantile(cal_errors, .1), quantile(cal_errors, .9)]
        test_predictions = [predict(fitted, row["x"]) for row in heldout]
        target_report = {"calibration": summary([row[target] for row in calibration], [predict(fitted, row["x"]) for row in calibration]),
                         "heldout": summary([row[target] for row in heldout], test_predictions),
                         "trainingMeanBaseline": summary([row[target] for row in heldout], [baseline]*len(heldout)),
                         "rollingScoreBaseline": summary([row[target] for row in heldout], [row[f"rolling_{target}"] for row in heldout]),
                         "nominal80PercentInterval": {"calibrationResidualOffsets": bounds,
                             "heldoutCoverage": statistics.mean(bounds[0] <= row[target]-prediction <= bounds[1] for row, prediction in zip(heldout, test_predictions)),
                             "width": bounds[1]-bounds[0]}, "perSeason": {}, "meanPredictionReliability": []}
        for season in range(CONFIG["test_start"], CONFIG["test_end"]+1):
            subset = [row for row in heldout if row["season"] == season]
            target_report["perSeason"][str(season)] = summary([row[target] for row in subset], [predict(fitted, row["x"]) for row in subset])
        # Bins are chosen from calibration predictions only, never test outcomes.
        cal_predictions = [predict(fitted, row["x"]) for row in calibration]
        cuts = [quantile(cal_predictions, p) for p in (.2, .4, .6, .8)]
        for index in range(5):
            subset = [(row[target], prediction) for row, prediction in zip(heldout, test_predictions) if sum(prediction > cut for cut in cuts) == index]
            if subset:
                target_report["meanPredictionReliability"].append({"bin": index+1, "n": len(subset), "meanPredicted": statistics.mean(p for a, p in subset), "meanActual": statistics.mean(a for a, p in subset)})
        report["markets"][target] = target_report
    return report, outcomes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("fetch", "evaluate"))
    parser.add_argument("--directory", type=pathlib.Path, default=DEFAULT_DATA)
    parser.add_argument("--target-date", type=dt.date.fromisoformat, default=dt.date(2026, 10, 8))
    args = parser.parse_args()
    if args.command == "fetch":
        print(fetch_history(args.directory))
        return
    path = args.directory / "fivethirtyeight-nfl-games.csv"
    report, outcomes = evaluate(path.read_bytes(), args.target_date)
    args.directory.mkdir(parents=True, exist_ok=True)
    (args.directory / "validation-report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    (args.directory / "historical-predictions.json").write_text(json.dumps(outcomes, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"version": VERSION, "splits": report["splits"], "heldout": {market: values["heldout"] for market, values in report["markets"].items()}, "currentReadiness": report["currentReadiness"]}, indent=2))


if __name__ == "__main__":
    main()
