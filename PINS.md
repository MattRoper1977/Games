# Pins — how Play follows its sources

`play-publication.json` names the exact Site and Lessons commits the Play site
(madebymatt-play.uk) is built from. Nothing reaches Play by being merged into
Site or Lessons; it reaches Play when this file moves and the publication
workflow deploys the tree built at the new pin. That is the contract, and it
is why a merged game fix can be "on main" and still not "served".

## Policy (Order HC3 §3.1)

1. **A pin is never edited by hand.** The `Pin release` workflow
   (`.github/workflows/pin-release.yml`) opens the PR, and a person reads it.
2. **One PR per source repository**, on the fixed branches `pin-release/site`
   and `pin-release/lessons`. A newer HEAD re-points the same branch; it never
   opens a second PR for the same source.
3. **The gates run BEFORE the PR opens, on the tree the pin would publish**,
   and the current pin's tree is built beside it on the same runner so every
   judgement is "did this pin make a route worse", never "is this game fast":
   - the publication build itself: 69 payloads, 0 missing and 0 external
     initial-load references, `games.json` byte-identical to the shelf, CNAME;
   - `check_game_saves.cjs` (save-transfer boundaries);
   - this repository's shelf contracts: `validate_games_json.sh` against the
     proposed Lessons tree and every `tools/verify_*_shelf.js` / sports rail;
   - the Play browser acceptance (`domain-split/play/check.cjs`) served from the
     proposed tree: layout at four widths, search, favourites, saves, dialog
     focus, no-JS links, and all 69 rendered start surfaces;
   - the idle-repaint and frame-rate gate (`tools/play_perf_gate.mjs`): RED when
     a route paints more than max(1.5×, +10) frames at idle, drops below 70 % of
     a ≥30 fps rate, or starts throwing. It proves itself on two planted
     defects on every run before it judges a real tree.
4. **When the repository denies PR creation (HC4 §5.2).** Until the owner ticks
   Settings → Actions → General → Workflow permissions → "Allow GitHub Actions
   to create and approve pull requests" (M3), the workflow (a) leaves the staged
   branch exactly as pushed — a staged branch whose pin already equals the
   source HEAD is never overwritten; it is re-staged only when the source moved —
   (b) opens or updates ONE issue titled "Pin bump staged — awaiting M3" with the
   branch, both SHAs and the gate results, and (c) exits green with a job
   summary. Green there means "staged and recorded", never "merged" or "served".
5. **The workflow opens PRs only; it never merges (ruling rg).** No run of
   any event or input calls a merge API, enables auto-merge or merges a
   branch: merging a pin PR is a ruled action by a person. After the PR opens,
   the required checks (`contract`, `aggregate`) are dispatched on the branch
   so their check runs land on the PR head (a push by the workflow token fires
   no `pull_request` run), and the run summary reports them. Full green leaves
   the PR open, "not merged"; any red leaves it open with the failing check
   named in the run summary — that PR is the actionable item, not a silent
   retry. A pin whose PR was closed unmerged — the same head SHA or the same
   target pin — is held: the run opens nothing, updates nothing and stays
   green. A merged PR never holds a pin, and a moved source opens a new PR.
   While a pin-release PR is open on a source's branch, that source's run is
   held from its first step: nothing is built, staged, force-pushed, updated
   or merged, so the open PR's head, title and body stay as they are until a
   person acts on it (closes it, or merges it on a ruling).
6. **Merge is not served.** A person's merge to `main` fires the `push`
   publication (`Standalone games website`); the pin is "served" when that
   run's deploy and `verify-published` jobs are green.
7. **The Site preservation baseline.** `check.cjs` asserts every payload's
   hash against `reports/play-upgrade/preservation.json` at the Site pin. A
   Lessons change that alters a game payload therefore reds the gate until the
   Site baseline is refreshed for that route in a reviewed Site change — the
   payload change is reviewed there, once, and the pin follows. The run summary
   names the routes whose payload moved so that review has its list.
7. **Rollback** is the previous pin: the PR body carries both SHAs.

## Cadence

`repository_dispatch` (`event_type: pin-release`) from a source repository, a
six-hourly schedule (`17 */6 * * *` UTC) that catches anything that did not
dispatch, and `workflow_dispatch` for a person. The weekly estate health run
(Site `estate-check-health.yml`) reports each pin's distance from its source
HEAD and the age of the pin commit (§3.4), so a stalled release is named.

## Not automated on purpose

- `games.json` (the shelf) is edited by a reviewed PR here, never by this path.
- The Pages configuration, the domain and DNS: owner actions, never changed.
- A PR carrying Matt's PARKED / DO NOT MERGE / REFERENCE marker is never touched.
