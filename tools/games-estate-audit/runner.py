#!/usr/bin/env python3
"""Policy-correct entry point for the Games estate audit.

The base engine is deliberately generic. This wrapper carries repository policy:
retired one-shot contracts are inventoried but not executed, and workflow
pipelines that can mask an upstream failure are surfaced for review.
"""

from __future__ import annotations

import contextlib
import pathlib
import re
import sys
import traceback
from typing import Sequence

import audit as base


# `apexpool-sports-verify.yml` says RETIRED — dispatch only. Its verifier
# describes a historical transition and cannot be treated as a current invariant.
base.ACTIVE_VALIDATORS = [
    ("canonical manifest contract", ["bash", "tools/validate_games_json.sh", "games.json", "{LESSONS}"]),
    ("Sports rail contract", ["node", "tools/verify_sports_rail.js"]),
    ("Echo Vault shelf contract", ["node", "tools/verify_echovault_shelf.js"]),
    ("Relicforge shelf contract", ["node", "tools/verify_relicforge_shelf.js"]),
]


class PolicyAudit(base.Audit):
    def _inventory_and_validate(self, files: Sequence[pathlib.Path]) -> None:
        super()._inventory_and_validate(files)
        self._check_workflow_pipeline_safety()

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
                    "A command is piped through tee without pipefail in the same run block; the upstream exit code can be masked",
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
