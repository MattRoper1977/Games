#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_olympics_landing.py — the single writer for the Global Games landing.

One landing, one writer, three coupled changes that must not happen separately:

  1. Global Games: Championship Simulator joins the shelf (45 -> 46).
  2. It joins the Sports collection, so the rail derives SEVEN.
  3. The `NEW · ` marker TRANSFERS from Relicforge: Fracture Engine to it.

THE HALF-PUBLISH RULE IS WHY THIS IS ONE SCRIPT. The game file merged to main
ahead of this, which put a playable game at /olympics/ that the catalogue did
not know about. That gap is the exact condition R1 forbids, and it closes here
or the estate stays in a state its own red line prohibits. Splitting these three
edits across three commits would reopen it three times.

THE MARKER TRANSFERS, IT IS NOT COPIED. `NEW · ` means "the newest thing that
landed", so it is a property of the shelf rather than of any one game — the
recency convention that moved it Echo Vault -> Fracture moves it Fracture ->
Global Games now. The script asserts a SOLE holder afterwards, because two
holders would make the marker meaningless and one holder that is still Fracture
would mean the transfer silently did not happen.

DERIVED, NOT PINNED. Nothing below reads a count or a membership from this
file's comments. The script derives the shelf size, the current holder and the
rail members from the manifest at the moment it runs, and reports what it found.

THE HUE IS THE GAME'S OWN PIXELS, AND IT TOOK THREE TRIES TO GET RIGHT.

#9c3b36 is the running track — the surface the game fills its lanes with, and
the single most identifying thing it draws. Two floors had to be cleared, and
they are not the same floor:

  the ORDER asked for dE00 >= 10 against nearest shelf neighbours;
  tools/verify_sports_rail.js S3 already required dE00 >= 25 against every
  other rail member and against manifest-adjacent entries.

R9 says a repaired validator is canon, so the stricter existing gate governs and
the order's floor is the weaker of the two. Working to only the stated floor
would have shipped a hue that the rail's own gate rejects.

  attempt 1  the five palette accents the game exposes as CSS tokens. ALL FIVE
             failed even the weaker floor: cyan 4.83, gold 5.40, green 7.13,
             purple 3.06, red 7.53.
  attempt 2  #128cc0, the pool water. Clears the shelf floor at 11.77 and FAILS
             the rail at 14.70 against Apex Tennis #3B6FD4 — two blues on one
             rail. Caught by reading S3 rather than by assuming 10 was the bar.
  attempt 3  #9c3b36, the track. Rail min 27.37 (nearest Apex Rally), adjacent
             45.24 against Fracture, whole-shelf min 19.92 against Neon Turf
             #D02578. Clears both floors with margin.

#47e7ff, the game's primary cyan, clears the RAIL at 33.25 and was rejected
anyway: it sits 4.83 from Neon Sync #22D3EE on the wider shelf. Passing the gate
that runs is not the same as being right.

THE COPY IS THE GAME'S OWN STRINGS. The description is assembled from its meta
description and the nine `category` values in its own EVENT_META. Nothing here
was written to sell it.

Idempotent: run it twice and the second run reports "already landed".

  python3 tools/apply_olympics_landing.py            # write
  python3 tools/apply_olympics_landing.py --check    # report only
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / 'games.json'

HREF = '/olympics/'
TITLE = 'Global Games: Championship Simulator'
MARKER = 'NEW · '
PREV_HOLDER_HREF = '/fracture/'

ENTRY = {
    "icon": "🏟️",
    "title": MARKER + TITLE,
    "desc": (
        "Nine events across track, field, water, ice and snow, played out as one "
        "broadcast championship. Build an athlete's speed, power and stamina, pick a "
        "nation, then run the 100m and the hurdles, jump and throw, swim the 50m "
        "freestyle, shoot the archery round, deliver a curling stone, take three "
        "attempts on the platform and fly the ski jump. Energy carries between days, "
        "personal bests are kept on the device, and every control, sound and graphic "
        "is generated inside the one file."
    ),
    "href": HREF,
    "tag": "Physics",
    "hue": "#9c3b36",
    "featured": False,
    "hero": False,
    "art": "/assets/cards/global-games.svg",
    "collection": "Sports",
}


def load():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


def report(data):
    games = data['games']
    holders = [g['title'] for g in games if g['title'].startswith(MARKER)]
    sports = [g['title'] for g in games if g.get('collection') == 'Sports']
    print(f"  shelf count      : {len(games)}")
    print(f"  NEW· holder(s)   : {holders or 'none'}")
    print(f"  Sports rail      : {len(sports)} -> {', '.join(sports)}")
    print(f"  /olympics/ present: {any(g['href'] == HREF for g in games)}")


def main():
    check_only = '--check' in sys.argv
    data = load()
    games = data['games']

    print('BEFORE')
    report(data)

    if any(g['href'] == HREF for g in games):
        print('\nalready landed — nothing to do')
        return 0

    before_count = len(games)
    prev = [g for g in games if g['href'] == PREV_HOLDER_HREF]
    if len(prev) != 1:
        print(f"\nREFUSING: expected exactly one entry at {PREV_HOLDER_HREF}, found {len(prev)}")
        return 2
    if not prev[0]['title'].startswith(MARKER):
        print(f"\nREFUSING: {PREV_HOLDER_HREF} does not hold the marker; the transfer's "
              f"source is not where this script was told it is. Derive the cause first.")
        return 2

    if check_only:
        print('\n--check: no write')
        return 0

    # 1. strip the marker from the previous holder
    prev_before = dict(prev[0])
    prev[0]['title'] = prev[0]['title'][len(MARKER):]

    # 2. add the new entry, marker attached, immediately before the previous
    #    holder so the newest thing sits where the newest thing sat
    idx = games.index(prev[0])
    games.insert(idx, dict(ENTRY))

    # ---- assertions, before anything is written -------------------------
    holders = [g['title'] for g in games if g['title'].startswith(MARKER)]
    if len(holders) != 1 or not holders[0].endswith(TITLE):
        print(f"\nREFUSING: marker holders after transfer = {holders}")
        return 2
    if len(games) != before_count + 1:
        print(f"\nREFUSING: shelf went {before_count} -> {len(games)}")
        return 2
    # the previous holder must be UNCHANGED apart from its title prefix
    changed = {k for k in prev_before
               if k != 'title' and prev_before[k] != prev[0][k]}
    if changed:
        print(f"\nREFUSING: {PREV_HOLDER_HREF} drifted on {sorted(changed)}")
        return 2
    if prev[0]['title'] != prev_before['title'][len(MARKER):]:
        print("\nREFUSING: the previous holder's title changed by more than the marker")
        return 2

    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n',
                        encoding='utf-8')
    print('\nAFTER')
    report(load())
    print(f"\nwrote {MANIFEST}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
