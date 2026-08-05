# Manual-review queue retained from the Games estate audit

These items are deliberately not included in the two automatic patch stages.
They require a product-placement or copy decision rather than an engineering
guess.

## 1. Medevac Frontier is a homepage game door but not an arcade-manifest entry

Measured state:

- `mattroper1977.github.io/site.json` has a `zone: "games"` door titled
  **Medevac Frontier**, pointing to `/medevac/`.
- `/medevac/` exists and its README describes a complete offline STOL medevac
  flight game.
- `Games/games.json` has no `/medevac/` entry, so the game appears on the
  homepage but not in the browse-all arcade shelf.

Matt/Claude decision:

- **Add it to `games.json`** if every homepage game door should also be in the
  arcade catalogue; or
- **record it as an intentional homepage-only exception** and teach the audit an
  explicit allowlist entry with a reason, rather than leaving an unexplained
  mismatch.

A possible entry shape is preserved below for discussion only. The tag, hue,
placement and art choice must be approved before this becomes a patch:

```json
{
  "icon": "🚁",
  "title": "Medevac Frontier",
  "desc": "Land in a twilight canyon, fly the STOL approach past thermals and canyon walls, guide the litter teams under a running clock, choose how much cargo to risk and clear the rim before the zone is overrun. Works offline with touch and keyboard.",
  "href": "/medevac/",
  "tag": "Reflex",
  "hue": "#F2A24A",
  "featured": false,
  "hero": false,
  "art": "/medevac/medevac_frontier_banner.png"
}
```

Questions to resolve before use:

1. Is `Reflex` the right existing vocabulary, or is a new `Flight`/`Simulation`
   tag intentionally worth minting?
2. Should the homepage door's orange `#F2A24A` be reused even though Apex Pool
   already uses it on the shelf?
3. Is the existing banner the intended 16:9 arcade art, or should a dedicated
   `/assets/cards/medevac-frontier.*` asset be produced?
4. Should it be `featured: false`, preserving all current curated placements?

## 2. Trekkers Trail Runner — Tees Coast has placeholder-length card copy

Current copy:

> Tees Coast edition of Trail Runner.

The audit records this because the line does not explain the distinctive route,
mechanic or reason to choose this edition. Rewriting it safely requires reading
and playing the game rather than extrapolating from the filename. Keep the
current wording until a game-specific review supplies accurate copy.

## 3. Browser interaction depth

The estate run opens the arcade and all 40 games in desktop and mobile/reduced-
motion profiles. It proves load, visible surface and local-resource integrity,
and performs one conservative unobscured start/play interaction where a generic
control can be identified. It does not certify every level, scoring path,
controller mode, save migration or game-over/restart loop. Those belong in
per-game playtest packs, prioritised by usage and complexity.
