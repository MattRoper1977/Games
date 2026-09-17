# BR1 — World Cup shelf retirement

Owner ruling: Matt, 2026-09-17, `mbm-branch-retire-2026-09-17-BR1`.

## Decision

Retire from the shelf, by removing only their `games.json` entries:

- `/Lessons/Games/WorldCup_v3_MatchDirector.html`
- `/Lessons/Games/WorldCup_v5_Showdown.html`

Keep `/Lessons/Games/WorldCup_ThreeLions_Final.html` on the shelf, with its manifest entry unchanged. It is the owner's chosen teaching version.

The owner's stated reasons are that the retired editions have no Whiteboard Mode, have sub-44px targets in the default layout, and are superseded by Three Lions. The owner reports Three Lions' Whiteboard Mode was repaired. These are the owner ruling's grounds, not fresh browser measurements made by this change.

**Retirement means unlisting, not deletion or redirection.** Both retired routes must remain live by direct URL. No game file, canonical tag, redirect, stub, save, or manually maintained sitemap is changed by this PR. Historical payload/evidence records are not shelf membership and must not be deleted to satisfy a count.

**Reversal: re-add the two original manifest entries.** Their original bytes are retained in the parent version of `games.json`; this PR's manifest diff contains only those removals.

## Exact manifest evidence

The before file was read from this repository and bound to Git blob `2bb7ded7062f68d94ddcf7c34ec0bbbf5d9bc542` at base commit `174c5a1d13ca7714eed1e69e0eb4a58d901ca075`.

The candidate Git blob is `fced0c06dd2a18b544b56002b718b8f8b61bdcd4`, verified against the GitHub write response.

Measured from parsed JSON and raw object spans, not used as fixed-count gate inputs:

| Measurement | Result |
|---|---|
| Before shelf entries | 62 |
| Candidate shelf entries | 60 |
| Entries removed | Exactly the two named routes |
| Other entries changed | 0 |
| Surviving entry byte spans unchanged | All 60 |
| Top-level/wrapper bytes unchanged | Yes |
| Three Lions entry byte-identical | Yes, including its series field |
| Before bytes / SHA-256 | 34095 / `ddf5b400b3d47abc3bd49f2ebb918cf6f6a2c2fa702ef837a9242be27ab66b69` |
| Candidate bytes / SHA-256 | 33214 / `893a348b2a02159e630d9271905e265fac3b2e35ca9489b9d82630c673b63f30` |

This evidence proves the candidate manifest delta only. It does not assert that the retirement has been deployed.

## Release holds — do not merge until resolved on full green

1. `tools/validate_games_json.sh` rejects a series present on only one active row. Removing these editions leaves the unchanged Three Lions entry as the only active `World Cup` row. Changing that surviving entry would violate BR1's byte-preservation requirement; simply suppressing the validator would weaken a gate. A derived, tested treatment of a retained series after owner-authorised retirement remains required.
2. `.github/workflows/shelf-mirror-guard.yml` compares this PR's canonical file with Site main's `data/source-manifests/games.json`. Site's mirror must be regenerated with its existing `tools/render_games_manifest_mirror.py`, never hand-maintained. This PR does not change or bypass that gate.
3. Site `domain-split/play/build.py` contains fixed catalogue/payload assertions, including the active catalogue count. Publication needs derived membership/count checks without shrinking the direct-URL payload universe. Do not replace one fixed count with another.
4. The complete before/after, both-domain listing-surface census and live direct-URL HTTP/body-hash verification have not been completed. Source search identified the canonical manifest, Site's mirror, Site `games/index.html` curation, and generated Play shelf aliases including the pupil-facing alias. They are retained outside this draft for the Site/publication leg, not declared clean. Historical documentation, payload-preservation records and the game files themselves are retained as non-listing evidence or direct-URL payloads.
5. `PINS.md` requires workflow-generated Site/Lessons pin updates and successful publication/live verification. This PR does not hand-edit `play-publication.json`, merge unrelated pin PRs, or claim a mirror/publication release.

The execution environment had no usable Git network connection and no live-domain HTTP response. Consequently there is no claimed inbound-link after-count, HTTP 200, body-hash match, full-green merge, or completed Part A ancestry proof. These limitations must not be converted into passing assertions.

## Scope

One Games PR owns the canonical removal and this decision. Site/ Lessons files remain untouched in this run. Continue this PR rather than opening another canonical writer. Preserve existing held/reference PRs, game files, main history, and publication gates.
