# Frozen historical artefact — HC4 §6.2

`HC3_HISTORICAL_PAYLOAD_BYTES_2026-09-07.json` is the sole surviving historical
performance artefact: the 69 raw HTML payload rows (20,344,993 bytes in total,
16 rows above 500,000 bytes) reconstructed by Games #66 from original artifact
9990820021 / run 34038125168 at Games ec5ee7bb. It is frozen here and must
never be regenerated. Its SHA-256 is recorded in `SHA256SUMS` beside it; a
copy whose digest differs is not this artefact.

Declared UNRECOVERABLE (HC4 §6.2): the original per-route gzip values, the 18
quiet-route identities, the 19-slow-route table and the original timing
harness. Any HC1 readback number with no surviving artefact is "unattested".
The current-main baseline (`docs/HC4_PERF_BASELINE_2026-09-07.json`) is a new
measurement and is never labelled historical.
