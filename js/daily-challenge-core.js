import { isValidDateKey } from "./game-core.js";

export const OFFICIAL_PUZZLE_TYPES = Object.freeze({
  WORD: "word",
  EASTER: "easter",
});

const ALTERNATION_EPOCH = "2026-10-07";
const ALTERNATION_EPOCH_DAY = Math.floor(Date.parse(`${ALTERNATION_EPOCH}T00:00:00Z`) / 86400000);

export function getOfficialPuzzleType(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid UTC date is required.");
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const offset = ((dayNumber - ALTERNATION_EPOCH_DAY) % 2 + 2) % 2;
  return offset === 0 ? OFFICIAL_PUZZLE_TYPES.WORD : OFFICIAL_PUZZLE_TYPES.EASTER;
}

export function getOtherPuzzleType(type) {
  if (type === OFFICIAL_PUZZLE_TYPES.WORD) return OFFICIAL_PUZZLE_TYPES.EASTER;
  if (type === OFFICIAL_PUZZLE_TYPES.EASTER) return OFFICIAL_PUZZLE_TYPES.WORD;
  throw new Error("A recognised puzzle type is required.");
}
