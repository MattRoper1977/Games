#!/usr/bin/env python3
"""Validate the two-stage Games estate fix pack in a disposable worktree."""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import http.server
import json
import pathlib
import posixpath
import subprocess
import sys
import threading
import time
import urllib.parse
from collections import Counter
from typing import Any, Sequence


BASE = "0fc29d519caea32b725d0b5dcbdcf2e6ef03db60"
EXPECTED_FINAL_PATHS = sorted([
    ".github/workflows/sports-rail-verify.yml",
    "games.json",
    "tools/apply_apexrally_manifest.py",
    "tools/verify_echovault_shelf.js",
    "tools/verify_relicforge_shelf.js",
    "tools/verify_sports_rail.js",
])


@dataclasses.dataclass(slots=True)
class Finding:
    severity: str
    path: str
    message: str
    details: Any = None

    def as_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


class Validator:
    def __init__(self, repo: pathlib.Path, site: pathlib.Path, lessons: pathlib.Path, output: pathlib.Path) -> None:
        self.repo = repo.resolve()
        self.site = site.resolve()
        self.lessons = lessons.resolve()
        self.output = output.resolve()
        self.findings: list[Finding] = []
        self.browser_results: list[dict[str, Any]] = []

    def error(self, path: str, message: str, details: Any = None) -> None:
        self.findings.append(Finding("error", path, message, details))

    def warning(self, path: str, message: str, details: Any = None) -> None:
        self.findings.append(Finding("warning", path, message, details))

    def run(self, browser: bool) -> int:
        self.output.mkdir(parents=True, exist_ok=True)
        self._check_changed_paths()
        self._check_sources()
        self._check_manifest()
        if browser:
            self._browser_check()
        self._write_outputs()
        return 1 if any(item.severity == "error" for item in self.findings) else 0

    def _check_changed_paths(self) -> None:
        proc = subprocess.run(
            ["git", "diff", "--name-only", BASE, "--"], cwd=self.repo,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        if proc.returncode:
            self.error("<worktree>", "Could not enumerate final changed paths", proc.stderr.strip())
            return
        actual = sorted(line for line in proc.stdout.splitlines() if line.strip())
        if actual != EXPECTED_FINAL_PATHS:
            self.error("<worktree>", "Final changed-path allowlist mismatch", {"expected": EXPECTED_FINAL_PATHS, "actual": actual})
        check = subprocess.run(
            ["git", "diff", "--check", BASE, "--"], cwd=self.repo,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
        )
        if check.returncode:
            self.error("<worktree>", "Final diff fails git diff --check", check.stdout.strip())

    def _check_sources(self) -> None:
        sports = (self.repo / "tools/verify_sports_rail.js").read_text(encoding="utf-8")
        echo = (self.repo / "tools/verify_echovault_shelf.js").read_text(encoding="utf-8")
        relic = (self.repo / "tools/verify_relicforge_shelf.js").read_text(encoding="utf-8")
        transform = (self.repo / "tools/apply_apexrally_manifest.py").read_text(encoding="utf-8")
        workflow = (self.repo / ".github/workflows/sports-rail-verify.yml").read_text(encoding="utf-8")

        for token in ("function markerState", "function checkMarkerState", "gate('S6'", "legacyDescription"):
            if token not in sports:
                self.error("tools/verify_sports_rail.js", f"Expected repaired-contract token is absent: {token}")
        for rel, text in (("tools/verify_echovault_shelf.js", echo), ("tools/verify_relicforge_shelf.js", relic)):
            if "title.startsWith('NEW · ')" in text or 'title.startsWith("NEW · ")' in text:
                self.error(rel, "Per-game contract still owns the ephemeral NEW · marker")
            if "title is present" not in text:
                self.error(rel, "Replacement stable title-presence contract is absent")
        if "move the `NEW · ` prefix onto Apex Rally" in transform:
            self.error("tools/apply_apexrally_manifest.py", "Apex Rally transform still claims the whole-shelf release marker")
        if "for field in ('title', 'desc')" not in transform:
            self.error("tools/apply_apexrally_manifest.py", "Apex Rally transform does not preserve existing release placement")
        if "set -euo pipefail" not in workflow or "node tools/verify_sports_rail.js | tee /tmp/rail.log" not in workflow:
            self.error(".github/workflows/sports-rail-verify.yml", "Sports rail pipeline is not protected by pipefail")

    def _check_manifest(self) -> None:
        path = self.repo / "games.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.error("games.json", "Final manifest is invalid JSON", str(exc))
            return
        games = data.get("games") if isinstance(data, dict) else None
        if not isinstance(games, list):
            self.error("games.json", "Final manifest has no games array")
            return
        title_holders = [game.get("title") for game in games if str(game.get("title", "")).startswith("NEW · ")]
        legacy_holders = [game.get("title") for game in games if str(game.get("desc", "")).startswith("NEW · ")]
        if title_holders != ["NEW · Echo Vault — Sound Is Your Light"]:
            self.error("games.json", "Final title-based release holder is not exactly Echo Vault", title_holders)
        if legacy_holders:
            self.error("games.json", "Legacy description-based release markers remain", legacy_holders)
        relic = [game for game in games if game.get("href") == "/relicforge/"]
        rally = [game for game in games if game.get("href") == "/apexrally/"]
        if len(relic) != 1 or relic[0].get("title") != "Relicforge — Strip the Machine":
            self.error("games.json", "Relicforge title was not normalised exactly", relic)
        if len(rally) != 1 or str(rally[0].get("desc", "")).startswith("NEW · "):
            self.error("games.json", "Apex Rally legacy description marker was not removed exactly", rally)
        hrefs = [str(game.get("href", "")) for game in games]
        if len(hrefs) != len(set(hrefs)):
            self.error("games.json", "Final manifest contains duplicate hrefs")

    def _browser_check(self) -> None:
        try:
            from selenium import webdriver  # type: ignore
        except Exception as exc:
            self.error("<browser>", "Selenium is unavailable", str(exc))
            return
        server = CombinedServer(self.repo, self.site, self.lessons)
        server.start()
        driver = None
        try:
            options = webdriver.ChromeOptions()
            for argument in (
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
                "--disable-features=Translate,BackForwardCache", "--window-size=1440,1000",
                "--remote-allow-origins=*", "--no-first-run",
            ):
                options.add_argument(argument)
            options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
            driver = webdriver.Chrome(options=options)
            driver.set_page_load_timeout(20)
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": ERROR_HOOK})
            for mode in ("desktop", "mobile-reduced"):
                self._set_mode(driver, mode)
                with contextlib.suppress(Exception):
                    driver.get_log("browser")
                    driver.get_log("performance")
                result: dict[str, Any] = {"mode": mode, "status": "unknown", "errors": [], "warnings": []}
                try:
                    driver.get(server.origin + "/games/")
                    deadline = time.monotonic() + 8
                    count = 0
                    while time.monotonic() < deadline:
                        count = int(driver.execute_script("return document.querySelectorAll('#allGrid .gcard').length") or 0)
                        if count == 40:
                            break
                        time.sleep(0.15)
                    result["card_count"] = count
                    result["titles"] = driver.execute_script(
                        "return [...document.querySelectorAll('#allGrid .gcard h4 span')].map(x=>x.textContent)"
                    ) or []
                    result["descriptions"] = driver.execute_script(
                        "return [...document.querySelectorAll('#allGrid .gcard p')].map(x=>x.textContent)"
                    ) or []
                    result["horizontal_overflow_px"] = int(driver.execute_script(
                        "return Math.max(0, document.documentElement.scrollWidth - innerWidth)"
                    ) or 0)
                    hook = driver.execute_script("return window.__fixPackErrors || []") or []
                    for entry in hook:
                        target = str(entry.get("url", "")) if isinstance(entry, dict) else ""
                        if not target or target.startswith(server.origin):
                            result["errors"].append(entry)
                        else:
                            result["warnings"].append(entry)
                    self._network_errors(result, driver.get_log("browser"), driver.get_log("performance"), server.origin)
                    holders = [title for title in result["titles"] if str(title).startswith("NEW · ")]
                    if count != 40:
                        result["errors"].append(f"expected 40 cards, rendered {count}")
                    if holders != ["NEW · Echo Vault — Sound Is Your Light"]:
                        result["errors"].append({"unexpected_rendered_holders": holders})
                    if any(str(desc).startswith("NEW · ") for desc in result["descriptions"]):
                        result["errors"].append("rendered description still exposes a NEW · prefix")
                    result["status"] = "fail" if result["errors"] else "pass"
                except Exception as exc:
                    result["errors"].append(f"{type(exc).__name__}: {exc}")
                    result["status"] = "fail"
                self.browser_results.append(result)
                if result["errors"]:
                    self.error("games/index.html", f"Patched arcade failed in {mode}", result["errors"])
        except Exception as exc:
            self.error("<browser>", "Chrome session failed", f"{type(exc).__name__}: {exc}")
        finally:
            if driver is not None:
                with contextlib.suppress(Exception):
                    driver.quit()
            server.stop()

    @staticmethod
    def _set_mode(driver: Any, mode: str) -> None:
        mobile = "mobile" in mode
        driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {
            "media": "screen",
            "features": [{"name": "prefers-reduced-motion", "value": "reduce" if "reduced" in mode else "no-preference"}],
        })
        if mobile:
            driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                "width": 390, "height": 844, "deviceScaleFactor": 3, "mobile": True,
                "screenWidth": 390, "screenHeight": 844,
            })
            driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
            driver.set_window_size(390, 844)
        else:
            with contextlib.suppress(Exception):
                driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
            driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": False})
            driver.set_window_size(1440, 1000)

    @staticmethod
    def _network_errors(result: dict[str, Any], browser_logs: Sequence[dict[str, Any]], performance_logs: Sequence[dict[str, Any]], origin: str) -> None:
        for entry in browser_logs:
            if str(entry.get("level", "")).upper() != "SEVERE":
                continue
            message = str(entry.get("message", ""))
            if "Failed to load resource" not in message and "favicon.ico" not in message:
                result["errors"].append(message[:2000])
        for entry in performance_logs:
            try:
                payload = json.loads(entry["message"])["message"]
                if payload.get("method") != "Network.responseReceived":
                    continue
                response = payload["params"]["response"]
                status = int(response.get("status", 0))
                url = str(response.get("url", ""))
                if status >= 400 and url.startswith(origin) and not url.endswith("/favicon.ico"):
                    result["errors"].append({"status": status, "url": url})
            except Exception:
                continue

    def _write_outputs(self) -> None:
        summary = {
            "base": BASE,
            "expected_final_paths": EXPECTED_FINAL_PATHS,
            "finding_counts": dict(Counter(item.severity for item in self.findings)),
            "browser_status_counts": dict(Counter(item.get("status") for item in self.browser_results)),
            "findings": [item.as_dict() for item in self.findings],
        }
        (self.output / "validation-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (self.output / "browser-results.json").write_text(json.dumps(self.browser_results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        lines = [
            "# Games proposed fix-pack validation",
            "",
            f"- Base: `{BASE}`",
            f"- Final changed paths: **{len(EXPECTED_FINAL_PATHS)}**",
            f"- Browser profiles: **{len(self.browser_results)}**",
            f"- Errors: **{sum(item.severity == 'error' for item in self.findings)}**",
            f"- Warnings: **{sum(item.severity == 'warning' for item in self.findings)}**",
            "",
        ]
        if self.findings:
            lines.extend(["| Severity | Path | Finding |", "|---|---|---|"])
            for item in self.findings:
                lines.append(f"| {item.severity.upper()} | `{item.path}` | {item.message.replace('|', '\\|')} |")
        else:
            lines.append("All final source, manifest, allowlist and rendered-arcade checks passed.")
        (self.output / "VALIDATION_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


class Handler(http.server.SimpleHTTPRequestHandler):
    games_root: pathlib.Path
    site_root: pathlib.Path
    lessons_root: pathlib.Path

    def translate_path(self, path: str) -> str:
        decoded = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if decoded.startswith("/Games/"):
            root, relative = self.games_root, decoded[len("/Games/"):]
        elif decoded.startswith("/Lessons/"):
            root, relative = self.lessons_root, decoded[len("/Lessons/"):]
        else:
            root, relative = self.site_root, decoded.lstrip("/")
        parts = [part for part in posixpath.normpath(relative).split("/") if part not in {"", ".", ".."}]
        return str(root.joinpath(*parts))

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class CombinedServer:
    def __init__(self, games: pathlib.Path, site: pathlib.Path, lessons: pathlib.Path) -> None:
        handler = type("FixPackHandler", (Handler,), {"games_root": games, "site_root": site, "lessons_root": lessons})
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.origin = f"http://127.0.0.1:{self.httpd.server_port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


ERROR_HOOK = r"""
(() => {
  window.__fixPackErrors = [];
  const push = (kind, value, url='') => {
    const text = typeof value === 'string' ? value : (value && (value.stack || value.message)) || String(value);
    window.__fixPackErrors.push({kind, message:text.slice(0,2000), url:String(url || '').slice(0,2000)});
  };
  window.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window && target !== document) {
      const url = target.currentSrc || target.src || target.href || '';
      push('resource', target.tagName || 'RESOURCE', url);
      return;
    }
    push('error', event.error || event.message || 'unknown window error');
  }, true);
  window.addEventListener('unhandledrejection', event => push('unhandledrejection', event.reason), true);
})();
"""


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--lessons-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--browser", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    return Validator(
        pathlib.Path(args.repo), pathlib.Path(args.site_root),
        pathlib.Path(args.lessons_root), pathlib.Path(args.output),
    ).run(args.browser)


if __name__ == "__main__":
    raise SystemExit(main())
