#!/usr/bin/env bash
# Controls for run_logged's failure reporting (tools/site_build_scope.sh).
#
# WHY. The pin release's "Build both trees" failure was unreadable for days because the logs API
# returns only a job's tail, so run_logged puts the failing step and its error line into the job
# summary. That line has to be the one that says WHY. When a Python parent shells out, its
# traceback ends with subprocess.CalledProcessError -- which says only that a command exited
# non-zero -- while the child's own exception, the one naming the defect, sits above it.
#
# Both paths are asserted here: the inner exception wins when present, and CalledProcessError is
# still reported when it is all there is, so the change re-orders and never drops.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
. tools/site_build_scope.sh

fail=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; fail=1; fi
}

run_case() { # run_case <label> <exit-code> <payload...>  -> prints the summary's quoted line
  local label="$1" want="$2"; shift 2
  local summary; summary="$(mktemp)"
  # run_logged tees the child's output to stdout; this harness only wants the summary and the
  # exit code, so both of the child's streams are discarded. tee still writes the log file.
  GITHUB_STEP_SUMMARY="$summary" run_logged "$label" bash -c "printf '%s\n' \"\$@\"; exit $want" _ "$@" >/dev/null 2>&1
  local code=$?
  printf '%s\n' "$code"
  sed -n '/^```$/,/^```$/p' "$summary" | sed '1d;$d'
  rm -f "$summary"
}

# 1. A Python parent that shelled out: the child's ValueError must win over CalledProcessError.
out="$(run_case 'inner exception wins' 1 \
  'Traceback (most recent call last):' \
  '  File "build_publications.py", line 280, in <module>' \
  'ValueError: homepage-feature.json is stale against the Lessons checkout: pack-build-science-w8a' \
  'Traceback (most recent call last):' \
  '  File "wrapper.py", line 9, in <module>' \
  "subprocess.CalledProcessError: Command '['python','build_publications.py']' returned non-zero exit status 1.")"
check 'inner: exit code preserved' '1' "$(printf '%s' "$out" | sed -n 1p)"
check 'inner: names the child exception' \
  'ValueError: homepage-feature.json is stale against the Lessons checkout: pack-build-science-w8a' \
  "$(printf '%s' "$out" | sed -n 2p)"

# 2. CalledProcessError alone is still reported -- nothing is dropped.
out="$(run_case 'called-process-error alone' 2 \
  'Traceback (most recent call last):' \
  "subprocess.CalledProcessError: Command '['false']' returned non-zero exit status 2.")"
check 'alone: exit code preserved' '2' "$(printf '%s' "$out" | sed -n 1p)"
check 'alone: falls back to CalledProcessError' \
  "subprocess.CalledProcessError: Command '['false']' returned non-zero exit status 2." \
  "$(printf '%s' "$out" | sed -n 2p)"

# 3. Success is still silent and still returns 0.
summary="$(mktemp)"
GITHUB_STEP_SUMMARY="$summary" run_logged 'a passing step' true >/dev/null 2>&1
check 'success: returns 0' '0' "$?"
check 'success: writes no summary' '' "$(cat "$summary")"
rm -f "$summary"

[ "$fail" -eq 0 ] && echo 'PASS run_logged reports the child exception, keeps exit codes, and stays silent on success'
exit "$fail"
