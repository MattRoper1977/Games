#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SITE_ROOT="${SITE_ROOT:-$REPO_ROOT/_site}"
LESSONS_ROOT="${LESSONS_ROOT:-$REPO_ROOT/_lessons}"
AUDIT_OUTPUT="${AUDIT_OUTPUT:-$REPO_ROOT/audit-output}"
PUBLISHED_REF="${PUBLISHED_REF:-origin/main}"

for required in "$SITE_ROOT" "$LESSONS_ROOT"; do
  if [[ ! -d "$required" ]]; then
    printf 'Required read-only checkout not found: %s\n' "$required" >&2
    exit 2
  fi
done

args=(
  --repo-root "$REPO_ROOT"
  --site-root "$SITE_ROOT"
  --lessons-root "$LESSONS_ROOT"
  --output "$AUDIT_OUTPUT"
  --published-ref "$PUBLISHED_REF"
)

[[ "${AUDIT_BROWSER:-1}" == "0" ]] || args+=(--browser)
[[ "${AUDIT_LIVE:-1}" == "0" ]] || args+=(--live)
[[ -z "${AUDIT_BROWSER_MODES:-}" ]] || args+=(--browser-modes "$AUDIT_BROWSER_MODES")

exec python3 "$SCRIPT_DIR/audit.py" "${args[@]}"
