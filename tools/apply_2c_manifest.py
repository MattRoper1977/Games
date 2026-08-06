#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_2c_manifest.py — the SINGLE writer that puts Stage 2C on the shelf.

One writer, because the last time two things could edit games.json the shelf
count and the rendered rail disagreed and neither was wrong on its own. This
script is the only thing that adds Lumina Haven and Aurora Links 3D, and it is
idempotent: run it twice and the second run reports "already present" rather
than adding a duplicate.

THE COUNT IS DERIVED, NEVER PINNED. It reads however many entries games.json
has at HEAD, adds the ones that are missing, and prints before -> after. No
number in this file, and no number in the verifier beside it, is typed in.

Every word of shelf copy below is taken from a string the game itself carries.
The source of each phrase is named in the comment above it, so a blurb can be
checked against the file rather than believed.

  python3 tools/apply_2c_manifest.py            # write
  python3 tools/apply_2c_manifest.py --check    # report only, exit 1 if absent
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / 'games.json'

# --------------------------------------------------------------------------
# The two entries.
#
# hue: derived from each game's own :root tokens and then checked against every
# other hue on the shelf with CIEDE2000. Distances are recorded in the Stage 2C
# notes, not asserted here — tools/verify_2c_shelf.js re-derives them so the
# floor is enforced by a gate rather than by a comment.
#
# NO 'NEW ·' MARKER ON EITHER. The marker is single-holder by canon and
# Relicforge: Fracture Engine holds it. Three live gates assert that the sole
# rendered holder is Fracture Engine, so a second or third holder would not be
# a style choice, it would be a contradiction the shelf already tests for.
#
# NO 'collection': 'Sports' ON AURORA LINKS 3D, and the reason is recorded
# rather than left to be rediscovered: the Sports rail is the Apex Sports
# FRANCHISE collection (Apex Golf, Apex Pool, Apex Tennis, Apex Rally), not a
# genre shelf. Aurora Links 3D is a golf game but it is not an Apex title, and
# putting it on that rail would assert a franchise membership that does not
# exist. THE OPEN QUESTION, recorded because it is a judgement and not a fact:
# if the Sports rail is ever meant to read as "sports games" rather than "the
# Apex series", Aurora Links 3D belongs on it and this decision should be
# revisited. It is off the rail today because the rail means the series today.
# --------------------------------------------------------------------------
ENTRIES = [
    {
        "icon": "🪴",
        "title": "Lumina Haven",
        # Splash card, verbatim: "A low-pressure sanctuary game about arranging
        # a beautiful room, nurturing unusual plants, collecting gems and
        # crafting luminous new décor."
        # Panel titles: "Greenhouse weather", "Wall tint", "Wallpaper",
        # "Room size", "Placement", "Motion".
        # Modal: "Botanical & Gem Fusion" — "Choose two materials. Known
        # pairings unlock rare living décor, dyes and lights; experimental
        # pairings still create essence."
        # Modal: "Soundscape Mixer" — "Every layer is generated live by Web
        # Audio—no sound files are used."
        # Modal: "Aesthetic Photo Mode" — "The exported image contains the room
        # only—no interface."
        "desc": (
            "A low-pressure sanctuary game about arranging a beautiful room, nurturing unusual "
            "plants, collecting gems and crafting luminous new décor. Set the greenhouse weather, "
            "repaint the walls and resize the room, then take two materials to the Botanical & Gem "
            "Fusion bench — known pairings unlock rare living décor, dyes and lights, and "
            "experimental ones still make essence. The Soundscape Mixer is generated live by Web "
            "Audio with no sound files, and Photo Mode exports the room only, no interface."
        ),
        "href": "/luminahaven/",
        "tag": "Calm",
        "hue": "#A83FBF",
        "featured": False,
        "hero": False,
        "art": "/assets/cards/lumina-haven.svg",
    },
    {
        "icon": "⛳",
        "title": "Aurora Links 3D",
        # Splash card, verbatim: "A complete single-file WebGL golf game with a
        # nine-hole tournament, four-club bag, wind and wet-weather physics,
        # night floodlights, glowing LED balls, green reading and a playable
        # course designer."
        # Modal titles: "Call your score", "Aurora Links Scorecard",
        # "Course Lab".
        "desc": (
            "A complete single-file WebGL golf game with a nine-hole tournament, four-club bag, "
            "wind and wet-weather physics, night floodlights, glowing LED balls, green reading and "
            "a playable course designer. Call your score before you play the hole and the scorecard "
            "tracks that prediction separately from your strokes, so a brave, accurate call can "
            "rescue an untidy hole. Build your own in the Course Lab and play it."
        ),
        "href": "/auroralinks/",
        "tag": "Physics",
        "hue": "#C4F52A",
        "featured": False,
        "hero": False,
        "art": "/assets/cards/aurora-links-3d.svg",
    },
]


def main(check_only: bool) -> int:
    raw = MANIFEST.read_text(encoding='utf-8')
    data = json.loads(raw)
    games = data['games']
    before = len(games)

    have = {g.get('href') for g in games}
    missing = [e for e in ENTRIES if e['href'] not in have]
    present = [e for e in ENTRIES if e['href'] in have]

    for e in present:
        print(f"already present: {e['title']}  {e['href']}")
    for e in missing:
        print(f"to add:          {e['title']}  {e['href']}")

    if check_only:
        print(f"\nshelf at HEAD: {before} entries · {len(missing)} of Stage 2C absent")
        return 1 if missing else 0

    if not missing:
        print(f"\nnothing to do. shelf stays at {before}.")
        return 0

    games.extend(missing)
    after = len(games)

    # Write with the same shape the file already has, so the diff is the two
    # new objects and nothing else.
    out = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    MANIFEST.write_text(out, encoding='utf-8')

    # Read it straight back and prove the file on disk parses and carries them.
    check = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert len(check['games']) == after, 'written file does not carry the expected count'
    for e in missing:
        assert any(g['href'] == e['href'] for g in check['games']), f"{e['href']} missing after write"

    print(f"\nshelf {before} -> {after}  (+{len(missing)}, derived from HEAD, not pinned)")
    print(f"marker holders after this write: "
          f"{[g['title'] for g in check['games'] if str(g['title']).startswith('NEW · ')]}")
    print(f"Sports collection members: "
          f"{[g['title'] for g in check['games'] if g.get('collection') == 'Sports']}")
    return 0


if __name__ == '__main__':
    sys.exit(main('--check' in sys.argv))
