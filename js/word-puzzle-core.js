import { createRng, getUtcDateKey, hashString, isValidDateKey, shuffle } from "./game-core.js";

export const WORD_FAMILIARITY = Object.freeze({
  WELL_KNOWN: "well_known",
  LESS_KNOWN: "less_known",
});

const LESS_KNOWN_INTERVAL_DAYS = 5;
const LESS_KNOWN_CADENCE_SLOT = LESS_KNOWN_INTERVAL_DAYS - 1;
const REPEAT_COOLDOWN_DAYS = 30;
const ROTATION_EPOCH_DAY_NUMBER = Math.floor(Date.parse("2026-01-01T00:00:00Z") / 86400000);

export function normalizeLetter(value) {
  const letter = String(value || "").toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : null;
}

export function getAnswerLetters(answer) {
  return String(answer || "").toUpperCase().match(/[A-Z]/g) || [];
}

export function getDistinctAnswerLetters(answer) {
  return [...new Set(getAnswerLetters(answer))];
}

export function isPlayableWordEntry(entry) {
  return (
    typeof entry?.id === "string" &&
    entry.id.length > 0 &&
    typeof entry?.category === "string" &&
    entry.category.length > 0 &&
    typeof entry?.answer === "string" &&
    Object.values(WORD_FAMILIARITY).includes(entry.familiarity) &&
    isValidDateKey(entry.availableFrom) &&
    (entry.retiredFrom == null ||
      (isValidDateKey(entry.retiredFrom) && entry.retiredFrom > entry.availableFrom)) &&
    getDistinctAnswerLetters(entry.answer).length >= 3
  );
}

export function isWordAvailableOnDate(entry, dateKey) {
  return (
    isPlayableWordEntry(entry) &&
    isValidDateKey(dateKey) &&
    entry.availableFrom <= dateKey &&
    (entry.retiredFrom == null || dateKey < entry.retiredFrom)
  );
}

function getUtcDayNumber(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function getTierSelectionIndex(dayNumber, targetFamiliarity) {
  const cadenceBlock = Math.floor(dayNumber / LESS_KNOWN_INTERVAL_DAYS);
  const cadenceSlot = positiveModulo(dayNumber, LESS_KNOWN_INTERVAL_DAYS);
  return targetFamiliarity === WORD_FAMILIARITY.LESS_KNOWN
    ? cadenceBlock
    : (cadenceBlock * (LESS_KNOWN_INTERVAL_DAYS - 1)) + cadenceSlot;
}

function getFamiliaritySelection(dateKey, playable) {
  const dayNumber = getUtcDayNumber(dateKey);
  const cadenceSlot = positiveModulo(dayNumber, LESS_KNOWN_INTERVAL_DAYS);
  const targetFamiliarity = cadenceSlot === LESS_KNOWN_CADENCE_SLOT
    ? WORD_FAMILIARITY.LESS_KNOWN
    : WORD_FAMILIARITY.WELL_KNOWN;
  const preferredPool = playable.filter((entry) => entry.familiarity === targetFamiliarity);

  if (!preferredPool.length) {
    return { pool: playable, selectionIndex: dayNumber, targetFamiliarity: "mixed" };
  }

  const selectionIndex = getTierSelectionIndex(dayNumber, targetFamiliarity);

  return { pool: preferredPool, selectionIndex, targetFamiliarity };
}

function getCooldownSelectionCount(targetFamiliarity, poolSize) {
  const selectionsPerCadence = targetFamiliarity === WORD_FAMILIARITY.LESS_KNOWN
    ? 1
    : LESS_KNOWN_INTERVAL_DAYS - 1;
  const selectionCount = Math.ceil(
    (REPEAT_COOLDOWN_DAYS * selectionsPerCadence) / LESS_KNOWN_INTERVAL_DAYS,
  );
  return Math.min(selectionCount, Math.floor(poolSize / 2));
}

function getCycleOrder(pool, cycle, targetFamiliarity) {
  const cooldownSelections = getCooldownSelectionCount(targetFamiliarity, pool.length);
  const epochSelectionIndex = getTierSelectionIndex(
    ROTATION_EPOCH_DAY_NUMBER,
    targetFamiliarity,
  );
  const epochCycle = Math.floor(epochSelectionIndex / pool.length);
  let ordered = shuffle(
    pool,
    createRng(hashString(`${cycle}:${targetFamiliarity}:word-puzzle-order`)),
  );
  if (!cooldownSelections || cycle <= epochCycle) return ordered;

  let previousOrder = shuffle(
    pool,
    createRng(hashString(`${epochCycle}:${targetFamiliarity}:word-puzzle-order`)),
  );
  for (let currentCycle = epochCycle + 1; currentCycle <= cycle; currentCycle += 1) {
    ordered = shuffle(
      pool,
      createRng(hashString(`${currentCycle}:${targetFamiliarity}:word-puzzle-order`)),
    );
    const recentlyUsedIds = new Set(
      previousOrder.slice(-cooldownSelections).map((entry) => entry.id),
    );
    const safePrefix = ordered
      .filter((entry) => !recentlyUsedIds.has(entry.id))
      .slice(0, cooldownSelections);
    const prefixIds = new Set(safePrefix.map((entry) => entry.id));
    ordered = [
      ...safePrefix,
      ...ordered.filter((entry) => !prefixIds.has(entry.id)),
    ];
    previousOrder = ordered;
  }

  return ordered;
}

export function buildDailyWordPuzzle(dateKey, entries) {
  if (!isValidDateKey(dateKey) || !Array.isArray(entries)) {
    throw new Error("A valid UTC date and word list are required.");
  }

  const playable = entries
    .filter((entry) => isWordAvailableOnDate(entry, dateKey))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!playable.length) throw new Error("No playable word entries are available.");

  const { pool, selectionIndex, targetFamiliarity } = getFamiliaritySelection(dateKey, playable);
  const cycle = Math.floor(selectionIndex / pool.length);
  const position = positiveModulo(selectionIndex, pool.length);
  const ordered = getCycleOrder(pool, cycle, targetFamiliarity);
  const entry = ordered[position];
  const letters = getAnswerLetters(entry.answer);
  const firstLetter = letters[0];
  const revealCandidates = getDistinctAnswerLetters(entry.answer).filter(
    (letter) => letter !== firstLetter,
  );
  const revealRandom = createRng(hashString(`${dateKey}:${entry.id}:starting-letter`));
  const vowelCandidates = revealCandidates.filter((letter) => "AEIOU".includes(letter));
  const consonantCandidates = revealCandidates.filter((letter) => !"AEIOU".includes(letter));
  const occurrenceCount = (letter) => letters.filter((answerLetter) => answerLetter === letter).length;
  const candidatePairs = vowelCandidates.length && consonantCandidates.length
    ? vowelCandidates.flatMap((vowel) => consonantCandidates.map((consonant) => [vowel, consonant]))
    : revealCandidates.flatMap((first, index) => (
        revealCandidates.slice(index + 1).map((second) => [first, second])
      ));
  const minimumRevealCount = Math.min(
    ...candidatePairs.map(([first, second]) => occurrenceCount(first) + occurrenceCount(second)),
  );
  const safestPairs = candidatePairs.filter(
    ([first, second]) => occurrenceCount(first) + occurrenceCount(second) === minimumRevealCount,
  );
  const initialLetters = shuffle(safestPairs, revealRandom)[0].slice().sort();

  return {
    dateKey,
    entry,
    initialLetters,
    key: `${dateKey}:word:${entry.id}:${initialLetters.join("")}`,
  };
}

export function calculateWordPoints(wrongGuesses) {
  const misses = Number.isInteger(wrongGuesses) ? wrongGuesses : 0;
  return [100, 80, 60, 40, 20][Math.max(0, misses)] ?? 0;
}

export function isWordSolved(answer, revealedLetters) {
  const revealed = new Set(
    [...revealedLetters].map(normalizeLetter).filter(Boolean),
  );
  return getAnswerLetters(answer).every((letter) => revealed.has(letter));
}

export function getFollowingDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return getUtcDateKey(date);
}
