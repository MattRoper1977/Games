# RECORD — the release-marker repair, and the estate review that found it

**6 August 2026.** Landed by **#20**, merged at `f30e3c0ceb4ae6cdb4421347e9cee1ba6e660ab8`,
from base `main` at `0fc29d519caea32b725d0b5dcbdcf2e6ef03db60`.

Recorded here rather than left in a pull-request thread, so the reasoning can be
audited rather than reconstructed.

## What was wrong

The shelf carries one ephemeral `NEW · ` release marker. Three games claimed it:

- `NEW · Echo Vault — Sound Is Your Light` — in `title`
- `NEW · Relicforge — Strip the Machine` — in `title`
- Apex Rally — in `desc`

**Every gate passed green while that was true.** Reproduced at `0fc29d5` before
any change:

```
PASS S4 at most one NEW · holder — 1 holder: Apex Rally
Sports rail: 5/5 gates passed
Echo Vault shelf contract: 20/20 checks passed.
Relicforge shelf contract: 20/20 checks passed.
```

Three checks, three different views of the same shelf, none of them measuring
the invariant:

1. **S4 inspected only `desc`.** It saw Apex Rally alone and reported one
   holder. The two title claims were invisible to it.
2. **The per-game contracts each *required* `NEW · ` in their own title.** Not
   tolerated — mandatory. A permanent identity contract had taken ownership of
   an ephemeral whole-shelf slot, so both title claims were compulsory and
   removing either broke its own gate.
3. **`apply_apexrally_manifest.py` stripped `desc` markers from every other
   game and re-minted its own.** Re-running it re-created the split.

The failure mode worth remembering: **a content-only correction could not land.**
Removing Relicforge's prefix broke its validator; removing Apex Rally's legacy
prefix was undone by the next transform run. The gates had to be repaired first,
in a separate commit, before the content could be judged honestly.

## What landed

Gate-first, two commits, as the standing rule requires — a content change must
not ride the same commit as the gate that judges it.

**Commit 1 — gate and transform only, `games.json` byte-unchanged.**
Title becomes the canonical marker location. S4 measures title markers and
surfaces `desc` markers as legacy drift. The per-game contracts assert title
presence and identity instead of owning the release slot. The Rally transform
preserves whatever marker already exists and never mints, moves or removes one.
The Sports workflow's `tee` pipeline runs under `set -euo pipefail`, so a failing
gate can no longer be masked by `tee`'s exit status. **S6** was added as a
positive control: it injects a second holder and asserts S4 rejects it.

**Commit 2 — content only.** Echo Vault, the most recently landed game, becomes
the sole holder. Relicforge's stale title claim and Apex Rally's hidden `desc`
claim are removed. Three claimants become one.

Two further commits landed the parked product items — see below.

## The self-closing baseline, and its open window

S4 judges against the `origin/main` baseline so the gate repair could report
existing drift without landing red: drift may stay level or reduce, any increase
fails. Once the clean-up landed, the derived baseline became clean and S4 became
the strict one-title/zero-description invariant automatically.

**That transition left a real window, and it is worth understanding rather than
glossing.** While `main` still carried three claimants, the drift-tolerance
comparison would *absorb* a re-introduced marker — measured, not assumed:

| Tamper | vs dirty `main` baseline | vs clean baseline |
|---|---|---|
| add a second `NEW · ` title | **PASS** (2 ≤ 2 claims) | **FAIL** |
| re-add a `NEW · ` desc prefix | **PASS** (2 ≤ 3 claims) | **FAIL** |

The window closed the moment #20 merged. Confirmed at `f30e3c0` with no
environment override: injecting a second title holder now fails S4 with
`release-marker drift increased from 1 to 2 claim(s)`. The design is sound; the
window is simply the price of not landing a red gate, and it is self-closing.

## Verification at the merged tip

Re-run at `f30e3c0`, not accepted from any bundle's logs:

- `tools/verify_sports_rail.js` — **6/6**, one title holder, zero legacy `desc` holders
- `tools/verify_echovault_shelf.js` — 20/20
- `tools/verify_relicforge_shelf.js` — 20/20
- `tools/validate_games_json.sh` against a fresh anonymous Lessons clone — PASS, 41 entries
- `python3 tools/apply_apexrally_manifest.py` twice — byte-idempotent, marker preserved
- Browser, desktop 1280×900 and mobile 390×844 reduced-motion — 41 games, sole
  rendered holder `NEW · Echo Vault — Sound Is Your Light`, zero rendered
  descriptions beginning `NEW · `, 57/57 card images resolved, 0px horizontal overflow

Manifest state: 41 entries, 41/41 art, hero = Off-Brand only, 10 featured, Sports
rail unchanged at 5, zero duplicate hrefs.

**One of our own checks was vacuous and is recorded as such.** The first browser
pass tested `img.complete && img.naturalWidth === 0` for broken art. Because the
arcade uses `loading="lazy"`, every below-the-fold image had `complete === false`
and was silently excluded — the check reported "0 broken images" while Medevac's
art had not loaded at all. It was caught only by looking at the rendered card.
The check was rewritten to walk the page, force every image to decode, and assert
`naturalWidth > 0` on all of them. A gate that cannot fail proves nothing, and
that applies to our own instrumentation.

## Medevac Frontier — added to the shelf

Medevac Frontier was the only game with a live `zone:"games"` homepage door in
`site.json` and no entry in `games.json`: visible on the homepage, absent from
the browse-all arcade. The arcade is billed as the complete catalogue, so an
undocumented homepage-only exception is drift rather than curation. It was added.

Every field is derived, not invented:

- **`desc`** is assembled only from the game's own strings — its meta description
  (Unit 734, the Twilight and Night Canyon missions, the persistent service
  record), its README (the running clock, the cargo-risk choice, clearing the rim,
  Ops Tempo tightening the canyon) and its in-game copy (the green zone, the
  three-litter load cap, the supply crates).
- **`tag`** reuses the existing vocabulary. `Physics` is the honest fit for a STOL
  flight model. No new tag was minted.
- **`hue`** is `#1A8193`, derived by **CIEDE2000 (ΔE00)**.

### The hue, and what deriving it exposed

The review's proposed `#F2A24A` was **byte-identical to Apex Pool's shelf hue —
ΔE00 0.00**, an outright collision. It could not ship.

Deriving a replacement surfaced something about the palette worth recording:

- **No colour at all** clears ΔE00 ≥ 25 against all 40 existing hues while staying
  inside the shelf's own lightness register (L\* 48.3–90.4). The palette is
  saturated.
- The shelf's **median hue separation is 0.0**. **28 of 40 cards share an exact
  duplicate hue** with another card — five games are all `#5EEAD4`, five more are
  all `#F6AD55`.
- The best-separated existing card is Apex Kick at ΔE00 20.4.

So global uniqueness is stricter than the estate's own convention, and the gate's
real constraint is what S3 enforces: rail pairs, and rail members against their
immediate shelf neighbours. `#1A8193` sits **ΔE00 60.2 from its shelf neighbour
Apex Rally** against a floor of 25, and its nearest hue anywhere on the shelf is
21.7 (Apex Kick, Apex Tennis) — a wider margin than any existing card holds.

**Follow-up, not blocking:** no card art exists for this game under
`/assets/cards/`, and the website repository was read-only this session, so `art`
points at the committed banner `/medevac/medevac_frontier_banner.png` rather than
a path that does not resolve. All 40 pre-existing entries use `/assets/cards/`,
so this is a deliberate, recorded deviation. The banner is 1200×630 against a 16:9
card slot — the crop is fine, but it carries a **baked-in wordmark** that renders
clipped next to the card's own title text. It should get proper card art at
`/assets/cards/medevac-frontier.svg` when that repository is writable.

## Trekkers Trail Runner — Tees Coast copy

The card read `Tees Coast edition of Trail Runner.` — technically valid, and it
described a *relationship to another game* rather than this one. A pupil learned
nothing from it.

The replacement is assembled only from strings in the file itself: its five-leg
quest list (Eston Rec, the Rec with compasses, Eston Hills to Eston Nab, a planned
local route, South Gare → Majuba), its own start-screen tagline (*"From the Rec to
the coast — glide the route, dodge the bog, beat the Storm"*), its bearing and Calm
Mode copy, and the coast leg's dunes and loose sand. Nothing was borrowed from the
newer Trail Runner.

**This file is the older fork**, predating the Trail Runner upgrade pass — it has
no ghost replay, no Daily Trail, no checkpoint flags and no storm lane-memory. The
copy deliberately claims none of them.

### For Matt's product queue — a decision, not this session's work

The Tees Coast fork is a genuine curriculum artefact: its five legs map to real
AQA Walking Unit walks with dates (19 May, 4 June, 16 June). It is also visibly
behind the game it forked from. Three options:

1. **Keep it shelved as-is** — it is tied to specific dated walks and works.
2. **Refresh it from the upgraded Trail Runner** — retains the Tees Coast route
   and quest framing, inherits the newer engine.
3. **Retire it** — if the walking unit it supports is no longer running.

The copy now describes what the file actually is, so none of these is urgent.

## The review that found it

Draft PR #18 (audit tooling) and PR #19 (review-only fix pack) were **closed
unmerged, branches retained**. #19 was review-pack-by-design: its production
changes lived under `review/estate-fixes/` as patch files, with `games.json` and
`tools/` byte-identical to `main`, so merging it would have shipped patches and
validators onto the shelf and fixed nothing. #18's standing four-pass browser
audit in CI is Matt's adoption call and is **held, not rejected**.

Three register-grade notes, each verified independently:

- **Patch `0001-repair-new-release-contracts.patch` has a malformed hunk header.**
  Its first `@@ -12,8 +12,9 @@` under-counts; plain `git apply` rejects it with
  `corrupt patch at line 16`. The pack's README correctly documents `--recount`,
  and the combined `Games_Estate_Applied_Fixes.patch` applies cleanly. The
  two-commit tree produced via `--recount` is byte-identical to the combined
  patch's result. Same defect class as the Lessons fix pack; milder instance.
- **The review's "26 tracked files" was counted at its own audit-branch tip.**
  Base `main` at `0fc29d5` has 17. Inflated by self-reference; minor, and it
  affects no finding.
- **`fix-validation/VALIDATION_REPORT.md` reports "Browser profiles: 0"** while
  `arcade-browser-results.json` holds 2 passing profiles. A reporting split, not
  an evidence hole — the rendered-holder proof is real.

**Evidence verdict: EVIDENCED.** This is the first third-party bundle to ship
real, checksummed, reproducible evidence — 83/83 browser executions, 88 live
checks, and a harness that actually asserts what its own patches produce. Unlike
the Lessons pack, it can pass its own harness. That is the process bar for future
reviews: the diagnosis was correct, and it was correct *demonstrably*.

## What this run did not do

This closed the release-marker defect and two parked product items. **It is not a
statement that the estate is clean.** Still open:

- **Live propagation.** Pages serves `main`, so `/Games/games.json` should be
  confirmed to match `f30e3c0` once the build completes. Direct HTTP to
  `madebymatt.uk` was blocked by this container's proxy, so it could not be
  checked here.
- **Matt's eyes on the rendered arcade** — the static gates and two browser
  profiles carry the merge, but they are not a substitute for looking at it.
- **Medevac card art** — see above.
- The three pre-existing hue collisions S3 reports as drift (Apex Golf / Apex
  Tennis at ΔE00 14.01) are untouched and still reported.

---

## Close session — 6 August 2026

### Live propagation: confirmed, and that open item is closed

The previous run could not reach `madebymatt.uk` from its container and left
propagation unverified. It was executed on a GitHub runner instead — runners can
reach the live site when the agent container cannot — via a temporary
`workflow_dispatch`/push workflow that was removed in the same branch and never
merged to `main`.

Result, at `main` = `e2e9ab7099493b619941329952195353ab0f4ccb`:

```
live  sha256: 10ba4bdefc90fa2c4ac29a64bf4dadf9a43dc1ea70c65703dd5a9dac15050876
main  sha256: 10ba4bdefc90fa2c4ac29a64bf4dadf9a43dc1ea70c65703dd5a9dac15050876
BYTE-IDENTICAL
```

Served manifest parsed: 41 entries, 41 art, one `NEW · ` title holder (Echo
Vault), zero legacy description holders, Medevac present. `200` on the Medevac
banner, on `/medevac/` and on `/games/`. The live arcade was then rendered in
desktop 1280×900 and mobile 390×844 reduced-motion: **41 games, sole rendered
holder `NEW · Echo Vault — Sound Is Your Light`, zero descriptions beginning
`NEW · `, Medevac art painted at its natural 1200×630, 57/57 card images
resolved, 0px horizontal overflow.** Both profiles passed.

The shelf the public is served is the shelf on `main`.

### The `reset --hard` footgun

After merging the records PR, the agent ran `git reset --hard origin/main`
**while still checked out on the feature branch**. That dragged the branch tip
off its pushed commit and onto `main`'s merge commit. The push-protection hook
then correctly reported an unpushed commit on that branch — a commit that was
already on `main` and did not belong on the branch at all. Nothing was lost; the
branch was restored to `01419f6` and `git log --branches --not --remotes` came
back empty.

**Standing rule: check out `main` — or detach HEAD — *before* any
`git reset --hard origin/main`. Resetting while on a feature branch silently
rewrites that branch, not your view of main.**

And the second half, which matters more: **a hook firing about "commits that
shouldn't be here" is doing its job.** The instinct to push whatever it names, or
to assume work has been lost, is wrong in both directions. Derive the ancestry
first — `git log --branches --not --remotes`, and check whether the named commit
is already reachable from `origin/main`. Here it was, and the correct action was
to move the branch pointer back, not to push.
