#!/usr/bin/env bash
# Shared by pin-release.yml and play-domain-publication.yml. Source it; do not execute it.
#
# WHY. build_publications.py builds BOTH publications in one invocation, and the education
# front door binds Lessons files by digest (homepage-feature.json). This repository builds
# new-Site-against-old-Lessons and old-Site-against-new-Lessons on purpose, to compare the two
# trees a pin move would publish. Every such cross build died on
#
#   ValueError: homepage-feature.json is stale against the Lessons checkout: pack-build-science-w8a
#
# which is an education card Play does not serve: render_page() sends only home/teachers/pupils
# into education_frontdoors, and try_lesson() runs only for kind == 'home'. That is what stalled
# the Play pin at Site 88c39cb7 while Site main moved four merges past it.
#
# Site 983381d5 added --publication; passing 'games' skips the education front doors. A pinned
# Site older than that has no such flag and must be invoked exactly as it always was, so the
# scope is chosen by CAPABILITY, by asking the builder itself, never by comparing versions.
#
# remove once both Games pins >= Site 983381d5
#
# usage: flag=$(site_build_scope <builder-path> <tree-label> <site-sha>)
#   prints '--publication games' when the builder supports it, nothing when it does not.
#   A --help failure is fatal and returns non-zero: a broken builder must fail the step, it
#   must never be read as "this tree simply predates the flag".
site_build_scope() {
  local builder="$1" label="$2" sha="$3" help
  if ! help="$(python "$builder" --help 2>&1)"; then
    {
      echo "site_build_scope: '$builder --help' failed for ${label} Site ${sha}"
      printf '%s\n' "$help"
    } >&2
    return 1
  fi
  if printf '%s' "$help" | grep -q -- '--publication'; then
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      printf 'SCOPED: %s Site %s --publication games\n' "$label" "$sha" >> "$GITHUB_STEP_SUMMARY"
    fi
    printf '%s' '--publication games'
    return 0
  fi
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf 'UNSCOPED: %s Site %s predates --publication\n' "$label" "$sha" >> "$GITHUB_STEP_SUMMARY"
  fi
  printf '%s' ''
}

# Run a command, keep its combined output, and on failure put the step name and the first error
# line into the job summary. The pin release's "Build both trees" failure was invisible for days
# because the logs API returns only a job's tail; this makes the cause readable on the run page.
run_logged() {
  local label="$1"; shift
  local log code first
  log="/tmp/pin-release-$(printf '%s' "$label" | tr -c 'A-Za-z0-9' '-').log"
  # && / || so `set -e` does not abort before the status is captured, and process
  # substitution so a long build still streams to the live log.
  "$@" > >(tee "$log") 2>&1 && code=0 || code=$?
  wait
  [ "$code" -eq 0 ] && return 0
  # The LAST error-ish line, not the first: a Python traceback opens with
  # "Traceback (most recent call last):" and ends with the exception that actually says why.
  first="$(grep -E '^[A-Za-z_.]*(Error|Exception)|error:|assert' "$log" | tail -1 || true)"
  [ -n "$first" ] || first="$(grep -m1 . "$log" || true)"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### FAILED: ${label}"
      echo ''
      echo '```'
      printf '%s\n' "$first"
      echo '```'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  echo "FAILED: ${label}: ${first}" >&2
  return "$code"
}
