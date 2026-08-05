from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location("games_estate_runner", ROOT / "runner.py")
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


class GamesEstatePolicyTests(unittest.TestCase):
    def make_audit(self, root: pathlib.Path) -> object:
        site = root / "site"
        lessons = root / "lessons"
        site.mkdir(exist_ok=True)
        lessons.mkdir(exist_ok=True)
        return runner.PolicyAudit(root, site, lessons, root / "out", "origin/main")

    def test_retired_apex_tennis_contract_is_not_executed(self) -> None:
        commands = "\n".join(" ".join(command) for _, command in runner.base.ACTIVE_VALIDATORS)
        self.assertNotIn("verify_apexpool_sports_manifest.js", commands)
        self.assertNotIn("verify_apextennis_manifest.js", commands)
        self.assertIn("verify_sports_rail.js", commands)

    def test_tee_without_pipefail_is_reported_as_advisory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            workflow = root / ".github" / "workflows"
            workflow.mkdir(parents=True)
            (workflow / "unsafe.yml").write_text(
                "jobs:\n  test:\n    steps:\n      - run: node check.js | tee result.log\n",
                encoding="utf-8",
            )
            audit = self.make_audit(root)
            audit._check_workflow_pipeline_safety()
            self.assertEqual(len(audit.issues), 1)
            self.assertFalse(audit.issues[0].blocking)
            self.assertIn("pipefail", audit.issues[0].message)
            self.assertIn("later log-consistency", audit.issues[0].message)

    def test_pipefail_in_same_block_suppresses_warning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            workflow = root / ".github" / "workflows"
            workflow.mkdir(parents=True)
            (workflow / "safe.yml").write_text(
                "jobs:\n  test:\n    steps:\n      - run: |\n          set -euo pipefail\n          node check.js | tee result.log\n",
                encoding="utf-8",
            )
            audit = self.make_audit(root)
            audit._check_workflow_pipeline_safety()
            self.assertEqual(audit.issues, [])

    def test_release_marker_split_is_measured_across_both_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            games = []
            for index, (title, desc) in enumerate((
                ("NEW · First", "A description long enough to satisfy the advisory length threshold for this test entry."),
                ("Second", "NEW · Another description long enough to satisfy the advisory length threshold for this test entry."),
            )):
                games.append({
                    "icon": "🎮", "title": title, "desc": desc, "href": f"/game-{index}/",
                    "tag": "Test", "hue": f"#{index + 1:06x}", "featured": False,
                    "hero": index == 0, "art": f"/art-{index}.svg",
                })
            (root / "games.json").write_text(json.dumps({"games": games}), encoding="utf-8")
            audit._validate_manifest()
            self.assertEqual(audit.manifest_analysis["new_title_holders"], ["NEW · First"])
            self.assertEqual(audit.manifest_analysis["legacy_new_description_holders"], ["Second"])
            self.assertEqual(audit.manifest_analysis["new_marker_claim_count_across_fields"], 2)
            self.assertTrue(any("split across title and description" in issue.message for issue in audit.issues))

    def test_per_game_release_marker_ownership_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            tools = root / "tools"
            tools.mkdir()
            (tools / "verify_echovault_shelf.js").write_text(
                "pass(game.title.startsWith('NEW · '), 'new');\n", encoding="utf-8"
            )
            (tools / "verify_relicforge_shelf.js").write_text(
                "pass(game.title.startsWith('NEW · '), 'new');\n", encoding="utf-8"
            )
            (tools / "apply_apexrally_manifest.py").write_text(
                "# move the `NEW · ` prefix onto Apex Rally\n", encoding="utf-8"
            )
            audit._check_release_marker_gate_ownership()
            self.assertEqual(len(audit.issues), 2)
            self.assertTrue(any(issue.category == "validator" for issue in audit.issues))
            self.assertTrue(any(issue.category == "transform" for issue in audit.issues))

    def test_interaction_selector_requires_hit_testing_and_never_clicks_in_javascript(self) -> None:
        self.assertIn("elementFromPoint", runner.base.SAFE_INTERACTION_JS)
        self.assertIn("unobscured", runner.base.SAFE_INTERACTION_JS)
        self.assertNotIn("target.click()", runner.base.SAFE_INTERACTION_JS)
        self.assertIn("element:target", runner.base.SAFE_INTERACTION_JS)

    def test_intercepted_interaction_becomes_visible_advisory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            result = {
                "status": "pass", "mode": "desktop", "errors": [], "local_http_errors": [],
                "interaction": {"clicked": False, "label": "START", "reason": "ElementClickInterceptedException"},
            }
            audit._record_browser_issue(result, "Lessons", "/Lessons/Games/Test.html")
            self.assertEqual(len(audit.issues), 1)
            self.assertEqual(audit.issues[0].category, "browser-interaction")
            self.assertFalse(audit.issues[0].blocking)

    def test_no_generic_unobscured_control_is_not_a_defect(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            result = {
                "status": "pass", "mode": "desktop", "errors": [], "local_http_errors": [],
                "interaction": {"clicked": False, "reason": "no conservative unobscured start/play control"},
            }
            audit._record_browser_issue(result, "Website", "/game/")
            self.assertEqual(audit.issues, [])


if __name__ == "__main__":
    unittest.main()
