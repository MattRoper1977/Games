# Echo Vault — what shipped, and the named v1.2 ledger

## Shipped in v1.1 (live at /echovault/)
U1 pulse-as-light (shader wavefront, ≤4 pulses, composed with `uEcho`) · U2 blueprint residual
**and** the decay retune (.68→.40/s, memory divisor .34→.55, floors lifted) · **U9 held breath** ·
**U10 loud ping** · Echo Read (D2 twist) · D4 reduce-flashes control, separate from motion ·
E1–E3. Plus two defects found by gates rather than by the brief: the **OS preference was a
default rather than a floor**, and the **renderer-unavailable panel existed twice** with context
loss showing neither.

## v1.2 ledger — recorded, not lost, not promised
| item | what it is | why it is not here |
|---|---|---|
| **U3** | material echo signatures (hard/absorbent/hazard by pattern **and** brightness) | session capacity |
| **U4** | enemy echo asymmetry — four type-distinct signatures resolving as they close | session capacity |
| **U5** | StereoPanner rewire to emitter positions (largest atmosphere gain per byte — take this first) | capacity list, not reached |
| **U6** | ConvolverNode with a procedural IR whose tail derives from collision distances | capacity |
| **U7** | fx-overlay dust/grain/vignette/threat tint (no FBO) | capacity list, not reached |
| **U8** | threat-tracking drone that ducks under U9 | capacity |
| **U11** | sector modifiers Dead / Flooded / Unstable (±15% distance misreport, scored against truth) | capacity |
| **U12** | stabilise fast-and-loud vs slow-and-quiet | capacity |
| **U13** | directional damage read (vignette + audio flare from the attacker's bearing) | capacity |
| **U14** | report card: cores · best Echo Read · quietest sector · longest breath · deepest sector | capacity — note `run.breathBest`, `run.bestEchoRead` and `run.loudPings` are already tracked, so this is a rendering job, not a systems one |

**Recommended v1.2 order:** U5 → U7 → U14 (cheapest, and its data already exists) → U4 → U11.

## Recorded, not repaired
`codex/relicforge-live-verify` (closed, never merged) greps the served `/games/` HTML for the
card and reports 0. **That grep is vacuous by construction** — the arcade shelf builds every card
in JavaScript, so the served markup contains no card at all and the grep returns 0 whether the
entry is live or not. Its note also still reads as though Part B were parked, which is now false.
The real census lives in `verify_*_surfaces.js`, which measures the rendered DOM. Nothing served
depends on the stale branch, so it is recorded here rather than edited.
