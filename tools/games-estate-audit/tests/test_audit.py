from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "audit.py"
SPEC = importlib.util.spec_from_file_location("games_estate_audit", SCRIPT)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class GamesEstateAuditTests(unittest.TestCase):
    def make_audit(self, root: pathlib.Path) -> object:
        site = root / "site"
        lessons = root / "lessons"
        site.mkdir()
        lessons.mkdir()
        return module.Audit(root, site, lessons, root / "out", "origin/main")

    def test_site_href_normalisation(self) -> None:
        self.assertEqual(module.Audit._normalise_site_href("apexkick/"), "/apexkick/")
        self.assertEqual(module.Audit._normalise_site_href("/Lessons/Games/Test.html"), "/Lessons/Games/Test.html")
        self.assertEqual(module.Audit._normalise_site_href(""), "/")

    def test_href_resolution_keeps_repository_ownership(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            owner, target = audit._resolve_href("/Lessons/Games/Test.html")
            self.assertEqual(owner, "Lessons")
            self.assertEqual(target, root / "lessons" / "Games" / "Test.html")
            owner, target = audit._resolve_href("/apexkick/")
            self.assertEqual(owner, "Website")
            self.assertEqual(target, root / "site" / "apexkick" / "index.html")

    def test_manifest_count_is_derived_and_duplicates_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit = self.make_audit(root)
            sample = {
                "title": "Games Arcade",
                "strap": "Test",
                "games": [
                    {
                        "icon": "A", "title": "Same", "desc": "A sufficiently long description for the first game entry.",
                        "href": "/one/", "tag": "Puzzle", "hue": "#112233",
                        "featured": False, "hero": True, "art": "/assets/one.svg",
                    },
                    {
                        "icon": "B", "title": "Same", "desc": "A sufficiently long description for the second game entry.",
                        "href": "/two/", "tag": "Puzzle", "hue": "#445566",
                        "featured": False, "hero": False, "art": "/assets/two.svg",
                    },
                ],
            }
            (root / "games.json").write_text(json.dumps(sample), encoding="utf-8")
            audit._validate_manifest()
            self.assertEqual(audit.manifest_analysis["entry_count"], 2)
            self.assertTrue(any(issue.blocking and "Duplicate title" in issue.message for issue in audit.issues))

    def test_live_fetch_retries_transient_failures(self) -> None:
        transient = {"ok": False, "status": 503, "error": "temporary"}
        recovered = {"ok": True, "status": 200, "body": b"ok"}
        with mock.patch.object(module.Audit, "_fetch_url_once", side_effect=[transient, recovered]) as probe, \
             mock.patch.object(module.time, "sleep"):
            result = module.Audit._fetch_url("https://example.invalid/test", full=True)
        self.assertEqual(probe.call_count, 2)
        self.assertTrue(result["ok"])
        self.assertEqual(result["attempts"], 2)

    def test_safe_interaction_excludes_reset_and_destructive_controls(self) -> None:
        self.assertIn("reset", module.SAFE_INTERACTION_JS.lower())
        self.assertIn("delete", module.SAFE_INTERACTION_JS.lower())
        self.assertNotIn("target.click()", module.SAFE_INTERACTION_JS)
        self.assertIn("element:target", module.SAFE_INTERACTION_JS)

    def test_active_validator_set_does_not_execute_retired_contract(self) -> None:
        commands = "\n".join(" ".join(command) for _, command in module.ACTIVE_VALIDATORS)
        self.assertNotIn("verify_apextennis_manifest.js", commands)
        self.assertIn("validate_games_json.sh", commands)
        self.assertIn("verify_sports_rail.js", commands)

    def test_desktop_touch_reset_omits_invalid_zero_touch_points(self) -> None:
        class FakeDriver:
            def __init__(self) -> None:
                self.commands: list[tuple[str, dict[str, object]]] = []

            def execute_cdp_cmd(self, name: str, payload: dict[str, object]) -> None:
                self.commands.append((name, payload))

            def set_window_size(self, width: int, height: int) -> None:
                return None

        driver = FakeDriver()
        module.Audit._set_browser_mode(driver, "desktop")
        touch = [payload for name, payload in driver.commands if name == "Emulation.setTouchEmulationEnabled"]
        self.assertEqual(touch[-1], {"enabled": False})


if __name__ == "__main__":
    unittest.main()
