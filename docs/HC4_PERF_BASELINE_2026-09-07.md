# HC4 §6.3 — Play timing baseline, 2026-09-07

**label: current-main baseline (not historical)**

This is a set of numbers, not a gate. **No threshold is enforced or implied by
this document or by `docs/HC4_PERF_BASELINE_2026-09-07.json`. GS1 owns
thresholds.** The harness that produced it reports; it has no verdicts and no
non-zero exit for a slow route. These runs are a baseline of the tree Play
serves from current main, taken on one machine on one day, so that a later run
on the same machine has something to be compared against. They are not to be
labelled historical.

## What was measured

Harness: `tools/hc4_perf_baseline.mjs`
(sha256 `175143da27f853db5eb17574a0619e86e1b9908bbdb24db8acd76e02751583d5`),
node v22.22.2, Playwright 1.56.1, Chromium 141.0.7390.37 headless with
`--use-angle=swiftshader --enable-unsafe-swiftshader`, 4 × Intel Xeon 2.80 GHz.
Measurement is lifted from `tools/play_perf_gate.mjs` (HC3 §3.2) — same page
context (390×844, mobile, dpr 2, service workers blocked), same rAF wrap before
the first page script, same in-page timing of every window — with the gate's
thresholds and `judge()` deliberately left out.

Tree under test: the Play tree built by `domain-split/build_publications.py`
from the pins in `play-publication.json` — Site `a30088ea8d3380b0c0e6040a361a9c0449450a89`,
Lessons `138457849c2690de5413ed80d616725a5160f9d1` — build-report
`game_payloads` = 69, served by `domain-split/play/serve.cjs` on loopback.
Games HEAD at time of run: `15e2c9cf970e8ffc03f62ba4c2e02ba462dbcf39`
(origin/main). Started 2026-09-07T08:43:45Z, ended 2026-09-07T09:12:13Z.

Per route, per run:

| metric | how |
|---|---|
| `nav.responseEnd`, `nav.domContentLoaded`, `nav.load` | ms from timeOrigin, `performance.getEntriesByType('navigation')[0]` |
| `transfer.document`, `transfer.total` | bytes; navigation entry `transferSize`, plus every resource entry's `transferSize` |
| `idle_raf` | rAF callbacks actually invoked in a 3000 ms in-page window opening 1000 ms after the load event |
| `fps` | rAF callbacks per second over a 3000 ms in-page window while `ArrowRight` is held |
| `longtasks` | `PerformanceObserver` `longtask` entries from before first script to the end of the fps window (supported on every route here) |
| `errors` | `pageerror` events |

## The recipe

All 69 routes, in build-report payload order, swept three times in the same
browser process (runs 1, 2, 3); a fresh context per route per run. Per-route
median of each numeric metric across the three runs (middle value; mean of the
two middles if a run were missing). `page.goto` timeout 30 s; any in-page stage
that cannot answer within 30 s is recorded as `unresponsive` for that run and
the sweep moves on. Result: **69/69 routes measured in all three runs, no
unresponsive run, no failed load, no page errors on any route.**

## Self-test (measurement proved live)

Run at the head of the baseline in the same browser: one scratch route
measured real → planted → restored, where "planted" is the same canvas page
carrying a deliberate idle re-arm loop (four rAF chains instead of one).

| stage | idle rAF / 3000 ms | fps |
|---|---|---|
| real (clean page) | 180 | 60 |
| planted (idle re-arm) | **720** | 240 |
| restored (clean again) | 180 | 60 |

The harness reported the planted defect as a 4× higher idle count and the
restored page returned to the clean figure. `demonstrated: true` in the JSON.
The same numbers came out of the standalone `--self-test` run beforehand
(180 → 720 → 181).

## Top 10 slowest routes by median `nav.load`

For information only. Nothing below is a failure.

| # | Route | Median load (ms) | Median transfer (bytes) | Median idle rAF / 3000 ms | Median fps |
|---|---|---|---|---|---|
| 1 | `/Lessons/Games/Grapple.html` | 1080 | 684982 | 8 | 3 |
| 2 | `/auroralinks/` | 826 | 232849 | 13 | 4 |
| 3 | `/trailrunner/` | 490 | 709008 | 16 | 8 |
| 4 | `/emberwild/` | 466 | 990104 | 0 | 0 |
| 5 | `/voxel/` | 439 | 770163 | 93 | 32 |
| 6 | `/apexkick/` | 381 | 994134 | 99 | 27 |
| 7 | `/Lessons/Games/Neon_Garden.html` | 345 | 601431 | 7 | 3 |
| 8 | `/Lessons/Games/Globe_Snake (1).html` | 327 | 564958 | 10 | 5 |
| 9 | `/Lessons/Games/Neon_Siege.html` | 310 | 593732 | 8 | 3 |
| 10 | `/Lessons/Games/Vortex.html` | 308 | 576141 | 8 | 2 |

Context for reading the table: the median across all 69 route medians is
89 ms `nav.load`; the largest payload is `/titanforge/` at 1,640,736 bytes;
11 routes paint nothing at idle (median `idle_raf` 0) and 11 hold ≥ 30 fps
under swiftshader, both as authored (HC1 saw the same shape). The highest
idle painter is `/Lessons/Games/Charcoal.html` at 625 frames per 3000 ms.
Frame figures are from a software renderer on a 4-core VM and are only
comparable with a later run on the same kind of machine.

## Every route (median of three runs)

| Route | load r1/r2/r3 | median load | median bytes | median idle rAF | median fps | median longtasks | errors | runs measured |
|---|---|---|---|---|---|---|---|---|
| `/cyberpulse/` | 119/172/118 | 119 | 224351 | 37 | 12 | 1 | 0 | 3/3 |
| `/crownbadge/` | 110/71/86 | 86 | 181027 | 0 | 0 | 0 | 0 | 3/3 |
| `/houseolympiad/` | 108/80/82 | 82 | 112861 | 52 | 21 | 1 | 0 | 3/3 |
| `/titanforge/` | 250/274/248 | 250 | 1640736 | 41 | 27 | 1 | 0 | 3/3 |
| `/emberwild/` | 466/562/350 | 466 | 990104 | 0 | 0 | 1 | 0 | 3/3 |
| `/novasiege/` | 93/129/68 | 93 | 154438 | 27 | 7 | 0 | 0 | 3/3 |
| `/ouroboros/` | 41/53/36 | 41 | 209966 | 20 | 3 | 0 | 0 | 3/3 |
| `/olympics/` | 156/151/113 | 151 | 432749 | 8 | 3 | 2 | 0 | 3/3 |
| `/fracture/` | 233/172/185 | 185 | 881969 | 31 | 10 | 2 | 0 | 3/3 |
| `/neonturf/` | 100/69/89 | 89 | 253614 | 30 | 9 | 0 | 0 | 3/3 |
| `/echovault/` | 189/146/137 | 146 | 177778 | 43 | 15 | 1 | 0 | 3/3 |
| `/relicforge/` | 103/115/91 | 103 | 352694 | 35 | 12 | 1 | 0 | 3/3 |
| `/offbrand/` | 52/61/46 | 52 | 211410 | 584 | 240 | 0 | 0 | 3/3 |
| `/Lessons/Games/Axiom_Shift.html` | 35/45/30 | 35 | 71126 | 180 | 60 | 0 | 0 | 3/3 |
| `/Lessons/Games/Charcoal.html` | 32/95/31 | 32 | 107120 | 625 | 240 | 0 | 0 | 3/3 |
| `/Lessons/Games/Hold_the_Mark.html` | 93/69/45 | 69 | 157499 | 180 | 60 | 0 | 0 | 3/3 |
| `/Lessons/Games/Glitch_Clash.html` | 81/75/59 | 75 | 237766 | 98 | 31 | 0 | 0 | 3/3 |
| `/trailrunner/` | 682/490/330 | 490 | 709008 | 16 | 8 | 2 | 0 | 3/3 |
| `/Lessons/Games/voxelcraft.html` | 71/30/55 | 55 | 123357 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/Vortex.html` | 451/308/264 | 308 | 576141 | 8 | 2 | 2 | 0 | 3/3 |
| `/Lessons/Games/Globe_Snake (1).html` | 374/325/327 | 327 | 564958 | 10 | 5 | 2 | 0 | 3/3 |
| `/Lessons/Games/Neon_Snake_Overdrive.html` | 175/199/158 | 175 | 675768 | 16 | 6 | 1 | 0 | 3/3 |
| `/Lessons/Games/Neon_Siege.html` | 310/434/296 | 310 | 593732 | 8 | 3 | 2 | 0 | 3/3 |
| `/Lessons/Games/Neon_Garden.html` | 345/4372/279 | 345 | 601431 | 7 | 3 | 2 | 0 | 3/3 |
| `/Lessons/Games/Orbital.html` | 294/343/293 | 294 | 578763 | 7 | 2 | 2 | 0 | 3/3 |
| `/Lessons/Games/Grid_Chase.html` | 70/61/55 | 61 | 74317 | 21 | 6 | 0 | 0 | 3/3 |
| `/Lessons/Games/Prism.html` | 270/240/339 | 270 | 584500 | 7 | 3 | 2 | 0 | 3/3 |
| `/Lessons/Games/Grapple.html` | 1312/1080/900 | 1080 | 684982 | 8 | 3 | 3 | 0 | 3/3 |
| `/Lessons/Games/Marble.html` | 648/233/259 | 259 | 695737 | 8 | 3 | 2 | 0 | 3/3 |
| `/Lessons/Games/Slipstream.html` | 403/244/301 | 301 | 560046 | 9 | 3 | 2 | 0 | 3/3 |
| `/Lessons/Games/Slipstream_GP.html` | 386/261/258 | 261 | 754305 | 129 | 53 | 2 | 0 | 3/3 |
| `/Lessons/Games/Wrecking_Crew.html` | 210/181/155 | 181 | 900682 | 44 | 12 | 1 | 0 | 3/3 |
| `/Lessons/Games/Lumins.html` | 78/68/76 | 76 | 154329 | 66 | 15 | 0 | 0 | 3/3 |
| `/Lessons/Games/Static.html` | 56/56/43 | 56 | 175332 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/OneGuy.html` | 61/74/49 | 61 | 89337 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/The_Last_Lighthouse_v1_1_The_Archipelago_Update_FINAL.html` | 101/122/77 | 101 | 183141 | 10 | 3 | 0 | 0 | 3/3 |
| `/Lessons/Games/KidsVsStaff_Showdown (3).html` | 60/58/42 | 58 | 84859 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/WorldCup_ThreeLions_Final.html` | 27/63/28 | 28 | 117127 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/WorldCup_v3_MatchDirector.html` | 72/55/65 | 65 | 126373 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/WorldCup_v5_Showdown.html` | 73/64/66 | 66 | 163687 | 0 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Games/Trekkers_Trail_Runner_Tees_Coast.html` | 399/299/285 | 299 | 1466119 | 20 | 8 | 1 | 0 | 3/3 |
| `/voxel/` | 603/396/439 | 439 | 770163 | 93 | 32 | 1 | 0 | 3/3 |
| `/apexkick/` | 888/381/368 | 381 | 994134 | 99 | 27 | 2 | 0 | 3/3 |
| `/apexpool/` | 53/60/50 | 53 | 109348 | 180 | 60 | 0 | 0 | 3/3 |
| `/apexgolf/` | 50/29/29 | 29 | 92979 | 360 | 120 | 0 | 0 | 3/3 |
| `/apextennis/` | 56/37/44 | 44 | 85748 | 0 | 0 | 0 | 0 | 3/3 |
| `/neonsync/` | 64/45/44 | 45 | 88047 | 0 | 0 | 0 | 0 | 3/3 |
| `/biopunkhive/` | 76/92/77 | 77 | 87930 | 69 | 28 | 1 | 0 | 3/3 |
| `/neonbreach/` | 134/104/121 | 121 | 158968 | 40 | 11 | 1 | 0 | 3/3 |
| `/apexrally/` | 39/21/24 | 24 | 54539 | 30 | 12 | 0 | 0 | 3/3 |
| `/medevac/` | 106/81/82 | 82 | 494897 | 40 | 14 | 68 | 0 | 3/3 |
| `/luminahaven/` | 66/66/69 | 66 | 142612 | 3 | 0 | 0 | 0 | 3/3 |
| `/auroralinks/` | 826/1411/182 | 826 | 232849 | 13 | 4 | 8 | 0 | 3/3 |
| `/neonmeridian/` | 135/84/89 | 89 | 140852 | 139 | 60 | 1 | 0 | 3/3 |
| `/rallyvector3d/` | 239/221/263 | 239 | 248906 | 22 | 6 | 2 | 0 | 3/3 |
| `/hyperdraft/` | 77/52/64 | 64 | 184634 | 25 | 8 | 0 | 0 | 3/3 |
| `/apexcurl/` | 157/128/119 | 128 | 255579 | 9 | 3 | 0 | 0 | 3/3 |
| `/apexvelodrome/` | 268/151/168 | 168 | 262640 | 15 | 5 | 0 | 0 | 3/3 |
| `/micro-tinkerer/` | 318/304/277 | 304 | 159622 | 27 | 9 | 1 | 0 | 3/3 |
| `/townlife/` | 129/128/129 | 129 | 349251 | 15 | 5 | 1 | 0 | 3/3 |
| `/touchline/` | 124/87/99 | 99 | 416330 | 167 | 60 | 0 | 0 | 3/3 |
| `/skybreak/` | 141/112/106 | 112 | 220559 | 1 | 0 | 1 | 0 | 3/3 |
| `/Lessons/5 Intervention 10/InterventionA_Battle_Arena (1).html` | 37/63/61 | 61 | 176800 | 1 | 0 | 0 | 0 | 3/3 |
| `/Lessons/2 Physics 10/current_rush.html` | 30/25/39 | 30 | 76098 | 18 | 4 | 0 | 0 | 3/3 |
| `/Lessons/5 Intervention 10/InterventionB_Escape_Room.html` | 49/47/58 | 49 | 123745 | 1 | 0 | 0 | 0 | 3/3 |
| `/Lessons/LundyLoop/5_staff_training/R_Gate_Calibration_Game.html` | 39/40/18 | 39 | 61701 | 1 | 0 | 0 | 0 | 3/3 |
| `/Lessons/Summer Term Fun/Kids_vs_Staff_Studio_Game_Show_v8_Autopilot.html` | 59/69/58 | 59 | 178017 | 1 | 0 | 0 | 0 | 3/3 |
| `/Lessons/5 Intervention 10/L8a_Powerhouse_Arena_TeamQuiz.html` | 48/45/40 | 45 | 70497 | 1 | 0 | 0 | 0 | 3/3 |
| `/Lessons/5 Intervention 10/Lesson_VIR_Pupil_App.html` | 98/64/63 | 64 | 171549 | 1 | 0 | 0 | 0 | 3/3 |

## Reproducing

```sh
# build the tree from the pins, serve it, then:
node tools/hc4_perf_baseline.mjs --origin http://127.0.0.1:4177 \
  --routes <build>/build-report.json --out docs/HC4_PERF_BASELINE_<date>.json
node tools/hc4_perf_baseline.mjs --self-test     # the planted-defect control alone
```

Enforcement, if any is ever wanted, is GS1's to define against these numbers;
it does not live here.
