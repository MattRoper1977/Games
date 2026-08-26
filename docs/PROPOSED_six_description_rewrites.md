# PROPOSAL — six description rewrites for `games.json`

**Status: PROPOSAL ONLY. `games.json` is not touched in this branch, and this branch does not merge.**

## Why this is a proposal and not a change

Order FC-R §2.1 requires the single writer of `games.json` to be derived on evidence before a
byte is written. Derived at tip `2e6e8f4`:

| question | answer | evidence |
|---|---|---|
| Is there a generator that produces `games.json`? | **No** | No tool declares an input that `games.json` is generated *from*. The five `tools/apply_*.py` scripts each apply one specific game's manifest (2c, apexrally, apextennis, olympics, sports rail); none is a general writer. |
| What do the workflows do? | **Validate, not generate** | `validate-games-json.yml` and `pr-canonical-contract.yml` check the file against the Lessons tree. |
| Who has actually written it? | **Matt, by hand** | Last 10 commits touching `games.json`: Matt Roper ×4, MattRoper1977 ×2, Claude ×3 (via PRs #32/#36), one shelf reconciliation. |

That is §2.1's **manual** branch: *write nothing; drop to proposal-only.* It is also FC-R stop
condition 3 — `games.json` would need a hand-edit. The site repo's own mirror generator records
the same ruling from the other side: the canonical shelf has a single writer, and that writer is
not an agent acting on its own.

So the six rewrites are set out here for Matt to apply or reject. Nothing is applied.

## The six, each re-verified at the pinned tips

Re-verified against the artefacts — **not** carried over on FC's word. FC verified them elsewhere
and that is a hypothesis here (§2.2).

**AUTO-DECISION (Class 3 — how, not what).** §2.2 says "the artefacts in the GAMES repo". They are
not there: this repo holds `games.json`, `index.html`, `tools/` and `afterdark/`. Every one of the
six `href`s resolves into the **Lessons** repo (`/Lessons/Games/…`), pinned at `48436f5`.
Re-verified there instead.

### 1 · Globe Snake
- **now:** `A unique 3D spherical twist on classic mechanics, mapping directional inputs onto non-Euclidean global surfaces.`
- **proposed:** `Snake, but wrapped around a planet. Steer around the globe, stretch your tail longer and hold to sprint — and unlock new skins as you clear planets.`
- **evidence** (`Games/Globe_Snake (1).html`): globe/planet present · `tail` present · sprint is a hold control (`t-sprint`) · a SKINS screen exists · unlock conditions are literally `"Clear Planet 1"` and `"Conquer all 6 planets"`.
- **why:** *non-Euclidean global surfaces* tells a child nothing about what they will do.

### 2 · Neon Snake Overdrive
- **now:** `An optimized, high-performance vector snake arena calibrated for fluid mobile and desktop response pathways.`
- **proposed:** `A neon snake arena. Steer with the arrow keys, WASD or a swipe, eat to get longer and pick up speed, then put your initials on the high-score table.`
- **evidence** (`Neon_Snake_Overdrive.html`): the control line is verbatim from the game — `Arrow keys / WASD or swipe to steer` · `food` · `SPEED` · an input labelled `initials for the local high-score table`.
- **why:** *response pathways* is engineering vocabulary. `optimized` is also the American spelling.

### 3 · Trail Runner
- **now:** `A fast-paced reflex runner navigating procedural terrain hazards. Ideal for a quick motor-skills reset.`
- **proposed:** `A fast reflex runner. Jump the hazards, keep your lives and take on the challenges as your journey goes on.`
- **evidence** (`Trail_Runner.html`): `jump` · `lives` · `obstacle` · a CHALLENGES screen · a YOUR JOURNEY screen.
- **why:** *Ideal for a quick motor-skills reset* is written to an adult about a child.

### 4 · One Guy — minimal edit, one clause
- **now:** `…so pupils compete against their own past best rather than each other.`
- **proposed:** `…so you race your own past best rather than anyone else.`
- **evidence** (`OneGuy.html`): `You race a recording of the last run on this device`; the game's own title is `ONE GUY — beat the ghost`.
- **why:** third-person teacher-voice on a page a child reads. Every mechanic is kept.

### 5 · Kids vs Staff: Showdown
- **now:** `Whole-class team quiz: pupils take on the staff across scored rounds. Class-vs-teacher framing — no individual leaderboard.`
- **proposed:** `Whole-class team quiz: your class takes on the staff across scored rounds. Teams score, not individuals — no individual leaderboard.`
- **evidence** (`KidsVsStaff_Showdown (3).html`): the **only** score containers are `scorePanel kids` and `scorePanel staff`; the award buttons are `kids | staff | both | nobody`; zero occurrences of leaderboard, individual, rank, standings or personal best. The no-individual-scoring claim is verified **positively**, by what the game contains, not by the absence of a word.
- **why:** teacher-voice. The no-individual-leaderboard fact is deliberately kept — it is a real design property, not filler.

### 6 · World Cup: Road to the Three Lions Final — minimal edit, two words
- **now:** `Teacher-driven end-of-term tournament: …`
- **proposed:** `An end-of-term tournament your teacher runs: …`
- **evidence** (`WorldCup_ThreeLions_Final.html`): Argentina / Spain / England; `Three codes open it`; an adult-run show (`Opening Ceremony`, presenter).
- **why:** teacher-voice only. **Not one feature claim is touched** — the VAR twist and the evidence print could not be verified from the artefact's visible text, and an unverifiable claim is not rewritten; but deleting a real feature is worse than leaving it, so only the voice moves.

## The prose standard these were written to

- **Out — outcome and quality claims.** No mastery, no learning outcomes, no *engaging / accessible / easy / builds confidence*.
- **Out — internal engineering vocabulary.** No input latency, draw loop, physics tick, canvas, classifier, facet, record, pathway field. A child reading a games directory is not owed the render loop, and swapping a marketing claim for an engineering noun is not restraint.
- **In — what the player does and what the game does back**, in the reader's words, every clause traceable to the evidence above.

## Read this before applying — a live defect these rewrites would have walked into

The site's search index derives the BUILD / GROW / LAUNCH pathway facet by **matching words against
the game's title, description and href, lowercased first**
(`tools/build_mbm_search_index.py`, `pathway_for` at line 174, `word_match` at line 161, games call
site at line 314). No source record declares a `pathway` field.

Lowercasing destroys the only thing separating the verb from the pathway. **This is not
hypothetical — it is already live.** Eight arcade games currently carry a teaching-pathway facet
that traces to an ordinary English verb in their own description:

| game | filed as | the word that did it |
|---|---|---|
| Biopunk Hive | `GROW` | "**grow** a forbidden containment hive" |
| Apex Tennis | `BUILD` | "then **build** it on court" |
| Aurora Links 3D | `BUILD` | "**Build** your own in the Course Lab" |
| Global Games | `BUILD` | "**Build** an athlete's speed" |
| Lumins | `BUILD` | "dig, **build** and bridge them" |
| Neon Breach | `BUILD` | "into a **build** you choose" |
| The Last Lighthouse | `BUILD` | "**build** your Keeper Record" |
| Voxel Frontier | `BUILD` | "Mine, **build** and explore" |

Earlier drafts of proposals 1 and 2 said *"grow your tail"* and *"eat to grow"*. They would have
been instances nine and ten. The wording above avoids `build`, `grow`, `launch`, `asdan`, `uas`,
`primary`, `gcse`, `igcse` and `tutor` — **but that is a workaround, not a fix**, and the right
answer is not to keep steering descriptions around a bad classifier.

**The fix is not made here, deliberately.** FC-R §2.4 asks for whole-field equality; that is not
available, because no record declares the field — and switching to it would strip the pathway facet
from **558 of 717 records**, measured. Setting the entries explicitly would need a `games.json`
hand-edit, which is stop condition 3. So it is reported with its evidence and left for a pass that
is scoped to it. Never reword a description to dodge a scanner, and never ban the verb.
