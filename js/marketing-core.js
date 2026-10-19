import { getUtcDateKey, isValidDateKey } from "./game-core.js?v=20261019-1";

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

export function buildMarketingCopy({
  dateKey,
  clue,
  yesterdayAnswer,
  yesterdayPuzzleName = "Quest Steps",
  solvePercentage,
}) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid puzzle date is required.");
  if (typeof clue !== "string" || !clue.trim()) throw new Error("Today’s clue is required.");
  if (typeof yesterdayAnswer !== "string" || !yesterdayAnswer.trim()) {
    throw new Error("Yesterday’s answer is required.");
  }

  const solved = Number.isInteger(solvePercentage) && solvePercentage >= 0 && solvePercentage <= 100
    ? `${solvePercentage}%`
    : "—%";
  const cleanClue = clue.trim();
  const cleanAnswer = yesterdayAnswer.trim();
  const redditTitle = `Which Zombies map is it? — ${formatDiscordDate(dateKey)}`;
  const redditBody = [
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Yesterday’s solve rate: ${solved} 🔎`,
    "First correct here: u/____, u/____, u/____ 👏",
    "",
    "Today’s puzzle:",
    "Which Treyarch Zombies map is it?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below👇",
  ].join("\n");
  const discordBody = [
    `🧟 __The Daily Undead · ${formatDiscordDate(dateKey)}__`,
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Yesterday’s solve rate: ${solved} 🔎`,
    "First correct here: @____, @____, @____ 👏",
    "",
    "Today’s puzzle:",
    "**Which Treyarch Zombies map is it?**",
    "",
    "Drop your guess below 👇",
    "",
    "Need another clue, or want to lock in your answer on the website?",
    "",
    "🔗 <https://thedailyundead.com/>",
  ].join("\n");

  return { redditTitle, redditBody, discordBody, solved };
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

export function buildWordMarketingCopy({
  dateKey,
  answer,
  initialLetters,
  category,
  yesterdayAnswer,
  yesterdayPuzzleName = "Quest Steps",
  solvePercentage,
}) {
  if (!isValidDateKey(dateKey)) throw new Error("A valid puzzle date is required.");
  if (typeof category !== "string" || !category.trim()) {
    throw new Error("Today’s word category is required.");
  }
  if (typeof yesterdayAnswer !== "string" || !yesterdayAnswer.trim()) {
    throw new Error("Yesterday’s answer is required.");
  }

  const solved = Number.isInteger(solvePercentage) && solvePercentage >= 0 && solvePercentage <= 100
    ? `${solvePercentage}%`
    : "—%";
  const pattern = buildWordPattern(answer, initialLetters);
  const cleanAnswer = yesterdayAnswer.trim();
  const redditTitle = `Which Zombies word is it? — ${formatDiscordDate(dateKey)}`;
  const redditBody = [
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Yesterday’s solve rate: ${solved} 🔎`,
    "First correct here: u/____, u/____, u/____ 👏",
    "",
    "Today’s puzzle:",
    "Which Zombies word or phrase is it?",
    "",
    "Try to get it before reading the comments 👀",
    "",
    "Drop your guess below👇",
  ].join("\n");
  const discordBody = [
    `🧟 __The Daily Undead · ${formatDiscordDate(dateKey)}__`,
    `Yesterday’s answer: ${cleanAnswer} 🧟`,
    `Yesterday’s solve rate: ${solved} 🔎`,
    "First correct here: @____, @____, @____ 👏",
    "",
    "Today’s puzzle:",
    "**Which Zombies word or phrase is it?**",
    "",
    "Drop your guess below 👇",
    "",
    "Need another letter, or want to lock in your answer on the website?",
    "",
    "🔗 <https://thedailyundead.com/>",
  ].join("\n");

  return { redditTitle, redditBody, discordBody, solved, pattern };
}
