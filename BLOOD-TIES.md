# Blood Ties staging demo

Blood Ties is the third game in the shared Daily Undead application. It is enabled only on local development hosts and the normal staging host. `BLOOD_TIES_DEMO=1` additionally enables its Worker routes in local/staging environments. Production ignores that flag and retains the existing two-game schedule. No production deployment or data migration is part of this demo.

The staging rotation starts on **22 October 2026 UTC**: Blood Ties, Last Words, Quest Steps, then repeats every three days. Earlier assignments are unchanged. After the official round, either remaining game is available just for fun. Just-for-fun games never award Score, Solves or Round progression. Date previews use the existing isolated browser storage and disable account uploads.

## Rules

- Twelve distinct tiles form four connections of three. Select three tiles, then Submit.
- A correct trio moves into a named solved row. The remaining tiles replenish the board layout in a fresh deterministic shuffle. The board starts with all twelve tiles and shrinks as connections are found.
- Three strikes end the puzzle. Each unique incorrect trio adds a red strike and deducts 10 potential points. A correct trio briefly flashes all three circles green, then clears the strikes without restoring potential points. Repeating the same trio in another order costs nothing. Two correct tiles give the existing “one tile away” hint.
- All four connections must be selected and submitted, including the final three tiles.
- Potential points start at 100. A solve awards 100 minus 10 for every incorrect submission across the whole puzzle, including strikes cleared by correct groups. A failed round awards zero and ends the survival run. There is no separate bonus round.
- Results, account recovery, public profiles, leaderboards and yesterday’s official-puzzle statistics use the existing application flows. The server replays the complete attempt transcript to verify completion and score. Duplicate result requests cannot award points twice.

## Shared presentation

Blood Ties uses the existing neutral cards, cyan selection/success, red strike feedback and gold potential scores. Its STRIKES display has three neutral circles, filled red by incorrect submissions and briefly green on a correct group. Just-for-fun play uses the same stats warning and result actions as the other games. Found connections are cyan; automatically revealed or missed connections are neutral, with explicit labels so colour is never the only signal.

Rules version 3 requires all four connections and stores/replays the complete submission history to reconstruct strikes and potential points on refresh. Unfinished legacy saves adopt these rules. Completed version 1/2 saves and already awarded server results retain their original outcomes and scores; pre-update clients remain server-verified under their original rules for historical content only. New content rejects attempts to downgrade the rules. Leaderboard miss counts record all incorrect submissions, so a strike reset cannot turn an imperfect solve into a Perfect Solve.

Yesterday’s Blood Ties summary lives inside the shared statistics grid. Its solve rate stays alongside a compact **View connections** button, which opens a keyboard-accessible answer dialog without expanding the footer. The local/staging marketing pack follows the three-game schedule and can generate a Blood Ties image and copy. Production keeps its existing two-game schedule.

## Database and generator

`js/blood-ties-catalogue.js` contains **only the final 23 October workbook**: 164 categories, 477 distinct answers and 902 eligible memberships from `Blood Ties!A1:U165`, the first worksheet. Definitions, families and difficulty are preserved. The XLSM is read as XML; macros are never run. Imports reject incomplete categories, duplicate IDs, invalid difficulties and formula caches. Whitespace/Unicode and apostrophe-equivalent spellings are canonicalized, so equivalent answers have one visible spelling.

To inspect a new workbook import locally:

```sh
python3 scripts/import-blood-ties.py /path/to/workbook.xlsm
node scripts/generate-blood-ties.mjs
```

Content v2 activates on **23 October 2026 UTC**. It replaces the active catalogue rather than appending to it. `blood-ties-catalogue-v1.js` and `blood-ties-legacy.js` are a historical archive used only before that date, preserving the 22 October official round, account records and yesterday’s answers. No old-only category or answer enters a new board. Today’s official Last Words round is unchanged; the first official Blood Ties round using the final data is 25 October. A future content update needs another version/date boundary rather than editing already assigned boards.

The seeded offline compiler builds 4,096 reproducible boards covering all 164 categories. The compact pool is tied to the workbook SHA-256 and verified for freshness by tests. This avoids expensive board search inside browser startup/Worker requests. Every board has one difficulty-1, two difficulty-2 and one difficulty-3 group, and at most two groups from the same family. Each has four selected connections, three distinct answers each, and at least two answers that also belong to another selected connection. An exact-cover search rejects boards with multiple complete solutions among the four selected connections. Different orders of solving the same partition do not count as different solutions. Connections outside those four are not part of that uniqueness guarantee.

A board has **12 distinct visible labels**, including after normalization. Shared answers appear once, never as two indistinguishable tiles secretly assigned to different groups. Matches use the selected answer values rather than button position; shuffle/solve order cannot change correctness. Overlap creates deduction, not duplicate-owner guesswork.

Daily selection computes shared history from the fixed v2 UTC epoch, independent of device, browser storage, timezone or play order. Categories cannot recur within the preceding **14 calendar days**, and tiles within **seven calendar days**. The 22 October round also seeds the boundary cooldown. These gaps apply even to just-for-fun days, so the three-day official rotation cannot shorten them. Among eligible boards, selection first favours less-used categories, then category gaps up to 42 days and tile gaps up to 21 days, with a date-seeded tie break. It fails explicitly if strict cooldowns cannot be met. All categories participate across the tested three-year schedule. Both browser and Worker import the same generator, pool and catalogue, all included in API release fingerprints.

## Developer controls and release

Use **Advance a day** in the footer to test the rotation. **Return to today** restores normal staging/local progress. **Fresh preview** starts another isolated preview run for the simulated date, retaining previous preview saves and leaving the real account untouched. Blood Ties has a collapsed **Developer · inspect answers** panel showing the UTC date, puzzle identity, four answers and overlap traps. These controls are unavailable in production.

Migration `0015_blood_ties_demo.sql` extends the allowed puzzle types, preserves historical rows and aggregates, adds a separate Blood Ties mistake count, and restores indexes, the aggregate trigger and admin view. It is applied only to local/staging for this task. Production application requires a separate explicit review and authorization.

Migration `0016_blood_ties_strikes.sql` raises the allowed cumulative Blood Ties miss count to seven (the maximum on a failed run after two strike resets). It preserves all result rows and awards and restores the result indexes/admin view. It is also local/staging only; production requires separate authorization.

Use the normal `release:prepare`, committed-candidate checks and `deploy:staging` workflow in STAGING.md. Do not publish main or copy player data between environments.
