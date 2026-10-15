"""Check the scoped D-18 documentation against the current brand and state labels."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOKENS = json.loads((ROOT / "design/tokens.json").read_text())
GUIDE = (ROOT / "docs/BRAND_GUIDE.md").read_text()
PLAN = (ROOT / "planning/virtual-units-game.md").read_text()
DECISIONS = (ROOT / "docs/DECISIONS.md").read_text()
RULES = (ROOT / "docs/RULES.md").read_text()
README = (ROOT / "README.md").read_text()

assert TOKENS["name"].casefold() == "guess the line", "Unexpected brand token name"
assert "GUESS THE LINE" in GUIDE, "Brand guide is missing"
assert re.search(r"Owner: Sean Balsiger · Version [1-9]\d* ·", PLAN)
assert "play-money" in PLAN and "core play-money game and on-demand D-26 final-score settlement are deployed" in PLAN
assert "## Confirmed play rules" in PLAN and "## Confirmed remaining mechanics" in PLAN
assert "They are now confirmed product rules" in PLAN
assert "do not impose a quote-age cutoff" in PLAN.lower()
assert "source" in PLAN.lower() and "age" in PLAN.lower()
assert "D-18" in DECISIONS and "D-18" in RULES and "D-18" in README
assert "M-10 Bets read delivery card" in PLAN and "Brand QA assertion" in PLAN
assert "Virtual Units Bets read (M-10, staged)" in RULES
assert "![" not in PLAN, "Do not add unreviewed third-party marks to the task list"

for path in (ROOT / "README.md", ROOT / "docs/DECISIONS.md", ROOT / "docs/RULES.md", ROOT / "planning/virtual-units-game.md"):
    for destination in re.findall(r"\[[^]]+\]\(([^)]+)\)", path.read_text()):
        if "://" in destination or destination.startswith("#"):
            continue
        assert (path.parent / destination.split("#", 1)[0]).exists(), (
            f"Broken local link in {path.relative_to(ROOT)}: {destination}"
        )

print("Brand and D-18 document QA passed")
