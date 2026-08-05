#!/usr/bin/env python3
"""Policy-correct entry point for the Games estate audit.

The base engine is deliberately generic. This wrapper carries repository policy:
retired one-shot contracts are inventoried but not executed, release-marker
ownership is checked across the whole shelf, and browser interactions must be
unobscured before WebDriver attempts a real click.
"""

from __future__ import annotations

import contextlib
import pathlib
import re
import sys
import traceback
from typing import Any, Sequence

import audit as base


# `apexpool-sports-verify.yml` says RETIRED — dispatch only. Its verifier
# describes a historical transition and cannot be treated as a current invariant.
base.ACTIVE_VALIDATORS = [
    ("canonical manifest contract", ["bash", "tools/validate_games_json.sh", "games.json", "{LESSONS}"]),
    ("Sports rail contract", ["node", "tools/verify_sports_rail.js"]),
    ("Echo Vault shelf contract", ["node", "tools/verify_echovault_shelf.js"]),
    ("Relicforge shelf contract", ["node", "tools/verify_relicforge_shelf.js"]),
]

# The generic selector's CSS visibility test can still choose a control covered by
# an onboarding layer. A real pointer cannot click it, so require centre-point hit
# testing and let WebDriver perform the click; JavaScript never clicks the target.
base.SAFE_INTERACTION_JS = r"""
return (() => {
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return !el.disabled && s.display !== 'none' && s.visibility !== 'hidden' &&
      Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0 &&
      r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const unobscured = el => {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top));
  };
  const safe = /\b(start|play|begin|continue|launch|enter|ready|new game|next|got it|close)\b/i;
  const bad = /\b(delete|remove|reset|clear|erase|wipe|submit|send|buy|purchase|logout|sign out|quit)\b/i;
  const candidates = [...document.querySelectorAll('button,[role=button]')];
  const target = candidates.find(el => {
    if (!visible(el) || !unobscured(el)) return false;
    const text = (el.innerText || el.getAttribute('aria-label') || el.title || '').trim();
    return safe.test(text) && !bad.test(text);
  }) || null;
  if (!target) return {clicked:false, reason:'no conservative unobscured start/play control'};
  const label = (target.innerText || target.getAttribute('aria-label') || target.id || target.className || target.tagName).toString().trim().slice(0,200);
  return {clicked:false, label, element:target};
})();
"""


class PolicyAudit(base.Audit):
    def _inventory_and_validate(self, files: Sequence[pathlib.Path]) -> None:
        super()._inventory_and_validate(files)
        self._check_workflow_pipeline_safety()

    def _validate_manifest(self) -> None:
        super()._validate_manifest()
        if not self.games:
            return
        prefix = "NEW · "
        title_holders = [str(game.get("title")) for game in self.games if str(game.get("title", "")).startswith(prefix)]
        description_holders = [str(game.get("title")) for game in self.games if str(game.get("desc", "")).startswith(prefix)]
        self.manifest_analysis["new_title_holders"] = title_holders
        self.manifest_analysis["legacy_new_description_holders"] = description_holders
        self.manifest_analysis["new_marker_claim_count_across_fields"] = len(title_holders) + len(description_holders)
        if title_holders and description_holders:
            self.add(
                "warning", "Games", "convention", "games.json",
                "The NEW · release marker is split across title and description fields, so two mechanisms can claim the slot without seeing one another",
                details={"title_holders": title_holders, "description_holders": description_holders},
                blocking=False,
            )
        if len(description_holders) > 1:
            self.add(
                "warning", "Games", "convention", "games.json",
                "More than one description carries the legacy NEW · prefix",
                details=description_holders,
                blocking=False,
            )
        self._check_release_marker_gate_ownership()

    def _check_release_marker_gate_ownership(self) -> None:
        ephemeral_checks = []
        for rel in ("tools/verify_echovault_shelf.js", "tools/verify_relicforge_shelf.js"):
            path = self.root / rel
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if re.search(r"title\.startsWith\(['\"]NEW · ['\"]\)", text):
                ephemeral_checks.append(rel)
        if ephemeral_checks:
            self.add(
                "warning", "Games", "validator", "tools/",
                "Per-game shelf validators permanently require their own card to hold the ephemeral NEW · release marker",
                details=ephemeral_checks,
                blocking=False,
            )
        transform = self.root / "tools/apply_apexrally_manifest.py"
        if transform.is_file():
            text = transform.read_text(encoding="utf-8", errors="replace")
            if "move the `NEW · ` prefix onto Apex Rally" in text or "desc.startswith(NEW_PREFIX)" in text:
                self.add(
                    "warning", "Games", "transform", "tools/apply_apexrally_manifest.py",
                    "The Apex Rally idempotency transform still owns the legacy description-based NEW · marker, conflicting with newer title-based shelf entries",
                    blocking=False,
                )

    def _record_browser_issue(self, result: dict[str, Any], owner: str, path: str) -> None:
        super()._record_browser_issue(result, owner, path)
        interaction = result.get("interaction") or {}
        reason = str(interaction.get("reason", ""))
        if reason and not reason.startswith("no conservative unobscured"):
            self.add(
                "warning", owner, "browser-interaction", path,
                f"The conservative desktop interaction could not be exercised in {result.get('mode')}",
                details={"label": interaction.get("label"), "reason": reason},
                blocking=False,
            )

    def _check_workflow_pipeline_safety(self) -> None:
        workflow_root = self.root / ".github" / "workflows"
        if not workflow_root.is_dir():
            return
        for path in sorted(workflow_root.glob("*.y*ml")):
            rel = path.relative_to(self.root).as_posix()
            text = path.read_text(encoding="utf-8", errors="replace")
            lines = text.splitlines()
            for index, line in enumerate(lines):
                if "| tee" not in line:
                    continue
                # A pipeline is safe when its own run block enables pipefail.
                # Looking only inside the current indented block avoids crediting
                # an unrelated step elsewhere in the workflow.
                indent = len(line) - len(line.lstrip())
                start = index
                while start > 0:
                    previous = lines[start - 1]
                    if previous.strip() and len(previous) - len(previous.lstrip()) < indent:
                        break
                    start -= 1
                end = index + 1
                while end < len(lines):
                    following = lines[end]
                    if following.strip() and len(following) - len(following.lstrip()) < indent:
                        break
                    end += 1
                block = "\n".join(lines[start:end])
                if re.search(r"\b(?:set\s+-[^\n]*o\s+pipefail|set\s+-o\s+pipefail)\b", block):
                    continue
                self.add(
                    "warning", "Games", "workflow", rel,
                    "A command is piped through tee without pipefail in the same run block; that step masks the upstream exit code even though a later log-consistency step currently rechecks the result",
                    line=index + 1,
                    details=line.strip(),
                    blocking=False,
                )


def main(argv: Sequence[str] | None = None) -> int:
    args = base.parse_args(argv or sys.argv[1:])
    modes = [mode.strip() for mode in args.browser_modes.split(",") if mode.strip()]
    audit = PolicyAudit(
        pathlib.Path(args.repo_root), pathlib.Path(args.site_root), pathlib.Path(args.lessons_root),
        pathlib.Path(args.output), args.published_ref,
    )
    try:
        return audit.run(args.browser, args.live, modes, args.page_timeout, args.settle)
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        audit.add(
            "error", "Runner", "audit", "<estate>", "Unhandled audit failure",
            details=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
        )
        with contextlib.suppress(Exception):
            audit._write_outputs()
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
