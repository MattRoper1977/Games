# RETIRED — Apex Sports manifest contract

**Retired 5 August 2026.** Recorded here rather than silently deleted, so the
coverage it once provided can be audited rather than assumed.

Files involved:

- `.github/workflows/apexpool-sports-verify.yml` — trigger reduced to
  `workflow_dispatch` only
- `tools/verify_apexpool_sports_manifest.js` — a 489-byte compatibility shim
  that delegates to the file below
- `tools/verify_apextennis_manifest.js` — the gate itself
- `tools/verify_apexpool_sports_browser.js` — **added to this record on 6 August
  2026.** It was always part of this family (the same workflow runs it) but was
  never named here. It is spent for exactly the same reason: it asserts a
  **four-game** Sports rail by href list and a **34-entry** shelf, both of which
  described the estate on the day Apex Tennis landed and neither of which can be
  true again. The rail is five today and the shelf is 41. It was found by a
  derive-don't-pin census, and it is recorded rather than converted — see below.

Both scripts are left in the tree, runnable on demand. Nothing was deleted.

## What it verified

The Apex Tennis landing, as a single moment in the manifest's history: that a
candidate `games.json` was exactly the baseline plus **one** Apex Tennis entry
appended after Apex Golf, with

- the baseline at exactly 33 entries,
- the candidate at exactly baseline + 1,
- every pre-existing entry byte-equivalent,
- the `Physics` tag count up by exactly one,
- a tennis hue distinct from the other three Sports hues,
- and Apex Tennis's own title, href, schema and shipped meta copy exact.

## When it did that job

For **Games#11, "Add Apex Tennis to Arcade Sports"**, merged at `900fae5`.
That pull request and its run history are the evidence pointer: the gate ran
green there, against the inputs it was written for.

## Why it is spent

Those assertions describe a **transition**, not an invariant. The moment Apex
Tennis was in the manifest, "baseline of 33 plus exactly one tennis entry"
stopped being something a later change could satisfy — and could never be true
again.

The gate therefore could not go green under **any** subsequent change:

```
FAIL  baseline-entry-count-measured   34
FAIL  candidate-entry-count-derived   34 -> 37
FAIL  all-existing-entries-byte-equivalent
FAIL  tennis-appended-after-golf
FAIL  physics-count-increases-by-one
FAIL  tennis-hue-distinct-and-new
```

It failed four times on `shelf/biopunkhive-2026-08-04` (4 Aug) and again on the
three-card branch (5 Aug). Because `games.json` sat in its trigger paths, every
future card was going to hit it.

A gate that cannot pass under any change measures nothing — the exact mirror of
a check that can only pass. Both are instruments with a stuck needle. This one
had additionally been *masked*: the workflow's separate `games.length !== 33`
baseline pin failed first, so the deeper defect stayed invisible until that pin
was converted to derive-form and the failure moved one step later.

## What survived, and where it went

Four limbs said something true about **any** manifest, not about one landing.
They are re-homed in `tools/validate_games_json.sh` in derive-form, so this
retirement loses no real coverage:

| Limb | New home |
|---|---|
| `all-entries-carry-art` | art present on every entry |
| `all-titles-and-hrefs-unique` | titles and hrefs unique across the manifest |
| `tag-vocabulary-unchanged` | tag vocabulary **derived** and single-use tags surfaced |
| `no-lessons-contamination` | root-hosted entries may not point art into Lessons |

The tag check changed shape deliberately. The original froze a vocabulary;
the replacement derives it and *surfaces* single-use tags instead of forbidding
new ones. Minting a tag stays possible but becomes a visible decision rather
than an accident — which is what the rule was actually protecting.

The one-shot baseline assertion has no successor. It died with the gate,
by design.

## Reproducing the original contract

```
gh workflow run apexpool-sports-verify.yml     # or the Actions UI
```

It will still assert the Apex Tennis landing against its historical inputs.
It is not wired to judge anything else.


## The 6 August 2026 pin census

A derive-don't-pin sweep of `tools/` and `.github/workflows/` was run to find any
literal count or hash still being asserted as an invariant. Result:

| instrument | verdict |
|---|---|
| `verify_sports_rail.js` | derived — no literal totals |
| `verify_echovault_shelf.js` | derived |
| `verify_relicforge_shelf.js` | derived |
| `validate_games_json.sh` | derived |
| `apply_apexrally_manifest.py` | derived |
| `apply_apextennis_manifest.py` | derived |
| `verify_apextennis_manifest.js` | **pinned (33/34) — retired, left alone** |
| `verify_apexpool_sports_browser.js` | **pinned (34, four-game rail) — retired, named above** |

The `sha256sum` pairs in `apexpool-sports-verify.yml` are before/after
comparisons of the same file within one run — idempotency checks, not pinned
values — and are correct as they stand.

**Why the two pinned gates were not converted.** Converting them would resurrect
a gate this record already explains is spent: both describe a *transition*
(the estate on the day Apex Tennis landed), not an invariant, and a transition
cannot be re-derived into a live contract without inventing a different gate
that happens to share its filename. They stay retired, runnable on demand, as
the audit record this document exists to preserve. Nothing was deleted.
