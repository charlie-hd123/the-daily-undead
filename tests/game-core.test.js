import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyPuzzle,
  getAnswerDisplayTitle,
  getLocalDateKey,
  isAcceptedMapSelection,
  isCorrectOrder,
  isValidDateKey,
  orderMapsForGame,
  toggleOrderedSelection,
} from "../js/game-core.js";

const maps = [
  {
    id: "old-map",
    availableFrom: "2025-01-01",
    steps: [
      { id: "a", order: 1, clue: "First" },
      { id: "b", order: 2, clue: "Second" },
      { id: "c", order: 3, clue: "Third" },
      { id: "d", order: 4, clue: "Fourth" },
    ],
  },
  {
    id: "another-map",
    availableFrom: "2025-01-01",
    steps: [
      { id: "h", order: 1, clue: "First" },
      { id: "i", order: 2, clue: "Second" },
      { id: "j", order: 3, clue: "Third" },
    ],
  },
  {
    id: "future-map",
    availableFrom: "2030-01-01",
    steps: [
      { id: "e", order: 1, clue: "First" },
      { id: "f", order: 2, clue: "Second" },
      { id: "g", order: 3, clue: "Third" },
    ],
  },
];

test("the same date creates the same daily puzzle", () => {
  const first = buildDailyPuzzle("2026-07-20", maps);
  const second = buildDailyPuzzle("2026-07-20", maps);

  assert.equal(first.key, second.key);
  assert.deepEqual(first.displayedSteps, second.displayedSteps);
});

test("future maps are excluded and exactly three clues are selected", () => {
  const puzzle = buildDailyPuzzle("2026-07-20", maps);

  assert.notEqual(puzzle.map.id, "future-map");
  assert.equal(puzzle.displayedSteps.length, 3);
});

test("replay rotation changes the map and cycles through the eligible pool", () => {
  const firstPlay = buildDailyPuzzle("2026-07-20", maps, 0);
  const firstReplay = buildDailyPuzzle("2026-07-20", maps, 1);
  const secondReplay = buildDailyPuzzle("2026-07-20", maps, 2);

  assert.notEqual(firstPlay.map.id, firstReplay.map.id);
  assert.equal(firstPlay.map.id, secondReplay.map.id);
});

test("a map uses every three-clue combination before repeating one", () => {
  const singleMap = [maps[0]];
  const clueSets = Array.from({ length: 4 }, (_, replayIndex) =>
    buildDailyPuzzle("2026-07-20", singleMap, replayIndex)
      .displayedSteps.map((step) => step.id)
      .sort()
      .join(","),
  );

  assert.equal(new Set(clueSets).size, 4);
});

test("the displayed order starts differently from the bonus answer", () => {
  const puzzle = buildDailyPuzzle("2026-07-20", maps);

  assert.notDeepEqual(
    puzzle.displayedSteps.map((step) => step.id),
    puzzle.chronologicalSteps.map((step) => step.id),
  );
});

test("bonus order checking requires the exact chronological order", () => {
  const puzzle = buildDailyPuzzle("2026-07-20", maps);
  const answer = puzzle.chronologicalSteps.map((step) => step.id);

  assert.equal(isCorrectOrder(answer, puzzle.chronologicalSteps), true);
  assert.equal(isCorrectOrder([...answer].reverse(), puzzle.chronologicalSteps), false);
});

test("step selection assigns order and removes a tapped selection", () => {
  let selection = toggleOrderedSelection([], "a");
  selection = toggleOrderedSelection(selection, "b");
  selection = toggleOrderedSelection(selection, "c");

  assert.deepEqual(selection, ["a", "b", "c"]);
  assert.deepEqual(toggleOrderedSelection(selection, "b"), ["a", "c"]);
  assert.deepEqual(toggleOrderedSelection(selection, "d"), selection);
});

test("date helpers use YYYY-MM-DD local dates", () => {
  assert.equal(getLocalDateKey(new Date(2026, 6, 20)), "2026-07-20");
  assert.equal(isValidDateKey("2026-07-20"), true);
  assert.equal(isValidDateKey("2026-02-30"), false);
});

test("selectable maps follow the catalogue order within each game", () => {
  const selectableMaps = [
    { id: "later", gameId: "bo3", title: "Later" },
    { id: "other-game", gameId: "bo2", title: "Other" },
    { id: "bonus", gameId: "bo3", title: "Bonus" },
    { id: "first", gameId: "bo3", title: "First" },
  ];

  assert.deepEqual(
    orderMapsForGame(selectableMaps, "bo3", ["first", "bonus", "later"]).map(
      (map) => map.id,
    ),
    ["first", "bonus", "later"],
  );
});

test("The Giant is accepted for Der Riese and uses the shared display title", () => {
  const equivalents = [
    {
      answerMapId: "waw-der-riese",
      acceptedMapIds: ["waw-der-riese", "bo3-the-giant"],
      displayTitle: "Der Riese / The Giant",
    },
  ];
  const derRiese = { id: "waw-der-riese", title: "Der Riese" };

  assert.equal(isAcceptedMapSelection("waw-der-riese", derRiese.id, equivalents), true);
  assert.equal(isAcceptedMapSelection("bo3-the-giant", derRiese.id, equivalents), true);
  assert.equal(isAcceptedMapSelection("bo3-shadows-of-evil", derRiese.id, equivalents), false);
  assert.equal(getAnswerDisplayTitle(derRiese, equivalents), "Der Riese / The Giant");
});
