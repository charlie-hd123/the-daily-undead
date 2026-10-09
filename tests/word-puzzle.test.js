import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildDailyWordPuzzle,
  calculateWordPoints,
  getAnswerLetters,
  getDistinctAnswerLetters,
  isPlayableWordEntry,
  isWordAvailableOnDate,
  isWordSolved,
} from "../js/word-puzzle-core.js";

const entries = [
  { id: "ray-gun", category: "Wonder Weapons", answer: "Ray Gun", availableFrom: "2026-01-01" },
  { id: "richtofen", category: "Characters", answer: "Edward Richtofen", availableFrom: "2026-01-01" },
  { id: "eisendrache", category: "Maps", answer: "Der Eisendrache", availableFrom: "2026-01-01" },
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

test("word points follow the configured ladder and reach zero on the fifth mistake", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map(calculateWordPoints),
    [100, 50, 40, 20, 10, 0, 0],
  );
});

test("all occurrences of a guessed letter count as revealed", () => {
  assert.equal(isWordSolved("Banana", ["B", "A", "N"]), true);
  assert.equal(isWordSolved("Ray Gun", ["R", "A", "Y", "G", "U"]), false);
  assert.equal(isWordSolved("Ray Gun", ["R", "A", "Y", "G", "U", "N"]), true);
});

test("letter-only entries require at least two distinct A-Z letters", () => {
  assert.equal(isPlayableWordEntry({ id: "song-115", category: "Songs", answer: "115", availableFrom: "2026-01-01" }), false);
  assert.equal(isPlayableWordEntry({ id: "aaa", category: "Test", answer: "AAA", availableFrom: "2026-01-01" }), false);
  assert.equal(isPlayableWordEntry(entries[0]), true);
  assert.equal(isPlayableWordEntry({ ...entries[0], category: "" }), false);
  assert.equal(isPlayableWordEntry({ ...entries[0], availableFrom: "soon" }), false);
  assert.deepEqual(getDistinctAnswerLetters("DG-2"), ["D", "G"]);
});

test("words enter and leave the rotation only on their configured dates", () => {
  const scheduled = {
    id: "scheduled-word",
    category: "Test",
    answer: "Mystery Box",
    availableFrom: "2026-10-10",
    retiredFrom: "2026-10-12",
  };

  assert.equal(isWordAvailableOnDate(scheduled, "2026-10-09"), false);
  assert.equal(isWordAvailableOnDate(scheduled, "2026-10-10"), true);
  assert.equal(isWordAvailableOnDate(scheduled, "2026-10-11"), true);
  assert.equal(isWordAvailableOnDate(scheduled, "2026-10-12"), false);
});

test("future words cannot change an already scheduled daily puzzle", () => {
  const dateKey = "2026-10-07";
  const original = buildDailyWordPuzzle(dateKey, entries);
  const withFutureWord = buildDailyWordPuzzle(dateKey, [
    ...entries,
    { id: "future", category: "Test", answer: "Mystery Box", availableFrom: "2026-10-08" },
  ]);

  assert.deepEqual(withFutureWord, original);
});

test("the staging catalogue gives every word permanent scheduling metadata", async () => {
  const source = JSON.parse(await fs.readFile(
    new URL("../data/word-puzzle-demo.json", import.meta.url),
    "utf8",
  ));
  const categories = new Set(source.words.map((entry) => entry.category));
  const answers = source.words.map((entry) => entry.answer.toUpperCase());
  const ids = source.words.map((entry) => entry.id);

  assert.equal(source.words.length, 90);
  assert.equal(categories.size, 10);
  assert.equal(new Set(answers).size, 90);
  assert.equal(new Set(ids).size, 90);
  assert.equal(source.words.every(isPlayableWordEntry), true);
  assert.equal(source.words.find((entry) => entry.id === "word-0083")?.answer, "Lullaby of a Deadman");
  assert.deepEqual(source.excluded, []);
});
