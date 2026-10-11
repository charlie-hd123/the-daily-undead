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
  WORD_FAMILIARITY,
} from "../js/word-puzzle-core.js";

const entries = [
  { id: "ray-gun", category: "Wonder Weapons", answer: "Ray Gun", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  { id: "richtofen", category: "Characters", answer: "Edward Richtofen", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  { id: "eisendrache", category: "Maps", answer: "Der Eisendrache", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
];

test("the same UTC date produces the same word and starting letters", () => {
  const first = buildDailyWordPuzzle("2026-10-07", entries);
  const second = buildDailyWordPuzzle("2026-10-07", [...entries].reverse());
  assert.deepEqual(first, second);
});

test("a vowel and consonant start in the answer without revealing its first letter", () => {
  for (let day = 1; day <= 20; day += 1) {
    const dateKey = `2026-10-${String(day).padStart(2, "0")}`;
    const puzzle = buildDailyWordPuzzle(dateKey, entries);
    const letters = getAnswerLetters(puzzle.entry.answer);
    assert.equal(puzzle.initialLetters.length, 2);
    assert.equal(new Set(puzzle.initialLetters).size, 2);
    assert.equal(puzzle.initialLetters.every((letter) => letters.includes(letter)), true);
    assert.equal(puzzle.initialLetters.includes(letters[0]), false);
    assert.equal(puzzle.initialLetters.some((letter) => "AEIOU".includes(letter)), true);
    assert.equal(puzzle.initialLetters.some((letter) => !"AEIOU".includes(letter)), true);
  }
});

test("answers without an eligible vowel still never reveal their first letter", () => {
  const puzzle = buildDailyWordPuzzle("2026-10-07", [
    { id: "agartha", category: "Story & Lore", answer: "Agartha", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  ]);

  assert.equal(puzzle.initialLetters.length, 2);
  assert.equal(puzzle.initialLetters.includes("A"), false);
});

test("a returning word can receive a different pair of starting letters", () => {
  const repeatedWord = [entries[1]];
  const startingPairs = new Set();

  for (let day = 1; day <= 20; day += 1) {
    const dateKey = `2026-10-${String(day).padStart(2, "0")}`;
    startingPairs.add(buildDailyWordPuzzle(dateKey, repeatedWord).initialLetters.join(""));
  }

  assert.equal(startingPairs.size > 1, true);
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

test("letter-only entries require at least three distinct A-Z letters", () => {
  assert.equal(isPlayableWordEntry({ id: "song-115", category: "Songs", answer: "115", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" }), false);
  assert.equal(isPlayableWordEntry({ id: "aaa", category: "Test", answer: "AAA", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" }), false);
  assert.equal(isPlayableWordEntry({ id: "abab", category: "Test", answer: "ABAB", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" }), false);
  assert.equal(isPlayableWordEntry(entries[0]), true);
  assert.equal(isPlayableWordEntry({ ...entries[0], category: "" }), false);
  assert.equal(isPlayableWordEntry({ ...entries[0], familiarity: "orange" }), false);
  assert.equal(isPlayableWordEntry({ ...entries[0], availableFrom: "soon" }), false);
  assert.deepEqual(getDistinctAnswerLetters("DG-2"), ["D", "G"]);
});

test("words enter and leave the rotation only on their configured dates", () => {
  const scheduled = {
    id: "scheduled-word",
    category: "Test",
    answer: "Mystery Box",
    familiarity: WORD_FAMILIARITY.WELL_KNOWN,
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
    { id: "future", category: "Test", answer: "Mystery Box", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-10-08" },
  ]);

  assert.deepEqual(withFutureWord, original);
});

test("the daily rotation selects four well-known words for every less-known word", () => {
  const weightedEntries = [
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `green-${index}`,
      category: "Test",
      answer: `Green Answer ${String.fromCharCode(65 + index)}`,
      familiarity: WORD_FAMILIARITY.WELL_KNOWN,
      availableFrom: "2026-01-01",
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `orange-${index}`,
      category: "Test",
      answer: `Orange Answer ${String.fromCharCode(65 + index)}`,
      familiarity: WORD_FAMILIARITY.LESS_KNOWN,
      availableFrom: "2026-01-01",
    })),
  ];
  const start = new Date("2026-10-01T00:00:00Z");
  const selected = Array.from({ length: 50 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    return buildDailyWordPuzzle(date.toISOString().slice(0, 10), weightedEntries).entry;
  });

  assert.equal(selected.filter((entry) => entry.familiarity === WORD_FAMILIARITY.WELL_KNOWN).length, 40);
  assert.equal(selected.filter((entry) => entry.familiarity === WORD_FAMILIARITY.LESS_KNOWN).length, 10);
  for (let index = 0; index < selected.length; index += 5) {
    assert.equal(
      selected.slice(index, index + 5).filter(
        (entry) => entry.familiarity === WORD_FAMILIARITY.LESS_KNOWN,
      ).length,
      1,
    );
  }
});

test("the staging catalogue gives every word permanent scheduling metadata", async () => {
  const source = JSON.parse(await fs.readFile(
    new URL("../data/word-puzzle-demo.json", import.meta.url),
    "utf8",
  ));
  const categories = new Set(source.words.map((entry) => entry.category));
  const answers = source.words.map((entry) => entry.answer.toUpperCase());
  const ids = source.words.map((entry) => entry.id);

  const familiarity = source.words.map((entry) => entry.familiarity);

  assert.equal(source.words.length, 551);
  assert.equal(categories.size, 10);
  assert.equal(new Set(answers).size, 551);
  assert.equal(new Set(ids).size, 551);
  assert.equal(familiarity.filter((value) => value === WORD_FAMILIARITY.WELL_KNOWN).length, 164);
  assert.equal(familiarity.filter((value) => value === WORD_FAMILIARITY.LESS_KNOWN).length, 387);
  assert.equal(source.words.every(isPlayableWordEntry), true);
  assert.equal(source.words.find((entry) => entry.id === "lw-0001")?.answer, "Edward Richtofen");
  assert.equal(source.words.find((entry) => entry.id === "lw-0551")?.answer, "Eternal Perks");
  assert.deepEqual(source.excluded, []);
});
