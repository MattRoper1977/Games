from __future__ import annotations

import importlib.util
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
    def test_retired_apex_tennis_contract_is_not_executed(self) -> None:
        commands = "\n".join(" ".join(command) for _, command in runner.base.ACTIVE_VALIDATORS)
        self.assertNotIn("verify_apexpool_sports_manifest.js", commands)
        self.assertNotIn("verify_apextennis_manifest.js", commands)
        self.assertIn("verify_sports_rail.js", commands)

    def test_tee_without_pipefail_is_reported_as_advisory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            site = root / "site"
            lessons = root / "lessons"
            workflow = root / ".github" / "workflows"
            site.mkdir()
            lessons.mkdir()
            workflow.mkdir(parents=True)
            (workflow / "unsafe.yml").write_text(
                "jobs:\n  test:\n    steps:\n      - run: node check.js | tee result.log\n",
                encoding="utf-8",
            )
            audit = runner.PolicyAudit(root, site, lessons, root / "out", "origin/main")
            audit._check_workflow_pipeline_safety()
            self.assertEqual(len(audit.issues), 1)
            self.assertFalse(audit.issues[0].blocking)
            self.assertIn("pipefail", audit.issues[0].message)

    def test_pipefail_in_same_block_suppresses_warning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            site = root / "site"
            lessons = root / "lessons"
            workflow = root / ".github" / "workflows"
            site.mkdir()
            lessons.mkdir()
            workflow.mkdir(parents=True)
            (workflow / "safe.yml").write_text(
                "jobs:\n  test:\n    steps:\n      - run: |\n          set -euo pipefail\n          node check.js | tee result.log\n",
                encoding="utf-8",
            )
            audit = runner.PolicyAudit(root, site, lessons, root / "out", "origin/main")
            audit._check_workflow_pipeline_safety()
            self.assertEqual(audit.issues, [])


if __name__ == "__main__":
    unittest.main()
