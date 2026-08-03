# The Daily Undead

**Your daily Treyarch Zombies challenge**

Players reveal one to three clues, lock in their clue score, choose a game and map without typing, then put the three selected Easter egg steps into chronological order for a gold perfect medal.

The bonus ordering round uses tap-to-rank cards: tapping steps assigns 1, 2, and 3 in sequence, while tapping a selected card removes it and renumbers the remainder. Submission allows one attempt, and an incorrect order cannot be retried.

A correct map awards 50 points with one clue, 20 with two clues, or 10 with three clues. A correct step order doubles that map score and produces a gold **Double Points!** result banner with the map, clue count, and correct chronological order summarized on one screen.

Finished results lead into a dedicated next-round screen with a large live countdown to the next UTC puzzle and a progress-aware reminder to return and keep building the player's Current Round and Points.

Finished results also include a spoiler-free **Share score** action. Supported phones and browsers open the native share sheet; other modern browsers copy the dated result, Current Round, Points, Total Rounds, and canonical game link to the clipboard.

The player also has a browser-local current-round streak. A correct map answer increases it immediately, whether or not the bonus order is correct, while a wrong map answer resets it to zero. Missing a daily map also resets Current Round and Points on the player's next visit. The missed-day screen and Game Over screen offer a revive when the player has enough points. Successful revives cost progressively more during the current run across both loss types: 100, 250, 500, 750, 1,000, 1,500, 2,000, 3,000, 4,000, then 5,000 points. Every later revive in that run remains at the 5,000-point ceiling. If a loss is not revived, the run ends and the revive price resets to 100 points for the next run. A separate Total Rounds count records every correctly identified map and does not reset after a loss. Clearing the site's browser data resets these values.

The game is a dependency-free static site designed to work on GitHub Pages. The catalogue contains 311 ordered steps across 37 answer maps from World at War through Black Ops 7. Nine additional maps without full Easter eggs are selectable but excluded from the answer rotation.

## Run locally

From this folder, start any static file server. Python is already available on most Macs:

```sh
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080). Opening `index.html` directly will not work because browsers block local JSON requests.

To preview another daily puzzle without waiting for tomorrow, add a date:

```text
http://localhost:8080/?date=2026-07-29
```

During local development, the **Dev button – advance a day** control at the bottom of the site advances this preview date by one day while preserving the current time-of-day. The control is enabled only on `localhost` and is removed on the public website.

Progress is saved in the browser separately for each date. Every player receives the next puzzle at 00:00 UTC, and the header countdown shows the time remaining until that worldwide rollover. The site synchronises against its host's clock when possible and falls back to the device clock when offline.

## Run the tests

With Node.js installed:

```sh
npm test
```

The tests cover deterministic daily selection, map availability dates, clue selection, bonus-order checking, catalogue integrity, missed-day progression, revives, future preview protection, and the published page's local assets and privacy-sensitive links.

## Add or update map data

There is one JSON file per map in `data/maps/`. Each map has this shape:

```json
{
  "id": "bo1-example-map",
  "gameId": "bo1",
  "gameTitle": "Black Ops",
  "title": "Example Map",
  "availableFrom": "2026-08-01",
  "steps": [
    { "id": "turn-on-power", "order": 1, "clue": "Turn on the power." },
    { "id": "collect-parts", "order": 2, "clue": "Collect the three device parts." },
    { "id": "activate-device", "order": 3, "clue": "Activate the completed device." }
  ]
}
```

For each map:

1. Create or replace its JSON file. Use unique map and step IDs, at least three steps, and unique chronological `order` numbers. Four or more steps are recommended so repeat appearances can use different clues.
2. Set `gameId` to one of the IDs in `data/maps/index.json`.
3. Add the filename to the `maps` array in `data/maps/index.json`.

Every answer map must include an `availableFrom` field in `YYYY-MM-DD` format. **When adding a new map, set this to a future UTC date, not today.** This prevents a deployment from changing the live puzzle for players who have already started or completed it.

The game deterministically shuffles eligible maps into daily cycles so every map appears before that cycle repeats. Each return appearance advances to a different shuffled three-step combination, then presents those clues in a non-chronological order. Replay variety remains deterministic so a refresh does not unexpectedly replace an in-progress puzzle. Adding or editing content that is already eligible can change generated puzzles, so deploy new maps before their future `availableFrom` date and avoid editing an eligible answer map during a live UTC day.

Maps in `selectionOnlyMaps` inside `data/maps/index.json` appear in the answer grid without requiring a map JSON and never enter the daily rotation. `mapOrder` controls the release order shown within each game. `answerEquivalents` allows The Giant to count as a correct selection when Der Riese is the generated answer; both are then displayed as **Der Riese / The Giant** on the result screens.

## Publish with GitHub Pages

Once this folder is pushed to a GitHub repository:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder, then save.

No build command or GitHub Action is required. The included `CNAME` file connects the Pages site to [thedailyundead.com](https://thedailyundead.com/). Keep that file in the published branch.

## Player data and feedback

Game progress is stored only in the player's browser using local storage. The site has no player accounts, analytics, advertising cookies, or external font requests. Clearing the site's browser data removes the saved game progress on that device.

The footer links to the optional [feedback form](https://tally.so/r/q4XeD7). It opens only when a player chooses it, sends no referring page address, and lets players submit without giving an email address. Screenshots and email addresses are optional. Review and delete form submissions in Tally when they are no longer needed; automatic retention controls require a paid Tally plan. If the form address changes, update the footer link in `index.html` and this README.

## Project layout

```text
index.html             App shell
styles.css             Mobile-first functional styling
assets/fonts/          Locally hosted Barlow fonts and their OFL licence
js/app.js              Screens, interactions, saved progress
js/game-core.js        Seeded daily puzzle and order logic
js/progression.js      Missed-day, revive, and preview rules
data/maps/index.json   Game list and map-file manifest
data/maps/*.json       One content file per map
tests/                 Logic tests
```
