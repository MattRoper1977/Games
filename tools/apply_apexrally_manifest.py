#!/usr/bin/env python3
"""apply_apexrally_manifest.py — put Apex Rally on the shelf, idempotently.

Follows apply_apextennis_manifest.py. Two transforms, both safe to re-run:

  1. upsert the Apex Rally entry (append if absent, replace in place if present,
     collapsing any accidental duplicates onto the first index)
  2. move the `NEW · ` prefix onto Apex Rally and off everything else

The second one is a repair as much as a transform. The standing convention is
that at most one entry carries the prefix; the manifest currently has two (Apex
Kick and Apex Pool), so re-running this settles it rather than adding a third.
`NEW ACT II` on Glitch Clash is a different string and is deliberately left
alone — only the exact `NEW · ` prefix is moved.

Apex Rally joins the Sports rail by the inherited mechanism: the `collection`
field, the same one the other four Apex games use. No second mechanism is built,
and the entry stays in the whole-shelf catalogue — Sports is additive.

Usage:  python3 tools/apply_apexrally_manifest.py [--check]
        --check exits 3 if the manifest would change, writing nothing.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parents[1] / 'games.json'
NEW_PREFIX = 'NEW · '

ENTRY = {
    'icon': '⚔️',
    'title': 'Apex Rally',
    'desc': (
        'NEW · Read the court before the ball arrives. A rally duel against opponents who '
        'adapt as you learn them — aim, time and spin every shot, bank Apex Focus by reading '
        'the bounce early, then finish the point from the baseline or at the net. Works offline.'
    ),
    'href': '/apexrally/',
    'tag': 'Physics',
    'hue': '#FF737C',
    'featured': False,
    'hero': False,
    'art': '/assets/cards/apex-rally.svg',
    'collection': 'Sports',
}


def transform(doc: dict) -> dict:
    games = doc.get('games')
    if not isinstance(games, list):
        raise SystemExit('games[] missing')

    def is_rally(g):
        return g.get('title') == ENTRY['title'] or g.get('href') == ENTRY['href']

    matches = [i for i, g in enumerate(games) if is_rally(g)]
    if matches:
        first = matches[0]
        games[:] = [g for i, g in enumerate(games) if i == first or not is_rally(g)]
        games[next(i for i, g in enumerate(games) if is_rally(g))] = ENTRY.copy()
    else:
        games.append(ENTRY.copy())

    # exactly one NEW · holder, and it is Apex Rally
    for g in games:
        if is_rally(g):
            continue
        desc = g.get('desc', '')
        if desc.startswith(NEW_PREFIX):
            g['desc'] = desc[len(NEW_PREFIX):]
    return doc


def render(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + '\n'


def main() -> int:
    before = MANIFEST.read_text(encoding='utf-8')
    after = render(transform(json.loads(before)))

    if '--check' in sys.argv:
        if before != after:
            print('apply_apexrally_manifest: manifest would change (not idempotent yet)')
            return 3
        print('apply_apexrally_manifest: no change — manifest is already settled')
        return 0

    MANIFEST.write_text(after, encoding='utf-8')
    games = json.loads(after)['games']
    holders = [g['title'] for g in games if g.get('desc', '').startswith(NEW_PREFIX)]
    sports = [g['title'] for g in games if g.get('collection') == 'Sports']
    print(f'total entries: {len(games)}')
    print(f'Sports collection ({len(sports)}): {", ".join(sports)}')
    print(f'NEW · holder(s) ({len(holders)}): {", ".join(holders)}')
    print(f'art present: {sum(1 for g in games if g.get("art"))}/{len(games)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
