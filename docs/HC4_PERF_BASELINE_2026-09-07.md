# HC4 §6.3 — current-main performance baseline (2026-09-07)

**label: current-main baseline (not historical).** This is a NEW measurement of
the tree Play serves today. It is never a substitute for the lost HC1 tables
(declared UNRECOVERABLE in `docs/hc3-recovery/history/README.md`), and it
enforces nothing: no threshold is applied or implied here. GS1 owns thresholds.

## What was measured

- Served tree: the Play publication built from the released pins in
  `play-publication.json` — Site `a30088ea8d3380b0c0e6040a361a9c0449450a89`,
  Lessons `138457849c2690de5413ed80d616725a5160f9d1` — served locally with
  `domain-split/play/serve.cjs`. Games HEAD at measurement: `15e2c9cf970e8ffc03f62ba4c2e02ba462dbcf39`.
- Harness: `tools/hc4_perf_baseline.mjs` (SHA-256 `175143da27f853db5eb17574a0619e86e1b9908bbdb24db8acd76e02751583d5`),
  Node v22.22.2, Chromium 141.0.7390.37, Playwright 1.56.1.
- Per route: navigation timing (responseEnd / domContentLoaded / load), transfer
  bytes, idle requestAnimationFrame count over a 3000 ms window after load + 1000 ms,
  frames over a 3000 ms window while ArrowRight is held, long tasks, page errors.
  Context: 390×844, isMobile, hasTouch, dpr 2, service workers blocked, swiftshader WebGL.
- Recipe: all 69 routes in build-report payload order, three complete sweeps in one
  process; the per-route median is the middle value of the three runs.
- Window: 2026-09-07T08:43:45.816Z → 2026-09-07T09:12:13.239Z.

## Self-test (the harness proves it reports, before it is trusted)

One scratch route measured real → planted (four idle rAF chains instead of one) → restored:

| run | idle rAF / 3000 ms | fps |
|---|---|---|
| real | 180 | 60 |
| planted | 720 | 240 |
| restored | 180 | 60 |

The planted defect is REPORTED as a higher count; the harness does not fail on it.

## Coverage

69 routes × 3 runs; routes measured in all runs: 69;
unresponsive runs: 0; failed runs: 0; routes with page errors: 0.

## Ten slowest routes by median load (informational, not a verdict)

| route | median load ms | transfer B | median idle rAF | median fps |
|---|---|---|---|---|
| `/Lessons/Games/Grapple.html` | 1080 | 684982 | 8 | 3 |
| `/auroralinks/` | 826 | 232849 | 13 | 4 |
| `/trailrunner/` | 490 | 709008 | 16 | 8 |
| `/emberwild/` | 466 | 990104 | 0 | 0 |
| `/voxel/` | 439 | 770163 | 93 | 32 |
| `/apexkick/` | 381 | 994134 | 99 | 27 |
| `/Lessons/Games/Neon_Garden.html` | 345 | 601431 | 7 | 3 |
| `/Lessons/Games/Globe_Snake (1).html` | 327 | 564958 | 10 | 5 |
| `/Lessons/Games/Neon_Siege.html` | 310 | 593732 | 8 | 3 |
| `/Lessons/Games/Vortex.html` | 308 | 576141 | 8 | 2 |

Every number above comes from `docs/HC4_PERF_BASELINE_2026-09-07.json`, written by the
harness; none is typed. Re-running the harness on a later pin produces a NEW dated
file — this one is not regenerated.
