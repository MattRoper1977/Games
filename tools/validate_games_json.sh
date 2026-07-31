#!/usr/bin/env bash
#
# validate_games_json.sh — the games.json house rules, enforced in CI
#
# The Charcoal deploy hit a live merge conflict in games.json and the fix was
# done by hand. The manifest's contract — exactly one hero, unique identifiers,
# complete entries, resolvable hrefs — was until now enforced only by care. This
# moves it into automation, the way the safeguarding contract moved server-side.
#
# Required field set (DERIVED from the live manifest — every entry shares exactly
# these eight, and there is no id/slug field):
#     icon · title · desc · href · tag · hue · featured · hero
#
# href resolution: hrefs are site-relative and point into the Lessons repo
# (/Lessons/Games/Foo.html -> <LESSONS_DIR>/Games/Foo.html). Resolution is done
# against a local Lessons tree, never the network — so it needs no token and no
# rate limit. CI clones the public Lessons repo anonymously into _lessons; a
# local run points LESSONS_DIR at an existing Lessons checkout.
#
# Usage:   tools/validate_games_json.sh [path-to-games.json] [path-to-lessons-tree]
#          LESSONS_DIR=/path/to/lessons tools/validate_games_json.sh
#
# Exits 0 if every check passes; non-zero with a clear message on the first
# failure. node + standard POSIX tools only — no third-party dependencies.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$ROOT/games.json}"
LESSONS_DIR="${LESSONS_DIR:-${2:-$ROOT/_lessons}}"

[ -f "$TARGET" ] || { echo "FAIL: target not found: $TARGET" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "FAIL: node is required but not on PATH" >&2; exit 1; }

echo "validate_games_json: checking $TARGET"
echo "                     (Lessons tree: $LESSONS_DIR)"

node - "$TARGET" "$LESSONS_DIR" <<'NODE'
const fs = require('fs'), path = require('path');
const TARGET = process.argv[2], LESSONS = process.argv[3];
function fail(m){ console.error('FAIL: ' + m); process.exit(1); }
function ok(m){ console.log('  ok  ' + m); }

// 1 · PARSES as valid JSON, with a games array.
//     Anchored to JSON.parse actually succeeding — not a substring probe.
let j;
try { j = JSON.parse(fs.readFileSync(TARGET, 'utf8')); }
catch (e) { fail('games.json does not parse as JSON — ' + e.message); }
const gs = Array.isArray(j.games) ? j.games : null;
if (!gs) fail('top-level "games" array is missing or not an array');
ok('parses as valid JSON; "games" is an array (' + gs.length + ' entries)');

// 2 · EXACTLY ONE HERO.
//     Anchored to strict boolean hero === true, so a truthy/substring value can
//     never satisfy it. The holder is NOT vetoed — a deliberate handover is
//     Matt's call — only the *count* is enforced. The holder is logged.
const heroes = gs.filter(g => g && g.hero === true);
if (heroes.length !== 1)
  fail('expected exactly one hero (hero === true), found ' + heroes.length +
       (heroes.length ? ': ' + heroes.map(g => g.title).join(', ') : ''));
ok('exactly one hero — currently "' + heroes[0].title + '" (holder not vetoed; Matt\'s call)');

// 3 · NO DUPLICATES across identity-bearing fields.
//     Anchored to full field-VALUE equality (a count per exact value), never a
//     substring. id and slug are checked too, defensively: they are absent from
//     this manifest today, so those checks are vacuous but future-proof.
function dupsOf(field){
  const present = gs.filter(g => g && Object.prototype.hasOwnProperty.call(g, field));
  if (!present.length) return { absent: true, dups: [] };
  const seen = Object.create(null), dups = [];
  present.forEach(g => { const v = String(g[field]); seen[v] = (seen[v] || 0) + 1; });
  Object.keys(seen).forEach(v => { if (seen[v] > 1) dups.push(v + ' ×' + seen[v]); });
  return { absent: false, dups };
}
['id','slug','title','href'].forEach(field => {
  const r = dupsOf(field);
  if (!r.absent && r.dups.length) fail('duplicate ' + field + '(s): ' + r.dups.join('; '));
});
ok('no duplicate ids / slugs / titles / hrefs (id, slug absent today; title, href unique)');

// 4 · EVERY ENTRY COMPLETE against the derived required field set.
//     Anchored to hasOwnProperty of each exact key plus a type/non-empty check —
//     strings must be non-empty, booleans must be real booleans (false is valid,
//     not "empty").
const REQUIRED = ['icon','title','desc','href','tag','hue','featured','hero'];
const STRINGF  = ['icon','title','desc','href','tag','hue'];
const BOOLF    = ['featured','hero'];
gs.forEach((g, i) => {
  if (g === null || typeof g !== 'object' || Array.isArray(g)) fail('entry #' + i + ' is not an object');
  const label = '"' + (g.title || '?') + '" (#' + i + ')';
  REQUIRED.forEach(k => { if (!Object.prototype.hasOwnProperty.call(g, k)) fail('entry ' + label + ' missing required field: ' + k); });
  STRINGF.forEach(k => { if (typeof g[k] !== 'string' || g[k].trim() === '') fail('entry ' + label + ' field "' + k + '" must be a non-empty string'); });
  BOOLF.forEach(k => { if (typeof g[k] !== 'boolean') fail('entry ' + label + ' field "' + k + '" must be a boolean'); });
});
ok('every entry carries all required fields [' + REQUIRED.join(', ') + '], non-empty');

// 5 · EVERY HREF RESOLVES to a real file in the Lessons tree.
//     Anchored to fs.existsSync of the exact decoded target path — a broken or
//     renamed game file fails here. Refuses to silently skip: a missing Lessons
//     tree is a hard failure, not a pass.
if (!fs.existsSync(LESSONS) || !fs.statSync(LESSONS).isDirectory())
  fail('Lessons tree not found at "' + LESSONS + '" — set LESSONS_DIR (CI clones MattRoper1977/Lessons into _lessons)');
const unresolved = [], rootHosted = [];
gs.forEach(g => {
  const h = g.href || '';
  // Root-hosted games (Voxel Frontier, Apex Kick, Medevac Frontier) live in the
  // SITE repo at /<name>/, not in the Lessons tree, so there is nothing here to
  // resolve them against. They are checked structurally and listed rather than
  // failed — silently rejecting them is what made this check red the moment the
  // estate started shipping games outside Lessons.
  if (!h.startsWith('/Lessons/')) {
    if (!/^\/[A-Za-z0-9._-]+\/$/.test(h)) {
      unresolved.push('"' + g.title + '" href is neither under /Lessons/ nor a well-formed root path: ' + h);
    } else {
      rootHosted.push('"' + g.title + '" -> ' + h);
    }
    return;
  }
  const rel = decodeURIComponent(h.replace(/^\/Lessons\//, ''));
  if (!fs.existsSync(path.join(LESSONS, rel))) unresolved.push('"' + g.title + '" -> missing target: ' + h);
});
if (unresolved.length) fail('unresolvable href(s):\n    ' + unresolved.join('\n    '));
ok((gs.length - rootHosted.length) + ' Lessons href(s) resolve to real files in the Lessons tree');
if (rootHosted.length) {
  console.log('  ok  ' + rootHosted.length + ' root-hosted href(s), checked structurally (SITE repo, not Lessons):');
  rootHosted.forEach(r => console.log('        ' + r));
}

// 6 · SANITY FLOOR — manifest non-empty, entry count printed.
//     The printed count is also what keeps the homepage arcade number honest.
if (gs.length < 1) fail('manifest is empty (0 entries)');
console.log('  ok  sanity floor: manifest non-empty, ' + gs.length + ' entries');

console.log('PASS: games.json satisfies the manifest contract (' + gs.length + ' entries)');
NODE
