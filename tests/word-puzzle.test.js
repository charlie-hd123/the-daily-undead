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
  shouldHandleWordShortcut,
  WORD_FAMILIARITY,
} from "../js/word-puzzle-core.js";

const entries = [
  { id: "ray-gun", category: "Wonder Weapons", answer: "Ray Gun", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  { id: "richtofen", category: "Characters", answer: "Edward Richtofen", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  { id: "eisendrache", category: "Maps", answer: "Der Eisendrache", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
];

test("word shortcuts ignore forms, dialogs, browser commands and composition", () => {
  const event = { key: 'r', target: { closest: () => null } };
  assert.equal(shouldHandleWordShortcut(event), true);
  assert.equal(shouldHandleWordShortcut({ ...event, shiftKey: true, key: 'R' }), true);
  for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'isComposing', 'defaultPrevented', 'repeat']) {
    assert.equal(shouldHandleWordShortcut({ ...event, [flag]: true }), false, flag);
  }
  for (const flag of ['presenting', 'modalOpen']) {
    assert.equal(shouldHandleWordShortcut(event, { [flag]: true }), false, flag);
  }
  for (const target of ['input', 'textarea', 'select', '[contenteditable]', '[role="textbox"]']) {
    assert.equal(shouldHandleWordShortcut({ ...event, target: { closest: (selector) => {
      assert.match(selector, /input, textarea, select/);
      return { tagName: target };
    } } }), false, target);
  }
  assert.equal(shouldHandleWordShortcut({ key: 'Enter' }), false);
});

test("the same UTC date produces the same word and starting letters", () => {
  const first = buildDailyWordPuzzle("2026-10-07", entries);
  const second = buildDailyWordPuzzle("2026-10-07", [...entries].reverse());
  assert.deepEqual(first, second);
});

test("the opening Last Words dates use a familiar curated sequence", async () => {
  const source = JSON.parse(await fs.readFile(
    new URL("../data/word-puzzle-demo.json", import.meta.url),
    "utf8",
  ));
  assert.equal(buildDailyWordPuzzle("2026-10-13", source.words).entry.answer, "Edward Richtofen");
  assert.equal(buildDailyWordPuzzle("2026-10-15", source.words).entry.answer, "Juggernog");
  assert.equal(buildDailyWordPuzzle("2026-10-17", source.words).entry.answer, "Mystery Box");
  assert.equal(buildDailyWordPuzzle("2026-10-19", source.words).entry.answer, "Pack-a-Punch");
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

test("starting letters minimise exposed positions in repetition-heavy answers", () => {
  const puzzle = buildDailyWordPuzzle("2026-10-07", [
    { id: "der-riese", category: "Maps", answer: "Der Riese", familiarity: WORD_FAMILIARITY.WELL_KNOWN, availableFrom: "2026-01-01" },
  ]);
  const exposedPositions = getAnswerLetters(puzzle.entry.answer).filter(
    (letter) => puzzle.initialLetters.includes(letter),
  );

  assert.deepEqual(puzzle.initialLetters, ["I", "S"]);
  assert.equal(exposedPositions.length, 2);
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
    [100, 80, 60, 40, 20, 0, 0],
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

test("reshuffled familiarity pools keep answers at least 30 days apart", () => {
  const weightedEntries = [
    ...Array.from({ length: 64 }, (_, index) => ({
      id: `green-cooldown-${index}`,
      category: "Test",
      answer: `Green Cooldown ${String.fromCharCode(65 + (index % 26))}${index}`,
      familiarity: WORD_FAMILIARITY.WELL_KNOWN,
      availableFrom: "2026-01-01",
    })),
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `orange-cooldown-${index}`,
      category: "Test",
      answer: `Orange Cooldown ${String.fromCharCode(65 + index)}`,
      familiarity: WORD_FAMILIARITY.LESS_KNOWN,
      availableFrom: "2026-01-01",
    })),
  ];
  const lastSeen = new Map();
  const start = new Date("2026-10-01T00:00:00Z");

  for (let offset = 0; offset < 500; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const entry = buildDailyWordPuzzle(date.toISOString().slice(0, 10), weightedEntries).entry;
    const previousOffset = lastSeen.get(entry.id);
    if (previousOffset != null) assert.equal(offset - previousOffset >= 30, true);
    lastSeen.set(entry.id, offset);
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

  assert.equal(source.words.length, 562);
  assert.equal(categories.size, 18);
  assert.equal(new Set(answers).size, 562);
  assert.equal(new Set(ids).size, 562);
  assert.equal(familiarity.filter((value) => value === WORD_FAMILIARITY.WELL_KNOWN).length, 171);
  assert.equal(familiarity.filter((value) => value === WORD_FAMILIARITY.LESS_KNOWN).length, 391);
  assert.equal(source.words.every(isPlayableWordEntry), true);
  assert.equal(source.words.every((entry) => typeof entry.description === "string" && entry.description.length > 0), true);
  assert.equal(source.words.find((entry) => entry.id === "lw-0001")?.answer, "Edward Richtofen");
  assert.equal(source.words.find((entry) => entry.id === "lw-0562")?.answer, "Eternal Perks");
  assert.deepEqual(source.excluded, []);
});

test("the completed Last Words view carries the entry description below the answer", async () => {
  const source = await fs.readFile(
    new URL("../js/app.js", import.meta.url),
    "utf8",
  );
  const answerIndex = source.indexOf('<h2 class="final-map-name">');
  const descriptionIndex = source.indexOf('<p class="word-result-description">');

  assert.equal(answerIndex >= 0, true);
  assert.equal(descriptionIndex > answerIndex, true);
  assert.match(source, /description: wordPuzzle\.entry\.description/);
});
