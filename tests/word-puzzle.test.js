import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildDailyWordPuzzle,
  calculateWordPoints,
  getAnswerLetters,
  getDistinctAnswerLetters,
  isPlayableWordEntry,
  isWordSolved,
} from "../js/word-puzzle-core.js";

const entries = [
  { id: "ray-gun", category: "Wonder Weapons", answer: "Ray Gun" },
  { id: "richtofen", category: "Characters", answer: "Edward Richtofen" },
  { id: "eisendrache", category: "Maps", answer: "Der Eisendrache" },
];

test("the same UTC date produces the same word and starting letter", () => {
  const first = buildDailyWordPuzzle("2026-10-07", entries);
  const second = buildDailyWordPuzzle("2026-10-07", [...entries].reverse());
  assert.deepEqual(first, second);
});

test("the starting letter exists in the answer but never reveals its first letter", () => {
  for (let day = 1; day <= 20; day += 1) {
    const dateKey = `2026-10-${String(day).padStart(2, "0")}`;
    const puzzle = buildDailyWordPuzzle(dateKey, entries);
    const letters = getAnswerLetters(puzzle.entry.answer);
    assert.equal(letters.includes(puzzle.initialLetter), true);
    assert.notEqual(puzzle.initialLetter, letters[0]);
  }
});

test("word points fall by 20 and reach zero on the fifth mistake", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map(calculateWordPoints),
    [100, 80, 60, 40, 20, 0, 0],
  );
});

test("all occurrences of a guessed letter count as revealed", () => {
  assert.equal(isWordSolved("Banana", ["B", "A", "N"]), true);
  assert.equal(isWordSolved("Ray Gun", ["R", "A", "Y", "G", "U"]), false);
  assert.equal(isWordSolved("Ray Gun", ["R", "A", "Y", "G", "U", "N"]), true);
});

test("letter-only entries require at least two distinct A-Z letters", () => {
  assert.equal(isPlayableWordEntry({ id: "song-115", answer: "115" }), false);
  assert.equal(isPlayableWordEntry({ id: "aaa", answer: "AAA" }), false);
  assert.equal(isPlayableWordEntry({ id: "ray-gun", answer: "Ray Gun" }), true);
  assert.deepEqual(getDistinctAnswerLetters("DG-2"), ["D", "G"]);
});

test("the staging demo imports every playable spreadsheet answer", async () => {
  const source = JSON.parse(await fs.readFile(
    new URL("../data/word-puzzle-demo.json", import.meta.url),
    "utf8",
  ));
  const answers = Object.values(source.categories).flat();
  assert.equal(Object.keys(source.categories).length, 10);
  assert.equal(answers.length, 99);
  assert.equal(new Set(answers.map((answer) => answer.toUpperCase())).size, 99);
  assert.deepEqual(source.excluded, [{
    answer: "115",
    reason: "The letter-only demo requires at least two distinct A-Z letters.",
  }]);
});
