#!/usr/bin/env python3
"""Validate saved Week 5 evidence, maintain its pointer, and serve a local viewer.

Uses only the Python standard library. Does not fetch odds or establish an
official benchmark. Historical snapshot files and predictions are read-only.
"""

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path.name}: expected a JSON object")
    return value


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Expected a timestamp string")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("A timezone is required on every timestamp")
    return result


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"Expected a finite number, got {value!r}")
    return value


def same(actual, expected, label):
    if not math.isclose(number(actual), expected, abs_tol=1e-8):
        raise ValueError(f"{label}: stored {actual}, calculated {expected}")


def home_spread(pick):
    away, home = pick["matchup"].split(" @ ")
    if pick["favorite"] not in (away, home) or number(pick["spread"]) > 0:
        raise ValueError(f"Invalid favorite/spread: {pick['matchup']}")
    return pick["spread"] if pick["favorite"] == home else -pick["spread"]


def load_repository(root=ROOT, now=None):
    """Reconcile every stored score with the saved picks; no live verification."""
    config = read_json(root / "config/snapshots.json")
    picks_bytes = (root / config["picks_file"]).read_bytes()
    picks_doc = json.loads(picks_bytes)
    if not isinstance(picks_doc, dict):
        raise ValueError("Expected a predictions object")
    scope = (config["season"], config["week"])
    if (picks_doc["season"], picks_doc["week"]) != scope:
        raise ValueError("Pick file does not match the configured season/week")
    picks = {}
    for pick in picks_doc["picks"]:
        if not isinstance(pick, dict):
            raise ValueError("Expected a prediction object")
        if pick["player"] == config["player"] and pick.get("eligible_for_scoring") is True:
            if pick["matchup"] in picks:
                raise ValueError("Duplicate eligible prediction")
            picks[pick["matchup"]] = home_spread(pick)
    if not picks:
        raise ValueError("No eligible predictions")
    blob = hashlib.sha1(f"blob {len(picks_bytes)}\0".encode() + picks_bytes).hexdigest()
    snapshots = []
    pattern = f"{scope[0]}-week-{scope[1]:02d}-*.json"
    for path in (root / "data/snapshots").glob(pattern):
        saved = read_json(path)
        if (saved["season"], saved["week"]) != scope:
            raise ValueError(f"Wrong season/week in {path.name}")
        if saved.get("official") is not False:
            raise ValueError("This viewer accepts provisional snapshots only")
        if saved.get("picks_sha", blob) != blob:
            raise ValueError(f"{path.name}: predictions differ from the recorded Git blob")
        if not saved.get("source") or urlsplit(saved.get("source_url", "")).scheme != "https":
            raise ValueError(f"{path.name}: missing source attribution")
        recorded_at = saved.get("snapshot_at", saved.get("source_published_at"))
        published_at = saved.get("source_page_updated_at", saved.get("source_published_at"))
        if not recorded_at or not published_at:
            raise ValueError(f"{path.name}: missing source/snapshot time")
        if timestamp(published_at) > timestamp(recorded_at):
            raise ValueError(f"{path.name}: source time is later than capture time")
        games = saved["games"]
        if not isinstance(games, list) or not all(isinstance(g, dict) for g in games):
            raise ValueError(f"{path.name}: expected a list of game objects")
        if len(games) != len(picks) or {g["matchup"] for g in games} != picks.keys():
            raise ValueError(f"{path.name}: missing, extra, or duplicate games")
        total = 0
        for game in games:
            matchup = game["matchup"]
            same(game["predicted_home_spread"], picks[matchup], f"{matchup} prediction")
            market = number(game["consensus_home_spread"])
            points = max(0, 10 - 2 * abs(picks[matchup] - market))
            same(game["points"], points, f"{matchup} points")
            if game.get("status", "available") != "available":
                raise ValueError(f"{matchup}: quote unavailable")
            if "source_quote_at" in game:
                if timestamp(game["source_quote_at"]) > timestamp(recorded_at):
                    raise ValueError(f"{matchup}: future quote at capture")
            total += points
        same(saved["total_points"], total, f"{path.name} total")
        same(saved["max_points"], 10 * len(picks), "Maximum points")
        same(saved.get("available_games", len(games)), len(games), "Available games")
        if saved.get("missing_games", []):
            raise ValueError(f"{path.name}: incomplete snapshot")
        snapshots.append({**saved, "file": path.name, "recorded_at": recorded_at,
                          "published_at": published_at,
                          "time_basis": "capture" if "snapshot_at" in saved else "source publication"})
    snapshots.sort(key=lambda s: timestamp(s["recorded_at"]))
    if not snapshots:
        raise ValueError("No saved snapshots")
    for index, current in enumerate(snapshots):
        if index == 0:
            if current.get("previous_snapshot"):
                raise ValueError("Missing predecessor snapshot")
            continue
        previous = snapshots[index - 1]
        if timestamp(previous["recorded_at"]) == timestamp(current["recorded_at"]):
            raise ValueError("Duplicate snapshot time")
        if current.get("previous_snapshot") != f"data/snapshots/{previous['file']}":
            raise ValueError(f"{current['file']}: broken snapshot history link")
        same(current["previous_total_points"], previous["total_points"], "Previous total")
        same(current["total_point_delta"], current["total_points"] - previous["total_points"], "Total change")
        old_games = {g["matchup"]: g for g in previous["games"]}
        for game in current["games"]:
            old = old_games[game["matchup"]]
            for field in ("points", "consensus_home_spread"):
                if f"previous_{field}" in game:
                    same(game[f"previous_{field}"], old[field], f"Previous {field}")
            same(game["point_delta"], game["points"] - old["points"], "Game score change")
            same(game["spread_delta"], game["consensus_home_spread"] - old["consensus_home_spread"], "Spread change")
    latest = snapshots[-1]
    clock = now or datetime.now(timezone.utc)
    if timestamp(latest["recorded_at"]) > clock:
        raise ValueError("Latest snapshot is dated in the future")
    age_hours = (clock - timestamp(latest["published_at"])).total_seconds() / 3600
    expected = {"snapshot": latest["file"], "updated_at": latest["recorded_at"]}
    pointer_path = root / "data/snapshots/latest.json"
    pointer = read_json(pointer_path) if pointer_path.exists() else None
    return {"config": config, "snapshots": snapshots, "latest": latest,
            "expected_pointer": expected, "pointer_current": pointer == expected,
            "page_quote_age_hours": round(age_hours, 2),
            "page_quote_stale": age_hours > config["stale_after_hours"],
            "checked_at": clock.isoformat()}


def sync_pointer(root=ROOT):
    data = load_repository(root)
    target = root / "data/snapshots/latest.json"
    if not data["pointer_current"]:
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(data["expected_pointer"], indent=2) + "\n")
        temporary.replace(target)
    return data["expected_pointer"]


def token_css(root):
    tokens = read_json(root / "design/tokens.json")
    values = {**{f"color-{k}": v for k, v in tokens["colors"].items()},
              **{f"font-{k}": v for k, v in tokens["fonts"].items()},
              **{f"radius-{k}": v for k, v in tokens["radius"].items()},
              **{f"print-{k}": v for k, v in tokens["print"].items()},
              "touch-target": tokens["touchTargetMin"]}
    return ":root{" + ";".join(f"--{k}:{v}" for k, v in values.items()) + "}"


def make_handler(root=ROOT):
    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, body, content_type):
            encoded = body.encode() if isinstance(body, str) else body
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'")
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            # Loopback binding plus Host/Origin checks prevent unintended remote access.
            port = self.server.server_port
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            origin = self.headers.get("Origin")
            if (self.headers.get("Host") not in hosts or
                    (origin and origin not in {f"http://{h}" for h in hosts}) or
                    self.headers.get("Sec-Fetch-Site") == "cross-site"):
                self.respond(403, "Local same-origin requests only", "text/plain")
                return
            path = urlsplit(self.path).path
            assets = {"/": "dashboard/index.html", "/index.html": "dashboard/index.html",
                      "/dashboard/": "dashboard/index.html", "/dashboard/index.html": "dashboard/index.html",
                      "/dashboard/app.js": "dashboard/app.js", "/dashboard/styles.css": "dashboard/styles.css"}
            try:
                if path == "/api/snapshots":
                    data = load_repository(root)
                    if not data["pointer_current"]:
                        raise ValueError("Latest pointer is out of date. Run: python3 scripts/snapshots.py sync")
                    self.respond(200, json.dumps(data), "application/json")
                elif path == "/dashboard/tokens.css":
                    self.respond(200, token_css(root), "text/css")
                elif path in assets:
                    target = root / assets[path]
                    mime = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}[target.suffix]
                    self.respond(200, target.read_bytes(), mime + "; charset=utf-8")
                else:
                    self.respond(404, "Not found", "text/plain")
            except (ValueError, KeyError, TypeError, OSError) as error:
                self.respond(503, json.dumps({"error": str(error)}), "application/json")

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "sync", "serve"))
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        if args.command == "sync":
            print(json.dumps(sync_pointer()))
        elif args.command == "check":
            data = load_repository()
            if not data["pointer_current"]:
                raise ValueError("Latest pointer is stale; run the sync command")
            print(f"PASS: {len(data['snapshots'])} snapshots, {len(data['latest']['games'])} games, "
                  f"{data['latest']['total_points']} / {data['latest']['max_points']}; historical arithmetic only")
        else:
            server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler())
            print(f"Local private viewer: http://127.0.0.1:{server.server_port}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
