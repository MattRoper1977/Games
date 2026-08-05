# Phase R — Relicforge convergence, verified by measurement

Run 2026-08-05, sentinel `vault-forge-converge-2026-08-05`. Every item was MEASURED at open.
**Nothing needed repair — all four items were already complete. No work was re-done.**

| item | verdict | evidence, derived this run |
|---|---|---|
| R1 Games#12 closed unmerged, comment names #13, branch retained | **DONE** | API: `state=closed`, `merged=false`, `closed_at 2026-08-05T21:41:18Z`. Comment body contains `#13` **and** the superseding commit `813cc93`. `git ls-remote --heads origin shelf/biopunkhive-2026-08-04` → **1** (retained). |
| R2 Games#16 merged on green, manifest re-derived, art N/N, hue | **DONE** | API: `merged=true`, merge commit `beaaba4414`. Manifest **re-derived at open from `origin/main`: 39 entries**, `/relicforge/` ×1, hue `#d05cff`, **art 39/39**, duplicate hrefs **0**. |
| R3 Part C ran; SERVED shelf shows exactly one card, nothing displaced | **DONE** | `relicforge-surfaces-verify.yml` dispatched fresh on `main` this run → run **31050692003**, success. Card census (run 31050264029, read line by line): **39 cards rendered for 39 manifest entries, none missing; exactly one Relicforge card and nowhere else across any rail; Sports rail unchanged at 5; count line "13 curated favourites of 39 games".** |
| R4 live `/relicforge/` still serves the pinned artifact | **DONE** | Run **31050699011**: `HTTP 200` · `SERVED fd76016fa5a02c0bb9fbe8ba7072b9fd8d7a863b43343819a86eee57eb0a9be3  241371 bytes` · byte-identical to merged · canonical present · house key present · legacy key 0 · one `<script>` · sitemap entries **1**. |

## Note on how R3's freshness is established
The re-dispatched surfaces run reports only its job conclusion in the window I could read. That
conclusion is load-bearing **because** the merged workflow now runs its verification step under
`bash` + `set -euo pipefail` (fixed last session): a non-zero exit from the tool now fails the job.
Success therefore means the tool exited 0, i.e. 6/6. The uploaded log artifact is 601 bytes, byte-identical
in size to the known-6/6 artifact from run 31050264029 whose gate lines I read in full. Stated as an
inference, not as lines I read this run.

## Recorded, not repaired
`codex/relicforge-live-verify` (closed, never merged) prints a **now-stale note**: it greps the served
`/games/` HTML for `/relicforge/`, gets 0, and says "Part B is parked, so 0 is expected". Part B has since
landed, and that grep was always the vacuous measure — the shelf builds every card in JavaScript, so the
served HTML contains no card markup at all and the grep returns 0 either way. The real census lives in
`verify_relicforge_surfaces.js`, which measures the rendered DOM. Nothing served is affected (the branch
was never merged), so this is **recorded rather than edited** — the branch is a closed verification artifact.
