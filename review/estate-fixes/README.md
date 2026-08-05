# Games estate — proposed fixes for Matt and Claude review

**Immutable base:** `MattRoper1977/Games@0fc29d519caea32b725d0b5dcbdcf2e6ef03db60`

This directory contains proposed changes only. Nothing here is applied to
`games.json`, any validator, any game, either dependency repository, or `main`.

## Why the fix is sequenced

The estate currently has three `NEW ·` claims split across two fields:

- `NEW · Echo Vault — Sound Is Your Light` in `title`;
- `NEW · Relicforge — Strip the Machine` in `title`;
- Apex Rally's `desc` begins `NEW ·`.

The rendered arcade only strips the prefix from `desc`, while the two newest
per-game validators permanently require their own `title` to begin with it. The
general Sports contract still checks only `desc`. Each check therefore sees a
different shelf and all can pass while more than one card claims the release
slot.

A content-only correction cannot land safely against the current gates:
removing Relicforge's prefix breaks its per-game validator, and removing Apex
Rally's legacy prefix makes its idempotency transform put it back. The repair is
therefore split exactly along the standing rule that a content PR must not edit
the gate that judges it.

## Patch order

1. **`0001-repair-new-release-contracts.patch` — gate/transform only.**
   - Makes the Sports contract measure title-based release markers and expose
     description-based markers as legacy drift.
   - Uses `origin/main` as the derived baseline so the gate repair itself can
     report today's pre-existing drift without becoming an unmergeable red
     landmine; any increase fails, and reductions pass.
   - Adds a positive-control gate that injects an extra marker and proves the
     contract rejects it.
   - Removes permanent ownership of the ephemeral release slot from the Echo
     Vault and Relicforge per-game contracts.
   - Makes the Apex Rally transform preserve whichever release marker is already
     present instead of minting or moving one.
   - Enables `pipefail` in the Sports workflow's `tee` pipeline.

2. **`0002-normalise-new-release-holder.patch` — content only.**
   - Keeps Echo Vault, the most recently landed game, as the sole visible
     `NEW ·` title holder.
   - Removes the stale title marker from Relicforge.
   - Removes the hidden legacy description marker from Apex Rally.

`MANUAL_REVIEW.md` retains the Medevac catalogue decision and the short Tees
Coast description rather than inventing product placement or copy.

## Validation contract

The companion workflow:

1. creates a detached worktree at the exact base SHA;
2. applies patch 0001 and proves the gate-only stage changes no manifest content;
3. runs the canonical manifest, Sports, Echo Vault and Relicforge contracts;
4. applies patch 0002 and proves it changes only `games.json`;
5. re-runs every contract and the Apex Rally idempotency check;
6. checks one title-based holder, zero legacy description holders and Echo Vault
   as the holder;
7. serves the website, patched manifest and Lessons checkout under their real
   URL prefixes and verifies the rendered arcade in desktop and mobile/touch
   Chrome;
8. uploads the applied diff, logs, reports, checksums and a downloadable fix-pack
   ZIP for 90 days before enforcing pass/fail.

## Apply only in disposable review branches

```bash
BASE=0fc29d519caea32b725d0b5dcbdcf2e6ef03db60
git checkout -b review/games-new-release-gates "$BASE"
git apply --check --recount review/estate-fixes/0001-repair-new-release-contracts.patch
git apply --recount review/estate-fixes/0001-repair-new-release-contracts.patch
```

After that gate-only change has been reviewed and landed, rebase a separate
content branch on the new `main` and apply patch 0002. Do not combine the two in
a production PR merely because the review workflow validates the final combined
state.
