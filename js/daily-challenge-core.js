import { isValidDateKey } from "./game-core.js";

export const OFFICIAL_PUZZLE_TYPES = Object.freeze({
  WORD: "word",
  EASTER: "easter",
  BLOOD: "blood",
});

export const MULTI_PUZZLE_LAUNCH_DATE = "2026-10-13";
const ALTERNATION_EPOCH = MULTI_PUZZLE_LAUNCH_DATE;
const ALTERNATION_EPOCH_DAY = Math.floor(Date.parse(`${ALTERNATION_EPOCH}T00:00:00Z`) / 86400000);

export const THREE_PUZZLE_LAUNCH_DATE = "2026-10-22";
export function getOfficialPuzzleType(dateKey, { bloodTies = false } = {}) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid UTC date is required.");
  if (bloodTies && dateKey >= THREE_PUZZLE_LAUNCH_DATE) {
    const offset = Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${THREE_PUZZLE_LAUNCH_DATE}T00:00:00Z`)) / 86400000);
    return ["blood", "word", "easter"][offset % 3];
  }
  if (dateKey < MULTI_PUZZLE_LAUNCH_DATE) return OFFICIAL_PUZZLE_TYPES.EASTER;
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const offset = ((dayNumber - ALTERNATION_EPOCH_DAY) % 2 + 2) % 2;
  return offset === 0 ? OFFICIAL_PUZZLE_TYPES.WORD : OFFICIAL_PUZZLE_TYPES.EASTER;
}

export function getOtherPuzzleType(type) {
  if (type === OFFICIAL_PUZZLE_TYPES.WORD) return OFFICIAL_PUZZLE_TYPES.EASTER;
  if (type === OFFICIAL_PUZZLE_TYPES.EASTER) return OFFICIAL_PUZZLE_TYPES.WORD;
  if (type === OFFICIAL_PUZZLE_TYPES.BLOOD) return OFFICIAL_PUZZLE_TYPES.WORD;
  throw new Error("A recognised puzzle type is required.");
}

export function isPuzzleSessionComplete(type, session) {
  if (!session) return false;
  if (type === OFFICIAL_PUZZLE_TYPES.WORD || type === OFFICIAL_PUZZLE_TYPES.BLOOD) return Boolean(session.complete);
  if (type === OFFICIAL_PUZZLE_TYPES.EASTER) {
    return Boolean(
      session.phase === "result" && (
        session.isCorrect === false ||
        session.bonusComplete ||
        session.bonusFailed
      ),
    );
  }
  return false;
}
