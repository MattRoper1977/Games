#!/usr/bin/env python3
"""Four-pass audit for the Games manifest and every public arcade target."""

from __future__ import annotations

import argparse
import ast
import concurrent.futures
import contextlib
import csv
import dataclasses
import datetime as dt
import hashlib
import html as html_module
import http.server
import io
import json
import os
import pathlib
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from typing import Any, Iterable, Iterator, Sequence

try:
    import html5lib  # type: ignore
except Exception:  # pragma: no cover
    html5lib = None
try:
    import tinycss2  # type: ignore
except Exception:  # pragma: no cover
    tinycss2 = None
try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None
try:
    from PIL import Image  # type: ignore
except Exception:  # pragma: no cover
    Image = None


TEXT_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".jsonl",
    ".py", ".sh", ".bash", ".md", ".txt", ".csv", ".tsv", ".xml",
    ".svg", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
    ".gitignore", ".gitattributes", ".editorconfig", ".webmanifest",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif"}
WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))
}
SEVERE_HTML5_CODES = {
    "duplicate-attribute", "expected-closing-tag-but-got-eof",
    "eof-in-element-that-can-contain-only-text", "unexpected-null-character",
    "invalid-codepoint", "invalid-character-in-attribute-name",
    "unexpected-character-in-unquoted-attribute-value", "unexpected-end-tag",
    "end-tag-too-early",
}
ACTIVE_VALIDATORS: list[tuple[str, list[str]]] = [
    ("canonical manifest contract", ["bash", "tools/validate_games_json.sh", "games.json", "{LESSONS}"]),
    ("Sports rail contract", ["node", "tools/verify_sports_rail.js"]),
    ("Apex Pool sports contract", ["node", "tools/verify_apexpool_sports_manifest.js"]),
    ("Echo Vault shelf contract", ["node", "tools/verify_echovault_shelf.js"]),
    ("Relicforge shelf contract", ["node", "tools/verify_relicforge_shelf.js"]),
]
SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("GitHub token", re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Stripe secret", re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b")),
]


@dataclasses.dataclass(slots=True)
class Issue:
    severity: str
    owner: str
    category: str
    path: str
    message: str
    line: int | None = None
    details: Any = None
    blocking: bool = False

    def as_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


class Audit:
    def __init__(
        self,
        repo_root: pathlib.Path,
        site_root: pathlib.Path,
        lessons_root: pathlib.Path,
        output: pathlib.Path,
        published_ref: str,
    ) -> None:
        self.root = repo_root.resolve()
        self.site_root = site_root.resolve()
        self.lessons_root = lessons_root.resolve()
        self.output = output.resolve()
        self.published_ref = published_ref
        self.issues: list[Issue] = []
        self.inventory: list[dict[str, Any]] = []
        self.browser_results: list[dict[str, Any]] = []
        self.live_results: list[dict[str, Any]] = []
        self.validator_results: list[dict[str, Any]] = []
        self.site_checks: dict[str, Any] = {}
        self.manifest_analysis: dict[str, Any] = {}
        self.metadata: dict[str, Any] = {}
        self.games: list[dict[str, Any]] = []
        self._tracked_set: set[str] = set()
        self._casefold: dict[str, list[str]] = defaultdict(list)
        self._site_files: set[str] = set()
        self._lessons_files: set[str] = set()

    def add(
        self,
        severity: str,
        owner: str,
        category: str,
        path: str,
        message: str,
        *,
        line: int | None = None,
        details: Any = None,
        blocking: bool | None = None,
    ) -> None:
        if blocking is None:
            blocking = severity == "error"
        self.issues.append(Issue(severity, owner, category, path, message, line, details, blocking))

    @property
    def blocking_count(self) -> int:
        return sum(1 for issue in self.issues if issue.blocking)

    def run(self, browser: bool, live: bool, modes: Sequence[str], page_timeout: float, settle: float) -> int:
        self.output.mkdir(parents=True, exist_ok=True)
        self._check_environment(browser)
        files = self._tracked_files()
        self._index_dependencies()
        self._inventory_and_validate(files)
        self._validate_manifest()
        self._run_existing_validators()
        self._check_site_wiring()
        if browser:
            self._browser_probe(modes, page_timeout, settle, include_live=live)
        if live:
            self._live_probe()
        self._write_outputs()
        return 1 if self.blocking_count else 0

    def _check_environment(self, browser: bool) -> None:
        modules = {"html5lib": html5lib, "tinycss2": tinycss2, "PyYAML": yaml, "Pillow": Image}
        missing = [name for name, module in modules.items() if module is None]
        if missing:
            self.add("error", "Runner", "environment", "<runner>", f"Missing Python dependencies: {', '.join(missing)}")
        for command in ("git", "node", "bash"):
            if not shutil.which(command):
                self.add("error", "Runner", "environment", "<runner>", f"Required command is unavailable: {command}")
        if browser:
            try:
                import selenium  # noqa: F401  # type: ignore
            except Exception as exc:
                self.add("error", "Runner", "environment", "<runner>", "Selenium is unavailable", details=str(exc))
            if not any(shutil.which(name) for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")):
                self.add("error", "Runner", "environment", "<runner>", "Chrome/Chromium is unavailable")
        for owner, path in (("Website", self.site_root), ("Lessons", self.lessons_root)):
            if not path.is_dir():
                self.add("error", owner, "dependency", str(path), "Required read-only checkout is missing")

    def _tracked_files(self) -> list[pathlib.Path]:
        proc = subprocess.run(
            ["git", "ls-files", "-z"], cwd=self.root,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        if proc.returncode:
            self.add("error", "Games", "git", "<repository>", "git ls-files failed", details=proc.stderr.decode("utf-8", "replace"))
            return []
        names = [name for name in proc.stdout.decode("utf-8", "surrogateescape").split("\0") if name]
        files: list[pathlib.Path] = []
        for name in names:
            path = self.root / name
            self._tracked_set.add(name)
            self._casefold[name.casefold()].append(name)
            if not path.exists() and not path.is_symlink():
                self.add("error", "Games", "git", name, "Tracked path is missing from checkout")
                continue
            if path.is_file() or path.is_symlink():
                files.append(path)
        for paths in self._casefold.values():
            if len(paths) > 1:
                self.add("error", "Games", "path", paths[0], "Case-insensitive path collision", details=paths)
        self.metadata["games_commit"] = self._git_rev(self.root)
        self.metadata["published_ref"] = self.published_ref
        self.metadata["tracked_file_count"] = len(files)
        return files

    def _index_dependencies(self) -> None:
        self._site_files = self._walk_file_set(self.site_root)
        self._lessons_files = self._walk_file_set(self.lessons_root)
        self.metadata["site_commit"] = self._git_rev(self.site_root)
        self.metadata["lessons_commit"] = self._git_rev(self.lessons_root)
        self.metadata["site_file_count"] = len(self._site_files)
        self.metadata["lessons_file_count"] = len(self._lessons_files)

    @staticmethod
    def _walk_file_set(root: pathlib.Path) -> set[str]:
        result: set[str] = set()
        if not root.is_dir():
            return result
        proc = subprocess.run(["git", "ls-files", "-z"], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode == 0:
            return {name for name in proc.stdout.decode("utf-8", "surrogateescape").split("\0") if name}
        for path in root.rglob("*"):
            if path.is_file() and ".git" not in path.parts:
                result.add(path.relative_to(root).as_posix())
        return result

    @staticmethod
    def _git_rev(root: pathlib.Path) -> str:
        try:
            return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
        except Exception:
            return "unknown"

    def _inventory_and_validate(self, files: Sequence[pathlib.Path]) -> None:
        ext_counts: Counter[str] = Counter()
        total_bytes = 0
        for path in files:
            rel = path.relative_to(self.root).as_posix()
            self._check_path(rel)
            if path.is_symlink():
                self._check_symlink(path, rel)
                continue
            try:
                data = path.read_bytes()
            except OSError as exc:
                self.add("error", "Games", "filesystem", rel, "Cannot read tracked file", details=str(exc))
                continue
            size = len(data)
            total_bytes += size
            ext = path.suffix.lower() or "<none>"
            ext_counts[ext] += 1
            self.inventory.append({
                "path": rel,
                "bytes": size,
                "extension": ext,
                "sha256": hashlib.sha256(data).hexdigest(),
                "zero_bytes": size == 0,
            })
            if size == 0:
                self.add("warning", "Games", "content", rel, "Tracked file is zero bytes", blocking=False)
            self._scan_secrets(rel, data)
            if ext in IMAGE_EXTENSIONS:
                self._validate_image(path, rel)
                continue
            if ext == ".svg":
                self._validate_xml(path, rel, expect_svg=True)
                continue
            if ext == ".xml":
                self._validate_xml(path, rel, expect_svg=False)
                continue
            if ext not in TEXT_EXTENSIONS and not self._looks_text(data):
                continue
            text = self._decode_text(rel, data)
            if "\x00" in text:
                self.add("error", "Games", "encoding", rel, "Text file contains NUL characters")
            if ext in {".json", ".webmanifest"}:
                self._validate_json(rel, text)
            elif ext in {".yml", ".yaml"}:
                self._validate_yaml(rel, text)
            elif ext in {".js", ".mjs", ".cjs"}:
                self._validate_javascript(path, rel)
            elif ext == ".py":
                self._validate_python(rel, text)
            elif ext in {".sh", ".bash"}:
                self._validate_shell(path, rel)
            elif ext == ".css":
                self._validate_css(rel, text)
            elif ext in {".html", ".htm"}:
                self._validate_html(rel, text)
        self.metadata["tracked_bytes"] = total_bytes
        self.metadata["extensions"] = dict(sorted(ext_counts.items()))
        self.metadata["largest_files"] = sorted(self.inventory, key=lambda row: row["bytes"], reverse=True)[:20]

    def _check_path(self, rel: str) -> None:
        for part in pathlib.PurePosixPath(rel).parts:
            stem = part.split(".", 1)[0].upper()
            if stem in WINDOWS_RESERVED:
                self.add("error", "Games", "path", rel, f"Path uses Windows-reserved name: {part}")
            if part.endswith((" ", ".")):
                self.add("error", "Games", "path", rel, f"Path segment has a trailing space or dot: {part!r}")
            if any(ord(char) < 32 for char in part):
                self.add("error", "Games", "path", rel, "Path contains a control character")

    def _check_symlink(self, path: pathlib.Path, rel: str) -> None:
        try:
            target = os.readlink(path)
            resolved = (path.parent / target).resolve()
            resolved.relative_to(self.root)
            if not resolved.exists():
                self.add("error", "Games", "filesystem", rel, "Symlink target is missing", details=target)
        except ValueError:
            self.add("error", "Games", "filesystem", rel, "Symlink escapes the repository")
        except OSError as exc:
            self.add("error", "Games", "filesystem", rel, "Cannot inspect symlink", details=str(exc))

    def _scan_secrets(self, rel: str, data: bytes) -> None:
        name = pathlib.PurePosixPath(rel).name.lower()
        if name in {".env", ".env.local", "id_rsa", "id_ed25519"} or name.endswith((".pem", ".key", ".p12", ".pfx")):
            self.add("error", "Games", "secret", rel, "Sensitive credential/key filename is tracked")
        if len(data) > 2_000_000 or b"\x00" in data[:4096]:
            return
        text = data.decode("utf-8", "ignore")
        for label, pattern in SECRET_PATTERNS:
            match = pattern.search(text)
            if match:
                self.add("error", "Games", "secret", rel, f"Potential committed {label}", line=text.count("\n", 0, match.start()) + 1)

    def _validate_json(self, rel: str, text: str) -> None:
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            self.add("error", "Games", "json", rel, "Invalid JSON", line=exc.lineno, details=exc.msg)

    def _validate_yaml(self, rel: str, text: str) -> None:
        if yaml is None:
            return
        try:
            list(yaml.safe_load_all(text))
        except Exception as exc:
            mark = getattr(exc, "problem_mark", None)
            self.add("error", "Games", "yaml", rel, "Invalid YAML", line=(mark.line + 1) if mark else None, details=str(exc))

    def _validate_javascript(self, path: pathlib.Path, rel: str) -> None:
        if not shutil.which("node"):
            return
        proc = subprocess.run(["node", "--check", str(path)], cwd=self.root, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode:
            self.add("error", "Games", "javascript", rel, "JavaScript syntax error", details=proc.stderr[-4000:])

    def _validate_python(self, rel: str, text: str) -> None:
        try:
            ast.parse(text, filename=rel)
        except SyntaxError as exc:
            self.add("error", "Games", "python", rel, "Python syntax error", line=exc.lineno, details=exc.msg)

    def _validate_shell(self, path: pathlib.Path, rel: str) -> None:
        proc = subprocess.run(["bash", "-n", str(path)], cwd=self.root, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode:
            self.add("error", "Games", "shell", rel, "Shell syntax error", details=proc.stderr[-4000:])

    def _validate_css(self, rel: str, text: str) -> None:
        if tinycss2 is None:
            return
        try:
            tokens = tinycss2.parse_stylesheet(text, skip_comments=False, skip_whitespace=False)
            for token in self._walk_css(tokens):
                if getattr(token, "type", None) == "error":
                    self.add("error", "Games", "css", rel, "CSS parse error", line=getattr(token, "source_line", None), details=getattr(token, "message", None))
        except Exception as exc:
            self.add("error", "Games", "css", rel, "CSS parser failed", details=str(exc))

    def _walk_css(self, tokens: Iterable[Any]) -> Iterator[Any]:
        for token in tokens:
            yield token
            for attr in ("content", "arguments"):
                child = getattr(token, attr, None)
                if child:
                    yield from self._walk_css(child)

    def _validate_html(self, rel: str, text: str) -> None:
        if html5lib is None:
            return
        try:
            parser = html5lib.HTMLParser(tree=html5lib.getTreeBuilder("etree"), namespaceHTMLElements=False)
            document = parser.parse(text)
        except Exception as exc:
            self.add("error", "Games", "html", rel, "HTML parser failed", details=str(exc))
            return
        for position, code, data in parser.errors:
            severity = "error" if code in SEVERE_HTML5_CODES else "warning"
            self.add(severity, "Games", "html", rel, f"HTML5 parse issue: {code}", line=position[0] if position else None, details=data, blocking=severity == "error")
        ids = [element.attrib["id"] for element in document.iter() if element.attrib.get("id")]
        for duplicate in sorted(name for name, count in Counter(ids).items() if count > 1):
            self.add("error", "Games", "html", rel, f"Duplicate id: {duplicate}")

    def _validate_xml(self, path: pathlib.Path, rel: str, expect_svg: bool) -> None:
        try:
            root = ET.parse(path).getroot()
            if expect_svg and not root.tag.lower().endswith("svg"):
                self.add("error", "Games", "svg", rel, "SVG file does not have an <svg> root")
        except Exception as exc:
            self.add("error", "Games", "xml", rel, "XML/SVG is not well formed", details=str(exc))

    def _validate_image(self, path: pathlib.Path, rel: str) -> None:
        if Image is None:
            return
        try:
            with Image.open(path) as image:
                image.verify()
        except Exception as exc:
            if path.suffix.lower() == ".avif" and b"ftypavi" in path.read_bytes()[:64]:
                self.add("info", "Games", "image", rel, "AVIF signature is valid but the runner decoder is unavailable", details=str(exc), blocking=False)
            else:
                self.add("error", "Games", "image", rel, "Image cannot be decoded", details=str(exc))

    def _validate_manifest(self) -> None:
        path = self.root / "games.json"
        if not path.is_file():
            self.add("error", "Games", "manifest", "games.json", "Manifest is missing")
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return
        if not isinstance(data, dict):
            self.add("error", "Games", "manifest", "games.json", "Manifest root is not an object")
            return
        games = data.get("games")
        if not isinstance(games, list):
            self.add("error", "Games", "manifest", "games.json", "Manifest has no games array")
            return
        self.games = [game for game in games if isinstance(game, dict)]
        if len(self.games) != len(games):
            self.add("error", "Games", "manifest", "games.json", "One or more game entries are not objects")
        if not self.games:
            self.add("error", "Games", "manifest", "games.json", "Manifest games array is empty")
            return
        required = {"icon", "title", "desc", "href", "tag", "hue", "featured", "hero", "art"}
        title_counts: Counter[str] = Counter()
        href_counts: Counter[str] = Counter()
        tag_counts: Counter[str] = Counter()
        host_counts: Counter[str] = Counter()
        key_shapes: Counter[str] = Counter()
        new_titles: list[str] = []
        heroes: list[str] = []
        featured: list[str] = []
        for index, game in enumerate(self.games):
            label = str(game.get("title") or f"entry #{index}")
            keys = set(game)
            missing = sorted(required - keys)
            if missing:
                self.add("error", "Games", "manifest", "games.json", f"{label} is missing required fields", details=missing)
            for field in ("icon", "title", "desc", "href", "tag", "hue", "art"):
                value = game.get(field)
                if not isinstance(value, str) or not value.strip():
                    self.add("error", "Games", "manifest", "games.json", f"{label}: {field} must be a non-empty string")
            for field in ("featured", "hero"):
                if not isinstance(game.get(field), bool):
                    self.add("error", "Games", "manifest", "games.json", f"{label}: {field} must be a boolean")
            title = str(game.get("title", ""))
            href = str(game.get("href", ""))
            art = str(game.get("art", ""))
            tag = str(game.get("tag", ""))
            hue = str(game.get("hue", ""))
            title_counts[title] += 1
            href_counts[href] += 1
            tag_counts[tag] += 1
            key_shapes[",".join(sorted(keys))] += 1
            if title.startswith("NEW · "):
                new_titles.append(title)
            if game.get("hero") is True:
                heroes.append(title)
            if game.get("featured") is True:
                featured.append(title)
            if not re.fullmatch(r"#[0-9A-Fa-f]{6}", hue):
                self.add("error", "Games", "manifest", "games.json", f"{label}: hue is not a six-digit hex colour", details=hue)
            if not href.startswith("/") or ".." in urllib.parse.unquote(href).split("/"):
                self.add("error", "Games", "manifest", "games.json", f"{label}: href is not a safe site-relative path", details=href)
            if not art.startswith("/") or ".." in urllib.parse.unquote(art).split("/"):
                self.add("error", "Games", "manifest", "games.json", f"{label}: art is not a safe site-relative path", details=art)
            if href.startswith("/Lessons/"):
                host_counts["Lessons"] += 1
            else:
                host_counts["Website root"] += 1
            if len(str(game.get("desc", ""))) < 40:
                self.add("warning", "Games", "manifest", "games.json", f"{label}: description is unusually short", blocking=False)
        for value, count in title_counts.items():
            if count > 1:
                self.add("error", "Games", "manifest", "games.json", f"Duplicate title appears {count} times", details=value)
        for value, count in href_counts.items():
            if count > 1:
                self.add("error", "Games", "manifest", "games.json", f"Duplicate href appears {count} times", details=value)
        if len(heroes) != 1:
            self.add("error", "Games", "manifest", "games.json", f"Expected exactly one hero; found {len(heroes)}", details=heroes)
        if len(new_titles) > 1:
            self.add("warning", "Games", "convention", "games.json", "More than one card uses the exact NEW · prefix; review the shelf convention", details=new_titles, blocking=False)
        self.manifest_analysis = {
            "entry_count": len(self.games),
            "hero_titles": heroes,
            "featured_count": len(featured),
            "featured_titles": featured,
            "new_prefix_count": len(new_titles),
            "new_prefix_titles": new_titles,
            "host_counts": dict(host_counts),
            "tag_counts": dict(sorted(tag_counts.items())),
            "single_use_tags": sorted(tag for tag, count in tag_counts.items() if count == 1),
            "key_shapes": dict(key_shapes),
            "required_fields": sorted(required),
        }
        self.metadata["manifest_entry_count"] = len(self.games)

    def _run_existing_validators(self) -> None:
        env = os.environ.copy()
        env["LESSONS_DIR"] = str(self.lessons_root)
        env.setdefault("GITHUB_BASE_REF", "main")
        for label, template in ACTIVE_VALIDATORS:
            command = [part.replace("{LESSONS}", str(self.lessons_root)) for part in template]
            script_path = self.root / command[1]
            if not script_path.exists():
                result = {"name": label, "command": command, "status": "missing", "returncode": None, "output": ""}
                self.validator_results.append(result)
                self.add("error", "Games", "validator", command[1], f"Active validator is missing: {label}")
                continue
            started = time.monotonic()
            try:
                proc = subprocess.run(
                    command, cwd=self.root, env=env, text=True,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    timeout=120, check=False,
                )
                output = proc.stdout[-20000:]
                status = "pass" if proc.returncode == 0 else "fail"
                result = {
                    "name": label, "command": command, "status": status,
                    "returncode": proc.returncode, "elapsed_ms": round((time.monotonic() - started) * 1000),
                    "output": output,
                }
                self.validator_results.append(result)
                if proc.returncode:
                    self.add("error", "Games", "validator", command[1], f"Existing validator failed: {label}", details=output)
            except Exception as exc:
                self.validator_results.append({"name": label, "command": command, "status": "error", "error": str(exc)})
                self.add("error", "Games", "validator", command[1], f"Existing validator could not run: {label}", details=str(exc))
        self.metadata["validator_status_counts"] = dict(Counter(row.get("status") for row in self.validator_results))

    def _check_site_wiring(self) -> None:
        arcade = self.site_root / "games/index.html"
        site_json_path = self.site_root / "site.json"
        arcade_text = ""
        if not arcade.is_file():
            self.add("error", "Website", "wiring", "games/index.html", "Arcade consumer page is missing")
        else:
            arcade_text = arcade.read_text(encoding="utf-8", errors="replace")
            if "/Games/games.json" not in arcade_text:
                self.add("error", "Website", "wiring", "games/index.html", "Arcade does not reference /Games/games.json")
            if "fetch(" not in arcade_text:
                self.add("error", "Website", "wiring", "games/index.html", "Arcade consumer has no fetch call")
        site_data: dict[str, Any] = {}
        if not site_json_path.is_file():
            self.add("error", "Website", "wiring", "site.json", "site.json is missing")
        else:
            try:
                loaded = json.loads(site_json_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    site_data = loaded
            except Exception as exc:
                self.add("error", "Website", "wiring", "site.json", "site.json is invalid", details=str(exc))
        doors = site_data.get("doors", []) if isinstance(site_data, dict) else []
        game_doors = [door for door in doors if isinstance(door, dict) and door.get("zone") == "games"]
        count_keys = [str(door.get("countKey")) for door in game_doors if door.get("countKey")]
        for key, count in Counter(count_keys).items():
            if count > 1:
                self.add("error", "Website", "wiring", "site.json", f"Duplicate game-door countKey: {key}")
        manifest_hrefs = {str(game.get("href")) for game in self.games}
        door_results: list[dict[str, Any]] = []
        for door in game_doors:
            title = str(door.get("title", "(untitled door)"))
            href = self._normalise_site_href(str(door.get("href", "")))
            owner, target = self._resolve_href(href)
            exists = target is not None and target.is_file()
            in_manifest = href in manifest_hrefs
            door_results.append({"title": title, "href": href, "owner": owner, "exists": exists, "in_manifest": in_manifest})
            if not exists:
                self.add("error", owner, "wiring", "site.json", f"Game door target is missing: {title}", details=href)
            if not in_manifest:
                self.add("warning", "Website", "wiring", "site.json", f"Game door is not represented in games.json: {title}", details=href, blocking=False)
        catalog = (((site_data.get("features") or {}).get("downloads") or {}).get("catalog") or []) if isinstance(site_data, dict) else []
        catalog_keys = {str(item.get("key")) for item in catalog if isinstance(item, dict) and item.get("key")}
        for door in game_doors:
            key = str(door.get("countKey", ""))
            if key and key not in catalog_keys:
                self.add("warning", "Website", "wiring", "site.json", f"Game door countKey is absent from the downloads catalogue: {key}", blocking=False)
        resolution: list[dict[str, Any]] = []
        for game in self.games:
            title = str(game.get("title", "(untitled)"))
            href = str(game.get("href", ""))
            owner, target = self._resolve_href(href)
            exists = target is not None and target.is_file()
            resolution.append({"title": title, "href": href, "owner": owner, "target": str(target) if target else None, "exists": exists})
            if not exists:
                self.add("error", owner, "target", href, f"Manifest game target is missing: {title}")
            art = str(game.get("art", ""))
            art_target = self.site_root / urllib.parse.unquote(art.lstrip("/"))
            if not art_target.is_file():
                self.add("error", "Website", "art", art, f"Manifest card art is missing: {title}")
        self.site_checks = {
            "arcade_path": "games/index.html",
            "arcade_references_manifest": "/Games/games.json" in arcade_text,
            "game_door_count": len(game_doors),
            "game_doors": door_results,
            "dependency_resolution": resolution,
            "site_json_download_catalog_count": len(catalog),
        }

    @staticmethod
    def _normalise_site_href(href: str) -> str:
        href = href.strip()
        if not href:
            return "/"
        return "/" + href.lstrip("/")

    def _resolve_href(self, href: str) -> tuple[str, pathlib.Path | None]:
        parsed = urllib.parse.urlsplit(href)
        if parsed.scheme or parsed.netloc:
            return "External", None
        path = urllib.parse.unquote(parsed.path)
        if path.startswith("/Lessons/"):
            rel = posixpath.normpath(path[len("/Lessons/"):]).lstrip("/")
            return "Lessons", self.lessons_root / rel
        rel = posixpath.normpath(path.lstrip("/"))
        if rel in {"", "."}:
            rel = "index.html"
        target = self.site_root / rel
        if path.endswith("/"):
            target = target / "index.html"
        return "Website", target

    def _browser_probe(self, modes: Sequence[str], page_timeout: float, settle: float, include_live: bool) -> None:
        try:
            from selenium import webdriver  # type: ignore
            from selenium.common.exceptions import TimeoutException, WebDriverException  # type: ignore
        except Exception:
            return
        server = CombinedServer(self.root, self.site_root, self.lessons_root)
        server.start()
        driver = None
        try:
            options = webdriver.ChromeOptions()
            chrome = next((shutil.which(name) for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if shutil.which(name)), None)
            if chrome:
                options.binary_location = chrome
            for arg in (
                "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
                "--disable-features=Translate,BackForwardCache", "--autoplay-policy=no-user-gesture-required",
                "--window-size=1440,1000", "--remote-allow-origins=*", "--no-first-run",
            ):
                options.add_argument(arg)
            options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
            driver = webdriver.Chrome(options=options)
            driver.set_page_load_timeout(page_timeout)
            driver.set_script_timeout(max(10, int(page_timeout)))
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": ERROR_HOOK_JS})
            for mode in modes:
                self._set_browser_mode(driver, mode)
                arcade_url = f"{server.origin}/games/"
                arcade_result = self._probe_page(driver, arcade_url, "games/index.html", "local-arcade", mode, settle, expected_cards=len(self.games), allow_interaction=False)
                self.browser_results.append(arcade_result)
                self._record_browser_issue(arcade_result, "Website", "games/index.html")
                for game in self.games:
                    title = str(game.get("title", "(untitled)"))
                    href = str(game.get("href", ""))
                    url = server.origin + urllib.parse.quote(href, safe="/%()")
                    owner = "Lessons" if href.startswith("/Lessons/") else "Website"
                    result = self._probe_page(
                        driver, url, href, "game", mode, settle,
                        expected_cards=None,
                        allow_interaction=(mode == "desktop"),
                    )
                    result["title_from_manifest"] = title
                    self.browser_results.append(result)
                    self._record_browser_issue(result, owner, href)
                    with contextlib.suppress(Exception):
                        driver.execute_script("try{localStorage.clear();sessionStorage.clear();}catch(e){}")
                print(f"browser mode {mode}: arcade + {len(self.games)} games", flush=True)
            if include_live:
                self._set_browser_mode(driver, "desktop")
                live_result = self._probe_page(
                    driver, "https://madebymatt.uk/games/", "https://madebymatt.uk/games/",
                    "live-arcade", "desktop", max(settle, 1.0), expected_cards=len(self.games), allow_interaction=False,
                )
                self.browser_results.append(live_result)
                if live_result.get("status") == "fail":
                    self.add("error", "Live/Deployment", "browser", "/games/", "Live arcade browser verification failed", details=live_result)
        except (TimeoutException, WebDriverException, Exception) as exc:
            self.add("error", "Runner", "browser", "<browser-session>", "Browser session could not complete", details=f"{type(exc).__name__}: {exc}")
        finally:
            if driver is not None:
                with contextlib.suppress(Exception):
                    driver.quit()
            server.stop()
        self.metadata["browser_status_counts"] = dict(Counter(result.get("status") for result in self.browser_results))
        self.metadata["browser_result_count"] = len(self.browser_results)

    def _probe_page(
        self,
        driver: Any,
        url: str,
        path: str,
        kind: str,
        mode: str,
        settle: float,
        *,
        expected_cards: int | None,
        allow_interaction: bool,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {
            "path": path, "url": url, "kind": kind, "mode": mode,
            "status": "unknown", "errors": [], "warnings": [],
            "local_http_errors": [], "external_resource_errors": [],
            "interaction": None,
        }
        with contextlib.suppress(Exception):
            driver.get_log("browser")
            driver.get_log("performance")
        try:
            driver.get(url)
            deadline = time.monotonic() + 6
            if expected_cards is not None:
                while time.monotonic() < deadline:
                    count = driver.execute_script("return document.querySelectorAll('#allGrid .gcard').length")
                    if int(count or 0) >= expected_cards:
                        break
                    time.sleep(0.15)
            time.sleep(settle)
            surface = driver.execute_script(SURFACE_JS) or {}
            result.update(surface)
            hook_errors = driver.execute_script("return window.__gamesEstateErrors || []") or []
            for entry in hook_errors:
                if isinstance(entry, dict) and entry.get("kind") == "resource":
                    target = str(entry.get("url", ""))
                    if target.startswith(("http://127.0.0.1", "https://madebymatt.uk")):
                        result["errors"].append(entry)
                    else:
                        result["external_resource_errors"].append(entry)
                        result["warnings"].append(entry)
                else:
                    result["errors"].append(entry)
            self._classify_network(result, driver.get_log("browser"), driver.get_log("performance"), url)
            if expected_cards is not None:
                actual = int(result.get("all_grid_cards") or 0)
                result["expected_cards"] = expected_cards
                if actual != expected_cards:
                    result["errors"].append({"kind": "arcade-count", "message": f"Expected {expected_cards} catalogue cards; rendered {actual}"})
            if not result.get("has_surface"):
                result["errors"].append({"kind": "render", "message": "No visible text, image, SVG, video, iframe or non-zero canvas"})
            if allow_interaction:
                interaction = driver.execute_script(SAFE_INTERACTION_JS) or {}
                element = interaction.pop("element", None) if isinstance(interaction, dict) else None
                if element is not None:
                    try:
                        element.click()
                        interaction["clicked"] = True
                        time.sleep(0.3)
                        post = driver.execute_script("return window.__gamesEstateErrors || []") or []
                        interaction["post_errors"] = post
                        for entry in post:
                            if entry not in result["errors"] and not (isinstance(entry, dict) and entry.get("kind") == "resource"):
                                result["errors"].append(entry)
                        self._classify_network(result, driver.get_log("browser"), driver.get_log("performance"), url)
                    except Exception as exc:
                        interaction["clicked"] = False
                        interaction["reason"] = f"{type(exc).__name__}: {exc}"
                result["interaction"] = interaction
            result["status"] = "fail" if result["errors"] or result["local_http_errors"] else "pass"
        except Exception as exc:
            result["errors"].append({"kind": "webdriver", "message": f"{type(exc).__name__}: {exc}"})
            result["status"] = "fail"
            with contextlib.suppress(Exception):
                driver.execute_script("window.stop()")
        return result

    def _record_browser_issue(self, result: dict[str, Any], owner: str, path: str) -> None:
        if result.get("status") == "fail":
            self.add("error", owner, "browser", path, f"Browser smoke failed in {result.get('mode')}", details={"errors": result.get("errors", [])[:10], "http": result.get("local_http_errors", [])[:10]})

    @staticmethod
    def _set_browser_mode(driver: Any, mode: str) -> None:
        mobile = "mobile" in mode
        reduced = "reduced" in mode
        driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {
            "media": "screen",
            "features": [{"name": "prefers-reduced-motion", "value": "reduce" if reduced else "no-preference"}],
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
    def _classify_network(result: dict[str, Any], browser_logs: Sequence[dict[str, Any]], performance_logs: Sequence[dict[str, Any]], page_url: str) -> None:
        for entry in browser_logs:
            if str(entry.get("level", "")).upper() != "SEVERE":
                continue
            message = str(entry.get("message", ""))
            lower = message.lower()
            if "failed to load resource" in lower or "favicon.ico" in lower:
                continue
            result["errors"].append({"kind": "console", "message": message[:2000]})
        for entry in performance_logs:
            try:
                payload = json.loads(entry["message"])["message"]
                if payload.get("method") != "Network.responseReceived":
                    continue
                response = payload["params"]["response"]
                status = int(response.get("status", 0))
                target = str(response.get("url", ""))
                if status < 400 or target.endswith("/favicon.ico"):
                    continue
                page_origin = urllib.parse.urlsplit(page_url)
                target_origin = urllib.parse.urlsplit(target)
                record = {"status": status, "url": target}
                if (page_origin.scheme, page_origin.netloc) == (target_origin.scheme, target_origin.netloc):
                    if record not in result["local_http_errors"]:
                        result["local_http_errors"].append(record)
                else:
                    if record not in result["external_resource_errors"]:
                        result["external_resource_errors"].append(record)
                        result["warnings"].append({"kind": "external-http", **record})
            except Exception:
                continue

    def _live_probe(self) -> None:
        exact_url = "https://madebymatt.uk/Games/games.json"
        exact = self._fetch_url(exact_url, full=True)
        exact.update({"kind": "exact-manifest", "url": exact_url, "source_ref": self.published_ref})
        published = self._published_bytes("games.json")
        if exact.get("ok") and published is not None:
            remote = exact.pop("body", b"")
            exact["published_sha256"] = hashlib.sha256(published).hexdigest()
            exact["live_sha256"] = hashlib.sha256(remote).hexdigest()
            exact["exact_match"] = published == remote
            if not exact["exact_match"]:
                self.add("error", "Live/Deployment", "live", "/Games/games.json", "Live manifest does not byte-match Games main", details=exact)
        elif not exact.get("ok"):
            self.add("error", "Live/Deployment", "live", "/Games/games.json", "Live manifest could not be fetched", details=exact)
        self.live_results.append(self._json_safe(exact))
        targets: dict[str, dict[str, Any]] = {
            "https://madebymatt.uk/games/": {"kind": "arcade", "owner": "Website", "label": "/games/"},
        }
        for game in self.games:
            href = str(game.get("href", ""))
            art = str(game.get("art", ""))
            targets["https://madebymatt.uk" + urllib.parse.quote(href, safe="/%()") ] = {
                "kind": "game", "owner": "Lessons" if href.startswith("/Lessons/") else "Website",
                "label": str(game.get("title", href)),
            }
            targets["https://madebymatt.uk" + urllib.parse.quote(art, safe="/%()") ] = {
                "kind": "art", "owner": "Website", "label": art,
            }
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            futures = {pool.submit(self._fetch_url, url, False): (url, meta) for url, meta in targets.items()}
            for future in concurrent.futures.as_completed(futures):
                url, meta = futures[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
                result.update({"url": url, **meta})
                self.live_results.append(self._json_safe(result))
                if not result.get("ok"):
                    self.add("error", "Live/Deployment", "live", str(meta["label"]), f"Live {meta['kind']} URL is unavailable", details=result)
        for repo in ("MattRoper1977/Games", "MattRoper1977/mattroper1977.github.io", "MattRoper1977/Lessons"):
            self._pages_api(repo)
        census = [row for row in self.live_results if row.get("kind") in {"arcade", "game", "art"}]
        self.metadata["live_status_counts"] = dict(Counter("pass" if row.get("ok") else "fail" for row in census))
        self.metadata["live_census_count"] = len(census)

    def _published_bytes(self, rel: str) -> bytes | None:
        proc = subprocess.run(["git", "show", f"{self.published_ref}:{rel}"], cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode == 0:
            return proc.stdout
        self.add("warning", "Games", "live", rel, f"Could not read {self.published_ref}; live comparison used the working tree", details=proc.stderr.decode("utf-8", "replace"), blocking=False)
        try:
            return (self.root / rel).read_bytes()
        except OSError:
            return None

    def _pages_api(self, repo: str) -> None:
        token = os.environ.get("GITHUB_TOKEN", "")
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "games-estate-audit"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
        for suffix, kind in (("pages", "pages-config"), ("pages/builds/latest", "pages-latest-build")):
            url = f"https://api.github.com/repos/{repo}/{suffix}"
            request = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    data = json.loads(response.read().decode("utf-8"))
                record = {"kind": kind, "repo": repo, "ok": True, "status": response.status, "data": data}
                self.live_results.append(record)
                if kind == "pages-config" and repo.endswith("/Games"):
                    source = data.get("source") or {}
                    branch = source.get("branch")
                    if branch and branch != "main":
                        self.add("error", "Live/Deployment", "pages", repo, f"Games Pages source branch is {branch}, not main")
                if kind == "pages-latest-build":
                    status = str(data.get("status", "")).lower()
                    if status and status not in {"built", "success"}:
                        self.add("error", "Live/Deployment", "pages", repo, f"Latest Pages build status is {status}")
            except urllib.error.HTTPError as exc:
                self.live_results.append({"kind": kind, "repo": repo, "ok": False, "status": exc.code, "error": str(exc)})
                self.add("warning", "Live/Deployment", "pages", repo, f"Could not read {kind} API evidence (HTTP {exc.code})", blocking=False)
            except Exception as exc:
                self.live_results.append({"kind": kind, "repo": repo, "ok": False, "error": str(exc)})
                self.add("warning", "Live/Deployment", "pages", repo, f"Could not read {kind} API evidence", details=str(exc), blocking=False)

    @staticmethod
    def _fetch_url(url: str, full: bool = False) -> dict[str, Any]:
        transient = {429, 500, 502, 503, 504}
        started = time.monotonic()
        last: dict[str, Any] = {}
        for attempt in range(1, 4):
            result = Audit._fetch_url_once(url, full)
            result["attempts"] = attempt
            if result.get("ok") or result.get("status") not in transient:
                result["elapsed_total_ms"] = round((time.monotonic() - started) * 1000)
                return result
            last = result
            if attempt < 3:
                time.sleep(0.35 * attempt)
        last["attempts"] = 3
        last["elapsed_total_ms"] = round((time.monotonic() - started) * 1000)
        return last

    @staticmethod
    def _fetch_url_once(url: str, full: bool = False) -> dict[str, Any]:
        headers = {"User-Agent": "GamesEstateAudit/1.0", "Accept": "*/*"}
        method = "GET" if full else "HEAD"
        request = urllib.request.Request(url, method=method, headers=headers)
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read() if full else b""
                return {
                    "ok": 200 <= response.status < 400,
                    "status": response.status,
                    "final_url": response.geturl(),
                    "content_type": response.headers.get("Content-Type", ""),
                    "content_length": response.headers.get("Content-Length"),
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                    "body": body,
                }
        except urllib.error.HTTPError as exc:
            if method == "HEAD" and exc.code in {403, 405}:
                fallback = urllib.request.Request(url, method="GET", headers={**headers, "Range": "bytes=0-0"})
                try:
                    with urllib.request.urlopen(fallback, timeout=25) as response:
                        response.read(1)
                        return {"ok": 200 <= response.status < 400, "status": response.status, "final_url": response.geturl(), "content_type": response.headers.get("Content-Type", ""), "elapsed_ms": round((time.monotonic() - started) * 1000)}
                except Exception as fallback_exc:
                    return {"ok": False, "status": getattr(fallback_exc, "code", None), "error": str(fallback_exc), "elapsed_ms": round((time.monotonic() - started) * 1000)}
            return {"ok": False, "status": exc.code, "error": str(exc), "elapsed_ms": round((time.monotonic() - started) * 1000)}
        except Exception as exc:
            return {"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}", "elapsed_ms": round((time.monotonic() - started) * 1000)}

    def _write_outputs(self) -> None:
        self.metadata["generated_at_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
        self.metadata["blocking_issue_count"] = self.blocking_count
        self.metadata["issue_counts"] = dict(Counter(issue.severity for issue in self.issues))
        self.metadata["issue_owner_counts"] = dict(Counter(issue.owner for issue in self.issues))
        self._write_json("metadata.json", self.metadata)
        self._write_json("manifest-analysis.json", self.manifest_analysis)
        self._write_json("validator-results.json", self.validator_results)
        self._write_json("site-checks.json", self.site_checks)
        self._write_json("browser-results.json", self.browser_results)
        self._write_json("live-results.json", self.live_results)
        self._write_json("issues.json", [issue.as_dict() for issue in self.issues])
        self._write_inventory_csv()
        self._write_issues_csv()
        (self.output / "GAMES_ESTATE_AUDIT_REPORT.md").write_text(self._render_report(), encoding="utf-8")
        (self.output / "PATCH_PLAN.md").write_text(self._render_patch_plan(), encoding="utf-8")
        manifest = {
            "games_commit": self.metadata.get("games_commit"),
            "site_commit": self.metadata.get("site_commit"),
            "lessons_commit": self.metadata.get("lessons_commit"),
            "generated_at_utc": self.metadata.get("generated_at_utc"),
            "blocking_issue_count": self.blocking_count,
            "files": [],
        }
        for path in sorted(self.output.iterdir()):
            if path.is_file() and path.name not in {"download-manifest.json", "checksums.sha256"}:
                manifest["files"].append({"name": path.name, "bytes": path.stat().st_size, "sha256": self._sha256(path)})
        (self.output / "download-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        lines = []
        for path in sorted(self.output.iterdir()):
            if path.is_file() and path.name != "checksums.sha256":
                lines.append(f"{self._sha256(path)}  {path.name}")
        (self.output / "checksums.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")

    def _write_json(self, name: str, value: Any) -> None:
        (self.output / name).write_text(json.dumps(self._json_safe(value), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def _write_inventory_csv(self) -> None:
        with (self.output / "inventory.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["path", "bytes", "extension", "sha256", "zero_bytes"])
            writer.writeheader()
            writer.writerows(sorted(self.inventory, key=lambda row: row["path"]))

    def _write_issues_csv(self) -> None:
        with (self.output / "issues.csv").open("w", encoding="utf-8", newline="") as handle:
            fields = ["severity", "blocking", "owner", "category", "path", "line", "message", "details"]
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for issue in sorted(self.issues, key=lambda item: (not item.blocking, item.owner, item.category, item.path, item.line or 0)):
                row = issue.as_dict()
                row["details"] = json.dumps(self._json_safe(row["details"]), ensure_ascii=False) if row["details"] is not None else ""
                writer.writerow(row)

    def _render_report(self) -> str:
        counts = Counter(issue.severity for issue in self.issues)
        browser_counts = self.metadata.get("browser_status_counts", {})
        live_counts = self.metadata.get("live_status_counts", {})
        pass1_blockers = sum(1 for issue in self.issues if issue.blocking and issue.category not in {"browser", "live", "pages"})
        browser_blockers = sum(1 for issue in self.issues if issue.blocking and issue.category == "browser")
        publication_blockers = sum(1 for issue in self.issues if issue.blocking and issue.category in {"live", "pages"})
        lines = [
            "# Games estate audit",
            "",
            f"- **Games commit:** `{self.metadata.get('games_commit', 'unknown')}`",
            f"- **Website commit (read-only):** `{self.metadata.get('site_commit', 'unknown')}`",
            f"- **Lessons commit (read-only):** `{self.metadata.get('lessons_commit', 'unknown')}`",
            f"- **Generated:** {self.metadata.get('generated_at_utc', '')}",
            f"- **Tracked Games files examined:** {self.metadata.get('tracked_file_count', 0):,}",
            f"- **Manifest entries (derived):** {self.metadata.get('manifest_entry_count', 0):,}",
            f"- **Blocking findings:** {self.blocking_count:,}",
            f"- **All findings:** {counts.get('error', 0)} errors · {counts.get('warning', 0)} warnings · {counts.get('info', 0)} information notes",
            "",
            "## Pass status",
            "",
            "| Pass | Evidence | Result |",
            "|---|---|---|",
            f"| 1 · repository files and contracts | inventory, syntax, manifest derivation, {len(self.validator_results)} existing validators | {'PASS' if pass1_blockers == 0 else 'FINDINGS'} |",
            f"| 2 · webpage execution | {self.metadata.get('browser_result_count', 0):,} browser executions; {browser_counts} | {'PASS' if browser_blockers == 0 and browser_counts.get('pass') else 'FINDINGS/UNVERIFIED'} |",
            f"| 3 · publication and wiring | live census {live_counts}; exact manifest hash; site.json and arcade consumer | {'PASS' if publication_blockers == 0 and live_counts.get('pass') else 'FINDINGS/UNVERIFIED'} |",
            "| 4 · review bundle | reports, ledgers, patch plan, checksums and workflow patch | READY |",
            "",
            "## Derived manifest census",
            "",
            f"- Website-root games: **{self.manifest_analysis.get('host_counts', {}).get('Website root', 0)}**",
            f"- Lessons-hosted games: **{self.manifest_analysis.get('host_counts', {}).get('Lessons', 0)}**",
            f"- Featured cards: **{self.manifest_analysis.get('featured_count', 0)}**",
            f"- Hero holder(s): {', '.join(self.manifest_analysis.get('hero_titles', [])) or 'none'}",
            f"- Exact `NEW ·` prefix cards: **{self.manifest_analysis.get('new_prefix_count', 0)}**",
            "",
            "## Findings",
            "",
        ]
        if not self.issues:
            lines.append("No findings were recorded.")
        else:
            lines.extend(["| Severity | Blocking | Owner | Category | Path | Line | Finding |", "|---|---:|---|---|---|---:|---|"])
            for issue in sorted(self.issues, key=lambda item: (not item.blocking, {"error": 0, "warning": 1, "info": 2}.get(item.severity, 3), item.owner, item.path, item.line or 0))[:500]:
                message = issue.message.replace("|", "\\|").replace("\n", " ")
                lines.append(f"| {issue.severity.upper()} | {'yes' if issue.blocking else 'no'} | {issue.owner} | {issue.category} | `{issue.path.replace('|', '\\|')}` | {issue.line or ''} | {message} |")
            if len(self.issues) > 500:
                lines.extend(["", f"The table is capped at 500 of {len(self.issues):,} findings. `issues.csv` and `issues.json` contain the complete ledger."])
        lines.extend([
            "",
            "## Evidence files",
            "",
            "- `inventory.csv` — every tracked Games path and SHA-256.",
            "- `manifest-analysis.json` — derived counts, tags, hosts and conventions.",
            "- `validator-results.json` — existing contract output.",
            "- `browser-results.json` — arcade and every game in both browser profiles.",
            "- `live-results.json` — exact manifest comparison, game/art census and Pages evidence.",
            "- `site-checks.json` — dependency ownership and `site.json` wiring.",
            "- `PATCH_PLAN.md` — review grouping without an automatic content rewrite.",
            "- `download-manifest.json` and `checksums.sha256` — bundle integrity.",
            "",
            "## Honest limits",
            "",
            "The browser pass proves load, local resource integrity, a visible rendering surface and a conservative first interaction. It does not claim that every multi-level game has been played to completion, every scoring branch is correct, or every pedagogical choice has received human approval. Those require game-specific playtesting after the estate blockers are triaged.",
            "",
        ])
        return "\n".join(lines)

    def _render_patch_plan(self) -> str:
        groups: dict[tuple[str, str], list[Issue]] = defaultdict(list)
        for issue in self.issues:
            if issue.blocking:
                groups[(issue.owner, issue.category)].append(issue)
        lines = [
            "# Games estate patch plan for review",
            "",
            f"Audit base: `{self.metadata.get('games_commit', 'unknown')}`",
            "",
            "The audit does not rewrite the manifest or either dependency. Proven blocking findings are grouped below by owning repository and defect family so Matt and Claude can approve small, independent patches.",
            "",
        ]
        if not groups:
            lines.append("No blocking patch family is required by this run.")
        else:
            for (owner, category), issues in sorted(groups.items()):
                lines.extend([f"## {owner} · {category} ({len(issues)})", ""])
                for issue in sorted(issues, key=lambda item: (item.path, item.line or 0))[:100]:
                    suffix = f":{issue.line}" if issue.line else ""
                    lines.append(f"- `{issue.path}{suffix}` — {issue.message}")
                if len(issues) > 100:
                    lines.append(f"- … {len(issues) - 100} more in `issues.csv`.")
                lines.append("")
        lines.extend([
            "## Landing discipline",
            "",
            "1. One owner and defect family per commit.",
            "2. A manifest/content PR must not edit the validator that judges it.",
            "3. Re-derive counts and comparisons from the current base immediately before landing.",
            "4. Keep website and Lessons repairs in their owning repositories and separate PRs.",
            "5. Re-run this audit after each approved patch and retain the evidence artifact.",
            "",
        ])
        return "\n".join(lines)

    @staticmethod
    def _looks_text(data: bytes) -> bool:
        if not data:
            return True
        sample = data[:8192]
        if b"\x00" in sample:
            return False
        controls = sum(1 for byte in sample if byte < 9 or 13 < byte < 32)
        return controls / max(1, len(sample)) < 0.02

    def _decode_text(self, rel: str, data: bytes) -> str:
        try:
            return data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            self.add("warning", "Games", "encoding", rel, "Text is not UTF-8; decoded as Windows-1252 for audit", line=data[:exc.start].count(b"\n") + 1, blocking=False)
            return data.decode("cp1252", "replace")

    @staticmethod
    def _sha256(path: pathlib.Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if isinstance(value, bytes):
            return f"<{len(value)} bytes>"
        if dataclasses.is_dataclass(value):
            return Audit._json_safe(dataclasses.asdict(value))
        if isinstance(value, dict):
            return {str(key): Audit._json_safe(child) for key, child in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [Audit._json_safe(child) for child in value]
        return value


class CombinedHandler(http.server.SimpleHTTPRequestHandler):
    games_root: pathlib.Path
    site_root: pathlib.Path
    lessons_root: pathlib.Path

    def translate_path(self, path: str) -> str:
        decoded = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if decoded == "/Games":
            decoded = "/Games/"
        if decoded == "/Lessons":
            decoded = "/Lessons/"
        if decoded.startswith("/Games/"):
            root = self.games_root
            relative = decoded[len("/Games/"):]
        elif decoded.startswith("/Lessons/"):
            root = self.lessons_root
            relative = decoded[len("/Lessons/"):]
        else:
            root = self.site_root
            relative = decoded.lstrip("/")
        normal = posixpath.normpath(relative)
        parts = [part for part in normal.split("/") if part not in {"", ".", ".."}]
        return str(root.joinpath(*parts))

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class CombinedServer:
    def __init__(self, games_root: pathlib.Path, site_root: pathlib.Path, lessons_root: pathlib.Path) -> None:
        handler = type("GamesEstateHandler", (CombinedHandler,), {
            "games_root": games_root, "site_root": site_root, "lessons_root": lessons_root,
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


ERROR_HOOK_JS = r"""
(() => {
  window.__gamesEstateErrors = [];
  const push = (kind, value, url='') => {
    try {
      const text = typeof value === 'string' ? value : (value && (value.stack || value.message)) || String(value);
      window.__gamesEstateErrors.push({kind, message:text.slice(0,2000), url:String(url || '').slice(0,2000)});
    } catch (_) {}
  };
  window.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window && target !== document) {
      const url = target.currentSrc || target.src || target.href ||
        (target.getAttribute && (target.getAttribute('src') || target.getAttribute('href'))) || '';
      push('resource', target.tagName || 'RESOURCE', url);
      return;
    }
    push('error', event.error || event.message || 'unknown window error');
  }, true);
  window.addEventListener('unhandledrejection', event => push('unhandledrejection', event.reason), true);
})();
"""

SURFACE_JS = r"""
return (() => {
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
  };
  const canvases = [...document.querySelectorAll('canvas')];
  const nonZeroCanvas = canvases.some(c => c.width > 0 && c.height > 0 && visible(c));
  const text = document.body ? (document.body.innerText || '').trim() : '';
  const renderable = [...document.querySelectorAll('img,svg,video,iframe,model-viewer')].some(visible);
  return {
    ready_state: document.readyState,
    title: document.title,
    has_surface: !!document.body && (text.length > 0 || renderable || nonZeroCanvas),
    body_text_length: text.length,
    canvas_count: canvases.length,
    non_zero_canvas: nonZeroCanvas,
    all_grid_cards: document.querySelectorAll('#allGrid .gcard').length,
    visible_buttons: [...document.querySelectorAll('button,[role=button]')].filter(visible).length,
    viewport_width: window.innerWidth,
    document_width: document.documentElement ? document.documentElement.scrollWidth : 0,
    horizontal_overflow_px: document.documentElement ? Math.max(0, document.documentElement.scrollWidth - window.innerWidth) : 0,
  };
})();
"""

SAFE_INTERACTION_JS = r"""
return (() => {
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return !el.disabled && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const safe = /\b(start|play|begin|continue|launch|enter|ready|new game)\b/i;
  const bad = /\b(delete|remove|reset|clear|erase|wipe|submit|send|buy|purchase|logout|sign out|quit)\b/i;
  const target = [...document.querySelectorAll('button,[role=button]')].find(el => {
    if (!visible(el)) return false;
    const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim();
    return safe.test(text) && !bad.test(text);
  }) || null;
  if (!target) return {clicked:false, reason:'no conservative start/play control'};
  const label = (target.innerText || target.getAttribute('aria-label') || target.id || target.className || target.tagName).toString().trim().slice(0,200);
  return {clicked:false, label, element:target};
})();
"""


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--site-root", required=True)
    parser.add_argument("--lessons-root", required=True)
    parser.add_argument("--output", default="audit-output")
    parser.add_argument("--published-ref", default="origin/main")
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--browser-modes", default="desktop,mobile-reduced")
    parser.add_argument("--page-timeout", type=float, default=20.0)
    parser.add_argument("--settle", type=float, default=0.45)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    modes = [mode.strip() for mode in args.browser_modes.split(",") if mode.strip()]
    audit = Audit(
        pathlib.Path(args.repo_root), pathlib.Path(args.site_root), pathlib.Path(args.lessons_root),
        pathlib.Path(args.output), args.published_ref,
    )
    try:
        return audit.run(args.browser, args.live, modes, args.page_timeout, args.settle)
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        audit.add("error", "Runner", "audit", "<estate>", "Unhandled audit failure", details=f"{type(exc).__name__}: {exc}")
        with contextlib.suppress(Exception):
            audit._write_outputs()
        raise


if __name__ == "__main__":
    raise SystemExit(main())
