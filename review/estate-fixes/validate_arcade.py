#!/usr/bin/env python3
"""Render the patched Games arcade in desktop and mobile/touch Chrome."""

from __future__ import annotations

import argparse
import contextlib
import http.server
import json
import pathlib
import posixpath
import sys
import threading
import time
import urllib.parse
from typing import Any, Sequence

EXPECTED_COUNT = 40
EXPECTED_HOLDER = "NEW · Echo Vault — Sound Is Your Light"


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
        handler = type("GamesFixPackHandler", (Handler,), {
            "games_root": games.resolve(),
            "site_root": site.resolve(),
            "lessons_root": lessons.resolve(),
        })
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.origin = f"http://127.0.0.1:{self.httpd.server_port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)


def set_mode(driver: Any, mode: str) -> None:
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


def network_errors(browser_logs: Sequence[dict[str, Any]], performance_logs: Sequence[dict[str, Any]], origin: str) -> list[Any]:
    errors: list[Any] = []
    for entry in browser_logs:
        if str(entry.get("level", "")).upper() != "SEVERE":
            continue
        message = str(entry.get("message", ""))
        if "Failed to load resource" not in message and "favicon.ico" not in message:
            errors.append({"kind": "console", "message": message[:2000]})
    for entry in performance_logs:
        try:
            payload = json.loads(entry["message"])["message"]
            if payload.get("method") != "Network.responseReceived":
                continue
            response = payload["params"]["response"]
            status = int(response.get("status", 0))
            url = str(response.get("url", ""))
            if status >= 400 and url.startswith(origin) and not url.endswith("/favicon.ico"):
                errors.append({"kind": "http", "status": status, "url": url})
        except Exception:
            continue
    return errors


def run(repo: pathlib.Path, site: pathlib.Path, lessons: pathlib.Path, output: pathlib.Path) -> int:
    from selenium import webdriver  # type: ignore

    output.mkdir(parents=True, exist_ok=True)
    server = CombinedServer(repo, site, lessons)
    server.start()
    driver = None
    results: list[dict[str, Any]] = []
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
            set_mode(driver, mode)
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
                    if count == EXPECTED_COUNT:
                        break
                    time.sleep(0.15)
                time.sleep(0.35)
                result["card_count"] = count
                # Each h4 contains an icon span followed by the title text node and
                # sometimes a badge span. Clone it and remove every span so only the
                # manifest title remains; never mistake the icon for the title.
                titles = driver.execute_script("""
                  return [...document.querySelectorAll('#allGrid .gcard h4')].map(h => {
                    const copy = h.cloneNode(true);
                    copy.querySelectorAll('span').forEach(span => span.remove());
                    return (copy.textContent || '').trim();
                  });
                """) or []
                descriptions = driver.execute_script(
                    "return [...document.querySelectorAll('#allGrid .gcard p')].map(x => (x.textContent || '').trim())"
                ) or []
                result["titles"] = titles
                result["title_holders"] = [title for title in titles if str(title).startswith("NEW · ")]
                result["legacy_description_holders"] = [desc for desc in descriptions if str(desc).startswith("NEW · ")]
                result["horizontal_overflow_px"] = int(driver.execute_script(
                    "return Math.max(0, document.documentElement.scrollWidth - innerWidth)"
                ) or 0)
                hook = driver.execute_script("return window.__gamesFixPackErrors || []") or []
                for entry in hook:
                    url = str(entry.get("url", "")) if isinstance(entry, dict) else ""
                    if not url or url.startswith(server.origin):
                        result["errors"].append(entry)
                    else:
                        result["warnings"].append(entry)
                result["errors"].extend(network_errors(driver.get_log("browser"), driver.get_log("performance"), server.origin))
                if count != EXPECTED_COUNT:
                    result["errors"].append(f"expected {EXPECTED_COUNT} cards, rendered {count}")
                if result["title_holders"] != [EXPECTED_HOLDER]:
                    result["errors"].append({"unexpected_title_holders": result["title_holders"]})
                if result["legacy_description_holders"]:
                    result["errors"].append({"legacy_description_holders": result["legacy_description_holders"]})
                result["status"] = "fail" if result["errors"] else "pass"
            except Exception as exc:
                result["errors"].append(f"{type(exc).__name__}: {exc}")
                result["status"] = "fail"
            results.append(result)
    except Exception as exc:
        results.append({"mode": "session", "status": "fail", "errors": [f"{type(exc).__name__}: {exc}"]})
    finally:
        if driver is not None:
            with contextlib.suppress(Exception):
                driver.quit()
        server.stop()

    (output / "arcade-browser-results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    failures = [result for result in results if result.get("status") != "pass"]
    lines = [
        "# Patched Games arcade browser validation",
        "",
        f"- Profiles: **{len(results)}**",
        f"- Passed: **{len(results) - len(failures)}**",
        f"- Failed: **{len(failures)}**",
        f"- Expected catalogue cards: **{EXPECTED_COUNT}**",
        f"- Expected sole release holder: **{EXPECTED_HOLDER}**",
        "",
    ]
    if failures:
        lines.extend(["| Mode | Failure |", "|---|---|"])
        for result in failures:
            lines.append(f"| {result.get('mode')} | `{json.dumps(result.get('errors'), ensure_ascii=False)}` |")
    else:
        lines.append("Desktop and mobile/touch rendering both passed with one visible title-based release holder and no legacy description marker.")
    (output / "ARCADE_BROWSER_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 1 if failures else 0


ERROR_HOOK = r"""
(() => {
  window.__gamesFixPackErrors = [];
  const push = (kind, value, url='') => {
    const text = typeof value === 'string' ? value : (value && (value.stack || value.message)) || String(value);
    window.__gamesFixPackErrors.push({kind, message:text.slice(0,2000), url:String(url || '').slice(0,2000)});
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
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    return run(pathlib.Path(args.repo), pathlib.Path(args.site_root), pathlib.Path(args.lessons_root), pathlib.Path(args.output))


if __name__ == "__main__":
    raise SystemExit(main())
