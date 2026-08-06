#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_sports_rail_ruling.py — the single writer for Matt's 2026-08-06 ruling.

THE RULING: "the rail means sports."

Stage 2C put Aurora Links 3D on the shelf but off the Sports rail, on the
reading that the rail was the Apex Sports FRANCHISE (Apex Kick, Apex Pool, Apex
Golf, Apex Tennis, Apex Rally) rather than a genre. That was recorded at the
time as an OPEN QUESTION rather than a settled fact, precisely so it could be
answered by the person whose call it is. It has been. The rail is a genre.

Aurora Links 3D therefore becomes the rail's SIXTH member and its FIRST
non-Apex member. Hue, copy, tag and art are untouched, because the ruling was
about membership.

ONE OTHER FIELD MOVES, AND IT IS A CONSEQUENCE OF THE RULING RATHER THAN A
DRIFT: the icon, from an unchanged-since-launch golf flag to an aurora.

S5 of the Sports rail contract requires rail members not to read as duplicates,
and it checks icons WITHIN THE RAIL. Aurora Links 3D and Apex Golf both carried
the golf flag, which was harmless while they sat on different rails and becomes
the rail's first intra-rail icon collision the moment the sixth member lands.
S5 caught it immediately.

That gate is not a stale pin. It is doing exactly the job it exists for, on a
real problem the ruling created, so the CONTENT moves and the gate does not.
Weakening S5 to admit two golf flags would defeat the one check standing between
this rail and cards that read as the same game — and the ruling's own terms are
that Aurora must continue to differentiate from Apex Golf.

The replacement is derived from the game, not invented: the file says "aurora"
29 times, ships night floodlights and glowing LED balls, and its card art is a
floodlit green beneath a cyan-and-lime aurora. The shelf uses this icon nowhere
else. Hue already separates the two by a wide margin (Golf/Aurora dE00 92.0);
this makes the icons agree with that.

Idempotent: run it twice and the second run reports "already a member".

  python3 tools/apply_sports_rail_ruling.py            # write
  python3 tools/apply_sports_rail_ruling.py --check    # report only
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / 'games.json'
TARGET = '/auroralinks/'
COLLECTION = 'Sports'
ICON_WAS = '\u26f3'          # golf flag, shared with Apex Golf
ICON_NOW = '\U0001f30c'      # milky way — the aurora the game is named for


def main(check_only: bool) -> int:
    raw = MANIFEST.read_text(encoding='utf-8')
    data = json.loads(raw)
    games = data['games']

    entry = next((g for g in games if g.get('href') == TARGET), None)
    if entry is None:
        print(f'FAIL: no manifest entry at {TARGET}')
        return 1

    members_before = [g['title'] for g in games if g.get('collection') == COLLECTION]
    print(f'rail before: {len(members_before)} members — {", ".join(members_before)}')

    if entry.get('collection') == COLLECTION and entry.get('icon') == ICON_NOW:
        print(f'already a member with the new icon: {entry["title"]}')
        print(f'rail stays at {len(members_before)}.')
        return 0

    if check_only:
        print(f'to add: {entry["title"]} -> collection "{COLLECTION}"')
        print(f'to change: icon {entry["icon"]} -> {ICON_NOW} (rail icon collision with Apex Golf)')
        print(f'rail would go {len(members_before)} -> {len(members_before) + 1}')
        return 1

    # Snapshot every other field so the write can PROVE it changed only these two.
    MUTATED = {'collection', 'icon'}
    before_fields = {k: v for k, v in entry.items() if k not in MUTATED}

    if entry.get('icon') != ICON_WAS and entry.get('icon') != ICON_NOW:
        print(f'REFUSING: expected icon {ICON_WAS!r} or {ICON_NOW!r}, found {entry.get("icon")!r}. '
              f'Something else has changed this entry; re-derive before writing.')
        return 1

    entry['collection'] = COLLECTION
    entry['icon'] = ICON_NOW

    out = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    MANIFEST.write_text(out, encoding='utf-8')

    # Read back from disk and assert the change is exactly what was intended.
    check = json.loads(MANIFEST.read_text(encoding='utf-8'))
    written = next(g for g in check['games'] if g.get('href') == TARGET)
    assert written.get('collection') == COLLECTION, 'collection did not persist'
    assert written.get('icon') == ICON_NOW, 'icon did not persist'
    after_fields = {k: v for k, v in written.items() if k not in MUTATED}
    drifted = [k for k in set(before_fields) | set(after_fields)
               if before_fields.get(k) != after_fields.get(k)]
    assert not drifted, ('this change is membership plus the icon that membership collided on, '
                         f'but these changed too: {drifted}')
    assert len(check['games']) == len(games), 'shelf count changed, which this ruling must not do'

    members_after = [g['title'] for g in check['games'] if g.get('collection') == COLLECTION]
    print(f'rail {len(members_before)} -> {len(members_after)}: {", ".join(members_after)}')
    print(f'non-Apex members: {[t for t in members_after if not t.startswith("Apex ")]}')
    print(f'icon {ICON_WAS} -> {ICON_NOW} (rail icon collision with Apex Golf)')
    rail_icons = [g['icon'] for g in check['games'] if g.get('collection') == COLLECTION]
    print(f'rail icons now: {" ".join(rail_icons)} · '
          f'{len(set(rail_icons))}/{len(rail_icons)} distinct')
    print(f'shelf still {len(check["games"])} entries · every field other than '
          f'collection and icon on {written["title"]} byte-identical')
    return 0


if __name__ == '__main__':
    sys.exit(main('--check' in sys.argv))
