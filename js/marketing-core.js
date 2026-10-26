import { getUtcDateKey, isValidDateKey } from "./game-core.js?v=20261026-9";

export const firstRedditPostDate = "2026-08-13";

export function isAppleMobileDevice(navigatorObject) {
  const userAgent = navigatorObject?.userAgent || "";
  const platform = navigatorObject?.platform || "";
  const touchPoints = navigatorObject?.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}

export function getPreviousDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return getUtcDateKey(date);
}

export function getDailyPostNumber(dateKey, startDateKey = firstRedditPostDate) {
  if (!isValidDateKey(dateKey) || !isValidDateKey(startDateKey)) {
    throw new Error("Valid puzzle and launch dates are required.");
  }

  const elapsedDays = Math.floor(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${startDateKey}T00:00:00Z`)) / 86400000,
  );
  return elapsedDays + 1;
}

export function formatPackDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatDiscordDate(dateKey) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid date is required.");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${dateKey}T12:00:00Z`))
    .replace(/\bSep\b/, "Sept");
}

function previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, platform) {
  const answerLines = yesterdayPuzzleName === 'Blood Ties'
    ? ['Yesterday’s connections: 🧟', ...yesterdayAnswer.trim().split('\n')]
    : [`Yesterday’s answer: ${yesterdayAnswer.trim()} 🧟`];
  const names = platform === 'reddit' ? 'u/____, u/____, u/____' : '@____, @____, @____';
  return [...answerLines, `Yesterday’s solve rate: ${solved} 🔎`, `First correct here: ${names} 👏`];
}

function solveRate(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? `${value}%` : '—%';
}

function validateCopyInput(dateKey, yesterdayAnswer) {
  if (!isValidDateKey(dateKey)) throw new Error('A valid puzzle date is required.');
  if (typeof yesterdayAnswer !== 'string' || !yesterdayAnswer.trim()) throw new Error('Yesterday’s answer is required.');
}

export function buildMarketingCopy({ dateKey, clue, yesterdayAnswer, yesterdayPuzzleName = 'Quest Steps', solvePercentage }) {
  validateCopyInput(dateKey, yesterdayAnswer);
  if (typeof clue !== 'string' || !clue.trim()) throw new Error('Today’s clue is required.');
  const solved = solveRate(solvePercentage);
  const title = 'Which Zombies map is it?';
  const question = 'Can you identify the map from one of its main quest steps?';
  return {
    redditTitle: `${title} — ${formatDiscordDate(dateKey)}`,
    redditBody: [...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'reddit'), '', title, '', question, '', 'Try to get it before reading the comments 👀', '', 'Drop your guess below 👇'].join('\n'),
    discordBody: [`🧟 __The Daily Undead · ${formatDiscordDate(dateKey)}__`, '', ...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'discord'), '', `**${title}**`, '', question, '', 'Drop your guess below 👇', '', 'Need another clue? Continue the puzzle on the website.', '', '🔗 <https://thedailyundead.com/>'].join('\n'),
    solved,
  };
}

export function buildWordPattern(answer, initialLetters) {
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("Today’s answer is required.");
  }
  const revealed = new Set(
    Array.isArray(initialLetters)
      ? initialLetters.map((letter) => String(letter).toUpperCase())
      : [],
  );

  return answer
    .trim()
    .split(/\s+/)
    .map((word) => [...word].map((character) => {
      const letter = /^[A-Z]$/i.test(character) ? character.toUpperCase() : null;
      if (!letter) return character;
      return revealed.has(letter) ? letter : "_";
    }).join(""))
    .join(" ");
}

export function buildWordMarketingCopy({ dateKey, answer, initialLetters, category, yesterdayAnswer, yesterdayPuzzleName = 'Quest Steps', solvePercentage }) {
  validateCopyInput(dateKey, yesterdayAnswer);
  if (typeof category !== 'string' || !category.trim()) throw new Error('Today’s word category is required.');
  const solved = solveRate(solvePercentage);
  const title = 'Which Zombies word is it?';
  const question = 'Try to solve the Zombies word or phrase with these limited letters.';
  return {
    redditTitle: `${title} — ${formatDiscordDate(dateKey)}`,
    redditBody: [...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'reddit'), '', title, '', question, '', 'Try to get it before reading the comments 👀', '', 'Drop your guess below 👇'].join('\n'),
    discordBody: [`🧟 __The Daily Undead · ${formatDiscordDate(dateKey)}__`, '', ...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'discord'), '', `**${title}**`, '', question, '', 'Drop your guess below 👇', '', 'Need another letter? Continue the puzzle on the website.', '', '🔗 <https://thedailyundead.com/>'].join('\n'),
    solved,
    pattern: buildWordPattern(answer, initialLetters),
  };
}

export function buildBloodMarketingCopy({ dateKey, yesterdayAnswer, yesterdayPuzzleName = 'Quest Steps', solvePercentage }) {
  validateCopyInput(dateKey, yesterdayAnswer);
  const solved = solveRate(solvePercentage);
  const title = 'Spot a Zombies connection?';
  const question = 'Can you identify three tiles that form a connection? There are four total.';
  const commentPrompt = 'Found a connection? Comment your three tiles and what connects them 👇';
  return {
    redditTitle: `${title} — ${formatDiscordDate(dateKey)}`,
    redditBody: [...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'reddit'), '', title, '', question, '', 'Try to spot one before reading the comments 👀', '', commentPrompt].join('\n'),
    discordBody: [`🧟 __The Daily Undead · ${formatDiscordDate(dateKey)}__`, '', ...previousPuzzleLines(yesterdayAnswer, yesterdayPuzzleName, solved, 'discord'), '', `**${title}**`, '', question, '', commentPrompt, '', 'Want to find all four? Complete the puzzle on the website.', '', '🔗 <https://thedailyundead.com/>'].join('\n'),
    solved,
  };
}
