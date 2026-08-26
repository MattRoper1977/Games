# Six description rewrites for `games.json` — APPLIED

**Status: APPLIED, under a one-time written delegation (Order FC-Z, Z-D3).**
Opened as a proposal under FC-R because the single writer derived as manual/Matt;
Matt then delegated this specific write in writing. The delegation is quoted verbatim in
the commit message, which is the whole point — *a delegated write that is logged is not the
same act as a quiet hand-edit, and the difference is the log.*

The single-writer ruling of 2026-08-13 is otherwise unchanged, and the writer reverts to
Matt on merge.

## Why this began as a proposal

Order FC-R §2.1 requires the single writer of `games.json` to be derived on evidence before a
byte is written. Derived at tip `2e6e8f4`:

| question | answer | evidence |
|---|---|---|
| Is there a generator that produces `games.json`? | **No** | No tool declares an input that `games.json` is generated *from*. The five `tools/apply_*.py` scripts each apply one specific game's manifest (2c, apexrally, apextennis, olympics, sports rail); none is a general writer. |
| What do the workflows do? | **Validate, not generate** | `validate-games-json.yml` and `pr-canonical-contract.yml` check the file against the Lessons tree. |
| Who has actually written it? | **Matt, by hand** | Last 10 commits touching `games.json`: Matt Roper ×4, MattRoper1977 ×2, Claude ×3 (via PRs #32/#36), one shelf reconciliation. |

That was §2.1's **manual** branch: *write nothing; drop to proposal-only.* FC-R stopped there,
correctly. A fresh derivation at FC-Z reached the same answer — still no generator with a declared
input — so the delegation route applies rather than the generator route.

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

## The defect these rewrites would have walked into — now fixed first

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

**Fixed before these landed, and that sequence was the ruling.** Order FC-Z §Z2 shipped a class
exclusion in the site repo (PR #190, merged `cb435f4`): `category=game` never takes a teaching
pathway facet, consulted before the matcher rather than filtering after it. The set turned out to
be **nine**, not eight — running the instrument across all 717 records found a second Voxel
Frontier record that a remembered list had missed. 558 → 549, delta exactly nine, every other
record byte-identical.

Merging six new descriptions into a classifier that still text-matched "build" and "grow" is how
nine becomes eleven. That is why §Z2 ran first and this PR was gated behind it.

The six texts avoid the trigger words — verified, zero across all six — but that remains a
**workaround, not a fix**, and the fix is the exclusion, not the wording. Whole-field equality is
still the correct instrument and stays deferred behind the A1 tag backfill, which now blocks two
things: A2 pupil card badges and the classifier flip. Never reword a description to dodge a
scanner, and never ban the verb.
