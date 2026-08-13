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

## RAIL IDENTITY, ruled 2026-08-14 — a general Sports rail of seven

The 13 August ruling was phrased "the Apex-family rail" and was acted on as
such: Rally Vector 3D came off, and **stays off** — that ruling was made twice
and is now load-bearing, since the re-scoped NEW·-marker assertion is green
because of it and the estate-audit §4 park dissolved on it.

Matt settled the identity question itself on 14 August. **The rail is a general
Sports rail and stands at seven.** Its occupants, as ruled:

| | |
|---|---|
| `/olympics/` | Global Games: Championship Simulator — joined by `50d1800` |
| `/apexkick/` | Apex Kick |
| `/apexpool/` | Apex Pool |
| `/apexgolf/` | Apex Golf |
| `/apextennis/` | Apex Tennis |
| `/apexrally/` | Apex Rally |
| `/auroralinks/` | Aurora Links 3D — joined by `47fc567`, *"the rail's first non-Apex member"* |

Global Games and Aurora Links 3D each arrived through their own ruled commit and
**stay**. Seven is the ruled number, not a shortfall against five: recorded here
so the next launch does not re-litigate it, and so "Apex-family" is not read as a
standing instruction to prune the two non-Apex members.

## Gates

`validate_games_json.sh` — PASS, 50 entries. `verify_sports_rail.js` — **8/8**,
7 members derived, **no pair introduced by this change**; the only sub-floor pair
is Apex Golf / Apex Tennis at ΔE00 14.01, correctly reported by S3's own
pre-existing-drift path.

**One consequence, since settled.** `tools/rail_hue_breaches.json` recorded two
breaches involving `/rallyvector3d/` (against Apex Pool at 16.23 and Aurora Links
at 20.94), declared when Rally was a rail member. Rally left the rail, so neither
pair could arise and both records went inert. They were left in place at the time
only because S8 then required a live breach to exercise its control against.
**Ruled and done on 2026-08-14:** both entries retired, and S8's control moved to
`tools/rail_hue_breach_fixture.json` so it never again depends on a real breach
existing. The live record is now empty, which is the strong state — nothing is
excused.

## The estate-audit §4 park is DISSOLVED

That park held the question of a manifest sync between the two shelves. The sync
itself was **overtaken by Games#30** (the shelf reconciliation, which made this
repository's `games.json` the canonical single writer and the site repo's
`data/source-manifests/games.json` a generated mirror of it). The only live
remainder was the collection question, and this change settles it. Nothing in that
park remains open.
