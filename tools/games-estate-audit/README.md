# Games estate audit

This directory contains a **read-only, four-pass audit** for
`MattRoper1977/Games` and the public arcade surfaces that consume its manifest.
It does not rewrite `games.json`, alter a game, edit the Lessons repository, edit
the website repository, merge a pull request, or publish a replacement file.

The repository is a catalogue and contract estate rather than the storage
location for every game. The audit therefore follows each manifest relationship
without changing the dependency:

- `Games/` is the authority for `games.json` and its validation contracts;
- `mattroper1977.github.io` is checked out read-only for `/games/`, root-hosted
  game directories, card art, `site.json`, and homepage wiring;
- `Lessons` is checked out read-only for `/Lessons/...` game targets.

## Four passes

1. **Repository integrity** — inventory every tracked file; check paths,
   encodings, likely credentials, JSON/YAML/XML/SVG/Python/shell/JavaScript/HTML
   syntax, workflow files, case collisions, and the manifest's derived
   invariants. The canonical existing validators are executed rather than
   replaced.
2. **Web execution** — serve the three checkouts as the real custom-domain
   layout, open the arcade and every manifest game in Chrome in desktop and
   mobile/reduced-motion modes, record runtime errors, local HTTP failures,
   visible rendering surfaces, and one conservative start/play interaction on
   desktop where available.
3. **Publication** — verify `/Games/games.json` byte-for-byte against
   `origin/main`, verify `/games/` consumes it, census every live game and art
   URL, inspect `site.json` game doors, and collect GitHub Pages API evidence
   where permissions permit.
4. **Review bundle** — write human and machine-readable reports, a complete
   issue ledger, inventory, validator output, browser/live evidence, checksums,
   changed-file manifest, and a binary-capable review patch. The Actions artifact
   is retained for 90 days and is uploaded before the workflow enforces failure.

## Standing rules

- **Derive, do not pin.** No expected game count is hard-coded. Counts are read
  from the manifest at the audited commit.
- **Positive controls remain evidence.** Existing contract scripts are run; this
  audit does not weaken or silently replace them.
- **A content change must not edit the gate that judges it.** This branch adds an
  audit instrument only. Any later manifest/content repair belongs in a separate
  review branch.
- **The dependent repositories are read-only.** A finding in `site.json`, a root
  game, a Lessons game, or card art is reported with its owning repository; it is
  not patched from this pull request.
- **A red run is evidence.** The complete bundle is uploaded before the final
  enforcement step. Do not make the instrument green by suppressing a proven
  defect.

## Local run

Requirements: Python 3.11+, Node.js, Bash, Git, Chrome/Chromium and the Python
packages below.

```bash
python3 -m pip install -r tools/games-estate-audit/requirements.txt

git fetch --no-tags origin main:refs/remotes/origin/main
git clone --depth 1 https://github.com/MattRoper1977/mattroper1977.github.io.git _site
git clone --depth 1 https://github.com/MattRoper1977/Lessons.git _lessons

python3 tools/games-estate-audit/audit.py \
  --repo-root . \
  --site-root _site \
  --lessons-root _lessons \
  --output audit-output \
  --published-ref origin/main \
  --browser \
  --live
```

## Output contract

- `GAMES_ESTATE_AUDIT_REPORT.md` — measured executive result.
- `PATCH_PLAN.md` — blocking findings grouped by owner and defect family.
- `issues.csv` / `issues.json` — complete issue ledger.
- `inventory.csv` — every tracked Games path, size, hash and format.
- `manifest-analysis.json` — derived entry, tag, host, art and convention census.
- `validator-results.json` — canonical and active contract execution evidence.
- `browser-results.json` — local arcade and per-game browser results.
- `live-results.json` — exact publication comparison and live URL census.
- `site-checks.json` — `site.json`, arcade consumer and dependency resolution.
- `metadata.json`, `download-manifest.json`, `checksums.sha256` — provenance and
  package integrity.
- `review.patch`, `changed-files.txt`, `repository-state.txt` — added by Actions.

## Test the instrument

```bash
python3 -m unittest discover -s tools/games-estate-audit/tests -v
python3 -m py_compile tools/games-estate-audit/audit.py
bash -n tools/games-estate-audit/run.sh
```
