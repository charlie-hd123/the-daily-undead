# The Daily Undead

**Your daily Treyarch Zombies challenge**

Players reveal one to three clues, lock in their clue score, choose a game and map without typing, then put the three selected Easter egg steps into chronological order for a gold perfect medal.

The bonus ordering round uses tap-to-rank cards: tapping steps assigns 1, 2, and 3 in sequence, while tapping a selected card removes it and renumbers the remainder. Submission allows one attempt. An incorrect order fails the game immediately and cannot be retried unless the development replay starts a new map.

A correct map and correct step order produce a gold **Perfect!** result banner with the map, clue count, and correct chronological order summarized on one screen.

The player also has a browser-local streak. A correct map answer increases it immediately, whether or not the bonus order is correct. A wrong map answer resets it to zero. Development replays count as additional plays, and clearing the site's browser data resets the streak.

This first version is a dependency-free static site designed to work on GitHub Pages. Its current answer content comes from `Easter Egg Steps - 22JUL2026.xlsm`: 259 ordered steps across 37 maps from World at War through Black Ops 7. Nine additional maps without full Easter eggs are selectable but excluded from the answer rotation.

## Run locally

From this folder, start any static file server. Python is already available on most Macs:

```sh
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080). Opening `index.html` directly will not work because browsers block local JSON requests.

To preview another daily puzzle without waiting for tomorrow, add a date:

```text
http://localhost:8080/?date=2026-07-21
```

Progress is saved in the browser separately for each date. The date and puzzle selection use the player's local timezone.

Completed games have a **Replay with a different map - Only available whilst game in development** button. It clears that date's saved result and advances through a deterministic shuffle of the available maps. Each replay uses a different map until the pool cycles. When a map returns, it uses a different set of three clues; every available three-step combination is used before one repeats. The current replay is preserved across refreshes.

## Run the tests

With Node.js installed:

```sh
node --test
```

The tests cover deterministic daily selection, map availability dates, clue selection and bonus-order checking.

## Add or update map data

There is one JSON file per map in `data/maps/`. Each map has this shape:

```json
{
  "id": "bo1-example-map",
  "gameId": "bo1",
  "gameTitle": "Black Ops",
  "title": "Example Map",
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

An optional `availableFrom` field in `YYYY-MM-DD` format can delay when a new map enters the daily rotation. Without it, the map is eligible immediately.

The game deterministically chooses an eligible map and a shuffled three-step combination, then presents those clues in a non-chronological order. Replay variety remains deterministic so a refresh does not unexpectedly replace an in-progress puzzle. Adding or editing eligible content can change generated puzzles, so avoid changing the live data midway through a day.

Maps in `selectionOnlyMaps` inside `data/maps/index.json` appear in the answer grid without requiring a map JSON and never enter the daily rotation. `mapOrder` controls the release order shown within each game. `answerEquivalents` allows The Giant to count as a correct selection when Der Riese is the generated answer; both are then displayed as **Der Riese / The Giant** on the result screens.

## Publish with GitHub Pages

Once this folder is pushed to a GitHub repository:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder, then save.

No build command or GitHub Action is required. Relative asset paths make the site work from a project URL such as `https://your-name.github.io/repository-name/`.

## Project layout

```text
index.html             App shell
styles.css             Mobile-first functional styling
js/app.js              Screens, interactions, saved progress
js/game-core.js        Seeded daily puzzle and order logic
data/maps/index.json   Game list and map-file manifest
data/maps/*.json       One content file per map
tests/                 Logic tests
```
