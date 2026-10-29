# Blood Ties

Blood Ties is the third game in the shared Daily Undead application. It is available in production and on local/staging hosts. Production uses the separate production-v1 daily schedule: every issued assignment through 25 October 2026 stays unchanged, including Last Words / Fire Works on 25 October; Blood Ties is the official round on 26 October, followed by balanced random three-game selection seeded from actual live history. `BLOOD_TIES_DEMO=1` still controls Worker availability in local/staging. Production never enables fixture activity or date-preview controls.

The staging rotation started on **22 October 2026 UTC**: Blood Ties, Last Words, Quest Steps. From **26 October 2026 UTC**, the shared daily selector uses a balanced random schedule: no consecutive game repeats, every rolling five-day window includes all three games, and selection favours games played less in the preceding 14 days. Everyone receives the same game and puzzle for each UTC date, including after refresh or switching devices. The date-seeded v1 schedule includes preceding assignments at its boundary; its rules/seed remain fixed to preserve issued days. Assignments through 25 October are unchanged. After the official round, either remaining game is available just for fun. Just-for-fun games never award Score, Solves or Round progression. Date previews use the existing isolated browser storage and disable account uploads.

## Rules

- Twelve distinct tiles form four connections of three. Select three tiles, then Submit.
- A correct trio moves into a named solved row. The remaining tiles replenish the board layout in a fresh deterministic shuffle. The board starts with all twelve tiles and shrinks as connections are found.
- Three strikes end the puzzle. Each unique incorrect trio adds a red strike and deducts 10 potential points. A correct trio briefly flashes all three circles green, then clears the strikes without restoring potential points. Repeating the same trio in another order costs nothing. Two correct tiles give the existing “one tile away” hint.
- All four connections must be selected and submitted, including the final three tiles.
- Potential points start at 100. A solve awards 100 minus 10 for every incorrect submission across the whole puzzle, including strikes cleared by correct groups. A failed round awards zero and ends the survival run. There is no separate bonus round.
- Results, account recovery, public profiles, leaderboards and yesterday’s official-puzzle statistics use the existing application flows. The server replays the complete attempt transcript to verify completion and score. Duplicate result requests cannot award points twice.

## Shared presentation

Blood Ties uses the existing neutral cards, cyan selection/success, red strike feedback and gold potential scores. Its STRIKES display has three neutral circles, filled red by incorrect submissions and briefly green on a correct group. Just-for-fun play uses the same stats warning and result actions as the other games. Found connections use the brand’s violet in compact, left-aligned rows, with a single tick at the top left and an expandable information button. Connection numbers remain in accessible labels only. The result page shows the connection rows directly below its banner, without a repeated Blood Ties heading. Titles and answers retain their existing text sizes; removing the extra label/disclosure rows and tightening spacing saves height. The shared Round Survived result banner is unchanged. A prominent 0–4 counter and four filling segments sit above the board; selection instructions are part of the puzzle description. Automatically revealed or missed connections are neutral, with explicit accessible labels and different symbols so colour is never the only signal.

Rules version 3 requires all four connections and stores/replays the complete submission history to reconstruct strikes and potential points on refresh. Unfinished legacy saves adopt these rules. Completed version 1/2 saves and already awarded server results retain their original outcomes and scores; pre-update clients remain server-verified under their original rules for historical content only. New content rejects attempts to downgrade the rules. Leaderboard miss counts record all incorrect submissions, so a strike reset cannot turn an imperfect solve into a Perfect Solve.

Yesterday’s Blood Ties summary lives inside the shared statistics grid. Its solve rate stays alongside a compact **View connections** button, which opens a keyboard-accessible answer dialog without expanding the footer. The local/staging marketing pack follows the three-game schedule and can generate a Blood Ties image and copy. Production marketing follows production-v1, preserving live history before the 26 October activation.

## Database and generator

`js/blood-ties-catalogue.js` contains the final 23 October workbook's 164 categories, 477 distinct answers and 902 eligible memberships from `Blood Ties!A1:U165`, the first worksheet, plus reviewed discovery classifications for the staging trial below. Definitions, families, difficulty and eligible memberships are preserved. The XLSM is read as XML; macros are never run. Imports reject incomplete categories, duplicate IDs, invalid difficulties and formula caches. Whitespace/Unicode and apostrophe-equivalent spellings are canonicalized, so equivalent answers have one visible spelling.

### Discovery trial: content v4, 30 October 2026

This candidate is for staging play-testing. V3 catalogue/boards are archived byte-for-byte; every issued puzzle through 29 October, its key and saved results remain unchanged. The new policy applies from 30 October, including isolated future-day previews. Scoring, strikes, daily game rotation and account data are unchanged.

All 164 categories and their original eligible answers remain playable: 21 `name` themes, 98 `familiar` categories and 45 `specialist` categories. The compiler requires all 164 categories, all 477 distinct tiles and all 902 category/answer memberships in its 16,384-board pool. It fails explicitly if anything would disappear. This prepared pool size is not a count of all theoretical combinations. No AI runs during compilation or gameplay, and no new factual memberships were invented.

**Discovery policy v2** responds to the initial trial being too easy to sort by object type. Thirty-eight categories have an additional `reasoning` classification: recognisable `function`, visible `trait`, or `weapon-class`. Examples are hiding/reviving effects, snowy/island maps and rifles/handguns. These editorial judgments permit related items to appear together without relying on release dates or a hidden quest mechanic for every distinction. All other categories remain available with suitable partners.

Each board needs at least two approachable connections (name clues or a reviewed common link), rather than a mandatory spelling giveaway. At most one trio may repeat the same clue word across all three labels, such as three Staff/Bow/Primis names. Name themes have `theme` and `words` metadata; only an actual trio carrying all three clues is counted as name-led. Other draws can use any original eligible answer and become familiar-knowledge trios for that board.

All six possible finishing pairs are reviewed. Same-kind pairs are permitted when at least one has a reviewed common link or a name clue. Two opaque fact-based groups of the same kind remain disallowed. Boards have at most one specialist group. If a specialist finishes beside a group of the same kind, or overlaps any partner despite a different workbook family, its clearer partner must have exactly three visible eligible matches within those six tiles, so that partner does not itself require an obscure distinction to choose among four candidates. Identical name themes such as two god-name groups remain disallowed. Trait groups also reject literal name contradictions, such as a lighthouse category beside a non-member map literally named Lighthouse; the pairing is rejected without inventing a new membership.

The original catalogue-wide unique physical solution, four-visible-match ceiling, similar-pair exclusions, at most two overlap tiles and at most six rejected trios remain. The compiler allows at most a quarter of the pool to have no selected-category overlap. Daily selection favours openings with related items on most days, uses category coverage and recency to retain variety, and prefers one subtle overlap on ordinary days versus gentler date-seeded days. This encourages decisions, not a guaranteed mistake quota or a score distribution.

Strict 14-calendar-day category and seven-day tile gaps remain across the content boundary. The three-year schedule checks full category coverage, every finishing pair and those actual gaps. Regression checks also require most scheduled openings to have no more than one isolated object-type group and most days to contain a competing membership. These are structural difficulty measures, not measured player success rates. Play-testing remains the source of truth for perceived difficulty.

The owner's Excel copy is deliberately pending until play-testing is approved. The current catalogue records the classifications for the later update. Future worksheets use W **Discovery** (`name`, `familiar`, `specialist`), X **Name theme**, Y **Clue words** separated by `|`, and optional Z **Common link** (`function`, `trait`, `weapon-class`, or `none`). Name rows require X/Y. Common links cannot be attached to specialist rows. Unchanged existing IDs retain reviewed metadata when importing an older copy without the new columns. New/renamed categories must supply a discovery classification. Import and compilation need no AI or external research; factual memberships remain the editor's responsibility.

### Adding future categories and new-map content

Add rows to the **first worksheet** of the existing workbook. Each row needs a unique, permanent Connection ID, a name, a precise definition, a family, difficulty 1/2/3, and at least three distinct eligible tiles (up to 16). Keep existing IDs for existing categories; add new IDs for new connections. Use the same spelling for a shared tile in every row. You can also add a new map to existing categories whose definitions it genuinely meets. Column V can contain a research link.

You do not need to write game code or hand-pick boards when adding categories. Give the updated workbook and a future start date to the developer, or run:

```sh
python3 scripts/import-blood-ties.py /path/to/workbook.xlsm --effective-date YYYY-MM-DD
node scripts/generate-blood-ties.mjs
```

The importer increments the content version and automatically archives the previous catalogue and compiled pool. It refuses past dates, conflicting historical snapshots, incomplete categories and an uncompiled preceding import. The compiler rebuilds the content registry automatically, checks every category can participate and names uncovered categories if it cannot satisfy the safeguards. It does not quietly weaken fairness or cooldowns. Review ambiguous or version-specific facts before deploying the complete candidate to staging through STAGING.md. Future content changes do not need a database migration.

### Content history and fairness

Content v2 started on **23 October 2026 UTC**, using the final workbook rather than appending to the older data. The first official round with that workbook was 25 October. `blood-ties-catalogue-v1.js` / `blood-ties-legacy.js`, and `blood-ties-catalogue-v2.js` / `blood-ties-boards-v2.js` / `blood-ties-v2.js` preserve the already issued rounds, puzzle IDs, save restoration and scoring. Never edit those historical snapshots.

Content v3 starts on **26 October 2026 UTC**, with the same 164-category workbook and improved generation. Under the balanced daily schedule, the first official Blood Ties round with these safeguards is **27 October**. Today’s 25 October puzzle remains exactly as issued. `blood-ties-content.js` routes dates to their immutable content snapshots; later workbook imports add further dated versions automatically.

For historical content v3, the seeded offline compiler builds 4,096 reproducible boards covering every active category. The compact pool is tied to the workbook SHA-256 and verified for freshness by tests. This avoids expensive board search inside browser startup/Worker requests. Each board has one difficulty-1, two difficulty-2 and one difficulty-3 group, with at most two from the same family and three distinct answers per group. Fairness policy 2 refines the pending 26 October release before its activation; all issued dates through 25 October stay unchanged. New boards must pass these checks:

- Exactly one complete tile partition across the **whole active catalogue**, using four distinct categories. Alternative category labels for an identical accepted trio and different solve orders do not count as alternative physical partitions.
- The difficulty-1 category has exactly three eligible tiles visible, providing a clear starting connection.
- **No catalogue category, including an unchosen one, has more than four eligible tiles visible.** That permits at most one extra matching tile, avoiding the five-candidate situations shown in the distraction/black-hole and Chronicles/Fire Pit examples.
- Selected categories cannot share two or more answers covering at least half of the smaller category's full eligible list. This excludes broad/narrow category pairs even when a particular tile draw happens to look manageable. The categories themselves remain in the game, paired with other connections.
- A board can have zero, one or two overlapping tiles. Two must be spread across categories because of the four-match ceiling. At most six distinct catalogue-supported trios can be rejected by the intended solution. There is no longer a forced minimum of two overlaps.

The compiler caps boards with no overlap at 256 of the 4,096 pool entries and two-overlap boards at 512, leaving room for mostly single-overlap boards without imposing a minimum on the rare two-overlap pattern. The actual pool contains 256 / 3,812 / 28 boards with zero / one / two overlapping tiles. The selector also uses a date-seeded preference for gentle days versus small deduction puzzles, so it does not simply use up the easiest boards first; this never overrides category coverage, either cooldown or a fairness safeguard. In the three-year schedule test, 158 days have no selected-category overlap, 936 have one and two have two. Difficulty and knowledge are still needed on lighter days. Earlier fairness-policy snapshots retain their original ranking.

These checks preserve challenging overlaps while removing catalogue-known alternative complete answers. Catalogue memberships still need editorial accuracy: an unrecorded real-world connection cannot be detected automatically. The compiler reports actual ambiguity counts rather than treating two overlapping tiles as a complete difficulty measure. It also refuses to overwrite an already issued pool with different boards; later refinements need a new future content version. Identical regeneration and read-only freshness checks remain available.

A board has **12 distinct visible labels**, including after normalization. Shared answers appear once, never as two indistinguishable tiles secretly assigned to different groups. Matches use the selected answer values rather than button position; shuffle/solve order cannot change correctness. Overlap creates deduction, not duplicate-owner guesswork.

Daily selection computes shared history from fixed UTC content boundaries, independent of device, browser storage, timezone or play order. Categories cannot recur within the preceding **14 calendar days**, and tiles within **seven calendar days**. Every issued day from 22 October seeds the first fairness boundary; later versions retain the complete preceding history. These gaps apply even to just-for-fun days. Among eligible boards, selection first favours less-used categories, then balances category gaps up to 42 days, tile gaps up to 21 days, ambiguity and pair repetition, with a date-seeded tie break. It fails explicitly if strict cooldowns cannot be met. All active categories participate across the tested three-year schedule. Browser and Worker import the same dated generator, pools and catalogues, all included in API release fingerprints.

## Developer controls and release

Use **Advance a day** in the footer to test the rotation. **Return to today** restores normal staging/local progress. **Fresh preview** starts another isolated preview run for the simulated date, retaining previous preview saves and leaving the real account untouched. Blood Ties has a collapsed **Developer · inspect answers** panel showing the UTC date, puzzle identity, four answers and overlap traps. These controls are unavailable in production.

Migration `0015_blood_ties_demo.sql` extends the allowed puzzle types, preserves historical rows and aggregates, adds a separate Blood Ties mistake count, and restores indexes, the aggregate trigger and admin view. It is applied only to local/staging for this task. Production application requires a separate explicit review and authorization.

Migration `0016_blood_ties_strikes.sql` raises the allowed cumulative Blood Ties miss count to seven (the maximum on a failed run after two strike resets). It preserves all result rows and awards and restores the result indexes/admin view. It is also local/staging only; production requires separate authorization.

Use the normal `release:prepare`, committed-candidate checks and `deploy:staging` workflow in STAGING.md. Do not publish main or copy player data between environments.
