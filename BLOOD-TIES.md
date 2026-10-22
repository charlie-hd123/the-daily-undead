# Blood Ties staging demo

Blood Ties is the third game in the shared Daily Undead application. It is enabled only on local development hosts and the normal staging host. `BLOOD_TIES_DEMO=1` additionally enables its Worker routes in local/staging environments. Production ignores that flag and retains the existing two-game schedule. No production deployment or data migration is part of this demo.

The staging rotation starts on **22 October 2026 UTC**: Blood Ties, Last Words, Quest Steps, then repeats every three days. Earlier assignments are unchanged. After the official round, either remaining game is available just for fun. Just-for-fun games never award Score, Solves or Round progression. Date previews use the existing isolated browser storage and disable account uploads.

## Rules

- Twelve distinct tiles form four connections of three. Select three tiles, then Submit.
- A correct trio moves into a named solved row. The remaining tiles replenish the board layout in a fresh deterministic shuffle. The board starts with all twelve tiles and shrinks as connections are found.
- Three strikes end the puzzle. Each unique incorrect trio adds a red strike and deducts 10 potential points. A correct trio briefly flashes all three circles green, then clears the strikes without restoring potential points. Repeating the same trio in another order costs nothing. Two correct tiles give the existing “one tile away” hint.
- After three correct connections, the final group reveals automatically.
- Potential points start at 100. A solve awards 100 minus 10 for every incorrect submission across the whole puzzle, including strikes cleared by correct groups. A failed round awards zero and ends the survival run. There is no separate bonus round.
- Results, account recovery, public profiles, leaderboards and yesterday’s official-puzzle statistics use the existing application flows. The server replays the complete attempt transcript to verify completion and score. Duplicate result requests cannot award points twice.

## Shared presentation

Blood Ties uses the existing neutral cards, cyan selection/success, red strike feedback and gold potential scores. Its STRIKES display has three neutral circles, filled red by incorrect submissions and briefly green on a correct group. Just-for-fun play uses the same stats warning and result actions as the other games. Found connections are cyan; automatically revealed or missed connections are neutral, with explicit labels so colour is never the only signal.

Rules version 2 stores/replays the complete submission history to reconstruct strikes and potential points on refresh. Unfinished legacy saves adopt these rules. Completed version 1 saves and already awarded server results retain their original outcomes and scores; pre-update clients remain server-verified under version 1. The daily board identity and frozen catalogue are unchanged. Leaderboard miss counts record all incorrect submissions, so a strike reset cannot turn an imperfect solve into a Perfect Solve.

Yesterday’s Blood Ties summary lives inside the shared statistics grid. Its solve rate stays alongside a compact **View 4 connections** button, which opens a keyboard-accessible answer dialog without expanding the footer. The local/staging marketing pack follows the three-game schedule and can generate a Blood Ties image and copy. Production keeps its existing two-game schedule.

## Database and generator

`js/blood-ties-catalogue.js` contains the 51 eligible connections imported from the **first worksheet only** of the supplied workbook. Blank cells and rows with fewer than three unique eligible answers are excluded. Category definitions and difficulty are retained, with the original research links as provenance. The workbook’s incomplete or provisional research is accepted as demo content, not independently certified.

To inspect a new workbook import locally:

```sh
python3 scripts/import-blood-ties.py /path/to/workbook.xlsx
```

The demo generator and catalogue are versioned together as v1. Keep this shipped catalogue frozen while v1 accounts have saved attempts. A future content release must preserve the old catalogue/generator for historical dates and activate the new version on a future UTC date; do not silently regenerate existing puzzle identities from a changed workbook.

The seeded generator first builds a reproducible pool of boards. Every board has four selected connections, three unique assigned answers each, and at least two answers that also belong to another selected connection. An exact-cover search rejects boards with multiple complete solutions among the four selected connections. Different orders of solving the same partition do not count as different solutions. Connections outside those four are not part of that uniqueness guarantee.

Daily selection computes shared history from a fixed UTC epoch, independent of device, browser storage or play order. Categories and tiles cannot recur within the preceding three calendar days, including the previous official Blood Ties round. Among eligible boards it minimizes tile reuse from days four through seven. It fails explicitly if cooldowns cannot be met, rather than quietly allowing an ambiguous or repetitive board. Both browser and Worker import the same generator and catalogue.

## Developer controls and release

Use **Advance a day** in the footer to test the rotation. **Return to today** restores normal staging/local progress. **Fresh preview** starts another isolated preview run for the simulated date, retaining previous preview saves and leaving the real account untouched. Blood Ties has a collapsed **Developer · inspect answers** panel showing the UTC date, puzzle identity, four answers and overlap traps. These controls are unavailable in production.

Migration `0015_blood_ties_demo.sql` extends the allowed puzzle types, preserves historical rows and aggregates, adds a separate Blood Ties mistake count, and restores indexes, the aggregate trigger and admin view. It is applied only to local/staging for this task. Production application requires a separate explicit review and authorization.

Migration `0016_blood_ties_strikes.sql` raises the allowed cumulative Blood Ties miss count to seven (the maximum on a failed run after two strike resets). It preserves all result rows and awards and restores the result indexes/admin view. It is also local/staging only; production requires separate authorization.

Use the normal `release:prepare`, committed-candidate checks and `deploy:staging` workflow in STAGING.md. Do not publish main or copy player data between environments.
