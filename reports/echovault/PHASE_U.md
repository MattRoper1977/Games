# Phase U — Echo Vault v1.1 (partial, honestly scoped)

Pinned input confirmed: **126,899 B, SHA-256 `0fabb57c…9bc609`** — matches §1.
Output: **141,190 B** of the 204,800 B (200 KB) budget — **63,610 B spare**.

## Shipped
- **U1 — the pulse became light.** The wavefront moved into the fragment shader as
  `uniform vec4 uPulses[4]` + `uPulseCount`, with a smoothstep band lit by N·L from the
  pulse origin, summed per pulse. **Composed, not replaced:** per-object `uEcho` remains the
  memory term, and the CPU model (`run.pulses`, `pulseCrossed`, the noise economy) is untouched
  — zero gameplay delta. Array size 4 is **derived**: P0 measured a peak of **2** concurrent
  live pulses in busy play.
- **U2 (partial) — residual as blueprint.** A faint teal edge sketch derived from the existing
  shimmer frequency, strongest at low echo, so remembered geometry reads as outline. **Decay
  retuning was NOT done** — see Cut.
- **D4 controls — shipped in the same commit as U1, as required.** A `Flashes: Full/Reduced`
  toggle on *both* the start screen and the pause menu, separate from `fullMotion`. Reduced
  = wider, dimmer band (`ringWidth` 1.9→5.2, gain 1.0→0.34): the room is still revealed, as a
  wash rather than an edge.
- **A real defect fixed, found while reading the load path:** v1.0 spread saved settings over
  fresh ones, so **a stale save overrode the OS reduced-motion preference** — the OS was a
  default, not a floor, contrary to the house rule. Both sensitivities are now forced down when
  the OS asks, at load **and** on live change via a matchMedia listener.
- **Echo Read (D2 twist)** — pure `EV.echoRead(predicted, actual, sector)`, wired to a real
  interaction (hold **E** to arm, **B** cycles the band, release commits and scores against the
  nearest core's truth).
- **E1** `.btn.compact` 38→44 px and `.topbar` 43→44 px inside its media query · **E2**
  `SAVE_KEY` → `'mbm_echovault_v1'`, zero legacy occurrences, no shim (never been live) ·
  **E3** canonical + og:url/title/description, no og:image (no asset exists) · **E4** not taken.

## Cut, and why — stated rather than quietly dropped
Everything below is **NOT in this file**. Per D3's cut order the bottom band goes first, but the
honest reason here is session capacity, not budget (63 KB remained):
**U2 decay retuning · U3 material signatures · U4 enemy asymmetry · U5–U8 (all of Band B:
spatial emitters, convolver, fx-overlay dust/vignette, threat drone) · U9 held breath ·
U10 loud ping · U11 sector modifiers · U12 · U13 · U14 report card.**
U9/U10 were explicitly "never cut" in the brief and they are not here — that is a shortfall
against the brief, not a decision I am entitled to make silently.

## Measurements
| | v1.0 | v1.1 |
|---|---|---|
| 1366×768 fps | 3.4 | 2.7–3.5 |
| 390×844 fps | 41.7 | **36.0** |
| draws/frame | 80.7 / 84.3 | 84.2 / 85.2 |
| peak concurrent pulses | 2 | 2 |

**The D3 fps floors (≥55 / ≥50) cannot be certified from here and were already unmet by v1.0
itself** — this container has no GPU, so Chromium runs swiftshader and the desktop figure
(~50 frames per sample) is dominated by the software rasteriser and sample noise. The usable
comparison is the phone viewport: **41.7 → 36.0, a −13.7% regression** from U1's per-fragment
loop, after recovering some of it with an early-out for fragments far from the ring. On real
hardware a four-iteration fragment loop is cheap; I cannot prove that here, so it goes to Matt's
device check rather than being claimed.

## Gates run
- **U1 isolation + G7 (D4):** wavefront ON vs OFF in the same run — luminance range
  **0.1728 vs 0.0542 (×3.19)**; **flash 0.95 Hz** (<3); **worst per-frame luminance swing 6.7%**
  (≤25%); reduced-flash 0.0942, dimmer than full but still revealing.
  *Positive control:* restoring the wavefront in the control slot drops isolation to **×1.04**
  and the gate fails. **The first version of this gate was vacuous** — it asserted only that
  pinging brightens the room, which is true of v1.0 via `uEcho`, so it passed with U1 switched
  off. The control found that, and the gate was rebuilt around the ON/OFF comparison.
- **G3 Echo Read:** 8/8 fixtures · 20,000 fuzz all integer-in-range · monotone in angular and
  band error independently · symmetric over/under · bands disjoint (correct ≥60, wrong ≤47) ·
  safe-read cap **60** vs **100** for the same read committed off the player's facing.
  Two independent controls: halving every score breaks 7/8 fixtures; "reward the near miss"
  leaves the fixtures alone and is caught **only** by the disjointness assertion.
- **G1:** 0 runtime-fetching external refs, 1 `<script>`. **E2:** 0 legacy-key occurrences.

## Not run
G2 (as an absolute floor), G4 storage census, G5 rendered-size sweep, G6 WebGL-absent/context-loss
shared-renderer check, G8 settings live-toggle sweep, G9 headless sector completion under every
modifier, G10 same-seed determinism. **Phase P did not start.**
