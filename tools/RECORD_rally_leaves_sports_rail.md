# RECORD — Rally Vector 3D leaves the Sports rail, and the estate-audit §4 park dissolves

**13 August 2026.** Ruled by Matt (estate-audit-repairs thread, option (c)). Recorded
here rather than left in a pull-request body, so the reasoning can be audited rather
than reconstructed.

## The ruling

**The Sports rail is the Apex-family rail. Rally Vector 3D does not belong to
collection `"Sports"`.**

Rally is a rally-driving game that arrived through the driving-games launch, not
through the Apex family. It was given `collection: "Sports"` when its entry was
composed, and that single field is what put it on the rail.

## What it fixes, at the cause

`games/index.html` derives the rail from the manifest — `gs.filter(g =>
g.collection === "Sports")` — and renders those entries in `#sportsRail` **in
addition to** `#allGrid`. A game in a rail'd collection therefore renders twice.

Rally also holds the ephemeral `NEW · ` marker, which rides on the shelf title. So
its title text appeared twice on the page, and the driving-games live leg's
assertion `exactly one NEW marker` — which counts rendered `NEW ·` occurrences in
`body.innerText` — read **2** and failed.

Measured before and after, rendering the committed page against the canonical shelf
at both viewports:

| | before | after |
|---|---|---|
| rendered `NEW ·` count | 2 | **1** |
| `/rallyvector3d/` anchors | 2 (`#sportsRail`, `#allGrid`) | **1** (`#allGrid`) |
| Sports rail members | 8 | **7** |

The assertion goes green with **no edit to the assertion**. That ordering is the
point: the gate is not moved in the pass it blocks.

## What did NOT change

`NEW ·` holder stays `/rallyvector3d/`. Shelf stays at 50 entries. Rally keeps its
identity gold `#ffd45f` — the C1 ruling on hues is untouched. One field removed,
nothing else.

## The rail lands at seven, not five

The ruling names the rail the Apex-family rail, and the five Apex games are its
core — but two non-Apex members remain, each added by its own earlier ruled commit:

- `47fc567` — *Aurora Links 3D joins the Sports rail: 5 -> 6, the rail's first
  non-Apex member*
- `50d1800` — *Global Games lands — shelf 45→46, Sports rail 7*

Removing those would contradict two standing rulings and was not asked for, so the
rail is 7 after this change. Recorded here so the number is not read as a miss.

## Gates

`validate_games_json.sh` — PASS, 50 entries. `verify_sports_rail.js` — **8/8**,
7 members derived, **no pair introduced by this change**; the only sub-floor pair
is Apex Golf / Apex Tennis at ΔE00 14.01, correctly reported by S3's own
pre-existing-drift path.

**One consequence to note.** `tools/rail_hue_breaches.json` records two breaches
involving `/rallyvector3d/` (against Apex Pool at 16.23 and Aurora Links at 20.94),
declared when Rally was a rail member. Rally is no longer on the rail, so neither
pair can arise and both records are now inert. They are deliberately **left in
place**: S8 requires at least one recorded breach to exercise its control against,
so emptying the record would break a working gate. Whether to retire them is a
separate ruling, not a consequence of this one.

## The estate-audit §4 park is DISSOLVED

That park held the question of a manifest sync between the two shelves. The sync
itself was **overtaken by Games#30** (the shelf reconciliation, which made this
repository's `games.json` the canonical single writer and the site repo's
`data/source-manifests/games.json` a generated mirror of it). The only live
remainder was the collection question, and this change settles it. Nothing in that
park remains open.
