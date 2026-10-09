import importlib.util
import json
import shutil
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("snapshots", ROOT / "scripts/snapshots.py")
snapshots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshots)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ("data", "config", "design", "dashboard"):
            shutil.copytree(ROOT / directory, self.root / directory)
        self.latest = self.root / "data/snapshots/2026-week-05-20261008T150212589Z.json"
        self.pointer = self.root / "data/snapshots/latest.json"

    def mutate_latest(self, edit):
        data = json.loads(self.latest.read_text())
        edit(data)
        self.latest.write_text(json.dumps(data))

    def test_scores_history_and_signed_away_predictions(self):
        data = snapshots.load_repository(self.root)
        self.assertEqual([s["total_points"] for s in data["snapshots"]], [95.8, 95.8, 96.4])
        self.assertEqual(data["latest"]["total_point_delta"], .6)
        self.assertEqual(len(data["latest"]["games"]), 15)
        self.assertEqual(sum(g["point_delta"] != 0 for g in data["latest"]["games"]), 4)
        away_pick = next(g for g in data["latest"]["games"] if g["matchup"].startswith("Cleveland"))
        self.assertEqual(away_pick["predicted_home_spread"], 1.5)

    def test_sync_repairs_pointer_and_preserves_evidence(self):
        originals = {p: p.read_bytes() for p in (self.root / "data").rglob("*.json") if p != self.pointer}
        self.pointer.write_text('{"snapshot":"older.json"}')
        self.assertFalse(snapshots.load_repository(self.root)["pointer_current"])
        snapshots.sync_pointer(self.root)
        self.assertTrue(snapshots.load_repository(self.root)["pointer_current"])
        first_write = self.pointer.stat().st_mtime_ns
        snapshots.sync_pointer(self.root)
        self.assertEqual(self.pointer.stat().st_mtime_ns, first_write)
        for path, original in originals.items():
            self.assertEqual(path.read_bytes(), original)

    def test_wrong_score_or_delta_rejected(self):
        for field in ("total_points", "total_point_delta", "previous_total_points"):
            with self.subTest(field=field):
                original = self.latest.read_text()
                self.mutate_latest(lambda s: s.update({field: 123}))
                with self.assertRaises(ValueError):
                    snapshots.load_repository(self.root)
                self.latest.write_text(original)

    def test_prediction_changes_do_not_silently_rescore_history(self):
        path = self.root / "data/picks/2026-week-05.json"
        data = json.loads(path.read_text())
        data["picks"][0]["spread"] = -7.5
        path.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            snapshots.load_repository(self.root)

    def test_duplicate_missing_and_invalid_games_rejected(self):
        edits = [lambda s: s["games"].pop(),
                 lambda s: s["games"].__setitem__(0, s["games"][1]),
                 lambda s: s["games"][0].update(consensus_home_spread=None),
                 lambda s: s["games"][0].update(points=True),
                 lambda s: s["games"][0].update(point_delta=5),
                 lambda s: s.update(previous_snapshot="data/snapshots/missing.json")]
        for edit in edits:
            original = self.latest.read_text()
            self.mutate_latest(edit)
            with self.assertRaises(ValueError):
                snapshots.load_repository(self.root)
            self.latest.write_text(original)

    def test_source_timestamps_and_future_capture_rejected(self):
        self.mutate_latest(lambda s: s.update(source_page_updated_at="2026-10-09T14:03:00Z"))
        with self.assertRaises(ValueError):
            snapshots.load_repository(self.root)

    def test_old_quotes_remain_provisional_after_kickoff(self):
        data = snapshots.load_repository(self.root, now=datetime(2026, 10, 9, 1, tzinfo=timezone.utc))
        self.assertTrue(data["page_quote_stale"])
        self.assertFalse(data["latest"]["official"])
        fresh = snapshots.load_repository(self.root, now=datetime(2026, 10, 8, 16, tzinfo=timezone.utc))
        self.assertFalse(fresh["page_quote_stale"])

    def test_no_manufactured_official_benchmark(self):
        self.mutate_latest(lambda s: s.update(official=True))
        with self.assertRaises(ValueError):
            snapshots.load_repository(self.root)

    def test_http_serves_validated_data_and_denies_private_files(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), snapshots.make_handler(self.root))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        def request(path, headers=None):
            connection = HTTPConnection("127.0.0.1", server.server_port)
            try:
                connection.request("GET", path, headers=headers or {})
                response = connection.getresponse()
                return response.status, response.read(), dict(response.getheaders())
            finally:
                connection.close()

        status, body, headers = request("/api/snapshots")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["latest"]["total_points"], 96.4)
        self.assertEqual(headers["Cache-Control"], "no-store")
        for path in ("/", "/index.html", "/dashboard/", "/dashboard/index.html"):
            status, body, _ = request(path)
            self.assertEqual(status, 200)
            self.assertNotIn(b"-9.5", body)
            self.assertNotIn(b"Sean Balsiger", body)
        for path in ("/data/picks/2026-week-05.json", "/data/snapshots/latest.json", "/.git/config", "/../README.md"):
            self.assertEqual(request(path)[0], 404)
        for headers in ({"Host": "evil.example"}, {"Origin": "https://evil.example"}, {"Sec-Fetch-Site": "cross-site"}):
            self.assertEqual(request("/api/snapshots", headers)[0], 403)
        self.pointer.write_text("{}")
        status, body, _ = request("/api/snapshots")
        self.assertEqual(status, 503)
        self.assertNotIn(b"predicted_home_spread", body)


if __name__ == "__main__":
    unittest.main()
