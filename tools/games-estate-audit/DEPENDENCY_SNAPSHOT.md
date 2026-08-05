# Dependency snapshot policy

A Games estate result is valid for the three exact commits recorded in its
`repository-state.txt` and `metadata.json`:

- Games (`games.json` and contracts),
- `mattroper1977.github.io` (arcade, root-hosted games, art and `site.json`),
- Lessons (`/Lessons/...` game targets).

A later commit in either read-only dependency does not invalidate the evidence
for its recorded snapshot, but it does mean the run must be refreshed before it
is described as the current whole-estate result. Counts and target relationships
remain derived at run time; this file does not pin them.
