import test from "node:test";
import assert from "node:assert/strict";
import {
  getOfficialPuzzleType,
  getOtherPuzzleType,
  isPuzzleSessionComplete,
  BALANCED_PUZZLE_LAUNCH_DATE,
  MULTI_PUZZLE_LAUNCH_DATE,
  OFFICIAL_PUZZLE_TYPES,
  browserPuzzleOptions,
  PRODUCTION_THREE_PUZZLE_LAUNCH_DATE,
} from "../js/daily-challenge-core.js";
import { buildDailyWordPuzzle } from '../js/word-puzzle-core.js';
import { workerWords } from '../worker/src/generated-word-catalog.js';
import { puzzleOptions } from '../worker/src/puzzle-environment.js';

const dateAfter = (dateKey, days) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const stagingType = (dateKey) => getOfficialPuzzleType(dateKey, { bloodTies: true });

test('live keeps Fire Works and all issued days, then starts Blood Ties on 26 October', () => {
  const options = browserPuzzleOptions('production');
  assert.deepEqual(options, puzzleOptions({ DEPLOYMENT_ENVIRONMENT: 'production' }));
  assert.equal(PRODUCTION_THREE_PUZZLE_LAUNCH_DATE, '2026-10-26');
  for (let i = 0; i < 365; i++) {
    const date = dateAfter('2025-10-26', i);
    assert.equal(getOfficialPuzzleType(date, options), getOfficialPuzzleType(date), date);
  }
  assert.equal(getOfficialPuzzleType('2026-10-25', options), 'word');
  const today = buildDailyWordPuzzle('2026-10-25', workerWords);
  assert.equal(today.entry.answer, 'Fire Works');
  assert.equal(today.key, '2026-10-25:word:lw-0445:KO');
  assert.equal(getOfficialPuzzleType('2026-10-26', options), 'blood');
  assert.deepEqual(browserPuzzleOptions('staging'), { bloodTies: true, production: false });
});

test('live schedule is stable across instances, balanced, and respects the actual launch history', async () => {
  const options = browserPuzzleOptions();
  const fresh = await import('../js/daily-challenge-core.js?production-schedule');
  const counts = { blood: 0, word: 0, easter: 0 };
  const history = Array.from({ length: 4 }, (_, i) => getOfficialPuzzleType(dateAfter('2026-10-22', i), options));
  const expected = [];
  for (let i = 0; i < 3653; i++) {
    const date = dateAfter('2026-10-26', i);
    const type = getOfficialPuzzleType(date, options);
    assert.notEqual(type, history.at(-1), date);
    history.push(type);
    assert.equal(new Set(history.slice(-5)).size, 3, date);
    counts[type]++;
    if (i < 14) expected.push(type);
  }
  for (const count of Object.values(counts)) assert.ok(count / 3653 > .31 && count / 3653 < .36);
  for (let i = 13; i >= 0; i--) assert.equal(fresh.getOfficialPuzzleType(dateAfter('2026-10-26', i), options), expected[i]);
});

test("balanced staging assignments preserve history and freeze the issued v1 schedule", () => {
  assert.equal(BALANCED_PUZZLE_LAUNCH_DATE, "2026-10-26");
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => stagingType(dateAfter("2026-10-22", i))), ["blood", "word", "easter", "blood"]);
  assert.deepEqual(Array.from({ length: 14 }, (_, i) => stagingType(dateAfter(BALANCED_PUZZLE_LAUNCH_DATE, i))), [
    "easter", "blood", "word", "blood", "easter", "word", "easter",
    "blood", "word", "easter", "word", "easter", "blood", "word",
  ]);
  for (let i = 0; i < 365; i += 1) {
    const date = dateAfter("2025-10-22", i);
    assert.equal(stagingType(date), getOfficialPuzzleType(date), date);
  }
});

test("ten years have no consecutive repeats, no missing game in five days, and an even mix", () => {
  const start = dateAfter(BALANCED_PUZZLE_LAUNCH_DATE, -4);
  const counts = { word: 0, easter: 0, blood: 0 };
  const transitions = new Set();
  const history = [];
  for (let i = 0; i < 3657; i += 1) {
    const date = dateAfter(start, i);
    const type = stagingType(date);
    assert.ok(Object.hasOwn(counts, type), date);
    if (i) {
      assert.notEqual(type, history.at(-1), date);
      transitions.add(`${history.at(-1)}:${type}`);
    }
    history.push(type);
    if (i >= 4) assert.equal(new Set(history.slice(-5)).size, 3, date);
    if (i >= 4) counts[type] += 1;
    // Production's existing two-game schedule is unaffected on every date.
    assert.equal(getOfficialPuzzleType(date), (Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-10-13T00:00:00Z")) / 86400000 % 2 === 0 ? "word" : "easter", date);
  }
  assert.equal(transitions.size, 6, "all six transitions occur instead of a fixed cycle");
  for (const count of Object.values(counts)) assert.ok(count / 3653 > 0.31 && count / 3653 < 0.36, JSON.stringify(counts));
});

test("fresh browser/API instances agree regardless of clock or date query order", async (t) => {
  const deviceA = await import("../js/daily-challenge-core.js?device-a");
  const deviceB = await import("../js/daily-challenge-core.js?device-b");
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2035-12-31T23:59:59Z") });
  const dates = ["2030-02-28", "2026-10-26", "2028-02-29", "2026-10-25", "2027-01-01"];
  const assignments = dates.map((date) => deviceA.getOfficialPuzzleType(date, { bloodTies: true }));
  t.mock.timers.setTime(new Date("2026-10-25T00:00:00Z").getTime());
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    assert.equal(deviceB.getOfficialPuzzleType(dates[i], { bloodTies: true }), assignments[i], dates[i]);
    assert.equal(stagingType(dates[i]), assignments[i], dates[i]);
  }
});

test("the official puzzle alternates on consecutive UTC dates", () => {
  assert.equal(MULTI_PUZZLE_LAUNCH_DATE, "2026-10-13");
  assert.equal(getOfficialPuzzleType("2026-10-12"), OFFICIAL_PUZZLE_TYPES.EASTER);
  assert.equal(getOfficialPuzzleType("2026-10-13"), OFFICIAL_PUZZLE_TYPES.WORD);
  assert.equal(getOfficialPuzzleType("2026-10-14"), OFFICIAL_PUZZLE_TYPES.EASTER);
  assert.equal(getOfficialPuzzleType("2026-10-15"), OFFICIAL_PUZZLE_TYPES.WORD);
});

test("the unscored puzzle is always the other game", () => {
  assert.equal(getOtherPuzzleType(OFFICIAL_PUZZLE_TYPES.WORD), OFFICIAL_PUZZLE_TYPES.EASTER);
  assert.equal(getOtherPuzzleType(OFFICIAL_PUZZLE_TYPES.EASTER), OFFICIAL_PUZZLE_TYPES.WORD);
});

test("official puzzle assignment rejects invalid dates and puzzle types", () => {
  assert.throws(() => getOfficialPuzzleType("today"), /valid UTC date/);
  assert.throws(() => getOtherPuzzleType("unknown"), /recognised puzzle type/);
});

test("Quest Steps completion is recovered from persisted result fields", () => {
  assert.equal(isPuzzleSessionComplete("easter", {
    phase: "result",
    isCorrect: false,
  }), true);
  assert.equal(isPuzzleSessionComplete("easter", {
    phase: "result",
    isCorrect: true,
    bonusComplete: true,
  }), true);
  assert.equal(isPuzzleSessionComplete("easter", {
    phase: "result",
    isCorrect: true,
    bonusFailed: true,
  }), true);
  assert.equal(isPuzzleSessionComplete("easter", {
    phase: "result",
    isCorrect: true,
    bonusComplete: false,
    bonusFailed: false,
  }), false);
  assert.equal(isPuzzleSessionComplete("easter", {
    phase: "clues",
    complete: true,
  }), false);
  assert.equal(isPuzzleSessionComplete("word", { complete: true }), true);
});
