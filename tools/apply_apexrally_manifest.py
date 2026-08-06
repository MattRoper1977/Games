#!/usr/bin/env python3
"""apply_apexrally_manifest.py — put Apex Rally on the shelf, idempotently.

Follows apply_apextennis_manifest.py. One transform, safe to re-run:

  1. upsert the Apex Rally entry (append if absent, replace in place if present,
     collapsing any accidental duplicates onto the first index)

The `NEW · ` release marker is deliberately not owned by this game-specific
transform. If an existing Apex Rally entry carries the marker in its title or
description, that exact value is preserved; the transform never mints, moves or
removes the whole-shelf release slot.

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
        'Read the court before the ball arrives. A rally duel against opponents who '
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
    entry = ENTRY.copy()
    if matches:
        existing = games[matches[0]]
        # Release placement is whole-shelf state, not Apex Rally identity.
        # Preserve it exactly on a re-run so this transform is idempotent both
        # before and after a separate release-marker handover.
        for field in ('title', 'desc'):
            value = existing.get(field)
            if isinstance(value, str) and value.startswith(NEW_PREFIX):
                entry[field] = value
        first = matches[0]
        games[:] = [g for i, g in enumerate(games) if i == first or not is_rally(g)]
        games[next(i for i, g in enumerate(games) if is_rally(g))] = entry
    else:
        games.append(entry)
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
    title_holders = [g['title'] for g in games if g.get('title', '').startswith(NEW_PREFIX)]
    legacy_holders = [g['title'] for g in games if g.get('desc', '').startswith(NEW_PREFIX)]
    sports = [g['title'] for g in games if g.get('collection') == 'Sports']
    print(f'total entries: {len(games)}')
    print(f'Sports collection ({len(sports)}): {", ".join(sports)}')
    print(f'NEW · title holder(s) ({len(title_holders)}): {", ".join(title_holders)}')
    print(f'legacy description holder(s) ({len(legacy_holders)}): {", ".join(legacy_holders)}')
    print(f'art present: {sum(1 for g in games if g.get("art"))}/{len(games)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
