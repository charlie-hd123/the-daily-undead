import { createRng, hashString, isValidDateKey } from "./game-core.js";

export const OFFICIAL_PUZZLE_TYPES = Object.freeze({
  WORD: "word",
  EASTER: "easter",
  BLOOD: "blood",
});

export const MULTI_PUZZLE_LAUNCH_DATE = "2026-10-13";
const ALTERNATION_EPOCH = MULTI_PUZZLE_LAUNCH_DATE;
const ALTERNATION_EPOCH_DAY = Math.floor(Date.parse(`${ALTERNATION_EPOCH}T00:00:00Z`) / 86400000);

export const THREE_PUZZLE_LAUNCH_DATE = "2026-10-22";
export const BALANCED_PUZZLE_LAUNCH_DATE = "2026-10-26";
export const PRODUCTION_THREE_PUZZLE_LAUNCH_DATE = "2026-10-26";
const DAY_MS = 86400000;
const BALANCED_EPOCH = Date.parse(`${BALANCED_PUZZLE_LAUNCH_DATE}T00:00:00Z`);
const PUZZLE_TYPES = Object.freeze(["blood", "word", "easter"]);

function historicalPuzzleType(dateKey, bloodTies) {
  if (bloodTies && dateKey >= THREE_PUZZLE_LAUNCH_DATE) {
    const offset = Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${THREE_PUZZLE_LAUNCH_DATE}T00:00:00Z`)) / 86400000);
    return ["blood", "word", "easter"][offset % 3];
  }
  if (dateKey < MULTI_PUZZLE_LAUNCH_DATE) return OFFICIAL_PUZZLE_TYPES.EASTER;
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const offset = ((dayNumber - ALTERNATION_EPOCH_DAY) % 2 + 2) % 2;
  return offset === 0 ? OFFICIAL_PUZZLE_TYPES.WORD : OFFICIAL_PUZZLE_TYPES.EASTER;
}

// Seed the new schedule with actual preceding assignments, including the launch
// boundary. This append-only cache is an optimisation, never player/device state.
const HISTORY_DAYS = 14;
const balancedHistory = Array.from({ length: HISTORY_DAYS }, (_, index) => {
  const dateKey = new Date(BALANCED_EPOCH + (index - HISTORY_DAYS) * DAY_MS).toISOString().slice(0, 10);
  return historicalPuzzleType(dateKey, true);
});
// Live starts from its actual two-game history. Keep this separate from the
// already-issued staging v1 schedule; its first overdue game is Blood Ties.
const productionHistory = Array.from({ length: HISTORY_DAYS }, (_, index) => {
  const dateKey = new Date(BALANCED_EPOCH + (index - HISTORY_DAYS) * DAY_MS).toISOString().slice(0, 10);
  return historicalPuzzleType(dateKey, false);
});

function balancedPuzzleType(dateKey, history = balancedHistory, version = 'v1') {
  const target = HISTORY_DAYS + Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - BALANCED_EPOCH) / DAY_MS);
  while (history.length <= target) {
    const recent = history.slice(-HISTORY_DAYS);
    const yesterday = recent.at(-1);
    // At most one game can be absent from the last four valid days. It must
    // appear today so every rolling five-day window contains all three games.
    const overdue = PUZZLE_TYPES.find((type) => !recent.slice(-4).includes(type));
    const candidates = PUZZLE_TYPES.filter((type) => type !== yesterday);
    const counts = PUZZLE_TYPES.map((type) => recent.filter((played) => played === type).length);
    const maximum = Math.max(...counts);
    const weights = candidates.map((type) => (maximum - counts[PUZZLE_TYPES.indexOf(type)] + 1) ** 2);
    const scheduledDate = new Date(BALANCED_EPOCH + (history.length - HISTORY_DAYS) * DAY_MS).toISOString().slice(0, 10);
    // Keep this version/seed and historical rules fixed after release. A future
    // rule change needs a new dated boundary, preserving already issued puzzles.
    let draw = createRng(hashString(`daily-puzzle-schedule:${version}:${scheduledDate}`))() * weights.reduce((sum, weight) => sum + weight, 0);
    let selected = candidates.at(-1);
    for (let index = 0; index < candidates.length; index += 1) {
      draw -= weights[index];
      if (draw < 0) { selected = candidates[index]; break; }
    }
    history.push(overdue || selected);
  }
  return history[target];
}

export function getOfficialPuzzleType(dateKey, { bloodTies = false, production = false } = {}) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid UTC date is required.");
  if (production) {
    return bloodTies && dateKey >= PRODUCTION_THREE_PUZZLE_LAUNCH_DATE
      ? balancedPuzzleType(dateKey, productionHistory, 'production-v1')
      : historicalPuzzleType(dateKey, false);
  }
  if (bloodTies && dateKey >= BALANCED_PUZZLE_LAUNCH_DATE) return balancedPuzzleType(dateKey);
  return historicalPuzzleType(dateKey, bloodTies);
}

export function browserPuzzleOptions(environment) {
  return { bloodTies: true, production: !['local', 'staging'].includes(environment) };
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
