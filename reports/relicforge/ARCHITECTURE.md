# Relicforge — §2 confirmation, drift and baseline

Run: 2026-08-05. Source: `MadeByMatt_Relicforge.html`, **190,595 B**, SHA-256
`a6609dfd2f7d5f7e965525750691dbd1d93d9aa359e999bdd264d807b1a816cb` — **matches the pin**.

## Capability probe (§0.4) — done first
- Chromium (Playwright 1.56.1, `/opt/pw-browsers`) **launches**; Canvas 2D pixel readback exact
  (`fillStyle #51e7ff` → `[81,231,255,255]`). Browser gate **PASSED**, so the session proceeds past §2.
- Container has **no GPU** — Chromium falls back to software rasterising. Consequence recorded under Baseline.

## Census confirmed
| Claim | Measured | Verdict |
|---|---|---|
| One `<script>`, single file | 1 open / 1 close, zero `src=`/`href=` to `http(s)://` | ✓ |
| `FIXED_STEP = 1/120`, 8 substeps | L4963 `1/120`, L4997/4999 cap and `steps < 8` | ✓ |
| `PARTS` = 27 across 6 slots | 27 ids; `SLOT_ORDER` L1513; `PART_IDS_BY_SLOT` derived L1700 | ✓ |
| `CHASSIS` ×3 | L1705 Vanguard/Wraith/Arcanist | ✓ |
| `SAVE_KEY` one constant, 2 call sites | L1321 decl, L1381 read, L1393 write | ✓ |
| RM loads with OS as floor | L1365 `data.settings?.reducedMotion === true \|\| matchMedia(...)` | ✓ |
| RM gates particles ×0.42, shake, flash .75→.28 | L2137, L2158, L3509 | ✓ |
| No panner of any kind | zero `createStereoPanner`/`createPanner` | ✓ (A1 valid) |
| Audio graph small | 3 `createGain`, 1 osc factory, 1 biquad, buffer sources | ✓ |
| `announce()` writes aria-status, clears then sets on rAF | confirmed | ✓ |

## DRIFT (recorded, not a stop)
1. **Line count**: `wc -l` = **5,075** (brief said 5,076). File ends without a trailing newline; 5,076 lines
   counting the unterminated last line. Cosmetic.
2. **`window.__relicforge` is larger than the census stated.** Beyond `version/start/snapshot` it also exposes
   `damagePlayer`, `clearChamber`, `forceForge`, `install(index)` and — most usefully — **`targets()`**, which
   returns every live enemy's per-component `{hp, maxHp, destroyed}`. Favourable drift: the harness can score
   component-level behaviour directly instead of inferring it. `snapshot()` also carries `maxHp`, `equipment`,
   `salvage` and `canvas` beyond the listed keys.
3. **`snapshot()` key set is stable across modes** (§2 item 3) — menu and playing return identical key sets,
   measured; `hp`/`playerPosition` null in menu rather than absent. Harness spine **confirmed**.

## §2 item 2 — component-damage legibility audit (play-derived)
This is the finding that sets V1's scope, and it is worse than "some feedback exists":

- **Enemies carry 6 components** — `core, head, armR, armL, legs, back` (`createComponents`, L2589), each with
  independent `hp`/`maxHp`/`destroyed` and its own hitbox radius. Targeting is genuinely per-component
  (`damageEnemyComponent`, L3327; nearest-component projectile selection L3290–3308).
- **Destruction feedback today** = particle burst + text popup (`OPTICS DESTROYED` …) + trauma + one audio cue.
- **The renderer draws a destroyed component by not drawing it.** Every part is wrapped in
  `if (!enemy.components.X.destroyed) { … }` — the limb **vanishes cleanly**. No stub, no shear, no wreck.
- **There is no per-component damage state at all.** The only damage tint is `enemy.hitFlash`, which is read by
  *every* component's draw call at once (`const flash = enemy.hitFlash > 0`), so the whole machine whitens —
  **you cannot see which component you just hit** from the body render.
- The only per-component readout is the 5-segment strip in `drawEnemyStatus` (L4605): 2px-tall bars that are
  binary present/destroyed, no intermediate damage, drawn at `globalAlpha 0.58` and **`0` for bosses**.
- **The clean-strip mechanic already exists in logic**: destroying all five externals fires
  `SYSTEM SHUTDOWN · CORE PRESERVED` → `killEnemy(enemy, true)` (L~3400), which pays ×1.45 score, ×1.35 XP and a
  guaranteed core drop. **It is ungraded, and it has no distinct visual state** — the machine simply dies.

**Conclusion:** V1 is not polish. The game's whole identity — targeted component damage — is currently invisible
on the machine itself; it is legible only as floating text. Per-component damage states, destruction stubs,
persistent debris and a localised hit ring are the mechanic becoming visible for the first time. And because D1
grades the clean strip, the *approach* to that moment (externals remaining) must be readable — note the strip
completes into an instant kill, so there is no lingering "core exposed" window to render: the readable state is
the **countdown to it**, not the aftermath.

## Baseline (§2 item 1)
Rig: `tools/rf_harness.mjs` + `tools/rf_baseline.mjs`, driving `__relicforge` only. Chamber 4, 8 live enemies,
synthetic busy play (continuous fire, sweeping aim, rotating movement), mode held at `playing` throughout.

| Viewport | fps | mean frame | p50 | p95 | worst |
|---|---|---|---|---|---|
| 1366×768 | **55.3** | 18.07 ms | 17.30 ms | 32.90 ms | 41.90 ms |
| 390×844 | **79.7** | 12.54 ms | 16.90 ms | 17.70 ms | 21.40 ms |

Zero page errors, zero console errors, both viewports.

**Honesty note on the D2/G2 floors.** These are headless, software-rasterised numbers from a GPU-less container.
The desktop figure landing at 55.3 — right on D2's ≥55 floor — is a property of *this rig*, not of the game on
Matt's hardware. I will therefore gate G2 on a **like-for-like regression on the identical rig** (v1.0 vs v1.1,
same script, same viewport, same chamber) plus **main-thread script cost** via CDP `Performance.getMetrics`,
which is what new drawing and audio work actually moves. I will not claim a real-device fps floor I cannot
measure from here — the phone check is on Matt's list at close for exactly this reason.

---

# Outcome — Pass 1 gates and Pass 2 landing

## Gates, all green, all sighted
`8/8` suite gates (`tools/rf_gates.mjs`) + the Salvage Rating contract (`tools/rf_gate_salvage.mjs`)
+ the live strip test (`tools/rf_gate_strip.mjs`).

Two gates were **corrected during the run rather than worked around**, and both corrections are
recorded because each was a real defect in the gate:
- **G1** counted `<link rel="canonical">` as a remote resource. Canonical and `og:url` are metadata
  and are never fetched at runtime — the exact donor defect `verify_apexrally.js` documents. Fixed to
  the runtime-fetching tag list, and the clean file is now asserted to pass **positively**.
- **G7** counted midline crossings of a slowly-varying luminance signal, which reports ordinary
  camera motion as strobing. Replaced with the photosensitivity definition (a pair of opposing
  changes of ≥10% relative luminance), and given a **10 Hz strobe control** that measures 8.82 Hz,
  so the metric is provably sighted.

One **real defect** was found by the gates rather than assumed away: the settings toggles inherited
from v1.0 rendered **50×27**, under the 44 px floor the census claimed was already clean. They are
now genuinely 44 px — not a pseudo-element hit area, which no measurement of a control's real size
can see.

## Perf, like-for-like on the identical rig
| viewport | v1.0 fps | v1.1 fps | v1.0 script ms/s | v1.1 script ms/s |
|---|---|---|---|---|
| 1366×768 | 63.4 | **67.0** | 74.8 | **67.1** |
| 390×844 | 71.3 | **76.2** | 56.9 | 93.5 |

No regression on either viewport. These remain **headless, software-rasterised** numbers from a
GPU-less container; they are honest as a before/after on one rig and are **not** a claim about
frame rate on Matt's hardware. That is why the phone check is on his list.

## Live, verified by a runner (the container cannot reach madebymatt.uk — 403 on CONNECT)
- `/relicforge/` **HTTP 200**, **241,371 bytes**
- **SERVED HASH = `fd76016fa5a02c0bb9fbe8ba7072b9fd8d7a863b43343819a86eee57eb0a9be3`**, byte-identical
  to the artifact at the merged SHA `c64599a6`
- sitemap entries for `/relicforge/`: **1**
- shelf census: manifest **38** on `Games@main`, **0** Relicforge references on the served shelf —
  correct, because Part B is parked.

## Sequencing gate — PARKED, condition tested not assumed
`Games#12` ("Add Biopunk Hive to the arcade shelf") is **open and modifies `games.json`** (verified by
reading its file list: `games.json`, +11 −0). Part B therefore parks, and Part C parks behind it.
Note for whoever unblocks it: **#12 is stale** — Biopunk Hive already landed on `main` via #13, so
#12's insertion would now be a duplicate, and its own body says it was withheld deliberately. The
unblock is a decision about #12, not work on the Relicforge branch.
