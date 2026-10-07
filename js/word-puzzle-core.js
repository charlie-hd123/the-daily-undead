import { createRng, getUtcDateKey, hashString, isValidDateKey, shuffle } from "./game-core.js";

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
    typeof entry?.answer === "string" &&
    getDistinctAnswerLetters(entry.answer).length >= 2
  );
}

function getUtcDayNumber(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}

export function buildDailyWordPuzzle(dateKey, entries) {
  if (!isValidDateKey(dateKey) || !Array.isArray(entries)) {
    throw new Error("A valid UTC date and word list are required.");
  }

  const playable = entries
    .filter(isPlayableWordEntry)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!playable.length) throw new Error("No playable word entries are available.");

  const dayNumber = getUtcDayNumber(dateKey);
  const cycle = Math.floor(dayNumber / playable.length);
  const position = ((dayNumber % playable.length) + playable.length) % playable.length;
  const ordered = shuffle(playable, createRng(hashString(`${cycle}:word-puzzle-order`)));
  const entry = ordered[position];
  const letters = getAnswerLetters(entry.answer);
  const firstLetter = letters[0];
  const revealCandidates = getDistinctAnswerLetters(entry.answer).filter(
    (letter) => letter !== firstLetter,
  );
  const revealRandom = createRng(hashString(`${dateKey}:${entry.id}:starting-letter`));
  const initialLetter = revealCandidates[Math.floor(revealRandom() * revealCandidates.length)];

  return {
    dateKey,
    entry,
    initialLetter,
    key: `${dateKey}:word:${entry.id}:${initialLetter}`,
  };
}

export function calculateWordPoints(wrongGuesses) {
  const misses = Number.isInteger(wrongGuesses) ? wrongGuesses : 0;
  return [100, 50, 40, 20, 10][Math.max(0, misses)] ?? 0;
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
