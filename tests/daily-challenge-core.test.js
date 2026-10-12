import test from "node:test";
import assert from "node:assert/strict";
import {
  getOfficialPuzzleType,
  getOtherPuzzleType,
  OFFICIAL_PUZZLE_TYPES,
} from "../js/daily-challenge-core.js";

test("the official puzzle alternates on consecutive UTC dates", () => {
  assert.equal(getOfficialPuzzleType("2026-10-07"), OFFICIAL_PUZZLE_TYPES.WORD);
  assert.equal(getOfficialPuzzleType("2026-10-08"), OFFICIAL_PUZZLE_TYPES.EASTER);
  assert.equal(getOfficialPuzzleType("2026-10-09"), OFFICIAL_PUZZLE_TYPES.WORD);
  assert.equal(getOfficialPuzzleType("2026-10-12"), OFFICIAL_PUZZLE_TYPES.EASTER);
});

test("the unscored puzzle is always the other game", () => {
  assert.equal(getOtherPuzzleType(OFFICIAL_PUZZLE_TYPES.WORD), OFFICIAL_PUZZLE_TYPES.EASTER);
  assert.equal(getOtherPuzzleType(OFFICIAL_PUZZLE_TYPES.EASTER), OFFICIAL_PUZZLE_TYPES.WORD);
});

test("official puzzle assignment rejects invalid dates and puzzle types", () => {
  assert.throws(() => getOfficialPuzzleType("today"), /valid UTC date/);
  assert.throws(() => getOtherPuzzleType("unknown"), /recognised puzzle type/);
});
